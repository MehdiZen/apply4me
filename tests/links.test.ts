import { describe, expect, it } from 'vitest';
import { entrySpans, linkSpans, pdfLinks, toHref } from '../extension/lib/links';
import type { Entry } from '../extension/types';

const entry = (title: string, detail: string | null, links: string[]): Entry => ({
  id: 'p', title: { fr: title, en: title }, detail: detail ? { fr: detail, en: detail } : null, date: '', links,
});
const linked = (spans: { text: string; href?: string }[]) => spans.filter(s => s.href).map(s => [s.text, s.href]);

describe('toHref', () => {
  it('ajoute https à un domaine nu', () => expect(toHref('github.com/MehdiZen')).toBe('https://github.com/MehdiZen'));
  it('garde http et https', () => expect(toHref('http://site.fr/a')).toBe('http://site.fr/a'));
  it.each(['javascript:alert(1)', 'mailto:a@b.fr', 'Portfolio', 'deux mots.fr', ''])('refuse « %s »', s => expect(toHref(s)).toBeNull());
});

describe('linkSpans', () => {
  it('le mot déjà écrit devient le lien, le texte reste identique', () => {
    const text = '4 produits : apply4me (candidature), deck4me (overlay).';
    const { spans } = linkSpans(text, ['https://github.com/x/apply4me', 'https://github.com/x/deck4me']);
    expect(spans.map(s => s.text).join('')).toBe(text);
    expect(linked(spans)).toEqual([['apply4me', 'https://github.com/x/apply4me'], ['deck4me', 'https://github.com/x/deck4me']]);
  });
  it('mot entier seulement, casse ignorée', () => {
    expect(linked(linkSpans('monapply4me', ['https://g.com/apply4me']).spans)).toEqual([]);
    expect(linked(linkSpans('Apply4me.', ['https://g.com/apply4me']).spans)).toEqual([['Apply4me', 'https://g.com/apply4me']]);
  });
  it('domaine du site reconnu', () => {
    expect(linked(linkSpans('Portfolio sur tisseurduweb.com', ['https://tisseurduweb.com/']).spans))
      .toEqual([['tisseurduweb.com', 'https://tisseurduweb.com/']]);
  });
});

describe('entrySpans', () => {
  it('lien sans mot correspondant : accroché au titre', () => {
    const s = entrySpans(entry('Mémoire de recherche', 'Prix du jury', ['https://hal.science/hal-0123']), 'fr');
    expect(linked(s.title)).toEqual([['Mémoire de recherche', 'https://hal.science/hal-0123']]);
  });
  it('liens dans le détail : titre laissé tel quel', () => {
    const s = entrySpans(entry('Gamme 4me', 'apply4me et deck4me', ['github.com/x/apply4me', 'github.com/x/deck4me']), 'fr');
    expect(linked(s.title)).toEqual([]);
    expect(linked(s.detail ?? [])).toHaveLength(2);
  });
  it('entrée sans liens (base enregistrée avant) : texte brut', () => {
    const e: Entry = { id: 'e', title: { fr: 'BTS', en: 'BTS' }, detail: null, date: '' };
    expect(entrySpans(e, 'fr')).toEqual({ title: [{ text: 'BTS' }], detail: null });
  });
});

describe('pdfLinks', () => {
  const pdf = (s: string) => new TextEncoder().encode(s);
  it('lit les annotations URI, dédoublonne, écarte le reste', () => {
    const raw = '<< /S /URI /URI (https://github.com/x/apply4me) >> << /URI (https://github.com/x/apply4me) >>'
      + ' << /URI (mailto:a@b.fr) >> << /URI <68747470733A2F2F612E6672> >> << /URI (https://a.fr/p\\(1\\)) >>';
    expect(pdfLinks(pdf(raw))).toEqual(['https://github.com/x/apply4me', 'https://a.fr/p(1)', 'https://a.fr/']);
  });
  it('PDF sans lien', () => expect(pdfLinks(pdf('%PDF-1.4 rien'))).toEqual([]));
});
