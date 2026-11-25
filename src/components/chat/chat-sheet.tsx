'use client';

import { useState, useRef, useEffect, useMemo, useLayoutEffect } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import {
  MessageSquare,
  Send,
  ClipboardCheck,
  MapPin,
  Calendar,
  Clock,
  Users,
  Check,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit, Timestamp, doc, where } from 'firebase/firestore';
import { addDoc } from '@/lib/firestore-fast';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useRole } from '@/hooks/use-role';
import { useUser } from '@/firebase';
import type { Agent, ChatMessage } from '@/lib/types';
import { cn } from '@/lib/utils';
import { safeToDate } from '@/lib/agents';

/** Nombre de messages récents chargés. */
const MESSAGE_LIMIT = 100;
/** Deux messages du même auteur à moins de 5 min sont regroupés. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

const timeOf = (d: Date | null) =>
  d ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '--:--';

function dayLabel(d: Date) {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
  if (d.toDateString() === yesterday.toDateString()) return 'Hier';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

// Couleur stable par expéditeur, choisie dans une palette sobre
const AVATAR_COLORS = [
  'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  'bg-teal-500/15 text-teal-700 dark:text-teal-300',
];
function colorFor(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** Ordre signé archivé (scan enregistré ou importé) : clé = id de mission, et nom en secours. */
export interface SignedIndex { byMissionId: Map<string, Date | null>; byName: Map<string, Date | null> }

const normName = (s?: string) => (s || '').trim().toLowerCase();

/**
 * Liste de préparation, calculée en direct (plus de cases à cocher à la main) :
 * 1. Création de la mission : faite dès que le message existe.
 * 2. Ordre de mission signé enregistré ou importé : fait dès que son scan est archivé
 *    dans « Ordres signés ». Cette étape termine la liste.
 */
