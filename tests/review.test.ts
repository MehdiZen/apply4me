import { beforeEach, describe, expect, it, vi } from 'vitest';

// review.ts importe llm.ts (storage, chrome) : les appels au modèle et les
// contrôles de la lettre sont simulés.
vi.mock('../extension/lib/llm', () => ({ callLLMJSON: vi.fn(), writeCheckedLetter: vi.fn(), letterChecks: vi.fn(() => []), factChecks: vi.fn(() => []) }));

import { readReview, reviewToHint } from '../extension/lib/review';
import { allowedNumbers, JUDGE_MARK, ownHint } from '../extension/lib/validate';

const letter = `Madame, Monsieur,
Je suis infirmière en chirurgie et je postule à votre poste d’infirmière en ambulatoire.
Mon parcours est encore récent — mais j’ai repris l’équipe de nuit.
Cordialement,`;

const issue = (quote: string, fix = 'Réécris-la.') => ({ quote, problem: 'Faible.', fix });

describe('readReview', () => {
  it('garde une critique dont l\'extrait est dans la lettre, malgré apostrophes, espaces et guillemets', () => {
    const r = readReview({ verdict: 'rework', good: ['Ouverture directe'], issues: [issue("« votre poste d'infirmière  en ambulatoire »")] }, letter);
    expect(r.issues.map(i => i.quote)).toEqual(["votre poste d'infirmière en ambulatoire"]);
  });

  it('garde un extrait exact qui contient un tiret long', () => {
    const r = readReview({ issues: [issue('Mon parcours est encore récent — mais j’ai repris')] }, letter);
    expect(r.issues).toHaveLength(1);
  });

  it('écarte une critique qui cite un texte absent de la lettre, ou trop court pour prouver quelque chose', () => {
    const r = readReview({ issues: [issue('Je suis passionnée par votre mission'), issue('je suis')] }, letter);
    expect(r.issues).toEqual([]);
  });

  it('garde un manque sans extrait, et écarte une critique sans consigne', () => {
    const r = readReview({
      issues: [
        { quote: '', problem: 'Le diplôme demandé n\'apparaît pas.', fix: 'Mentionne le DE infirmier.' },
        issue('Mon parcours est encore récent', ''),
      ],
    }, letter);
    expect(r.issues.map(i => i.fix)).toEqual(['Mentionne le DE infirmier.']);
  });

  it('tolère une réponse mal formée', () => {
    expect(readReview(null, letter)).toEqual({ verdict: 'rework', reader: '', good: [], issues: [], missingFacts: [] });
    expect(readReview({ verdict: 'send', good: 'oui', issues: 'non' }, letter).verdict).toBe('send');
  });
});

describe('consignes du juge', () => {
  const hint = reviewToHint({
    verdict: 'rework', reader: '', good: [], missingFacts: [],
    issues: [
      { quote: 'Mon parcours est encore récent', problem: '', fix: 'Relie-le à la suite.' },
      { quote: '', problem: '', fix: 'Cite les 300 patients de l\'offre.' },
    ],
  });

  it('une consigne par ligne, marquée, avec l\'extrait visé', () => {
    expect(hint).toBe(`${JUDGE_MARK}« Mon parcours est encore récent » : Relie-le à la suite.\n${JUDGE_MARK}Cite les 300 patients de l'offre.`);
  });

  it('les chiffres d\'une consigne du juge ne deviennent pas des chiffres permis, ceux du candidat si', () => {
    const own = ownHint(`${hint}\nJ'ai formé 12 aides-soignants.`);
    const allowed = allowedNumbers(null, null, own);
    expect(allowed.has('300')).toBe(false);
    expect(allowed.has('12')).toBe(true);
  });
});

// ── Peaufinage automatique ────────────────────────────────────────────────────
import { callLLMJSON, factChecks, writeCheckedLetter } from '../extension/lib/llm';
import { polishLetter } from '../extension/lib/review';
import type { UserProfile } from '../extension/types';
import { base, offer } from './fixtures';

