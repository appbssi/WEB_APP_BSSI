'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, updateDoc } from 'firebase/firestore';
import { Check, KeyRound, MessageCircle, Phone } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useRole } from '@/hooks/use-role';

type ResetRequest = {
  id: string;
  agentId: string;
  agentName: string;
  rank?: string;
  registrationNumber?: string;
  contact: string;
  code: string;
  expiresAt: number;
  status: 'a_transmettre' | 'transmis';
};

/** Numéro au format international pour WhatsApp (Côte d'Ivoire par défaut : +225). */
function whatsappNumber(contact: string): string {
  const digits = contact.replace(/\D/g, '');
  if (digits.startsWith('225') || digits.length > 10) return digits;
  return `225${digits}`;
}

function remaining(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min >= 60) return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
  return `${min} min`;
}

/**
 * Demandes « mot de passe oublié » des agents : l'administrateur transmet le code
 * à l'agent sur son contact enregistré (appel ou WhatsApp).
 */
export function PasswordResetRequests() {
  const firestore = useFirestore();
  const { role } = useRole();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const requestsQuery = useMemoFirebase(
    () => (firestore && role === 'admin' ? collection(firestore, 'password_reset_requests') : null),
    [firestore, role]
  );
  const { data } = useCollection<ResetRequest>(requestsQuery);

  const active = useMemo(
    () => (data ?? []).filter((r) => r.expiresAt > now).sort((a, b) => a.expiresAt - b.expiresAt),
    [data, now]
  );

  if (role !== 'admin' || active.length === 0) return null;

  const markSent = (id: string) =>
    firestore && updateDoc(doc(firestore, 'password_reset_requests', id), { status: 'transmis' }).catch(() => {});

  return (
    <section className="overflow-hidden rounded-xl border border-l-4 border-l-primary bg-card shadow-sm">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
          <KeyRound className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Mots de passe oubliés</p>
          <p className="text-xs text-muted-foreground">
            Transmettez le code à l&apos;agent sur son contact enregistré. Il le saisira pour choisir un nouveau mot de passe.
          </p>
        </div>
      </div>
      <ul className="divide-y">
        {active.map((r) => {
          const message = `sBSSI — Bonjour ${r.agentName}, votre code de réinitialisation est : ${r.code}. Il est valable ${remaining(r.expiresAt - now)}.`;
          return (
            <li key={r.id} className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {r.rank ? `${r.rank} ` : ''}
                  {r.agentName}
                  {r.status === 'transmis' && (
                    <span className="ml-2 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                      Transmis
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  Matricule {r.registrationNumber || '—'} · Contact {r.contact} · expire dans {remaining(r.expiresAt - now)}
                </p>
              </div>
              <span className="self-start rounded-lg bg-muted px-3 py-1.5 font-mono text-lg font-bold tracking-[0.3em] md:self-center">
                {r.code}
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button asChild size="sm" variant="outline" className="h-8 gap-1 text-xs">
                  <a href={`tel:${r.contact.replace(/[^\d+]/g, '')}`}>
                    <Phone className="h-3.5 w-3.5" />
                    Appeler
                  </a>
                </Button>
                <Button asChild size="sm" variant="outline" className="h-8 gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                  <a
                    href={`https://wa.me/${whatsappNumber(r.contact)}?text=${encodeURIComponent(message)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => markSent(r.id)}
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    WhatsApp
                  </a>
                </Button>
                {r.status !== 'transmis' && (
                  <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => markSent(r.id)}>
                    <Check className="h-3.5 w-3.5" />
                    Transmis
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
