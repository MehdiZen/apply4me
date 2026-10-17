import type {
  Bilingual, ContractKind, Entry, Experience, Fact, FactBase, FactGroup,
  LegacySkillCategory, Skill, SkillGroupLabel, SkillLevel,
} from '../types';
import { toHref } from './links';
import { callLLMJSON } from './llm';

// ── Import depuis le CV ───────────────────────────────────────────────────────
// Le LLM structure le CV. Tout ce qui peut être vérifié par du code (chiffres,
// preuves des compétences, ids) est ensuite recalculé par normalizeFactBase :
// on ne fait pas confiance au modèle pour ce qui sert de garde-fou.

const SCHEMA = `{
  "identity": { "name": "", "title": {"fr":"","en":""}, "contact": {"fr":"","en":""}, "links": [""], "languages": {"fr":"","en":""} },
  "summary": {"fr":"","en":""},
  "experiences": [{
    "id": "court-et-stable", "company": "", "location": "",
    "role": {"fr":"","en":""},
    "contract": "cdi|cdd|alternance|stage|freelance|other",
    "start": "AAAA-MM", "end": "AAAA-MM ou null si poste actuel",
    "context": {"fr":"","en":""} ou null,
    "groups": [{ "title": {"fr":"","en":""} ou null, "facts": [{ "id": "", "text": {"fr":"","en":""}, "skills": [""] }] }]
  }],
  "education": [{ "id": "", "title": {"fr":"","en":""}, "detail": {"fr":"","en":""} ou null, "date": "", "links": [""] }],
  "certifications": [ même forme ],
  "projects": [ même forme ],
  "skillGroups": [{ "label": {"fr":"","en":""} }],
  "skills": [{ "name": "", "aliases": [""], "level": "expert|prod|touched|learning", "group": "intitulé fr exact d'une rubrique, ou null" }]
}`;

function buildPrompt(cvPrimary: string, cvSecondary: string): string {
  const second = cvSecondary.trim()
    ? `\nLE MÊME CV DANS L'AUTRE LANGUE (utilise-le tel quel pour la version correspondante, ne retraduis pas) :\n"""\n${cvSecondary}\n"""\n`
    : '';
  return `Tu transformes un CV en base de faits structurée. Cette base sera la SEULE source autorisée pour générer des CV adaptés : rien ne doit être perdu, rien ne doit être ajouté.

CV :
"""
${cvPrimary}
"""
${second}
RÈGLES :
- Recopie fidèlement. Chaque puce ou phrase d'expérience devient UN fait. Ne fusionne pas, ne résume pas, ne reformule pas, n'ajoute aucun chiffre ni aucune technologie.
- Chaque texte existe en "fr" et en "en". Si le CV n'existe que dans une langue, traduis fidèlement l'autre version, sans enjoliver.
- Les sous-titres à l'intérieur d'une expérience (ex. "Gestion de l'équipe", "Relation client") deviennent "title" d'un groupe. Sans sous-titre, un seul groupe avec "title": null.
- La phrase de contexte sous un poste (clients, secteur) va dans "context", pas dans les faits.
- "skills" d'un fait : les technologies, outils, méthodes ou savoir-faire explicitement nommés dans ce fait.
- "skills" global : TOUTES les compétences nommées dans le CV (section compétences, expériences, projets), une seule fois chacune. "aliases" : synonymes et variantes usuelles qu'une annonce pourrait employer (abréviations, FR/EN, nom complet), 0 à 5. "level" : "prod" si la compétence apparaît dans une expérience professionnelle, "touched" si elle n'apparaît que dans la liste de compétences, un projet personnel ou une formation. N'utilise "expert" et "learning" que si le CV le dit explicitement.
- "skillGroups" : les intitulés des rubriques de la section compétences, dans l'ordre du CV, tels qu'écrits (ex. "Soins", "Logiciels", "Langues"). Une section compétences sans rubriques donne une seule rubrique "Compétences". Pas de section compétences : [].
- "group" d'une compétence : l'intitulé "fr" de la rubrique où le CV la range ; null si elle n'apparaît pas dans la section compétences (seulement dans une expérience ou un projet).
- Dates au format AAAA-MM. Pour une date sans mois, utilise le mois 01 (début) ou 12 (fin).
- "contract" : déduis-le du CV (CDI, alternance, stage…), "other" si non précisé.
- "contact" : la ligne de coordonnées telle qu'écrite (ville, mobilité, téléphone, e-mail). "links" : les URL ou domaines (réseau professionnel, portfolio, site).
- "links" d'une formation, certification ou d'un projet : les URL propres à cette entrée (dépôt, démo, page du diplôme), recopiées telles quelles ; [] s'il n'y en a pas. Une section « Liens du fichier » en fin de CV liste des liens cachés sous du texte : range chacun dans l'entrée dont il porte le nom (ex. github.com/x/monprojet va au projet « monprojet »), sinon dans identity.links ; écarte ceux qui ne correspondent à rien.
- "languages" : la ligne des langues parlées, telle qu'écrite.

FORMAT DE SORTIE : uniquement un objet JSON conforme à ce schéma, sans markdown ni commentaire :
${SCHEMA}`;
}

