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
import type { Agent, Saisie } from '@/lib/types';

/** Valeurs du formulaire liées à la procédure : OPJ/APJ, ordre de mission, contrevenants, interpellés. */
export type SaisieProcedureValues = {
  agentId: string;
  agentQualite: '' | 'OPJ' | 'APJ';
  missionOrderNumber: string;
  services: string[];
  contrevenants: string[];
  interpelles: string[];
};

type TextField = 'agentId' | 'agentQualite' | 'missionOrderNumber';
type ListField = 'services' | 'contrevenants' | 'interpelles';

interface SaisieProcedureFieldsProps {
  agents: Agent[];
  values: SaisieProcedureValues;
  onChange: (field: TextField, value: string) => void;
  onListChange: (field: ListField, value: string[]) => void;
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

/** Contrevenants d'une saisie, y compris les anciennes saisies à un seul nom. */
export function getContrevenants(s: Pick<Saisie, 'contrevenants' | 'detaineeName'>): string[] {
  if (s.contrevenants && s.contrevenants.length > 0) return s.contrevenants;
  return s.detaineeName ? [s.detaineeName] : [];
}

/** Interpellés d'une saisie, y compris les anciennes saisies (un nom, ou oui/non). */
export function getInterpelles(s: Pick<Saisie, 'interpelles' | 'interpelle'>): string[] {
  if (s.interpelles && s.interpelles.length > 0) return s.interpelles;
  if (s.interpelle === true) return ['Oui'];
  if (s.interpelle === false) return ['Non'];
  return s.interpelle ? [s.interpelle] : [];
}

/** Liste lisible pour les exports. */
export function namesLabel(list: string[]): string {
  return list.length > 0 ? list.join(', ') : '—';
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
  focusClass = 'focus:border-emerald-500',
}: SaisieProcedureFieldsProps) {
  const sortedAgents = [...agents].sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', 'fr'));

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Agent saisissant</Label>
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

      <NameListField
        label="Contrevenant(s)"
        addLabel="Ajouter un contrevenant"
        placeholder="Nom et prénoms du contrevenant"
        names={values.contrevenants}
        onNamesChange={(list) => onListChange('contrevenants', list)}
        focusClass={focusClass}
      />

      <NameListField
        label="Interpellé(s)"
        addLabel="Ajouter un interpellé"
        placeholder="Nom et prénoms de l'interpellé"
        names={values.interpelles}
        onNamesChange={(list) => onListChange('interpelles', list)}
        focusClass={focusClass}
      />
    </div>
  );
}
