'use client';

import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Agent, Personne, Saisie } from '@/lib/types';
import { NATIONALITES } from '@/lib/nationalites';

/** Valeurs du formulaire liées à la procédure : OPJ/APJ, ordre de mission, contrevenants, interpellés. */
export type SaisieProcedureValues = {
  agentId: string;
  agentQualite: '' | 'OPJ' | 'APJ';
  missionOrderNumber: string;
  services: string[];
  contrevenants: Personne[];
  interpelles: Personne[];
};

type TextField = 'agentId' | 'agentQualite' | 'missionOrderNumber';
type PersonField = 'contrevenants' | 'interpelles';

interface SaisieProcedureFieldsProps {
  agents: Agent[];
  values: SaisieProcedureValues;
  onChange: (field: TextField, value: string) => void;
  onListChange: (field: 'services', value: string[]) => void;
  onPersonsChange: (field: PersonField, value: Personne[]) => void;
  /** Couleur de focus des champs, pour rester dans le ton de chaque fenêtre */
  focusClass?: string;
}


/** Qualité OPJ/APJ du formulaire → valeur Firestore. */
export function qualiteFromForm(value: string | undefined): 'OPJ' | 'APJ' | null {
  return value === 'OPJ' || value === 'APJ' ? value : null;
}

/** Nettoie une liste de noms saisis (espaces, lignes vides). */
export function cleanNames(list: string[] | undefined): string[] {
  return (list || []).map((n) => n.trim()).filter(Boolean);
}

/** Nettoie une liste de personnes saisies : lignes sans nom retirées, espaces enlevés. */
export function cleanPersons(list: Personne[] | undefined): Personne[] {
  return (list || [])
    .map((p) => ({ nom: (p.nom || '').trim(), nationalite: (p.nationalite || '').trim() || null }))
    .filter((p) => p.nom);
}

/** Les premières saisies stockaient de simples noms : on les lit comme des personnes. */
const toPersonnes = (list: (Personne | string)[]): Personne[] =>
  list.map((p) => (typeof p === 'string' ? { nom: p, nationalite: null } : p));

/** Contrevenants d'une saisie, y compris les anciennes saisies à un seul nom. */
export function getContrevenants(s: Pick<Saisie, 'contrevenants' | 'detaineeName'>): Personne[] {
  if (s.contrevenants && s.contrevenants.length > 0) return toPersonnes(s.contrevenants);
  return s.detaineeName ? [{ nom: s.detaineeName, nationalite: null }] : [];
}

/** Interpellés d'une saisie, y compris les anciennes saisies (un nom, ou oui/non). */
export function getInterpelles(s: Pick<Saisie, 'interpelles' | 'interpelle'>): Personne[] {
  if (s.interpelles && s.interpelles.length > 0) return toPersonnes(s.interpelles);
  if (s.interpelle === true) return [{ nom: 'Oui', nationalite: null }];
  if (s.interpelle === false) return [{ nom: 'Non', nationalite: null }];
  return s.interpelle ? [{ nom: s.interpelle, nationalite: null }] : [];
}

/** « Nom (Nationalité) », ou le nom seul. */
export function personLabel(p: Personne): string {
  return p.nationalite ? `${p.nom} (${p.nationalite})` : p.nom;
}

/** Liste lisible pour les exports. */
export function namesLabel(list: (Personne | string)[]): string {
  const labels = list.map((p) => (typeof p === 'string' ? p : personLabel(p)));
  return labels.length > 0 ? labels.join(', ') : '—';
}

