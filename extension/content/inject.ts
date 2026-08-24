// Détection et remplissage de la zone "lettre de motivation" sur la page.
// On ne touche qu'à UNE cible, jamais à tout le formulaire — c'est ce qui rend
// l'opération simple et fiable.
//
// Deux familles de cibles :
//  - <textarea>            → setter natif (React/Vue détectent le changement)
//  - [contenteditable]     → éditeurs riches (Workday, Ashby, Draft, Quill,
//                            ProseMirror, Lexical) qui ignorent une écriture
//                            directe dans le DOM

const KEYWORDS = [
  'motivation', 'cover', 'lettre', 'message', 'pourquoi', 'why',
  'presentation', 'présentation', 'candidature', 'comment',
  'additional', 'complémentaire', 'complementaire', 'about',
];

export type FillTarget = HTMLTextAreaElement | HTMLElement;

function isVisible(el: HTMLElement): boolean {
  const s = getComputedStyle(el);
  if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function area(el: HTMLElement): number {
  const r = el.getBoundingClientRect();
  return r.width * r.height;
}

function labelText(el: HTMLElement): string {
  let t = '';
  if (el.id) {
    const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (lab) t += ' ' + (lab.textContent ?? '');
  }
  const wrap = el.closest('label');
  if (wrap) t += ' ' + (wrap.textContent ?? '');
  // Éditeurs riches : le libellé vit souvent dans un conteneur voisin
  const labelled = el.getAttribute('aria-labelledby');
  if (labelled) {
    for (const id of labelled.split(/\s+/)) {
      const n = document.getElementById(id);
      if (n) t += ' ' + (n.textContent ?? '');
    }
  }
  return t;
}

function isEditable(el: HTMLElement): boolean {
  const ce = el.getAttribute('contenteditable');
  return ce === '' || ce === 'true' || ce === 'plaintext-only';
}

function score(el: HTMLElement): number {
  const ta = el as HTMLTextAreaElement;
  const hay = [
    ta.name ?? '', el.id,
    ta.placeholder ?? '',
    el.getAttribute('aria-label') ?? '',
    el.getAttribute('data-placeholder') ?? '',
    labelText(el),
  ].join(' ').toLowerCase();

  let s = 0;
  for (const k of KEYWORDS) if (hay.includes(k)) s += 10;

  // Une grande zone de saisie = plus probablement la lettre.
  // rows pour les textarea, hauteur rendue pour les éditeurs riches.
  s += el.tagName === 'TEXTAREA'
    ? Math.min(ta.rows || 0, 10)
    : Math.min(Math.round(el.getBoundingClientRect().height / 24), 10);

  return s;
}

export function findCoverLetterTarget(): FillTarget | null {
  const candidates: HTMLElement[] = [
    ...Array.from(document.querySelectorAll<HTMLTextAreaElement>('textarea')),
    ...Array.from(document.querySelectorAll<HTMLElement>('[contenteditable]')).filter(isEditable),
  ].filter(isVisible);

  if (candidates.length === 0) return null;

  const scored = candidates
    .map(el => ({ el, s: score(el) }))
    .sort((a, b) => b.s - a.s);

  // Un mot-clé pertinent l'emporte ; sinon, la plus grande zone visible.
  if (scored[0].s >= 10) return scored[0].el;
  candidates.sort((a, b) => area(b) - area(a));
  return candidates[0];
}

// Textarea contrôlée (React/Vue) : on passe par le setter natif pour que le
// framework détecte bien le changement de valeur.
function fillTextareaEl(el: HTMLTextAreaElement, text: string): boolean {
  el.focus();
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  )?.set;
  if (setter) setter.call(el, text);
  else el.value = text;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

// Éditeur riche : écrire dans le DOM ne suffit pas (l'éditeur garde son propre
// état et écrase). On sélectionne tout puis on insère via execCommand, seul
// chemin qui déclenche les handlers de Draft/Quill/ProseMirror/Lexical.
// Déprécié mais toujours la voie la plus compatible ; fallback DOM si refusé.
function fillEditableEl(el: HTMLElement, text: string): boolean {
  el.focus();

  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);

  let ok = false;
  try {
    ok = document.execCommand('insertText', false, text);
  } catch { ok = false; }

  if (!ok) {
    el.textContent = text;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Vérifie que l'éditeur a bien conservé le texte (certains l'écrasent).
  return (el.textContent ?? '').trim().length > 0;
}

export function fillTarget(el: FillTarget, text: string): boolean {
  try {
    const ok = el.tagName === 'TEXTAREA'
      ? fillTextareaEl(el as HTMLTextAreaElement, text)
      : fillEditableEl(el, text);
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return ok;
  } catch {
    return false;
  }
}
