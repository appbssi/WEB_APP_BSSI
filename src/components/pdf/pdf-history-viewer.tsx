'use client';

import { useState, useMemo } from 'react';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useToast } from '@/hooks/use-toast';
import { useRole } from '@/hooks/use-role';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FileText, Download, Trash2, Search, Loader2, ShieldAlert, UserCheck, Calendar } from 'lucide-react';
import { generateOrdreDeMissionPDF, generateAutorisationAbsencePDF, generateFicheAgentPDF } from '@/lib/pdf-generator';

export type PdfDocumentItem = {
  id: string;
  title: string;
  type: 'ordre_de_mission' | 'autorisation_absence' | 'fiche_agent';
  createdAt: any;
  agentIds: string[];
  agentNames?: string[];
  leaderId?: string | null;
  leaderName?: string | null;
  missionData?: any;
  demandeData?: any;
  agentData?: any;
  vehiclePlate?: string;
};

interface PdfHistoryViewerProps {
  currentAgentId?: string;
  currentAgentRegistrationNumber?: string;
  title?: string;
  description?: string;
}

export function PdfHistoryViewer({
  currentAgentId,
  currentAgentRegistrationNumber,
  title = "Historique des Fichiers PDF & Ordres de Mission",
  description = "Consultation et téléchargement des documents officiels générés",
}: PdfHistoryViewerProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { isAdmin } = useRole();
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'ordre_de_mission' | 'autorisation_absence' | 'fiche_agent'>('all');
  const [selectedDocToDelete, setSelectedDocToDelete] = useState<PdfDocumentItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Firestore query depending on admin vs agent
  const pdfDocsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'pdf_documents'), orderBy('createdAt', 'desc'));
  }, [firestore]);

  const { data: rawPdfDocs, isLoading } = useCollection<PdfDocumentItem>(pdfDocsQuery);

  // Filter documents according to role and search
  const filteredDocs = useMemo(() => {
    if (!rawPdfDocs) return [];

    let docs = rawPdfDocs;

    // If not admin, restrict to documents assigned to current agent
    if (!isAdmin) {
      docs = docs.filter(item => {
        if (!item.agentIds) return false;
        const matchesId = currentAgentId && item.agentIds.includes(currentAgentId);
        const matchesReg = currentAgentRegistrationNumber && item.agentIds.includes(currentAgentRegistrationNumber);
        return matchesId || matchesReg;
      });
    }

    // Filter by type if selected
    if (typeFilter !== 'all') {
      docs = docs.filter(item => item.type === typeFilter);
    }

    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      docs = docs.filter(item =>
        item.title?.toLowerCase().includes(term) ||
        item.agentNames?.some(name => name.toLowerCase().includes(term)) ||
        item.leaderName?.toLowerCase().includes(term)
      );
    }

    return docs;
  }, [rawPdfDocs, isAdmin, currentAgentId, currentAgentRegistrationNumber, typeFilter, searchTerm]);

  // Handle PDF Download
  const handleDownload = (item: PdfDocumentItem) => {
    try {
      if (item.type === 'ordre_de_mission' && item.missionData) {
        generateOrdreDeMissionPDF(
          item.missionData,
          item.missionData.agents || [],
          item.vehiclePlate,
          item.leaderId || item.missionData.leaderId
        );
      } else if (item.type === 'autorisation_absence' && item.demandeData) {
        generateAutorisationAbsencePDF(item.demandeData, item.agentData || {});
      } else if (item.type === 'fiche_agent' && item.agentData) {
        generateFicheAgentPDF(item.agentData, [], []);
      } else {
        toast({
          variant: 'destructive',
          title: 'Fichier indisponible',
          description: "Les données nécessaires pour générer ce PDF ne sont plus complètes.",
        });
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: 'Impossible de télécharger le fichier PDF.',
      });
    }
  };

  // Handle Delete (Admin Only)
  const confirmDelete = async () => {
    if (!selectedDocToDelete || !firestore) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(firestore, 'pdf_documents', selectedDocToDelete.id));
      toast({
        title: 'PDF supprimé',
        description: `Le document "${selectedDocToDelete.title}" a été supprimé de l'historique et de l'espace de l'agent concerné.`,
      });
      setSelectedDocToDelete(null);
    } catch (error) {
      console.error('Error deleting PDF doc:', error);
      toast({
        variant: 'destructive',
        title: 'Erreur de suppression',
        description: 'Impossible de supprimer le document PDF.',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle Clear All PDFs
  const handleClearAllPdfs = async () => {
    if (!firestore || filteredDocs.length === 0) return;
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer TOUS les fichiers PDF affichés dans l'historique ? Cette action est irréversible.")) return;

    setIsDeleting(true);
    try {
      for (const item of filteredDocs) {
        await deleteDoc(doc(firestore, 'pdf_documents', item.id));
      }
      toast({
        title: 'Historique PDF vidé',
        description: 'Tous les fichiers PDF ont été supprimés de la base de données.',
      });
    } catch (error) {
      console.error('Error clearing PDF docs:', error);
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: 'Impossible de vider l\'historique des fichiers PDF.',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'ordre_de_mission':
        return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20 font-bold">Ordre de Mission</Badge>;
      case 'autorisation_absence':
        return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-bold">Autorisation d'Absence</Badge>;
      case 'fiche_agent':
        return <Badge className="bg-purple-500/10 text-purple-600 border-purple-500/20 font-bold">Fiche Agent</Badge>;
      default:
        return <Badge variant="outline">Document</Badge>;
    }
  };

  const formatDate = (val: any) => {
    if (!val) return 'N/A';
    const date = val.toDate ? val.toDate() : new Date(val);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Card className="border shadow-sm rounded-xl">
      <CardHeader className="border-b bg-muted/20 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <span>{title}</span>
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              {description}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs font-semibold px-2.5 py-1">
              {filteredDocs.length} document{filteredDocs.length > 1 ? 's' : ''}
            </Badge>
            {filteredDocs.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive gap-1 px-2.5 cursor-pointer rounded-lg"
                onClick={handleClearAllPdfs}
                disabled={isDeleting}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Vider tout</span>
              </Button>
            )}
          </div>
        </div>

        {/* Filters and Search */}
        <div className="flex flex-col sm:flex-row gap-3 pt-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par titre, agent, chef de mission..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 text-xs rounded-lg"
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            <Button
              size="sm"
              variant={typeFilter === 'all' ? 'default' : 'outline'}
              className="h-9 text-xs cursor-pointer rounded-lg px-3"
              onClick={() => setTypeFilter('all')}
            >
              Tous
            </Button>
            <Button
              size="sm"
              variant={typeFilter === 'ordre_de_mission' ? 'default' : 'outline'}
              className="h-9 text-xs cursor-pointer rounded-lg px-3"
              onClick={() => setTypeFilter('ordre_de_mission')}
            >
              Ordres de Mission
            </Button>
            <Button
              size="sm"
              variant={typeFilter === 'autorisation_absence' ? 'default' : 'outline'}
              className="h-9 text-xs cursor-pointer rounded-lg px-3"
              onClick={() => setTypeFilter('autorisation_absence')}
            >
              Autorisations
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center p-12 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            <span className="text-xs font-medium">Chargement de l'historique PDF...</span>
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="text-center py-12 px-4 border border-dashed rounded-xl bg-muted/10">
            <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm font-semibold text-foreground">Aucun document PDF trouvé</p>
            <p className="text-xs text-muted-foreground mt-1">
              Les ordres de mission et autorisations d'absence créés apparaîtront dans cette liste.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {filteredDocs.map((item) => (
              <div
                key={item.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border bg-card hover:bg-muted/30 transition-all gap-3"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0 mt-0.5">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-bold text-sm text-foreground truncate">{item.title}</span>
                      {getTypeBadge(item.type)}
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatDate(item.createdAt)}
                      </span>

                      {item.leaderName && item.leaderName !== 'Non désigné' && (
                        <span className="flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
                          <UserCheck className="h-3.5 w-3.5" />
                          Chef de mission : {item.leaderName}
                        </span>
                      )}

                      {item.agentNames && item.agentNames.length > 0 && (
                        <span className="truncate">
                          Agent(s) : {item.agentNames.join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center pt-2 sm:pt-0 border-t sm:border-t-0 border-border/50 w-full sm:w-auto justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1.5 rounded-lg border-primary/30 text-primary hover:bg-primary/10 cursor-pointer"
                    onClick={() => handleDownload(item)}
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Télécharger</span>
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive cursor-pointer rounded-lg"
                    title="Supprimer ce fichier PDF"
                    onClick={() => setSelectedDocToDelete(item)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Delete Confirmation Modal for Admins */}
      <Dialog open={!!selectedDocToDelete} onOpenChange={(open) => !open && setSelectedDocToDelete(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive font-bold">
              <ShieldAlert className="h-5 w-5" />
              Supprimer le fichier PDF ?
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-2">
              Êtes-vous sûr de vouloir supprimer définitivement le document <strong className="text-foreground">{selectedDocToDelete?.title}</strong> ?
              <br /><br />
              <span className="text-amber-600 dark:text-amber-400 font-semibold">
                Attention : En le supprimant de l'historique administrateur, ce fichier disparaîtra également immédiatement de l'espace de l'agent concerné.
              </span>
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="flex gap-2 justify-end pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedDocToDelete(null)}
              disabled={isDeleting}
              className="rounded-xl cursor-pointer"
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={confirmDelete}
              disabled={isDeleting}
              className="gap-1.5 rounded-xl cursor-pointer"
            >
              {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Supprimer définitivement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
