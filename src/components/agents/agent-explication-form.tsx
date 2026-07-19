'use client';

import { useState } from 'react';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, addDoc, doc, setDoc, Timestamp } from 'firebase/firestore';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useToast } from '@/hooks/use-toast';
import type { Agent, Explication } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { HelpCircle, Send, Clock, CheckCircle2, AlertCircle } from 'lucide-react';

interface AgentExplicationFormProps {
  agent: Agent;
  onClose: () => void;
}

export function AgentExplicationForm({ agent, onClose }: AgentExplicationFormProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [requestText, setRequestText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sanctionTexts, setSanctionTexts] = useState<Record<string, string>>({});
  const [sanctionSubmitting, setSanctionSubmitting] = useState<Record<string, boolean>>({});

  const handleSendSanction = async (expId: string) => {
    const text = sanctionTexts[expId]?.trim();
    if (!text || !firestore) {
      toast({
        variant: 'destructive',
        title: "Champ vide",
        description: "Veuillez saisir le libellé de la sanction.",
      });
      return;
    }
    setSanctionSubmitting(prev => ({ ...prev, [expId]: true }));
    try {
      const docRef = doc(firestore, 'explications', expId);
      await setDoc(docRef, {
        status: 'sanctionne',
        sanctionText: text,
        sanctionDate: Timestamp.now(),
        notifiedAgentSanction: false, // will notify the agent
        notifiedAdmin: true, // admin acknowledged it
      }, { merge: true });

      toast({
        title: "Sanction envoyée",
        description: "La sanction a été notifiée à l'agent avec succès.",
      });
    } catch (error) {
      console.error('Error sending sanction:', error);
      toast({
        variant: 'destructive',
        title: "Erreur",
        description: "Impossible d'enregistrer la sanction.",
      });
    } finally {
      setSanctionSubmitting(prev => ({ ...prev, [expId]: false }));
    }
  };

  // Fetch all explanation requests for this agent
  const explicationsQuery = useMemoFirebase(() => {
    if (!firestore || !agent) return null;
    return query(
      collection(firestore, 'explications'),
      where('agentId', '==', agent.id)
    );
  }, [firestore, agent]);

  const { data: explications, isLoading: explicationsLoading } = useCollection<Explication>(explicationsQuery);

  // Submit a new request
  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestText.trim() || !firestore || !agent) return;

    setIsSubmitting(true);
    try {
      await addDoc(collection(firestore, 'explications'), {
        agentId: agent.id,
        agentName: agent.fullName,
        requestText: requestText.trim(),
        requestDate: Timestamp.now(),
        replyText: '',
        replyDate: null,
        status: 'en_attente',
        notifiedAgent: false,
        notifiedAdmin: false,
      });

      setRequestText('');
      toast({
        title: "Demande envoyée",
        description: `La demande d'explication a été envoyée à l'agent ${agent.fullName}.`,
      });
    } catch (error) {
      console.error('Error sending explanation request:', error);
      toast({
        variant: 'destructive',
        title: "Erreur",
        description: "Impossible d'envoyer la demande d'explication.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Acknowledge a reply
  const handleAcknowledge = async (expId: string) => {
    if (!firestore) return;
    try {
      const docRef = doc(firestore, 'explications', expId);
      await setDoc(docRef, {
        notifiedAdmin: true,
      }, { merge: true });

      toast({
        title: "Explication prise en compte",
        description: "Vous avez validé la réception de la réponse de l'agent.",
      });
    } catch (error) {
      console.error('Error acknowledging explanation:', error);
      toast({
        variant: 'destructive',
        title: "Erreur",
        description: "Impossible de valider la réponse.",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-muted-foreground">Destinataire :</h3>
        <p className="text-base font-bold text-foreground flex items-center gap-2">
          <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs uppercase font-mono">
            {agent.rank || 'Agent'}
          </span>
          {agent.fullName}
        </p>
        {agent.registrationNumber && (
          <p className="text-xs text-muted-foreground font-mono">Matricule: {agent.registrationNumber}</p>
        )}
      </div>

      <form onSubmit={handleSendRequest} className="space-y-4 bg-muted/20 p-4 rounded-2xl border border-border">
        <div className="space-y-2">
          <label htmlFor="explanation-reason" className="text-xs font-bold text-foreground">
            Motif de la demande d'explication *
          </label>
          <Textarea
            id="explanation-reason"
            placeholder="Ex: Justification de votre retard à la réunion du matin ou absence non autorisée..."
            value={requestText}
            onChange={(e) => setRequestText(e.target.value)}
            rows={3}
            className="bg-background text-sm resize-none"
            required
          />
        </div>
        <Button
          type="submit"
          size="sm"
          className="w-full font-semibold gap-2"
          disabled={isSubmitting || !requestText.trim()}
        >
          {isSubmitting ? (
            <span>Envoi en cours...</span>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Envoyer la demande d'explication
            </>
          )}
        </Button>
      </form>

      <div className="space-y-4">
        <h4 className="text-sm font-black text-primary uppercase tracking-wider">Historique des demandes</h4>
        
        {explicationsLoading ? (
          <p className="text-xs text-muted-foreground italic">Chargement de l'historique...</p>
        ) : explications && explications.length > 0 ? (
          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
            {[...explications]
              .sort((a, b) => {
                const dateA = a.requestDate?.seconds || 0;
                const dateB = b.requestDate?.seconds || 0;
                return dateB - dateA;
              })
              .map((exp) => (
                <div key={exp.id} className="p-3.5 rounded-xl border bg-card text-xs space-y-3 shadow-sm">
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-muted-foreground font-mono">
                      Demandé le {exp.requestDate?.toDate().toLocaleDateString('fr-FR')}
                    </span>
                    <Badge
                      variant={exp.status === 'en_attente' ? 'outline' : exp.status === 'sanctionne' ? 'destructive' : 'secondary'}
                      className={
                        exp.status === 'en_attente'
                          ? 'text-orange-600 bg-orange-500/10 border-orange-500/20'
                          : exp.status === 'sanctionne'
                          ? 'text-red-600 bg-red-500/10 border-red-500/20'
                          : 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20'
                      }
                    >
                      {exp.status === 'en_attente' ? 'En attente' : exp.status === 'sanctionne' ? 'Sanctionné' : 'Répondu'}
                    </Badge>
                  </div>

                  <div className="space-y-1">
                    <span className="text-muted-foreground font-semibold">Demande :</span>
                    <p className="font-bold bg-muted/40 p-2.5 rounded text-foreground">
                      « {exp.requestText} »
                    </p>
                  </div>

                  {exp.status === 'repondu' && exp.replyText && (
                    <div className="space-y-2 pt-2.5 border-t border-border mt-2">
                      <div className="flex justify-between items-center">
                        <span className="text-primary font-bold flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          Réponse de l'agent :
                        </span>
                        {!exp.notifiedAdmin && (
                          <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20 text-[10px] py-0 px-1.5 font-bold animate-pulse">
                            Nouveau
                          </Badge>
                        )}
                      </div>
                      <p className="italic bg-primary/5 p-2.5 rounded text-foreground font-medium leading-relaxed">
                        « {exp.replyText} »
                      </p>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        Le {exp.replyDate?.toDate().toLocaleDateString('fr-FR')} à {exp.replyDate?.toDate().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </div>

                      {/* Formulaire de sanction */}
                      <div className="bg-orange-500/5 border border-orange-500/20 p-3 rounded-xl space-y-2 mt-2">
                        <span className="text-xs font-bold text-orange-600 flex items-center gap-1">
                          <AlertCircle className="h-3.5 w-3.5" />
                          Appliquer une sanction administrative
                        </span>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <select
                            className="bg-background text-xs border rounded-lg px-2 py-1"
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val) {
                                setSanctionTexts(prev => ({ ...prev, [exp.id]: val }));
                              }
                            }}
                            defaultValue=""
                          >
                            <option value="" disabled>Motifs rapides...</option>
                            <option value="Avertissement de conduite formel">Avertissement</option>
                            <option value="Blâme inscrit au dossier de l'agent">Blâme</option>
                            <option value="Suspension administrative temporaire de 3 jours">Suspension de 3 jours</option>
                            <option value="Mise à pied conservatoire avec suspension de solde">Mise à pied</option>
                            <option value="Retrait immédiat de la mission actuelle">Retrait de mission</option>
                          </select>
                          <input
                            type="text"
                            placeholder="Saisissez ou modifiez la sanction..."
                            value={sanctionTexts[exp.id] || ''}
                            onChange={(e) => setSanctionTexts(prev => ({ ...prev, [exp.id]: e.target.value }))}
                            className="bg-background text-xs border rounded-lg px-2 py-1.5 flex-1"
                          />
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                          {!exp.notifiedAdmin && (
                            <Button
                              size="xs"
                              variant="ghost"
                              className="h-6 text-[10px] font-bold"
                              onClick={() => handleAcknowledge(exp.id)}
                            >
                              Prendre acte sans sanction
                            </Button>
                          )}
                          <Button
                            size="xs"
                            className="h-6 text-[10px] font-bold bg-orange-600 hover:bg-orange-500 text-white animate-pulse"
                            onClick={() => handleSendSanction(exp.id)}
                            disabled={sanctionSubmitting[exp.id] || !sanctionTexts[exp.id]?.trim()}
                          >
                            {sanctionSubmitting[exp.id] ? "Envoi..." : "Envoyer la sanction"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {exp.status === 'sanctionne' && (
                    <div className="space-y-2 pt-2.5 border-t border-border mt-2">
                      <div className="text-primary font-bold flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        Réponse de l'agent :
                      </div>
                      <p className="italic bg-primary/5 p-2.5 rounded text-foreground font-medium">
                        « {exp.replyText} »
                      </p>
                      <div className="bg-destructive/5 border border-destructive/20 p-2.5 rounded-xl text-destructive mt-1">
                        <div className="font-bold flex items-center gap-1 text-[11px] uppercase tracking-wider">
                          <AlertCircle className="h-3.5 w-3.5" />
                          Sanction administrative appliquée :
                        </div>
                        <p className="font-semibold text-foreground text-xs mt-1">
                          « {exp.sanctionText} »
                        </p>
                        {exp.sanctionDate && (
                          <div className="text-[9px] text-muted-foreground font-mono text-right mt-1">
                            Appliquée le {exp.sanctionDate.toDate().toLocaleDateString('fr-FR')} à {exp.sanctionDate.toDate().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic bg-muted/10 p-4 rounded-xl border border-dashed text-center">
            Aucune demande d'explication envoyée à cet agent.
          </p>
        )}
      </div>

      <div className="flex justify-end pt-2 border-t border-border">
        <Button size="sm" variant="outline" onClick={onClose}>
          Fermer
        </Button>
      </div>
    </div>
  );
}
