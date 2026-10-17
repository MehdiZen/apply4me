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
  preferences?: SearchPreferences; // ce que la personne cherche (désirabilité d'une offre)
}

// ── Préférences de recherche ──────────────────────────────────────────────────
// Génériques, pour tous les métiers : ce qui rend un poste désirable ou non,
// à côté de la faisabilité (compétences). Vides = aucun jugement de désirabilité.
export type EmployerType = 'product' | 'startup' | 'scaleup' | 'sme' | 'large' | 'consulting' | 'staffing' | 'public' | 'nonprofit';
export type PrefLevel = 'wanted' | 'neutral' | 'negative' | 'dealbreaker';

export interface SearchPreferences {
  targetRoles: string;       // postes et contenu visés
  avoidMissions: string;     // missions qui éloignent du but
  employers: Partial<Record<EmployerType, PrefLevel>>;  // absent = neutre
  contracts: string[];       // acceptés ; vide = indifférent
  location: string;          // zone acceptée
  remote: 'required' | 'preferred' | 'indifferent';
  salaryFloor: number | null;                 // k€ brut annuel
  salaryTarget: [number, number] | null;      // k€ brut annuel
  positives: string;         // une idée par ligne
  dealbreakers: string;      // une idée par ligne
  conditions: string;        // ce que la personne remplit ou non (nationalité, permis, habilitation…)
}

// Un point de l'offre au regard des préférences, avec la ligne qui le justifie.
export interface OfferSignal { label: string; quote: string; dealbreaker: boolean }

export type LetterLang = 'fr' | 'en';

// ── Base de faits ─────────────────────────────────────────────────────────────
// Seule source de vérité pour le CV généré : le LLM sélectionne et reformule,
// il ne crée rien. Chaque texte existe en FR et en EN pour éviter la dérive
// d'une traduction à la volée.
export interface Bilingual { fr: string; en: string }

// 'stretch' n'est pas un niveau de la base : il est attribué par candidature,
// après validation par checkbox (voir PLAN.md).
// 'learning' = "Hors cadre pro" : formation, projet perso, bénévolat (clé historique conservée).
export type SkillLevel = 'expert' | 'prod' | 'touched' | 'learning';
// Ancienne catégorie figée des compétences : lue seulement pour migrer les bases
// existantes vers des rubriques libres (SkillGroupLabel.id).
export type LegacySkillCategory = 'core' | 'cloud' | 'dev' | 'other';
export type ContractKind = 'cdi' | 'cdd' | 'alternance' | 'stage' | 'freelance' | 'other';

export interface Fact {
  id: string;
  text: Bilingual;
  skills: string[];   // compétences que ce fait prouve (noms de Skill)
  numbers: string[];  // seuls chiffres que le générateur a le droit d'écrire
}

export interface FactGroup {
  title: Bilingual | null;
  facts: Fact[];
}

export interface Experience {
  id: string;
  company: string;
  location: string;
  role: Bilingual;
  contract: ContractKind;
  start: string;          // "AAAA-MM"
  end: string | null;     // null = poste actuel
  context: Bilingual | null;
  groups: FactGroup[];
}

export interface Skill {
  name: string;
  aliases: string[];
  level: SkillLevel;
  group: string | null;   // id de la rubrique du CV ; null = pas dans la ligne Compétences
  pinned?: boolean;       // affichée sur tous les CV, jamais retirée pour tenir sur la page
  evidence: string[];     // ids de Fact
  source: 'cv' | 'user';
}

// Formation, certification, projet : une ligne, éventuellement un détail.
export interface Entry {
  id: string;
  title: Bilingual;
  detail: Bilingual | null;
  date: string;
  links?: string[];  // dépôt, démo, page : rendus cliquables sur le mot déjà écrit
}

// Rubrique de la ligne Compétences, telle que l'utilisateur l'a dans son CV.
export interface SkillGroupLabel { id: string; label: Bilingual }

