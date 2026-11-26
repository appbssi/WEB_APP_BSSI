import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * En-tête commun des pages : icône, titre et description à gauche, boutons à droite.
 *
 * Règle de disposition des boutons, la même partout :
 *   1. l'action principale en premier (bouton plein) ;
 *   2. les actions secondaires (boutons à contour) ;
 *   3. les exports regroupés dans <PageHeaderGroup label="Exporter"> ;
 *   4. l'action risquée (vider, signaler…) à la fin, en <Button variant="ghost"> rouge.
 * Sur téléphone, le titre passe au-dessus et les boutons reviennent à la ligne.
 */
export function PageHeader({
  icon: Icon,
  title,
  description,
  meta,
  children,
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  /** Élément discret à côté du titre (compteur, état du cache…) */
  meta?: ReactNode;
  /** Boutons d'action, dans l'ordre de la règle ci-dessus */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between', className)}>
      <div className="flex min-w-0 items-center gap-3">
        {Icon && (
          <div className="shrink-0 rounded-xl bg-primary/10 p-2.5 text-primary">
            <Icon className="h-6 w-6" />
          </div>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {meta}
          </div>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** Boutons apparentés collés dans un même cadre (ex. exports Excel / PDF). */
export function PageHeaderGroup({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="inline-flex items-center overflow-hidden rounded-md border bg-background soft-shadow [&>button]:rounded-none [&>button+button]:border-l">
      {label && <span className="hidden border-r px-2.5 text-xs font-medium text-muted-foreground sm:inline">{label}</span>}
      {children}
    </div>
  );
}
