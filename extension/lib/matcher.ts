import type {
  CoveredRequirement, FactBase, MatchResult, OfferAnalysis, Settings, Skill, SkillLevel, StretchCandidate,
} from '../types';
import { findSkill, normalizeName, totalExperienceMonths } from './factbase';
import { cleanSkillLabel, isSkillLabel, resolveMatches } from './requirements';

// Comparaison offre / base de faits, entièrement par le code : le verdict est
// reproductible et explicable, le LLM n'a fait que l'extraction.

const RANK: Record<SkillLevel, number> = { expert: 4, prod: 3, touched: 2, learning: 1 };
const CREDIT: Record<SkillLevel, number> = { expert: 1, prod: 1, touched: 0.7, learning: 0.4 };
const STRETCH_CREDIT = 0.3;

const fmtYears = (y: number) => String(Math.round(y * 10) / 10).replace('.', ',');

function monthIndex(m: string): number {
  const [y, mo] = m.split('-').map(Number);
  return y * 12 + (mo - 1);
}

// Durée pendant laquelle une compétence a été pratiquée : union des périodes
// des expériences qui contiennent un fait qui la prouve.
function skillMonths(base: FactBase, skill: Skill, now: Date): number {
  const current = now.getFullYear() * 12 + now.getMonth();
  const spans = base.experiences
    .filter(e => e.start && e.groups.some(g => g.facts.some(f => skill.evidence.includes(f.id))))
    .map(e => [monthIndex(e.start), e.end ? monthIndex(e.end) : current] as const)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let end = -1;
  for (const [a, b] of spans) {
    const from = Math.max(a, end + 1);
    if (b >= from) total += b - from + 1;
    end = Math.max(end, b);
  }
  return total;
}

