import { useState } from 'react';
import type { PrefLevel, SearchPreferences } from '../types';
import { EMPLOYER_LABEL, EMPLOYER_TYPES } from '../lib/preferences';
import { C, Field } from '../ui/components';

// « Ce que je cherche » : ce qui rend un poste désirable ou non, pour tout
// métier. Chaque point de l'analyse citera la ligne de l'annonce qui le justifie.
const LEVELS: { value: PrefLevel; label: string }[] = [
  { value: 'wanted', label: 'Voulu' },
  { value: 'neutral', label: 'Neutre' },
  { value: 'negative', label: 'Plutôt non' },
  { value: 'dealbreaker', label: 'Rédhibitoire' },
];
const CONTRACTS = ['CDI', 'CDD', 'Freelance', 'Alternance', 'Stage', 'Intérim'];

export function PreferencesEditor({ value, onChange }: { value: SearchPreferences; onChange: (p: SearchPreferences) => void }) {
  const set = <K extends keyof SearchPreferences>(k: K, v: SearchPreferences[K]) => onChange({ ...value, [k]: v });
  const kEuros = (s: string): number | null => {
    const n = Number(s.replace(',', '.').replace(/[^\d.]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  // Les deux bornes se saisissent l'une après l'autre : gardées ici tant que
  // la fourchette n'est pas complète.
  const [lo, setLo] = useState(value.salaryTarget?.[0]?.toString() ?? '');
  const [hi, setHi] = useState(value.salaryTarget?.[1]?.toString() ?? '');
  const setTarget = (a: string, b: string) => {
    setLo(a);
    setHi(b);
    const x = kEuros(a);
    const y = kEuros(b);
    set('salaryTarget', x !== null && y !== null ? [Math.min(x, y), Math.max(x, y)] : null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Field label="Postes et contenu visés" value={value.targetRoles} onChange={v => set('targetRoles', v)} multiline rows={2}
        placeholder="Ex : infirmière en bloc opératoire ; chef de chantier gros œuvre ; développeur qui met en production…" />
      <Field label="Missions qui t'éloignent de ton but" value={value.avoidMissions} onChange={v => set('avoidMissions', v)} multiline rows={2}
        placeholder="Ex : soins à domicile ; travail administratif pur ; avant-vente…" />

      <div>
        <p style={label}>Types d'employeur</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 6 }}>
          {EMPLOYER_TYPES.map(t => (
            <label key={t} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12.5, color: C.text }}>
              {EMPLOYER_LABEL[t]}
              <select
                value={value.employers[t] ?? 'neutral'}
                onChange={e => set('employers', { ...value.employers, [t]: e.target.value as PrefLevel })}
                style={select}
              >
                {LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </label>
          ))}
        </div>
      </div>

      <div>
        <p style={label}>Contrats acceptés <span style={{ fontWeight: 400, color: C.muted }}>(aucun coché = indifférent)</span></p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {CONTRACTS.map(c => {
            const on = value.contracts.includes(c);
            return (
              <label key={c} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, cursor: 'pointer' }}>
                <input type="checkbox" checked={on} onChange={() => set('contracts', on ? value.contracts.filter(x => x !== c) : [...value.contracts, c])} />
                {c}
              </label>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 2, minWidth: 220 }}>
          <Field label="Zone géographique" value={value.location} onChange={v => set('location', v)} placeholder="Ex : Lyon et 30 km autour" />
        </div>
        <label style={{ flex: 1, minWidth: 160 }}>
          <p style={label}>Télétravail</p>
          <select value={value.remote} onChange={e => set('remote', e.target.value as SearchPreferences['remote'])} style={{ ...select, width: '100%', padding: '9px 10px' }}>
            <option value="indifferent">Indifférent</option>
            <option value="preferred">Souhaité (sur site uniquement = à voir)</option>
            <option value="required">Indispensable</option>
          </select>
        </label>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Field label="Salaire plancher (k€ brut/an)" value={value.salaryFloor?.toString() ?? ''} onChange={v => set('salaryFloor', kEuros(v))} placeholder="Ex : 32" />
        <Field label="Idéal, de (k€)" value={lo} onChange={v => setTarget(v, hi)} placeholder="Ex : 35" />
        <Field label="à (k€)" value={hi} onChange={v => setTarget(lo, v)} placeholder="Ex : 38" />
      </div>

      <Field label="Ce qui te donne envie dans une annonce" value={value.positives} onChange={v => set('positives', v)} multiline rows={3}
        placeholder={'Une idée par ligne. Ex :\néquipe stable, service qui ouvre\noutils récents, autonomie'} />
      <Field label="Rédhibitoires" value={value.dealbreakers} onChange={v => set('dealbreakers', v)} multiline rows={2}
        placeholder={'Une idée par ligne. Ex :\nnuits fixes\nplus d\'une heure de trajet'} />
      <Field label="Conditions que tu remplis ou non" value={value.conditions} onChange={v => set('conditions', v)} multiline rows={2}
        placeholder={'Ex :\nPermis B : oui\nHabilitation défense : non'}
        hint="Sert à repérer une exigence que tu ne peux pas remplir (nationalité, permis, habilitation…)." />
    </div>
  );
}

const label: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#9A8473', marginBottom: 8 };
const select: React.CSSProperties = {
  padding: '4px 8px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface,
  color: C.text, fontSize: 12, outline: 'none', cursor: 'pointer',
};
