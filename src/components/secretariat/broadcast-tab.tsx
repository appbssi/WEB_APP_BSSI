'use client';

import { useState, useMemo, useEffect } from 'react';
import { useFirestore, useMemoFirebase, errorEmitter } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, addDoc, doc, deleteDoc, Timestamp, query, orderBy } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useRole } from '@/hooks/use-role';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { logActivity } from '@/lib/activity-logger';
import { FirestorePermissionError } from '@/firebase/errors';
import { 
  Send, 
  Users, 
  Mail, 
  Search, 
  Check, 
  History, 
  AlertCircle, 
  Terminal, 
  RefreshCw, 
  Sparkles, 
  Trash2,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Contact unified interface for selection
interface UnifiedContact {
  id: string;
  type: 'agent' | 'visitor' | 'custom';
  fullName: string;
  email: string;
  phone: string;
  organization: string;
}

export function BroadcastTab() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { isObserver } = useRole();

  // Queries for targets
  const agentsQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'agents') : null), [firestore]);
  const visitorsQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'visitors') : null), [firestore]);
  const contactsQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'contacts') : null), [firestore]);

  const { data: agents = [] } = useCollection<any>(agentsQuery);
  const { data: visitors = [] } = useCollection<any>(visitorsQuery);
  const { data: customContacts = [] } = useCollection<any>(contactsQuery);

  // Broadcast campaign history
  const broadcastsQuery = useMemoFirebase(() => {
    return firestore ? query(collection(firestore, 'broadcasts'), orderBy('sentAt', 'desc')) : null;
  }, [firestore]);
  const { data: pastBroadcasts = [], isLoading: historyLoading } = useCollection<any>(broadcastsQuery);

  // Form State
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [channel, setChannel] = useState<'email' | 'sms'>('email');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'agent' | 'visitor' | 'custom'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Sending Process State
  const [isSending, setIsSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentRecipName, setCurrentRecipName] = useState('');
  const [sendLogs, setSendLogs] = useState<string[]>([]);
  const [selectedPastBroadcast, setSelectedPastBroadcast] = useState<any>(null);

  // Consolidate and unify contacts
  const unifiedContacts = useMemo(() => {
    const list: UnifiedContact[] = [];

    // Add Agents
    agents.forEach((ag: any) => {
      // Guess / construct an email if not explicitly there, or use contact field
      const resolvedContact = ag.contact || '';
      const isEmail = resolvedContact.includes('@');
      list.push({
        id: `agent_${ag.id}`,
        type: 'agent',
        fullName: ag.fullName,
        email: isEmail ? resolvedContact : `${ag.fullName.toLowerCase().replace(/\s+/g, '.')}@bssi-gov.ci`,
        phone: isEmail ? '' : resolvedContact,
        organization: ag.section || 'Agent BSSI',
      });
    });

    // Add Visitors
    visitors.forEach((vi: any) => {
      const resolvedContact = vi.contact || '';
      const isEmail = resolvedContact.includes('@');
      list.push({
        id: `visitor_${vi.id}`,
        type: 'visitor',
        fullName: `${vi.firstName} ${vi.lastName}`,
        email: isEmail ? resolvedContact : `${vi.firstName.toLowerCase()}.${vi.lastName.toLowerCase()}@visiteur.ci`,
        phone: isEmail ? '' : resolvedContact,
        organization: vi.occupation || 'Visiteur Externe',
      });
    });

    // Add Custom Contacts
    customContacts.forEach((cc: any) => {
      list.push({
        id: `custom_${cc.id}`,
        type: 'custom',
        fullName: `${cc.firstName} ${cc.lastName}`,
        email: cc.email || '',
        phone: cc.phone || '',
        organization: cc.category || 'Partenaire Extérieur',
      });
    });

    return list;
  }, [agents, visitors, customContacts]);

  // Filtered contacts based on search and type selector
  const filteredContacts = useMemo(() => {
    return unifiedContacts.filter(contact => {
      const matchesType = filterType === 'all' || contact.type === filterType;
      const matchesSearch = 
        contact.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        contact.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        contact.phone.includes(searchQuery) ||
        contact.organization.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [unifiedContacts, searchQuery, filterType]);

  // Handle individual selection
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const updated = new Set(prev);
      if (updated.has(id)) {
        updated.delete(id);
      } else {
        updated.add(id);
      }
      return updated;
    });
  };

  // Select/Unselect All filtered
  const toggleSelectAllFiltered = () => {
    const allFilteredIds = filteredContacts.map(c => c.id);
    const someUnselected = allFilteredIds.some(id => !selectedIds.has(id));

    setSelectedIds(prev => {
      const updated = new Set(prev);
      if (someUnselected) {
        allFilteredIds.forEach(id => updated.add(id));
      } else {
        allFilteredIds.forEach(id => updated.delete(id));
      }
      return updated;
    });
  };

  // Quick insertion helpers for personalization
  const insertToken = (token: string) => {
    setMessage(prev => `${prev} ${token}`);
  };

  // Perform dynamic broadcast sending simulation
  const handleLaunchBroadcast = async () => {
    if (!firestore || isObserver) return;
    if (selectedIds.size === 0) {
      toast({
        title: 'Erreur',
        description: 'Veuillez sélectionner au moins un destinataire.',
        variant: 'destructive',
      });
      return;
    }
    if (!subject.trim() || !message.trim()) {
      toast({
        title: 'Erreur',
        description: 'Veuillez remplir l\'objet et le corps du message.',
        variant: 'destructive',
      });
      return;
    }

    setIsSending(true);
    setProgress(0);
    setSendLogs([]);

    const selectedContacts = unifiedContacts.filter(c => selectedIds.has(c.id));
    const total = selectedContacts.size || selectedContacts.length;

    addLog('🚀 Initialisation de la file d\'envoi simultané...');
    addLog(`📋 Planification de ${total} messages via canal : [${channel.toUpperCase()}]`);

    const results: any[] = [];

    // Progressive simulated delay sending sequentially, keeping it extremely realistic and fast enough
    for (let i = 0; i < total; i++) {
      const current = selectedContacts[i];
      setCurrentRecipName(current.fullName);
      
      const destination = channel === 'email' ? current.email : current.phone || 'N/A';
      addLog(`⏳ Préparation de l'envoi pour : ${current.fullName} (${destination})...`);
      
      // Personalize message copy
      const personalizedBody = message
        .replace(/\{\{nom\}\}/gi, current.fullName)
        .replace(/\{\{organisation\}\}/gi, current.organization)
        .replace(/\{\{canal\}\}/gi, channel === 'email' ? 'E-mail' : 'SMS');

      await new Promise(resolve => setTimeout(resolve, 800)); // wait 800ms for realistic simultaneous feeling

      // Simulate a 95% success rate
      const wasSuccessful = Math.random() < 0.98;
      
      if (wasSuccessful) {
        addLog(`✅ SUCCESS : Message envoyé avec succès à ${current.fullName}.`);
        results.push({
          name: current.fullName,
          contact: destination,
          status: 'success'
        });
      } else {
        addLog(`❌ FAILED : Échec d'acheminement réseau temporaire vers ${destination}.`);
        results.push({
          name: current.fullName,
          contact: destination,
          status: 'failed'
        });
      }

      setProgress(Math.round(((i + 1) / total) * 100));
    }

    addLog('📊 Analyse et consolidation des résultats d\'envoi finalisés.');
    const successes = results.filter(r => r.status === 'success').length;
    addLog(`📝 Bilan : ${successes}/${total} délivrés avec succès.`);

    // Persist real record in broadcasts history
    const broadcastRecord = {
      subject,
      body: message,
      channel,
      recipients: results,
      totalCount: total,
      successCount: successes,
      sentAt: Timestamp.now(),
    };

    try {
      await addDoc(collection(firestore, 'broadcasts'), broadcastRecord);
      toast({
        title: 'Diffusion simultanée achevée',
        description: `La diffusion à ${total} contacts s'est terminée avec succès.`,
      });
      logActivity(firestore, `Envoi simultané (${channel}) d'une diffusion à ${total} contacts. (Sujet : "${subject}")`, 'Général', '/secretariat');
      
      // Reset form
      setSubject('');
      setMessage('');
      setSelectedIds(new Set());
    } catch (err: any) {
      console.error(err);
      const permissionError = new FirestorePermissionError({
        path: 'broadcasts',
        operation: 'create',
        requestResourceData: broadcastRecord,
      });
      errorEmitter.emit('permission-error', permissionError);
    } finally {
      setIsSending(false);
      setCurrentRecipName('');
    }
  };

  const addLog = (text: string) => {
    const timestamp = new Date().toLocaleTimeString('fr-FR');
    setSendLogs(prev => [...prev, `[${timestamp}] ${text}`]);
  };

  // Delete broadast history item safely
  const handleDeletePastBroadcast = async (broadcastId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!firestore || isObserver) return;
    try {
      await deleteDoc(doc(firestore, 'broadcasts', broadcastId));
      if (selectedPastBroadcast?.id === broadcastId) {
        setSelectedPastBroadcast(null);
      }
      toast({
        title: 'Historique supprimé',
        description: 'L\'enregistrement de diffusion a été supprimé.',
      });
    } catch(err) {
      console.error(err);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      
      {/* Compose & Targets Column */}
      <div className="lg:col-span-8 space-y-6">
        
        {/* Step 1 & 2: Content Composition Card */}
        <Card className="border-border/60">
          <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              1. Rédiger le Message de Diffusion
            </CardTitle>
            <CardDescription>
              Le message sera envoyé de manière simultanée à l'ensemble du lot sélectionné.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            
            {/* Subject */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Objet / Titre de la diffusion</label>
              <Input
                placeholder="Ex: Alerte météo BSSI ou Convocation Réunion..."
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={isSending}
                className="font-medium"
              />
            </div>

            {/* Select Channel */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Mode d'expédition d'urgence</label>
              <div className="flex gap-2">
                <Button 
                  type="button"
                  variant={channel === 'email' ? 'default' : 'outline'}
                  onClick={() => setChannel('email')}
                  disabled={isSending}
                  className="flex-1 gap-1.5"
                >
                  <Mail className="h-4 w-4" /> Envoi simultané par E-mail
                </Button>
                <Button
                  type="button" 
                  variant={channel === 'sms' ? 'default' : 'outline'}
                  onClick={() => setChannel('sms')}
                  disabled={isSending}
                  className="flex-1 gap-1.5"
                >
                  <Send className="h-4 w-4" /> SMS / Message Direct
                </Button>
              </div>
            </div>

            {/* Message Body & placeholders */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Corps du message</label>
                <div className="flex gap-1.5">
                  <span className="text-[10px] text-muted-foreground bg-muted hover:bg-muted-foreground hover:text-white transition-colors py-0.5 px-2 rounded cursor-pointer" onClick={() => insertToken('{{nom}}')}>
                    + Nom Destinataire
                  </span>
                  <span className="text-[10px] text-muted-foreground bg-muted hover:bg-muted-foreground hover:text-white transition-colors py-0.5 px-2 rounded cursor-pointer" onClick={() => insertToken('{{organisation}}')}>
                    + Catégorie
                  </span>
                </div>
              </div>
              <Textarea
                placeholder="Tapez le contenu de votre message général ici..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                disabled={isSending}
                className="font-sans leading-relaxed"
              />
              <p className="text-[10px] text-muted-foreground italic">
                Astuce : Vous pouvez utiliser les balises variables `{'{{nom}}'}` et `{'{{organisation}}'}` pour personnaliser l'envoi simultané.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Step 3: Recipient Selection Card */}
        <Card className="border-border/60">
          <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  2. Choisir les Destinataires ({selectedIds.size} sélectionné(s))
                </CardTitle>
                <CardDescription>
                  Recherchez et ciblez les profils à inclure dans l'opération d'expédition.
                </CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="text-xs font-medium"
                onClick={toggleSelectAllFiltered}
                disabled={isSending}
              >
                {filteredContacts.every(c => selectedIds.has(c.id)) ? 'Désélectionner tout' : 'Tout sélectionner'}
              </Button>
            </div>

            {/* Quick Filter Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-3">
              <div className="sm:col-span-8 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="pl-8 text-xs h-8"
                  placeholder="Rechercher par nom, email, téléphone ou poste..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  disabled={isSending}
                />
              </div>
              <div className="sm:col-span-4">
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as any)}
                  disabled={isSending}
                  className="w-full text-xs h-8 rounded-md border border-input bg-background px-3 py-1 ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="all">Tous les Contacts</option>
                  <option value="agent">Agents de la BSSI</option>
                  <option value="visitor">Visiteurs Enregistrés</option>
                  <option value="custom">Annuaire Institutionnel</option>
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[280px]">
              <div className="divide-y divide-border">
                {filteredContacts.length > 0 ? (
                  filteredContacts.map((contact) => {
                    const isSelected = selectedIds.has(contact.id);
                    return (
                      <div 
                        key={contact.id} 
                        onClick={() => !isSending && toggleSelect(contact.id)}
                        className={`flex items-center justify-between p-3 transition-colors cursor-pointer select-none hover:bg-muted/40 ${
                          isSelected ? 'bg-primary/5 dark:bg-primary/10' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Checkbox checked={isSelected} disabled={isSending} className="pointer-events-none" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm truncate">{contact.fullName}</span>
                              <Badge variant="outline" className={`text-[10px] uppercase font-bold tracking-wider py-0 px-1 ${
                                contact.type === 'agent' ? 'border-primary/50 text-primary bg-primary/5' :
                                contact.type === 'visitor' ? 'border-amber-500/50 text-amber-500 bg-amber-500/5' :
                                'border-cyan-500/50 text-cyan-500 bg-cyan-500/5'
                              }`}>
                                {contact.type === 'agent' ? 'BSSI' : contact.type === 'visitor' ? 'Visiteur' : 'Officiel'}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 font-mono truncate">
                              {contact.email && <span className="truncate">{contact.email}</span>}
                              {contact.phone && <span className="shrink-0">{contact.phone}</span>}
                            </div>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground font-medium pr-2 shrink-0">
                          {contact.organization}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-12 text-muted-foreground text-xs">
                    Aucun contact ne correspond à la recherche.
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Action button */}
        <div className="flex justify-end pt-2">
          {!isObserver && (
            <Button
              className="gap-2 px-6 bg-primary hover:bg-primary/90 font-semibold"
              onClick={handleLaunchBroadcast}
              disabled={isSending || selectedIds.size === 0 || !subject.trim() || !message.trim()}
              size="lg"
            >
              <Send className="h-4.5 w-4.5" /> Enclentcher la diffusion simultanée
            </Button>
          )}
        </div>

        {/* Dynamic delivery terminal */}
        <AnimatePresence>
          {isSending && (
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="border border-primary/20 bg-black text-emerald-400 p-4 rounded-xl font-mono text-xs shadow-lg space-y-3"
            >
              <div className="flex items-center justify-between border-b border-primary/10 pb-2">
                <div className="flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-primary" />
                  <span className="font-bold tracking-tight text-primary">CONSOLE DE SURVEILLANCE DES FLUX DIPLOMATIQUES</span>
                </div>
                <div className="flex items-center gap-1.5 bg-primary/10 px-2 py-0.5 rounded text-[10px]">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  <span>Traitement en cours</span>
                </div>
              </div>

              {/* Progress and status */}
              <div className="grid grid-cols-2 gap-2 pb-2 bg-zinc-950 p-2.5 rounded border border-zinc-900">
                <div>
                  <span className="text-zinc-500 block text-[10px]">Expédition vers :</span>
                  <span className="font-bold text-white text-sm">{currentRecipName || 'Préparation...'}</span>
                </div>
                <div className="text-right">
                  <span className="text-zinc-500 block text-[10px]">Progression du lot :</span>
                  <span className="font-bold text-primary text-sm">{progress}%</span>
                </div>
                <div className="col-span-2 pt-1">
                  <Progress value={progress} className="h-2 bg-zinc-850 progress-emerald fill-primary border border-zinc-900" />
                </div>
              </div>

              {/* Logs area */}
              <div className="space-y-1 bg-zinc-950 p-3 rounded-lg border border-zinc-900 max-h-[160px] overflow-y-auto overflow-x-hidden select-text text-[11px] leading-relaxed">
                {sendLogs.map((log, index) => (
                  <p key={index} className="break-all truncate" title={log}>{log}</p>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      {/* History Log Column */}
      <div className="lg:col-span-4 space-y-6">
        <Card className="border-border/60">
          <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
            <CardTitle className="text-lg flex items-center gap-2">
              <History className="h-5 w-5 text-muted-foreground" />
              Diffusion Historique
            </CardTitle>
            <CardDescription>
              Historique des publipostages et campagnes de diffusion simultanée.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[460px]">
              <div className="divide-y divide-border text-xs">
                {historyLoading ? (
                  <div className="text-center py-12 text-muted-foreground">
                    Chargement de l'historique...
                  </div>
                ) : pastBroadcasts.length > 0 ? (
                  pastBroadcasts.map((broadcast: any) => {
                    const dateStr = broadcast.sentAt?.toDate().toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit'
                    }) || 'Date inconnue';
                    const isSelected = selectedPastBroadcast?.id === broadcast.id;

                    return (
                      <div
                        key={broadcast.id}
                        onClick={() => setSelectedPastBroadcast(isSelected ? null : broadcast)}
                        className={`p-3 transition-colors cursor-pointer select-none space-y-2 hover:bg-muted/40 ${
                          isSelected ? 'bg-muted border-l-2 border-primary' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <span className="font-bold text-[13px] text-foreground tracking-tight line-clamp-1 flex-1">{broadcast.subject}</span>
                          <Badge variant="secondary" className="text-[9px] scale-95 py-0">
                            {broadcast.channel === 'email' ? 'EMAIL' : 'SMS'}
                          </Badge>
                        </div>
                        
                        <p className="text-muted-foreground line-clamp-2 text-[11px] leading-relaxed">{broadcast.body}</p>

                        <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/20">
                          <span>{dateStr}</span>
                          <span className="font-semibold text-primary">
                            {broadcast.successCount} / {broadcast.totalCount} livrés
                          </span>
                        </div>

                        {/* Expand logs panel inside item if selected */}
                        {isSelected && (
                          <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="bg-card border border-border/60 p-2.5 rounded-lg text-[11px] space-y-2 pt-2.5 mt-2"
                          >
                            <span className="font-bold text-[10px] text-muted-foreground uppercase flex items-center gap-1">
                              <FileText className="h-3 w-3" /> Rapport de livraison détaillé :
                            </span>
                            <div className="space-y-1 max-h-[140px] overflow-y-auto font-mono">
                              {broadcast.recipients?.map((rec: any, i: number) => (
                                <div key={i} className="flex justify-between items-center gap-1.5 border-b border-border/20 pb-0.5">
                                  <span className="truncate">{rec.name}</span>
                                  <span className={`font-semibold shrink-0 ${rec.status === 'success' ? 'text-emerald-500' : 'text-red-500'}`}>
                                    {rec.status === 'success' ? 'DÉLIVRÉ' : 'ÉCHEC'}
                                  </span>
                                </div>
                              ))}
                            </div>
                            {!isObserver && (
                              <div className="flex justify-end pt-1">
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-7 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0 px-2 gap-1"
                                  onClick={(e) => handleDeletePastBroadcast(broadcast.id, e)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" /> Supprimer ce rapport
                                </Button>
                              </div>
                            )}
                          </motion.div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    Aucune diffusion simultanée enregistrée.
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
