
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

  const sortedMissions = [...missions].sort((a, b) => {
    const timeA = typeof a.startDate?.toMillis === 'function' ? a.startDate.toMillis() : new Date(a.startDate as any).getTime();
    const timeB = typeof b.startDate?.toMillis === 'function' ? b.startDate.toMillis() : new Date(b.startDate as any).getTime();
    return timeB - timeA;
  });

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl sm:rounded-[2rem] w-[95vw] sm:w-full sm:max-w-2xl bg-background/95 backdrop-blur-md shadow-2xl border-primary/50 border-2 max-h-[92vh] sm:max-h-[95vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="p-4 sm:p-6 pb-2 border-b">
          <DialogTitle className="text-lg sm:text-xl font-bold">Profil de l'Agent</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Consultez les informations détaillées et le registre d'activité de l'élément.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 relative overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 sm:p-6 space-y-6 sm:space-y-8 pb-10 sm:pb-12">
                {/* En-tête de profil */}
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6 pt-1 sm:pt-2">
                    <div className="h-28 w-28 sm:h-32 sm:w-32 md:h-36 md:w-36 rounded-2xl border-4 border-primary/10 overflow-hidden flex items-center justify-center bg-muted text-muted-foreground shadow-lg shrink-0">
                        {agent.photo ? (
                          <Image 
                            src={agent.photo} 
                            alt={agent.fullName} 
                            width={144} 
                            height={144} 
                            className="object-cover h-full w-full" 
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <User className="h-14 w-14 opacity-50" />
                        )}
                    </div>
                    <div className="flex-1 text-center sm:text-left space-y-2 min-w-0">
                        <h2 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight text-foreground break-words">{agent.fullName}</h2>
                        <div className="flex flex-wrap justify-center sm:justify-start gap-1.5 sm:gap-2">
                           <Badge variant="secondary" className="font-mono text-[10px] sm:text-xs px-2.5 py-0.5">
                             MATRICULE : {agent.registrationNumber || 'N/A'}
                           </Badge>
                           <Badge variant={getBadgeVariant(agent.availability)} className="text-[10px] sm:text-xs px-2.5 py-0.5">
                              {agent.availability}
                           </Badge>
                        </div>
                        <p className="text-muted-foreground font-medium text-xs sm:text-sm pt-1">
                          Affecté à la brigade en tant que personnel opérationnel.
                        </p>
                    </div>
                </div>

                {/* Statistiques rapides */}
                <div className="grid grid-cols-3 gap-2 sm:gap-4">
                  <div className="bg-primary/5 p-2 sm:p-4 rounded-xl sm:rounded-2xl border border-primary/10 flex flex-col items-center justify-center space-y-1 text-center min-w-0">
                    <span className="text-[8px] sm:text-[10px] text-primary/70 uppercase font-bold tracking-widest truncate w-full">Missions</span>
                    <div className="flex items-center gap-1 sm:gap-2 font-black text-lg sm:text-2xl text-primary">
                       <Shield className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
                       <span>{agent.missionCount || 0}</span>
                    </div>
                  </div>
                  <div className="bg-muted/50 p-2 sm:p-4 rounded-xl sm:rounded-2xl border flex flex-col items-center justify-center space-y-1 text-center min-w-0">
                    <span className="text-[8px] sm:text-[10px] text-muted-foreground uppercase font-bold tracking-widest truncate w-full">Section</span>
                    <span className="font-bold text-[10px] sm:text-xs md:text-sm truncate w-full">{(agent.section || 'Non assigné').toUpperCase()}</span>
                  </div>
                  <div className="bg-muted/50 p-2 sm:p-4 rounded-xl sm:rounded-2xl border flex flex-col items-center justify-center space-y-1 text-center min-w-0">
                    <span className="text-[8px] sm:text-[10px] text-muted-foreground uppercase font-bold tracking-widest truncate w-full">Grade</span>
                    <span className="font-bold text-[10px] sm:text-xs md:text-sm truncate w-full">{agent.rank}</span>
                  </div>
                </div>

                {/* Détails personnels */}
                <div className="space-y-4">
                    <h3 className="text-xs font-black text-primary uppercase tracking-[0.2em] px-1">Informations Générales</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        <div className="flex items-start gap-3 sm:gap-4 p-3 sm:p-4 bg-card border rounded-xl sm:rounded-2xl shadow-sm min-w-0">
                            <div className="bg-primary/10 p-2 sm:p-2.5 rounded-lg sm:rounded-xl shrink-0 mt-0.5">
                              <Phone className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Contact</p>
                              <p className="text-xs sm:text-sm font-semibold break-words">{agent.contact || 'Non renseigné'}</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3 sm:gap-4 p-3 sm:p-4 bg-card border rounded-xl sm:rounded-2xl shadow-sm min-w-0">
                            <div className="bg-primary/10 p-2 sm:p-2.5 rounded-lg sm:rounded-xl shrink-0 mt-0.5">
                              <MapPin className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Adresse Résidentielle</p>
                              <p className="text-xs sm:text-sm font-semibold break-words">{agent.address || 'Non renseigné'}</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3 sm:gap-4 p-3 sm:p-4 bg-card border rounded-xl sm:rounded-2xl shadow-sm sm:col-span-2 min-w-0">
                            <div className="bg-primary/10 p-2 sm:p-2.5 rounded-lg sm:rounded-xl shrink-0 mt-0.5">
                              <Briefcase className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Affectation Administrative</p>
                              <p className="text-xs sm:text-sm font-semibold break-words">{agent.rank} • Section {(agent.section || 'Non assignée').toUpperCase()}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Historique des missions */}
                <div className="space-y-4">
                    <h3 className="text-xs font-black text-primary uppercase tracking-[0.2em] px-1">Registre d'Activité (Missions)</h3>
                    <div className="border rounded-xl sm:rounded-2xl overflow-x-auto bg-card shadow-sm scrollbar-thin">
                         <div className="min-w-[480px] sm:min-w-0">
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
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
