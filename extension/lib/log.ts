import type { Application, ApplicationStatus, Job, PrepItem } from '../types';
import { get, set } from './storage';

// Journal des candidatures : une ligne par offre. Sert à vérifier plus tard si
// le score prédit les réponses, et si les candidatures forcées valent le coup.

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  generated: 'Préparée',
  sent: 'Envoyée',
  interview: 'Entretien',
  rejected: 'Refus',
  offer: 'Offre',
};

export async function listApplications(): Promise<Application[]> {
  return (await get('applications')) ?? [];
}

async function save(apps: Application[]): Promise<void> {
  await set('applications', apps);
}

// Une même offre (même URL) met à jour sa ligne au lieu d'en créer une autre.
export async function upsertFromJob(job: Job, prep: PrepItem[]): Promise<Application> {
  const apps = await listApplications();
  const url = job.url.split('#')[0];
  const existing = apps.find(a => (url && a.url === url) || a.id === job.id);
  const row: Application = {
    id: existing?.id ?? job.id,
    date: existing?.date ?? new Date().toISOString(),
    company: job.analysis.company,
    title: job.analysis.title,
    url,
    score: job.match.score,
    verdict: job.match.verdict,
    forced: job.forced,
    lang: job.lang,
    stretch: job.stretch,
    status: existing?.status ?? 'generated',
    prep: prep.length ? prep : existing?.prep ?? [],
  };
  await save(existing ? apps.map(a => (a.id === existing.id ? row : a)) : [row, ...apps]);
  return row;
}

export async function setStatus(id: string, status: ApplicationStatus): Promise<void> {
  const apps = await listApplications();
  await save(apps.map(a => (a.id === id ? { ...a, status } : a)));
}

export async function removeApplication(id: string): Promise<void> {
  await save((await listApplications()).filter(a => a.id !== id));
}

export function toCSV(apps: Application[]): string {
  const head = ['date', 'entreprise', 'poste', 'score', 'verdict', 'forcée', 'langue', 'ajouts', 'statut', 'url'];
  // Titre et entreprise viennent de la page : une cellule qui commence par
  // = + - @ serait exécutée comme formule par le tableur.
  const esc = (v: string | number | boolean) => {
    const s = typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const rows = apps.map(a => [
    a.date.slice(0, 10), a.company, a.title, a.score, a.verdict, a.forced ? 'oui' : 'non',
    a.lang, a.stretch.join(' / '), STATUS_LABEL[a.status], a.url,
  ].map(esc).join(';'));
  return '﻿' + [head.join(';'), ...rows].join('\n');
}
