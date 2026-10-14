import type { ExtensionStorage, FactBase, LetterLang, OfferAnalysis, SearchPreferences, Settings, UserProfile } from '../types';
import { hasPreferences } from './preferences';
import { DEFAULT_SETTINGS } from '../types';
import { normalizeFactBase } from './factbase';
import { MODELS, type Provider } from './models';

export async function get<K extends keyof ExtensionStorage>(
  key: K
): Promise<ExtensionStorage[K] | undefined> {
  const result = await chrome.storage.local.get(key as string);
  return result[key as string] as ExtensionStorage[K] | undefined;
}

export async function set<K extends keyof ExtensionStorage>(
  key: K,
  value: ExtensionStorage[K]
): Promise<void> {
  await chrome.storage.local.set({ [key as string]: value });
}

export async function getApiConfig(): Promise<{
  apiKey: string;
  provider: 'anthropic' | 'openai';
  model: string;
} | null> {
  const result = await chrome.storage.local.get(['apiKey', 'provider', 'model']);
  if (!result['apiKey'] || !result['provider']) return null;
  return {
    apiKey: result['apiKey'] as string,
    provider: result['provider'] as 'anthropic' | 'openai',
    model: upgradeModel(result['model'] as string) || defaultModel(result['provider'] as 'anthropic' | 'openai'),
  };
}

export function defaultModel(provider: Provider): string {
  return (MODELS[provider].find(m => m.recommended) ?? MODELS[provider][0]).id;
}

// Anciens modèles proposés par l'extension → équivalent actuel, pour qu'un
// réglage enregistré ne reste pas bloqué sur une génération dépassée.
const UPGRADES: Record<string, string> = {
  'claude-haiku-4-5-20251001': 'claude-haiku-5-5',
  'claude-sonnet-4-6': 'claude-sonnet-5-5',
  'claude-opus-4-7': 'claude-opus-5-5',
  'gpt-5.4-nano': 'gpt-6-luna',
  'gpt-5.4-mini': 'gpt-6.1-sol',
  'gpt-5.5': 'gpt-6-astra',
};

export function upgradeModel(model: string | undefined): string | undefined {
  return model ? UPGRADES[model] ?? model : model;
}

export async function getProfile(): Promise<UserProfile | null> {
  const result = await get('profile');
  return result ?? null;
}

// Langue de la lettre — préférence mémorisée, modifiable à chaque offre.
export async function getLetterLang(): Promise<LetterLang> {
  const result = await get('letterLang');
  return result ?? 'fr';
}

export async function setLetterLang(lang: LetterLang): Promise<void> {
  await set('letterLang', lang);
}

export async function getFactBase(): Promise<FactBase | null> {
  const base = (await get('factBase')) ?? null;
  // Base enregistrée avant les rubriques libres : migrée une fois, en gardant
  // le même affichage (voir migrateLegacyGroups).
  if (base && (base.skills.some(s => !('group' in s)) || base.skillGroups.some(g => !('id' in g)))) {
    const migrated = normalizeFactBase(base);
    await setFactBase(migrated);
    return migrated;
  }
  return base;
}

export async function setFactBase(base: FactBase): Promise<void> {
  await set('factBase', base);
}


export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...((await get('settings')) ?? {}) };
}

export async function setSettings(settings: Settings): Promise<void> {
  await set('settings', settings);
}

export async function getStretchMemory(): Promise<string[]> {
  return (await get('stretchMemory')) ?? [];
}

export async function setStretchMemory(names: string[]): Promise<void> {
  await set('stretchMemory', names);
}

// ── Cache d'analyse ───────────────────────────────────────────────────────────
// Clé = empreinte du texte de l'offre et des compétences de la base : une page
// dont l'URL ne change pas (SPA) ou une offre collée retrouvent leur analyse,
// et modifier la base invalide le cache. Version en tête : changer la façon
// d'analyser invalide tout.
const ANALYSIS_VERSION = 'v13';
const CACHE_MAX = 40;

// Les préférences de recherche orientent la lecture de l'offre (signaux) :
// les changer invalide aussi l'analyse. Vides, elles ne comptent pas.
export async function analysisFingerprint(offer: string, base: FactBase, prefs?: SearchPreferences): Promise<string> {
  const skills = base.skills.map(s => `${s.name}:${s.level}:${s.aliases.join('|')}`).join(';');
  const wanted = hasPreferences(prefs) ? JSON.stringify(prefs) : '';
  const bytes = new TextEncoder().encode(`${ANALYSIS_VERSION}\n${offer.trim()}\n${skills}\n${wanted}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function getCachedAnalysis(key: string): Promise<OfferAnalysis | null> {
  return (await get('analysisCache'))?.[key]?.analysis ?? null;
}

export async function setCachedAnalysis(key: string, analysis: OfferAnalysis): Promise<void> {
  const cache = { ...((await get('analysisCache')) ?? {}), [key]: { analysis, at: Date.now() } };
  const kept = Object.entries(cache).sort((a, b) => b[1].at - a[1].at).slice(0, CACHE_MAX);
  await set('analysisCache', Object.fromEntries(kept));
}

// ── Données de session : effacées à la fermeture du navigateur ────────────────
export async function sessionGet<T>(key: string): Promise<T | null> {
  try {
    const r = await chrome.storage.session.get(key);
    return (r[key] as T) ?? null;
  } catch {
    return null;
  }
}

export async function sessionSet(key: string, value: unknown): Promise<void> {
  try {
    await chrome.storage.session.set({ [key]: value });
  } catch { /* session indisponible */ }
}
