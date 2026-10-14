import { describe, expect, it } from 'vitest';
import { styleSignals } from '../extension/lib/validate';

// Lettre "machine" : phrases calibrées, paragraphes de même taille, attaques
// répétées, énumérations par trois, noms abstraits.
const machine = `Madame, Monsieur,
Je souhaite rejoindre votre équipe pour contribuer à la transformation de vos opérations. Je dispose d'une expérience solide dans l'optimisation et la structuration des processus. Je mets en œuvre une approche rigoureuse, collaborative et orientée résultats.
Mon expérience actuelle me permet de développer une vision globale de la coordination des projets. Elle renforce ma capacité d'adaptation, d'organisation et de communication avec les équipes. Elle constitue une base pertinente pour accompagner votre développement.
Votre entreprise représente une opportunité de valorisation de mes compétences professionnelles. Votre positionnement favorise l'innovation et l'amélioration continue des performances. Je serais heureux d'échanger avec vous sur cette collaboration.
Cordialement,`;

// Lettre "humaine" : un détail vécu, rythme irrégulier, verbes concrets.
const human = `Madame, Monsieur,
L'été dernier, l'équipe de nuit a perdu deux infirmières en un mois. J'ai repris leurs patients, revu les transmissions avec le cadre et, au bout de trois semaines, plus personne ne finissait son poste en retard.
C'est ce genre de service que vous décrivez.
Votre annonce parle d'un service de chirurgie ambulatoire qui ouvre cet automne. Je n'ai jamais travaillé en ambulatoire, mais je connais la pression des sorties du jour : chez nous, les patients opérés le matin repartent souvent le soir, et c'est moi qui fais l'éducation avant le départ.
Je peux passer quand vous voulez.
Cordialement,`;

describe('styleSignals', () => {
  it('repère une lettre au rythme machine', () => {
    const s = styleSignals(machine);
    expect(s.length).toBeGreaterThanOrEqual(3);
    expect(s.join(' ')).toMatch(/même longueur|courte|même taille|Trois phrases|abstraits|trois/);
  });
  it('ne pousse jamais à hacher le texte', () => {
    expect(styleSignals(machine).join(' ')).not.toMatch(/très courte|Aucune phrase courte|raccourcis\b/);
  });
  it('laisse passer une lettre au rythme humain', () => {
    expect(styleSignals(human)).toEqual([]);
  });
  it('repère le texte haché et la mise en scène « … : voilà »', () => {
    const choppy = `Madame, Monsieur,
Cette offre arrive à un bon moment pour la plateforme. Elle a trouvé ses clients. Ses fondations doivent tenir. Il faut maintenant passer à l'échelle sans casser ce qui marche déjà chez les clients actuels.
Aller du besoin au déploiement, puis voir l'outil tenir dans le quotidien des équipes : voilà le travail que je cherche depuis plusieurs années maintenant.
J'ai ensuite formé cinq personnes. Elles gèrent l'outil sans nous. Je vous propose un échange sur ces fondations et sur la manière dont je pourrais y contribuer concrètement.
Cordialement,`;
    const s = styleSignals(choppy).join(' ');
    expect(s).toMatch(/haché/);
    expect(s).toMatch(/voilà/);
  });

  it('compare à la voix de l\'utilisateur', () => {
    const sample = 'Je fais court. Toujours. Ça marche bien comme ça. On avance.';
    expect(styleSignals(machine, sample).join(' ')).toMatch(/plus longues que ta façon d'écrire/);
  });
});
