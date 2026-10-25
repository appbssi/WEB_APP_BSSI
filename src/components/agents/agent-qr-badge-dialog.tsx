'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Agent, Availability } from '@/lib/types';
import { generateAgentQRCodeDataURL, getAgentQRPayloadString } from '@/lib/agent-qrcode';
import { generateAgentBadgeCardPDF } from '@/lib/pdf-generator';
import {
  QrCode,
  Download,
  Printer,
  Copy,
  Check,
  Shield,
  User,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';

interface AgentQRBadgeDialogProps {
  agent: (Agent & { availability?: Availability }) | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenDetails?: () => void;
}

export function AgentQRBadgeDialog({
  agent,
  isOpen,
  onOpenChange,
  onOpenDetails,
}: AgentQRBadgeDialogProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    let isCancelled = false;
    if (agent && isOpen) {
      generateAgentQRCodeDataURL(agent, { size: 360, margin: 2 })
        .then((url) => {
          if (!isCancelled) setQrDataUrl(url);
        })
        .catch((err) => {
          console.error('Failed to generate agent QR code:', err);
        });
    } else {
      setQrDataUrl('');
    }
    return () => {
      isCancelled = true;
    };
  }, [agent, isOpen]);

  if (!agent) return null;

  const idc = (agent.id || '').substring(0, 6).toUpperCase();
  const rawPayload = getAgentQRPayloadString(agent);

  const handleCopyPayload = () => {
    navigator.clipboard.writeText(rawPayload);
    setCopied(true);
    toast({
      title: 'Données copiées',
      description: 'Les données d\'identification du QR Code ont été copiées.',
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadQR = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = `QRCode_Agent_${agent.registrationNumber || idc}_${agent.fullName.replace(/\s+/g, '_')}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({
      title: 'Téléchargement lancé',
      description: 'L\'image haute résolution du code QR a été téléchargée.',
    });
  };

  const handlePrintBadge = async () => {
    try {
      setIsGeneratingPdf(true);
      await generateAgentBadgeCardPDF(agent);
      toast({
        title: 'Badge officiel généré',
        description: 'La carte d\'identification PDF a été téléchargée avec succès.',
      });
    } catch (error) {
      console.error('Error generating badge PDF:', error);
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: 'Impossible de générer le badge officiel.',
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-xl max-h-[90dvh] overflow-y-auto p-4 sm:p-6 bg-background border shadow-2xl">
        <DialogHeader className="p-0 pb-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              <QrCode className="h-5 w-5 text-[#1a2b4c] dark:text-blue-400" />
            </div>
            <div>
              <DialogTitle className="text-base sm:text-lg font-bold text-foreground">
                Badge & Code QR d'Identification
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Code QR unique assigné à l'agent pour contrôle sur le terrain et traçabilité.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Virtual Identity Card Preview */}
          <div className="relative overflow-hidden rounded-2xl border-2 border-[#1a2b4c]/30 bg-gradient-to-br from-white via-slate-50 to-slate-100 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 shadow-lg p-5">
            {/* Top decorative tricolor bar (Côte d'Ivoire: Orange, Blanc, Vert) */}
            <div className="absolute top-0 left-0 right-0 h-1.5 flex">
              <div className="flex-1 bg-amber-500" />
              <div className="flex-1 bg-white" />
              <div className="flex-1 bg-emerald-600" />
            </div>

            {/* Header info */}
            <div className="flex items-start justify-between border-b pb-3 mb-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  RÉPUBLIQUE DE CÔTE D'IVOIRE
                </p>
                <h3 className="text-xs font-black tracking-tight text-[#1a2b4c] dark:text-blue-300">
                  BRIGADE SPÉCIALE DE SURVEILLANCE ET D'INTERVENTION
                </h3>
                <p className="text-[9px] text-muted-foreground italic">Duralex - Sed Lex</p>
              </div>
              <Badge variant="outline" className="font-mono text-[10px] uppercase font-bold border-primary/30">
                IDC: {idc}
              </Badge>
            </div>

            {/* Card Content: Photo + Details + QR Code */}
            <div className="flex flex-col sm:flex-row items-center sm:items-stretch gap-4">
              {/* Photo */}
              <div className="flex flex-col items-center shrink-0">
                <div className="h-28 w-24 rounded-xl border-2 border-primary/20 bg-muted overflow-hidden flex items-center justify-center shadow-md">
                  {agent.photo ? (
                    <Image
                      src={agent.photo}
                      alt={agent.fullName}
                      width={96}
                      height={112}
                      className="object-cover h-full w-full"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <User className="h-10 w-10 text-muted-foreground/60" />
                  )}
                </div>
                <span className="text-[9px] font-semibold text-muted-foreground mt-1">Photo d'identité</span>
              </div>

              {/* Agent particulars */}
              <div className="flex-1 min-w-0 space-y-1.5 text-center sm:text-left">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                    Nom & Prénoms
                  </p>
                  <p className="text-base font-extrabold text-foreground truncate">
                    {agent.fullName}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                      Matricule
                    </p>
                    <p className="font-mono font-bold text-foreground">
                      {agent.registrationNumber || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                      Grade
                    </p>
                    <p className="font-semibold text-foreground truncate">
                      {agent.rank || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                      Section
                    </p>
                    <p className="font-semibold text-foreground truncate">
                      {(agent.section || 'Non assigné').toUpperCase()}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                      Statut
                    </p>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                      {agent.availability || 'Actif'}
                    </Badge>
                  </div>
                </div>

                {agent.contact && (
                  <p className="text-[10px] text-muted-foreground pt-1">
                    Contact urgence: <span className="font-mono font-semibold text-foreground">{agent.contact}</span>
                  </p>
                )}
              </div>

              {/* QR Code Container */}
              <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-white dark:bg-white border shadow-inner shrink-0">
                {qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qrDataUrl}
                    alt={`QR Code Agent ${agent.fullName}`}
                    className="h-28 w-28 object-contain"
                  />
                ) : (
                  <div className="h-28 w-28 flex items-center justify-center text-muted-foreground">
                    <QrCode className="h-8 w-8 animate-pulse text-muted-foreground/40" />
                  </div>
                )}
                <span className="text-[8px] font-mono font-bold text-slate-800 tracking-wider mt-0.5">
                  SCANNER BSSI
                </span>
              </div>
            </div>

            {/* Bottom Security Watermark */}
            <div className="mt-3 pt-2 border-t flex items-center justify-between text-[9px] text-muted-foreground">
              <span className="flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                <Shield className="h-3 w-3" /> Identifiant Numérique Vérifié
              </span>
              <span className="font-mono text-[8px]">REF: {agent.id.substring(0, 12)}</span>
            </div>
          </div>

          {/* Quick Explanation */}
          <div className="p-3 rounded-xl bg-muted/60 text-xs text-muted-foreground flex items-start gap-2.5">
            <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Ce code QR encode de façon sécurisée le <strong>matricule</strong>, l'<strong>identité</strong>, le <strong>grade</strong> et l'<strong>identifiant unique</strong> de l'agent. Il peut être scanné avec tout smartphone ou douchette de contrôle pour afficher instantanément sa situation opérationnelle.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs h-9 cursor-pointer"
                onClick={handleCopyPayload}
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                <span>Copier données</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs h-9 cursor-pointer"
                onClick={handleDownloadQR}
                disabled={!qrDataUrl}
              >
                <Download className="h-3.5 w-3.5 text-primary" />
                <span>Télécharger QR (PNG)</span>
              </Button>
            </div>

            <div className="flex items-center gap-2">
              {onOpenDetails && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs h-9 cursor-pointer"
                  onClick={() => {
                    onOpenChange(false);
                    onOpenDetails();
                  }}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Fiche complète</span>
                </Button>
              )}
              <Button
                size="sm"
                className="gap-1.5 text-xs h-9 cursor-pointer bg-[#1a2b4c] hover:bg-[#132038] text-white"
                onClick={handlePrintBadge}
                disabled={isGeneratingPdf || !qrDataUrl}
              >
                <Printer className="h-3.5 w-3.5" />
                <span>{isGeneratingPdf ? 'Génération...' : 'Imprimer Badge (PDF)'}</span>
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
