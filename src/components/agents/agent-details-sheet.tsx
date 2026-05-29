
'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import type { Agent, Availability, Mission } from '@/lib/types';
import { User, Shield, Phone, MapPin, Briefcase } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { getDisplayStatus } from '@/lib/missions';
import Image from 'next/image';

interface AgentDetailsProps {
  agent: Agent & { availability: Availability };
  missions: Mission[];
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export function AgentDetailsSheet({ agent, missions, isOpen, onOpenChange }: AgentDetailsProps) {
  const getBadgeVariant = (availability: Availability) => {
    switch (availability) {
      case 'Disponible':
        return 'outline';
      case 'En mission':
        return 'default';
      case 'En congé':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const sortedMissions = [...missions].sort((a, b) => b.startDate.toMillis() - a.startDate.toMillis());

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[2rem] sm:max-w-2xl bg-background/95 backdrop-blur-md shadow-2xl border-primary/50 border-2 max-h-[95vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="p-6 pb-2 border-b">
          <DialogTitle className="text-xl font-bold">Profil de l'Agent</DialogTitle>
          <DialogDescription>
            Consultez les informations détaillées et le registre d'activité de l'élément.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 relative overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-6 space-y-8 pb-12">
                {/* En-tête de profil */}
                <div className="flex flex-col md:flex-row items-center md:items-start gap-6 pt-2">
                    <div className="h-32 w-32 md:h-40 md:w-40 rounded-2xl border-4 border-primary/10 overflow-hidden flex items-center justify-center bg-muted text-muted-foreground shadow-xl shrink-0">
                        {agent.photo ? (
                          <Image 
                            src={agent.photo} 
                            alt={agent.fullName} 
                            width={160} 
                            height={160} 
                            className="object-cover h-full w-full" 
                          />
                        ) : (
                          <User className="h-16 w-16 opacity-50" />
                        )}
                    </div>
                    <div className="flex-1 text-center md:text-left space-y-2">
                        <h2 className="text-3xl font-extrabold tracking-tight text-foreground">{agent.fullName}</h2>
                        <div className="flex flex-wrap justify-center md:justify-start gap-2">
                           <Badge variant="secondary" className="font-mono text-sm px-3">
                             MATRICULE : {agent.registrationNumber || 'N/A'}
                           </Badge>
                           <Badge variant={getBadgeVariant(agent.availability)} className="text-sm px-3">
                              {agent.availability}
                           </Badge>
                        </div>
                        <p className="text-muted-foreground font-medium text-sm pt-2">
                          Affecté à la brigade en tant que personnel opérationnel.
                        </p>
                    </div>
                </div>

                {/* Statistiques rapides */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10 flex flex-col items-center justify-center space-y-1">
                    <span className="text-[10px] text-primary/70 uppercase font-bold tracking-widest">Missions totales</span>
                    <div className="flex items-center gap-2 font-black text-2xl text-primary">
                       <Shield className="h-5 w-5" />
                       <span>{agent.missionCount || 0}</span>
                    </div>
                  </div>
                  <div className="bg-muted/50 p-4 rounded-2xl border flex flex-col items-center justify-center space-y-1">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Section</span>
                    <span className="font-bold text-sm text-center">{(agent.section || 'Non assigné').toUpperCase()}</span>
                  </div>
                  <div className="bg-muted/50 p-4 rounded-2xl border flex flex-col items-center justify-center space-y-1">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Grade</span>
                    <span className="font-bold text-sm">{agent.rank}</span>
                  </div>
                </div>

                {/* Détails personnels */}
                <div className="space-y-4">
                    <h3 className="text-xs font-black text-primary uppercase tracking-[0.2em] px-1">Informations Générales</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex items-center gap-4 p-4 bg-card border rounded-2xl shadow-sm">
                            <div className="bg-primary/10 p-2.5 rounded-xl">
                              <Phone className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase font-bold">Contact</p>
                              <p className="text-sm font-semibold">{agent.contact || 'Non renseigné'}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4 p-4 bg-card border rounded-2xl shadow-sm">
                            <div className="bg-primary/10 p-2.5 rounded-xl">
                              <MapPin className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase font-bold">Adresse Résidentielle</p>
                              <p className="text-sm font-semibold">{agent.address}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4 p-4 bg-card border rounded-2xl shadow-sm md:col-span-2">
                            <div className="bg-primary/10 p-2.5 rounded-xl">
                              <Briefcase className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase font-bold">Affectation Administrative</p>
                              <p className="text-sm font-semibold">{agent.rank} • Section {(agent.section || 'Non assignée').toUpperCase()}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Historique des missions */}
                <div className="space-y-4">
                    <h3 className="text-xs font-black text-primary uppercase tracking-[0.2em] px-1">Registre d'Activité (Missions)</h3>
                    <div className="border rounded-2xl overflow-hidden bg-card shadow-sm">
                         <Table>
                            <TableHeader className="bg-muted/30">
                                <TableRow>
                                    <TableHead className="text-[10px] font-bold uppercase tracking-wider">Mission</TableHead>
                                    <TableHead className="text-[10px] font-bold uppercase tracking-wider">Période</TableHead>
                                    <TableHead className="text-[10px] font-bold uppercase tracking-wider text-right">Statut</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sortedMissions.length > 0 ? (
                                    sortedMissions.map(mission => (
                                        <TableRow key={mission.id} className="hover:bg-muted/5 transition-colors">
                                            <TableCell className="py-4">
                                                <div className="font-bold text-sm leading-tight text-foreground">{mission.name}</div>
                                                <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                                                  <MapPin className="h-3 w-3 shrink-0" />
                                                  {mission.location}
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-4 text-xs font-medium whitespace-nowrap">
                                                {mission.startDate.toDate().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} 
                                                <span className="mx-1 text-muted-foreground">→</span> 
                                                {mission.endDate.toDate().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                                            </TableCell>
                                            <TableCell className="py-4 text-right">
                                                <Badge className="text-[9px] font-bold h-5 px-2 tracking-tight" variant={getDisplayStatus(mission) === 'Terminée' ? 'outline' : getDisplayStatus(mission) === 'Annulée' ? 'destructive' : 'secondary'}>
                                                    {getDisplayStatus(mission)?.toUpperCase()}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={3} className="h-32 text-center text-muted-foreground text-xs italic">
                                            <div className="flex flex-col items-center gap-2">
                                              <Shield className="h-8 w-8 opacity-10" />
                                              Aucun déploiement enregistré pour cet agent.
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                         </Table>
                    </div>
                </div>
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
