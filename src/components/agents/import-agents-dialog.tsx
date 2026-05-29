
'use client';

import { useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import type { Agent } from '@/lib/types';
import { useFirestore, errorEmitter } from '@/firebase';
import { FirestorePermissionError } from '@/firebase/errors';
import { collection, doc, writeBatch, getDocs, query, where } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import * as z from 'zod';
import { logActivity } from '@/lib/activity-logger';

type AgentImportData = Omit<Agent, 'id' | 'leaveStartDate' | 'leaveEndDate'>;


const contactSchema = z.string()
  .transform(val => val.replace(/\D/g, ''))
  .pipe(z.string().min(8, "Le contact doit contenir au moins 8 chiffres.").max(14, "Le contact ne peut pas dépasser 14 chiffres."))
  .optional()
  .or(z.literal(''));


export function ImportAgentsDialog({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [agentsToImport, setAgentsToImport] = useState<AgentImportData[]>([]);
  const { toast } = useToast();
  const firestore = useFirestore();

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !firestore) return;

    setAgentsToImport([]);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        const json = XLSX.utils.sheet_to_json(worksheet, {
            header: ["fullName", "registrationNumber", "rank", "contact", "address", "section"],
            range: 1 // Skip the header row
        }) as any[];


        let invalidContacts = 0;
        const validAgents: AgentImportData[] = [];

        for (const row of json) {
          if (!row.fullName && !row.registrationNumber) {
            continue; // Skip rows that don't have at least a name or a registration number
          }
          const rawContact = String(row.contact || '').trim();
          const contactValidation = contactSchema.safeParse(rawContact);
          // Allow empty contacts, but sanitize if present
          const sanitizedContact = rawContact ? (contactValidation.success ? contactValidation.data : '') : '';

          const agent: AgentImportData = {
              fullName: String(row.fullName || '').trim(),
              registrationNumber: String(row.registrationNumber || '').trim(),
              rank: String(row.rank || '').trim(),
              contact: sanitizedContact,
              address: String(row.address || '').trim(),
              section: String(row.section || 'Non assigné').trim() as Agent['section'],
          };

          if (rawContact && !contactValidation.success) {
            invalidContacts++;
            continue;
          }

          if (!agent.fullName) {
              continue;
          }

          validAgents.push(agent);
        }

        if (invalidContacts > 0) {
            toast({
                title: 'Données ignorées',
                description: `${invalidContacts} agent(s) avec un format de contact invalide ont été ignoré(s).`,
            });
        }
        
        if (validAgents.length === 0) {
            if (invalidContacts === 0 && json.length > 0) {
                 toast({
                    variant: 'destructive',
                    title: 'Fichier invalide ou vide',
                    description: "Aucun agent valide trouvé. Assurez-vous que les colonnes sont correctes: fullName, registrationNumber, rank, contact, address, section.",
                });
            } else if (json.length === 0) {
                 toast({
                    variant: 'destructive',
                    title: 'Fichier vide',
                    description: "Le fichier sélectionné ne contient aucune donnée.",
                });
            }
            return;
        }

        setAgentsToImport(validAgents);
      } catch (error) {
        console.error(error);
        toast({
            variant: 'destructive',
            title: 'Erreur de lecture',
            description: "Impossible de lire le fichier Excel. Assurez-vous qu'il est au bon format.",
        });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    if (!firestore || agentsToImport.length === 0) return;
    
    setIsImporting(true);
    const batch = writeBatch(firestore);
    const agentsRef = collection(firestore, 'agents');
    
    // Fetch all existing agents to check for duplicates by reg number OR name
    const querySnapshot = await getDocs(agentsRef);
    const existingByReg = new Map<string, string>(); // registrationNumber -> docId
    const existingByName = new Map<string, string>(); // fullName (lowercase) -> docId
    
    querySnapshot.forEach(docSnap => {
        const agent = docSnap.data() as Agent;
        if (agent.registrationNumber) {
            existingByReg.set(agent.registrationNumber.trim(), docSnap.id);
        }
        if (agent.fullName) {
            existingByName.set(agent.fullName.trim().toLowerCase(), docSnap.id);
        }
    });

    let agentsAdded = 0;
    let agentsUpdated = 0;

    for (const agentData of agentsToImport) {
        const nameKey = agentData.fullName.trim().toLowerCase();
        const regKey = agentData.registrationNumber?.trim() || '';
        
        let docId = (regKey && existingByReg.has(regKey)) 
            ? existingByReg.get(regKey) 
            : existingByName.get(nameKey);

        if (docId) {
            // Update existing agent
            const docRef = doc(firestore, 'agents', docId);
            batch.update(docRef, {
              fullName: agentData.fullName,
              rank: agentData.rank,
              contact: agentData.contact,
              address: agentData.address,
              section: agentData.section,
            });
            agentsUpdated++;
        } else {
            // Add new agent
            const newAgentRef = doc(agentsRef);
            batch.set(newAgentRef, { ...agentData, leaveStartDate: null, leaveEndDate: null });
            agentsAdded++;
            // Update local maps to prevent adding same agent twice within the same import
            if (regKey) existingByReg.set(regKey, newAgentRef.id);
            existingByName.set(nameKey, newAgentRef.id);
        }
    }

    batch.commit().then(() => {
        toast({
            title: 'Importation terminée !',
            description: `${agentsAdded} agent(s) ajouté(s) et ${agentsUpdated} agent(s) mis à jour. Les doublons ont été évités.`,
        });
        const logMessage = `Importation : ${agentsAdded} ajoutés, ${agentsUpdated} mis à jour. Doublons filtrés.`;
        logActivity(firestore, logMessage, 'Agent', '/agents');
    }).catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
            path: 'agents/[batch]',
            operation: 'write',
            requestResourceData: {info: "Batch import/update operation"},
        });
        errorEmitter.emit('permission-error', permissionError);
    }).finally(() => {
        setIsImporting(false);
        setAgentsToImport([]);
        setIsOpen(false);
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
        setIsOpen(open);
        if(!open) {
            setAgentsToImport([]);
        }
    }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Importer et Mettre à jour des Agents</DialogTitle>
          <DialogDescription>
            Sélectionnez un fichier .xlsx. Les agents sont identifiés par leur matricule ou leur nom complet pour éviter les doublons. 
            Colonnes requises : fullName, registrationNumber, rank, contact, address, section (Détachement).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
            <Input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileChange} />

            {agentsToImport.length > 0 && (
                <div className="max-h-96 overflow-y-auto rounded-lg border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nom et Prénom(s)</TableHead>
                                <TableHead>Matricule</TableHead>
                                <TableHead>Grade</TableHead>
                                <TableHead>Contact</TableHead>
                                <TableHead>Adresse</TableHead>
                                <TableHead>Section (Détachement)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {agentsToImport.map((agent, index) => (
                                <TableRow key={index}>
                                    <TableCell>{agent.fullName}</TableCell>
                                    <TableCell>{agent.registrationNumber}</TableCell>
                                    <TableCell>{agent.rank}</TableCell>
                                    <TableCell>{agent.contact}</TableCell>
                                    <TableCell>{agent.address}</TableCell>
                                    <TableCell>{agent.section}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setIsOpen(false); setAgentsToImport([]); }}>Annuler</Button>
          <Button onClick={handleImport} disabled={agentsToImport.length === 0 || isImporting}>
            {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isImporting ? 'Traitement...' : `Importer et Mettre à jour (${agentsToImport.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
