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
import { VisitorExtraFields, normalizeVisitorExtra, visitorExtraEditSchema } from '@/components/secretariat/visitor-extra-fields';

const visitorSchema = z.object({
  lastName: z.string().trim().min(2, 'Le nom est requis.'),
  firstName: z.string().trim().min(2, 'Le prénom est requis.'),
  contact: z.string().trim().min(8, 'Le contact est requis (8 caractères minimum).'),
  ...visitorExtraEditSchema,
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
      idNumber: visitor.idNumber ?? '',
      visitReason: visitor.visitReason ?? '',
      vehiclePlate: visitor.vehiclePlate ?? '',
      vehicleBrand: visitor.vehicleBrand ?? '',
    },
  });

  const onSubmit = async (data: VisitorFormValues) => {
    if (!firestore) return;
    
    const visitorRef = doc(firestore, 'visitors', visitor.id);
    const updateData = { ...data, ...normalizeVisitorExtra(data) };

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
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-lg max-h-[90dvh] overflow-y-auto p-4 sm:p-6">
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
                  <FormLabel>Nom <span className="text-destructive">*</span></FormLabel>
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
                  <FormLabel>Prénom(s) <span className="text-destructive">*</span></FormLabel>
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
                  <FormLabel>Contact <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <VisitorExtraFields control={form.control} required={false} />
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
