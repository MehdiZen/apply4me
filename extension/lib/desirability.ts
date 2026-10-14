import type { MatchResult, OfferAnalysis, OfferSignal, SearchPreferences } from '../types';
import { EMPLOYER_LABEL, hasPreferences } from './preferences';

// Second axe du verdict : le poste va-t-il dans le sens de ce que la personne
// cherche ? Le mesurable (employeur, contrat, télétravail, salaire) est jugé
// ici par le code ; le sémantique vient des signaux cités lus à l'analyse.

export interface Desirability {
  positives: OfferSignal[];
  negatives: OfferSignal[];
  dealbreakers: OfferSignal[];
  salary: 'in-range' | 'below' | 'above' | 'unknown';
  askSalary: boolean;   // la personne a une cible et l'offre ne donne pas de fourchette
}

export interface JobVerdict {
  verdict: 'apply' | 'maybe' | 'skip';
  reason: string;
  nextStep: string;
}

const signal = (label: string, quote: string, dealbreaker = false): OfferSignal => ({ label, quote, dealbreaker });

export function evaluateDesirability(analysis: OfferAnalysis, prefs?: SearchPreferences): Desirability {
  const out: Desirability = { positives: [], negatives: [], dealbreakers: [], salary: 'unknown', askSalary: false };
  if (!prefs || !hasPreferences(prefs)) return out;
  const b = analysis.brief;
  const add = (s: OfferSignal, level: 'positive' | 'negative' | 'dealbreaker') =>
    (level === 'positive' ? out.positives : level === 'negative' ? out.negatives : out.dealbreakers).push(s);

  // Lus par le modèle, citations déjà vérifiées à l'analyse. Un rédhibitoire
  // n'en est un que si la personne en a déclaré (ou des conditions) : sinon
  // le modèle ne peut pas l'imposer, le point reste un négatif.
  const declared = !!(prefs.dealbreakers.trim() || prefs.conditions.trim());
  for (const s of analysis.signals?.positives ?? []) add(s, 'positive');
  for (const s of analysis.signals?.negatives ?? []) {
    const blocking = s.dealbreaker && declared;
    add({ ...s, dealbreaker: blocking }, blocking ? 'dealbreaker' : 'negative');
  }

  // Type d'employeur.
  const type = b?.employerType;
  if (type) {
    const level = prefs.employers[type] ?? 'neutral';
    const s = signal(EMPLOYER_LABEL[type], '', level === 'dealbreaker');
    if (level === 'wanted') add(s, 'positive');
    else if (level === 'negative') add(s, 'negative');
    else if (level === 'dealbreaker') add(s, 'dealbreaker');
  }

  // Contrat.
  const contract = b?.contractType?.trim();
  if (contract && prefs.contracts.length && !prefs.contracts.some(c => c.toLowerCase() === contract.toLowerCase())) {
    add(signal(`Contrat ${contract}`, b?.contract || contract), 'negative');
  }

  // Télétravail.
  const days = b?.remoteDays;
  if (days === 0 && prefs.remote !== 'indifferent') {
    const s = signal('Uniquement sur site', b?.workMode ?? '', prefs.remote === 'required');
    add(s, prefs.remote === 'required' ? 'dealbreaker' : 'negative');
  } else if (typeof days === 'number' && days >= 2 && prefs.remote !== 'indifferent') {
    add(signal(`${days} jours de télétravail`, b?.workMode ?? ''), 'positive');
  }

  // Salaire : comparé seulement s'il est annoncé, jamais pénalisé s'il ne l'est pas.
  const { min = null, max = null } = b?.salary ?? {};
  const range = [min, max].filter((x): x is number => x !== null).join(' à ');
  if ((min !== null || max !== null) && (prefs.salaryFloor || prefs.salaryTarget)) {
    if (prefs.salaryFloor && max !== null && max < prefs.salaryFloor) {
      out.salary = 'below';
      add(signal(`Salaire sous ton plancher (${range} k€)`, ''), 'negative');
    } else if (prefs.salaryTarget && min !== null && min > prefs.salaryTarget[1]) {
      out.salary = 'above';
      add(signal(`Salaire au-dessus de ta cible (${range} k€)`, ''), 'positive');
    } else {
      out.salary = 'in-range';
    }
  }
  out.askSalary = out.salary === 'unknown' && !!(prefs.salaryFloor || prefs.salaryTarget) && min === null && max === null;
  return out;
}

export function combineVerdict(match: MatchResult, d: Desirability): JobVerdict {
  if (match.verdict === 'skip') {
    return { verdict: 'skip', reason: match.reason, nextStep: 'Ignorer, ou préparer quand même si ce point se discute' };
  }
  if (d.dealbreakers.length) {
    return {
      verdict: 'skip',
      reason: `Rédhibitoire pour toi : ${d.dealbreakers.map(s => s.label).join(', ')}.`,
      nextStep: 'Ignorer, ou préparer quand même si ce point se discute',
    };
  }
  if (d.negatives.length) {
    return {
      verdict: 'maybe',
      reason: `Faisable, mais : ${d.negatives.map(s => s.label).join(', ')}.`,
      nextStep: `À trancher : ${d.negatives[0].label}`,
    };
  }
  return {
    verdict: 'apply',
    reason: match.reason,
    nextStep: d.askSalary ? 'Postuler, et demander la fourchette au premier échange' : 'Postuler',
  };
}
