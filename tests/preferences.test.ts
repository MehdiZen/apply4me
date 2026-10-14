import { describe, expect, it } from 'vitest';
import { EMPTY_PREFERENCES, hasPreferences, readPreferences } from '../extension/lib/preferences';
import { analysisFingerprint } from '../extension/lib/storage';
import { base } from './fixtures';

describe('préférences de recherche', () => {
  it('lecture tolérante : valeurs invalides ramenées au défaut', () => {
    const p = readPreferences({ remote: 'x', salaryFloor: '50', employers: { consulting: 'dealbreaker', foo: 'wanted', startup: 'bof' } });
    expect(p.remote).toBe('indifferent');
    expect(p.salaryFloor).toBeNull();
    expect(p.employers).toEqual({ consulting: 'dealbreaker' });
  });

  it('cible salariale : deux nombres ordonnés, sinon rien', () => {
    expect(readPreferences({ salaryTarget: [56, 53] }).salaryTarget).toEqual([53, 56]);
    expect(readPreferences({ salaryTarget: [53] }).salaryTarget).toBeNull();
  });

  it('vide par défaut, rempli dès qu\'un champ l\'est', () => {
    expect(readPreferences(undefined)).toEqual(EMPTY_PREFERENCES);
    expect(hasPreferences(EMPTY_PREFERENCES)).toBe(false);
    expect(hasPreferences(undefined)).toBe(false);
    expect(hasPreferences({ ...EMPTY_PREFERENCES, salaryFloor: 50 })).toBe(true);
    expect(hasPreferences({ ...EMPTY_PREFERENCES, employers: { public: 'wanted' } })).toBe(true);
  });

  it('changer les préférences invalide le cache d\'analyse', async () => {
    const a = await analysisFingerprint('Offre', base);
    const b = await analysisFingerprint('Offre', base, { ...EMPTY_PREFERENCES, dealbreakers: 'ESN' });
    expect(a).not.toBe(b);
    expect(await analysisFingerprint('Offre', base, EMPTY_PREFERENCES)).toBe(a);
  });
});
