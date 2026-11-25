'use client';

import { useState, useMemo, useEffect } from 'react';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy, limit, deleteDoc, doc } from 'firebase/firestore';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useToast } from '@/hooks/use-toast';
import { useRole } from '@/hooks/use-role';
import { safeToDate } from '@/lib/agents';
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
import {
  FileText,
  Download,
  Trash2,
  Search,
  Loader2,
  ShieldAlert,
  UserCheck,
  Calendar,
  MapPin,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  X,
} from 'lucide-react';
import {
  generateOrdreDeMissionPDF,
  generateAutorisationAbsencePDF,
  generateFicheAgentPDF,
} from '@/lib/pdf-generator-lazy';

export type PdfDocumentItem = {
  id: string;
  title: string;
  type: 'ordre_de_mission' | 'autorisation_absence' | 'fiche_agent';
  createdAt: any;
  agentIds: string[];
  /** Ordre de mission : agents de la mission (agentIds reste vide tant que l'ordre n'est pas signé) */
  assignedAgentIds?: string[];
  agentNames?: string[];
  leaderId?: string | null;
  leaderName?: string | null;
  missionData?: any;
  demandeData?: any;
  agentData?: any;
  vehiclePlate?: string;
};

export type PdfTypeFilter = 'all' | 'ordre_de_mission' | 'autorisation_absence' | 'fiche_agent';

interface PdfHistoryViewerProps {
  currentAgentId?: string;
  currentAgentRegistrationNumber?: string;
  title?: string;
  description?: string;
  initialTypeFilter?: PdfTypeFilter;
}

const ITEMS_PER_PAGE = 6;

