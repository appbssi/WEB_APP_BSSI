'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '../ui/sheet';
import { Button } from '../ui/button';
import { Bell } from 'lucide-react';
import { RecentActivities } from './recent-activities';

export function RecentActivitiesDialog() {
  return (
     <Sheet>
        <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="relative p-2 bg-card text-primary align-middle rounded-full hover:text-white hover:bg-primary focus:outline-none">
                <Bell className="h-6 w-6" />
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
