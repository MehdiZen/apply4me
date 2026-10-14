import type { FactBase, Settings, UserProfile } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { linkEvidence, normalizeFactBase, normalizeName } from './factbase';
import { get, getFactBase, getProfile, getSettings, setFactBase, setSettings, set } from './storage';
import { readPreferences } from './preferences';

// Fichier de profil complet (réponses + base de faits), pour passer d'un
// navigateur à l'autre ou démarrer avec un profil déjà rempli. La clé API
// n'en fait jamais partie.
export interface ProfileBundle {
  kind: 'apply4me-profile';
  version: 1;
  profile: UserProfile;
  factBase: FactBase | null;
  settings?: Settings;
}

const PROFILE_KEYS: (keyof UserProfile)[] = [
  'cvText', 'targetRole', 'motivations', 'proudAchievement', 'humanEdge',
  'writingSample', 'otherContext', 'toneHint', 'salaryExpectation', 'availability',
];

function readProfile(raw: unknown): UserProfile {
  const src = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const k of PROFILE_KEYS) {
    const v = src[k];
    out[k] = typeof v === 'string' ? v : '';
  }
  const profile = out as unknown as UserProfile;
  if (src['preferences']) profile.preferences = readPreferences(src['preferences']);
  return profile;
}

// Accepte un bundle complet ou une base de faits seule.
export async function importProfileFile(file: File): Promise<{ profile: UserProfile | null; factBase: FactBase | null }> {
  return importProfileData(JSON.parse(await file.text()));
}

// Build personnel (A4M_SEED) : le profil embarqué est chargé au premier
// lancement, tant qu'aucun profil ni base n'existe. Le build public n'a pas de
// seed.json, la requête échoue et rien ne se passe.
// Si le seed embarqué a changé depuis (nouvelles compétences, alias), les
// compétences absentes de la base sont ajoutées et les alias alignés sur le
// seed, sans toucher aux faits ni aux niveaux corrigés par l'utilisateur.
export async function loadBundledSeed(): Promise<boolean> {
  let text: string;
  try {
    const res = await fetch(chrome.runtime.getURL('seed.json'));
    if (!res.ok) return false;
    text = await res.text();
  } catch {
    return false; // build public : pas de seed
  }
  const revision = hash(text);
  const [profile, base, applied] = await Promise.all([getProfile(), getFactBase(), get('seedRevision')]);

  if (!profile && !base) {
    await importProfileData(JSON.parse(text));
    await set('seedRevision', revision);
    return true;
  }
  // Préférences ajoutées au seed après coup : reprises si le profil n'en a pas.
  if (profile && !profile.preferences && applied !== revision) {
    const seeded = ((JSON.parse(text) as Record<string, unknown>)['profile'] as Record<string, unknown> | undefined)?.['preferences'];
    if (seeded) await set('profile', { ...profile, preferences: readPreferences(seeded) });
  }
  if (base && applied !== revision) {
    const raw = JSON.parse(text) as Record<string, unknown>;
    if (raw['factBase']) {
      const seed = normalizeFactBase(raw['factBase']);
      for (const s of seed.skills) {
        const mine = base.skills.find(x => normalizeName(x.name) === normalizeName(s.name));
        // Les alias ne s'éditent pas dans l'interface : ceux du seed font foi,
        // y compris quand on en retire.
        if (!mine) base.skills.push(s);
        else mine.aliases = s.aliases;
      }
      linkEvidence(base);
      await setFactBase(base);
    }
    await set('seedRevision', revision);
  }
  return false;
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h);
}

async function importProfileData(json: unknown): Promise<{ profile: UserProfile | null; factBase: FactBase | null }> {
  const raw = json as Record<string, unknown>;
  if (raw['kind'] === 'apply4me-profile') {
    const profile = readProfile(raw['profile']);
    const factBase = raw['factBase'] ? normalizeFactBase(raw['factBase']) : null;
    await set('profile', profile);
    if (factBase) await setFactBase(factBase);
    if (raw['settings'] && typeof raw['settings'] === 'object') {
      await setSettings({ ...DEFAULT_SETTINGS, ...(raw['settings'] as Partial<Settings>) });
    }
    return { profile, factBase };
  }
  const factBase = normalizeFactBase(raw);
  await setFactBase(factBase);
  return { profile: null, factBase };
}

export async function exportProfileFile(): Promise<void> {
  const bundle: ProfileBundle = {
    kind: 'apply4me-profile',
    version: 1,
    profile: (await getProfile()) ?? readProfile({}),
    factBase: await getFactBase(),
    settings: await getSettings(),
  };
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'apply4me-profil.json';
  a.click();
  URL.revokeObjectURL(url);
}
