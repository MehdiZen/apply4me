import type { ExtensionStorage, LetterLang, UserProfile } from '../types';

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
    model: (result['model'] as string) || defaultModel(result['provider'] as 'anthropic' | 'openai'),
  };
}

export function defaultModel(provider: 'anthropic' | 'openai'): string {
  return provider === 'anthropic' ? 'claude-sonnet-4-6' : 'gpt-5.4-nano';
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
