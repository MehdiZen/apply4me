import { describe, expect, it, vi } from 'vitest';

vi.mock('../extension/lib/storage', () => ({ getApiConfig: vi.fn(), getSettings: vi.fn() }));

import { prioritiesBlock } from '../extension/lib/llm';
import { req } from './fixtures';

describe('prioritiesBlock', () => {
  const reqs = [
    { ...req('Soins post-opératoires', 'skill', true), matches: ['Soins post-opératoires'] },
    { ...req('Éducation thérapeutique', 'skill', false), matches: ['Éducation du patient'] },
    { ...req('Excel', 'tech', false), matches: ['Excel'] },
    req('Dialyse', 'skill', true),
    req('Hypnose', 'skill', false),
    req('5 ans', 'years', true),
    req('DE infirmier', 'diploma', true),
    req('Anglais', 'language', false),
  ];
  const block = prioritiesBlock(reqs, ['Excel'], ['Hypnose']);

  it('donne au rédacteur ce qui est couvert et par quoi', () => {
    expect(block).toContain('- Soins post-opératoires ← Soins post-opératoires');
    expect(block).toContain('- Éducation thérapeutique (souhaité) ← Éducation du patient');
  });

  it('marque une compétence hors cadre pro, sépare les ajouts cochés de ce qui n\'est pas couvert', () => {
    expect(block).toContain('- Excel (souhaité) ← Excel (hors cadre pro seulement)');
    expect(block).toContain('Ajouté au CV pour cette offre (des bases, voir plus haut) : Hypnose');
    expect(block).toContain('Non couvert par le parcours (ne pas prétendre l\'avoir) : Dialyse');
    expect(block).not.toMatch(/Non couvert[^\n]*Hypnose/);
  });

  it('laisse de côté années, diplôme et langue', () => {
    expect(block).not.toMatch(/5 ans|DE infirmier|Anglais/);
  });

  it('rien sans exigences', () => {
    expect(prioritiesBlock([])).toBe('');
    expect(prioritiesBlock(undefined)).toBe('');
  });
});
