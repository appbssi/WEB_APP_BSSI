'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  MessageSquare, 
  Send, 
  User, 
  Loader2, 
  ClipboardCheck, 
  MapPin, 
  Calendar, 
  Clock, 
  Users, 
  Check 
} from 'lucide-react';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit, addDoc, Timestamp, doc, updateDoc } from 'firebase/firestore';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useRole } from '@/hooks/use-role';
import { useUser } from '@/firebase';
import { ChatMessage } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { safeToDate } from '@/lib/agents';

interface MissionChecklistCardProps {
  msgId: string;
  text: string;
  timestamp: any;
  firestore: any;
}

function MissionChecklistCard({ msgId, text, timestamp, firestore }: MissionChecklistCardProps) {
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  let missionData: any = null;
  try {
    missionData = JSON.parse(text);
  } catch (e) {
    return <p className="text-destructive font-mono text-xs">Erreur de lecture des données de mission</p>;
  }

  if (!missionData) return null;

  const { name, location, startDate, endDate, startTime, endTime, checklist = [], agents = [] } = missionData;

  const totalItems = checklist.length;
  const checkedItems = checklist.filter((item: any) => item.checked).length;
  const percentage = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0;

  const handleToggle = async (itemId: string, currentChecked: boolean) => {
    if (!firestore || isUpdating) return;
    setIsUpdating(itemId);
    try {
      const updatedChecklist = checklist.map((item: any) =>
        item.id === itemId ? { ...item, checked: !currentChecked } : item
      );
      const updatedData = { ...missionData, checklist: updatedChecklist };
      
      const docRef = doc(firestore, 'messages', msgId);
      await updateDoc(docRef, {
        text: JSON.stringify(updatedData)
      });
    } catch (err) {
      console.error("Erreur de mise à jour de la checklist:", err);
    } finally {
      setIsUpdating(null);
    }
  };

  const formattedDates = () => {
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const startStr = start.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
      const endStr = end.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
      if (startStr === endStr) {
        return startStr;
      }
      return `${startStr} - ${endStr}`;
    } catch (e) {
      return "Période inconnue";
    }
  };

  return (
    <div className="w-full bg-card border border-border rounded-xl p-4 my-2 text-foreground shadow-sm hover:shadow transition-all space-y-3">
      {/* En-tête du message système */}
      <div className="flex items-start justify-between gap-2 border-b pb-2 border-border/50">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-primary/10 text-primary rounded-lg">
            <ClipboardCheck className="h-4 w-4" />
          </div>
          <div>
            <h4 className="font-semibold text-sm tracking-tight leading-tight">{name}</h4>
            <p className="text-[9px] text-muted-foreground font-mono mt-0.5">ORDRE DE MISSION CRÉÉ</p>
          </div>
        </div>
        <span className="text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded-full font-medium">
          Système
        </span>
      </div>

      {/* Informations générales (Lieu, Dates, Horaires) */}
      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground bg-muted/40 p-2 rounded-lg">
        <div className="flex items-center gap-1.5 min-w-0">
          <MapPin className="h-3.5 w-3.5 text-primary/70 shrink-0" />
          <span className="truncate" title={location}>{location}</span>
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <Calendar className="h-3.5 w-3.5 text-primary/70 shrink-0" />
          <span className="truncate">{formattedDates()}</span>
        </div>
        {startTime && endTime && (
          <div className="flex items-center gap-1.5 col-span-2 min-w-0">
            <Clock className="h-3.5 w-3.5 text-primary/70 shrink-0" />
            <span className="truncate">{startTime} - {endTime}</span>
          </div>
        )}
      </div>

      {/* Liste des agents assignés */}
      {agents.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
            <Users className="h-3 w-3" />
            <span>Agents assignés :</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {agents.map((agent: string, idx: number) => (
              <span key={idx} className="text-[10px] bg-primary/5 text-primary border border-primary/10 rounded px-1.5 py-0.5 font-medium leading-none">
                {agent}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Barre de progression & Titre de la checklist */}
      <div className="space-y-2 pt-1 border-t border-border/40">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-muted-foreground">Liste de préparation :</span>
          <span className="font-mono text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded font-bold">
            {percentage}%
          </span>
        </div>
        
        {/* Barre de progression visuelle */}
        <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
          <div 
            className="bg-primary h-full transition-all duration-300 ease-out animate-pulse" 
            style={{ width: `${percentage}%` }}
          />
        </div>

        {/* Liste interactive des tâches */}
        <div className="space-y-1.5 pt-1.5">
          {checklist.map((item: any) => {
            const isItemUpdating = isUpdating === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleToggle(item.id, item.checked)}
                disabled={isUpdating !== null}
                className={cn(
                  "w-full flex items-center justify-between text-left p-2 rounded-lg border text-xs transition-colors hover:cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed",
                  item.checked 
                    ? "bg-primary/5 border-primary/20 text-muted-foreground" 
                    : "bg-background border-border hover:bg-muted/40 hover:border-border/100"
                )}
              >
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                    item.checked 
                      ? "bg-primary border-primary text-primary-foreground" 
                      : "border-muted-foreground/30 bg-background"
                  )}>
                    {item.checked && <Check className="h-3 w-3 stroke-[3]" />}
                  </div>
                  <span className={cn(item.checked && "line-through opacity-70")}>
                    {item.label}
                  </span>
                </div>
                {isItemUpdating && (
                  <Loader2 className="h-3 w-3 animate-spin text-primary/70 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ChatSheet() {
  const [isOpen, setIsOpen] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const firestore = useFirestore();
  const { user } = useUser();
  const { role } = useRole();

  const messagesQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'messages'), orderBy('timestamp', 'asc'), limit(50)) : null),
    [firestore]
  );

  const { data: messages, isLoading } = useCollection<ChatMessage>(messagesQuery);

  const displayRole = useMemo(() => {
    if (!role) return 'Agent';
    return role.charAt(0).toUpperCase() + role.slice(1);
  }, [role]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !firestore || !user || isSending) return;

    setIsSending(true);
    try {
      await addDoc(collection(firestore, 'messages'), {
        senderId: user.uid,
        senderName: displayRole,
        text: messageText.trim(),
        timestamp: Timestamp.now(),
      });
      setMessageText('');
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative p-2 bg-card text-primary align-middle rounded-full hover:text-white hover:bg-primary focus:outline-none">
          <MessageSquare className="h-6 w-6" />
          <span className="sr-only">Messagerie</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="flex flex-col h-full sm:max-w-md">
        <SheetHeader className="pb-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Messagerie des Agents
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 pr-4 py-4">
          <div className="space-y-4">
            {isLoading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : messages && messages.length > 0 ? (
              messages.map((msg) => {
                const isMe = msg.senderId === user?.uid;
                const isMissionMessage = msg.senderId === 'system' && msg.text.includes('"type":"mission_created"');

                if (isMissionMessage) {
                  return (
                    <div key={msg.id} className="w-full flex flex-col items-stretch">
                      <MissionChecklistCard 
                        msgId={msg.id} 
                        text={msg.text} 
                        timestamp={msg.timestamp}
                        firestore={firestore}
                      />
                      <span className="text-[10px] text-muted-foreground text-center block mt-1">
                        {(() => {
                          const d = safeToDate(msg.timestamp);
                          return d ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
                        })()}
                      </span>
                    </div>
                  );
                }

                return (
                  <div key={msg.id} className={cn("flex flex-col", isMe ? "items-end" : "items-start")}>
                    <div className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-2 text-sm",
                      isMe 
                        ? "bg-primary text-primary-foreground rounded-tr-none" 
                        : "bg-muted text-foreground rounded-tl-none"
                    )}>
                      {!isMe && <p className="text-[10px] font-bold opacity-70 mb-1">{msg.senderName}</p>}
                      <p>{msg.text}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-1 px-1">
                      {(() => {
                        const d = safeToDate(msg.timestamp);
                        return d ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
                      })()}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p>Aucun message. Soyez le premier à écrire !</p>
              </div>
            )}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>

        <form onSubmit={handleSendMessage} className="pt-4 border-t flex gap-2">
          <Input
            placeholder="Votre message..."
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            className="flex-1"
            disabled={isSending}
          />
          <Button type="submit" size="icon" disabled={!messageText.trim() || isSending}>
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
