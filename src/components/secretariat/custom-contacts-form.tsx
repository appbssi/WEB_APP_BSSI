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
import { addDoc, collection, Timestamp, doc, updateDoc } from 'firebase/firestore';
import { useFirestore, errorEmitter } from '@/firebase';
import { FirestorePermissionError } from '@/firebase/errors';
import { Loader2 } from 'lucide-react';
import { logActivity } from '@/lib/activity-logger';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const contactSchema = z.object({
  lastName: z.string().min(2, 'Le nom est requis.'),
  firstName: z.string().min(2, 'Le prénom est requis.'),
  email: z.string().email('Format d\'adresse email invalide.').or(z.literal('')),
  phone: z.string().min(6, 'Le numéro de téléphone doit faire au moins 6 caractères.').or(z.literal('')),
  category: z.string().min(1, 'La catégorie est requise.'),
}).refine(data => data.email || data.phone, {
  message: "Veuillez saisir au moins une adresse email ou un numéro de téléphone.",
  path: ["email"],
});

type ContactFormValues = z.infer<typeof contactSchema>;

interface CustomContactFormProps {
  contactToEdit?: any;
  onContactSaved?: () => void;
}

export function CustomContactForm({ contactToEdit, onContactSaved }: CustomContactFormProps) {
  const { toast } = useToast();
  const firestore = useFirestore();

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      firstName: contactToEdit?.firstName || '',
      lastName: contactToEdit?.lastName || '',
      email: contactToEdit?.email || '',
      phone: contactToEdit?.phone || '',
      category: contactToEdit?.category || 'Partenaire',
    },
  });

  const onSubmit = async (data: ContactFormValues) => {
    if (!firestore) return;

    const contactData = {
      ...data,
      updatedAt: Timestamp.now(),
    };

    if (contactToEdit) {
      // mode modification
      const contactRef = doc(firestore, 'contacts', contactToEdit.id);
      updateDoc(contactRef, contactData)
        .then(() => {
          toast({
            title: 'Contact mis à jour !',
            description: `Le contact ${data.firstName} ${data.lastName} a été modifié.`,
          });
          logActivity(firestore, `Contact ${data.firstName} ${data.lastName} mis à jour.`, 'Général', '/secretariat');
          onContactSaved?.();
        })
        .catch(async (serverError) => {
          const permissionError = new FirestorePermissionError({
            path: `contacts/${contactToEdit.id}`,
            operation: 'update',
            requestResourceData: contactData,
          });
          errorEmitter.emit('permission-error', permissionError);
        });
    } else {
      // mode création
      const newContactData = {
        ...contactData,
        createdAt: Timestamp.now(),
      };
      addDoc(collection(firestore, 'contacts'), newContactData)
        .then(() => {
          toast({
            title: 'Contact enregistré !',
            description: `Le contact ${data.firstName} ${data.lastName} a été ajouté avec succès.`,
          });
          logActivity(firestore, `Nouveau contact ${data.firstName} ${data.lastName} enregistré.`, 'Général', '/secretariat');
          form.reset();
          onContactSaved?.();
        })
        .catch(async (serverError) => {
          const permissionError = new FirestorePermissionError({
            path: 'contacts',
            operation: 'create',
            requestResourceData: newContactData,
          });
          errorEmitter.emit('permission-error', permissionError);
        });
    }
  };

  const { isSubmitting } = form.formState;

  return (
    <div className="space-y-4 pt-2">
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
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Adresse E-mail</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="exemple@domain.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Numéro de Téléphone / Contact Direct</FormLabel>
                <FormControl>
                  <Input placeholder="+243 ... / +225 ..." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Catégorie / Organisation</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionnez une catégorie" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="Partenaire">Partenaire</SelectItem>
                    <SelectItem value="Ministère">Ministère / Hiérarchie</SelectItem>
                    <SelectItem value="Garde Civile">Garde Civile / Police</SelectItem>
                    <SelectItem value="Urgence">Urgence / Sécurité</SelectItem>
                    <SelectItem value="Autre">Autre Institution</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex justify-end pt-4 gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {contactToEdit ? 'Enregistrer les modifications' : 'Enregistrer le contact'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
