import { describe, expect, it } from 'vitest';
import { combineVerdict, evaluateDesirability } from '../extension/lib/desirability';
import { EMPTY_PREFERENCES } from '../extension/lib/preferences';
import type { MatchResult, OfferAnalysis, OfferBrief, SearchPreferences } from '../extension/types';
import { offer } from './fixtures';

const brief = (b: Partial<OfferBrief>): OfferBrief => ({
  sector: '', location: '', contract: '', workMode: '', mission: '', companyFacts: [], teamContext: '',
  employerType: '', salary: { min: null, max: null }, remoteDays: null, contractType: '', conditions: [], ...b,
});
const analysis = (b: Partial<OfferBrief>, signals?: OfferAnalysis['signals']): OfferAnalysis => ({ ...offer([]), brief: brief(b), signals });
const match = (verdict: 'apply' | 'skip', reason = 'Couverture correcte'): MatchResult => ({
  verdict, reason, score: 70, yearsHave: 2, yearsNeed: null, covered: [], hardGaps: verdict === 'skip' ? ['Kafka'] : [], softGaps: [], stretch: [],
});
const prefs = (p: Partial<SearchPreferences>): SearchPreferences => ({ ...EMPTY_PREFERENCES, ...p });

describe('désirabilité', () => {
  it('sans préférences : aucun signal, le verdict de faisabilité reste', () => {
    const d = evaluateDesirability(analysis({ employerType: 'consulting', remoteDays: 0 }), undefined);
    expect([...d.positives, ...d.negatives, ...d.dealbreakers]).toEqual([]);
    expect(combineVerdict(match('apply'), d).verdict).toBe('apply');
  });

  it('type d\'employeur rédhibitoire → skip, raison nommée', () => {
    const d = evaluateDesirability(analysis({ employerType: 'consulting' }), prefs({ employers: { consulting: 'dealbreaker' } }));
    const v = combineVerdict(match('apply'), d);
    expect(v.verdict).toBe('skip');
    expect(v.reason).toMatch(/ESN \/ conseil \/ régie/);
  });

  it('employeur voulu → pourquoi oui', () => {
    const d = evaluateDesirability(analysis({ employerType: 'product' }), prefs({ employers: { product: 'wanted' } }));
    expect(d.positives.map(s => s.label)).toContain('Éditeur / produit');
  });

  it('full présentiel : négatif si télétravail souhaité, rédhibitoire s\'il est indispensable', () => {
    expect(combineVerdict(match('apply'), evaluateDesirability(analysis({ remoteDays: 0 }), prefs({ remote: 'preferred' }))).verdict).toBe('maybe');
    expect(combineVerdict(match('apply'), evaluateDesirability(analysis({ remoteDays: 0 }), prefs({ remote: 'required' }))).verdict).toBe('skip');
    expect(evaluateDesirability(analysis({ remoteDays: 2 }), prefs({ remote: 'preferred' })).positives).toHaveLength(1);
  });

  it('salaire : sous le plancher → below et maybe ; inconnu → unknown, sans pénalité', () => {
    const below = evaluateDesirability(analysis({ salary: { min: 42, max: 48 } }), prefs({ salaryFloor: 50 }));
    expect(below.salary).toBe('below');
    expect(combineVerdict(match('apply'), below).verdict).toBe('maybe');
    const unknown = evaluateDesirability(analysis({}), prefs({ salaryFloor: 50, salaryTarget: [53, 56] }));
    expect(unknown.salary).toBe('unknown');
    const v = combineVerdict(match('apply'), unknown);
    expect(v.verdict).toBe('apply');
    expect(v.nextStep).toMatch(/fourchette/);
    expect(evaluateDesirability(analysis({ salary: { min: 58, max: 62 } }), prefs({ salaryFloor: 50, salaryTarget: [53, 56] })).salary).toBe('above');
    expect(evaluateDesirability(analysis({ salary: { min: 50, max: 55 } }), prefs({ salaryFloor: 50, salaryTarget: [53, 56] })).salary).toBe('in-range');
  });

  it('contrat hors de ceux acceptés → négatif', () => {
    const d = evaluateDesirability(analysis({ contractType: 'CDD' }), prefs({ contracts: ['CDI'] }));
    expect(d.negatives.map(s => s.label).join(' ')).toMatch(/CDD/);
    expect(evaluateDesirability(analysis({ contractType: 'cdi' }), prefs({ contracts: ['CDI'] })).negatives).toEqual([]);
  });

  it('faisabilité bloquante l\'emporte, avec sa raison, même si tout plaît', () => {
    const d = evaluateDesirability(analysis({ employerType: 'product' }), prefs({ employers: { product: 'wanted' } }));
    const v = combineVerdict(match('skip', 'Kafka exigé et absent'), d);
    expect(v.verdict).toBe('skip');
    expect(v.reason).toBe('Kafka exigé et absent');
  });

  it('autre métier : hôpital voulu, nuits fixes rédhibitoires', () => {
    const a = analysis({ employerType: 'public' }, {
      positives: [],
      negatives: [{ label: 'Nuits fixes', quote: 'poste de nuit fixe', dealbreaker: true }, { label: 'Week-ends', quote: 'un week-end sur deux', dealbreaker: false }],
    });
    const d = evaluateDesirability(a, prefs({ employers: { public: 'wanted' }, dealbreakers: 'Nuits fixes' }));
    expect(d.positives.map(s => s.label)).toEqual(['Public']);
    expect(d.dealbreakers.map(s => s.label)).toEqual(['Nuits fixes']);
    expect(d.negatives.map(s => s.label)).toEqual(['Week-ends']);
    expect(combineVerdict(match('apply'), d).verdict).toBe('skip');
  });

  it('analyse en cache d\'avant la feature (ni signaux ni nouveaux champs) : pas d\'exception', () => {
    const old = { ...offer([]), brief: { sector: 'x', location: '', contract: '', workMode: '', mission: '', companyFacts: [], teamContext: '' } } as unknown as OfferAnalysis;
    const d = evaluateDesirability(old, prefs({ salaryFloor: 50, remote: 'preferred', employers: { consulting: 'dealbreaker' } }));
    expect(d.salary).toBe('unknown');
    expect(combineVerdict(match('apply'), d).verdict).toBe('apply');
  });
});

describe('revue finale', () => {
  it('un « rédhibitoire » du modèle sans rédhibitoire ni condition déclarés reste un simple négatif', () => {
    const a = analysis({}, { positives: [], negatives: [{ label: 'Déplacements', quote: 'déplacements fréquents', dealbreaker: true }] });
    const d = evaluateDesirability(a, prefs({ remote: 'preferred' }));
    expect(d.dealbreakers).toEqual([]);
    expect(d.negatives.map(s => s.label)).toEqual(['Déplacements']);
    expect(combineVerdict(match('apply'), d).verdict).toBe('maybe');
  });

  it('les points calculés par le code ne s\'affichent pas comme des citations de l\'annonce', () => {
    const a = analysis({ employerType: 'consulting', companyFacts: ['Créée en 2010'], salary: { min: 42, max: 48 } });
    const d = evaluateDesirability(a, prefs({ employers: { consulting: 'negative' }, salaryFloor: 50 }));
    for (const s of d.negatives) expect(s.quote).not.toMatch(/Créée en 2010|k€/);
    expect(d.negatives.map(s => s.label)).toContain('Salaire sous ton plancher (42 à 48 k€)');
  });
});
