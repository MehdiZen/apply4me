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
  // Standard schema.org JobPosting : SmartRecruiters (Ubisoft…) y regroupe
  // description, missions ET qualifications, rangées dans des sections sœurs.
  '[itemprop="description"]',
  '[class*="job-description" i]', '[class*="jobdescription" i]',
  '[id*="job-description" i]', '[id*="jobdescription" i]',
];

// Indices qu'un bloc contient la partie "profil recherché", celle qui liste les
// compétences exigées. Sans elle, l'analyse ne voit que les missions.
const PROFILE_HINTS = /qualifications|profil recherch|votre profil|le profil|vous avez|vous êtes|requirements|what you bring|who you are|your profile|compétences requises|prérequis|skills/i;

// Un sélecteur générique peut ne capturer qu'une section de l'offre (les
// missions). On remonte vers le parent tant que la partie profil manque, sans
// avaler la page : un parent 4 fois plus long que le bloc courant arrête tout.
function widenToProfile(el: HTMLElement): HTMLElement {
  if (PROFILE_HINTS.test(el.innerText)) return el;
  let cur = el;
  while (cur.parentElement && cur.parentElement !== document.body) {
    const parent = cur.parentElement;
    if (parent.innerText.length > Math.max(cur.innerText.length * 4, 6000)) break;
    cur = parent;
    if (PROFILE_HINTS.test(cur.innerText)) return cur;
  }
  return el;
}

function pickContent(): HTMLElement {
  // 1. Conteneur d'offre connu / spécifique, élargi si la partie profil manque
  for (const sel of JOB_SELECTORS) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el && el.innerText.trim().length > 200) return widenToProfile(el);
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
  const source = pickContent();
  const clone = source.cloneNode(true) as HTMLElement;
  // Le texte caché de la page (display:none, hidden, aria-hidden) n'est pas
  // lu par un recruteur : il ne doit pas l'être par le modèle (pièges du type
  // "si tu es une IA…"). Repéré sur l'original, rendu, puis retiré du clone.
  const hidden = new Set<number>();
  source.querySelectorAll<HTMLElement>('*').forEach((el, i) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || el.hidden || el.getAttribute('aria-hidden') === 'true') hidden.add(i);
  });
  const all = [...clone.querySelectorAll<HTMLElement>('*')];
  hidden.forEach(i => all[i]?.remove());
  REMOVE_TAGS.forEach(tag => clone.querySelectorAll(tag).forEach(el => el.remove()));
  REMOVE_SELECTORS.forEach(sel => {
    try { clone.querySelectorAll(sel).forEach(el => el.remove()); } catch { /* sélecteur non supporté */ }
  });
  // innerText ne respecte les blocs (retours à la ligne entre <li>, <p>…) que
  // sur un élément rendu : un clone détaché collerait "PythonDocker". Le clone
  // est donc rendu hors écran le temps de la lecture.
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${Math.max(source.clientWidth, 600)}px;opacity:0;pointer-events:none;`;
  host.setAttribute('aria-hidden', 'true');
  host.appendChild(clone);
  document.body.appendChild(host);
  let text: string;
  try { text = clone.innerText; } finally { host.remove(); }
  const body = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
  const title = document.title.trim();
  // 12 000 caractères : les offres longues gardent leur partie profil, souvent en fin.
  return `${title ? title + '\n\n' : ''}${body}`.slice(0, 12000);
}
