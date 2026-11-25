'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { collection, Timestamp } from 'firebase/firestore';
import { addDoc } from '@/lib/firestore-fast';
import { AlertCircle, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirestore, errorEmitter } from '@/firebase';
import { FirestorePermissionError } from '@/firebase/errors';
import { useToast } from '@/hooks/use-toast';
import { useRole } from '@/hooks/use-role';
import { logActivity } from '@/lib/activity-logger';
import { INFORMATION_PRIORITIES, PRIORITY_LABELS } from '@/lib/informations';

const informationSchema = z.object({
  source: z.string().trim().min(2, 'La source est requise (min 2 caractères).').max(200),
  objet: z.string().trim().min(5, "L'objet de l'information est requis (min 5 caractères).").max(5000),
  priority: z.enum(['basse', 'moyenne', 'haute', 'urgente'], {
    required_error: 'Choisissez un degré de priorité.',
  }),
});

type InformationFormValues = z.infer<typeof informationSchema>;

interface RegisterInformationFormProps {
  onSuccess: () => void;
}

export function RegisterInformationForm({ onSuccess }: RegisterInformationFormProps) {
  const firestore = useFirestore();
  const { idc } = useRole();
  const { toast } = useToast();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<InformationFormValues>({
    resolver: zodResolver(informationSchema),
    defaultValues: { source: '', objet: '', priority: 'moyenne' },
  });

  const onSubmit = async (data: InformationFormValues) => {
    if (!firestore) return;
    setSubmitError(null);

    try {
      await addDoc(collection(firestore, 'informations'), {
        source: data.source.trim(),
        objet: data.objet.trim(),
        priority: data.priority,
        createdAt: Timestamp.now(),
        createdBy: idc,
      });

      toast({
        title: 'Information enregistrée',
        description: `Priorité ${PRIORITY_LABELS[data.priority].toLowerCase()} — source : ${data.source.trim()}`,
      });
      logActivity(
        firestore,
        `Nouvelle information (${PRIORITY_LABELS[data.priority]}) — source : ${data.source.trim()}`,
        'Information',
        '/informations',
      );
      onSuccess();
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;
      let message = "Une erreur est survenue lors de l'enregistrement.";
      if (code === 'permission-denied') {
        message = "Vous n'avez pas les droits pour enregistrer une information.";
        errorEmitter.emit(
          'permission-error',
          new FirestorePermissionError({ path: 'informations', operation: 'create' }),
        );
      } else if (error instanceof Error && error.message) {
        message = error.message;
      }
      setSubmitError(message);
      toast({ variant: 'destructive', title: "Échec de l'enregistrement", description: message });
    }
  };

  const { isSubmitting } = form.formState;

  return (
    <div className="space-y-4 py-2">
      {submitError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erreur</AlertTitle>
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="source"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Source <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Input placeholder="Ex : informateur, appel anonyme, patrouille…" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="objet"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Objet de l'information <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Textarea placeholder="Décrivez l'information reçue…" className="min-h-[120px] resize-y" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="priority"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Degré de priorité <span className="text-destructive">*</span>
                </FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Choisir…" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {INFORMATION_PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {PRIORITY_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enregistrement…
              </>
            ) : (
              "Enregistrer l'information"
            )}
          </Button>
        </form>
      </Form>
    </div>
  );
}
