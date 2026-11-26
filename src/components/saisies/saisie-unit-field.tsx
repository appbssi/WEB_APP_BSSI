'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export const SAISIE_UNITS = [
  'Unité(s)',
  'Kg',
  'Grammes',
  'Litre(s)',
  'Carton(s)',
  'Sachet(s)',
  'Lot(s)',
  'Pièce(s)',
  'Balle(s) / Munitions',
  'Chevron(s)',
  'Planche(s)',
  'Charbon',
];

const AUTRE = '__autre__';

interface SaisieUnitFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  focusClass?: string;
}

/** Unité de mesure : liste courante, ou « Autre » pour saisir une unité libre. */
export function SaisieUnitField({ label, value, onChange, focusClass = 'focus:border-emerald-500' }: SaisieUnitFieldProps) {
  const isListed = SAISIE_UNITS.includes(value);
  const [otherMode, setOtherMode] = useState(!!value && !isListed);

  // Une saisie déjà enregistrée avec une unité libre s'ouvre en mode « Autre »
  useEffect(() => {
    if (value && !SAISIE_UNITS.includes(value)) setOtherMode(true);
  }, [value]);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">{label}</Label>
      <Select
        value={otherMode ? AUTRE : value || 'Unité(s)'}
        onValueChange={(val) => {
          if (val === AUTRE) {
            setOtherMode(true);
            onChange('');
          } else {
            setOtherMode(false);
            onChange(val);
          }
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder="Sélectionner l'unité" />
        </SelectTrigger>
        <SelectContent>
          {SAISIE_UNITS.map((u) => (
            <SelectItem key={u} value={u}>
              {u}
            </SelectItem>
          ))}
          <SelectItem value={AUTRE}>Autre (à saisir)</SelectItem>
        </SelectContent>
      </Select>
      {otherMode && (
        <Input
          autoFocus
          placeholder="Précisez l'unité (ex : Fagot(s), Tonne(s)…)"
          className={focusClass}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
