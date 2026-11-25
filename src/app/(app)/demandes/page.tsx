'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, limit, onSnapshot, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { addDoc, setDoc, deleteDoc, writeBatch } from '@/lib/firestore-fast';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useRole } from '@/hooks/use-role';
import { useToast } from '@/hooks/use-toast';
import { useIsMounted } from '@/hooks/use-is-mounted';
import { ClientOnly } from '@/components/layout/client-only';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Calendar,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  Send,
  HelpCircle,
  AlertTriangle,
  FileDown,
  Printer,
  ShieldAlert,
  PackageCheck,
  ChevronDown,
  ChevronUp,
  Trash2,
  QrCode,
  Download,
  IdCard,
  FileText,
  Compass,
  PlusCircle,
  ChevronLeft,
  ChevronRight,
  Search,
  Loader2,
  ShieldCheck,
  Bell,
  FileSignature,
  CheckCheck,
  Paperclip,
  Camera,
  X,
} from 'lucide-react';
import type {
  Demande,
  Agent,
  Availability,
  Explication,
  Mission,
  Weapon,
  WeaponAssignment,
} from '@/lib/types';
import {
  generateAutorisationAbsencePDF,
  generateFicheAgentPDF,
  generateAgentBadgeCardPDF,
  generateOrdreDeMissionPDF,
} from '@/lib/pdf-generator-lazy';
import { generateAgentQRCodeDataURL } from '@/lib/agent-qrcode';
import { AgentQRBadgeDialog } from '@/components/agents/agent-qr-badge-dialog';
import type { PdfDocumentItem, PdfTypeFilter } from '@/components/pdf/pdf-history-viewer';
import { AgentSignedOrders } from '@/components/ordres-signes/agent-signed-orders';
import type { SignedOrder } from '@/lib/signed-orders';
import { getAgentAvailability, safeToDate } from '@/lib/agents';
import { getDisplayStatus } from '@/lib/missions';
import { cn } from '@/lib/utils';
import { prepareScanFile } from '@/lib/signed-orders';
import { compressImageToDataUrl } from '@/lib/image-compress';
import { DemandeAttachmentButton, DEMANDE_ATTACHMENT_DOC_ID } from '@/components/demandes/demande-attachment';

// Lazy-load heavy PDF documents module only when user switches to the Documents tab
const LazyPdfHistoryViewer = dynamic(
  () => import('@/components/pdf/pdf-history-viewer').then((mod) => mod.PdfHistoryViewer),
  {
    ssr: false,
    loading: () => (
      <Card className="border border-border rounded-xl p-10 flex flex-col items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-xs font-medium">Chargement de l&apos;espace documents...</span>
      </Card>
    ),
  }
);

type WorkspaceTab = 'demandes' | 'documents' | 'autorisations' | 'explications';
type DemandeStatusFilter = 'all' | 'en_attente' | 'acceptee' | 'refusee';
type RealtimeNotificationKind = 'approved' | 'rejected' | 'signed';

interface RealtimeNotificationItem {
  id: string;
  sourceId: string;
  sourceType: 'demande' | 'pdf';
  kind: RealtimeNotificationKind;
  title: string;
  description: string;
  timestamp: Date;
  unread: boolean;
  demande?: Demande;
  pdfDoc?: PdfDocumentItem;
}

const DEMANDES_PAGE_SIZE = 6;
const AUTH_PAGE_SIZE = 6;
const EXPL_PAGE_SIZE = 5;

export default function DemandesPage() {
  return (
    <ClientOnly>
      <DemandesContent />
    </ClientOnly>
  );
}

