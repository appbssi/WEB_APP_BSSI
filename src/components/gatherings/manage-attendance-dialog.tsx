'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { doc, updateDoc } from 'firebase/firestore';
import { useFirestore, errorEmitter } from '@/firebase';
import { FirestorePermissionError } from '@/firebase/errors';
import type { Agent, Gathering } from '@/lib/types';
import { logActivity } from '@/lib/activity-logger';
import { parseScannedAgentData } from '@/lib/agent-qrcode';
import jsQR from 'jsqr';
import Image from 'next/image';
import {
  Loader2,
  Check,
  QrCode,
  Camera,
  Upload,
  Search,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  UserCheck,
  UserX,
  Users,
  User,
  RefreshCw,
  Pause,
  Play,
  ListChecks,
} from 'lucide-react';

interface ManageAttendanceDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  gathering: Gathering;
  agents: Agent[];
  initialTab?: 'scanner' | 'list';
}

interface ScanFeedback {
  status: 'success' | 'already_present' | 'not_designated' | 'unknown';
  agent?: Agent;
  message: string;
  time?: string;
}

export function ManageAttendanceDialog({
  isOpen,
  onOpenChange,
  gathering,
  agents,
  initialTab = 'scanner',
}: ManageAttendanceDialogProps) {
  const { toast } = useToast();
  const firestore = useFirestore();

  const [activeTab, setActiveTab] = useState<'scanner' | 'list'>(initialTab);
  const [scanMode, setScanMode] = useState<'camera' | 'upload' | 'manual'>('camera');
  const [absentAgentIds, setAbsentAgentIds] = useState<string[]>(gathering.absentAgentIds || []);
  const [attendanceTimestamps, setAttendanceTimestamps] = useState<Record<string, string>>(
    gathering.attendanceTimestamps || {}
  );
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Camera & QR scanner states
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraPaused, setCameraPaused] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualText, setManualText] = useState('');
  const [scanFeedback, setScanFeedback] = useState<ScanFeedback | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastScannedRef = useRef<{ value: string; time: number } | null>(null);

  // Sync state when gathering or dialog open state changes
  useEffect(() => {
    if (isOpen) {
      setAbsentAgentIds(gathering.absentAgentIds || []);
      setAttendanceTimestamps(gathering.attendanceTimestamps || {});
      setHasUnsavedChanges(false);
      setActiveTab(initialTab);
      setScanFeedback(null);
      setManualText('');
      setSearchQuery('');
      setCameraPaused(false);
      lastScannedRef.current = null;
    }
  }, [isOpen, gathering.id, initialTab, gathering.absentAgentIds, gathering.attendanceTimestamps]);

  const assignedAgents = useMemo(() => {
    const agentMap = new Map(agents.map((agent) => [agent.id, agent]));
    return (gathering.assignedAgentIds || [])
      .map((id) => agentMap.get(id))
      .filter((agent): agent is Agent => !!agent)
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [agents, gathering.assignedAgentIds]);

  const assignedIdSet = useMemo(
    () => new Set(assignedAgents.map((a) => a.id)),
    [assignedAgents]
  );

  const absentSet = useMemo(() => new Set(absentAgentIds), [absentAgentIds]);

  const stats = useMemo(() => {
    const total = assignedAgents.length;
    const absent = assignedAgents.filter((a) => absentSet.has(a.id)).length;
    const present = total - absent;
    const qrVerified = assignedAgents.filter(
      (a) => !absentSet.has(a.id) && !!attendanceTimestamps[a.id]
    ).length;
    const unscannedPresent = present - qrVerified;
    const progress = total > 0 ? Math.round((present / total) * 100) : 0;
    return { total, absent, present, qrVerified, unscannedPresent, progress };
  }, [assignedAgents, absentSet, attendanceTimestamps]);

  const filteredAgents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return assignedAgents;
    return assignedAgents.filter(
      (a) =>
        a.fullName.toLowerCase().includes(q) ||
        (a.registrationNumber || '').toLowerCase().includes(q) ||
        (a.rank || '').toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q)
    );
  }, [assignedAgents, searchQuery]);

  // Audio feedback
  const playFeedbackTone = useCallback((type: 'success' | 'error') => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      if (type === 'success') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        osc.frequency.setValueAtTime(1174.66, audioCtx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.14, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.22);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.22);
      } else {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(240, audioCtx.currentTime);
        osc.frequency.setValueAtTime(180, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.28);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.28);
      }
    } catch {
      // AudioContext unsupported or blocked
    }
  }, []);

  // Process a scanned QR value
  const processScannedCode = useCallback(
    (rawString: string, fromCamera = false) => {
      const trimmed = rawString.trim();
      if (!trimmed) return;

      // Cooldown of 2.5s for identical code during continuous camera scanning
      if (fromCamera && lastScannedRef.current) {
        const elapsed = Date.now() - lastScannedRef.current.time;
        if (lastScannedRef.current.value === trimmed && elapsed < 2500) {
          return;
        }
      }
      lastScannedRef.current = { value: trimmed, time: Date.now() };

      const parsed = parseScannedAgentData(trimmed);

      // Search across all brigade agents so we can identify non-designated agents clearly
      const foundAgent = agents.find((a) => {
        if (parsed.agentId && a.id.toLowerCase() === parsed.agentId.toLowerCase()) return true;
        if (
          parsed.matricule &&
          a.registrationNumber &&
          a.registrationNumber.trim().toLowerCase() === parsed.matricule.trim().toLowerCase()
        ) {
          return true;
        }
        if (a.id.toLowerCase() === trimmed.toLowerCase()) return true;
        if (
          a.registrationNumber &&
          a.registrationNumber.trim().toLowerCase() === trimmed.toLowerCase()
        ) {
          return true;
        }
        if (a.id.substring(0, 6).toUpperCase() === trimmed.toUpperCase()) return true;
        return false;
      });

      if (!foundAgent) {
        playFeedbackTone('error');
        setScanFeedback({
          status: 'unknown',
          message: `Code QR non reconnu (${trimmed.substring(0, 40)}${trimmed.length > 40 ? '...' : ''}).`,
        });
        return;
      }

      if (!assignedIdSet.has(foundAgent.id)) {
        playFeedbackTone('error');
        setScanFeedback({
          status: 'not_designated',
          agent: foundAgent,
          message: `${foundAgent.fullName} n'est pas désigné(e) pour ce rassemblement.`,
        });
        return;
      }

      const nowIso = new Date().toISOString();
      const timeLabel = new Date().toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      const wasAbsent = absentAgentIds.includes(foundAgent.id);
      const wasAlreadyQrChecked = !wasAbsent && !!attendanceTimestamps[foundAgent.id];

      // Mark agent as present and record check-in timestamp
      setAbsentAgentIds((prev) => prev.filter((id) => id !== foundAgent.id));
      setAttendanceTimestamps((prev) => ({
        ...prev,
        [foundAgent.id]: prev[foundAgent.id] || nowIso,
      }));
      setHasUnsavedChanges(true);
      playFeedbackTone('success');

      setScanFeedback({
        status: wasAlreadyQrChecked ? 'already_present' : 'success',
        agent: foundAgent,
        message: wasAlreadyQrChecked
          ? `Présence déjà pointée par QR.`
          : `Présence pointée avec succès !`,
        time: timeLabel,
      });
    },
    [agents, assignedIdSet, absentAgentIds, attendanceTimestamps, playFeedbackTone]
  );

  // Stop camera cleanly
  const stopCamera = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  // Continuous scan loop
  const scanFrame = useCallback(() => {
    if (cameraPaused) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      animFrameRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      animFrameRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert',
    });

    if (code && code.data) {
      processScannedCode(code.data, true);
    }

    animFrameRef.current = requestAnimationFrame(scanFrame);
  }, [cameraPaused, processScannedCode]);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
        setCameraActive(true);
        animFrameRef.current = requestAnimationFrame(scanFrame);
      }
    } catch (err: unknown) {
      const errorObj = err as { name?: string };
      setCameraError(
        errorObj?.name === 'NotAllowedError'
          ? "Accès à la caméra refusé. Autorisez la caméra dans votre navigateur, importez une image ou utilisez la saisie manuelle."
          : "Caméra indisponible sur cet appareil. Utilisez l'import d'image ou la saisie du matricule / douchette."
      );
      setCameraActive(false);
    }
  }, [scanFrame]);

  useEffect(() => {
    if (isOpen && activeTab === 'scanner' && scanMode === 'camera' && !cameraPaused) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, activeTab, scanMode, cameraPaused, startCamera, stopCamera]);

  // Image upload decoding
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, img.width, img.height);
        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code && code.data) {
          processScannedCode(code.data, false);
        } else {
          playFeedbackTone('error');
          setScanFeedback({
            status: 'unknown',
            message: 'Aucun code QR détecté dans cette image.',
          });
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualText.trim()) return;
    processScannedCode(manualText.trim(), false);
    setManualText('');
  };

  // Toggle single agent presence manually
  const toggleAgentPresence = (agentId: string) => {
    setAbsentAgentIds((prev) => {
      if (prev.includes(agentId)) {
        return prev.filter((id) => id !== agentId);
      }
      return [...prev, agentId];
    });
    setHasUnsavedChanges(true);
  };

  // Initialize roll call: mark all designated agents absent so scans check them in
  const handleMarkAllAbsent = () => {
    setAbsentAgentIds(assignedAgents.map((a) => a.id));
    setAttendanceTimestamps({});
    setScanFeedback(null);
    setHasUnsavedChanges(true);
    toast({
      title: 'Appel initialisé',
      description: 'Tous les agents désignés sont en attente (absents). Scannez leurs QR codes pour pointer leur présence.',
    });
  };

  // Mark remaining unscanned agents as absent
  const handleMarkUnscannedAbsent = () => {
    const unscannedIds = assignedAgents
      .filter((a) => !attendanceTimestamps[a.id])
      .map((a) => a.id);
    setAbsentAgentIds(unscannedIds);
    setHasUnsavedChanges(true);
    toast({
      title: 'Agents non scannés marqués absents',
      description: `${unscannedIds.length} agent(s) sans pointage QR ont été marqués absents.`,
    });
  };

  // Mark all present
  const handleMarkAllPresent = () => {
    setAbsentAgentIds([]);
    setHasUnsavedChanges(true);
  };

  // Persist to Firestore
  const handleSave = async () => {
    if (!firestore) return;
    setIsSubmitting(true);

    const gatheringRef = doc(firestore, 'gatherings', gathering.id);
    const updateData = {
      absentAgentIds,
      attendanceTimestamps,
    };

    try {
      await updateDoc(gatheringRef, updateData);
      toast({
        title: 'Présences enregistrées !',
        description: `${stats.present} présent(s) et ${stats.absent} absent(s) enregistrés pour "${gathering.name}".`,
      });
      logActivity(
        firestore,
        `Les présences pour le rassemblement "${gathering.name}" ont été mises à jour (${stats.present}/${stats.total} présents).`,
        'Rassemblement',
        '/gatherings'
      );
      stopCamera();
      setHasUnsavedChanges(false);
      onOpenChange(false);
    } catch {
      const permissionError = new FirestorePermissionError({
        path: gatheringRef.path,
        operation: 'update',
        requestResourceData: updateData,
      });
      errorEmitter.emit('permission-error', permissionError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatShortTime = (iso?: string) => {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return null;
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) stopCamera();
        onOpenChange(open);
      }}
    >
      <DialogContent
        className="w-[calc(100vw-1.5rem)] sm:max-w-3xl max-h-[92dvh] flex flex-col p-0 overflow-hidden bg-background border shadow-2xl"
        onInteractOutside={(e) => {
          if (hasUnsavedChanges) e.preventDefault();
        }}
      >
        {/* Header */}
        <DialogHeader className="p-4 sm:p-5 pb-3 bg-gradient-to-r from-slate-900 via-[#1a2b4c] to-slate-900 text-white shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-white/10 rounded-xl shrink-0">
                <QrCode className="h-5 w-5 text-amber-400" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base sm:text-lg font-bold text-white truncate">
                  Gérer les présences — {gathering.name}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-300">
                  Pointez les agents désignés par scan de leur badge QR ou manuellement.
                </DialogDescription>
              </div>
            </div>

            {/* Live Counters */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <Badge className="bg-white/15 hover:bg-white/20 text-white border-0 gap-1 text-xs">
                <Users className="h-3.5 w-3.5" />
                <span>{stats.total} désignés</span>
              </Badge>
              <Badge className="bg-emerald-500/25 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-400/30 gap-1 text-xs">
                <UserCheck className="h-3.5 w-3.5" />
                <span>{stats.present} présents</span>
              </Badge>
              <Badge className="bg-rose-500/25 hover:bg-rose-500/30 text-rose-200 border border-rose-400/30 gap-1 text-xs">
                <UserX className="h-3.5 w-3.5" />
                <span>{stats.absent} absents</span>
              </Badge>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-3 space-y-1">
            <div className="flex items-center justify-between text-[11px] text-slate-300">
              <span>Progression de l&apos;appel ({stats.qrVerified} pointé(s) par QR)</span>
              <span className="font-bold text-white">{stats.progress}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 to-teal-300 transition-all duration-300"
                style={{ width: `${stats.progress}%` }}
              />
            </div>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as 'scanner' | 'list')}
            className="w-full space-y-4"
          >
            <TabsList className="grid w-full grid-cols-2 h-10 p-1 bg-muted rounded-xl">
              <TabsTrigger value="scanner" className="rounded-lg text-xs sm:text-sm font-semibold gap-2">
                <QrCode className="h-4 w-4" />
                <span>Scanner QR (Pointage)</span>
              </TabsTrigger>
              <TabsTrigger value="list" className="rounded-lg text-xs sm:text-sm font-semibold gap-2">
                <ListChecks className="h-4 w-4" />
                <span>Liste des agents ({stats.total})</span>
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: QR SCANNER */}
            <TabsContent value="scanner" className="space-y-4 mt-0 focus-visible:outline-none">
              {/* Roll-call helper actions */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-muted/50 border border-border/60">
                <span className="text-xs text-muted-foreground font-medium">
                  Actions d&apos;appel :
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleMarkAllAbsent}
                    className="h-7 text-xs border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                  >
                    Initialiser l&apos;appel (Tous absents)
                  </Button>
                  {stats.unscannedPresent > 0 && stats.qrVerified > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleMarkUnscannedAbsent}
                      className="h-7 text-xs border-rose-500/40 text-rose-700 dark:text-rose-300 hover:bg-rose-500/10"
                    >
                      Marquer {stats.unscannedPresent} non-scanné(s) absent(s)
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                {/* Left Column: Scanner Controls */}
                <div className="space-y-3">
                  {/* Scan Input Mode Selector */}
                  <div className="grid grid-cols-3 gap-1 bg-muted p-1 rounded-xl">
                    <button
                      type="button"
                      className={cn(
                        'flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition-all',
                        scanMode === 'camera'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                      onClick={() => {
                        setScanMode('camera');
                        setCameraPaused(false);
                      }}
                    >
                      <Camera className="h-3.5 w-3.5" />
                      <span>Caméra</span>
                    </button>
                    <button
                      type="button"
                      className={cn(
                        'flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition-all',
                        scanMode === 'upload'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                      onClick={() => {
                        stopCamera();
                        setScanMode('upload');
                      }}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span>Image</span>
                    </button>
                    <button
                      type="button"
                      className={cn(
                        'flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition-all',
                        scanMode === 'manual'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                      onClick={() => {
                        stopCamera();
                        setScanMode('manual');
                      }}
                    >
                      <Search className="h-3.5 w-3.5" />
                      <span>Matricule</span>
                    </button>
                  </div>

                  {/* Camera Viewport */}
                  {scanMode === 'camera' && (
                    <div className="space-y-2">
                      <div className="relative aspect-square max-h-[250px] w-full mx-auto rounded-2xl overflow-hidden bg-black flex items-center justify-center border-2 border-[#1a2b4c]/30">
                        <video
                          ref={videoRef}
                          className="w-full h-full object-cover"
                          muted
                          playsInline
                        />
                        <canvas ref={canvasRef} className="hidden" />

                        {/* Viewfinder Overlay */}
                        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                          <div className="w-44 h-44 border-2 border-amber-400/80 rounded-xl relative shadow-lg">
                            <div className="absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 border-amber-400" />
                            <div className="absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 border-amber-400" />
                            <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 border-amber-400" />
                            <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 border-amber-400" />
                            {!cameraPaused && cameraActive && (
                              <div className="absolute top-1/2 left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent animate-pulse" />
                            )}
                          </div>
                        </div>

                        {cameraPaused && (
                          <div className="absolute inset-0 bg-slate-950/75 flex flex-col items-center justify-center text-white text-xs gap-2 p-4 text-center">
                            <Pause className="h-8 w-8 text-amber-400" />
                            <p className="font-semibold">Scanner en pause</p>
                          </div>
                        )}

                        {!cameraActive && !cameraPaused && !cameraError && (
                          <div className="absolute inset-0 bg-slate-900/80 flex flex-col items-center justify-center text-white text-xs gap-2 p-4 text-center">
                            <Camera className="h-8 w-8 text-amber-400 animate-pulse" />
                            <p>Activation de la caméra...</p>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] text-muted-foreground">
                          Scan continu actif pour pointer plusieurs agents à la suite.
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2.5 text-xs shrink-0 gap-1"
                          onClick={() => setCameraPaused((p) => !p)}
                        >
                          {cameraPaused ? (
                            <>
                              <Play className="h-3 w-3" /> Reprendre
                            </>
                          ) : (
                            <>
                              <Pause className="h-3 w-3" /> Pause
                            </>
                          )}
                        </Button>
                      </div>

                      {cameraError && (
                        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 text-xs space-y-2">
                          <p>{cameraError}</p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="text-xs h-7"
                            onClick={startCamera}
                          >
                            <RefreshCw className="mr-1.5 h-3 w-3" /> Réessayer
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Image Upload Mode */}
                  {scanMode === 'upload' && (
                    <div className="space-y-2">
                      <div
                        className="border-2 border-dashed border-primary/30 rounded-2xl p-6 text-center hover:bg-muted/50 cursor-pointer transition-colors flex flex-col items-center justify-center gap-2 min-h-[200px]"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <div className="p-3 rounded-full bg-primary/10 text-primary">
                          <Upload className="h-6 w-6" />
                        </div>
                        <p className="text-xs font-bold text-foreground">
                          Importer une photo du code QR
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          PNG, JPG ou capture d&apos;écran du badge agent
                        </p>
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleFileUpload}
                      />
                    </div>
                  )}

                  {/* Manual / USB Scanner Mode */}
                  {scanMode === 'manual' && (
                    <form onSubmit={handleManualSubmit} className="space-y-3 p-4 rounded-2xl border bg-muted/20">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-foreground">
                          Matricule, IDC ou contenu QR (Douchette USB)
                        </label>
                        <div className="flex gap-2">
                          <Input
                            placeholder="Ex: MAT-001, IDC ou scan..."
                            value={manualText}
                            onChange={(e) => setManualText(e.target.value)}
                            className="text-xs h-9"
                            autoFocus
                          />
                          <Button type="submit" size="sm" className="h-9 px-3 text-xs">
                            Pointer
                          </Button>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Saisissez le matricule de l&apos;agent ou utilisez un lecteur de code-barres/QR USB.
                      </p>
                    </form>
                  )}

                  {/* Last Scan Result Card */}
                  {scanFeedback && (
                    <div
                      className={cn(
                        'p-3.5 rounded-2xl border-2 transition-all animate-in fade-in zoom-in-95 duration-200',
                        scanFeedback.status === 'success' &&
                          'bg-emerald-500/10 border-emerald-500/40 text-emerald-900 dark:text-emerald-200',
                        scanFeedback.status === 'already_present' &&
                          'bg-sky-500/10 border-sky-500/40 text-sky-900 dark:text-sky-200',
                        scanFeedback.status === 'not_designated' &&
                          'bg-amber-500/10 border-amber-500/40 text-amber-900 dark:text-amber-200',
                        scanFeedback.status === 'unknown' &&
                          'bg-destructive/10 border-destructive/40 text-destructive'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        {scanFeedback.agent ? (
                          <div className="h-12 w-12 rounded-xl border bg-background overflow-hidden flex items-center justify-center shrink-0">
                            {scanFeedback.agent.photo ? (
                              <Image
                                src={scanFeedback.agent.photo}
                                alt={scanFeedback.agent.fullName}
                                width={48}
                                height={48}
                                className="object-cover h-full w-full"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <User className="h-6 w-6 text-muted-foreground" />
                            )}
                          </div>
                        ) : (
                          <AlertCircle className="h-6 w-6 shrink-0 mt-0.5" />
                        )}

                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-1.5 font-bold text-xs">
                            {scanFeedback.status === 'success' && (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            )}
                            {scanFeedback.status === 'already_present' && (
                              <CheckCircle2 className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
                            )}
                            {scanFeedback.status === 'not_designated' && (
                              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                            )}
                            <span className="truncate">{scanFeedback.message}</span>
                          </div>
                          {scanFeedback.agent && (
                            <>
                              <p className="text-sm font-black truncate">
                                {scanFeedback.agent.fullName}
                              </p>
                              <p className="text-[11px] opacity-85 truncate">
                                {scanFeedback.agent.rank} • MAT: {scanFeedback.agent.registrationNumber || 'N/A'}
                                {scanFeedback.time ? ` • ${scanFeedback.time}` : ''}
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Column: Live Attendance Feed for Designated Agents */}
                <div className="space-y-2 border rounded-2xl p-3 bg-card">
                  <div className="flex items-center justify-between gap-2 pb-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Agents désignés ({stats.present}/{stats.total})
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Clic = basculer
                    </span>
                  </div>

                  <ScrollArea className="h-[310px] pr-2">
                    <div className="space-y-1.5">
                      {assignedAgents.length > 0 ? (
                        assignedAgents.map((agent) => {
                          const isAbsent = absentSet.has(agent.id);
                          const qrTime = !isAbsent ? formatShortTime(attendanceTimestamps[agent.id]) : null;
                          return (
                            <div
                              key={agent.id}
                              onClick={() => toggleAgentPresence(agent.id)}
                              className={cn(
                                'flex items-center justify-between gap-2 p-2.5 rounded-xl border cursor-pointer transition-all text-xs',
                                isAbsent
                                  ? 'bg-rose-500/5 border-rose-500/25 hover:bg-rose-500/10'
                                  : qrTime
                                  ? 'bg-emerald-500/10 border-emerald-500/35 hover:bg-emerald-500/15'
                                  : 'bg-background border-border/60 hover:bg-accent'
                              )}
                            >
                              <div className="min-w-0 flex-1">
                                <p className="font-bold truncate text-foreground">
                                  {agent.fullName}
                                </p>
                                <p className="text-[11px] text-muted-foreground truncate">
                                  {agent.rank} • {agent.registrationNumber || agent.id.substring(0, 6)}
                                </p>
                              </div>

                              {isAbsent ? (
                                <Badge variant="destructive" className="text-[10px] shrink-0">
                                  Absent
                                </Badge>
                              ) : qrTime ? (
                                <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[10px] gap-1 shrink-0">
                                  <QrCode className="h-3 w-3" />
                                  <span>{qrTime}</span>
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[10px] text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 shrink-0">
                                  Présent
                                </Badge>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-center text-muted-foreground py-12 text-xs">
                          Aucun agent désigné pour ce rassemblement.
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </TabsContent>

            {/* TAB 2: MANUAL LIST */}
            <TabsContent value="list" className="space-y-3 mt-0 focus-visible:outline-none">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher un agent désigné (nom, matricule, grade)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-9 text-xs sm:text-sm"
                  />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleMarkAllPresent}
                    className="h-9 text-xs"
                  >
                    Tous présents
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleMarkAllAbsent}
                    className="h-9 text-xs text-destructive hover:text-destructive"
                  >
                    Tous absents
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border">
                <ScrollArea className="h-[340px]">
                  <div className="p-3 space-y-2">
                    {filteredAgents.length > 0 ? (
                      filteredAgents.map((agent) => {
                        const isAbsent = absentSet.has(agent.id);
                        const qrTime = !isAbsent ? formatShortTime(attendanceTimestamps[agent.id]) : null;
                        return (
                          <div
                            key={agent.id}
                            onClick={() => toggleAgentPresence(agent.id)}
                            className={cn(
                              'flex flex-row items-center justify-between gap-3 rounded-xl border p-3 cursor-pointer transition-colors',
                              isAbsent
                                ? 'bg-destructive/5 border-destructive/30 hover:bg-destructive/10'
                                : 'hover:bg-accent'
                            )}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div
                                className={cn(
                                  'h-5 w-5 flex items-center justify-center rounded border shrink-0',
                                  !isAbsent
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : 'bg-destructive text-destructive-foreground border-destructive'
                                )}
                              >
                                {!isAbsent ? <Check className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-sm truncate">{agent.fullName}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {agent.rank} • MAT: {agent.registrationNumber || 'N/A'}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {qrTime && (
                                <Badge className="bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[11px] gap-1">
                                  <QrCode className="h-3 w-3" />
                                  <span>QR {qrTime}</span>
                                </Badge>
                              )}
                              <Badge variant={isAbsent ? 'destructive' : 'secondary'} className="text-xs">
                                {isAbsent ? 'Absent' : 'Présent'}
                              </Badge>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-center text-muted-foreground p-8 text-sm">
                        Aucun agent trouvé.
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer */}
        <DialogFooter className="p-4 sm:p-5 pt-3 border-t bg-muted/20 flex-row items-center justify-between gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              stopCamera();
              onOpenChange(false);
            }}
          >
            Annuler
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSubmitting}
            className="gap-2 bg-[#1a2b4c] hover:bg-[#132038] text-white"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            <span>Enregistrer les présences ({stats.present}/{stats.total})</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
