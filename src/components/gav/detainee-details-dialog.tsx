
'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { Detainee } from '@/lib/types';
import { User, Calendar, Clock, Info, MapPin, FileText } from 'lucide-react';
import Image from 'next/image';
import { ScrollArea } from '@/components/ui/scroll-area';

interface DetaineeDetailsDialogProps {
  detainee: Detainee;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export function DetaineeDetailsDialog({ detainee, isOpen, onOpenChange }: DetaineeDetailsDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Dossier GAV - Détails</DialogTitle>
          <DialogDescription>
            Informations relatives à la personne enregistrée.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] pr-4">
          <div className="space-y-6 py-4">
            <div className="flex flex-col items-center">
              {detainee.photo ? (
                <div className="relative h-40 w-40 overflow-hidden rounded-lg border-4 border-muted shadow-lg">
                  <Image src={detainee.photo} alt="Identity Photo" fill className="object-cover" />
                </div>
              ) : (
                <div className="h-40 w-40 rounded-lg bg-muted flex items-center justify-center border-2 border-dashed">
                  <User className="h-16 w-16 text-muted-foreground" />
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 border-b pb-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1 uppercase">
                    <Info className="h-3 w-3" /> Nom
                  </p>
                  <p className="font-bold text-lg">{detainee.lastName.toUpperCase()}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1 uppercase">
                    <Info className="h-3 w-3" /> Prénom(s)
                  </p>
                  <p className="font-bold text-lg">{detainee.firstName}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 border-b pb-4">
                <div className="space-y-1 flex items-center gap-3">
                  <div className="bg-primary/10 p-2 rounded-full">
                    <Calendar className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Date de naissance</p>
                    <p className="font-semibold">{detainee.birthDate.toDate().toLocaleDateString('fr-FR', { dateStyle: 'long' })}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 border-b pb-4">
                <div className="space-y-1 flex items-center gap-3">
                  <div className="bg-primary/10 p-2 rounded-full">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Date et heure d'entrée en GAV</p>
                    <p className="font-semibold">{detainee.entryTime.toDate().toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 border-b pb-4">
                <div className="space-y-1 flex items-center gap-3">
                  <div className="bg-primary/10 p-2 rounded-full">
                    <MapPin className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Lieu d'arrestation</p>
                    <p className="font-semibold">{detainee.arrestLocation}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1 flex items-start gap-3">
                  <div className="bg-primary/10 p-2 rounded-full mt-1">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Motif d'arrestation</p>
                    <p className="text-sm font-medium leading-relaxed mt-1 bg-muted p-3 rounded-md italic">
                      "{detainee.arrestReason}"
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