export async function buildFactBaseFromCV(cvPrimary: string, cvSecondary = ''): Promise<FactBase> {
  const raw = await callLLMJSON(buildPrompt(cvPrimary, cvSecondary), { maxTokens: 16000 });
  return normalizeFactBase(raw);
}

// ── Normalisation et contrôles ────────────────────────────────────────────────

const LEVELS: SkillLevel[] = ['expert', 'prod', 'touched', 'learning'];
const CONTRACTS: ContractKind[] = ['cdi', 'cdd', 'alternance', 'stage', 'freelance', 'other'];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strList = (v: unknown): string[] => arr(v).map(str).filter(Boolean);
const pick = <T extends string>(v: unknown, allowed: T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

function bi(v: unknown): Bilingual {
  if (typeof v === 'string') return { fr: v.trim(), en: v.trim() };
  if (!isObj(v)) return { fr: '', en: '' };
  const fr = str(v['fr']);
  const en = str(v['en']);
  return { fr: fr || en, en: en || fr };
}

function biOrNull(v: unknown): Bilingual | null {
  const b = bi(v);
  return b.fr || b.en ? b : null;
}

function month(v: unknown): string | null {
  const m = str(v).match(/^(\d{4})(?:-(\d{1,2}))?/);
  if (!m) return null;
  return `${m[1]}-${(m[2] ?? '01').padStart(2, '0')}`;
}

export function slug(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 32) || 'item';
}

// Comparaison tolérante : casse, accents, ponctuation ("Node.js" = "nodejs").
export function normalizeName(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9+#]/g, '');
}

// Chiffres présents dans un texte : seuls chiffres que le générateur pourra réécrire.
// Les années (1900-2099) sont exclues : elles relèvent des dates, pas des faits.
export function extractNumbers(text: string): string[] {
  // "1 200" et "1 200 000" (espaces de milliers) forment un seul nombre ; écrit
  // ainsi, "2 000" est une quantité, jamais une année.
  const found = text.match(/\d{1,3}(?:[ \u00A0\u202F]\d{3})+(?:[.,]\d+)?\b|\d+(?:[.,]\d+)?/g) ?? [];
  return [...new Set(found
    .filter(n => /[ \u00A0\u202F]/.test(n) || !/^(19|20)\d{2}$/.test(n))
    .map(n => n.replace(/[ \u00A0\u202F]/g, '').replace(',', '.')))];
}

function uniqueId(base: string, used: Set<string>): string {
  let id = base;
  for (let i = 2; used.has(id); i++) id = `${base}-${i}`;
  used.add(id);
  return id;
}

