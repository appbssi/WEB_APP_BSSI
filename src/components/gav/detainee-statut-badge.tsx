import type { Detainee } from '@/lib/types';

/** Toute personne en GAV est interpellée ; elle est « déférée » une fois présentée au parquet. */
export const isDefere = (d: Detainee) => d.statut === 'defere';

/** Pastille de statut : interpellé ou déféré (avec la date du déferrement). */
export function DetaineeStatutBadge({ detainee }: { detainee: Detainee }) {
  if (isDefere(detainee)) {
    return (
      <span className="inline-flex flex-col">
        <span className="inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-600/20 dark:bg-indigo-500/10 dark:text-indigo-400">
          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
          Déféré
        </span>
        {detainee.defereAt && (
          <span className="mt-0.5 text-[11px] text-muted-foreground">
            le {detainee.defereAt.toDate().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
          </span>
        )}
        {detainee.pvNumero && (
          <span className="text-[11px] font-medium text-foreground">PV n° {detainee.pvNumero}</span>
        )}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400">
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      Interpellé
    </span>
  );
}
