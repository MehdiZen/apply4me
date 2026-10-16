// Réponses simulées du modèle pour la démonstration. Aucune clé réelle, aucun appel réseau.
// Chaque réponse est choisie d'après un extrait du prompt que l'extension envoie.

const EXTRACTION = {
  title: 'Développeur full stack TypeScript',
  company: 'Lumen Atelier',
  recruiter: '',
  lang: 'fr',
  minYears: 2,
  brief: {
    sector: 'Logiciel de planification pour ateliers de réparation de vélos',
    location: 'Lyon',
    contract: 'CDI',
    workMode: 'Hybride',
    mission: "Faire évoluer l'application web de planification avec l'équipe produit",
    companyFacts: [
      'Équipe de 14 personnes à Lyon',
      "Clients artisans qui utilisent l'outil toute la journée",
      'Relecture de code pour chaque modification, déploiement plusieurs fois par semaine',
    ],
    teamContext: 'Équipe produit de 14 personnes',
    employerType: 'sme',
    salary: { min: 45, max: 52 },
    remoteDays: 2,
    contractType: 'CDI',
    conditions: [],
  },
  requirements: [
    { label: 'React', kind: 'tech', named: true, mission: false, mandatory: true, minYears: null, examples: [], group: 'dev', equivalent: false },
    { label: 'TypeScript', kind: 'tech', named: true, mission: false, mandatory: true, minYears: null, examples: [], group: 'dev', equivalent: false },
    { label: 'Node.js', kind: 'tech', named: true, mission: false, mandatory: true, minYears: null, examples: [], group: 'dev', equivalent: false },
    { label: 'CI/CD', kind: 'tech', named: true, mission: false, mandatory: true, minYears: null, examples: [], group: 'dev', equivalent: false },
    { label: 'PostgreSQL', kind: 'tech', named: true, mission: false, mandatory: false, minYears: null, examples: [], group: 'dev', equivalent: false },
    { label: 'Docker', kind: 'tech', named: true, mission: false, mandatory: false, minYears: null, examples: [], group: 'dev', equivalent: false },
    { label: 'Expérience en développement web', kind: 'years', named: false, mission: false, mandatory: true, minYears: 2, examples: [], group: '', equivalent: false },
  ],
};

const MAPPING = {
  matches: { 0: ['React'], 1: ['TypeScript'], 2: ['Node.js'], 3: ['CI/CD'], 4: [], 5: [] },
  met: {},
  formerEmployer: '',
};

const TAILORED = {
  headline: 'Développeur full stack',
  summary: 'Développeur full stack, applications web en production avec React, Node.js et TypeScript, CI/CD et tests automatisés.',
  experiences: [
    {
      id: 'acme',
      facts: [
        { id: 'acme-1', text: "Conception de bout en bout d'une application React et Node.js pour 1 200 utilisateurs", relevance: 5 },
        { id: 'acme-2', text: 'Mise en place de la CI/CD et des tests automatisés', relevance: 5 },
        { id: 'acme-3', text: 'Formation de 5 développeurs internes', relevance: 3 },
      ],
    },
    {
      id: 'blue-studio',
      facts: [{ id: 'blue-studio-1', text: "Participation au développement d'outils internes en TypeScript", relevance: 4 }],
    },
  ],
};

export const LETTER = `Madame, Monsieur,

Je suis développeur full stack chez Acme Software, à Lyon. Je vous écris pour le poste de développeur full stack TypeScript chez Lumen Atelier. C'est la pile que j'utilise tous les jours.

Chez Acme, j'ai conçu de bout en bout une application React et Node.js pour 1 200 utilisateurs. J'ai écrit l'interface et l'API, puis j'ai mis en place la CI/CD et les tests automatisés. Chaque changement part en production sans crainte. Pendant mon alternance chez Groupe Blue Studio, j'ai participé au développement d'outils internes en TypeScript. J'y ai appris à lire le code des autres.

J'ai ensuite formé 5 développeurs internes. Ils ont repris l'application sans moi. Je préfère une équipe où chaque modification est relue avant de partir, et c'est ce que vous décrivez.

Vos clients ouvrent l'outil du matin au soir. Je veux travailler sur un produit où un défaut se voit tout de suite et se corrige vite.

Je peux vous montrer mon travail lors d'un court échange, quand cela vous convient.

Cordialement,`;

const INTERVIEW = {
  experience: [
    { question: "Comment avez-vous organisé l'application pour 1 200 utilisateurs ?", answer: "Partir du fait sur la conception de bout en bout, décrire le découpage entre l'interface React et l'API Node.js." },
    { question: 'Comment fonctionne la CI/CD que vous avez mise en place ?', answer: "S'appuyer sur le fait de la CI/CD et des tests automatisés, dire ce qui bloque une livraison." },
    { question: 'Comment avez-vous formé les 5 développeurs ?', answer: "Reprendre le fait de formation, donner un exemple concret d'explication." },
  ],
  company: [
    'Équipe de 14 personnes, donc peu de rôles spécialisés.',
    'Déploiement plusieurs fois par semaine après relecture.',
    "Clients artisans, qui utilisent l'outil toute la journée.",
  ],
  toAsk: [
    'Comment se déroule une relecture de code chez vous ?',
    'Quelle part du temps va aux nouvelles fonctionnalités ?',
    "Comment recueillez-vous les retours des ateliers ?",
  ],
};

const PREP_SHEET = {
  items: [
    {
      skill: 'Docker',
      basics: [
        'Une image décrit un environnement, un conteneur en est une instance en cours.',
        'Un Dockerfile se lit de haut en bas et chaque ligne crée une couche mise en cache.',
        'Les volumes gardent les données quand le conteneur est supprimé.',
        'Docker Compose lance plusieurs conteneurs ensemble pour le développement.',
        'Une image légère se déploie plus vite, le piège classique est d\'y laisser les outils de build.',
      ],
      questions: [
        'À quoi sert Docker dans votre flux de développement ?',
        "Quelle est la différence entre une image et un conteneur ?",
        'Comment réduiriez-vous la taille d\'une image ?',
      ],
    },
  ],
};

export function answerFor(prompt) {
  const text = (extract) => ({ content: [{ type: 'text', text: extract }], stop_reason: 'end_turn' });
  const json = (obj) => text(JSON.stringify(obj));
  if (prompt.includes("Analyse cette offre d'emploi")) return json(EXTRACTION);
  if (prompt.includes("Pour chaque exigence d'une offre")) return json(MAPPING);
  if (prompt.includes("Tu adaptes un CV")) return json(TAILORED);
  if (prompt.includes("Tu écris la lettre de motivation")) return text(LETTER);
  if (prompt.includes("Tu relis une lettre de motivation")) return text(LETTER);
  if (prompt.includes("Prépare un candidat à l'entretien")) return json(INTERVIEW);
  if (prompt.includes('Un candidat a ajouté ces compétences')) return json(PREP_SHEET);
  return text('ok');
}
