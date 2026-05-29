
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
import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { useFirestore, errorEmitter } from '@/firebase';
import { FirestorePermissionError } from '@/firebase/errors';
import { Loader2 } from 'lucide-react';
import { logActivity } from '@/lib/activity-logger';

const visitorSchema = z.object({
  lastName: z.string().min(2, 'Le nom est requis.'),
  firstName: z.string().min(2, 'Le prénom est requis.'),
  contact: z.string().min(8, 'Le contact est requis.'),
  occupation: z.string().min(2, 'La fonction est requise.'),
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
      occupation: '',
    },
  });

  const onSubmit = async (data: VisitorFormValues) => {
    if (!firestore) return;

    const visitorData = {
        ...data,
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
                </div>
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
                    Enregistrer
                </Button>
                </div>
            </form>
        </Form>
    </div>
  );
}