const judged = (verdict: 'send' | 'rework', quotes: string[]) => ({
  reader: 'Tech lead', verdict, good: ['Concret'],
  issues: quotes.map(q => ({ quote: q, problem: 'Faible.', fix: 'Réécris-la.' })),
});
const v = (n: number) => `Madame, Monsieur,\nVersion ${n} de la lettre, avec une phrase assez longue pour être citée.\nCordialement,`;
const quote = (n: number) => `Version ${n} de la lettre`;
const invented = "Le chiffre « 40 » n'existe pas dans le profil : retire-le.";
const input = {
  letter: v(0), offer: 'Offre', analysis: offer([]), base,
  profile: { writingSample: '' } as UserProfile, lang: 'fr' as const, note: '', hint: '', stretch: [],
};

describe('polishLetter', () => {
  const judge = vi.mocked(callLLMJSON);
  const write = vi.mocked(writeCheckedLetter);
  const facts = vi.mocked(factChecks);
  beforeEach(() => { judge.mockReset(); write.mockReset(); facts.mockReset().mockReturnValue([]); });

  it("s'arrête dès que le juge l'enverrait, sans réécrire", async () => {
    judge.mockResolvedValueOnce(judged('send', []));
    const r = await polishLetter(input);
    expect(write).not.toHaveBeenCalled();
    expect(r).toMatchObject({ letter: v(0), rounds: 0, interrupted: '' });
  });

  it('corrige au plus deux fois, avec la version actuelle, les consignes du juge et celle de l\'utilisateur', async () => {
    judge
      .mockResolvedValueOnce(judged('rework', [quote(0), quote(0), quote(0)]))
      .mockResolvedValueOnce(judged('rework', [quote(1), quote(1)]))
      .mockResolvedValueOnce(judged('rework', [quote(2)]));
    write
      .mockResolvedValueOnce({ letter: v(1), issues: [] })
      .mockResolvedValueOnce({ letter: v(2), issues: [] });
    const r = await polishLetter({ ...input, hint: 'Plus court.' });
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[0][4]).toContain('Réécris-la.');
    expect(write.mock.calls[0][4]).toContain('Plus court.');
    expect(write.mock.calls[0][7]).toMatchObject({ previous: v(0), priorities: input.analysis.requirements });
    expect(r).toMatchObject({ letter: v(2), rounds: 2 });
  });

  it("s'arrête quand un tour n'améliore rien et rend la meilleure version vue", async () => {
    judge
      .mockResolvedValueOnce(judged('rework', [quote(0)]))
      .mockResolvedValueOnce(judged('rework', [quote(1), quote(1), quote(1)]));
    write.mockResolvedValueOnce({ letter: v(1), issues: [] });
    const r = await polishLetter(input);
    expect(write).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ letter: v(0), rounds: 1 });
  });

  it("un fait faux l'emporte sur le verdict du juge", async () => {
    judge
      .mockResolvedValueOnce(judged('rework', [quote(0)]))
      .mockResolvedValueOnce(judged('send', []));
    write.mockResolvedValueOnce({ letter: v(1), issues: [invented] });
    facts.mockImplementation(t => (t === v(1) ? [invented] : []));
    const r = await polishLetter(input);
    expect(r).toMatchObject({ letter: v(0), rounds: 1 });
  });

  it("corrige un fait faux même si le juge l'enverrait, et le marque comme consigne du juge", async () => {
    judge
      .mockResolvedValueOnce(judged('send', []))
      .mockResolvedValueOnce(judged('send', []));
    facts.mockImplementation(t => (t === v(0) ? [invented] : []));
    write.mockResolvedValueOnce({ letter: v(1), issues: [] });
    const r = await polishLetter(input);
    expect(write.mock.calls[0][4]).toContain(`${JUDGE_MARK}${invented}`);
    expect(r).toMatchObject({ letter: v(1), rounds: 1 });
  });

  it('une erreur en route rend la meilleure version déjà obtenue', async () => {
    judge
      .mockResolvedValueOnce(judged('rework', [quote(0), quote(0)]))
      .mockResolvedValueOnce(judged('rework', [quote(1)]));
    write
      .mockResolvedValueOnce({ letter: v(1), issues: [] })
      .mockRejectedValueOnce(new Error('Réseau'));
    const r = await polishLetter(input);
    expect(r).toMatchObject({ letter: v(1), rounds: 2, interrupted: 'Réseau' });
  });
});
