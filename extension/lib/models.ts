// Modèles proposés, du moins cher au plus capable, et répartition des étapes.
// Chaque étape a un rang : le modèle choisi (n), le modèle juste en dessous
// (n-1, si l'option économie est active) ou le modèle rapide du fournisseur.

export type Provider = 'anthropic' | 'openai';
export type Tier = 'main' | 'lower' | 'fast';

export interface ModelInfo {
  id: string;
  label: string;
  role: string;                       // ce qu'il vaut pour l'utilisateur, en quelques mots
  price: { input: number; output: number };  // $ par million de tokens
  recommended?: boolean;
}

export const MODELS: Record<Provider, ModelInfo[]> = {
  anthropic: [
    { id: 'claude-haiku-5-5', label: 'Haiku 5.5', role: 'Économique · lettres plus plates', price: { input: 0.1, output: 0.5 } },
    { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5', role: 'Équilibré · bon rédacteur', price: { input: 2, output: 10 }, recommended: true },
    { id: 'claude-opus-5-5', label: 'Opus 5.5', role: 'Meilleure qualité · plus lent', price: { input: 4, output: 20 } },
  ],
  openai: [
    { id: 'gpt-6-luna', label: 'GPT-6 Luna', role: 'Économique · lettres plus plates', price: { input: 0.1, output: 0.5 } },
    { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', role: 'Équilibré · bon rédacteur', price: { input: 2, output: 10 }, recommended: true },
    { id: 'gpt-6-astra', label: 'GPT-6 Astra', role: 'Meilleure qualité · cher', price: { input: 10, output: 50 } },
  ],
};

// Modèle rapide (extraction d'appoint, fiches de révision) : le moins cher.
export function fastModel(provider: Provider): string {
  return MODELS[provider][0].id;
}

// n-1 : le modèle juste en dessous dans la gamme du fournisseur ; le plus
// petit reste lui-même. Un modèle inconnu (ancien réglage) n'est pas rétrogradé.
export function lowerModel(provider: Provider, model: string): string {
  const list = MODELS[provider];
  const i = list.findIndex(m => m.id === model);
  return i > 0 ? list[i - 1].id : model;
}

export function modelFor(provider: Provider, main: string, tier: Tier, economy: boolean): string {
  if (tier === 'fast') return fastModel(provider);
  if (tier === 'lower' && economy) return lowerModel(provider, main);
  return main;
}

// Étapes d'une candidature complète, avec leur rang et une estimation de
// tokens (entrée / sortie) d'après la taille des prompts : un ordre de
// grandeur pour choisir, pas une mesure.
export const STEPS: { label: string; tier: Tier; input: number; output: number }[] = [
  { label: 'Analyse de l\'offre', tier: 'main', input: 9000, output: 2300 },
  { label: 'Lettre', tier: 'main', input: 16000, output: 1700 },
  { label: 'Juge et peaufinage', tier: 'main', input: 32500, output: 3300 },
  { label: 'CV adapté', tier: 'lower', input: 9000, output: 3000 },
  { label: 'Message au recruteur', tier: 'lower', input: 6000, output: 300 },
  { label: 'Révision et entretien', tier: 'fast', input: 6500, output: 2500 },
];

function price(provider: Provider, id: string) {
  return (MODELS[provider].find(m => m.id === id) ?? MODELS[provider][1]).price;
}

// Coût estimé d'une candidature complète, en dollars (hors tokens de
// réflexion des modèles qui raisonnent).
export function estimateCost(provider: Provider, main: string, economy: boolean): number {
  return STEPS.reduce((sum, s) => {
    const p = price(provider, modelFor(provider, main, s.tier, economy));
    return sum + (s.input * p.input + s.output * p.output) / 1e6;
  }, 0);
}
