'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { Agent, Availability } from '@/lib/types';
import { parseScannedAgentData } from '@/lib/agent-qrcode';
import jsQR from 'jsqr';
import {
  Camera,
  Upload,
  Search,
  CheckCircle2,
  AlertCircle,
  QrCode,
  User,
  Shield,
  Phone,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import Image from 'next/image';

interface AgentQRScannerDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  agents: (Agent & { availability?: Availability })[];
  onSelectAgent: (agent: Agent & { availability?: Availability }) => void;
}

export function AgentQRScannerDialog({
  isOpen,
  onOpenChange,
  agents,
  onSelectAgent,
}: AgentQRScannerDialogProps) {
  const [mode, setMode] = useState<'camera' | 'upload' | 'manual'>('camera');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualText, setManualText] = useState('');
  const [matchedAgent, setMatchedAgent] = useState<(Agent & { availability?: Availability }) | null>(null);
  const [scannedRaw, setScannedRaw] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Play audio feedback upon successful scan
  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch {
      // AudioContext not allowed or supported
    }
  };

  // Find agent in database by parsed data or raw string
  const findAgent = useCallback(
    (scannedString: string) => {
      const parsed = parseScannedAgentData(scannedString);
      setScannedRaw(scannedString);

      const found = agents.find((a) => {
        if (parsed.agentId && a.id.toLowerCase() === parsed.agentId.toLowerCase()) return true;
        if (parsed.matricule && a.registrationNumber && a.registrationNumber.trim().toLowerCase() === parsed.matricule.trim().toLowerCase()) return true;
        if (a.id.toLowerCase() === scannedString.trim().toLowerCase()) return true;
        if (a.registrationNumber && a.registrationNumber.trim().toLowerCase() === scannedString.trim().toLowerCase()) return true;
        if (a.id.substring(0, 6).toUpperCase() === scannedString.trim().toUpperCase()) return true;
        return false;
      });

      if (found) {
        setMatchedAgent(found);
        setNotFound(false);
        playBeep();
      } else {
        setMatchedAgent(null);
        setNotFound(true);
      }
    },
    [agents]
  );

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

  // Scan frame loop using requestAnimationFrame + jsQR
  const scanFrame = useCallback(() => {
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
      findAgent(code.data);
      stopCamera();
      return;
    }

    animFrameRef.current = requestAnimationFrame(scanFrame);
  }, [findAgent, stopCamera]);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setMatchedAgent(null);
    setNotFound(false);
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
    } catch (err: any) {
      console.warn('Camera access error:', err);
      setCameraError(
        err.name === 'NotAllowedError'
          ? 'Permission d\'accès à la caméra refusée. Veuillez autoriser la caméra dans votre navigateur ou importer une image.'
          : 'Impossible d\'activer la caméra. Vous pouvez importer une image du code QR ou entrer le matricule manuellement.'
      );
      setCameraActive(false);
    }
  }, [scanFrame]);

  // Manage camera lifecycle when dialog opens / closes or mode changes
  useEffect(() => {
    if (isOpen && mode === 'camera' && !matchedAgent) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, mode, matchedAgent, startCamera, stopCamera]);

  // Decode uploaded image
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
          findAgent(code.data);
        } else {
          setMatchedAgent(null);
          setNotFound(true);
          setScannedRaw('Aucun code QR détecté dans cette image.');
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualText.trim()) return;
    findAgent(manualText.trim());
  };

  const resetScan = () => {
    setMatchedAgent(null);
    setNotFound(false);
    setScannedRaw(null);
    setManualText('');
    if (mode === 'camera') {
      startCamera();
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
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-md max-h-[90dvh] overflow-y-auto p-0 bg-background border shadow-2xl">
        <DialogHeader className="p-4 sm:p-5 pb-3 bg-gradient-to-r from-slate-900 via-[#1a2b4c] to-slate-900 text-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/10 rounded-lg">
              <QrCode className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <DialogTitle className="text-base sm:text-lg font-bold text-white">
                Scanner & Identifier un Agent
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-300">
                Pointez la caméra ou importez une photo du code QR du badge de l'agent.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-4 sm:p-5 space-y-4">
          {/* Mode switch pills */}
          {!matchedAgent && (
            <div className="grid grid-cols-3 gap-1 bg-muted p-1 rounded-xl">
              <button
                type="button"
                className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  mode === 'camera'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => {
                  setMode('camera');
                  setNotFound(false);
                }}
              >
                <Camera className="h-3.5 w-3.5" />
                <span>Caméra</span>
              </button>
              <button
                type="button"
                className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  mode === 'upload'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => {
                  stopCamera();
                  setMode('upload');
                  setNotFound(false);
                }}
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Importer</span>
              </button>
              <button
                type="button"
                className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  mode === 'manual'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => {
                  stopCamera();
                  setMode('manual');
                  setNotFound(false);
                }}
              >
                <Search className="h-3.5 w-3.5" />
                <span>Saisie</span>
              </button>
            </div>
          )}

          {/* Result view: Agent found */}
          {matchedAgent ? (
            <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <div className="text-xs">
                  <p className="font-bold">Agent identifié avec succès</p>
                  <p className="text-[11px] opacity-90">Code QR vérifié dans la base de données sBSSI.</p>
                </div>
              </div>

              {/* Agent card details */}
              <div className="p-4 rounded-2xl border-2 border-primary/20 bg-card shadow-sm space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-16 w-16 rounded-xl border-2 border-primary/20 bg-muted overflow-hidden flex items-center justify-center shrink-0">
                    {matchedAgent.photo ? (
                      <Image
                        src={matchedAgent.photo}
                        alt={matchedAgent.fullName}
                        width={64}
                        height={64}
                        className="object-cover h-full w-full"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <User className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-black text-base truncate text-foreground">
                      {matchedAgent.fullName}
                    </h3>
                    <div className="flex items-center gap-2 flex-wrap text-xs pt-0.5">
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        MAT: {matchedAgent.registrationNumber || 'N/A'}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {matchedAgent.availability || 'Actif'}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t">
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">Grade</span>
                    <p className="font-bold">{matchedAgent.rank}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">Section</span>
                    <p className="font-bold">{(matchedAgent.section || 'Non assigné').toUpperCase()}</p>
                  </div>
                  {matchedAgent.contact && (
                    <div className="col-span-2 flex items-center gap-1.5 text-muted-foreground">
                      <Phone className="h-3.5 w-3.5 text-primary" />
                      <span className="font-semibold text-foreground">{matchedAgent.contact}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 justify-end pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs h-9 cursor-pointer"
                  onClick={resetScan}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Scanner un autre</span>
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5 text-xs h-9 cursor-pointer bg-[#1a2b4c] hover:bg-[#132038] text-white"
                  onClick={() => {
                    onOpenChange(false);
                    onSelectAgent(matchedAgent);
                  }}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Voir Profil Complet</span>
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Not found state */}
              {notFound && (
                <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs space-y-1">
                  <div className="flex items-center gap-2 font-bold">
                    <AlertCircle className="h-4 w-4" />
                    <span>Agent non trouvé dans la base sBSSI</span>
                  </div>
                  {scannedRaw && (
                    <p className="text-[11px] font-mono break-all opacity-85">
                      Valeur lue : {scannedRaw.substring(0, 80)}
                    </p>
                  )}
                </div>
              )}

              {/* Camera Scanner View */}
              {mode === 'camera' && (
                <div className="space-y-3">
                  <div className="relative aspect-square max-h-[260px] mx-auto rounded-2xl overflow-hidden bg-black flex items-center justify-center border-2 border-[#1a2b4c]/30">
                    <video
                      ref={videoRef}
                      className="w-full h-full object-cover"
                      muted
                      playsInline
                    />
                    <canvas ref={canvasRef} className="hidden" />

                    {/* Scanning overlay box */}
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                      <div className="w-48 h-48 border-2 border-amber-400 rounded-xl relative shadow-lg">
                        <div className="absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 border-amber-400" />
                        <div className="absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 border-amber-400" />
                        <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 border-amber-400" />
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 border-amber-400" />
                        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent animate-pulse" />
                      </div>
                    </div>

                    {!cameraActive && !cameraError && (
                      <div className="absolute inset-0 bg-slate-900/80 flex flex-col items-center justify-center text-white text-xs gap-2 p-4 text-center">
                        <Camera className="h-8 w-8 text-amber-400 animate-pulse" />
                        <p>Activation de la caméra en cours...</p>
                      </div>
                    )}
                  </div>

                  {cameraError && (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 text-xs flex flex-col gap-2">
                      <p>{cameraError}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-8 cursor-pointer self-start"
                        onClick={startCamera}
                      >
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Réessayer la caméra
                      </Button>
                    </div>
                  )}

                  <p className="text-[11px] text-center text-muted-foreground">
                    Cadrez le code QR dans le viseur pour identification automatique.
                  </p>
                </div>
              )}

              {/* Upload image view */}
              {mode === 'upload' && (
                <div className="space-y-3">
                  <div
                    className="border-2 border-dashed border-primary/30 rounded-2xl p-6 text-center hover:bg-muted/50 cursor-pointer transition-colors flex flex-col items-center justify-center gap-2"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className="p-3 rounded-full bg-primary/10 text-primary">
                      <Upload className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-foreground">
                        Cliquez pour sélectionner une photo de QR Code
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Capture d'écran, photo du badge, ou image PNG / JPG
                      </p>
                    </div>
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

              {/* Manual search view */}
              {mode === 'manual' && (
                <form onSubmit={handleManualSearch} className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">
                      Matricule, IDC ou Contenu du QR
                    </label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Ex: 12345, BSSI-AG-..., ou collez le texte"
                        value={manualText}
                        onChange={(e) => setManualText(e.target.value)}
                        className="text-xs h-9"
                        autoFocus
                      />
                      <Button type="submit" size="sm" className="h-9 px-4 text-xs cursor-pointer">
                        Vérifier
                      </Button>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Vous pouvez aussi utiliser un lecteur code-barres USB ou Bluetooth branché à votre appareil.
                  </p>
                </form>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
