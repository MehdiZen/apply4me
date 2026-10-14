import { beforeEach, describe, expect, it, vi } from 'vitest';
import { base } from './fixtures';

// Les appels au modèle sont simulés : on teste ce que le code fait des réponses.
const responses: unknown[] = [];
vi.mock('../extension/lib/llm', () => ({
  callLLMJSON: vi.fn(async () => responses.shift()),
}));

const { analyzeOffer, cleanTitle, isSkillLabel, resolveMatches } = await import('../extension/lib/requirements');

beforeEach(() => { responses.length = 0; });

describe('cleanTitle', () => {
  it.each([
    ['Web Tools Programmer - H/F/NB', 'Web Tools Programmer'],
    ['Développeur Full Stack (H/F)', 'Développeur Full Stack'],
    ['Chef de projet F/H', 'Chef de projet'],
    ['Engineer (m/w/d)', 'Engineer'],
    ['Infirmier (F-H)', 'Infirmier'],
    ['Comptable (Homme/Femme)', 'Comptable'],
    ['Ingénieur DevOps F/H - CDI', 'Ingénieur DevOps - CDI'],
    ['CI/CD Engineer', 'CI/CD Engineer'],
    ['UX/UI Designer', 'UX/UI Designer'],
  ])('%s', (input, expected) => expect(cleanTitle(input)).toBe(expected));
});

describe('isSkillLabel', () => {
  it.each(['Soudure TIG', 'Architecture logicielle', 'Lecture de plans', 'After Effects', 'Premier Pro', 'Jupyter Notebook'])(
    'garde « %s »', l => expect(isSkillLabel(l)).toBe(true));
  it('rejette une phrase', () => expect(isSkillLabel('Concevoir des outils web, puis les maintenir pour les équipes')).toBe(false));
});

describe('resolveMatches', () => {
  it('version ignorée', () => {
    expect(resolveMatches(base, 'Node.js 20', [], true)).toEqual(['Node.js']);
    expect(resolveMatches(base, 'TypeScript 5', [], true)).toEqual(['TypeScript']);
  });
  it('produit voisin refusé', () => {
    expect(resolveMatches(base, 'React Native', ['React'], true)).toEqual([]);
  });
});

describe('analyzeOffer', () => {
  it('langues, missions, named par défaut, cabinet', async () => {
    responses.push(
      {
        title: 'AI Engineer (H/F)', company: '', recruiter: 'Beyond Talents', lang: 'fr', minYears: 5,
        requirements: [
          { label: 'TypeScript', kind: 'language', mandatory: true },
          { label: 'Roumain', kind: 'spoken', mandatory: false },
          { label: 'Anglais courant', kind: 'spoken', mandatory: true },
          { label: 'Kafka', kind: 'tech', mandatory: true },
          { label: 'Concevoir la plateforme', kind: 'domain', mission: true, mandatory: true },
        ],
      },
      { matches: { 0: ['TypeScript'] }, met: { 1: false, 2: true } },
    );
    const a = await analyzeOffer('offre', base);
    const by = (l: string) => a.requirements.find(r => r.label === l);
    expect(a.title).toBe('AI Engineer');
    expect(a.company).toBe('');
    expect(a.recruiter).toBe('Beyond Talents');
    expect(by('TypeScript')?.kind).toBe('tech');
    expect(by('Roumain')?.kind).toBe('language');
    expect(by('Anglais courant')?.kind).toBe('language');
    expect(by('Kafka')?.named).toBe(true);
    expect(by('Concevoir la plateforme')).toBeUndefined();
  });

  it('ancien employeur : nom vérifié contre la base, fiche lue', async () => {
    responses.push(
      { title: 'Dev', company: 'Acme Software Group', lang: 'fr', minYears: null, brief: { sector: 'Logiciel', companyFacts: ['120 personnes', 3] }, requirements: [{ label: 'React', kind: 'tech', mandatory: true }] },
      { matches: { 0: ['React'] }, formerEmployer: 'Acme Software' },
    );
    const a = await analyzeOffer('offre', base);
    expect(a.formerEmployer).toBe('Acme Software');
    expect(a.brief?.companyFacts).toEqual(['120 personnes']);

    responses.push(
      { title: 'Dev', company: 'Air Liquide', lang: 'fr', minYears: null, requirements: [{ label: 'React', kind: 'tech', mandatory: true }] },
      { matches: { 0: ['React'] }, formerEmployer: 'Air France' },
    );
    expect((await analyzeOffer('offre', base)).formerEmployer).toBeUndefined();
  });
});