function sanitizeInput(text: string): string {
  if (!text) return '';
  return text
    .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/javascript:[^\s"']*/gi, '')
    .replace(/<\/?[^>]+(>|$)/g, '');
}

function deduplicateById<T extends { id?: string }>(items: T[] | null | undefined): T[] {
  if (!items) return [];
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

function DemandesContent() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const isMounted = useIsMounted();

  const formatDate = (val: any, formatType: 'date' | 'time' | 'datetime' = 'date') => {
    const d = safeToDate(val);
    if (!d) return 'N/A';
    if (formatType === 'date') {
      return d.toLocaleDateString('fr-FR');
    } else if (formatType === 'time') {
      return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleString('fr-FR');
  };

  const getAvailabilityBadgeStyle = (status: string) => {
    switch (status) {
      case 'Disponible':
        return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400';
      case 'En mission':
        return 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400';
      case 'En congé':
        return 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400';
      case 'En permission':
        return 'bg-purple-500/10 border-purple-500/30 text-purple-600 dark:text-purple-400';
      default:
        return 'bg-muted border-border text-muted-foreground';
    }
  };

  // IDC et identifiant agent proviennent du jeton signé par le serveur (et non plus du localStorage)
  const { idc: userIdc, agentId: signedAgentId } = useRole();

  // Copie de la fiche agent en session : affichage immédiat avant la réponse de Firestore
  const cachedAgent = useMemo<Agent | null>(() => {
    if (typeof window === 'undefined' || !userIdc) return null;
    try {
      const raw = sessionStorage.getItem(`sbssi-agent-cache-${userIdc}`);
      return raw ? (JSON.parse(raw) as Agent) : null;
    } catch {
      return null;
    }
  }, [userIdc]);

  // Navigation & filter states
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('demandes');
  const [docInitialFilter, setDocInitialFilter] = useState<PdfTypeFilter>('all');
  const [demandeStatusFilter, setDemandeStatusFilter] = useState<DemandeStatusFilter>('all');
  const [demandeSearch, setDemandeSearch] = useState('');
  const [demandesPage, setDemandesPage] = useState(1);
  const [authPage, setAuthPage] = useState(1);
  const [explicationsPage, setExplicationsPage] = useState(1);

  // Security & notifications states
  const [lastSubmitTime, setLastSubmitTime] = useState<number>(0);
  const [dismissedReturns, setDismissedReturns] = useState<string[]>([]);
  const [isEquipmentCollapsed, setIsEquipmentCollapsed] = useState<boolean>(true);
  const [livePdfDocs, setLivePdfDocs] = useState<PdfDocumentItem[]>([]);
  const [realtimeNotifications, setRealtimeNotifications] = useState<RealtimeNotificationItem[]>([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState<boolean>(false);

  const prevDemandeStatusesRef = useRef<Map<string, Demande['status']>>(new Map());
  const demandeSnapshotInitRef = useRef<boolean>(false);
  const seenPdfIdsRef = useRef<Set<string>>(new Set());
  const pdfSnapshotInitRef = useRef<boolean>(false);
  const readNotifIdsRef = useRef<Set<string>>(new Set());

  // Request Form States
  const [permissionType, setPermissionType] = useState<string>('Permission exceptionnelle');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  // Photo de profil
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState<boolean>(false);

  // Explanation reply & confirmation delay states
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [replySubmitting, setReplySubmitting] = useState<Record<string, boolean>>({});
  const [countdown, setCountdown] = useState<Record<string, number>>({});
  const [draftReplies, setDraftReplies] = useState<Record<string, string>>({});
  const [timerIds, setTimerIds] = useState<Record<string, ReturnType<typeof setInterval>>>({});

  const formTypeRef = useRef<HTMLSelectElement | null>(null);

  useEffect(() => {
    return () => {
      Object.values(timerIds).forEach((id) => clearInterval(id));
    };
  }, [timerIds]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('dismissed-weapon-returns');
      if (saved) {
        try {
          setDismissedReturns(JSON.parse(saved));
        } catch (e) {
          console.error('Error loading dismissed weapon returns:', e);
        }
      }
      const activeIdc = userIdc;
      if (activeIdc) {
        try {
          const savedRead = localStorage.getItem(`sbssi-read-notifs-${activeIdc}`);
          if (savedRead) {
            const parsed = JSON.parse(savedRead);
            if (Array.isArray(parsed)) {
              readNotifIdsRef.current = new Set(parsed);
            }
          }
        } catch {
          // Ignore storage parsing errors
        }
      }
    }
  }, [userIdc]);

  const handleDismissReturn = (id: string) => {
    const updated = [...dismissedReturns, id];
    setDismissedReturns(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem('dismissed-weapon-returns', JSON.stringify(updated));
    }
    toast({
      title: 'Notification masquée',
      description: 'La confirmation de dépôt a bien été archivée.',
    });
  };

  // 1. Fiche de l'agent connecté uniquement (et non plus toute la liste des agents)
  const agentRef = useMemoFirebase(
    () => (firestore && signedAgentId ? doc(firestore, 'agents', signedAgentId) : null),
    [firestore, signedAgentId]
  );
  const { data: liveAgent } = useDoc<Agent>(agentRef);

  useEffect(() => {
    if (liveAgent && userIdc && typeof window !== 'undefined') {
      try {
        sessionStorage.setItem(`sbssi-agent-cache-${userIdc}`, JSON.stringify(liveAgent));
      } catch {
        // Ignore storage quota errors
      }
    }
  }, [liveAgent, userIdc]);

  const currentAgent = liveAgent || cachedAgent;

  const agentDisplayName = useMemo(() => {
    if (currentAgent) return currentAgent.fullName;
    return userIdc ? `Agent (${userIdc})` : 'Agent';
  }, [currentAgent, userIdc]);

  // 2. Scoped query: Missions assigned ONLY to this agent
  const missionsQuery = useMemoFirebase(() => {
    if (!firestore || !currentAgent?.id) return null;
    return query(
      collection(firestore, 'missions'),
      where('assignedAgentIds', 'array-contains', currentAgent.id)
    );
  }, [firestore, currentAgent?.id]);
  const { data: rawAgentMissions } = useCollection<Mission>(missionsQuery);
  const currentAgentMissions = useMemo(
    () => deduplicateById(rawAgentMissions),
    [rawAgentMissions]
  );

  // 3. Scoped query: Requests for this agent
  const demandesQuery = useMemoFirebase(() => {
    if (!firestore || !userIdc) return null;
    return query(collection(firestore, 'demandes'), where('agentId', '==', userIdc));
  }, [firestore, userIdc]);
  const { data: rawDemandes, isLoading: demandesLoading } = useCollection<Demande>(demandesQuery);
  const demandes = useMemo(() => deduplicateById(rawDemandes), [rawDemandes]);

  // 4. Scoped query: Explanations for this agent
  const explicationsQuery = useMemoFirebase(() => {
    if (!firestore || !currentAgent?.id) return null;
    return query(collection(firestore, 'explications'), where('agentId', '==', currentAgent.id));
  }, [firestore, currentAgent?.id]);
  const { data: rawExplications } = useCollection<Explication>(explicationsQuery);
  const explications = useMemo(() => deduplicateById(rawExplications), [rawExplications]);

  // 5. Scoped query: Equipment assignments for this agent
  const weaponAssignmentsQuery = useMemoFirebase(() => {
    if (!firestore || !currentAgent?.id) return null;
    return query(
      collection(firestore, 'weaponAssignments'),
      where('agentId', '==', currentAgent.id)
    );
  }, [firestore, currentAgent?.id]);
  const { data: rawWeaponAssignments } = useCollection<WeaponAssignment>(weaponAssignmentsQuery);
  const weaponAssignments = useMemo(
    () => deduplicateById(rawWeaponAssignments),
    [rawWeaponAssignments]
  );

  // 6. Subscribe to weapons ONLY when agent has at least one weapon assignment
  const weaponsQuery = useMemoFirebase(() => {
    if (!firestore || weaponAssignments.length === 0) return null;
    return collection(firestore, 'weapons');
  }, [firestore, weaponAssignments.length]);
  const { data: weapons } = useCollection<Weapon>(weaponsQuery);

  const currentAgentAvailability = useMemo<Availability>(() => {
    if (!currentAgent) return 'Disponible';
    const computed = getAgentAvailability(
      currentAgent,
      currentAgentMissions,
      new Date(),
      undefined,
      demandes
    );
    return (computed || currentAgent.availability || 'Disponible') as Availability;
  }, [currentAgent, currentAgentMissions, demandes]);

  const currentAgentWithDetails = useMemo(() => {
    if (!currentAgent) return null;
    return {
      ...currentAgent,
      availability: currentAgentAvailability,
      missionCount:
        currentAgent.missionCount !== undefined
          ? currentAgent.missionCount
          : currentAgentMissions.length,
    };
  }, [currentAgent, currentAgentAvailability, currentAgentMissions.length]);

  const [agentQrUrl, setAgentQrUrl] = useState<string>('');
  const [isQrBadgeOpen, setIsQrBadgeOpen] = useState<boolean>(false);
  const [isGeneratingBadgePdf, setIsGeneratingBadgePdf] = useState<boolean>(false);

  useEffect(() => {
    let isCancelled = false;
    if (!currentAgent) {
      setAgentQrUrl('');
      return;
    }
    generateAgentQRCodeDataURL(currentAgent, { size: 280, margin: 2 })
      .then((url) => {
        if (!isCancelled) setAgentQrUrl(url);
      })
      .catch((err) => {
        console.error('Failed to generate personal agent QR code:', err);
      });
    return () => {
      isCancelled = true;
    };
  }, [currentAgent]);

  const handleDownloadPersonalQR = () => {
    if (!agentQrUrl || !currentAgent) return;
    const idc = (currentAgent.id || '').substring(0, 6).toUpperCase();
    const link = document.createElement('a');
    link.href = agentQrUrl;
    link.download = `QRCode_Agent_${currentAgent.registrationNumber || idc}_${currentAgent.fullName.replace(/\s+/g, '_')}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({
      title: 'Code QR téléchargé',
      description: 'Votre code QR d’identification a été enregistré en PNG.',
    });
  };

  const handlePrintPersonalBadge = async () => {
    if (!currentAgentWithDetails) return;
    try {
      setIsGeneratingBadgePdf(true);
      await generateAgentBadgeCardPDF(currentAgentWithDetails);
      toast({
        title: 'Badge officiel généré',
        description: 'Votre carte d’identification PDF a été téléchargée.',
      });
    } catch (error) {
      console.error('Error generating personal badge PDF:', error);
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: 'Impossible de générer votre badge officiel.',
      });
    } finally {
      setIsGeneratingBadgePdf(false);
    }
  };

  const handleDownloadFicheTechnique = () => {
    if (!currentAgent) {
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: 'Impossible de charger vos informations d’agent.',
      });
      return;
    }
    const agentWithAvailability = {
      ...currentAgent,
      availability: currentAgentAvailability,
    };
    generateFicheAgentPDF(agentWithAvailability, currentAgentMissions, explications);
    toast({
      title: 'Fiche technique générée',
      description: 'Le téléchargement de votre fiche technique a commencé.',
    });
  };

  const weaponsById = useMemo(() => {
    if (!weapons) return {};
    return weapons.reduce((acc, weapon) => {
      acc[weapon.id] = weapon;
      return acc;
    }, {} as Record<string, Weapon>);
  }, [weapons]);

  const activeEquipmentAssignments = useMemo(
    () => weaponAssignments.filter((a) => !a.returnedAt),
    [weaponAssignments]
  );

  const expiringSoonDemandes = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return demandes.filter((dem) => {
      if (dem.status !== 'acceptee') return false;
      const end = safeToDate(dem.endDate);
      if (!end) return false;
      const endDateNoTime = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      const diffTime = endDateNoTime.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 3;
    });
  }, [demandes]);

  const focusCreateDemandeForm = () => {
    setActiveTab('demandes');
    setTimeout(() => {
      const element = document.getElementById('new-request-form');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      if (formTypeRef.current) {
        formTypeRef.current.focus();
      }
    }, 120);
  };

  const handleRequestExtension = (dem: Demande) => {
    setPermissionType('Prolongation de permission');
    const currentEnd = safeToDate(dem.endDate);
    if (currentEnd) {
      const nextDay = new Date(currentEnd);
      nextDay.setDate(nextDay.getDate() + 1);
      setStartDate(nextDay.toISOString().split('T')[0]);
      const futureEnd = new Date(nextDay);
      futureEnd.setDate(futureEnd.getDate() + 3);
      setEndDate(futureEnd.toISOString().split('T')[0]);
    }
    setReason(
      `Demande de prolongation de ma permission (${dem.type}) du ${formatDate(dem.startDate, 'date')} au ${formatDate(dem.endDate, 'date')}.\nMotif du prolongement : `
    );
    setActiveTab('demandes');
    setTimeout(() => {
      const element = document.getElementById('new-request-form');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
        const textarea = document.getElementById('reason') as HTMLTextAreaElement | null;
        if (textarea) textarea.focus();
      }
    }, 150);
    toast({
      title: 'Prolongation initiée',
      description: 'Le formulaire a été pré-rempli pour votre demande de prolongation.',
    });
  };

  const unacknowledgedReturnedAssignments = useMemo(
    () => weaponAssignments.filter((a) => !!a.returnedAt && !dismissedReturns.includes(a.id)),
    [weaponAssignments, dismissedReturns]
  );

  const pendingExplications = useMemo(
    () => explications.filter((exp) => exp.status === 'en_attente'),
    [explications]
  );

  const unnotifiedSanctions = useMemo(
    () =>
      explications.filter(
        (exp) => exp.status === 'sanctionne' && exp.notifiedAgentSanction === false
      ),
    [explications]
  );

  const handleAcknowledgeSanction = async (id: string) => {
    if (!firestore) return;
    try {
      await setDoc(doc(firestore, 'explications', id), { notifiedAgentSanction: true }, { merge: true });
      toast({
        title: 'Réception accusée',
        description: 'Vous avez accusé réception de la sanction administrative.',
      });
    } catch (err) {
      console.error('Error acknowledging sanction:', err);
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: 'Impossible d’accuser réception.',
      });
    }
  };

  const handleReplyExplication = (id: string) => {
    const reply = replies[id]?.trim();
    if (!reply || !firestore) {
      toast({
        variant: 'destructive',
        title: 'Réponse vide',
        description: 'Veuillez rédiger une réponse explicative.',
      });
      return;
    }

    setDraftReplies((prev) => ({ ...prev, [id]: reply }));
    setCountdown((prev) => ({ ...prev, [id]: 10 }));

    const intervalId = setInterval(() => {
      setCountdown((prev) => {
        const currentVal = prev[id] || 0;
        if (currentVal <= 1) {
          clearInterval(intervalId);
          submitConfirmedReply(id, reply);
          return { ...prev, [id]: 0 };
        }
        return { ...prev, [id]: currentVal - 1 };
      });
    }, 1000);

    setTimerIds((prev) => ({ ...prev, [id]: intervalId }));
    toast({
      title: 'Délai de confirmation (10 secondes)',
      description: "Votre réponse est mise en attente pour envoi. Vous pouvez l'annuler ou la modifier.",
    });
  };

  const submitConfirmedReply = async (id: string, replyText: string) => {
    setReplySubmitting((prev) => ({ ...prev, [id]: true }));
    try {
      await setDoc(
        doc(firestore!, 'explications', id),
        {
          replyText: sanitizeInput(replyText),
          replyDate: Timestamp.now(),
          status: 'repondu',
          notifiedAdmin: false,
          notifiedAgent: true,
        },
        { merge: true }
      );

      toast({
        title: 'Réponse envoyée',
        description: "Votre réponse à la demande d'explication a bien été transmise à l'administrateur.",
      });

      setReplies((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      setDraftReplies((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      setCountdown((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
    } catch (err) {
      console.error('Error replying to explanation:', err);
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: 'Impossible d’envoyer votre réponse. Veuillez réessayer.',
      });
    } finally {
      setReplySubmitting((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleImmediateSend = (id: string) => {
    if (timerIds[id]) clearInterval(timerIds[id]);
    const reply = draftReplies[id] || replies[id];
    submitConfirmedReply(id, reply);
  };

  const handleCancelSend = (id: string) => {
    if (timerIds[id]) clearInterval(timerIds[id]);
    setTimerIds((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    setCountdown((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    setDraftReplies((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    toast({
      title: 'Envoi annulé',
      description: 'Vous pouvez modifier votre réponse explicative avant de la renvoyer.',
    });
  };

  const handleDeleteExplication = async (id: string) => {
    if (!firestore) return;
    if (!window.confirm("Voulez-vous vraiment supprimer cette demande d'explication de votre historique ?")) return;
    try {
      await deleteDoc(doc(firestore, 'explications', id));
      toast({ title: 'Explication supprimée', description: "L'élément a été supprimé." });
    } catch {
      toast({ variant: 'destructive', title: 'Erreur', description: "Impossible de supprimer l'explication." });
    }
  };

  const handleClearAllExplications = async () => {
    if (!firestore || explications.length === 0) return;
    if (!window.confirm("Voulez-vous vraiment vider tout l'historique de vos demandes d'explication ?")) return;
    try {
      for (const exp of explications) {
        await deleteDoc(doc(firestore, 'explications', exp.id));
      }
      toast({ title: "Historique d'explications vidé" });
    } catch {
      toast({ variant: 'destructive', title: 'Erreur', description: "Impossible de vider l'historique." });
    }
  };

  const handleDeleteDemande = async (id: string) => {
    if (!firestore) return;
    if (!window.confirm('Voulez-vous vraiment supprimer cette autorisation de votre historique ?')) return;
    try {
      await deleteDoc(doc(firestore, 'demandes', id, 'files', DEMANDE_ATTACHMENT_DOC_ID)).catch(() => {});
      await deleteDoc(doc(firestore, 'demandes', id));
      toast({ title: 'Autorisation supprimée' });
    } catch {
      toast({ variant: 'destructive', title: 'Erreur', description: "Impossible de supprimer l'autorisation." });
    }
  };

  const handleClearAllAcceptedDemandes = async () => {
    const acceptedList = sortedDemandes.filter((d) => d.status === 'acceptee');
    if (!firestore || acceptedList.length === 0) return;
    if (!window.confirm("Voulez-vous vraiment vider tout l'historique de vos autorisations d'absence ?")) return;
    try {
      for (const dem of acceptedList) {
        await deleteDoc(doc(firestore, 'demandes', dem.id, 'files', DEMANDE_ATTACHMENT_DOC_ID)).catch(() => {});
        await deleteDoc(doc(firestore, 'demandes', dem.id));
      }
      toast({ title: "Historique des autorisations d'absence vidé" });
    } catch {
      toast({ variant: 'destructive', title: 'Erreur', description: "Impossible de vider l'historique." });
    }
  };

  const persistReadNotifIds = (ids: string[]) => {
    ids.forEach((id) => readNotifIdsRef.current.add(id));
    if (typeof window !== 'undefined' && userIdc) {
      try {
        localStorage.setItem(
          `sbssi-read-notifs-${userIdc}`,
          JSON.stringify(Array.from(readNotifIdsRef.current).slice(-100))
        );
      } catch {
        // Ignore storage errors
      }
    }
  };

  // Identifiants sous lesquels les documents de l'agent sont enregistrés.
  // Limités à ceux du jeton signé : ce sont ceux que les règles Firestore autorisent.
  const agentKeys = useMemo(() => {
    const keys = [signedAgentId?.trim(), userIdc?.trim()].filter((k): k is string => Boolean(k));
    return Array.from(new Set(keys));
  }, [signedAgentId, userIdc]);

  const agentKeysString = useMemo(() => agentKeys.join('|'), [agentKeys]);

  // Ordres de mission SIGNÉS reçus : seuls ceux des missions où l'agent est désigné, après signature
  const signedOrdersQuery = useMemoFirebase(() => {
    const keys = agentKeysString.split('|').filter(Boolean);
    return firestore && keys.length
      ? query(collection(firestore, 'signed_orders'), where('agentIds', 'array-contains-any', keys.slice(0, 30)))
      : null;
  }, [firestore, agentKeysString]);
  const { data: rawSignedOrders, isLoading: signedOrdersLoading } = useCollection<SignedOrder>(signedOrdersQuery);
  const signedOrders = useMemo(() => (rawSignedOrders ?? []).filter((o) => o.status === 'archive'), [rawSignedOrders]);

  // Alerte à l'arrivée d'un nouvel ordre signé (pas au premier chargement)
  const seenSignedOrderIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (signedOrdersLoading) return;
    const ids = new Set(signedOrders.map((o) => o.id));
    if (seenSignedOrderIds.current) {
      const fresh = signedOrders.filter((o) => !seenSignedOrderIds.current!.has(o.id));
      fresh.forEach((o) =>
        toast({ title: 'Ordre de mission signé reçu', description: `${o.missionName} — disponible dans vos documents.` }),
      );
    }
    seenSignedOrderIds.current = ids;
  }, [signedOrders, signedOrdersLoading, toast]);

  // Real-time Firebase onSnapshot(): détecte instantanément lorsqu'une demande est approuvée ou rejetée
  useEffect(() => {
    if (!firestore || !userIdc) return;

    demandeSnapshotInitRef.current = false;
    prevDemandeStatusesRef.current = new Map();

    const q = query(collection(firestore, 'demandes'), where('agentId', '==', userIdc));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!demandeSnapshotInitRef.current) {
          demandeSnapshotInitRef.current = true;
          const initialAlerts: RealtimeNotificationItem[] = [];

          snapshot.docs.forEach((docSnap) => {
            const data = { ...(docSnap.data() as Demande), id: docSnap.id };
            prevDemandeStatusesRef.current.set(docSnap.id, data.status);

            const isUnread = data.vu_par_agent === false || data.notified === false;
            if (isUnread && (data.status === 'acceptee' || data.status === 'refusee')) {
              const notifId = `demande-${data.status}-${data.id}`;
              initialAlerts.push({
                id: notifId,
                sourceId: data.id,
                sourceType: 'demande',
                kind: data.status === 'acceptee' ? 'approved' : 'rejected',
                title: data.status === 'acceptee' ? 'Demande approuvée' : 'Demande rejetée',
                description:
                  data.status === 'acceptee'
                    ? `Votre demande (${data.type}) du ${formatDate(data.startDate, 'date')} au ${formatDate(data.endDate, 'date')} a été approuvée.`
                    : `Votre demande (${data.type}) a été rejetée.${data.comment ? ` Motif : ${data.comment}` : ''}`,
                timestamp: safeToDate(data.createdAt) || new Date(),
                unread: !readNotifIdsRef.current.has(notifId),
                demande: data,
              });
            }
          });

          if (initialAlerts.length > 0) {
            setRealtimeNotifications((prev) => {
              const existingIds = new Set(prev.map((n) => n.id));
              const merged = [...initialAlerts.filter((a) => !existingIds.has(a.id)), ...prev];
              return merged.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 30);
            });
          }
          return;
        }

        const liveAlerts: RealtimeNotificationItem[] = [];
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'removed') {
            prevDemandeStatusesRef.current.delete(change.doc.id);
            return;
          }

          const data = { ...(change.doc.data() as Demande), id: change.doc.id };
          const prevStatus = prevDemandeStatusesRef.current.get(change.doc.id);
          prevDemandeStatusesRef.current.set(change.doc.id, data.status);

          if (data.status === 'acceptee' && prevStatus !== 'acceptee') {
            const notifId = `demande-acceptee-${data.id}`;
            const item: RealtimeNotificationItem = {
              id: notifId,
              sourceId: data.id,
              sourceType: 'demande',
              kind: 'approved',
              title: 'Demande approuvée',
              description: `Votre demande (${data.type}) du ${formatDate(data.startDate, 'date')} au ${formatDate(data.endDate, 'date')} vient d'être approuvée.`,
              timestamp: new Date(),
              unread: true,
              demande: data,
            };
            liveAlerts.push(item);
            toast({
              title: 'Demande approuvée',
              description: `${data.type} du ${formatDate(data.startDate, 'date')} au ${formatDate(data.endDate, 'date')} acceptée.`,
            });
          } else if (data.status === 'refusee' && prevStatus !== 'refusee') {
            const notifId = `demande-refusee-${data.id}`;
            const item: RealtimeNotificationItem = {
              id: notifId,
              sourceId: data.id,
              sourceType: 'demande',
              kind: 'rejected',
              title: 'Demande rejetée',
              description: `Votre demande (${data.type}) a été rejetée.${data.comment ? ` Motif : ${data.comment}` : ''}`,
              timestamp: new Date(),
              unread: true,
              demande: data,
            };
            liveAlerts.push(item);
            toast({
              variant: 'destructive',
              title: 'Demande rejetée',
              description: `${data.type} refusée.${data.comment ? ` Motif : ${data.comment}` : ''}`,
            });
          }
        });

        if (liveAlerts.length > 0) {
          setRealtimeNotifications((prev) => {
            const incomingIds = new Set(liveAlerts.map((n) => n.id));
            const filtered = prev.filter((n) => !incomingIds.has(n.id));
            return [...liveAlerts, ...filtered]
              .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
              .slice(0, 30);
          });
        }
      },
      (err) => {
        console.error('Real-time demandes listener error:', err);
      }
    );

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firestore, userIdc]);

  // Real-time Firebase onSnapshot(): détecte les documents signés et alimente le KPI "Documents disponibles"
  useEffect(() => {
    if (!firestore || !agentKeysString) {
      setLivePdfDocs([]);
      return;
    }

    const keys = agentKeysString.split('|').filter(Boolean);
    if (keys.length === 0) return;

    pdfSnapshotInitRef.current = false;
    seenPdfIdsRef.current = new Set();

    const pdfQ = query(
      collection(firestore, 'pdf_documents'),
      where('agentIds', 'array-contains-any', keys),
      limit(50)
    );

    const unsubscribe = onSnapshot(
      pdfQ,
      (snapshot) => {
        const docsMap = new Map<string, PdfDocumentItem>();
        snapshot.docs.forEach((docSnap) => {
          const item = { ...(docSnap.data() as PdfDocumentItem), id: docSnap.id };
          docsMap.set(docSnap.id, item);
        });
        const sortedDocs = Array.from(docsMap.values()).sort((a, b) => {
          const tA = safeToDate(a.createdAt)?.getTime() || 0;
          const tB = safeToDate(b.createdAt)?.getTime() || 0;
          return tB - tA;
        });
        setLivePdfDocs(sortedDocs);

        if (!pdfSnapshotInitRef.current) {
          pdfSnapshotInitRef.current = true;
          const recentSignedAlerts: RealtimeNotificationItem[] = [];
          const cutoffMs = Date.now() - 7 * 24 * 60 * 60 * 1000;

          sortedDocs.forEach((docItem) => {
            seenPdfIdsRef.current.add(docItem.id);
            const createdMs = safeToDate(docItem.createdAt)?.getTime() || 0;
            const notifId = `pdf-signed-${docItem.id}`;
            if (
              docItem.type === 'autorisation_absence' &&
              createdMs >= cutoffMs &&
              !readNotifIdsRef.current.has(notifId)
            ) {
              recentSignedAlerts.push({
                id: notifId,
                sourceId: docItem.id,
                sourceType: 'pdf',
                kind: 'signed',
                title: 'Autorisation signée disponible',
                description: `${docItem.title} — Document officiel prêt en téléchargement PDF.`,
                timestamp: safeToDate(docItem.createdAt) || new Date(),
                unread: true,
                pdfDoc: docItem,
              });
            }
          });

          if (recentSignedAlerts.length > 0) {
            setRealtimeNotifications((prev) => {
              const existingIds = new Set(prev.map((n) => n.id));
              const merged = [
                ...recentSignedAlerts.filter((a) => !existingIds.has(a.id)),
                ...prev,
              ];
              return merged.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 30);
            });
          }
          return;
        }

        const liveSignedAlerts: RealtimeNotificationItem[] = [];
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'removed') {
            seenPdfIdsRef.current.delete(change.doc.id);
            return;
          }

          const docItem = { ...(change.doc.data() as PdfDocumentItem), id: change.doc.id };
          const isNewPdf = !seenPdfIdsRef.current.has(docItem.id);
          seenPdfIdsRef.current.add(docItem.id);

          if (isNewPdf || (change.type === 'modified' && docItem.type === 'autorisation_absence')) {
            const notifId = `pdf-signed-${docItem.id}`;
            const label =
              docItem.type === 'autorisation_absence'
                ? 'Autorisation signée disponible'
                : docItem.type === 'ordre_de_mission'
                ? 'Ordre de mission disponible'
                : 'Document officiel signé';

            liveSignedAlerts.push({
              id: notifId,
              sourceId: docItem.id,
              sourceType: 'pdf',
              kind: 'signed',
              title: label,
              description: `${docItem.title} est prêt en téléchargement PDF.`,
              timestamp: new Date(),
              unread: true,
              pdfDoc: docItem,
            });

            toast({
              title: label,
              description: `${docItem.title} est maintenant disponible.`,
            });
          }
        });

        if (liveSignedAlerts.length > 0) {
          setRealtimeNotifications((prev) => {
            const incomingIds = new Set(liveSignedAlerts.map((n) => n.id));
            const filtered = prev.filter((n) => !incomingIds.has(n.id));
            return [...liveSignedAlerts, ...filtered]
              .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
              .slice(0, 30);
          });
        }
      },
      (err) => {
        console.error('Real-time pdf_documents listener error:', err);
      }
    );

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firestore, agentKeysString]);

  const handleMarkNotificationRead = async (notif: RealtimeNotificationItem) => {
    persistReadNotifIds([notif.id]);
    setRealtimeNotifications((prev) =>
      prev.map((n) => (n.id === notif.id ? { ...n, unread: false } : n))
    );
    if (firestore && notif.sourceType === 'demande' && notif.sourceId) {
      try {
        await setDoc(
          doc(firestore, 'demandes', notif.sourceId),
          { notified: true, vu_par_agent: true },
          { merge: true }
        );
      } catch (err) {
        console.error('Error marking demande notification read:', err);
      }
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    const idsToPersist = realtimeNotifications.map((n) => n.id);
    persistReadNotifIds(idsToPersist);
    setRealtimeNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));

    if (firestore) {
      const unreadDemandeIds = Array.from(
        new Set(
          realtimeNotifications
            .filter((n) => n.sourceType === 'demande' && n.unread)
            .map((n) => n.sourceId)
            .concat(
              demandes
                .filter((d) => d.vu_par_agent === false || d.notified === false)
                .map((d) => d.id)
            )
        )
      );
      await Promise.all(
        unreadDemandeIds.map((id) =>
          setDoc(
            doc(firestore, 'demandes', id),
            { notified: true, vu_par_agent: true },
            { merge: true }
          ).catch((err) => console.error('Error marking demande read:', err))
        )
      );
    }

    toast({
      title: 'Notifications marquées comme lues',
      description: 'Toutes vos alertes temps réel ont été acquittées.',
    });
  };

  const handleDownloadPdfFromNotification = (docItem: PdfDocumentItem) => {
    if (docItem.type === 'ordre_de_mission' && docItem.missionData) {
      // Fiches complètes des agents enregistrées avec l'ordre (grade, matricule, contact) ;
      // à défaut, seulement les noms.
      const matchedAgents = docItem.missionData.agents?.length
        ? docItem.missionData.agents
        : (docItem.agentIds || []).map((id, i) => ({
            id,
            fullName: docItem.agentNames?.[i] || 'Agent',
          }));
      // Ordre des paramètres : mission, agents, immatriculation du véhicule, identifiant du chef de mission
      generateOrdreDeMissionPDF(
        docItem.missionData,
        matchedAgents as any,
        docItem.vehiclePlate || undefined,
        docItem.leaderId || docItem.missionData.leaderId || undefined
      );
      return;
    }
    if (docItem.type === 'autorisation_absence' && docItem.demandeData) {
      generateAutorisationAbsencePDF(docItem.demandeData, docItem.agentData || currentAgent);
      return;
    }
    if (docItem.type === 'fiche_agent' && docItem.agentData) {
      generateFicheAgentPDF(docItem.agentData, [], []);
    }
  };

  // L'agent change sa propre photo : compressée (~20-30 Ko) puis enregistrée sur sa fiche
  const handleProfilePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !firestore || !signedAgentId) return;
    setIsUploadingPhoto(true);
    try {
      const dataUrl = await compressImageToDataUrl(file);
      await setDoc(doc(firestore, 'agents', signedAgentId), { photo: dataUrl }, { merge: true });
      toast({ title: 'Photo mise à jour', description: 'Votre nouvelle photo de profil est enregistrée.' });
    } catch (err) {
      console.error('Profile photo update failed:', err);
      toast({
        variant: 'destructive',
        title: 'Photo non enregistrée',
        description: err instanceof Error && !/permission/i.test(err.message) ? err.message : 'Impossible de mettre à jour la photo.',
      });
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || !userIdc) return;

    if (Date.now() - lastSubmitTime < 5000) {
      toast({
        variant: 'destructive',
        title: 'Soumission trop rapide',
        description: 'Veuillez patienter au moins 5 secondes entre chaque demande.',
      });
      return;
    }
    setLastSubmitTime(Date.now());

    if (!permissionType || !startDate || !endDate || !reason.trim()) {
      toast({
        variant: 'destructive',
        title: 'Formulaire incomplet',
        description: 'Veuillez renseigner tous les champs obligatoires, y compris le motif.',
      });
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) {
      toast({
        variant: 'destructive',
        title: 'Erreur de date',
        description: 'La date de fin ne doit pas être antérieure à la date de début.',
      });
      return;
    }

    setIsSubmitting(true);

    // Pièce jointe : image compressée ou PDF (700 Ko max), préparée avant tout envoi
    let preparedAttachment: Awaited<ReturnType<typeof prepareScanFile>> | null = null;
    if (attachmentFile) {
      try {
        preparedAttachment = await prepareScanFile(attachmentFile);
      } catch (err) {
        toast({
          variant: 'destructive',
          title: 'Pièce jointe refusée',
          description: err instanceof Error ? err.message : 'Fichier illisible.',
        });
        setIsSubmitting(false);
        return;
      }
    }

    try {
      // La demande et son fichier sont écrits ensemble : jamais de demande sans son justificatif
      const demandeRef = doc(collection(firestore, 'demandes'));
      const batch = writeBatch(firestore);
      batch.set(demandeRef, {
        agentId: userIdc,
        agentName: agentDisplayName,
        type: permissionType,
        startDate: Timestamp.fromDate(start),
        endDate: Timestamp.fromDate(end),
        reason: sanitizeInput(reason.trim()) || '',
        status: 'en_attente',
        comment: '',
        createdAt: serverTimestamp(),
        notified: true,
        vu_par_agent: true,
        attachment: preparedAttachment
          ? { name: preparedAttachment.name, mimeType: preparedAttachment.mimeType }
          : null,
      });
      if (preparedAttachment) {
        batch.set(doc(demandeRef, 'files', DEMANDE_ATTACHMENT_DOC_ID), {
          ...preparedAttachment,
          agentId: userIdc,
          createdAt: serverTimestamp(),
        });
      }
      await batch.commit();

      toast({
        title: 'Demande envoyée',
        description: preparedAttachment
          ? 'Votre demande et sa pièce jointe ont bien été transmises à la hiérarchie.'
          : 'Votre demande de permission a bien été transmise à la hiérarchie.',
      });

      setPermissionType('Permission exceptionnelle');
      setStartDate('');
      setEndDate('');
      setReason('');
      setAttachmentFile(null);
      if (attachmentInputRef.current) attachmentInputRef.current.value = '';
    } catch (error) {
      console.error('Error adding request:', error);
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: 'Impossible d’envoyer la demande. Veuillez réessayer.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: Demande['status']) => {
    switch (status) {
      case 'en_attente':
        return (
          <Badge className="bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30 flex items-center gap-1.5 w-fit">
            <Clock size={12} />
            <span>En attente</span>
          </Badge>
        );
      case 'acceptee':
        return (
          <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 flex items-center gap-1.5 w-fit">
            <CheckCircle2 size={12} />
            <span>Acceptée</span>
          </Badge>
        );
      case 'refusee':
        return (
          <Badge className="bg-destructive/15 text-destructive border-destructive/30 flex items-center gap-1.5 w-fit">
            <XCircle size={12} />
            <span>Refusée</span>
          </Badge>
        );
    }
  };

  // Sort requests newest first
  const sortedDemandes = useMemo(() => {
    return [...demandes].sort((a, b) => {
      const tA = safeToDate(a.createdAt)?.getTime() || 0;
      const tB = safeToDate(b.createdAt)?.getTime() || 0;
      return tB - tA;
    });
  }, [demandes]);

  // Dashboard KPI statistics for Top Dashboard
  const kpiStats = useMemo(() => {
    const now = new Date();
    const pendingRequests = demandes.filter((d) => d.status === 'en_attente').length;
    const approvedRequests = demandes.filter((d) => d.status === 'acceptee').length;
    const rejectedRequests = demandes.filter((d) => d.status === 'refusee').length;

    const activeMissions = currentAgentMissions.filter(
      (mission) => getDisplayStatus(mission, now) === 'En cours'
    ).length;

    // Ordres de mission : seulement les versions signées reçues
    const missionOrderDocs = signedOrders.length;
    const documentsAvailable = livePdfDocs.filter((d) => d.type !== 'ordre_de_mission').length + missionOrderDocs;
    const signedAuthDocs = livePdfDocs.filter((d) => d.type === 'autorisation_absence').length;

    const unreadRealtimeCount = realtimeNotifications.filter((n) => n.unread).length;
    const operationalAlertsCount =
      pendingExplications.length +
      unnotifiedSanctions.length +
      unacknowledgedReturnedAssignments.length;
    const totalNotifications = unreadRealtimeCount + operationalAlertsCount;

    return {
      pendingRequests,
      approvedRequests,
      rejectedRequests,
      activeMissions,
      documentsAvailable,
      missionOrderDocs,
      signedAuthDocs,
      unreadRealtimeCount,
      totalNotifications,
    };
  }, [
    demandes,
    currentAgentMissions,
    livePdfDocs,
    signedOrders,
    realtimeNotifications,
    pendingExplications.length,
    unnotifiedSanctions.length,
    unacknowledgedReturnedAssignments.length,
  ]);

  // Filtered + paginated demandes
  const filteredDemandes = useMemo(() => {
    const q = demandeSearch.trim().toLowerCase();
    return sortedDemandes.filter((d) => {
      if (demandeStatusFilter !== 'all' && d.status !== demandeStatusFilter) return false;
      if (q) {
        const matchType = d.type?.toLowerCase().includes(q);
        const matchReason = d.reason?.toLowerCase().includes(q);
        if (!matchType && !matchReason) return false;
      }
      return true;
    });
  }, [sortedDemandes, demandeStatusFilter, demandeSearch]);

  const totalDemandesPages = Math.max(1, Math.ceil(filteredDemandes.length / DEMANDES_PAGE_SIZE));
  const safeDemandesPage = Math.min(demandesPage, totalDemandesPages);
  const paginatedDemandes = useMemo(() => {
    const start = (safeDemandesPage - 1) * DEMANDES_PAGE_SIZE;
    return filteredDemandes.slice(start, start + DEMANDES_PAGE_SIZE);
  }, [filteredDemandes, safeDemandesPage]);

  // Accepted authorizations + pagination
  const acceptedDemandes = useMemo(
    () => sortedDemandes.filter((d) => d.status === 'acceptee'),
    [sortedDemandes]
  );
  const totalAuthPages = Math.max(1, Math.ceil(acceptedDemandes.length / AUTH_PAGE_SIZE));
  const safeAuthPage = Math.min(authPage, totalAuthPages);
  const paginatedAuthorizations = useMemo(() => {
    const start = (safeAuthPage - 1) * AUTH_PAGE_SIZE;
    return acceptedDemandes.slice(start, start + AUTH_PAGE_SIZE);
  }, [acceptedDemandes, safeAuthPage]);

  // Explications sorted & paginated
  const sortedExplications = useMemo(() => {
    return [...explications].sort((a, b) => {
      const tA = safeToDate(a.requestDate)?.getTime() || 0;
      const tB = safeToDate(b.requestDate)?.getTime() || 0;
      return tB - tA;
    });
  }, [explications]);
  const totalExplPages = Math.max(1, Math.ceil(sortedExplications.length / EXPL_PAGE_SIZE));
  const safeExplPage = Math.min(explicationsPage, totalExplPages);
  const paginatedExplications = useMemo(() => {
    const start = (safeExplPage - 1) * EXPL_PAGE_SIZE;
    return sortedExplications.slice(start, start + EXPL_PAGE_SIZE);
  }, [sortedExplications, safeExplPage]);

  if (!isMounted) return null;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Mon Espace Agent
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Situation administrative, demandes de permission, ordres de mission et documents officiels.
        </p>
      </div>

      {/* Single Clean Identity Card + Personal QR Preview */}
      {currentAgent && currentAgentWithDetails && (
        <Card className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="p-5 sm:p-6 flex flex-col lg:flex-row items-center lg:items-stretch justify-between gap-6">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-5 text-center md:text-left flex-1 min-w-0">
              <div className="group relative shrink-0">
                {currentAgent.photo ? (
                  <div className="relative w-24 h-28 rounded-xl overflow-hidden border border-border bg-muted shadow-sm">
                    <Image
                      src={currentAgent.photo}
                      alt={currentAgent.fullName}
                      fill
                      className="object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                ) : (
                  <div className="relative w-24 h-28 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-2xl font-bold shadow-sm">
                    {currentAgent.fullName.substring(0, 2).toUpperCase()}
                  </div>
                )}
                {signedAgentId && currentAgent.id === signedAgentId && (
                  <>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={handleProfilePhotoChange}
                    />
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      disabled={isUploadingPhoto}
                      className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow-md transition-transform hover:scale-105 disabled:opacity-70"
                      title="Changer ma photo de profil"
                      aria-label="Changer ma photo de profil"
                    >
                      {isUploadingPhoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                    </button>
                  </>
                )}
              </div>

              <div className="space-y-3 min-w-0 flex-1 w-full">
                <div className="flex flex-wrap items-center gap-2 justify-center md:justify-start">
                  <h2 className="text-xl font-bold text-foreground truncate max-w-[320px]">
                    {currentAgent.fullName}
                  </h2>
                  <Badge variant="outline" className="bg-primary/10 border-primary/30 text-primary text-xs font-semibold">
                    {currentAgent.rank || 'Agent'}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn('text-xs font-semibold border', getAvailabilityBadgeStyle(currentAgentAvailability))}
                  >
                    {currentAgentAvailability}
                  </Badge>
                  <Badge variant="secondary" className="font-mono text-xs tabular-nums">
                    IDC : {(currentAgent.id || '').substring(0, 6).toUpperCase()}
                  </Badge>
                </div>

                {/* Single structured grid: each field rendered strictly once */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-left rounded-xl bg-muted/40 border border-border p-3 text-xs">
                  <div>
                    <span className="text-muted-foreground block">Matricule</span>
                    <span className="font-mono font-semibold text-foreground">
                      {currentAgent.registrationNumber || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Section</span>
                    <span className="font-semibold text-foreground uppercase truncate block">
                      {currentAgent.section || 'Non assigné'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Contact</span>
                    <span className="font-semibold text-foreground tabular-nums">
                      {currentAgent.contact || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Adresse</span>
                    <span className="font-semibold text-foreground truncate block">
                      {currentAgent.address || 'N/A'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2.5">
                  <Button
                    type="button"
                    onClick={() => setIsQrBadgeOpen(true)}
                    className="font-semibold text-white bg-[#1a2b4c] hover:bg-[#132038] rounded-xl gap-2 shadow-sm cursor-pointer h-9 px-4 text-xs"
                  >
                    <IdCard className="h-4 w-4" />
                    <span>Badge &amp; Code QR d&apos;Identification</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleDownloadFicheTechnique}
                    className="font-semibold border-border hover:bg-muted rounded-xl gap-2 cursor-pointer h-9 px-4 text-xs"
                  >
                    <FileDown className="h-4 w-4 text-primary" />
                    <span>Fiche Technique (PDF)</span>
                  </Button>
                </div>
              </div>
            </div>

            {/* Direct Personal QR Code Card */}
            <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-muted/30 border border-border shrink-0 w-full sm:w-auto lg:min-w-[196px]">
              <button
                type="button"
                onClick={() => setIsQrBadgeOpen(true)}
                className="flex flex-col items-center justify-center p-2 rounded-lg bg-white border border-slate-200 hover:border-primary/50 transition-colors cursor-pointer"
                title="Cliquer pour agrandir mon Badge & Code QR"
              >
                {agentQrUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={agentQrUrl}
                    alt={`Mon Code QR - ${currentAgent.fullName}`}
                    className="h-24 w-24 object-contain"
                  />
                ) : (
                  <div className="h-24 w-24 flex items-center justify-center text-muted-foreground">
                    <QrCode className="h-9 w-9 text-muted-foreground/40" />
                  </div>
                )}
                <span className="text-[9px] font-mono font-bold text-slate-800 tracking-wider mt-1">
                  MON CODE QR · BSSI
                </span>
              </button>
              <div className="flex items-center gap-1.5 mt-2 w-full">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleDownloadPersonalQR}
                  disabled={!agentQrUrl}
                  className="flex-1 h-7 text-[11px] gap-1 cursor-pointer"
                >
                  <Download className="h-3 w-3" />
                  <span>PNG</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handlePrintPersonalBadge}
                  disabled={!agentQrUrl || isGeneratingBadgePdf}
                  className="flex-1 h-7 text-[11px] gap-1 cursor-pointer"
                >
                  <Printer className="h-3 w-3" />
                  <span>{isGeneratingBadgePdf ? '...' : 'Badge'}</span>
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      <AgentQRBadgeDialog
        agent={currentAgentWithDetails}
        isOpen={isQrBadgeOpen}
        onOpenChange={setIsQrBadgeOpen}
      />

      {/* Tableau de bord supérieur : 4 Cartes KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* KPI 1 : Demandes en cours */}
        <button
          type="button"
          onClick={() => {
            setActiveTab('demandes');
            setDemandeStatusFilter('en_attente');
            setDemandesPage(1);
          }}
          className="text-left p-4 rounded-xl border border-border bg-card hover:bg-muted/40 transition-colors shadow-sm cursor-pointer flex items-start gap-3.5"
        >
          <div className="p-2.5 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400 shrink-0">
            <Clock className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground truncate">Demandes en cours</p>
            <p className="text-2xl font-bold text-foreground tabular-nums mt-0.5">
              {kpiStats.pendingRequests}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1 truncate tabular-nums">
              {kpiStats.approvedRequests} approuvée{kpiStats.approvedRequests > 1 ? 's' : ''} · {kpiStats.rejectedRequests} rejetée{kpiStats.rejectedRequests > 1 ? 's' : ''}
            </p>
          </div>
        </button>

        {/* KPI 2 : Documents disponibles */}
        <button
          type="button"
          onClick={() => {
            setDocInitialFilter('all');
            setActiveTab('documents');
          }}
          className="text-left p-4 rounded-xl border border-border bg-card hover:bg-muted/40 transition-colors shadow-sm cursor-pointer flex items-start gap-3.5"
        >
          <div className="p-2.5 rounded-lg bg-primary/10 text-primary shrink-0">
            <FileText className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground truncate">Documents disponibles</p>
            <p className="text-2xl font-bold text-foreground tabular-nums mt-0.5">
              {kpiStats.documentsAvailable}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1 truncate tabular-nums">
              {kpiStats.signedAuthDocs} autorisation{kpiStats.signedAuthDocs > 1 ? 's' : ''} · {kpiStats.missionOrderDocs} ordre{kpiStats.missionOrderDocs > 1 ? 's' : ''} PDF
            </p>
          </div>
        </button>

        {/* KPI 3 : Missions actives */}
        <button
          type="button"
          onClick={() => {
            setDocInitialFilter('all');
            setActiveTab('documents');
          }}
          className="text-left p-4 rounded-xl border border-border bg-card hover:bg-muted/40 transition-colors shadow-sm cursor-pointer flex items-start gap-3.5"
        >
          <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
            <Compass className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground truncate">Missions actives</p>
            <p className="text-2xl font-bold text-foreground tabular-nums mt-0.5">
              {kpiStats.activeMissions}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1 truncate tabular-nums">
              Sur {currentAgentMissions.length} mission{currentAgentMissions.length > 1 ? 's' : ''} affectée{currentAgentMissions.length > 1 ? 's' : ''}
            </p>
          </div>
        </button>

        {/* KPI 4 : Notifications (temps réel onSnapshot) */}
        <button
          type="button"
          onClick={() => setIsNotificationsOpen(true)}
          className={cn(
            'text-left p-4 rounded-xl border bg-card hover:bg-muted/40 transition-colors shadow-sm cursor-pointer flex items-start gap-3.5 relative',
            kpiStats.totalNotifications > 0 ? 'border-emerald-500/40' : 'border-border'
          )}
        >
          <div
            className={cn(
              'p-2.5 rounded-lg shrink-0 relative',
              kpiStats.totalNotifications > 0
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                : 'bg-muted text-muted-foreground'
            )}
          >
            <Bell className="h-5 w-5" />
            {kpiStats.totalNotifications > 0 && (
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <p className="text-xs font-medium text-muted-foreground truncate">Notifications</p>
              <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 shrink-0">
                Temps réel
              </span>
            </div>
            <p className="text-2xl font-bold text-foreground tabular-nums mt-0.5">
              {kpiStats.totalNotifications}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1 truncate">
              {kpiStats.unreadRealtimeCount > 0
                ? `${kpiStats.unreadRealtimeCount} décision${kpiStats.unreadRealtimeCount > 1 ? 's' : ''} / signature${kpiStats.unreadRealtimeCount > 1 ? 's' : ''}`
                : 'Cliquer pour voir le flux'}
            </p>
          </div>
        </button>
      </div>

      {/* Priority Operational & Administrative Alerts */}
      {unacknowledgedReturnedAssignments.length > 0 && (
        <div className="space-y-3">
          {unacknowledgedReturnedAssignments.map((assignment) => {
            const weapon = weaponsById[assignment.weaponId];
            return (
              <Alert
                key={assignment.id}
                className="border-emerald-500/40 bg-emerald-500/5 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3">
                  <PackageCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <AlertTitle className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                      Notification de dépôt d&apos;équipement validée
                    </AlertTitle>
                    <AlertDescription className="text-xs text-emerald-900 dark:text-emerald-200">
                      Vous avez déposé l&apos;équipement{' '}
                      <span className="font-bold">{weapon?.model || 'Équipement'}</span> (N° Série :{' '}
                      {weapon?.serialNumber || 'N/A'}) le{' '}
                      {formatDate(assignment.returnedAt, 'datetime')}.
                    </AlertDescription>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDismissReturn(assignment.id)}
                  className="bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-semibold text-xs rounded-lg h-8 px-3 shrink-0 cursor-pointer"
                >
                  Accuser réception
                </Button>
              </Alert>
            );
          })}
        </div>
      )}

      {activeEquipmentAssignments.length > 0 && (
        <Alert
          variant="destructive"
          className="border-amber-500/40 bg-amber-500/5 rounded-xl p-4 flex flex-col gap-3"
        >
          <div className="flex items-start justify-between w-full gap-3">
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <AlertTitle className="text-sm font-bold text-amber-800 dark:text-amber-300 flex items-center gap-2">
                  <span>Dotation : Équipement en votre possession ({activeEquipmentAssignments.length})</span>
                </AlertTitle>
                <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
                  Vous détenez actuellement du matériel réglementaire non encore retourné.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsEquipmentCollapsed(!isEquipmentCollapsed)}
              className="text-amber-800 dark:text-amber-300 hover:bg-amber-500/10 font-semibold text-xs gap-1 cursor-pointer h-8 px-2.5 shrink-0"
            >
              <span>{isEquipmentCollapsed ? 'Voir' : 'Masquer'}</span>
              {isEquipmentCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
          </div>

          {!isEquipmentCollapsed && (
            <div className="border-t border-amber-500/15 pt-3 grid gap-3 sm:grid-cols-2">
              {activeEquipmentAssignments.map((assignment) => {
                const weapon = weaponsById[assignment.weaponId];
                return (
                  <div
                    key={assignment.id}
                    className="p-3 bg-background border border-amber-500/20 rounded-xl space-y-1 text-foreground text-xs"
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span>{weapon?.model || 'Équipement'}</span>
                      <span className="text-amber-700 dark:text-amber-400">
                        {weapon?.type || 'Matériel'}
                      </span>
                    </div>
                    <p className="text-muted-foreground font-mono">
                      N° Série : <strong className="text-foreground">{weapon?.serialNumber || 'N/A'}</strong>
                    </p>
                    <p className="text-muted-foreground font-mono">
                      Sortie le :{' '}
                      <strong className="text-foreground">{formatDate(assignment.assignedAt, 'datetime')}</strong>
                    </p>
                    {(assignment.ammunitionCount || 0) > 0 && (
                      <p className="text-muted-foreground">
                        Munitions : <strong className="text-emerald-600">{assignment.ammunitionCount}</strong>
                      </p>
                    )}
                    {assignment.notes && (
                      <p className="italic text-muted-foreground pt-1 border-t border-border">
                        Note : {assignment.notes}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Alert>
      )}

      {pendingExplications.length > 0 && (
        <div className="space-y-4">
          {pendingExplications.map((exp) => (
            <Card key={exp.id} className="border-destructive/40 bg-destructive/5 rounded-xl overflow-hidden">
              <CardHeader className="bg-destructive/10 pb-3 flex flex-row items-center gap-2">
                <HelpCircle className="h-5 w-5 text-destructive shrink-0" />
                <div>
                  <CardTitle className="text-base font-bold text-destructive">
                    DEMANDE D&apos;EXPLICATION REQUISE
                  </CardTitle>
                  <CardDescription className="text-xs text-destructive/80">
                    Une demande d&apos;explication vous a été adressée par la hiérarchie.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                <div className="bg-background p-3 rounded-lg border border-destructive/20 space-y-1">
                  <div className="text-xs text-muted-foreground font-mono">
                    Envoyée le {formatDate(exp.requestDate, 'date')} à {formatDate(exp.requestDate, 'time')}
                  </div>
                  <p className="font-semibold text-foreground text-sm">« {exp.requestText} »</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`reply-${exp.id}`} className="text-xs font-semibold">
                    Votre réponse explicative *
                  </Label>
                  <Textarea
                    id={`reply-${exp.id}`}
                    placeholder="Saisissez votre réponse détaillée..."
                    value={replies[exp.id] || ''}
                    onChange={(e) => setReplies((prev) => ({ ...prev, [exp.id]: e.target.value }))}
                    rows={3}
                    className="bg-background text-sm"
                    disabled={countdown[exp.id] > 0}
                  />
                </div>

                {countdown[exp.id] > 0 ? (
                  <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-orange-600 dark:text-orange-400 font-bold">
                      <Clock className="h-4 w-4 animate-spin shrink-0" />
                      <span>Envoi dans {countdown[exp.id]} secondes...</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCancelSend(exp.id)}
                        className="rounded-lg text-xs h-8 cursor-pointer"
                      >
                        Annuler et modifier
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleImmediateSend(exp.id)}
                        className="rounded-lg text-xs bg-orange-600 hover:bg-orange-700 text-white h-8 cursor-pointer"
                        disabled={replySubmitting[exp.id]}
                      >
                        Envoyer maintenant
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    onClick={() => handleReplyExplication(exp.id)}
                    className="rounded-lg gap-2 text-white bg-destructive hover:bg-destructive/90 cursor-pointer"
                    disabled={replySubmitting[exp.id] || !replies[exp.id]?.trim()}
                  >
                    <Send className="h-4 w-4" />
                    Envoyer ma réponse explicative
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {unnotifiedSanctions.length > 0 && (
        <div className="space-y-3">
          {unnotifiedSanctions.map((exp) => (
            <Card key={exp.id} className="border-orange-500/40 bg-orange-500/5 rounded-xl overflow-hidden">
              <CardHeader className="bg-orange-500/10 pb-3 flex flex-row items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-600 shrink-0" />
                <div>
                  <CardTitle className="text-base font-bold text-orange-800 dark:text-orange-300">
                    SANCTION ADMINISTRATIVE APPLIQUÉE
                  </CardTitle>
                  <CardDescription className="text-xs text-orange-700/80 dark:text-orange-400/80">
                    Décision prononcée suite à votre explication.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                <p className="font-bold text-foreground text-sm">« {exp.sanctionText} »</p>
                <Button
                  onClick={() => handleAcknowledgeSanction(exp.id)}
                  className="rounded-lg gap-1.5 font-semibold text-white bg-orange-600 hover:bg-orange-500 text-xs h-8 cursor-pointer"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Accuser réception
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {realtimeNotifications.some((n) => n.unread) && (
        <Card className="rounded-xl border border-primary/30 bg-card shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/40 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-bold text-foreground">
                Notifications temps réel ({realtimeNotifications.filter((n) => n.unread).length})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsNotificationsOpen(true)}
                className="h-7 text-xs cursor-pointer"
              >
                Tout voir
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleMarkAllNotificationsRead}
                className="h-7 text-xs gap-1 cursor-pointer text-primary hover:text-primary"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Tout marquer lu
              </Button>
            </div>
          </div>
          <div className="p-3 space-y-2">
            {realtimeNotifications
              .filter((n) => n.unread)
              .slice(0, 3)
              .map((notif) => (
                <div
                  key={notif.id}
                  className={cn(
                    'flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border text-xs',
                    notif.kind === 'approved' && 'border-emerald-500/30 bg-emerald-500/5',
                    notif.kind === 'rejected' && 'border-destructive/30 bg-destructive/5',
                    notif.kind === 'signed' && 'border-blue-500/30 bg-blue-500/5'
                  )}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    {notif.kind === 'approved' && (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    )}
                    {notif.kind === 'rejected' && (
                      <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    )}
                    {notif.kind === 'signed' && (
                      <FileSignature className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <p className="font-bold text-foreground">{notif.title}</p>
                      <p className="text-muted-foreground mt-0.5">{notif.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {notif.kind === 'signed' && notif.pdfDoc && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          handleDownloadPdfFromNotification(notif.pdfDoc!);
                          handleMarkNotificationRead(notif);
                        }}
                        className="h-7 text-xs gap-1 border-blue-500/30 text-blue-600 hover:bg-blue-500/10 cursor-pointer"
                      >
                        <FileDown className="h-3.5 w-3.5" />
                        PDF
                      </Button>
                    )}
                    {notif.kind === 'approved' && notif.demande && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          generateAutorisationAbsencePDF(notif.demande!, currentAgent);
                          handleMarkNotificationRead(notif);
                        }}
                        className="h-7 text-xs gap-1 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 cursor-pointer"
                      >
                        <FileDown className="h-3.5 w-3.5" />
                        Autorisation
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => handleMarkNotificationRead(notif)}
                      className="h-7 text-xs cursor-pointer"
                    >
                      Lu
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        </Card>
      )}

      {expiringSoonDemandes.length > 0 && (
        <div className="space-y-3">
          {expiringSoonDemandes.map((dem) => {
            const end = safeToDate(dem.endDate);
            const diffDays = end ? Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0;
            return (
              <Alert
                key={dem.id}
                className="border-amber-500/40 bg-amber-500/5 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3">
                  <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <AlertTitle className="text-sm font-bold text-amber-800 dark:text-amber-300">
                      Permission {dem.type} arrivant à échéance
                    </AlertTitle>
                    <AlertDescription className="text-xs text-amber-900 dark:text-amber-200">
                      Échéance le <strong>{formatDate(dem.endDate, 'date')}</strong> (
                      {diffDays <= 0 ? "aujourd'hui" : diffDays === 1 ? 'demain' : `dans ${diffDays} jours`}).
                    </AlertDescription>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleRequestExtension(dem)}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs rounded-lg h-8 px-3 shrink-0 gap-1.5 cursor-pointer"
                >
                  <Send className="h-3.5 w-3.5" />
                  Demander une prolongation
                </Button>
              </Alert>
            );
          })}
        </div>
      )}

      {/* Segmented Navigation Tabs (Replaces giant stacked scroll layout) */}
      <div className="bg-muted p-1 rounded-xl flex flex-wrap gap-1 border border-border">
        <button
          type="button"
          onClick={() => setActiveTab('demandes')}
          className={cn(
            'flex-1 min-w-[140px] px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors cursor-pointer flex items-center justify-center gap-2',
            activeTab === 'demandes'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Calendar className="h-4 w-4" />
          <span>Demandes &amp; Suivi</span>
          <span className="text-xs text-muted-foreground tabular-nums">({sortedDemandes.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('documents')}
          className={cn(
            'flex-1 min-w-[160px] px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors cursor-pointer flex items-center justify-center gap-2',
            activeTab === 'documents'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <FileText className="h-4 w-4" />
          <span>Documents &amp; Missions</span>
          <span className="text-xs text-muted-foreground tabular-nums">({currentAgentMissions.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('autorisations')}
          className={cn(
            'flex-1 min-w-[140px] px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors cursor-pointer flex items-center justify-center gap-2',
            activeTab === 'autorisations'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <CheckCircle2 className="h-4 w-4" />
          <span>Autorisations PDF</span>
          <span className="text-xs text-muted-foreground tabular-nums">({acceptedDemandes.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('explications')}
          className={cn(
            'flex-1 min-w-[130px] px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors cursor-pointer flex items-center justify-center gap-2',
            activeTab === 'explications'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <HelpCircle className="h-4 w-4" />
          <span>Explications</span>
          {pendingExplications.length > 0 ? (
            <Badge variant="destructive" className="h-5 px-1.5 text-[10px] tabular-nums">
              {pendingExplications.length}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground tabular-nums">({explications.length})</span>
          )}
        </button>
      </div>

      {/* TAB 1: Demandes & Suivi */}
      {activeTab === 'demandes' && (
        <div className="grid gap-6 md:grid-cols-3 items-start">
          {/* New Request Form */}
          <Card id="new-request-form" className="md:col-span-1 rounded-xl border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Nouvelle demande
              </CardTitle>
              <CardDescription className="text-xs">
                Formulez une demande de permission ou de congé.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="permission-type">Type de permission *</Label>
                  <select
                    ref={formTypeRef}
                    id="permission-type"
                    value={permissionType}
                    onChange={(e) => setPermissionType(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    required
                  >
                    <option value="Permission exceptionnelle">Permission exceptionnelle</option>
                    <option value="Prolongation de permission">Prolongation de permission</option>
                    <option value="Congé annuel">Congé annuel</option>
                    <option value="Congé maladie">Congé maladie</option>
                    <option value="Récupération">Récupération</option>
                    <option value="Autre">Autre</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="start-date">Début *</Label>
                    <Input
                      id="start-date"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="end-date">Fin *</Label>
                    <Input
                      id="end-date"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="reason">Motif *</Label>
                  <Textarea
                    id="reason"
                    placeholder="Justification ou motif de votre absence..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={4}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="demande-attachment">
                    Pièce jointe <span className="font-normal text-muted-foreground">(facultatif)</span>
                  </Label>
                  <input
                    ref={attachmentInputRef}
                    id="demande-attachment"
                    type="file"
                    accept="image/*,application/pdf"
                    className="sr-only"
                    onChange={(e) => setAttachmentFile(e.target.files?.[0] ?? null)}
                  />
                  {attachmentFile ? (
                    <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs">
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1 truncate font-medium" title={attachmentFile.name}>
                        {attachmentFile.name}
                      </span>
                      <span className="shrink-0 text-muted-foreground tabular-nums">
                        {Math.max(1, Math.round(attachmentFile.size / 1024))} Ko
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setAttachmentFile(null);
                          if (attachmentInputRef.current) attachmentInputRef.current.value = '';
                        }}
                        className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                        aria-label="Retirer la pièce jointe"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => attachmentInputRef.current?.click()}
                      className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed px-3 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
                    >
                      <Paperclip className="h-3.5 w-3.5" />
                      Joindre un justificatif (image ou PDF)
                    </button>
                  )}
                  <p className="text-[11px] text-muted-foreground">Certificat médical, convocation… PDF de 700 Ko maximum.</p>
                </div>

                <Button
                  type="submit"
                  className="w-full rounded-xl flex items-center justify-center gap-2 font-semibold text-white cursor-pointer"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <span>Transmission...</span>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Envoyer la demande
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Requests History Card with Filters & Pagination */}
          <Card className="md:col-span-2 rounded-xl border border-border shadow-sm">
            <CardHeader className="space-y-3 border-b border-border pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-lg font-bold">Suivi de mes demandes</CardTitle>
                  <CardDescription className="text-xs">
                    Historique et statut de vos demandes de permissions.
                  </CardDescription>
                </div>
                <span className="text-xs font-medium text-muted-foreground tabular-nums">
                  {filteredDemandes.length} résultat{filteredDemandes.length > 1 ? 's' : ''}
                </span>
              </div>

              {sortedDemandes.length > 0 && (
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Rechercher par type ou motif..."
                      value={demandeSearch}
                      onChange={(e) => {
                        setDemandeSearch(e.target.value);
                        setDemandesPage(1);
                      }}
                      className="pl-8 h-9 text-xs"
                    />
                  </div>
                  <select
                    value={demandeStatusFilter}
                    onChange={(e) => {
                      setDemandeStatusFilter(e.target.value as DemandeStatusFilter);
                      setDemandesPage(1);
                    }}
                    aria-label="Filtrer par statut"
                    className="h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground"
                  >
                    <option value="all">Tous les statuts</option>
                    <option value="en_attente">En attente</option>
                    <option value="acceptee">Acceptées</option>
                    <option value="refusee">Refusées</option>
                  </select>
                </div>
              )}
            </CardHeader>

            <CardContent className="p-4 space-y-4">
              {demandesLoading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                  <Loader2 className="h-7 w-7 animate-spin text-primary" />
                  <p className="text-xs font-medium">Chargement de l’historique...</p>
                </div>
              ) : sortedDemandes.length === 0 ? (
                <div className="text-center py-14 px-4 border border-dashed border-border rounded-xl bg-muted/20">
                  <Calendar className="h-10 w-10 mx-auto text-primary/40 mb-3" />
                  <p className="font-semibold text-foreground text-sm">
                    Aucune demande pour le moment.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                    Soumettez votre première demande de permission ou de congé pour suivre son traitement ici.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    onClick={focusCreateDemandeForm}
                    className="mt-4 gap-1.5 rounded-xl font-semibold text-white cursor-pointer"
                  >
                    <PlusCircle className="h-4 w-4" />
                    Créer ma première demande
                  </Button>
                </div>
              ) : paginatedDemandes.length === 0 ? (
                <div className="text-center py-10 border border-dashed border-border rounded-xl text-muted-foreground">
                  <p className="text-sm font-medium text-foreground">
                    Aucune demande ne correspond à ce filtre.
                  </p>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={() => {
                      setDemandeStatusFilter('all');
                      setDemandeSearch('');
                      setDemandesPage(1);
                    }}
                    className="mt-1 text-xs cursor-pointer"
                  >
                    Afficher toutes mes demandes
                  </Button>
                </div>
              ) : (
                <>
                  <div className="rounded-xl border border-border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          <TableHead>Période</TableHead>
                          <TableHead>Motif</TableHead>
                          <TableHead>Statut</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedDemandes.map((dem) => (
                          <TableRow key={dem.id} className="hover:bg-muted/30">
                            <TableCell className="font-medium text-xs sm:text-sm">{dem.type}</TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                              {formatDate(dem.startDate, 'date')} au <br />
                              {formatDate(dem.endDate, 'date')}
                            </TableCell>
                            <TableCell className="max-w-[180px] truncate text-xs" title={dem.reason}>
                              {dem.reason ? (
                                <span className="italic">« {dem.reason} »</span>
                              ) : (
                                <span className="text-muted-foreground italic">Aucun motif</span>
                              )}
                              {dem.attachment && (
                                <div className="mt-1">
                                  <DemandeAttachmentButton demandeId={dem.id} name={dem.attachment.name} />
                                </div>
                              )}
                              {dem.status === 'refusee' && dem.comment && (
                                <div className="text-xs text-destructive mt-1 bg-destructive/10 p-1 rounded border border-destructive/20 font-sans">
                                  <strong>Refus :</strong> {dem.comment}
                                </div>
                              )}
                              {dem.status === 'acceptee' && dem.comment && (
                                <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 bg-emerald-500/10 p-1 rounded border border-emerald-500/20 font-sans">
                                  <strong>Note :</strong> {dem.comment}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>{getStatusBadge(dem.status)}</TableCell>
                            <TableCell className="text-right">
                              {dem.status === 'acceptee' ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    const targetAgent =
                                      currentAgent;
                                    generateAutorisationAbsencePDF(dem, targetAgent);
                                  }}
                                  className="text-xs h-8 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 font-semibold gap-1 cursor-pointer"
                                  title="Télécharger l'autorisation (PDF)"
                                >
                                  <FileDown className="h-3.5 w-3.5" />
                                  <span>PDF</span>
                                </Button>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {filteredDemandes.length > DEMANDES_PAGE_SIZE && (
                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                      <span className="tabular-nums">
                        Page {safeDemandesPage} sur {totalDemandesPages}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 px-2.5 text-xs gap-1 cursor-pointer"
                          disabled={safeDemandesPage <= 1}
                          onClick={() => setDemandesPage((p) => Math.max(1, p - 1))}
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                          Précédent
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 px-2.5 text-xs gap-1 cursor-pointer"
                          disabled={safeDemandesPage >= totalDemandesPages}
                          onClick={() => setDemandesPage((p) => Math.min(totalDemandesPages, p + 1))}
                        >
                          Suivant
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 2: Documents PDF & Ordres de mission (Lazy Loaded) */}
      {activeTab === 'documents' && (
        <div className="space-y-4">
          <AgentSignedOrders orders={signedOrders} isLoading={signedOrdersLoading} />
          <LazyPdfHistoryViewer
            currentAgentId={currentAgent?.id}
            currentAgentRegistrationNumber={currentAgent?.registrationNumber}
            title="Mes autres documents PDF"
            description="Recherchez, filtrez par date ou type et téléchargez vos documents officiels."
            initialTypeFilter={docInitialFilter}
          />
        </div>
      )}

      {/* TAB 3: Autorisations PDF signées */}
      {activeTab === 'autorisations' && (
        <Card className="rounded-xl border border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-4">
            <div>
              <CardTitle className="text-lg font-bold flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
                Mes autorisations d&apos;absence signées (PDF)
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Téléchargez à tout moment vos fiches d&apos;autorisation d&apos;absence approuvées.
              </CardDescription>
            </div>
            {acceptedDemandes.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs text-destructive hover:bg-destructive/10 gap-1 px-2.5 cursor-pointer rounded-lg"
                onClick={handleClearAllAcceptedDemandes}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Vider tout</span>
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            {acceptedDemandes.length > 0 ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {paginatedAuthorizations.map((dem) => (
                    <div
                      key={dem.id}
                      className="p-4 rounded-xl border border-border bg-card hover:bg-muted/20 transition-colors flex flex-col justify-between gap-3 shadow-sm"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-xs text-emerald-600 dark:text-emerald-400">
                            {dem.type}
                          </span>
                          <div className="flex items-center gap-1">
                            <span className="text-[11px] text-muted-foreground font-mono tabular-nums">
                              {formatDate(dem.startDate, 'date')}
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10 cursor-pointer rounded-md"
                              title="Supprimer cette autorisation"
                              onClick={() => handleDeleteDemande(dem.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        <p className="text-xs font-semibold mt-2 text-foreground truncate" title={dem.reason}>
                          Motif : « {dem.reason || 'N/A'} »
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                          Du {formatDate(dem.startDate, 'date')} au {formatDate(dem.endDate, 'date')}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => {
                          const targetAgent =
                            currentAgent;
                          generateAutorisationAbsencePDF(dem, targetAgent);
                        }}
                        className="w-full text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white gap-2 cursor-pointer"
                      >
                        <FileDown className="h-4 w-4" />
                        Télécharger l&apos;autorisation (PDF)
                      </Button>
                    </div>
                  ))}
                </div>

                {acceptedDemandes.length > AUTH_PAGE_SIZE && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
                    <span className="tabular-nums">
                      Page {safeAuthPage} sur {totalAuthPages}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-2.5 text-xs gap-1 cursor-pointer"
                        disabled={safeAuthPage <= 1}
                        onClick={() => setAuthPage((p) => Math.max(1, p - 1))}
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        Précédent
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-2.5 text-xs gap-1 cursor-pointer"
                        disabled={safeAuthPage >= totalAuthPages}
                        onClick={() => setAuthPage((p) => Math.min(totalAuthPages, p + 1))}
                      >
                        Suivant
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-10 text-muted-foreground border border-dashed border-border rounded-xl">
                <Clock className="h-8 w-8 mx-auto opacity-30 mb-2" />
                <p className="text-sm font-medium text-foreground">
                  Aucune autorisation d&apos;absence signée pour le moment.
                </p>
                <p className="text-xs mt-1">
                  Vos autorisations approuvées seront disponibles ici en téléchargement PDF.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB 4: Explications */}
      {activeTab === 'explications' && (
        <Card className="rounded-xl border border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-4">
            <div>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-orange-600" />
                Historique de mes demandes d&apos;explication
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Demandes d&apos;explications adressées, réponses transmises et décisions administratives.
              </CardDescription>
            </div>
            {explications.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs text-destructive hover:bg-destructive/10 gap-1 px-2.5 cursor-pointer rounded-lg"
                onClick={handleClearAllExplications}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Vider tout</span>
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            {sortedExplications.length > 0 ? (
              <>
                <div className="space-y-3">
                  {paginatedExplications.map((exp) => {
                    const reqDate = safeToDate(exp.requestDate);
                    const repDate = safeToDate(exp.replyDate);
                    const sancDate = safeToDate(exp.sanctionDate);

                    return (
                      <div
                        key={exp.id}
                        className="p-4 rounded-xl border border-border bg-card text-xs space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-2">
                          <span className="text-muted-foreground font-mono tabular-nums">
                            Reçue le {reqDate ? reqDate.toLocaleDateString('fr-FR') : 'N/A'} à{' '}
                            {reqDate
                              ? reqDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                              : 'N/A'}
                          </span>
                          <div className="flex items-center gap-2">
                            {exp.status === 'en_attente' && (
                              <Badge variant="outline" className="text-orange-600 bg-orange-500/10 border-orange-500/20">
                                En attente de réponse
                              </Badge>
                            )}
                            {exp.status === 'repondu' && (
                              <Badge variant="secondary" className="text-blue-600 bg-blue-500/10 border-blue-500/20">
                                Répondu - En attente d&apos;arbitrage
                              </Badge>
                            )}
                            {(exp.status === 'lu' || exp.status === 'archive' || exp.status === 'accepte') && (
                              <Badge variant="outline" className="text-emerald-600 bg-emerald-500/10 border-emerald-500/20">
                                Pris acte (Sans sanction)
                              </Badge>
                            )}
                            {exp.status === 'sanctionne' && (
                              <Badge variant="destructive" className="font-bold">
                                Sanctionné
                              </Badge>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10 cursor-pointer rounded-md"
                              title="Supprimer"
                              onClick={() => handleDeleteExplication(exp.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>

                        <div>
                          <div className="font-semibold text-muted-foreground mb-1">
                            Motif de l&apos;administration :
                          </div>
                          <p className="font-medium bg-muted/40 p-2.5 rounded border border-border">
                            « {exp.requestText} »
                          </p>
                        </div>

                        {exp.replyText ? (
                          <div className="pt-2 border-t border-dashed border-border">
                            <div className="font-semibold text-primary mb-1">Votre réponse :</div>
                            <p className="italic bg-primary/5 p-2.5 rounded border border-primary/10">
                              « {exp.replyText} »
                            </p>
                            {repDate && (
                              <div className="text-[11px] text-muted-foreground text-right font-mono mt-1 tabular-nums">
                                Envoyée le {repDate.toLocaleDateString('fr-FR')} à{' '}
                                {repDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-orange-600 font-medium italic">
                            Vous n&apos;avez pas encore répondu à cette demande d&apos;explication.
                          </div>
                        )}

                        {exp.status === 'sanctionne' && exp.sanctionText && (
                          <div className="bg-orange-500/10 p-3 rounded-lg border border-orange-500/20 space-y-1">
                            <div className="text-[10px] text-orange-700 dark:text-orange-400 font-bold uppercase tracking-wider flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Sanction prononcée :
                            </div>
                            <p className="font-bold text-foreground text-sm">« {exp.sanctionText} »</p>
                            {sancDate && (
                              <div className="text-[10px] text-muted-foreground font-mono text-right tabular-nums">
                                Prononcée le {sancDate.toLocaleDateString('fr-FR')}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {sortedExplications.length > EXPL_PAGE_SIZE && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
                    <span className="tabular-nums">
                      Page {safeExplPage} sur {totalExplPages}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-2.5 text-xs gap-1 cursor-pointer"
                        disabled={safeExplPage <= 1}
                        onClick={() => setExplicationsPage((p) => Math.max(1, p - 1))}
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        Précédent
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-2.5 text-xs gap-1 cursor-pointer"
                        disabled={safeExplPage >= totalExplPages}
                        onClick={() => setExplicationsPage((p) => Math.min(totalExplPages, p + 1))}
                      >
                        Suivant
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12 border border-dashed border-border rounded-xl text-muted-foreground">
                <HelpCircle className="h-10 w-10 mx-auto opacity-30 mb-2" />
                <p className="font-semibold text-foreground text-sm">Aucun historique d&apos;explications</p>
                <p className="text-xs mt-1">
                  Vous n&apos;avez aucune demande d&apos;explication enregistrée dans votre dossier.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Real-time Notifications Center Modal */}
      <Dialog open={isNotificationsOpen} onOpenChange={setIsNotificationsOpen}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Bell className="h-5 w-5 text-primary" />
              Centre de notifications temps réel
            </DialogTitle>
            <DialogDescription className="text-xs">
              Alertes instantanées (Firebase onSnapshot) pour vos demandes approuvées, rejetées et documents signés.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 py-2">
            {realtimeNotifications.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-border rounded-xl text-muted-foreground">
                <Bell className="h-8 w-8 mx-auto opacity-30 mb-2" />
                <p className="text-sm font-medium text-foreground">
                  Aucune notification pour le moment.
                </p>
                <p className="text-xs mt-1">
                  Vous serez averti en temps réel dès qu&apos;une demande est approuvée, rejetée ou signée.
                </p>
              </div>
            ) : (
              realtimeNotifications.map((notif) => (
                <div
                  key={notif.id}
                  className={cn(
                    'p-3.5 rounded-xl border transition-colors text-xs space-y-2',
                    notif.unread ? 'bg-muted/40 border-primary/30' : 'bg-card border-border opacity-80'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      {notif.kind === 'approved' && (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      )}
                      {notif.kind === 'rejected' && (
                        <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                      )}
                      {notif.kind === 'signed' && (
                        <FileSignature className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-bold text-foreground">{notif.title}</span>
                          {notif.unread && (
                            <Badge className="h-4 px-1.5 text-[10px] bg-primary text-white">
                              Nouveau
                            </Badge>
                          )}
                        </div>
                        <p className="text-muted-foreground mt-0.5">{notif.description}</p>
                        <p className="text-[11px] text-muted-foreground/80 font-mono tabular-nums mt-1">
                          {notif.timestamp.toLocaleDateString('fr-FR')} à{' '}
                          {notif.timestamp.toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    {notif.kind === 'signed' && notif.pdfDoc && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          handleDownloadPdfFromNotification(notif.pdfDoc!);
                          handleMarkNotificationRead(notif);
                        }}
                        className="h-7 text-xs gap-1 border-blue-500/30 text-blue-600 hover:bg-blue-500/10 cursor-pointer"
                      >
                        <FileDown className="h-3.5 w-3.5" />
                        Télécharger PDF
                      </Button>
                    )}
                    {notif.kind === 'approved' && notif.demande && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          generateAutorisationAbsencePDF(notif.demande!, currentAgent);
                          handleMarkNotificationRead(notif);
                        }}
                        className="h-7 text-xs gap-1 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 cursor-pointer"
                      >
                        <FileDown className="h-3.5 w-3.5" />
                        Autorisation PDF
                      </Button>
                    )}
                    {notif.unread && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => handleMarkNotificationRead(notif)}
                        className="h-7 text-xs cursor-pointer"
                      >
                        Marquer comme lu
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <DialogFooter className="flex flex-row items-center justify-between gap-2 border-t border-border pt-3">
            {realtimeNotifications.some((n) => n.unread) ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleMarkAllNotificationsRead}
                className="text-xs gap-1.5 cursor-pointer"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Tout marquer comme lu
              </Button>
            ) : (
              <span />
            )}
            <Button
              type="button"
              size="sm"
              onClick={() => setIsNotificationsOpen(false)}
              className="text-xs text-white cursor-pointer"
            >
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
