
'use client';

import { useState } from 'react';
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

type AgentImportData = Omit<Agent, 'id' | 'leaveStartDate' | 'leaveEndDate'> & { idc?: string };


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

    const XLSX = await import('xlsx');
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        if (rows.length === 0) {
            toast({
                variant: 'destructive',
                title: 'Fichier vide',
                description: "Le fichier sélectionné ne contient aucune donnée.",
            });
            return;
        }

        const headerRow = rows[0].map(h => String(h || '').trim().toLowerCase());
        
        // Find indices of columns
        const findColIndex = (names: string[]) => {
          return headerRow.findIndex(h => names.includes(h));
        };

        const fullNameIdx = findColIndex(['nom complet', 'fullname', 'nom', 'name', 'nom et prénom(s)', 'nom et prenoms']);
        const registrationNumberIdx = findColIndex(['matricule', 'registrationnumber', 'registration_number', 'matricule/reg']);
        const rankIdx = findColIndex(['grade', 'rank', 'grade/rang']);
        const contactIdx = findColIndex(['contact', 'téléphone', 'telephone', 'phone']);
        const addressIdx = findColIndex(['adresse', 'address', 'localisation']);
        const sectionIdx = findColIndex(['section', 'détachement', 'detachement', 'groupement']);
        const idcIdx = findColIndex(['idc', 'id_code', 'code idc', 'identifiant']);

        const getVal = (row: any[], index: number, defaultValue = '') => {
          if (index !== -1 && index < row.length) {
            return String(row[index] || '').trim();
          }
          return defaultValue;
        };

        let invalidContacts = 0;
        const validAgents: AgentImportData[] = [];

        // Loop starting from row 1 (skipping headers)
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;

          let fullName = '';
          let registrationNumber = '';
          let rank = '';
          let rawContact = '';
          let address = '';
          let rawSection = 'Non assigné';
          let idc = '';

          // Match header name if index found, else use position fallback
          if (fullNameIdx !== -1) {
            fullName = getVal(row, fullNameIdx);
          } else {
            fullName = getVal(row, 0);
          }

          if (registrationNumberIdx !== -1) {
            registrationNumber = getVal(row, registrationNumberIdx);
          } else {
            registrationNumber = getVal(row, 1);
          }

          if (rankIdx !== -1) {
            rank = getVal(row, rankIdx);
          } else {
            rank = getVal(row, 2);
          }

          if (contactIdx !== -1) {
            rawContact = getVal(row, contactIdx);
          } else {
            rawContact = getVal(row, 3);
          }

          if (addressIdx !== -1) {
            address = getVal(row, addressIdx);
          } else if (sectionIdx === -1) {
            address = getVal(row, 4);
          }

          if (sectionIdx !== -1) {
            rawSection = getVal(row, sectionIdx, 'Non assigné');
          } else if (addressIdx === -1) {
            rawSection = getVal(row, 5, 'Non assigné');
          }

          if (idcIdx !== -1) {
            idc = getVal(row, idcIdx).toUpperCase();
          } else {
            idc = getVal(row, 6).toUpperCase();
          }

          if (!fullName && !registrationNumber && !idc) {
            continue; // Skip empty rows
          }

          const contactValidation = contactSchema.safeParse(rawContact);
          // Allow empty contacts, but sanitize if present
          const sanitizedContact = rawContact ? (contactValidation.success ? contactValidation.data : '') : '';

          const agent: AgentImportData = {
              fullName,
              registrationNumber,
              rank,
              contact: sanitizedContact,
              address,
              section: rawSection as Agent['section'],
              idc: idc || undefined
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
            if (invalidContacts === 0 && rows.length > 1) {
                 toast({
                    variant: 'destructive',
                    title: 'Fichier invalide ou vide',
                    description: "Aucun agent valide trouvé. Assurez-vous que les colonnes sont correctes: Nom complet, Matricule, Grade, Contact, Section, IDC.",
                });
            } else if (rows.length <= 1) {
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
    
    // Fetch all existing agents to check for duplicates by IDC, reg number, OR name
    const querySnapshot = await getDocs(agentsRef);
    const existingByReg = new Map<string, string>(); // registrationNumber -> docId
    const existingByName = new Map<string, string>(); // fullName (lowercase) -> docId
    const existingByIdc = new Map<string, string>(); // idc -> docId
    
    querySnapshot.forEach(docSnap => {
        const agent = docSnap.data() as Agent;
        const docId = docSnap.id;
        const idc = docId.substring(0, 6).toUpperCase();
        existingByIdc.set(idc, docId);

        if (agent.registrationNumber) {
            existingByReg.set(agent.registrationNumber.trim(), docId);
        }
        if (agent.fullName) {
            existingByName.set(agent.fullName.trim().toLowerCase(), docId);
        }
    });

    let agentsAdded = 0;
    let agentsUpdated = 0;

    for (const agentData of agentsToImport) {
        const nameKey = agentData.fullName.trim().toLowerCase();
        const regKey = agentData.registrationNumber?.trim() || '';
        const idcKey = agentData.idc?.trim().toUpperCase() || '';
        
        let docId = '';
        if (idcKey && existingByIdc.has(idcKey)) {
            docId = existingByIdc.get(idcKey)!;
        } else if (regKey && existingByReg.has(regKey)) {
            docId = existingByReg.get(regKey)!;
        } else {
            docId = existingByName.get(nameKey) || '';
        }

        const { idc, ...restData } = agentData;

        if (docId) {
            // Update existing agent
            const docRef = doc(firestore, 'agents', docId);
            batch.update(docRef, {
              fullName: restData.fullName,
              rank: restData.rank,
              contact: restData.contact,
              address: restData.address,
              section: restData.section,
            });
            agentsUpdated++;
        } else {
            // Add new agent
            const newAgentRef = doc(agentsRef);
            batch.set(newAgentRef, { ...restData, leaveStartDate: null, leaveEndDate: null });
            agentsAdded++;
            // Update local maps to prevent adding same agent twice within the same import
            if (regKey) existingByReg.set(regKey, newAgentRef.id);
            existingByName.set(nameKey, newAgentRef.id);
            existingByIdc.set(newAgentRef.id.substring(0, 6).toUpperCase(), newAgentRef.id);
        }
    }

    batch.commit().then(() => {
        toast({
            title: 'Importation terminée !',
            description: `${agentsAdded} agent(s) ajouté(s) et ${agentsUpdated} agent(s) mis à jour. Les doublons ont été évités grâce aux clés IDC et Matricules.`,
        });
        const logMessage = `Importation : ${agentsAdded} ajoutés, ${agentsUpdated} mis à jour. Utilisation clé IDC et Matricules.`;
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
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Importer et Mettre à jour des Agents</DialogTitle>
          <DialogDescription>
            Sélectionnez un fichier .xlsx. Les agents sont identifiés de manière prioritaire par leur code unique IDC (6 caractères), puis par leur matricule ou leur nom complet pour mettre à jour les données existantes ou créer de nouveaux fiches sans doublons.
            <br />
            <span className="font-semibold text-white">Colonnes supportées :</span> IDC, Nom complet (fullName), Matricule (registrationNumber), Grade (rank), Contact (contact), Adresse (address), Section (section/Détachement).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
            <Input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileChange} />

            {agentsToImport.length > 0 && (
                <div className="max-h-96 overflow-y-auto rounded-lg border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[100px]">IDC</TableHead>
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
                                    <TableCell>
                                      {agent.idc ? (
                                        <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-semibold">
                                          {agent.idc}
                                        </code>
                                      ) : (
                                        <span className="text-xs text-muted-foreground font-mono">-</span>
                                      )}
                                    </TableCell>
                                    <TableCell className="font-medium">{agent.fullName}</TableCell>
                                    <TableCell>{agent.registrationNumber || <span className="text-xs text-muted-foreground italic">N/A</span>}</TableCell>
                                    <TableCell>{agent.rank}</TableCell>
                                    <TableCell>{agent.contact || <span className="text-xs text-muted-foreground italic">N/A</span>}</TableCell>
                                    <TableCell>{agent.address || <span className="text-xs text-muted-foreground italic">N/A</span>}</TableCell>
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
