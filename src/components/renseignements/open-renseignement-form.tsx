'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { AlertCircle, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirestore, useMemoFirebase, errorEmitter } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { AgentMultiSelect } from '@/components/renseignements/agent-multi-select';
import { FirestorePermissionError } from '@/firebase/errors';
import { useToast } from '@/hooks/use-toast';
import { useRole } from '@/hooks/use-role';
import { logActivity } from '@/lib/activity-logger';
import { PRIORITY_LABELS, isInformationPriority, sortInformations } from '@/lib/informations';
import type { Agent, Information } from '@/lib/types';

const schema = z.object({
  informationId: z.string().min(1, "Choisissez l'information à vérifier."),
  assignedAgentIds: z.array(z.string()).min(1, 'Choisissez au moins un agent chargé du renseignement.'),
  instructions: z.string().trim().max(3000).optional(),
});

type FormValues = z.infer<typeof schema>;

interface OpenRenseignementFormProps {
  informations: Information[];
  defaultInformationId?: string;
  onSuccess: () => void;
}

export function OpenRenseignementForm({ informations, defaultInformationId, onSuccess }: OpenRenseignementFormProps) {
  const firestore = useFirestore();
  const { idc } = useRole();
  const { toast } = useToast();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const sorted = useMemo(() => sortInformations(informations), [informations]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { informationId: defaultInformationId ?? '', assignedAgentIds: [], instructions: '' },
  });

  const agentsQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'agents') : null), [firestore]);
  const { data: agentsData, isLoading: agentsLoading } = useCollection<Agent>(agentsQuery);
  const agents = useMemo(() => agentsData ?? [], [agentsData]);

  const selectedId = form.watch('informationId');
  const selected = informations.find((i) => i.id === selectedId);

  const onSubmit = async (data: FormValues) => {
    if (!firestore) return;
    const info = informations.find((i) => i.id === data.informationId);
    if (!info) {
      setSubmitError("L'information choisie n'existe plus.");
      return;
    }
    setSubmitError(null);
    // Noms enregistrés avec le renseignement : lisibles même si un agent est supprimé plus tard
    const assignedTo = data.assignedAgentIds
      .map((id) => {
        const a = agents.find((ag) => ag.id === id);
        return a ? `${a.rank ? `${a.rank} ` : ''}${a.fullName}` : null;
      })
      .filter(Boolean)
      .join(', ');

    try {
      await addDoc(collection(firestore, 'renseignements'), {
        informationId: info.id,
        informationSource: info.source,
        informationObjet: info.objet,
        informationPriority: info.priority,
        assignedAgentIds: data.assignedAgentIds,
        assignedTo,
        instructions: data.instructions?.trim() ?? '',
        status: 'en_cours',
        startedAt: Timestamp.now(),
        createdBy: idc,
        compteRendu: '',
        compteRenduAt: null,
      });
      toast({ title: 'Renseignement ouvert', description: `Confié à ${assignedTo}` });
      logActivity(
        firestore,
        `Renseignement ouvert sur l'information « ${info.source} » — confié à ${assignedTo}`,
        'Renseignement',
        '/renseignements',
      );
      onSuccess();
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;
      let message = "Une erreur est survenue lors de l'enregistrement.";
      if (code === 'permission-denied') {
        message = "Vous n'avez pas les droits pour ouvrir un renseignement.";
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'renseignements', operation: 'create' }));
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
            name="informationId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Information à vérifier <span className="text-destructive">*</span>
                </FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={sorted.length ? 'Choisir une information…' : 'Aucune information enregistrée'} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="max-w-[calc(100vw-2rem)]">
                    {sorted.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        <span className="truncate">
                          [{isInformationPriority(i.priority) ? PRIORITY_LABELS[i.priority] : i.priority}] {i.source} —{' '}
                          {i.objet.length > 60 ? `${i.objet.slice(0, 60)}…` : i.objet}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {selected && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Objet de l'information</p>
              <p className="mt-1 whitespace-pre-wrap">{selected.objet}</p>
            </div>
          )}

          <FormField
            control={form.control}
            name="assignedAgentIds"
            render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel>
                  Agent(s) chargé(s) <span className="text-destructive">*</span>
                </FormLabel>
                <AgentMultiSelect
                  agents={agents}
                  isLoading={agentsLoading}
                  value={field.value}
                  onChange={field.onChange}
                  invalid={!!fieldState.error}
                />
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="instructions"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Consignes</FormLabel>
                <FormControl>
                  <Textarea placeholder="Points à vérifier, lieux, personnes à identifier…" className="min-h-[90px] resize-y" {...field} />
                </FormControl>
                <FormDescription>Facultatif.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full" disabled={isSubmitting || sorted.length === 0}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enregistrement…
              </>
            ) : (
              'Ouvrir le renseignement'
            )}
          </Button>
        </form>
      </Form>
    </div>
  );
}