export function normalizeFactBase(raw: unknown): FactBase {
  if (!isObj(raw)) throw new Error('Base de faits invalide.');
  const used = new Set<string>();

  const identity = isObj(raw['identity']) ? raw['identity'] : {};

  const experiences: Experience[] = arr(raw['experiences']).filter(isObj).map(e => {
    const company = str(e['company']);
    const expId = uniqueId(slug(str(e['id']) || company), used);
    let n = 0;
    const groups: FactGroup[] = arr(e['groups']).filter(isObj).map(g => ({
      title: biOrNull(g['title']),
      facts: arr(g['facts']).filter(isObj).map(f => {
        const text = bi(f['text']);
        return {
          id: uniqueId(`${expId}-${++n}`, used),
          text,
          skills: strList(f['skills']),
          numbers: [...new Set([...extractNumbers(text.fr), ...extractNumbers(text.en)])],
        } satisfies Fact;
      }).filter(f => f.text.fr || f.text.en),
    })).filter(g => g.facts.length > 0);

    return {
      id: expId,
      company,
      location: str(e['location']),
      role: bi(e['role']),
      contract: pick(e['contract'], CONTRACTS, 'other'),
      start: month(e['start']) ?? '',
      end: e['end'] === null || /aujourd|present|actuel|now/i.test(str(e['end'])) ? null : month(e['end']),
      context: biOrNull(e['context']),
      groups,
    };
  });

  const entries = (key: string): Entry[] =>
    arr(raw[key]).filter(isObj).map(x => {
      const title = bi(x['title']);
      return {
        id: uniqueId(`${key.slice(0, 4)}-${slug(title.fr)}`, used),
        title,
        detail: biOrNull(x['detail']),
        date: str(x['date']),
        links: strList(x['links']).filter(l => toHref(l) !== null),
      };
    }).filter(x => x.title.fr);

  const groupIds = new Set<string>();
  const rawGroups = arr(raw['skillGroups']).filter(isObj);
  const skillGroups: SkillGroupLabel[] = rawGroups.map(g => {
    const label = bi(g['label']);
    return { id: uniqueId(str(g['id']) || slug(label.fr || label.en), groupIds), label };
  }).filter(g => g.label.fr);

  const base: FactBase = {
    version: 1,
    identity: {
      name: str(identity['name']),
      title: bi(identity['title']),
      contact: bi(identity['contact']),
      links: strList(identity['links']),
      languages: bi(identity['languages']),
    },
    summary: bi(raw['summary']),
    experiences,
    education: entries('education'),
    certifications: entries('certifications'),
    projects: entries('projects'),
    skillGroups,
    skills: [],
  };

  const rawSkills = arr(raw['skills']).filter(isObj);
  const legacy = rawSkills.some(s => 'category' in s && !('group' in s));
  if (legacy) migrateLegacyGroups(skillGroups, rawGroups, rawSkills, groupIds);

  // Rubrique d'une compétence : id, intitulé (fr ou en) ou numéro de rubrique.
  const groupOf = (v: unknown): string | null => {
    if (typeof v === 'number') return skillGroups[v]?.id ?? null;
    const key = normalizeName(str(v));
    if (!key) return null;
    return skillGroups.find(g => [g.id, g.label.fr, g.label.en].some(x => normalizeName(x) === key))?.id ?? null;
  };

  const seen = new Set<string>();
  base.skills = rawSkills.flatMap(s => {
    const name = str(s['name']);
    const key = normalizeName(name);
    if (!key || seen.has(key)) return [];
    seen.add(key);
    const level = pick(s['level'], LEVELS, 'touched');
    return [{
      name,
      aliases: strList(s['aliases']).filter(a => normalizeName(a) !== key),
      level,
      group: groupOf(s['group']),
      // Ancienne base : une compétence "projet perso" figurait sur tous les CV.
      pinned: s['pinned'] === true || (legacy && level === 'learning'),
      evidence: [],
      source: s['source'] === 'user' ? 'user' : 'cv',
    } satisfies Skill];
  });

  linkEvidence(base);
  return base;
}

// Bases enregistrées avant les rubriques libres : chaque compétence avait une
// catégorie figée (core, cloud, dev, other) et chaque rubrique une catégorie.
// On reproduit l'affichage d'alors : rubrique de même catégorie, sinon la
// dernière pour un "projet perso", sinon non affichée.
const LEGACY_LABEL: Record<LegacySkillCategory, Bilingual> = {
  core: { fr: 'Compétences clés', en: 'Core skills' },
  cloud: { fr: 'Outils et environnements', en: 'Tools and platforms' },
  dev: { fr: 'Technique', en: 'Technical' },
  other: { fr: 'Autres', en: 'Other' },
};

