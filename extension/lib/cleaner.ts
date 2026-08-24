const REMOVE_TAGS = ['script', 'style', 'nav', 'header', 'footer',
  'svg', 'img', 'noscript', 'iframe', 'video', 'audio', 'picture', 'aside', 'form'];

// Bandeaux cookies / consentement — sinon ce bruit fuite en tête d'extraction
// (testé sur Lever et Indeed). Sélecteurs d'attribut insensibles à la casse.
const REMOVE_SELECTORS = [
  '[class*="cookie" i]', '[id*="cookie" i]',
  '[class*="consent" i]', '[id*="consent" i]',
  '[class*="gdpr" i]', '[aria-label*="cookie" i]',
];

// Conteneur PRÉCIS de l'offre affichée. Crucial sur les job boards SPA (Indeed,
// LinkedIn…) où <main> contient toute la liste de résultats, pas l'offre ouverte.
// Essayés dans l'ordre, avant tout fallback générique.
const JOB_SELECTORS = [
  '#jobDescriptionText',                              // Indeed (description)
  '.jobsearch-RightPane', '.jobsearch-JobComponent',  // Indeed (panneau détail)
  '.jobs-description__content', '.jobs-description-content__text',
  '.jobs-box__html-content', '.show-more-less-html__markup', // LinkedIn
  '[data-testid="job-section-description"]',           // Welcome to the Jungle
  '[data-automation-id="jobPostingDescription"]',      // Workday
  '.posting-page', '[data-qa="job-description"]',       // Lever
  '[class*="job-description" i]', '[class*="jobdescription" i]',
  '[id*="job-description" i]', '[id*="jobdescription" i]',
];

function pickContent(): HTMLElement {
  // 1. Conteneur d'offre connu / spécifique
  for (const sel of JOB_SELECTORS) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el && el.innerText.trim().length > 200) return el;
  }
  // 2. Contenu principal sémantique
  for (const sel of ['main', '[role="main"]', 'article']) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el && el.innerText.trim().length > 400) return el;
  }
  // 3. Dernier recours
  return document.body;
}

// Texte nettoyé de l'offre courante. On préfixe le titre de la page (souvent
// "Intitulé du poste - Entreprise") comme indice fiable pour le modèle.
export function extractJobOffer(): string {
  const clone = pickContent().cloneNode(true) as HTMLElement;
  REMOVE_TAGS.forEach(tag => clone.querySelectorAll(tag).forEach(el => el.remove()));
  REMOVE_SELECTORS.forEach(sel => {
    try { clone.querySelectorAll(sel).forEach(el => el.remove()); } catch { /* sélecteur non supporté */ }
  });
  const body = clone.innerText.replace(/\s{3,}/g, '\n\n').trim();
  const title = document.title.trim();
  return `${title ? title + '\n\n' : ''}${body}`.slice(0, 8000);
}
