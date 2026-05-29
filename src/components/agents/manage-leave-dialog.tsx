
'use client';

import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { useFirestore, errorEmitter } from '@/firebase';
import { FirestorePermissionError } from '@/firebase/errors';
import type { Agent } from '@/lib/types';
import { Loader2, CalendarIcon, Trash2 } from 'lucide-react';
import { logActivity } from '@/lib/activity-logger';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const leaveSchema = z.object({
  leaveDates: z.object({
    from: z.date().optional(),
    to: z.date().optional(),
  }).optional(),
}).refine(data => {
    if (data.leaveDates?.from && !data.leaveDates?.to) {
        return false;
    }
    if (!data.leaveDates?.from && data.leaveDates?.to) {
        return false;
    }
    return true;
}, {
    message: "Les deux dates (début et fin) sont requises si une période est sélectionnée.",
    path: ['leaveDates']
}).refine(data => {
    if (data.leaveDates?.from && data.leaveDates?.to) {
        return data.leaveDates.to >= data.leaveDates.from;
    }
    return true;
}, {
    message: "La date de fin ne peut pas être antérieure à la date de début.",
    path: ['leaveDates.to'],
});


type LeaveFormValues = z.infer<typeof leaveSchema>;

interface ManageLeaveDialogProps {
  agent: Agent;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export function ManageLeaveDialog({ agent, isOpen, onOpenChange }: ManageLeaveDialogProps) {
  const { toast } = useToast();
  const firestore = useFirestore();

  const form = useForm<LeaveFormValues>({
    resolver: zodResolver(leaveSchema),
    defaultValues: {
      leaveDates: {
        from: agent.leaveStartDate?.toDate(),
        to: agent.leaveEndDate?.toDate(),
      },
    },
  });

  useEffect(() => {
    if (isOpen) {
      form.reset({
        leaveDates: {
          from: agent.leaveStartDate?.toDate(),
          to: agent.leaveEndDate?.toDate(),
        },
      });
    }
  }, [isOpen, agent, form]);

  const onSubmit = async (data: LeaveFormValues) => {
    if (!firestore) return;
    
    const agentRef = doc(firestore, 'agents', agent.id);

    const updateData = {
        leaveStartDate: data.leaveDates?.from ? Timestamp.fromDate(data.leaveDates.from) : null,
        leaveEndDate: data.leaveDates?.to ? Timestamp.fromDate(data.leaveDates.to) : null,
    };

    updateDoc(agentRef, updateData).then(() => {
        toast({
            title: 'Congé mis à jour',
            description: `La période de congé pour ${agent.fullName} a été enregistrée.`,
        });
        logActivity(firestore, `La période de congé pour ${agent.fullName} a été mise à jour.`, 'Agent', '/agents');
        onOpenChange(false);
    }).catch(serverError => {
        const permissionError = new FirestorePermissionError({
            path: agentRef.path,
            operation: 'update',
            requestResourceData: updateData
        });
        errorEmitter.emit('permission-error', permissionError);
    });
  };

  const handleClearLeave = async () => {
     if (!firestore) return;
    
    const agentRef = doc(firestore, 'agents', agent.id);
    const updateData = {
        leaveStartDate: null,
        leaveEndDate: null,
    };

    updateDoc(agentRef, updateData).then(() => {
        toast({
            title: 'Congé annulé',
            description: `La période de congé pour ${agent.fullName} a été annulée.`,
        });
        logActivity(firestore, `Le congé de l'agent ${agent.fullName} a été annulé.`, 'Agent', '/agents');
        onOpenChange(false);
    }).catch(serverError => {
        const permissionError = new FirestorePermissionError({
            path: agentRef.path,
            operation: 'update',
            requestResourceData: updateData
        });
        errorEmitter.emit('permission-error', permissionError);
    });
  }

  const { isSubmitting } = form.formState;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gérer le congé de {agent.fullName}</DialogTitle>
          <DialogDescription>
            Sélectionnez la période de congé de l'agent. L'agent ne sera pas disponible pour les missions pendant cette période.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
            <FormField
              control={form.control}
              name="leaveDates"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Période de congé</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          id="date"
                          variant={"outline"}
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !field.value?.from && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {field.value?.from ? (
                            field.value.to ? (
                              <>
                                {format(field.value.from, "LLL dd, y", { locale: fr })} -{" "}
                                {format(field.value.to, "LLL dd, y", { locale: fr })}
                              </>
                            ) : (
                              format(field.value.from, "LLL dd, y", { locale: fr })
                            )
                          ) : (
                            <span>Choisissez une période</span>
                          )}
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        initialFocus
                        mode="range"
                        defaultMonth={field.value?.from}
                        selected={{ from: field.value?.from!, to: field.value?.to }}
                        onSelect={field.onChange}
                        numberOfMonths={2}
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="!justify-between">
              <Button type="button" variant="ghost" onClick={handleClearLeave} className="text-destructive hover:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Annuler le congé
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enregistrer
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
