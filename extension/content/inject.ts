// Détection et remplissage de la zone "lettre de motivation" sur la page.
// On ne touche qu'à UNE cible (la textarea pertinente), jamais à tout le
// formulaire — c'est ce qui rend ça simple et fiable.

const KEYWORDS = [
  'motivation', 'cover', 'lettre', 'message', 'pourquoi', 'why',
  'presentation', 'présentation', 'candidature', 'comment',
  'additional', 'complémentaire', 'complementaire', 'about',
];

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
  return t;
}

function score(el: HTMLTextAreaElement): number {
  const hay = [
    el.name, el.id, el.placeholder,
    el.getAttribute('aria-label') ?? '',
    labelText(el),
  ].join(' ').toLowerCase();
  let s = 0;
  for (const k of KEYWORDS) if (hay.includes(k)) s += 10;
  s += Math.min(el.rows || 0, 10); // une grande zone = plus probablement la lettre
  return s;
}

export function findCoverLetterTextarea(): HTMLTextAreaElement | null {
  const all = Array.from(document.querySelectorAll('textarea'))
    .filter(isVisible) as HTMLTextAreaElement[];
  if (all.length === 0) return null;

  const scored = all
    .map(el => ({ el, s: score(el) }))
    .sort((a, b) => b.s - a.s);

  // Un mot-clé pertinent l'emporte ; sinon, la plus grande zone visible.
  if (scored[0].s >= 10) return scored[0].el;
  all.sort((a, b) => area(b) - area(a));
  return all[0];
}

// Remplit une textarea contrôlée (React/Vue) : on passe par le setter natif
// pour que le framework détecte bien le changement de valeur.
export function fillTextarea(el: HTMLTextAreaElement, text: string): boolean {
  try {
    el.focus();
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    )?.set;
    if (setter) setter.call(el, text);
    else el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return true;
  } catch {
    return false;
  }
}
