import { describe, expect, it } from 'vitest';
import { estimateCost, fastModel, lowerModel, modelFor } from '../extension/lib/models';

describe('rang des modèles', () => {
  it('n-1 : le modèle juste en dessous chez le même fournisseur', () => {
    expect(lowerModel('openai', 'gpt-6.1-sol')).toBe('gpt-6-luna');
    expect(lowerModel('openai', 'gpt-6-astra')).toBe('gpt-6.1-sol');
    expect(lowerModel('anthropic', 'claude-opus-5-5')).toBe('claude-sonnet-5-5');
    expect(lowerModel('anthropic', 'claude-sonnet-5-5')).toBe('claude-haiku-5-5');
  });

  it('le plus petit et un modèle inconnu restent eux-mêmes', () => {
    expect(lowerModel('openai', 'gpt-6-luna')).toBe('gpt-6-luna');
    expect(lowerModel('anthropic', 'claude-ancien')).toBe('claude-ancien');
  });

  it('économie coupée : tout reste sur le modèle choisi, sauf le rapide', () => {
    expect(modelFor('openai', 'gpt-6.1-sol', 'lower', false)).toBe('gpt-6.1-sol');
    expect(modelFor('openai', 'gpt-6.1-sol', 'lower', true)).toBe('gpt-6-luna');
    expect(modelFor('openai', 'gpt-6.1-sol', 'main', true)).toBe('gpt-6.1-sol');
    expect(modelFor('anthropic', 'claude-opus-5-5', 'fast', false)).toBe(fastModel('anthropic'));
  });

  it('coût estimé : l\'économie fait baisser, et plus le modèle est gros plus c\'est cher', () => {
    const sol = estimateCost('openai', 'gpt-6.1-sol', false);
    expect(estimateCost('openai', 'gpt-6.1-sol', true)).toBeLessThan(sol);
    expect(estimateCost('openai', 'gpt-6-luna', true)).toBeLessThan(estimateCost('openai', 'gpt-6.1-sol', true));
    expect(estimateCost('openai', 'gpt-6-astra', true)).toBeGreaterThan(sol);
    // Ordre de grandeur annoncé : ~0,25 $ la candidature complète avec Sol.
    expect(sol).toBeGreaterThan(0.15);
    expect(sol).toBeLessThan(0.35);
  });
});
