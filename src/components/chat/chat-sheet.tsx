
'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageSquare, Send, User, Loader2 } from 'lucide-react';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit, addDoc, Timestamp } from 'firebase/firestore';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useRole } from '@/hooks/use-role';
import { useUser } from '@/firebase';
import { ChatMessage } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

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
                      {msg.timestamp?.toDate().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
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
