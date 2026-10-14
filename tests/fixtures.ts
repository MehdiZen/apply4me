import type { FactBase, OfferAnalysis, Requirement, Settings } from '../extension/types';
import { normalizeFactBase } from '../extension/lib/factbase';

// Profils fictifs (aucune donnée réelle), dans deux métiers différents : les
// règles doivent tenir pour l'un comme pour l'autre.

// Développeur : poste actuel, alternance passée, Python hors cadre pro épinglé.
export const base: FactBase = normalizeFactBase({
  version: 1,
  identity: {
    name: 'Alex Martin',
    title: { fr: 'Développeur full stack', en: 'Full stack developer' },
    contact: { fr: 'Lyon', en: 'Lyon' },
    links: [],
    languages: { fr: 'Français (natif), anglais (courant)', en: 'French (native), English (fluent)' },
  },
  summary: { fr: 'Développeur full stack, applications web en production.', en: 'Full stack developer, web apps in production.' },
  experiences: [
    {
      id: 'e1', company: 'Acme Software', location: 'Lyon', contract: 'cdi',
      role: { fr: 'Développeur full stack', en: 'Full stack developer' },
      start: '2024-09', end: null, context: null,
      groups: [{ title: null, facts: [
        { id: 'f1', text: { fr: 'Conception de bout en bout d\'une application React et Node.js pour 1 200 utilisateurs', en: 'End-to-end design of a React and Node.js app for 1,200 users' }, skills: [] },
        { id: 'f2', text: { fr: 'Mise en place de la CI/CD et des tests automatisés', en: 'Set up CI/CD and automated tests' }, skills: [] },
        { id: 'f3', text: { fr: 'Formation de 5 développeurs internes', en: 'Trained 5 internal developers' }, skills: [] },
      ] }],
    },
    {
      id: 'e2', company: 'Groupe Blue Studio', location: 'Paris', contract: 'alternance',
      role: { fr: 'Développeur web (alternance)', en: 'Web developer (apprenticeship)' },
      start: '2022-09', end: '2024-08', context: null,
      groups: [{ title: null, facts: [
        { id: 'f4', text: { fr: 'Participation au développement d\'outils internes en TypeScript', en: 'Contributed to internal TypeScript tools' }, skills: [] },
      ] }],
    },
  ],
  education: [{ id: 'd1', title: { fr: 'Master informatique', en: 'MSc Computer Science' }, detail: null, date: '2024' }],
  certifications: [],
  projects: [],
  skillGroups: [{ label: { fr: 'Développement', en: 'Development' } }],
  skills: [
    { name: 'React', aliases: [], level: 'prod', group: 'Développement' },
    { name: 'Node.js', aliases: ['NodeJS'], level: 'prod', group: 'Développement' },
    { name: 'TypeScript', aliases: ['TS'], level: 'prod', group: 'Développement' },
    { name: 'CI/CD', aliases: [], level: 'prod', group: 'Développement' },
    { name: 'Tests automatisés', aliases: [], level: 'prod', group: 'Développement' },
    { name: 'Python', aliases: [], level: 'learning', group: null, pinned: true, source: 'user' },
  ],
});

// Infirmière : rubriques libres (soins, logiciels, langues), aucun outil "tech".
export const nurse: FactBase = normalizeFactBase({
  version: 1,
  identity: {
    name: 'Camille Durand',
    title: { fr: 'Infirmière diplômée d\'État', en: 'Registered nurse' },
    contact: { fr: 'Nantes', en: 'Nantes' },
    links: [],
    languages: { fr: 'Français, anglais (intermédiaire)', en: 'French, English (intermediate)' },
  },
  summary: { fr: 'Infirmière en service de chirurgie, prise en charge post-opératoire.', en: 'Surgical ward nurse, post-operative care.' },
  experiences: [
    {
      id: 'n1', company: 'CHU de Nantes', location: 'Nantes', contract: 'cdi',
      role: { fr: 'Infirmière en chirurgie', en: 'Surgical nurse' },
      start: '2021-03', end: null, context: null,
      groups: [{ title: null, facts: [
        { id: 'g1', text: { fr: 'Prise en charge post-opératoire de 12 patients par poste', en: 'Post-operative care for 12 patients per shift' }, skills: ['Soins post-opératoires'] },
        { id: 'g2', text: { fr: 'Gestion de la douleur et suivi des protocoles antalgiques', en: 'Pain management and analgesic protocol follow-up' }, skills: ['Gestion de la douleur'] },
        { id: 'g3', text: { fr: 'Tutorat de 3 étudiants infirmiers par an', en: 'Mentored 3 nursing students per year' }, skills: ['Tutorat'] },
      ] }],
    },
  ],
  education: [{ id: 'd1', title: { fr: 'Diplôme d\'État d\'infirmier', en: 'State nursing diploma' }, detail: null, date: '2021' }],
  certifications: [],
  projects: [],
  skillGroups: [
    { label: { fr: 'Soins', en: 'Care' } },
    { label: { fr: 'Logiciels', en: 'Software' } },
    { label: { fr: 'Qualités', en: 'Strengths' } },
  ],
  skills: [
    { name: 'Soins post-opératoires', aliases: [], level: 'prod', group: 'Soins' },
    { name: 'Gestion de la douleur', aliases: [], level: 'prod', group: 'Soins' },
    { name: 'Tutorat', aliases: [], level: 'prod', group: 'Soins' },
    { name: 'DxCare', aliases: [], level: 'prod', group: 'Logiciels' },
    { name: 'Excel', aliases: [], level: 'touched', group: 'Logiciels' },
    { name: 'Écoute', aliases: [], level: 'prod', group: 'Qualités' },
    { name: 'Hypnose', aliases: [], level: 'learning', group: 'Soins' },
  ],
});

export const settings: Settings = { allowStretch: true, yearsTolerance: 0.7, scoreThreshold: 50 };

export const req = (label: string, kind: Requirement['kind'], mandatory: boolean, extra: Partial<Requirement> = {}): Requirement => ({
  label, kind, mandatory, minYears: null, matches: [], met: null, group: '', named: kind === 'tech', ...extra,
});

export const offer = (requirements: Requirement[], extra: Partial<OfferAnalysis> = {}): OfferAnalysis => ({
  title: 'Poste', company: 'Cible', lang: 'fr', minYears: null, requirements, ...extra,
});

export const NOW = new Date('2026-10-01');
