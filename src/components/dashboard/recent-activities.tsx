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
import { Loader2, Newspaper } from 'lucide-react';

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

    const activitiesQuery = useMemoFirebase(
        () => (firestore 
            ? query(collection(firestore, 'activities'), orderBy('timestamp', 'desc'), limit(20)) 
            : null),
        [firestore]
    );

    const { data: activities, isLoading } = useCollection<ActivityLog>(activitiesQuery);
    
    return (
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
    );
}
