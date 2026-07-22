'use client';

import { useMemo } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase';
import type { ActivityLog } from '@/lib/types';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Button } from '../ui/button';
import Link from 'next/link';
import { Loader2, Newspaper, Trash2 } from 'lucide-react';
import { useRole } from '@/hooks/use-role';
import { deleteDoc, doc, getDocs } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

const getActivityIcon = (type: ActivityLog['type']) => {
    switch (type) {
        case 'Agent': return '🧑‍✈️';
        case 'Mission': return '🚀';
        case 'Rassemblement': return '👥';
        case 'Visiteur': return '👤';
        default: return '⚙️';
    }
};

export function RecentActivities() {
    const firestore = useFirestore();
    const { toast } = useToast();

    const activitiesQuery = useMemoFirebase(
        () => (firestore 
            ? query(collection(firestore, 'activities'), orderBy('timestamp', 'desc'), limit(20)) 
            : null),
        [firestore]
    );

    const { data: activities, isLoading } = useCollection<ActivityLog>(activitiesQuery);

    const handleClearActivities = async () => {
        if (!firestore || !activities || activities.length === 0) return;
        if (!window.confirm("Voulez-vous vraiment effacer l'historique des dernières activités ?")) return;
        try {
            const snapshot = await getDocs(collection(firestore, 'activities'));
            for (const docSnap of snapshot.docs) {
                await deleteDoc(doc(firestore, 'activities', docSnap.id));
            }
            toast({
                title: "Journal d'activités effacé",
                description: "L'historique des activités a été vidé avec succès."
            });
        } catch (err) {
            console.error(err);
            toast({
                variant: 'destructive',
                title: "Erreur",
                description: "Impossible d'effacer le journal d'activités."
            });
        }
    };
    
    return (
        <div className="space-y-2">
            {activities && activities.length > 0 && (
                <div className="flex justify-end pb-1">
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive gap-1 px-2 cursor-pointer rounded-lg"
                        onClick={handleClearActivities}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Vider le journal</span>
                    </Button>
                </div>
            )}
            <ScrollArea className="h-[60vh]">
            {isLoading ? (
                <div className="flex justify-center items-center h-40">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : activities && activities.length > 0 ? (
                <div className="space-y-4 p-1">
                    {activities.map(activity => (
                        <div key={activity.id} className="flex items-start gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xl">
                                {getActivityIcon(activity.type)}
                            </div>
                            <div className="flex-1 space-y-1">
                                <p className="text-sm text-muted-foreground">{activity.description}</p>
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                    <p>
                                        {formatDistanceToNow(activity.timestamp.toDate(), { addSuffix: true, locale: fr })}
                                    </p>
                                    {activity.link && (
                                        <Button asChild variant="link" size="sm" className="p-0 h-auto">
                                            <Link href={activity.link}>Voir</Link>
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center h-40 text-center text-muted-foreground">
                    <Newspaper className="h-10 w-10 mb-2" />
                    <p className="text-sm">Aucune activité récente à afficher.</p>
                </div>
            )}
            </ScrollArea>
        </div>
    );
}
