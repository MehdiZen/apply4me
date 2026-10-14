import { describe, expect, it } from 'vitest';
import { matchOffer } from '../extension/lib/matcher';
import { checkFact, skillLines } from '../extension/lib/tailor';
import { claimsProduction, repeatedWords } from '../extension/lib/validate';
import { NOW, nurse, offer, req, settings } from './fixtures';

// Les mêmes règles sur un métier sans "stack" : rien ne doit supposer un dev.
const run = (o: ReturnType<typeof offer>) => matchOffer(o, nurse, settings, [], NOW);

describe('profil infirmière', () => {
  it('savoir-faire couverts : apply, sans aucun outil nommé', () => {
    const m = run(offer([
      req('Soins post-opératoires', 'domain', true, { matches: ['Soins post-opératoires'] }),
      req('Gestion de la douleur', 'domain', true, { matches: ['Gestion de la douleur'] }),
      req('Diplôme d\'État infirmier', 'diploma', true, { met: true }),
    ]));
    expect(m.verdict).toBe('apply');
    expect(m.score).toBe(100);
  });

  it('logiciel métier manquant : case à cocher, comme un outil dev', () => {
    const m = run(offer([req('Soins post-opératoires', 'domain', true, { matches: ['Soins post-opératoires'] }), req('Orbis', 'tech', true)]));
    expect(m.stretch.map(s => s.label)).toEqual(['Orbis']);
  });

  it('langue parlée jamais en case', () => {
    const m = run(offer([req('Anglais courant', 'language', true, { met: false })]));
    expect(m.stretch).toHaveLength(0);
    expect(m.hardGaps).toContain('Anglais courant');
  });

  it('rubriques libres : chaque compétence dans sa rubrique, sans doublon ni perte', () => {
    const lines = skillLines(nurse, offer([]), 'fr', ['Orbis']);
    expect(lines.map(l => l.label)).toEqual(['Soins', 'Logiciels', 'Qualités']);
    const names = lines.flatMap(l => l.items.map(i => i.name));
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(expect.arrayContaining(['Soins post-opératoires', 'DxCare', 'Écoute', 'Hypnose', 'Orbis']));
  });

  it('compétence hors cadre pro non épinglée : pas gardée de force', () => {
    const item = skillLines(nurse, offer([]), 'fr', []).flatMap(l => l.items).find(i => i.name === 'Hypnose');
    expect(item?.keep).toBe(false);
  });

  it('reformulation fidèle acceptée, chiffre ajouté refusé', () => {
    const f = nurse.experiences[0].groups[0].facts[0];
    expect(checkFact('Prise en charge post-opératoire de 12 patients à chaque poste', f, nurse, ['Excel'])).toBeNull();
    expect(checkFact('Prise en charge post-opératoire de 15 patients par poste', f, nurse, ['Excel'])).toMatch(/chiffre/);
  });

  it('« production » au sens industriel n\'est pas un faux positif hors employeur', () => {
    expect(claimsProduction('J\'ai découvert l\'hypnose en formation et j\'aimerais la pratiquer au travail.', ['Hypnose'])).toHaveLength(0);
    expect(claimsProduction('J\'utilise l\'hypnose au quotidien avec mes patients.', ['Hypnose'])).toHaveLength(1);
  });

  it('vocabulaire du métier répété : pas signalé', () => {
    const letter = 'Madame, Monsieur,\nMes patients comptent. Les patients opérés aussi.\nChaque patient a sa place.\nCordialement,';
    expect(repeatedWords(letter, 'service de chirurgie, patients')).toHaveLength(0);
  });
});
