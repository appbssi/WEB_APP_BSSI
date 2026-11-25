'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '../ui/sheet';
import { Button } from '../ui/button';
import { Bell } from 'lucide-react';
import { RecentActivities } from './recent-activities';

export function RecentActivitiesDialog() {
  return (
     <Sheet>
        <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-8 w-8 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                <Bell className="h-[18px] w-[18px]" />
                <span className="sr-only">Notifications</span>
            </Button>
        </SheetTrigger>
        <SheetContent>
            <SheetHeader>
                <SheetTitle>Activités Récentes</SheetTitle>
            </SheetHeader>
            <div className="mt-4">
                <RecentActivities />
            </div>
        </SheetContent>
    </Sheet>
  );
}
