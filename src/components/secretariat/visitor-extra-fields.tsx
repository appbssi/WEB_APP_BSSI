'use client';

import type { Control, FieldValues, Path } from 'react-hook-form';
import * as z from 'zod';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

/** Champs ajoutés au registre des visiteurs : pièce d'identité, motif, véhicule. */
export const visitorExtraSchema = {
  idNumber: z.string().trim().min(3, "Le N° de pièce est requis.").max(60),
  visitReason: z.string().trim().min(3, 'Le motif de la visite est requis.').max(1000),
  vehiclePlate: z.string().trim().max(30).optional(),
  vehicleBrand: z.string().trim().max(60).optional(),
};

/** Variante pour la modification : les anciens visiteurs n'ont pas encore ces informations. */
export const visitorExtraEditSchema = {
  idNumber: z.string().trim().max(60).optional(),
  visitReason: z.string().trim().max(1000).optional(),
  vehiclePlate: z.string().trim().max(30).optional(),
  vehicleBrand: z.string().trim().max(60).optional(),
};

export type VisitorExtraValues = {
  idNumber?: string;
  visitReason?: string;
  vehiclePlate?: string;
  vehicleBrand?: string;
};

/** Valeurs à enregistrer : texte nettoyé, immatriculation en majuscules. */
export function normalizeVisitorExtra(v: VisitorExtraValues) {
  return {
    idNumber: (v.idNumber ?? '').trim().toUpperCase(),
    visitReason: (v.visitReason ?? '').trim(),
    vehiclePlate: (v.vehiclePlate ?? '').trim().toUpperCase(),
    vehicleBrand: (v.vehicleBrand ?? '').trim(),
  };
}

interface VisitorExtraFieldsProps<T extends FieldValues> {
  control: Control<T>;
  required?: boolean;
}

export function VisitorExtraFields<T extends FieldValues>({ control, required = true }: VisitorExtraFieldsProps<T>) {
  const star = required ? <span className="text-destructive"> *</span> : null;
  return (
    <>
      <FormField
        control={control}
        name={'idNumber' as Path<T>}
        render={({ field }) => (
          <FormItem>
            <FormLabel>N° de pièce d'identité{star}</FormLabel>
            <FormControl>
              <Input placeholder="Ex : CNI C0012345678" {...field} value={field.value ?? ''} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name={'visitReason' as Path<T>}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Motif de la visite{star}</FormLabel>
            <FormControl>
              <Textarea placeholder="Ex : rendez-vous avec le chef de détachement…" className="min-h-[70px] resize-y" {...field} value={field.value ?? ''} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={control}
          name={'vehiclePlate' as Path<T>}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Immatriculation du véhicule</FormLabel>
              <FormControl>
                <Input placeholder="Ex : 1234 AB 01" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name={'vehicleBrand' as Path<T>}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Marque du véhicule</FormLabel>
              <FormControl>
                <Input placeholder="Ex : Toyota" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <p className="-mt-2 text-[11px] text-muted-foreground">Véhicule : à remplir seulement si le visiteur en a un.</p>
    </>
  );
}