const { annualSalary, readSignals } = await import('../extension/lib/requirements');
const { callLLMJSON } = await import('../extension/lib/llm');
const { EMPTY_PREFERENCES } = await import('../extension/lib/preferences');

describe('préférences dans la lecture de l\'offre', () => {
  const offerText = "Éditeur SaaS, 40 personnes. Poste en CDI, sur site à Lyon. Nationalité française exigée. L'équipe travaille en TypeScript.";

  it('fiche : faits mesurables relus, valeurs invalides écartées', async () => {
    responses.push({
      title: 'Dev', company: '', lang: 'fr', requirements: [],
      brief: { sector: 'SaaS', employerType: 'consulting', salary: { min: 45, max: 50 }, remoteDays: 0, contractType: 'CDI', conditions: ['Nationalité française exigée'] },
    });
    const a = await analyzeOffer(offerText, base);
    expect(a.brief).toMatchObject({ employerType: 'consulting', salary: { min: 45, max: 50 }, remoteDays: 0, contractType: 'CDI', conditions: ['Nationalité française exigée'] });
    responses.push({ title: 'Dev', company: '', lang: 'fr', requirements: [], brief: { sector: 'SaaS', employerType: 'banane', remoteDays: -2 } });
    const b = await analyzeOffer(offerText, base);
    expect(b.brief?.employerType).toBe('');
    expect(b.brief?.remoteDays).toBeNull();
  });

  it('salaire ramené en k€ brut annuel, taux journalier ignoré', () => {
    expect(annualSalary({ min: 3500, max: 4000 })).toEqual({ min: 42, max: 48 });
    expect(annualSalary({ min: 55000, max: 60000 })).toEqual({ min: 55, max: 60 });
    expect(annualSalary({ min: 52, max: 58 })).toEqual({ min: 52, max: 58 });
    expect(annualSalary({ min: 450, max: null })).toEqual({ min: null, max: null });
    expect(annualSalary(undefined)).toEqual({ min: null, max: null });
    // Laissé tel quel par le modèle : un TJM de 250 ou 3,5 (k€/mois) ne passe pas pour un annuel.
    expect(annualSalary({ min: 250, max: 300 })).toEqual({ min: null, max: null });
    expect(annualSalary({ min: 3.5, max: 4 })).toEqual({ min: null, max: null });
  });

  it('signaux : citation tolérée aux apostrophes et espaces, inventée ou trop courte écartée', () => {
    const s = readSignals({
      positives: [{ label: 'TypeScript', quote: 'L’équipe  travaille en TypeScript' }, { label: 'Remote', quote: 'Full remote possible' }],
      negatives: [{ label: 'Nationalité', quote: 'Nationalité française exigée', dealbreaker: true }, { label: 'Sur site', quote: 'CDI', dealbreaker: false }],
    }, offerText);
    expect(s.positives.map(x => x.label)).toEqual(['TypeScript']);
    expect(s.negatives).toEqual([{ label: 'Nationalité', quote: 'Nationalité française exigée', dealbreaker: true }]);
  });

  it('sans préférences : rien sur la personne dans le prompt, pas de signaux', async () => {
    vi.mocked(callLLMJSON).mockClear();
    responses.push({ title: 'Dev', company: '', lang: 'fr', requirements: [], signals: { positives: [{ label: 'TS', quote: "L'équipe travaille en TypeScript" }] } });
    const a = await analyzeOffer(offerText, base);
    expect(String(vi.mocked(callLLMJSON).mock.calls[0][0])).not.toContain('CE QUE LA PERSONNE CHERCHE');
    expect(a.signals).toBeUndefined();
  });

  it('avec préférences : demandées dans le même appel et relues', async () => {
    vi.mocked(callLLMJSON).mockClear();
    responses.push({ title: 'Dev', company: '', lang: 'fr', requirements: [], signals: { positives: [{ label: 'TS', quote: "L'équipe travaille en TypeScript" }], negatives: [] } });
    const a = await analyzeOffer(offerText, base, { ...EMPTY_PREFERENCES, dealbreakers: 'Nuits fixes' });
    expect(vi.mocked(callLLMJSON)).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(callLLMJSON).mock.calls[0][0])).toContain('Nuits fixes');
    expect(a.signals?.positives).toHaveLength(1);
  });

  it('diplôme « ou équivalent » repéré', async () => {
    responses.push(
      { title: 'Dev', company: 'X', lang: 'fr', requirements: [{ label: 'Bac+5', kind: 'diploma', mandatory: true, equivalent: true }] },
      { matches: {}, met: { 0: false } },
    );
    const a = await analyzeOffer(offerText, base);
    expect(a.requirements[0]).toMatchObject({ kind: 'diploma', equivalent: true, met: false });
  });
});
