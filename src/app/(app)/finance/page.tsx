'use client';

import { useState, useMemo } from 'react';
import { ClientOnly } from '@/components/layout/client-only';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PlusCircle, CreditCard, TrendingUp, Users, Wallet, AlertCircle, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, orderBy, doc, updateDoc } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase';
import type { Expense, Allocation, Agent, Mission } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AddExpenseForm } from '@/components/finance/add-expense-form';
import { AddAllocationForm } from '@/components/finance/add-allocation-form';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Cell, Pie, PieChart } from 'recharts';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { logActivity } from '@/lib/activity-logger';

export default function FinancePage() {
  return (
    <ClientOnly>
      <FinanceContent />
    </ClientOnly>
  );
}

function FinanceContent() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isExpenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [isAllocationDialogOpen, setAllocationDialogOpen] = useState(false);

  const expensesQuery = useMemoFirebase(() => (firestore ? query(collection(firestore, 'expenses'), orderBy('date', 'desc')) : null), [firestore]);
  const allocationsQuery = useMemoFirebase(() => (firestore ? query(collection(firestore, 'allocations'), orderBy('date', 'desc')) : null), [firestore]);
  const agentsQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'agents') : null), [firestore]);
  const missionsQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'missions') : null), [firestore]);

  const { data: expenses, isLoading: expensesLoading, error: expensesError } = useCollection<Expense>(expensesQuery);
  const { data: allocations, isLoading: allocationsLoading, error: allocationsError } = useCollection<Allocation>(allocationsQuery);
  const { data: agents } = useCollection<Agent>(agentsQuery);
  const { data: missions } = useCollection<Mission>(missionsQuery);

  const agentsById = useMemo(() => {
    if (!agents) return {};
    return agents.reduce((acc, agent) => {
      acc[agent.id] = agent;
      return acc;
    }, {} as Record<string, Agent>);
  }, [agents]);

  const missionsById = useMemo(() => {
    if (!missions) return {};
    return missions.reduce((acc, mission) => {
      acc[mission.id] = mission;
      return acc;
    }, {} as Record<string, Mission>);
  }, [missions]);

  const stats = useMemo(() => {
    const totalExpenses = expenses?.filter(e => e.status === 'Validé').reduce((sum, e) => sum + e.amount, 0) || 0;
    const totalAllocations = allocations?.reduce((sum, a) => sum + a.amount, 0) || 0;
    return { totalExpenses, totalAllocations };
  }, [expenses, allocations]);

  const expensesByCategory = useMemo(() => {
    if (!expenses) return [];
    const categories: Record<string, number> = {};
    const keyMap: Record<string, string> = {
      'Opérationnel': 'operational',
      'Matériel': 'material',
      'Transport': 'transport',
      'Logistique': 'logistics',
      'Autre': 'other'
    };

    expenses.filter(e => e.status === 'Validé').forEach(e => {
      const key = keyMap[e.category] || 'other';
      categories[key] = (categories[key] || 0) + e.amount;
    });
    return Object.entries(categories).map(([name, value]) => ({ name, value }));
  }, [expenses]);

  const handleUpdateExpenseStatus = async (expense: Expense, newStatus: 'Validé' | 'Refusé') => {
    if (!firestore) return;
    try {
      // 1. Mettre à jour la dépense
      await updateDoc(doc(firestore, 'expenses', expense.id), { status: newStatus });
      
      // 2. Si liée à une anomalie logistique, mettre à jour l'anomalie
      if (expense.anomalyId) {
        await updateDoc(doc(firestore, 'vehicleAnomalies', expense.anomalyId), { financeStatus: newStatus });
      }

      toast({ 
        title: `Dépense ${newStatus}`, 
        description: `La dépense pour "${expense.description}" a été ${newStatus.toLowerCase()}.` 
      });
      logActivity(firestore, `Dépense ${newStatus.toLowerCase()} : ${expense.description}`, 'Général', '/finance');
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erreur', description: "Impossible de mettre à jour le statut." });
    }
  };

  const COLORS = ['#f97316', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6'];

  const chartConfig = {
    value: { label: "Montant (FCFA)" },
    operational: { label: "Opérationnel", color: COLORS[0] },
    material: { label: "Matériel", color: COLORS[1] },
    transport: { label: "Transport", color: COLORS[2] },
    logistics: { label: "Logistique", color: COLORS[3] },
    other: { label: "Autre", color: COLORS[4] },
  };

  const hasError = !!(expensesError || allocationsError);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Finances</h1>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" onClick={() => window.location.reload()} title="Actualiser les données">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Dialog open={isExpenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" /> Nouvelle Dépense
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Enregistrer une dépense</DialogTitle>
              </DialogHeader>
              <AddExpenseForm onSuccess={() => setExpenseDialogOpen(false)} />
            </DialogContent>
          </Dialog>
          <Dialog open={isAllocationDialogOpen} onOpenChange={setAllocationDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <PlusCircle className="mr-2 h-4 w-4" /> Nouvelle Allocation
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Nouvelle Allocation Agent</DialogTitle>
              </DialogHeader>
              <AddAllocationForm 
                agents={agents || []} 
                missions={missions || []}
                onSuccess={() => setAllocationDialogOpen(false)} 
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {hasError && (
        <Alert className="bg-primary/10 border-primary/20 text-primary">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Synchronisation en cours</AlertTitle>
          <AlertDescription>
            Les données financières sont en cours de chargement. Si cela prend plus de 5 secondes, essayez de rafraîchir la page.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="rounded-2xl border-none shadow-md bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Dépenses (Validées)</CardTitle>
            <Wallet className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalExpenses.toLocaleString('fr-FR')} FCFA</div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-none shadow-md bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Allocations</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalAllocations.toLocaleString('fr-FR')} FCFA</div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-none shadow-md bg-primary text-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-primary-foreground/80">Budget Engagé</CardTitle>
            <TrendingUp className="h-4 w-4 text-white" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(stats.totalExpenses + stats.totalAllocations).toLocaleString('fr-FR')} FCFA</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Card className="rounded-2xl border-none shadow-md bg-white">
          <CardHeader>
            <CardTitle>Répartition des Dépenses</CardTitle>
            <CardDescription>Par catégorie opérationnelle (Validées uniquement)</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {expensesByCategory.length > 0 ? (
              <ChartContainer config={chartConfig}>
                <PieChart>
                  <Pie
                    data={expensesByCategory}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    nameKey="name"
                  >
                    {expensesByCategory.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ChartContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                {expensesLoading ? "Chargement des données..." : "Pas de données validées disponibles."}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-none shadow-md bg-white">
          <CardHeader>
            <CardTitle>Dernières Activités</CardTitle>
            <CardDescription>Mouvements financiers récents</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] overflow-auto">
             <div className="space-y-4">
                {expenses?.filter(e => e.status !== 'Refusé').slice(0, 5).map(e => (
                  <div key={e.id} className="flex items-center justify-between border-b pb-2">
                    <div>
                      <p className="font-medium text-sm">{e.description}</p>
                      <p className="text-xs text-muted-foreground">{e.date.toDate().toLocaleDateString('fr-FR')}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-primary text-sm">-{e.amount.toLocaleString('fr-FR')} FCFA</p>
                      <Badge variant="outline" className="text-[10px] h-4">{e.status}</Badge>
                    </div>
                  </div>
                ))}
                {(!expenses || expenses.length === 0) && !expensesLoading && (
                  <p className="text-center text-muted-foreground py-8">Aucune activité récente.</p>
                )}
             </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="expenses" className="space-y-4">
        <TabsList className="grid w-[400px] grid-cols-2">
          <TabsTrigger value="expenses">Dépenses</TabsTrigger>
          <TabsTrigger value="allocations">Allocations Agents</TabsTrigger>
        </TabsList>
        <TabsContent value="expenses" className="space-y-4">
          <Card className="rounded-2xl border-none shadow-md bg-white">
            <CardHeader>
              <CardTitle>Historique des Dépenses</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Mission liée</TableHead>
                    <TableHead>Catégorie</TableHead>
                    <TableHead>Montant</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expensesLoading ? (
                    <TableRow><TableCell colSpan={7} className="text-center">Chargement...</TableCell></TableRow>
                  ) : expenses?.length ? (
                    expenses.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell>{e.date.toDate().toLocaleDateString('fr-FR')}</TableCell>
                        <TableCell className="font-medium">{e.description}</TableCell>
                        <TableCell>
                          {e.missionId ? (
                            <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded">
                              {missionsById[e.missionId]?.name || 'Mission inconnue'}
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell><Badge variant="outline">{e.category}</Badge></TableCell>
                        <TableCell className="font-semibold text-primary">{e.amount.toLocaleString('fr-FR')} FCFA</TableCell>
                        <TableCell>
                          <Badge variant={e.status === 'Validé' ? 'default' : e.status === 'Refusé' ? 'destructive' : 'secondary'}>
                            {e.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {e.status === 'En attente' && (
                            <div className="flex justify-end gap-2">
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="h-8 text-green-600 border-green-600 hover:bg-green-50"
                                onClick={() => handleUpdateExpenseStatus(e, 'Validé')}
                              >
                                <CheckCircle className="h-4 w-4 mr-1" /> Valider
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="h-8 text-destructive border-destructive hover:bg-destructive/10"
                                onClick={() => handleUpdateExpenseStatus(e, 'Refusé')}
                              >
                                <XCircle className="h-4 w-4 mr-1" /> Refuser
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Aucune dépense enregistrée.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="allocations" className="space-y-4">
          <Card className="rounded-2xl border-none shadow-md bg-white">
            <CardHeader>
              <CardTitle>Allocations Versées</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Motif</TableHead>
                    <TableHead>Montant</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allocationsLoading ? (
                    <TableRow><TableCell colSpan={4} className="text-center">Chargement...</TableCell></TableRow>
                  ) : allocations?.length ? (
                    allocations.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>{a.date.toDate().toLocaleDateString('fr-FR')}</TableCell>
                        <TableCell className="font-medium">{agentsById[a.agentId]?.fullName || 'Agent inconnu'}</TableCell>
                        <TableCell>{a.purpose}</TableCell>
                        <TableCell className="font-semibold text-primary">{a.amount.toLocaleString('fr-FR')} FCFA</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Aucune allocation enregistrée.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
