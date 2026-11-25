
'use client';

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
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { collection, Timestamp } from 'firebase/firestore';
import { addDoc } from '@/lib/firestore-fast';
import { useFirestore, errorEmitter } from '@/firebase';
import { FirestorePermissionError } from '@/firebase/errors';
import { Loader2 } from 'lucide-react';
import { logActivity } from '@/lib/activity-logger';
import { VisitorExtraFields, normalizeVisitorExtra, visitorExtraSchema } from '@/components/secretariat/visitor-extra-fields';

const visitorSchema = z.object({
  lastName: z.string().trim().min(2, 'Le nom est requis.'),
  firstName: z.string().trim().min(2, 'Le prénom est requis.'),
  contact: z.string().trim().min(8, 'Le contact est requis (8 caractères minimum).'),
  ...visitorExtraSchema,
});

type VisitorFormValues = z.infer<typeof visitorSchema>;

interface RegisterVisitorFormProps {
  onVisitorRegistered?: () => void;
}

export function RegisterVisitorForm({ onVisitorRegistered }: RegisterVisitorFormProps) {
  const { toast } = useToast();
  const firestore = useFirestore();

  const form = useForm<VisitorFormValues>({
    resolver: zodResolver(visitorSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      contact: '',
      idNumber: '',
      visitReason: '',
      vehiclePlate: '',
      vehicleBrand: '',
    },
  });

  const onSubmit = async (data: VisitorFormValues) => {
    if (!firestore) return;

    const visitorData = {
        ...data,
        ...normalizeVisitorExtra(data),
        entryTime: Timestamp.now(),
        exitTime: null,
    };

    addDoc(collection(firestore, 'visitors'), visitorData)
        .then(() => {
            toast({
                title: 'Visiteur enregistré !',
                description: `Le visiteur ${data.firstName} ${data.lastName} a été ajouté avec succès.`,
            });
            logActivity(firestore, `Le visiteur ${data.firstName} ${data.lastName} a été enregistré.`, 'Visiteur', '/secretariat');
            form.reset();
            onVisitorRegistered?.();
        })
        .catch(async (serverError) => {
            const permissionError = new FirestorePermissionError({
                path: 'visitors',
                operation: 'create',
                requestResourceData: visitorData,
            });
            errorEmitter.emit('permission-error', permissionError);
        });
  };

  const { isSubmitting } = form.formState;

  return (
    <div className="space-y-4 pt-4">
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
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
                </div>
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
                <VisitorExtraFields control={form.control} />
                <div className="flex justify-end pt-4">
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Enregistrer
                </Button>
                </div>
            </form>
        </Form>
    </div>
  );
}
