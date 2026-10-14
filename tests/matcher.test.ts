import { describe, expect, it } from 'vitest';
import { matchOffer } from '../extension/lib/matcher';
import { NOW, base, offer, req, settings } from './fixtures';

const run = (o: ReturnType<typeof offer>, checked?: string[], s = settings) => matchOffer(o, base, s, [], NOW, checked);

describe('score et verdict', () => {
  it('outils nommés couverts : apply', () => {
    const m = run(offer([req('React', 'tech', true), req('TypeScript', 'tech', true), req('Node.js', 'tech', true)]));
    expect(m.verdict).toBe('apply');
    expect(m.score).toBe(100);
    expect(m.reason).toMatch(/^3 compétences sur 3/);
  });

  it('les savoir-faire pèsent d\'autant moins que l\'offre nomme d\'outils', () => {
    const tools = [req('React', 'tech', true), req('TypeScript', 'tech', true), req('Node.js', 'tech', true)];
    const fuzzy = [req('Workflows', 'domain', true), req('Veille technologique', 'domain', false)];
    const few = run(offer([tools[0], ...fuzzy]));
    const many = run(offer([...tools, ...fuzzy]));
    expect(run(offer(tools)).score - many.score).toBeLessThan(100 - few.score);
    expect(many.softGaps).toContain('Workflows');
  });

  it('métier sans outils : les savoir-faire comptent, le diplôme ne remplace pas le score', () => {
    const m = run(offer([
      req('Soins infirmiers', 'domain', true),
      req('Gestion de la douleur', 'domain', true),
      req('Éducation thérapeutique', 'domain', false),
      req('Diplôme d\'État infirmier', 'diploma', true, { met: true }),
    ]));
    expect(m.score).toBe(0);
    expect(m.verdict).toBe('skip');
  });

  it('diplôme obligatoire manquant : bloquant', () => {
    const m = run(offer([req('React', 'tech', true), req('Doctorat', 'diploma', true, { met: false })]));
    expect(m.verdict).toBe('skip');
    expect(m.hardGaps).toContain('Doctorat');
  });

  it('années insuffisantes bloquent même sans compétence scorée', () => {
    const m = run(offer([req('Relation client', 'soft', true)], { minYears: 10 }));
    expect(m.verdict).toBe('skip');
    expect(m.hardGaps[0]).toMatch(/10 ans demandés/);
  });

  it("années du poste recopiées sur une catégorie : jugées une seule fois, sur l'expérience totale", () => {
    // « Développement logiciel » couvert par React (faits d'une seule expérience,
    // ~2 ans) : l'offre demande 4 ans de métier, le parcours en a plus de 4.
    const m = run(offer([req('Développement logiciel', 'domain', true, { named: false, minYears: 4, matches: ['React'] })], { minYears: 4 }));
    expect(m.hardGaps).toEqual([]);
    expect(m.softGaps.join(' ')).not.toMatch(/Développement logiciel/);
  });

  it('années propres à une catégorie : écart signalé à vérifier, jamais bloquant', () => {
    const m = run(offer([req('Développement web', 'domain', true, { named: false, minYears: 5, matches: ['React'] })]));
    expect(m.hardGaps).toEqual([]);
    expect(m.softGaps.join(' ')).toMatch(/Développement web : 5 ans demandés, [\d,]+ au compteur d'après tes faits \(à vérifier\)/);
  });

  it('années sur un outil nommé : toujours comparées aux expériences qui le prouvent', () => {
    const m = run(offer([req('React', 'tech', true, { minYears: 4, matches: ['React'] })]));
    expect(m.hardGaps.join(' ')).toMatch(/React : 4 ans demandés/);
  });

  it('alternance comptée dans les années', () => {
    const m = run(offer([req('React', 'tech', true)], { minYears: 4 }));
    expect(m.yearsHave).toBeGreaterThanOrEqual(4);
  });

  it('outil obligatoire manquant : case proposée, bloquant tant que non coché', () => {
    const o = offer([req('React', 'tech', true), req('TypeScript', 'tech', true), req('Kafka', 'tech', true)]);
    const off = run(o);
    expect(off.stretch.map(s => s.label)).toContain('Kafka');
    expect(off.verdict).toBe('skip');
    const on = run(o, ['Kafka']);
    expect(on.verdict).toBe('apply');
    expect(on.score).toBeGreaterThan(off.score);
  });

  it('catégorie floue manquante : jamais une case', () => {
    const m = run(offer([req('React', 'tech', true), req('Interfaces web', 'tech', true, { named: false })]));
    expect(m.stretch).toHaveLength(0);
    expect(m.hardGaps).not.toContain('Interfaces web');
  });

  it('version ignorée : "Node.js 20" est couvert par Node.js', () => {
    const m = run(offer([req('Node.js 20', 'tech', true), req('React', 'tech', true), req('TypeScript', 'tech', true)]));
    expect(m.verdict).toBe('apply');
    expect(m.stretch).toHaveLength(0);
  });

  it('Angular ne couvre pas React', () => {
    const m = run(offer([req('Angular', 'tech', true, { matches: [] })]));
    expect(m.covered).toHaveLength(0);
  });
});

describe('diplôme', () => {
  it('« ou équivalent » : un risque signalé, pas un écart bloquant', () => {
    const m = run(offer([req('Bac+5', 'diploma', true, { met: false, equivalent: true })]));
    expect(m.hardGaps).toEqual([]);
    expect(m.softGaps.join(' ')).toMatch(/Bac\+5.*ou équivalent/);
  });
  it('exigé sans équivalence : toujours bloquant', () => {
    const m = run(offer([req('Bac+5', 'diploma', true, { met: false })]));
    expect(m.hardGaps).toContain('Bac+5');
  });
});
