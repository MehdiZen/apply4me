export interface UserProfile {
  cvText: string;
  targetRole: string;       // poste(s) / domaine visé — cadre la pertinence
  motivations: string;      // ce qui le motive vraiment dans ce métier
  proudAchievement: string; // une réussite concrète, avec contexte / chiffres
  humanEdge: string;        // ce qu'il apporte au-delà du CV
  writingSample: string;    // quelques phrases avec ses mots — mimique de voix
  otherContext?: string;    // optionnel : contexte libre qui ne rentre nulle part ailleurs
  toneHint?: string;        // optionnel : 1-3 mots de ton
  salaryExpectation?: string;
  availability?: string;
}

export type LetterLang = 'fr' | 'en';

export interface ExtensionStorage {
  apiKey: string;
  provider: 'anthropic' | 'openai';
  model: string;
  profile: UserProfile;
  letterLang: LetterLang; // langue de génération de la lettre, choisie par offre
}

// ── Messages : popup → content script (onglet actif) ──────────────────────────
export type ContentRequest =
  | { type: 'GET_OFFER' }
  | { type: 'FILL_TEXTAREA'; text: string };

export interface OfferResponse {
  offer: string;
  hasTextarea: boolean;
}

export interface FillResponse {
  ok: boolean;
  error?: string;
}
