import type { EmployerType, PrefLevel, SearchPreferences } from '../types';

export const EMPTY_PREFERENCES: SearchPreferences = {
  targetRoles: '',
  avoidMissions: '',
  employers: {},
  contracts: [],
  location: '',
  remote: 'indifferent',
  salaryFloor: null,
  salaryTarget: null,
  positives: '',
  dealbreakers: '',
  conditions: '',
};

export const EMPLOYER_LABEL: Record<EmployerType, string> = {
  product: 'Éditeur / produit',
  startup: 'Startup / très petite structure',
  scaleup: 'Scale-up',
  sme: 'PME',
  large: 'Grand groupe',
  consulting: 'ESN / conseil / régie',
  staffing: 'Intérim / portage',
  public: 'Public',
  nonprofit: 'Associatif',
};

export const EMPLOYER_TYPES = Object.keys(EMPLOYER_LABEL) as EmployerType[];
const LEVELS: PrefLevel[] = ['wanted', 'neutral', 'negative', 'dealbreaker'];

// Lecture tolérante (profil importé, ancien seed) : une valeur invalide
// revient au défaut plutôt que de casser le jugement.
export function readPreferences(raw: unknown): SearchPreferences {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const str = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : '');
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
  const emp = (o['employers'] && typeof o['employers'] === 'object' ? o['employers'] : {}) as Record<string, unknown>;
  const employers: SearchPreferences['employers'] = {};
  for (const t of EMPLOYER_TYPES) {
    const v = emp[t];
    if (typeof v === 'string' && (LEVELS as string[]).includes(v)) employers[t] = v as PrefLevel;
  }
  const target = Array.isArray(o['salaryTarget']) ? (o['salaryTarget'] as unknown[]).map(num) : [];
  const remote = o['remote'];
  return {
    targetRoles: str('targetRoles'),
    avoidMissions: str('avoidMissions'),
    employers,
    contracts: Array.isArray(o['contracts']) ? (o['contracts'] as unknown[]).filter((x): x is string => typeof x === 'string' && !!x.trim()) : [],
    location: str('location'),
    remote: remote === 'required' || remote === 'preferred' ? remote : 'indifferent',
    salaryFloor: num(o['salaryFloor']),
    salaryTarget: target.length === 2 && target[0] !== null && target[1] !== null
      ? [Math.min(target[0], target[1]), Math.max(target[0], target[1])]
      : null,
    positives: str('positives'),
    dealbreakers: str('dealbreakers'),
    conditions: str('conditions'),
  };
}

export function hasPreferences(p?: SearchPreferences): boolean {
  if (!p) return false;
  return !!(p.targetRoles.trim() || p.avoidMissions.trim() || p.location.trim() || p.positives.trim()
    || p.dealbreakers.trim() || p.conditions.trim() || p.contracts.length || p.remote !== 'indifferent'
    || p.salaryFloor || p.salaryTarget
    || Object.values(p.employers).some(l => l && l !== 'neutral'));
}