function toDateInputKey(val: unknown): string {
  const dt = safeToDate(val);
  if (!dt) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function PdfHistoryViewer({
  currentAgentId,
  currentAgentRegistrationNumber,
  title = 'Historique des Fichiers PDF & Ordres de Mission',
  description = 'Consultation et téléchargement des documents officiels générés',
  initialTypeFilter = 'all',
}: PdfHistoryViewerProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { isAdmin } = useRole();

  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<PdfTypeFilter>(initialTypeFilter);
  const [missionFilter, setMissionFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [queryLimit, setQueryLimit] = useState(50);

  const [selectedDocToDelete, setSelectedDocToDelete] = useState<PdfDocumentItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setTypeFilter(initialTypeFilter);
    setCurrentPage(1);
  }, [initialTypeFilter]);

  const agentKeys = useMemo(() => {
    const keys = [
      currentAgentId?.trim(),
      currentAgentRegistrationNumber?.trim(),
      currentAgentId && currentAgentId.length >= 6
        ? currentAgentId.substring(0, 6).toUpperCase()
        : undefined,
    ].filter((k): k is string => Boolean(k));
    return Array.from(new Set(keys)).slice(0, 10);
  }, [currentAgentId, currentAgentRegistrationNumber]);

  // Scoped Firestore query: admins read latest batch, agents only read documents assigned to them
  const pdfDocsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    if (isAdmin) {
      return query(collection(firestore, 'pdf_documents'), orderBy('createdAt', 'desc'), limit(queryLimit));
    }
    if (agentKeys.length === 0) return null;
    return query(
      collection(firestore, 'pdf_documents'),
      where('agentIds', 'array-contains-any', agentKeys),
      limit(queryLimit)
    );
  }, [firestore, isAdmin, agentKeys, queryLimit]);

  const { data: rawPdfDocs, isLoading } = useCollection<PdfDocumentItem>(pdfDocsQuery);

  // Deduplicate by ID and sort descending by creation date
  const baseDocs = useMemo(() => {
    if (!rawPdfDocs) return [];
    const seen = new Set<string>();
    const unique: PdfDocumentItem[] = [];
    for (const item of rawPdfDocs) {
      if (!item?.id || seen.has(item.id)) continue;
      seen.add(item.id);
      if (!isAdmin) {
        const matches =
          Array.isArray(item.agentIds) &&
          agentKeys.some((key) => item.agentIds.includes(key));
        if (!matches) continue;
      }
      unique.push(item);
    }
    return unique.sort((a, b) => {
      const tA = safeToDate(a.createdAt)?.getTime() || 0;
      const tB = safeToDate(b.createdAt)?.getTime() || 0;
      return tB - tA;
    });
  }, [rawPdfDocs, isAdmin, agentKeys]);

  // Extract distinct mission options from the available documents
  const missionOptions = useMemo(() => {
    const names = new Set<string>();
    baseDocs.forEach((item) => {
      const missionName = item.missionData?.name?.trim();
      const missionLoc = item.missionData?.location?.trim();
      if (missionName) {
        names.add(missionName);
      } else if (missionLoc) {
        names.add(missionLoc);
      }
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [baseDocs]);

  // Apply Search, Date, Type, and Mission filters
  const filteredDocs = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return baseDocs.filter((item) => {
      if (typeFilter !== 'all' && item.type !== typeFilter) {
        return false;
      }

      if (missionFilter !== 'all') {
        const mName = item.missionData?.name?.trim() || '';
        const mLoc = item.missionData?.location?.trim() || '';
        if (mName !== missionFilter && mLoc !== missionFilter) {
          return false;
        }
      }

      if (dateFilter) {
        const createdKey = toDateInputKey(item.createdAt);
        const startKey = toDateInputKey(item.missionData?.startDate || item.demandeData?.startDate);
        if (createdKey !== dateFilter && startKey !== dateFilter) {
          return false;
        }
      }

      if (term) {
        const inTitle = item.title?.toLowerCase().includes(term);
        const inAgents = item.agentNames?.some((name) => name.toLowerCase().includes(term));
        const inLeader = item.leaderName?.toLowerCase().includes(term);
        const inMissionName = item.missionData?.name?.toLowerCase().includes(term);
        const inMissionLoc = item.missionData?.location?.toLowerCase().includes(term);
        if (!inTitle && !inAgents && !inLeader && !inMissionName && !inMissionLoc) {
          return false;
        }
      }

      return true;
    });
  }, [baseDocs, typeFilter, missionFilter, dateFilter, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredDocs.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedDocs = useMemo(() => {
    const start = (safePage - 1) * ITEMS_PER_PAGE;
    return filteredDocs.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredDocs, safePage]);

  const hasActiveFilters =
    searchTerm.trim() !== '' || dateFilter !== '' || typeFilter !== 'all' || missionFilter !== 'all';

  const resetFilters = () => {
    setSearchTerm('');
    setDateFilter('');
    setTypeFilter('all');
    setMissionFilter('all');
    setCurrentPage(1);
  };

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
          description: 'Les données nécessaires pour générer ce PDF ne sont plus complètes.',
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

  const confirmDelete = async () => {
    if (!selectedDocToDelete || !firestore || !isAdmin) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(firestore, 'pdf_documents', selectedDocToDelete.id));
      toast({
        title: 'PDF supprimé',
        description: `Le document "${selectedDocToDelete.title}" a été supprimé.`,
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

  const handleClearAllPdfs = async () => {
    if (!firestore || !isAdmin || filteredDocs.length === 0) return;
    if (
      !window.confirm(
        "Êtes-vous sûr de vouloir supprimer TOUS les fichiers PDF affichés ? Cette action est irréversible."
      )
    ) {
      return;
    }

    setIsDeleting(true);
    try {
      for (const item of filteredDocs) {
        await deleteDoc(doc(firestore, 'pdf_documents', item.id));
      }
      toast({
        title: 'Historique PDF vidé',
        description: 'Les documents sélectionnés ont été supprimés.',
      });
    } catch (error) {
      console.error('Error clearing PDF docs:', error);
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: "Impossible de vider l'historique des fichiers PDF.",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'ordre_de_mission':
        return {
          label: 'Ordre de Mission',
          cls: 'text-blue-600 dark:text-blue-400',
        };
      case 'autorisation_absence':
        return {
          label: "Autorisation d'Absence",
          cls: 'text-emerald-600 dark:text-emerald-400',
        };
      case 'fiche_agent':
        return {
          label: 'Fiche Agent',
          cls: 'text-purple-600 dark:text-purple-400',
        };
      default:
        return {
          label: 'Document',
          cls: 'text-muted-foreground',
        };
    }
  };

  const formatDate = (val: unknown) => {
    const date = safeToDate(val);
    if (!date) return 'N/A';
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Card className="border border-border shadow-sm rounded-xl bg-card">
      <CardHeader className="border-b border-border pb-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
              <FileText className="h-5 w-5 text-primary shrink-0" />
              <span>{title}</span>
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              {description}
            </CardDescription>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-semibold text-foreground bg-muted px-2.5 py-1 rounded-md tabular-nums">
              {filteredDocs.length} document{filteredDocs.length > 1 ? 's' : ''}
            </span>

            {isAdmin && filteredDocs.length > 0 && (
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

        {/* Filter Toolbar: Recherche, Date, Type, Mission */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {/* 1. Recherche */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Rechercher titre, agent, lieu..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-8 pr-8 h-9 text-xs rounded-lg bg-background"
              aria-label="Recherche dans les documents"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setCurrentPage(1);
                }}
                aria-label="Effacer la recherche"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* 2. Date */}
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              type="date"
              value={dateFilter}
              onChange={(e) => {
                setDateFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-8 h-9 text-xs rounded-lg bg-background"
              aria-label="Filtrer par date"
            />
          </div>

          {/* 3. Type */}
          <div className="relative">
            <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value as PdfTypeFilter);
                setCurrentPage(1);
              }}
              aria-label="Filtrer par type de document"
              className="flex h-9 w-full rounded-lg border border-input bg-background pl-8 pr-3 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">Tous les types</option>
              <option value="ordre_de_mission">Ordres de mission</option>
              <option value="autorisation_absence">Autorisations d&apos;absence</option>
              <option value="fiche_agent">Fiches agent</option>
            </select>
          </div>

          {/* 4. Mission */}
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <select
              value={missionFilter}
              onChange={(e) => {
                setMissionFilter(e.target.value);
                setCurrentPage(1);
              }}
              aria-label="Filtrer par mission"
              className="flex h-9 w-full rounded-lg border border-input bg-background pl-8 pr-3 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">Toutes les missions</option>
              {missionOptions.map((mName) => (
                <option key={mName} value={mName}>
                  {mName}
                </option>
              ))}
            </select>
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
            <span>Filtres actifs sur les documents affichés</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="h-7 px-2 text-xs gap-1 cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" />
              Réinitialiser
            </Button>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center p-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2 text-primary" />
            <span className="text-xs font-medium">Chargement des documents...</span>
          </div>
        ) : paginatedDocs.length === 0 ? (
          <div className="text-center py-10 px-4 border border-dashed border-border rounded-xl bg-muted/20">
            <FileText className="h-9 w-9 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm font-semibold text-foreground">Aucun document PDF trouvé</p>
            <p className="text-xs text-muted-foreground mt-1">
              {hasActiveFilters
                ? 'Essayez de modifier ou réinitialiser vos critères de recherche.'
                : 'Les ordres de mission et autorisations apparaîtront ici dès leur émission.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
            {paginatedDocs.map((item) => {
              const typeMeta = getTypeLabel(item.type);
              const missionLoc = item.missionData?.location;

              return (
                <div
                  key={item.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-card hover:bg-muted/30 transition-colors gap-3"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-semibold text-sm text-foreground truncate">
                          {item.title}
                        </span>
                        <span className={`text-xs font-medium ${typeMeta.cls}`}>
                          · {typeMeta.label}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1 tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDate(item.createdAt)}
                        </span>

                        {missionLoc && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {missionLoc}
                          </span>
                        )}

                        {item.leaderName && item.leaderName !== 'Non désigné' && (
                          <span className="inline-flex items-center gap-1 font-medium text-foreground">
                            <UserCheck className="h-3.5 w-3.5 text-primary" />
                            Chef : {item.leaderName}
                          </span>
                        )}

                        {isAdmin && item.agentNames && item.agentNames.length > 0 && (
                          <span className="truncate max-w-xs">
                            Agent(s) : {item.agentNames.join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1.5 rounded-lg cursor-pointer"
                      onClick={() => handleDownload(item)}
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Télécharger</span>
                    </Button>

                    {isAdmin && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive cursor-pointer rounded-lg"
                        title="Supprimer ce fichier PDF"
                        onClick={() => setSelectedDocToDelete(item)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Bar */}
        {!isLoading && filteredDocs.length > ITEMS_PER_PAGE && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs text-muted-foreground">
            <span className="tabular-nums">
              Page {safePage} sur {totalPages} · {filteredDocs.length} résultat
              {filteredDocs.length > 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2.5 text-xs gap-1 cursor-pointer"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Précédent
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2.5 text-xs gap-1 cursor-pointer"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                Suivant
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {!isLoading && rawPdfDocs && rawPdfDocs.length >= queryLimit && (
          <div className="flex justify-center pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs text-primary cursor-pointer"
              onClick={() => setQueryLimit((l) => l + 50)}
            >
              Charger plus de documents depuis le serveur
            </Button>
          </div>
        )}
      </CardContent>

      {/* Admin Delete Confirmation Dialog */}
      <Dialog open={!!selectedDocToDelete} onOpenChange={(open) => !open && setSelectedDocToDelete(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive font-bold">
              <ShieldAlert className="h-5 w-5" />
              Supprimer le fichier PDF ?
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-2">
              Êtes-vous sûr de vouloir supprimer définitivement le document{' '}
              <strong className="text-foreground">{selectedDocToDelete?.title}</strong> ?
              <br />
              <br />
              <span className="text-amber-600 dark:text-amber-400 font-semibold">
                Attention : Cette suppression retirera également le fichier de l&apos;espace de
                l&apos;agent concerné.
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
