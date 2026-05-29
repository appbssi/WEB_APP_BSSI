'use client';

import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Dialog,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { doc, updateDoc } from 'firebase/firestore';
import { useFirestore, errorEmitter } from '@/firebase';
import { FirestorePermissionError } from '@/firebase/errors';
import type { Visitor } from '@/lib/types';
import { Loader2 } from 'lucide-react';
import { logActivity } from '@/lib/activity-logger';

const visitorSchema = z.object({
  lastName: z.string().min(2, 'Le nom est requis.'),
  firstName: z.string().min(2, 'Le prénom est requis.'),
  contact: z.string().min(8, 'Le contact est requis.'),
  occupation: z.string().min(2, 'La fonction est requise.'),
});

type VisitorFormValues = z.infer<typeof visitorSchema>;

interface EditVisitorSheetProps {
  visitor: Visitor;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export function EditVisitorSheet({ visitor, isOpen, onOpenChange }: EditVisitorSheetProps) {
  const { toast } = useToast();
  const firestore = useFirestore();

  const form = useForm<VisitorFormValues>({
    resolver: zodResolver(visitorSchema),
    defaultValues: {
      firstName: visitor.firstName,
      lastName: visitor.lastName,
      contact: visitor.contact,
      occupation: visitor.occupation,
    },
  });

  const onSubmit = async (data: VisitorFormValues) => {
    if (!firestore) return;
    
    const visitorRef = doc(firestore, 'visitors', visitor.id);
    const updateData = { ...data };

    updateDoc(visitorRef, updateData).then(() => {
        toast({
            title: 'Visiteur mis à jour !',
            description: `Les informations du visiteur ${data.firstName} ${data.lastName} ont été mises à jour.`,
        });
        logActivity(firestore, `Le visiteur ${data.firstName} ${data.lastName} a été modifié.`, 'Visiteur', '/secretariat');
        onOpenChange(false);
    }).catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
            path: visitorRef.path,
            operation: 'update',
            requestResourceData: updateData,
        });
        errorEmitter.emit('permission-error', permissionError);
    });
  };

  const { isSubmitting } = form.formState;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifier le visiteur</DialogTitle>
          <DialogDescription>
            Mettez à jour les informations du visiteur.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-6">
            <FormField
              control={form.control}
              name="lastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nom</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="firstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prénom(s)</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="contact"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="occupation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fonction</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sauvegarder
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