export interface FactBase {
  version: 1;
  identity: {
    name: string;
    title: Bilingual;
    contact: Bilingual;   // ligne de contact telle qu'affichée (ville, mobilité, tél, mail)
    links: string[];
    languages: Bilingual;
  };
  summary: Bilingual;
  experiences: Experience[];
  education: Entry[];
  certifications: Entry[];
  projects: Entry[];
  skillGroups: SkillGroupLabel[];
  skills: Skill[];
}

// ── Analyse d'une offre ───────────────────────────────────────────────────────
export type RequirementKind = 'tech' | 'domain' | 'years' | 'diploma' | 'language' | 'soft';

export interface Requirement {
  label: string;               // nom court tel qu'une annonce l'écrit ("Python", "Kubernetes")
  kind: RequirementKind;
  mandatory: boolean;
  minYears: number | null;
  named?: boolean;             // produit / outil précis (React) plutôt que catégorie (framework front-end)
  matches: string[];           // noms de compétences de la base qui la couvrent (vérifiés par le code)
  met: boolean | null;         // diplôme / langue : jugement du modèle, null si inconnu
  group: string;               // id de rubrique où l'ajouter si elle devient un stretch ('' = dernière)
  equivalent?: boolean;        // diplôme : « ou équivalent » accepté
}

export interface OfferAnalysis {
  title: string;
  company: string;             // employeur qui recrute ; vide s'il n'est pas nommé
  recruiter?: string;          // cabinet de recrutement qui publie pour un client
  formerEmployer?: string;     // expérience du candidat chez cet employeur (nom exact de la base)
  brief?: OfferBrief;          // informations triées pour les étapes suivantes (CV, lettre)
  signals?: { positives: OfferSignal[]; negatives: OfferSignal[] };  // au regard des préférences, citations vérifiées
  lang: LetterLang;            // langue de l'annonce
  minYears: number | null;     // expérience totale demandée
  requirements: Requirement[];
  warning?: string;            // étape d'analyse dégradée, à montrer à l'utilisateur
}

// Passe de lecture de l'offre : ce que le CV et la lettre doivent savoir, déjà
// trié. Aide les étapes suivantes, ne remplace pas le texte de l'offre.
export interface OfferBrief {
  sector: string;              // secteur / métier de l'employeur
  location: string;
  contract: string;            // tel qu'écrit (CDI, freelance, permanent…)
  workMode: string;            // sur site, hybride, télétravail
  mission: string;             // la mission du poste en une phrase
  companyFacts: string[];      // ce que l'entreprise dit d'elle-même de concret (taille, produit, étape, valeurs affichées)
  teamContext: string;         // équipe, rattachement, interlocuteurs
  employerType: EmployerType | '';
  salary: { min: number | null; max: number | null };  // k€ brut annuel
  remoteDays: number | null;   // jours de télétravail par semaine, 0 = sur site, null = non dit
  contractType: string;        // CDI, CDD, freelance, alternance, stage, intérim ou ''
  conditions: string[];        // nationalité, habilitation, permis, horaires… exigés
}

export interface CoveredRequirement {
  requirement: string;
  skill: string;
  level: SkillLevel;
  evidence: string[];          // ids de Fact
}

export interface StretchCandidate {
  label: string;
  group: string;
  mandatory: boolean;
  checked: boolean;            // pré-coché si déjà choisi sur une offre précédente
}

export interface MatchResult {
  verdict: 'apply' | 'skip';
  reason: string;
  score: number;               // 0-100
  yearsHave: number;
  yearsNeed: number | null;
  covered: CoveredRequirement[];
  hardGaps: string[];
  softGaps: string[];
  stretch: StretchCandidate[]; // vide si l'option est désactivée
}

// ── CV adapté ─────────────────────────────────────────────────────────────────
export interface TailoredFact {
  id: string;
  text: string;
  relevance: number;   // 1-5 pour cette offre : sert à couper si le CV déborde
  reverted: boolean;   // reformulation rejetée par le validateur, texte d'origine conservé
}

