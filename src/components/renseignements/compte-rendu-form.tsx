'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { doc, Timestamp } from 'firebase/firestore';
import { updateDoc } from '@/lib/firestore-fast';
import { AlertCircle, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirestore, errorEmitter } from '@/firebase';
import { FirestorePermissionError } from '@/firebase/errors';
import { useToast } from '@/hooks/use-toast';
import { useRole } from '@/hooks/use-role';
import { logActivity } from '@/lib/activity-logger';
import { CONCLUSIONS, CONCLUSION_LABELS } from '@/lib/renseignements';
import type { Renseignement } from '@/lib/types';

const schema = z.object({
  compteRendu: z.string().trim().min(10, 'Le compte rendu doit contenir au moins 10 caractères.').max(20000),
  conclusion: z.enum(['confirmee', 'partielle', 'infirmee', 'indeterminee'], {
    required_error: 'Choisissez une conclusion.',
  }),
});

type FormValues = z.infer<typeof schema>;

interface CompteRenduFormProps {
  renseignement: Renseignement;
  onSuccess: () => void;
}

/** Rédaction (ou correction) du compte rendu : clôt le renseignement. */
export function CompteRenduForm({ renseignement, onSuccess }: CompteRenduFormProps) {
  const firestore = useFirestore();
  const { idc } = useRole();
  const { toast } = useToast();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const isEdit = renseignement.status === 'termine';

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      compteRendu: renseignement.compteRendu ?? '',
      conclusion: renseignement.conclusion,
    },
  });

  const onSubmit = async (data: FormValues) => {
    if (!firestore) return;
    setSubmitError(null);
    const ref = doc(firestore, 'renseignements', renseignement.id);

    try {
      await updateDoc(ref, {
        compteRendu: data.compteRendu.trim(),
        conclusion: data.conclusion,
        status: 'termine',
        compteRenduAt: Timestamp.now(),
        compteRenduBy: idc,
      });
      toast({
        title: isEdit ? 'Compte rendu modifié' : 'Compte rendu enregistré',
        description: CONCLUSION_LABELS[data.conclusion],
      });
      logActivity(
        firestore,
        `Compte rendu de renseignement (${CONCLUSION_LABELS[data.conclusion]}) — information « ${renseignement.informationSource} »`,
        'Renseignement',
        '/renseignements',
      );
      onSuccess();
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;
      let message = "Une erreur est survenue lors de l'enregistrement.";
      if (code === 'permission-denied') {
        message = "Vous n'avez pas les droits pour rédiger ce compte rendu.";
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: ref.path, operation: 'update' }));
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

      <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-2">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">Information</p>
          <p className="mt-1 whitespace-pre-wrap">{renseignement.informationObjet}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Source : {renseignement.informationSource} — Chargé(s) : {renseignement.assignedTo}
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="compteRendu"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Compte rendu <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Démarches effectuées, constatations, personnes identifiées, suites à donner…"
                    className="min-h-[180px] resize-y"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="conclusion"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Conclusion <span className="text-destructive">*</span>
                </FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Choisir…" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {CONCLUSIONS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CONCLUSION_LABELS[c]}
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
            ) : isEdit ? (
              'Mettre à jour le compte rendu'
            ) : (
              'Enregistrer le compte rendu'
            )}
          </Button>
        </form>
      </Form>
    </div>
  );
}