function PersonListField({
  label,
  addLabel,
  placeholder,
  persons,
  onPersonsChange,
  focusClass,
}: {
  label: string;
  addLabel: string;
  placeholder: string;
  persons: Personne[];
  onPersonsChange: (persons: Personne[]) => void;
  focusClass: string;
}) {
  // Toujours au moins une ligne à remplir
  const rows: Personne[] = persons && persons.length > 0 ? persons : [{ nom: '', nationalite: '' }];
  const filled = cleanPersons(rows).length;

  const update = (index: number, patch: Partial<Personne>) =>
    onPersonsChange(rows.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  const remove = (index: number) => onPersonsChange(rows.filter((_, i) => i !== index));
  const add = () => onPersonsChange([...rows, { nom: '', nationalite: '' }]);

  return (
    <div className="space-y-1.5 sm:col-span-2">
      <Label className="text-xs font-semibold">
        {label}
        {filled > 1 && (
          <span className="ml-1.5 rounded bg-muted px-1.5 py-px text-[10px] font-bold text-muted-foreground">
            {filled}
          </span>
        )}
      </Label>
      <div className="space-y-2">
        {rows.map((person, index) => (
          <div key={index} className="flex items-center gap-1.5">
            <Input
              placeholder={placeholder}
              className={`min-w-0 flex-1 ${focusClass}`}
              value={person.nom}
              onChange={(e) => update(index, { nom: e.target.value })}
            />
            <Input
              placeholder="Nationalité"
              aria-label="Nationalité"
              list="saisie-nationalites"
              className={`w-32 shrink-0 sm:w-44 ${focusClass}`}
              value={person.nationalite || ''}
              onChange={(e) => update(index, { nationalite: e.target.value })}
            />
            {rows.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(index)}
                className="h-9 w-9 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                title="Retirer"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={add}
        className="h-7 gap-1 px-2 text-xs font-medium text-primary hover:bg-primary/10 hover:text-primary"
      >
        <Plus className="h-3.5 w-3.5" />
        {addLabel}
      </Button>
    </div>
  );
}

function NameListField({
  label,
  addLabel,
  placeholder,
  names,
  onNamesChange,
  focusClass,
}: {
  label: string;
  addLabel: string;
  placeholder: string;
  names: string[];
  onNamesChange: (names: string[]) => void;
  focusClass: string;
}) {
  // Toujours au moins une ligne à remplir
  const rows = names && names.length > 0 ? names : [''];

  const update = (index: number, value: string) => onNamesChange(rows.map((n, i) => (i === index ? value : n)));
  const remove = (index: number) => onNamesChange(rows.filter((_, i) => i !== index));
  const add = () => onNamesChange([...rows, '']);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">
        {label}
        {cleanNames(rows).length > 1 && (
          <span className="ml-1.5 rounded bg-muted px-1.5 py-px text-[10px] font-bold text-muted-foreground">
            {cleanNames(rows).length}
          </span>
        )}
      </Label>
      <div className="space-y-2">
        {rows.map((name, index) => (
          <div key={index} className="flex items-center gap-1.5">
            <Input
              placeholder={placeholder}
              className={focusClass}
              value={name}
              onChange={(e) => update(index, e.target.value)}
            />
            {rows.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(index)}
                className="h-9 w-9 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                title="Retirer"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={add}
        className="h-7 gap-1 px-2 text-xs font-medium text-primary hover:bg-primary/10 hover:text-primary"
      >
        <Plus className="h-3.5 w-3.5" />
        {addLabel}
      </Button>
    </div>
  );
}

export function SaisieProcedureFields({
  agents,
  values,
  onChange,
  onListChange,
  onPersonsChange,
  focusClass = 'focus:border-emerald-500',
}: SaisieProcedureFieldsProps) {
  const sortedAgents = [...agents].sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', 'fr'));

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Agent constatateur</Label>
        <Select value={values.agentId || 'none'} onValueChange={(val) => onChange('agentId', val)}>
          <SelectTrigger>
            <SelectValue placeholder="Sélectionner l'agent" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Non spécifié</SelectItem>
            {sortedAgents.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.rank ? `${a.rank} ` : ''}
                {a.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Qualité (OPJ / APJ)</Label>
        <Select
          value={values.agentQualite || 'inconnu'}
          onValueChange={(val) => onChange('agentQualite', val === 'inconnu' ? '' : val)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="inconnu">Non renseignée</SelectItem>
            <SelectItem value="OPJ">OPJ — Officier de police judiciaire</SelectItem>
            <SelectItem value="APJ">APJ — Agent de police judiciaire</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">N° d&apos;ordre de mission</Label>
        <Input
          placeholder="Ex : 045/BSSI/2026"
          className={focusClass}
          value={values.missionOrderNumber}
          onChange={(e) => onChange('missionOrderNumber', e.target.value)}
        />
      </div>

      <NameListField
        label="Service(s)"
        addLabel="Ajouter un service"
        placeholder="Ex : BSSI, Douanes, Gendarmerie…"
        names={values.services}
        onNamesChange={(list) => onListChange('services', list)}
        focusClass={focusClass}
      />

      <PersonListField
        label="Contrevenant(s)"
        addLabel="Ajouter un contrevenant"
        placeholder="Nom et prénoms du contrevenant"
        persons={values.contrevenants}
        onPersonsChange={(list) => onPersonsChange('contrevenants', list)}
        focusClass={focusClass}
      />

      <PersonListField
        label="Interpellé(s)"
        addLabel="Ajouter un interpellé"
        placeholder="Nom et prénoms de l'interpellé"
        persons={values.interpelles}
        onPersonsChange={(list) => onPersonsChange('interpelles', list)}
        focusClass={focusClass}
      />

      <datalist id="saisie-nationalites">
        {NATIONALITES.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
    </div>
  );
}