export interface TailoredExperience { id: string; facts: TailoredFact[] }

export interface TailoredSkillLine {
  group: string;
  label: string;
  // keep : jamais retiré pour tenir sur une page (demandé par l'offre, coché, épinglé)
  items: { name: string; stretch: boolean; keep?: boolean }[];
}

export interface TailoredCV {
  lang: LetterLang;
  headline: string;
  summary: string;
  experiences: TailoredExperience[];
  skills: TailoredSkillLine[];
  warnings: string[];          // corrections appliquées par le validateur
}

export interface PrepItem { skill: string; basics: string[]; questions: string[] }

// Préparation de l'entretien, au-delà des ajouts cochés : questions probables
// sur le parcours (avec le fait de la base qui y répond), sur l'entreprise, et
// questions à poser.
export interface InterviewPrep {
  experience: { question: string; answer: string }[];  // answer : angle tiré des faits, pas un texte à réciter
  company: string[];                                    // ce qu'il faut savoir / vérifier sur l'employeur
  toAsk: string[];                                      // questions à poser au recruteur
}

// Relecture de la lettre par un juge : chaque critique cite la lettre mot pour
// mot (vérifié par le code), ce qui manque à la base est signalé à part.
export interface LetterReviewIssue {
  quote: string;    // extrait exact de la lettre
  problem: string;  // pourquoi ça ne va pas, pour ce lecteur
  fix: string;      // consigne de réécriture, avec les seuls faits de la base
}

// Qui lit la lettre : tri RH, futur manager (rôle déduit de l'offre), rédacteur,
// ou les trois à la fois (peaufinage automatique).
export type ReviewPersona = 'recruiter' | 'manager' | 'editor' | 'panel';

export interface LetterReview {
  verdict: 'send' | 'rework';
  reader: string;          // le lecteur tel que le juge l'a incarné ("Tech lead de la squad", "Cadre de santé")
  good: string[];
  issues: LetterReviewIssue[];
  missingFacts: string[];  // ce qu'il faudrait ajouter à la base pour aller plus loin
}

// ── Candidature (espace de travail + journal) ─────────────────────────────────
export interface Job {
  id: string;
  url: string;
  tabId: number | null;        // onglet de l'offre, pour insérer la lettre
  offer: string;
  analysis: OfferAnalysis;
  match: MatchResult;
  stretch: string[];           // compétences cochées
  lang: LetterLang;
  forced: boolean;             // "postuler quand même" malgré un skip
  createdAt: string;
}

export type ApplicationStatus = 'generated' | 'sent' | 'interview' | 'rejected' | 'offer';

export interface Application {
  id: string;
  date: string;
  company: string;
  title: string;
  url: string;
  score: number;
  verdict: 'apply' | 'skip';
  forced: boolean;
  lang: LetterLang;
  stretch: string[];
  status: ApplicationStatus;
  prep: PrepItem[];
}

export interface Settings {
  allowStretch: boolean;
  yearsTolerance: number;      // 0.7 = skip seulement sous 70 % des années demandées
  scoreThreshold: number;
  economy: boolean;            // CV et message sur le modèle juste en dessous du modèle choisi
}

export const DEFAULT_SETTINGS: Settings = {
  allowStretch: false,
  yearsTolerance: 0.7,
  scoreThreshold: 50,
  economy: true,
};

export interface ExtensionStorage {
  apiKey: string;
  provider: 'anthropic' | 'openai';
  model: string;
  profile: UserProfile;
  letterLang: LetterLang; // langue de génération de la lettre, choisie par offre
  factBase: FactBase;
  settings: Settings;
  stretchMemory: string[]; // compétences déjà cochées (noms normalisés)
  applications: Application[];
  seedRevision: string;    // build personnel : version du profil embarqué déjà fusionnée
  // Analyses par empreinte (texte de l'offre + compétences de la base) : la
  // même offre donne le même verdict jusqu'à "Réanalyser".
  analysisCache: Record<string, { analysis: OfferAnalysis; at: number }>;
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
