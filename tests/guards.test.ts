import { describe, expect, it } from 'vitest';
import { companyCore, extractNumbers, sameCompany } from '../extension/lib/factbase';
import { checkFact, skillLines } from '../extension/lib/tailor';
import {
  claimsProduction, cleanDashes, copiedNote, currentJobMissing, frenchSpacing, inventedNumbers, letterTics,
  overclaims, repeatedWords, stripAddedLabel, weakSkillAtEmployer,
} from '../extension/lib/validate';
import { jobTitle } from '../extension/workspace/documents';
import { toCSV } from '../extension/lib/log';
import { base, offer } from './fixtures';

// Ids recalculés par normalizeFactBase : faits pris dans l'ordre (f1 = premier).
const fact = (id: string) => base.experiences.flatMap(e => e.groups.flatMap(g => g.facts))[Number(id.slice(1)) - 1];
const watched = base.skills.flatMap(s => [s.name, ...s.aliases]).concat(['Kafka']);

describe('chiffres', () => {
  it('milliers : quantité, pas une année', () => {
    expect(extractNumbers('pour 2 000 utilisateurs')).toEqual(['2000']);
    expect(extractNumbers('depuis 2022')).toEqual([]);
    expect(extractNumbers('1 200 utilisateurs et 5 devs')).toEqual(['1200', '5']);
  });
  it('nombres en lettres contrôlés', () => {
    expect(inventedNumbers('J\'ai encadré douze personnes pendant trois ans.', new Set(['5']))).toEqual(['douze', 'trois']);
    expect(inventedNumbers('J\'ai formé cinq développeurs.', new Set(['5']))).toEqual([]);
  });
});

describe('CV : checkFact', () => {
  it('reformulation fidèle acceptée', () => {
    expect(checkFact('Conception de bout en bout d\'une application React et Node.js utilisée par 1 200 personnes', fact('f1'), base, watched)).toBeNull();
  });
  it('chiffre ou année ajoutés refusés', () => {
    expect(checkFact('Formation de 5 développeurs internes pour 2 000 utilisateurs', fact('f3'), base, watched)).toMatch(/chiffre/);
    expect(checkFact('Formation de 5 développeurs internes en 2023', fact('f3'), base, watched)).toMatch(/année/);
  });
  it('techno ajoutée refusée', () => {
    expect(checkFact('Mise en place de la CI/CD, de Kafka et des tests automatisés', fact('f2'), base, watched)).toMatch(/Kafka/);
  });
  it('fait sans rapport refusé', () => {
    expect(checkFact('Animation d\'ateliers commerciaux pour les équipes de vente régionales', fact('f2'), base, watched)).toMatch(/sans rapport|gonflée/);
  });
  it('responsabilité gonflée ou minorée refusée', () => {
    expect(checkFact('Supervision du développement d\'outils internes en TypeScript', fact('f4'), base, watched)).toMatch(/gonflée/);
    expect(checkFact('Participation à une application React et Node.js pour 1 200 utilisateurs', fact('f1'), base, watched)).toMatch(/minorée/);
  });
  it('première personne refusée', () => {
    expect(checkFact('J\'ai mis en place la CI/CD et les tests automatisés', fact('f2'), base, watched)).toMatch(/première personne/);
  });
});

describe('CV : intitulés et compétences', () => {
  it('intitulé ajouté retiré si sûr', () => {
    expect(stripAddedLabel('CI/CD : mise en place de la CI/CD et des tests automatisés', 'x', 'Mise en place de la CI/CD et des tests automatisés'))
      .toBe('Mise en place de la CI/CD et des tests automatisés');
  });
  it('compétence épinglée hors rubrique : affichée et gardée, ajout coché à la fin', () => {
    const lines = skillLines(base, offer([]), 'fr', ['Kafka']);
    const items = lines.flatMap(l => l.items);
    expect(items.find(i => i.name === 'Python')?.keep).toBe(true);
    expect(items.at(-1)).toMatchObject({ name: 'Kafka', stretch: true });
  });
});

describe('entreprise', () => {
  it('nom sans bruit', () => {
    expect(companyCore('Blue Studio SAS, Paris')).toBe('Blue Studio');
    expect(sameCompany('Blue Studio SAS', 'blue studio')).toBe(true);
    expect(sameCompany('Air France', 'Air Liquide')).toBe(false);
    expect(companyCore('Air France')).toBe('Air France');
  });
  it('jobTitle ne retire pas un mot courant', () => {
    expect(jobTitle('Chef de groupe produit', 'Groupe Renault')).toBe('Chef de groupe produit');
    expect(jobTitle('Acme Web Tools Programmer', 'Acme')).toBe('Web Tools Programmer');
  });
});

describe('lettre', () => {
  it('projet perso présenté en production', () => {
    expect(claimsProduction('Mes scripts Python tournent en production.', ['Python'])).toHaveLength(1);
    expect(claimsProduction('J\'aimerais déployer mes outils Python dans un cadre pro.', ['Python'])).toHaveLength(0);
    expect(claimsProduction('Python, pratiqué en projets perso, pas encore en production.', ['Python'])).toHaveLength(0);
  });
  it('compétence faible attribuée à un employeur', () => {
    expect(weakSkillAtEmployer('J\'ai mis en place Kafka chez Acme Software.', ['Kafka'], ['Acme Software'])).toHaveLength(1);
    expect(weakSkillAtEmployer('Je découvre Kafka sur mes projets.', ['Kafka'], ['Acme Software'])).toHaveLength(0);
  });
  it('survente', () => {
    expect(overclaims('Je maîtrise Python.', ['Python'])).toHaveLength(1);
  });
  it('mot répété', () => {
    const l = 'Madame, Monsieur,\nJe souhaite construire. Je souhaite apprendre.\nJe souhaite échanger.\nCordialement,';
    expect(repeatedWords(l)[0]).toMatch(/souhaite/);
  });
  it('tics, note recopiée, poste actuel', () => {
    expect(letterTics('Pour moi, l\'important, c\'est la qualité.')).toHaveLength(1);
    expect(copiedNote('je joue à leurs jeux depuis que je suis petit', 'je joue à leurs jeux depuis que je suis petit')).toHaveLength(1);
    expect(currentJobMissing('Une lettre sans le poste.', base)).toHaveLength(1);
    expect(currentJobMissing('Chez Acme, je construis des applications.', base)).toHaveLength(0);
  });
  it('typographie', () => {
    expect(cleanDashes('Un projet — livré — en 2023–2024')).toBe('Un projet, livré, en 2023-2024');
    expect(frenchSpacing('Objet : test! https://x.fr 12:30')).toMatch(/^Objet\u00A0: test[\u00A0\u202F]! https:\/\/x\.fr 12:30$/);
  });
});

describe('export CSV', () => {
  it('formules neutralisées', () => {
    const csv = toCSV([{ id: '1', date: '2026-10-01', company: '=HYPERLINK("x")', title: 'Dev', score: 80, verdict: 'apply', forced: false, lang: 'fr', stretch: [], status: 'prepared', url: '' } as never]);
    expect(csv).toContain('"\'=HYPERLINK(""x"")"');
  });
});