function migrateLegacyGroups(groups: SkillGroupLabel[], rawGroups: Obj[], rawSkills: Obj[], ids: Set<string>): void {
  const cats: LegacySkillCategory[] = ['core', 'cloud', 'dev', 'other'];
  const catOfGroup = rawGroups.map(g => pick(g['category'], cats, 'other'));
  if (!groups.length) {
    for (const c of ['core', 'cloud', 'dev'] as LegacySkillCategory[]) {
      if (!rawSkills.some(s => s['category'] === c)) continue;
      groups.push({ id: uniqueId(c, ids), label: LEGACY_LABEL[c] });
      catOfGroup.push(c);
    }
    if (!groups.length) { groups.push({ id: uniqueId('other', ids), label: LEGACY_LABEL.other }); catOfGroup.push('other'); }
  }
  for (const s of rawSkills) {
    if ('group' in s) continue;
    const i = catOfGroup.indexOf(pick(s['category'], cats, 'other'));
    s['group'] = i >= 0 ? groups[i].id : s['level'] === 'learning' ? groups[groups.length - 1].id : null;
  }
}

// Une compétence est prouvée par les faits qui la citent (liste du fait ou texte).
// Recalculé à chaque modification de la base.
export function linkEvidence(base: FactBase): void {
  const facts = allFacts(base);
  for (const skill of base.skills) {
    const names = [skill.name, ...skill.aliases];
    const keys = names.map(normalizeName).filter(Boolean);
    skill.evidence = facts
      .filter(f => {
        if (f.skills.some(s => keys.includes(normalizeName(s)))) return true;
        const text = `${f.text.fr} ${f.text.en}`;
        return names.some(n => n.length >= 2 && mentions(text, n));
      })
      .map(f => f.id);
  }
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Terme cité comme mot entier : "Vue" ne doit pas matcher "revue", ni "Go" "Google".
export function mentions(text: string, term: string): boolean {
  const t = fold(term).trim();
  if (!t) return false;
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(fold(text));
}

// Nom d'entreprise sans forme juridique : "Blue Studio SAS, Paris" → "Blue
// Studio". Seules les formes juridiques sont retirées : un mot comme "France"
// ou "Groupe" fait partie du nom ("Air France", "Groupe SEB").
const LEGAL_FORM = /\b(sa|sas|sasu|sarl|eurl|inc|ltd|llc|gmbh|plc|bv|ag|spa)\b\.?/gi;
export function companyCore(name: string): string {
  return name.split(/[,(|]/)[0].replace(LEGAL_FORM, ' ').replace(/\s{2,}/g, ' ').trim();
}

// Même entreprise, par le nom exact (hors forme juridique et casse). Les cas
// ambigus (filiale, marque, ancien nom) sont jugés par le modèle au
// rapprochement (`formerEmployer`), pas ici.
export function sameCompany(a: string, b: string): boolean {
  const x = normalizeName(companyCore(a));
  return x.length >= 2 && x === normalizeName(companyCore(b));
}

export function allFacts(base: FactBase): Fact[] {
  return base.experiences.flatMap(e => e.groups.flatMap(g => g.facts));
}

export function findSkill(base: FactBase, label: string): Skill | undefined {
  const key = normalizeName(label);
  if (!key) return undefined;
  return base.skills.find(s => [s.name, ...s.aliases].some(n => normalizeName(n) === key));
}

// ── Expérience totale ─────────────────────────────────────────────────────────
// Union des périodes (les chevauchements ne comptent qu'une fois), alternance
// incluse. Mois de début et de fin inclus.

function toIndex(m: string): number {
  const [y, mo] = m.split('-').map(Number);
  return y * 12 + (mo - 1);
}

export function totalExperienceMonths(base: FactBase, now = new Date()): number {
  const current = now.getFullYear() * 12 + now.getMonth();
  const spans = base.experiences
    .filter(e => e.start)
    .map(e => [toIndex(e.start), e.end ? toIndex(e.end) : current] as const)
    .filter(([a, b]) => b >= a)
    .sort((x, y) => x[0] - y[0]);

  let total = 0;
  let curStart = -1;
  let curEnd = -2;
  for (const [a, b] of spans) {
    if (a > curEnd + 1) {
      if (curEnd >= curStart && curStart >= 0) total += curEnd - curStart + 1;
      curStart = a;
      curEnd = b;
    } else {
      curEnd = Math.max(curEnd, b);
    }
  }
  if (curStart >= 0) total += curEnd - curStart + 1;
  return total;
}

export function formatYears(months: number, lang: 'fr' | 'en' = 'fr'): string {
  const years = Math.round((months / 12) * 10) / 10;
  return lang === 'fr' ? `${String(years).replace('.', ',')} ans` : `${years} years`;
}
