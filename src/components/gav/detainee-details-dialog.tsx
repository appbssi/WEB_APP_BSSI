'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import { Building2, Calendar, Clock, FileText, Flag, MapPin, Scale, Timer, User } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { Detainee } from '@/lib/types';
import { DetaineeStatutBadge, isDefere } from './detainee-statut-badge';

interface DetaineeDetailsDialogProps {
  detainee: Detainee;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** Ouvre le PV de déferrement (si la personne est déférée avec un PV) */
  onViewPv?: (pvId: string) => void;
}

const fmtDateTime = (d: Date) => d.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });

/** Âge en années révolues à la date donnée */
function ageAt(birth: Date, at: Date): number {
  let age = at.getFullYear() - birth.getFullYear();
  const m = at.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < birth.getDate())) age--;
  return age;
}

/** « 2 j 5 h », « 3 h 20 min », « 15 min » */
function durationLabel(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const minutes = totalMin % 60;
  if (days > 0) return `${days} j ${hours} h`;
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, '0')} min`;
  return `${minutes} min`;
}

function InfoItem({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-card p-3">
      <div className="shrink-0 rounded-full bg-primary/10 p-2 text-primary">{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <div className="mt-0.5 text-sm font-semibold text-foreground">{children}</div>
      </div>
    </div>
  );
}

export function DetaineeDetailsDialog({ detainee, isOpen, onOpenChange, onViewPv }: DetaineeDetailsDialogProps) {
  const birth = detainee.birthDate.toDate();
  const entry = detainee.entryTime.toDate();
  const defere = isDefere(detainee);
  const defereAt = detainee.defereAt?.toDate() ?? null;
  // Durée de la GAV : jusqu'au déferrement, sinon jusqu'à maintenant
  const gavEnd = defere && defereAt ? defereAt : new Date();
  const age = ageAt(birth, new Date());

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] overflow-y-auto p-4 sm:max-w-2xl sm:p-6">
        <DialogHeader>
          <DialogTitle>Dossier GAV</DialogTitle>
          <DialogDescription>Informations relatives à la personne enregistrée.</DialogDescription>
        </DialogHeader>

        {/* Identité */}
        <div className="flex items-center gap-4 rounded-xl border bg-muted/30 p-4">
          {detainee.photo ? (
            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border-2 border-background shadow">
              <Image src={detainee.photo} alt="Photo d'identité" fill className="object-cover" />
            </div>
          ) : (
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg border-2 border-dashed bg-muted">
              <User className="h-10 w-10 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 space-y-1.5">
            <p className="text-xl font-bold leading-tight">
              {detainee.lastName.toUpperCase()} <span className="font-semibold">{detainee.firstName}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              {[age >= 1 ? `${age} an${age > 1 ? 's' : ''}` : null, detainee.nationalite].filter(Boolean).join(' · ')}
            </p>
            <DetaineeStatutBadge detainee={detainee} />
          </div>
        </div>

        {/* Informations */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <InfoItem icon={<Calendar className="h-4 w-4" />} label="Date de naissance">
            {birth.toLocaleDateString('fr-FR', { dateStyle: 'long' })}
          </InfoItem>
          <InfoItem icon={<Flag className="h-4 w-4" />} label="Nationalité">
            {detainee.nationalite || <span className="font-normal text-muted-foreground">Non renseignée</span>}
          </InfoItem>
          <InfoItem icon={<Clock className="h-4 w-4" />} label="Entrée en GAV">
            {fmtDateTime(entry)}
          </InfoItem>
          <InfoItem icon={<Timer className="h-4 w-4" />} label={defere ? 'Durée de la GAV' : 'En GAV depuis'}>
            {durationLabel(gavEnd.getTime() - entry.getTime())}
          </InfoItem>
          <InfoItem icon={<Building2 className="h-4 w-4" />} label="Service">
            {detainee.service || <span className="font-normal text-muted-foreground">Non renseigné</span>}
          </InfoItem>
          <InfoItem icon={<MapPin className="h-4 w-4" />} label="Lieu d'arrestation">
            {detainee.arrestLocation}
          </InfoItem>
        </div>

        {/* Motif */}
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <FileText className="h-3.5 w-3.5" /> Motif d&apos;arrestation
          </p>
          <p className="whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-sm leading-relaxed">
            {detainee.arrestReason}
          </p>
        </div>

        {/* Déferrement */}
        {defere && (
          <div className="space-y-3 rounded-xl border border-indigo-600/20 bg-indigo-50/50 p-4 dark:bg-indigo-500/5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-bold text-indigo-700 dark:text-indigo-400">
                <Scale className="h-4 w-4" /> Déferrement
              </p>
              {detainee.pvId && onViewPv && (
                <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => onViewPv(detainee.pvId!)}>
                  <FileText className="h-4 w-4" />
                  Voir le PV
                </Button>
              )}
            </div>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Date et heure</dt>
                <dd className="font-semibold">{defereAt ? fmtDateTime(defereAt) : '—'}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">PV</dt>
                <dd className="font-semibold">{detainee.pvNumero ? `n° ${detainee.pvNumero}` : '—'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Parquet / juridiction</dt>
                <dd className="font-semibold">{detainee.defereParquet || '—'}</dd>
              </div>
              {detainee.defereObservation && (
                <div className="sm:col-span-2">
                  <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Observation</dt>
                  <dd className="whitespace-pre-wrap">{detainee.defereObservation}</dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
