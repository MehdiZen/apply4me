import type { Entry, LetterLang } from '../types';

// Liens du CV : ceux de l'en-tête et ceux d'une entrée (dépôt d'un projet,
// page d'une certification). Sur le document, aucun texte n'est ajouté : c'est
// le mot déjà écrit qui devient cliquable.

// Adresse cliquable, ou null. Seuls http et https passent : un "javascript:"
// glissé dans la base ne doit jamais finir dans un href.
export function toHref(raw: string): string | null {
  const s = raw.trim();
  if (!s || /\s/.test(s)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.')) return null;
    return url.href;
  } catch {
    return null;
  }
}

// Mots sous lesquels un lien peut s'accrocher : le dernier segment du chemin
// (github.com/x/apply4me → apply4me), puis le domaine (tisseurduweb.com).
function labelsOf(href: string): string[] {
  const url = new URL(href);
  const segment = url.pathname.split('/').filter(Boolean).pop() ?? '';
  let last = segment;
  try { last = decodeURIComponent(segment); } catch { /* segment mal encodé : gardé tel quel */ }
  last = last.replace(/\.git$/i, '');
  const host = url.hostname.replace(/^www\./i, '');
  return [last, host].filter(l => l.length >= 3);
}

export interface Span { text: string; href?: string }

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Découpe un texte pour rendre cliquable, pour chaque lien, la première
// occurrence de son mot (mot entier, sans tenir compte de la casse).
export function linkSpans(text: string, hrefs: string[]): { spans: Span[]; used: Set<string> } {
  const hits: { start: number; end: number; href: string }[] = [];
  for (const href of hrefs) {
    for (const label of labelsOf(href)) {
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(label)}(?![\\p{L}\\p{N}])`, 'iu');
      const m = re.exec(text);
      if (!m) continue;
      const hit = { start: m.index, end: m.index + m[0].length, href };
      if (!hits.some(h => hit.start < h.end && h.start < hit.end)) hits.push(hit);
      break;
    }
  }
  hits.sort((a, b) => a.start - b.start);
  const spans: Span[] = [];
  let at = 0;
  for (const h of hits) {
    if (h.start > at) spans.push({ text: text.slice(at, h.start) });
    spans.push({ text: text.slice(h.start, h.end), href: h.href });
    at = h.end;
  }
  if (at < text.length || !spans.length) spans.push({ text: text.slice(at) });
  return { spans, used: new Set(hits.map(h => h.href)) };
}

// Titre et détail d'une entrée. Un lien dont le mot n'apparaît nulle part
// s'accroche au titre entier, pour ne pas être perdu.
export function entrySpans(entry: Entry, lang: LetterLang): { title: Span[]; detail: Span[] | null } {
  const hrefs = [...new Set((entry.links ?? []).map(toHref).filter((h): h is string => h !== null))];
  const title = linkSpans(entry.title[lang], hrefs);
  const detail = entry.detail ? linkSpans(entry.detail[lang], hrefs) : null;
  const orphan = hrefs.find(h => !title.used.has(h) && !detail?.used.has(h));
  const titleSpans = orphan && !title.used.size ? [{ text: entry.title[lang], href: orphan }] : title.spans;
  return { title: titleSpans, detail: detail?.spans ?? null };
}

// Liens d'un PDF : dans un CV exporté, l'adresse est souvent cachée sous un
// mot ("GitHub", nom d'un projet) et disparaît de l'extraction du texte. On
// relit les annotations /URI du fichier. Les PDF qui compressent leurs
// annotations (flux d'objets) ne livrent rien ici : le CV reste importé sans.
export function pdfLinks(bytes: Uint8Array): string[] {
  const raw = new TextDecoder('latin1').decode(bytes);
  const found: string[] = [];
  for (const m of raw.matchAll(/\/URI\s*\(((?:\\.|[^\\)])*)\)/g)) {
    found.push(m[1].replace(/\\([()\\])/g, '$1'));
  }
  for (const m of raw.matchAll(/\/URI\s*<([0-9a-fA-F\s]+)>/g)) {
    const hex = m[1].replace(/\s/g, '');
    found.push(hex.match(/../g)?.map(h => String.fromCharCode(parseInt(h, 16))).join('') ?? '');
  }
  return [...new Set(found.map(toHref).filter((h): h is string => h !== null))];
}