// `checkedLabels` : cases cochées en ce moment dans le popup. Seules elles
// rapportent des points ; par défaut, les choix mémorisés.
export function matchOffer(
  analysis: OfferAnalysis,
  base: FactBase,
  settings: Settings,
  stretchMemory: string[],
  now = new Date(),
  checkedLabels?: string[],
): MatchResult {
  const yearsHave = totalExperienceMonths(base, now) / 12;
  const yearsFromReqs = analysis.requirements
    .filter(r => r.kind === 'years' && r.minYears)
    .map(r => r.minYears as number);
  const yearsNeed = analysis.minYears ?? (yearsFromReqs.length ? Math.max(...yearsFromReqs) : null);

  const covered: CoveredRequirement[] = [];
  const hardGaps: string[] = [];
  const softGaps: string[] = [];
  const stretch: StretchCandidate[] = [];
  const memory = new Set(stretchMemory);
  const ticked = new Set((checkedLabels ?? stretchMemory).map(normalizeName));
  const counted = new Set<string>();
  // Score = couverture des COMPÉTENCES. Outils nommés (précis) d'un côté,
  // savoir-faire et catégories ("relation client", "gestion de projet") de
  // l'autre : le découpage des seconds varie d'une lecture de l'IA à l'autre,
  // ils pèsent d'autant moins que l'offre nomme d'outils (voir looseFactor).
  const precise = { credit: 0, weight: 0, total: 0, covered: 0 };
  const loose = { credit: 0, weight: 0, total: 0, covered: 0 };

  for (const r of analysis.requirements) {
    const w = r.mandatory ? 2 : 1;

    if (r.kind === 'years' || r.kind === 'soft') continue;

    // Diplôme et langue : critères éliminatoires à part, hors score.
    if (r.kind === 'diploma' || r.kind === 'language') {
      if (r.met === null) {
        // Impossible à juger : signalé plutôt qu'ignoré en silence.
        if (r.mandatory) softGaps.push(`${r.label} (à vérifier)`);
      } else if (!r.met && r.equivalent) {
        // « ou équivalent » : l'expérience peut compenser, c'est un risque à défendre.
        softGaps.push(`${r.label} (ou équivalent : à défendre)`);
      } else if (!r.met) {
        (r.mandatory ? hardGaps : softGaps).push(r.label);
      }
      continue;
    }

    // Une phrase est une mission du poste, pas une compétence : ni score, ni case.
    if (!isSkillLabel(r.label)) continue;
    const label = cleanSkillLabel(r.label) || r.label;

    // Un même terme demandé deux fois ne compte qu'une fois, y compris sous
    // deux noms d'une même compétence ("Node.js" et "NodeJS").
    const same = findSkill(base, label);
    const key = same ? `skill:${same.name}` : normalizeName(label);
    if (counted.has(key)) continue;
    counted.add(key);

    const bucket = r.kind === 'domain' || r.named === false ? loose : precise;
    bucket.weight += w;
    bucket.total++;
    const names = r.matches.length ? r.matches : resolveMatches(base, r.label);
    const skills = names
      .map(n => findSkill(base, n))
      .filter((s): s is NonNullable<typeof s> => !!s)
      .sort((a, b) => RANK[b.level] - RANK[a.level]);
    const best = skills[0];

    if (best) {
      bucket.credit += w * CREDIT[best.level];
      bucket.covered++;
      covered.push({ requirement: label, skill: best.name, level: best.level, evidence: best.evidence });
      // Années demandées pour CETTE compétence : comparées à la durée des
      // expériences qui la prouvent. Pour un outil nommé, c'est fiable : un
      // écart peut bloquer. Pour une catégorie ("développement logiciel",
      // "bloc opératoire"), les faits ne la nomment pas tous : la durée trouvée
      // est un minimum, l'écart est signalé sans bloquer. Et si ses années sont
      // celles du poste, c'est l'ancienneté globale, déjà jugée plus bas.
      const sameAsGlobal = bucket === loose && r.minYears === yearsNeed;
      if (r.minYears && !sameAsGlobal) {
        const have = skillMonths(base, best, now) / 12;
        if (have < r.minYears) {
          const found = have ? `${fmtYears(have)} au compteur` : 'hors cadre pro';
          const gap = `${label} : ${fmtYears(r.minYears)} ans demandés, ${found}${bucket === loose ? ' d\'après tes faits (à vérifier)' : ''}`;
          const blocking = bucket === precise && r.mandatory && have < r.minYears * settings.yearsTolerance;
          (blocking ? hardGaps : softGaps).push(gap);
        }
      }
      continue;
    }

    // Un savoir-faire ou une catégorie ("game design", "interfaces web") ne
    // s'ajoute pas à un CV et ne bloque pas : seuls les outils NOMMÉS
    // (Kafka, Terraform) peuvent devenir des cases à cocher.
    if (bucket === loose) {
      softGaps.push(label);
      continue;
    }

    // Outil concret manquant. Proposé en case si l'option est active ; il ne
    // rapporte des points que coché, et un obligatoire non coché reste bloquant.
    const isTicked = settings.allowStretch && ticked.has(normalizeName(label));
    if (settings.allowStretch && !stretch.some(s => normalizeName(s.label) === normalizeName(label))) {
      stretch.push({ label, group: r.group, mandatory: r.mandatory, checked: memory.has(normalizeName(label)) });
    }
    if (isTicked) {
      precise.credit += w * STRETCH_CREDIT;
      softGaps.push(label);
    } else {
      (r.mandatory ? hardGaps : softGaps).push(label);
    }
  }

  // Poids des savoir-faire : entier quand l'offre ne nomme aucun outil, de
  // moins en moins à mesure qu'elle en nomme (2 outils : 1/2, 6 : 1/4). Pas de
  // seuil : une offre à 2 ou 3 outils se note de la même façon.
  const looseFactor = 2 / (2 + precise.total);
  const weight = precise.weight + looseFactor * loose.weight;
  const credit = precise.credit + looseFactor * loose.credit;
  const scored = precise.total + loose.total;
  const scoredCovered = precise.covered + loose.covered;
  let score = weight ? Math.round((100 * credit) / weight) : 0;

  if (yearsNeed) {
    const ratio = yearsHave / yearsNeed;
    const gap = `${fmtYears(yearsNeed)} ans demandés, ${fmtYears(yearsHave)} au compteur`;
    if (ratio < settings.yearsTolerance) hardGaps.unshift(gap);
    else if (ratio < 1) {
      softGaps.unshift(gap);
      score = Math.max(0, score - 8);
    }
  }

  // Les obligatoires d'abord : ce sont celles que l'ATS filtre.
  stretch.sort((a, b) => Number(b.mandatory) - Number(a.mandatory));

  const tickedCount = stretch.filter(s => ticked.has(normalizeName(s.label))).length;
  let verdict: MatchResult['verdict'] = 'apply';
  let reason: string;
  // Un critère éliminatoire (années, diplôme, outil obligatoire) l'emporte,
  // même quand aucune compétence n'a pu être scorée.
  if (hardGaps.length) {
    verdict = 'skip';
    reason = hardGaps.slice(0, 2).join(' · ');
  } else if (!weight) {
    reason = 'Aucune compétence précise détectée dans l\'offre : verdict impossible, à toi de juger.';
  } else if (score < settings.scoreThreshold) {
    verdict = 'skip';
    reason = `Couverture trop faible (${score}/100, seuil ${settings.scoreThreshold})`;
  } else {
    // Mêmes exigences que celles du score.
    reason = `${scoredCovered} compétence${scoredCovered > 1 ? 's' : ''} sur ${scored} couverte${scoredCovered > 1 ? 's' : ''} par ton parcours`
      + (tickedCount ? `, ${tickedCount} ajoutée${tickedCount > 1 ? 's' : ''}` : '');
  }

  return {
    verdict, reason, score,
    yearsHave: Math.round(yearsHave * 10) / 10,
    yearsNeed,
    covered, hardGaps, softGaps, stretch,
  };
}
