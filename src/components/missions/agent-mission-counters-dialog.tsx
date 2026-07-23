'use client';

import { useState, useMemo } from 'react';
import type { Agent, Mission } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, RefreshCw, Plus, Minus, Save, CheckCircle2, Shield } from 'lucide-react';
import { useFirestore } from '@/firebase';
import { doc, updateDoc, writeBatch } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { logActivity } from '@/lib/activity-logger';

interface AgentMissionCountersDialogProps {
  agents: Agent[];
  missions: Mission[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AgentMissionCountersDialog({
  agents,
  missions,
  isOpen,
  onOpenChange,
}: AgentMissionCountersDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingCounts, setEditingCounts] = useState<Record<string, number>>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState<string | null>(null);
  const firestore = useFirestore();
  const { toast } = useToast();

  // Completed missions from DB per agent
  const calculatedCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const agent of agents) {
      counts[agent.id] = 0;
    }
    for (const m of missions) {
      if (m.status === 'Terminée' && Array.isArray(m.assignedAgentIds)) {
        for (const agentId of m.assignedAgentIds) {
          counts[agentId] = (counts[agentId] || 0) + 1;
        }
      }
    }
    return counts;
  }, [agents, missions]);

  const filteredAgents = useMemo(() => {
    return agents.filter((agent) => {
      const q = searchQuery.toLowerCase();
      return (
        (agent.fullName || '').toLowerCase().includes(q) ||
        (agent.registrationNumber || '').toLowerCase().includes(q) ||
        (agent.section || '').toLowerCase().includes(q) ||
        (agent.rank || '').toLowerCase().includes(q)
      );
    });
  }, [agents, searchQuery]);

  const getAgentCount = (agent: Agent) => {
    if (editingCounts[agent.id] !== undefined) {
      return editingCounts[agent.id];
    }
    return agent.missionCount !== undefined
      ? agent.missionCount
      : calculatedCounts[agent.id] || 0;
  };

  const handleCountChange = (agentId: string, value: number) => {
    setEditingCounts((prev) => ({
      ...prev,
      [agentId]: Math.max(0, value),
    }));
  };

  const handleSaveIndividual = async (agent: Agent) => {
    if (!firestore) return;
    const newCount = getAgentCount(agent);
    setIsSaving(agent.id);
    try {
      const agentRef = doc(firestore, 'agents', agent.id);
      await updateDoc(agentRef, { missionCount: newCount });
      toast({
        title: 'Compteur mis à jour',
        description: `Compteur de missions de ${agent.fullName} défini à ${newCount}.`,
      });
      logActivity(
        firestore,
        `Compteur de missions de ${agent.fullName} mis à jour à ${newCount}.`,
        'Agent',
        '/agents'
      );
    } catch (err) {
      console.error(err);
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: 'Impossible de mettre à jour le compteur.',
      });
    } finally {
      setIsSaving(null);
    }
  };

  const handleSyncAll = async () => {
    if (!firestore || agents.length === 0) return;
    setIsSyncing(true);
    try {
      const batch = writeBatch(firestore);
      let updatedCount = 0;
      for (const agent of agents) {
        const dbCalculated = calculatedCounts[agent.id] || 0;
        const agentRef = doc(firestore, 'agents', agent.id);
        batch.update(agentRef, { missionCount: dbCalculated });
        updatedCount++;
      }
      await batch.commit();

      // Reset local edits
      setEditingCounts({});

      toast({
        title: 'Compteurs synchronisés',
        description: `Les compteurs de ${updatedCount} agents ont été recalculés d'après leurs missions enregistrées comme "Terminée".`,
      });
      logActivity(
        firestore,
        `Synchronisation globale des compteurs de missions pour ${updatedCount} agents.`,
        'Mission',
        '/missions'
      );
    } catch (err) {
      console.error(err);
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: 'Échec de la synchronisation des compteurs.',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <Shield className="h-5 w-5 text-primary" />
            Compteurs & Bilan des Missions Effectuées par Agent
          </DialogTitle>
          <DialogDescription>
            Consultez et ajustez le nombre de missions accomplies par chaque agent. Utilisez la synchronisation pour aligner les compteurs avec l'historique des missions enregistrées comme terminées.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 my-2">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-10"
              placeholder="Rechercher par nom, matricule, section..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <Button
            variant="outline"
            onClick={handleSyncAll}
            disabled={isSyncing}
            className="w-full sm:w-auto border-primary/30 hover:bg-primary/10"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            Recalculer / Synchroniser tous les compteurs
          </Button>
        </div>

        <div className="border rounded-lg overflow-y-auto max-h-[50vh] flex-1">
          <Table>
            <TableHeader className="bg-muted/50 sticky top-0 z-10">
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Section / Détachement</TableHead>
                <TableHead className="text-center">Missions terminées (BD)</TableHead>
                <TableHead className="text-center">Compteur officiel</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAgents.length > 0 ? (
                filteredAgents.map((agent) => {
                  const currentCount = getAgentCount(agent);
                  const dbCalculated = calculatedCounts[agent.id] || 0;
                  const isModified = editingCounts[agent.id] !== undefined;

                  return (
                    <TableRow key={agent.id} className="hover:bg-muted/30">
                      <TableCell>
                        <div className="font-semibold text-foreground">{agent.fullName}</div>
                        <div className="text-xs text-muted-foreground">
                          {agent.rank || 'Agent'} • {agent.registrationNumber || 'Sans matricule'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {agent.section || 'Non assigné'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full text-xs">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {dbCalculated} mission(s)
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleCountChange(agent.id, currentCount - 1)}
                            disabled={currentCount <= 0}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <Input
                            type="number"
                            min="0"
                            value={currentCount}
                            onChange={(e) => handleCountChange(agent.id, parseInt(e.target.value) || 0)}
                            className="w-16 text-center h-8 font-bold text-sm"
                          />
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleCountChange(agent.id, currentCount + 1)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant={isModified ? 'default' : 'ghost'}
                          onClick={() => handleSaveIndividual(agent)}
                          disabled={isSaving === agent.id}
                          className="h-8 text-xs"
                        >
                          <Save className="mr-1.5 h-3.5 w-3.5" />
                          {isSaving === agent.id ? 'Sauvegarde...' : 'Enregistrer'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Aucun agent trouvé.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