function MissionChecklistCard({ text, createdAt, signed }: { text: string; createdAt: Date | null; signed: SignedIndex }) {
  const [expanded, setExpanded] = useState(false);

  let missionData: {
    missionId?: string; name?: string; location?: string; startDate?: string; endDate?: string;
    startTime?: string; endTime?: string; agents?: string[];
  } | null = null;
  try {
    missionData = JSON.parse(text);
  } catch {
    return <p className="text-xs text-destructive">Erreur de lecture des données de mission</p>;
  }
  if (!missionData) return null;

  const { missionId, name, location, startDate, endDate, startTime, endTime, agents = [] } = missionData;

  // Les anciens messages n'ont pas l'identifiant de la mission : on se rabat sur son nom
  const signedKey = missionId && signed.byMissionId.has(missionId)
    ? { found: true, at: signed.byMissionId.get(missionId) ?? null }
    : !missionId && signed.byName.has(normName(name))
      ? { found: true, at: signed.byName.get(normName(name)) ?? null }
      : { found: false, at: null };

  const fmt = (d: Date | null) =>
    d ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' à ' + timeOf(d) : null;

  const steps = [
    { id: 'created', label: 'Création de la mission', done: true, detail: fmt(createdAt) },
    {
      id: 'signed',
      label: "Ordre de mission signé enregistré",
      done: signedKey.found,
      detail: signedKey.found ? (fmt(signedKey.at) ?? 'Enregistré') : 'En attente du scan signé (Ordres signés)',
    },
  ];
  const total = steps.length;
  const done = steps.filter((s) => s.done).length;
  const percentage = Math.round((done / total) * 100);
  const complete = done === total;

  const period = (() => {
    try {
      const s = new Date(startDate as string).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
      const e = new Date(endDate as string).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
      return s === e ? s : `${s} → ${e}`;
    } catch {
      return 'Période inconnue';
    }
  })();

  return (
    <div className="overflow-hidden rounded-xl border border-primary/20 bg-card shadow-sm">
      <div className="h-1 w-full bg-gradient-to-r from-emerald-500 via-emerald-500/70 to-primary" aria-hidden="true" />
      <div className="space-y-3 p-3.5">
        <div className="flex items-start gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ClipboardCheck className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Nouvelle mission</p>
            <h4 className="truncate text-sm font-bold leading-tight">{name}</h4>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {location && (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-primary/70" />
              <span className="truncate">{location}</span>
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 shrink-0 text-primary/70" />
            {period}
          </span>
          {startTime && endTime && (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 shrink-0 text-primary/70" />
              {startTime} – {endTime}
            </span>
          )}
        </div>

        {agents.length > 0 && (
          <div className="flex items-start gap-1.5">
            <Users className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="flex flex-wrap gap-1">
              {agents.map((agent, idx) => (
                <span key={idx} className="rounded-full border bg-muted/50 px-2 py-0.5 text-[11px] font-medium">
                  {agent}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2 rounded-lg bg-muted/40 p-2.5">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center justify-between gap-2 text-xs font-semibold"
            aria-expanded={expanded}
          >
            <span>{complete ? 'Préparation terminée' : 'Liste de préparation'} · {done}/{total}</span>
            <span className={cn('flex items-center gap-1.5', complete ? 'text-emerald-600 dark:text-emerald-400' : 'text-primary')}>
              {percentage}%
              <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
            </span>
          </button>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-background">
            <div
              className={cn('h-full rounded-full transition-all duration-500', complete ? 'bg-emerald-500' : 'bg-primary')}
              style={{ width: `${percentage}%` }}
            />
          </div>
          {expanded && (
            <ol className="relative space-y-3 pl-1 pt-1">
              {steps.map((step, i) => (
                <li key={step.id} className="relative flex gap-2.5">
                  {i < steps.length - 1 && (
                    <span
                      className={cn('absolute left-[9px] top-5 h-[calc(100%-4px)] w-px', step.done ? 'bg-emerald-500/50' : 'bg-border')}
                      aria-hidden="true"
                    />
                  )}
                  <span
                    className={cn(
                      'relative z-10 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border text-[10px] font-bold',
                      step.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-muted-foreground/40 bg-background text-muted-foreground'
                    )}
                  >
                    {step.done ? <Check className="h-3 w-3 stroke-[3]" /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className={cn('block text-xs font-medium', !step.done && 'text-muted-foreground')}>{step.label}</span>
                    {step.detail && <span className="block text-[11px] text-muted-foreground">{step.detail}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

export function ChatSheet() {
  const [isOpen, setIsOpen] = useState(false);
  const [messageText, setMessageText] = useState('');
  const viewportRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const firestore = useFirestore();
  const { user } = useUser();
  const { role, agentId, idc } = useRole();

  // Ordres signés archivés : l'admin les voit tous, un agent seulement ceux de ses missions
  const signedQuery = useMemoFirebase(() => {
    if (!firestore || !isOpen) return null;
    if (role === 'admin') return query(collection(firestore, 'signed_orders'), where('status', '==', 'archive'));
    const keys = [agentId, idc].filter((k): k is string => !!k);
    if (keys.length === 0) return null;
    return query(collection(firestore, 'signed_orders'), where('agentIds', 'array-contains-any', keys));
  }, [firestore, isOpen, role, agentId, idc]);
  const { data: signedOrders } = useCollection<{ status?: string; missionId?: string | null; missionName?: string; archivedAt?: unknown }>(signedQuery);
  const signed: SignedIndex = useMemo(() => {
    const byMissionId = new Map<string, Date | null>();
    const byName = new Map<string, Date | null>();
    (signedOrders || []).forEach((o) => {
      if (o.status !== 'archive') return;
      const at = safeToDate(o.archivedAt) ?? null;
      if (o.missionId) byMissionId.set(o.missionId, at);
      if (o.missionName) byName.set(normName(o.missionName), at);
    });
    return { byMissionId, byName };
  }, [signedOrders]);

  // Fiche de l'agent connecté : son nom apparaît sur ses messages
  const agentRef = useMemoFirebase(
    () => (firestore && agentId ? doc(firestore, 'agents', agentId) : null),
    [firestore, agentId]
  );
  const { data: me } = useDoc<Agent>(agentRef);

  // Les plus récents d'abord côté serveur, puis remis dans l'ordre chronologique
  const messagesQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'messages'), orderBy('timestamp', 'desc'), limit(MESSAGE_LIMIT)) : null),
    [firestore]
  );
  const { data: rawMessages, isLoading } = useCollection<ChatMessage>(messagesQuery);
  const messages = useMemo(() => (rawMessages ? [...rawMessages].reverse() : null), [rawMessages]);

  const senderName = useMemo(() => {
    if (me?.fullName) return me.fullName;
    if (role === 'admin') return 'Administration';
    if (role === 'secretariat') return 'Secrétariat';
    return 'Agent';
  }, [me, role]);

  // Défilement en bas : immédiat à l'ouverture, en douceur pour les nouveaux messages
  const lastCount = useRef(0);
  useEffect(() => {
    if (!isOpen) { lastCount.current = 0; return; }
    const count = messages?.length ?? 0;
    const smooth = lastCount.current > 0 && count > lastCount.current;
    lastCount.current = count;
    // Le panneau est monté dans un portail puis animé : on attend qu'il soit mis en page
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const el = viewportRef.current;
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
      });
    });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [messages, isOpen]);

  const send = () => {
    const text = messageText.trim();
    if (!text || !firestore || !user) return;
    setMessageText('');
    inputRef.current?.focus();
    addDoc(collection(firestore, 'messages'), {
      senderId: user.uid,
      senderName,
      text,
      timestamp: Timestamp.now(),
    }).catch((error) => {
      console.error('Error sending message:', error);
      setMessageText(text); // on rend le texte pour pouvoir réessayer
    });
  };

  // Champ qui s'agrandit avec le texte (jusqu'à ~5 lignes)
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [messageText]);

  const rendered = useMemo(() => {
    if (!messages) return [];
    const out: Array<
      | { kind: 'day'; key: string; label: string }
      | { kind: 'mission'; key: string; msg: ChatMessage & { id: string }; time: string }
      | { kind: 'msg'; key: string; msg: ChatMessage & { id: string }; time: string; isMe: boolean; first: boolean; last: boolean }
    > = [];
    let prevDay = '';
    messages.forEach((msg, i) => {
      const d = safeToDate(msg.timestamp);
      const day = d ? d.toDateString() : '';
      if (d && day !== prevDay) {
        out.push({ kind: 'day', key: `day-${day}`, label: dayLabel(d) });
        prevDay = day;
      }
      if (msg.senderId === 'system' && msg.text.includes('"type":"mission_created"')) {
        out.push({ kind: 'mission', key: msg.id, msg, time: timeOf(d) });
        return;
      }
      const sameAs = (other?: ChatMessage) => {
        if (!other || other.senderId !== msg.senderId || other.senderId === 'system') return false;
        const od = safeToDate(other.timestamp);
        return !!(d && od && Math.abs(d.getTime() - od.getTime()) < GROUP_WINDOW_MS && od.toDateString() === day);
      };
      out.push({
        kind: 'msg',
        key: msg.id,
        msg,
        time: timeOf(d),
        isMe: msg.senderId === user?.uid,
        first: !sameAs(messages[i - 1]),
        last: !sameAs(messages[i + 1]),
      });
    });
    return out;
  }, [messages, user?.uid]);

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
          <MessageSquare className="h-[18px] w-[18px]" />
          <span className="sr-only">Messagerie</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="flex h-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md sm:p-0">
        {/* En-tête */}
        <SheetHeader className="space-y-0 border-b px-4 py-3.5 pr-12 text-left sm:px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-base leading-tight">Messagerie des agents</SheetTitle>
              <SheetDescription className="flex items-center gap-1.5 text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                Canal commun · {messages?.length ?? 0} message{(messages?.length ?? 0) > 1 ? 's' : ''}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {/* Fil des messages */}
        <div ref={viewportRef} className="flex-1 overflow-y-auto overscroll-contain bg-muted/30 px-3 py-4 sm:px-4">
          {isLoading && !messages ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : rendered.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <MessageSquare className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium text-foreground">Aucun message pour le moment</p>
              <p className="text-xs">Écrivez le premier message à l&apos;équipe.</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {rendered.map((item) => {
                if (item.kind === 'day') {
                  return (
                    <div key={item.key} className="my-3 flex items-center gap-3 first:mt-0">
                      <span className="h-px flex-1 bg-border" />
                      <span className="text-[11px] font-medium capitalize text-muted-foreground">{item.label}</span>
                      <span className="h-px flex-1 bg-border" />
                    </div>
                  );
                }
                if (item.kind === 'mission') {
                  return (
                    <div key={item.key} className="my-2">
                      <MissionChecklistCard text={item.msg.text} createdAt={safeToDate(item.msg.timestamp)} signed={signed} />
                      <p className="mt-1 text-center text-[10px] text-muted-foreground">Message système · {item.time}</p>
                    </div>
                  );
                }
                const { msg, isMe, first, last, time } = item;
                return (
                  <div
                    key={item.key}
                    className={cn('flex items-end gap-2', isMe ? 'justify-end' : 'justify-start', first ? 'mt-3' : 'mt-0.5')}
                  >
                    {!isMe && (
                      <div className="w-7 shrink-0">
                        {last && (
                          <div
                            className={cn('flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold', colorFor(msg.senderId))}
                            title={msg.senderName}
                          >
                            {initialsOf(msg.senderName || '?')}
                          </div>
                        )}
                      </div>
                    )}
                    <div className={cn('flex max-w-[78%] flex-col', isMe ? 'items-end' : 'items-start')}>
                      {!isMe && first && (
                        <span className="mb-1 px-1 text-[11px] font-semibold text-muted-foreground">{msg.senderName}</span>
                      )}
                      <div
                        className={cn(
                          'whitespace-pre-wrap break-words px-3.5 py-2 text-sm leading-relaxed shadow-sm',
                          isMe
                            ? 'rounded-2xl bg-primary text-primary-foreground'
                            : 'rounded-2xl border bg-card text-foreground',
                          isMe && !first && 'rounded-tr-md',
                          isMe && !last && 'rounded-br-md',
                          !isMe && !first && 'rounded-tl-md',
                          !isMe && !last && 'rounded-bl-md'
                        )}
                      >
                        {msg.text}
                        <span
                          className={cn(
                            'ml-2 inline-block translate-y-0.5 text-[10px]',
                            isMe ? 'text-primary-foreground/75' : 'text-muted-foreground'
                          )}
                        >
                          {time}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Zone de saisie */}
        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
          className="flex items-end gap-2 border-t bg-background px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 sm:px-4"
        >
          <textarea
            ref={inputRef}
            rows={1}
            placeholder="Écrire un message…"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={(e) => {
              // Entrée envoie, Maj+Entrée va à la ligne
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            aria-label="Message"
            className="max-h-32 min-h-10 flex-1 resize-none rounded-2xl border border-input bg-muted/40 px-4 py-2.5 text-base leading-5 sm:text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button
            type="submit"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-full"
            disabled={!messageText.trim()}
            aria-label="Envoyer"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
