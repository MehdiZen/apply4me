import type { FactBase, UserProfile } from '../types';
import { allFacts, extractNumbers, mentions } from './factbase';

// Garde-fous exécutés par le code après chaque génération. Le prompt demande
// déjà tout ça ; ici on ne fait pas confiance, on vérifie.

// Tirets longs (et demi-cadratins utilisés comme tirets) : remplacés par une
// virgule ou deux-points selon la position. Les plages "2023–2024" sont gardées.
export function cleanDashes(text: string): string {
  return text
    .replace(/(\d)\s*[–—]\s*(\d)/g, '$1-$2')
    .replace(/\s+[—–]\s+([^—–\n]+?)\s+[—–]\s+/g, ', $1, ')
    .replace(/\s*[—–]\s*$/gm, '')
    .replace(/^\s*[—–]\s*/gm, '')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/,\s*,/g, ',');
}

// Typographie française : espace insécable avant : ; ? ! (sauf URL "https://"
// et heures "12:30"). Pour les textes en français uniquement.
export function frenchSpacing(text: string): string {
  // Le signe doit être suivi d'une espace ou d'une fin de ligne : "12:30" et
  // "https://" ne sont donc pas touchés, "Just Dance 2025:" l'est.
  return text.replace(/(\S)[   ]?([:;?!])(?=\s|$)/g, '$1 $2');
}

// Intitulé ajouté devant un fait par le modèle ("CI/CD et automatisation : …")
// alors que le fait d'origine n'en a pas. Renvoie le texte sans l'intitulé
// quand c'est sûr (intitulé court, sans chiffre, et la suite garde l'essentiel
// du fait), null quand retirer amputerait le fait : l'appelant revient alors
// au texte d'origine plutôt que de perdre un chiffre ou l'objet du point.
export function stripAddedLabel(text: string, original: string, originalSameLang: string): string | null {
  const m = text.match(/^([^:.\n]{3,70}?)[   ]?:\s+(.+)$/s);
  if (!m) return text;
  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const head = m[1].trim();
  // Le début existe tel quel dans l'original (ex. "Stack : …") : ce n'est pas un ajout.
  if (originalSameLang && fold(originalSameLang).startsWith(fold(head))) return text;
  if (fold(original).includes(fold(head)) && head.split(/\s+/).length > 3) return text;
  const safe = head.split(/\s+/).length <= 6
    && !/\d/.test(head)
    && m[2].length >= originalSameLang.length * 0.6;
  if (!safe) return null;
  return m[2].charAt(0).toUpperCase() + m[2].slice(1);
}


// Mots qui présentent une compétence comme acquise. Interdits à côté d'une
// compétence ajoutée pour l'offre ou pratiquée seulement en projet perso.
const MASTERY = /\b(ma[iî]tris\w*|expert\w*|expertise|solide\w*|confirm[ée]\w*|aguerri\w*|sp[ée]cialiste|proficien\w*|fluent|specialist|mastery|master(ed|ing)?|extensive|seasoned|strong (experience|background)|\d+\s*(ans|an|years?)\b)|tr[eè]s (à l['’]aise|bon|bonne)|connais (tr[eè]s )?bien|parfaitement/i;

export function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Phrases qui survendent une compétence non maîtrisée.
export function overclaims(text: string, weakSkills: string[]): string[] {
  const out: string[] = [];
  for (const s of sentences(text)) {
    const skill = weakSkills.find(k => mentions(s, k));
    if (skill && MASTERY.test(s)) out.push(`« ${s} » survend ${skill}`);
  }
  return out;
}

// Compétence pratiquée hors cadre pro présentée comme exercée en poste : en
// production, pour des clients, au travail, depuis des années. Jugé
// proposition par proposition : "pas encore en poste" et "envie de la pratiquer
// au travail" restent permis. Motifs sur texte sans accents, sans vocabulaire
// d'un métier ("déployer", "livrer" ont d'autres sens ailleurs). Le cas le plus
// courant, la compétence citée avec un employeur, est vu par weakSkillAtEmployer.
const PRODUCTION = /\b(en prod(uction)?|in production|mise? en prod\w*|pour (des|mes|nos) clients|for (my |our )?clients|au quotidien|au travail|dans mon (poste|travail|equipe)|at work|in my (job|role|team)|depuis \S+ ans|for \S+ years)\b/;
const NOT_PRODUCTION = /\b(pas (encore )?(en|de) (prod\w*|poste)|jamais en (prod\w*|poste)|not (yet )?(in production|at work)|hors (production|cadre)|projets? perso\w*|personal projects?|formation|benevol\w*)|\b(envie|souhait\w*|hate|aimerais|voudrais|veux|pratiquer|eager|keen|want|looking forward|hope)\b[^.]{0,60}\b(prod|poste|travail|work|job|role)/;

export function claimsProduction(text: string, personalSkills: string[]): string[] {
  const out: string[] = [];
  for (const s of sentences(text)) {
    const skill = personalSkills.find(k => mentions(s, k));
    if (!skill) continue;
    const clauses = fold(s).split(/,|;|\s(?:et|mais|and|but)\s/);
    if (clauses.some(c => PRODUCTION.test(c) && !NOT_PRODUCTION.test(c))) {
      out.push(`« ${s} » laisse entendre ${skill} pratiqué en poste`);
    }
  }
  return out;
}

// Consignes du juge dans « Ajuster cette version » : une ligne marquée par ce
// préfixe vient du modèle, pas du candidat ; ses chiffres (repris de l'offre ou
// de la lettre fautive) ne deviennent jamais des chiffres permis.
export const JUDGE_MARK = 'Juge · ';

// Comparaison d'une citation au texte source, tolérante aux espaces, tirets,
// apostrophes et guillemets typographiques (juge de la lettre, signaux d'offre).
export function squash(text: string): string {
  return cleanDashes(text)
    .toLowerCase()
    .replace(/[’‘`]/g, '\'')
    .replace(/[«»“”]/g, '"')
    .replace(/[\s  ]+/g, ' ')
    .replace(/\s*([,.;:!?])\s*/g, '$1')
    .trim();
}

export function ownHint(hint: string): string {
  return hint.split('\n').filter(l => !l.trim().startsWith(JUDGE_MARK.trim())).join('\n');
}

// Chiffres autorisés dans une lettre : ceux de la base et du profil (et de ce
// que le candidat a écrit lui-même : note, consigne). PAS ceux de l'offre :
// "j'ai 5 ans d'expérience" ne doit pas passer parce que l'offre demande 5 ans.
export function allowedNumbers(base: FactBase | null, profile: UserProfile | null, candidateText: string): Set<string> {
  const pool = new Set<string>(extractNumbers(candidateText));
  if (base) {
    for (const f of allFacts(base)) for (const n of f.numbers) pool.add(n);
    for (const t of [base.summary.fr, base.summary.en, ...base.education.map(e => `${e.title.fr} ${e.detail?.fr ?? ''}`),
      ...base.certifications.map(e => e.title.fr), ...base.projects.map(e => `${e.title.fr} ${e.detail?.fr ?? ''}`)]) {
      for (const n of extractNumbers(t)) pool.add(n);
    }
  }
  if (profile) {
    for (const v of Object.values(profile)) if (typeof v === 'string') for (const n of extractNumbers(v)) pool.add(n);
  }
  return pool;
}

// Nombres écrits en lettres ("trois ans", "twelve people"). "un", "deux" et
// "neuf" (= nouveau) sont trop ambigus pour être contrôlés.
const NUMBER_WORDS: Record<string, string> = {
  trois: '3', quatre: '4', cinq: '5', six: '6', sept: '7', huit: '8', dix: '10', onze: '11', douze: '12',
  treize: '13', quatorze: '14', quinze: '15', seize: '16', vingt: '20', trente: '30', quarante: '40',
  cinquante: '50', soixante: '60', cent: '100', mille: '1000',
  three: '3', four: '4', five: '5', seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12',
  fifteen: '15', twenty: '20', thirty: '30', forty: '40', fifty: '50', hundred: '100', thousand: '1000',
};

export function inventedNumbers(text: string, allowed: Set<string>): string[] {
  const words = (fold(text).match(/[a-z]+/g) ?? [])
    .filter(w => NUMBER_WORDS[w] && !allowed.has(NUMBER_WORDS[w]));
  return [...extractNumbers(text).filter(n => !allowed.has(n)), ...new Set(words)];
}

// ── Schémas d'écriture : humain ou machine ────────────────────────────────────
// Mesures de forme, pas de liste de mots : un texte d'IA a des phrases de
// longueur régulière, des paragraphes de même taille, des débuts de phrase
// répétés, des énumérations par trois et beaucoup de noms abstraits. Un humain
// varie, raconte un détail, écrit des phrases courtes. Comparé, si on l'a, à
// l'échantillon d'écriture de l'utilisateur : c'est sa voix qui fait référence.

const words = (s: string) => s.match(/[\p{L}\d’'-]+/gu) ?? [];
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const stdev = (xs: number[]) => Math.sqrt(mean(xs.map(x => (x - mean(xs)) ** 2)));

export function styleSignals(letter: string, sample = ''): string[] {
  const paras = letter.split(/\n+/).map(p => p.trim()).filter(Boolean);
  // Corps de la lettre : sans salutation ni formule de fin (lignes courtes).
  const body = paras.filter(p => words(p).length > 6);
  const sents = sentences(body.join('\n')).filter(s => words(s).length > 1);
  if (sents.length < 5) return [];
  const out: string[] = [];
  const lens = sents.map(s => words(s).length);

  // Rythme : un humain varie la longueur de ses phrases. Le conseil ne pousse
  // jamais à découper : c'est ce qui produit le texte haché signalé plus bas.
  if (stdev(lens) / mean(lens) < 0.35) out.push('Toutes les phrases ont à peu près la même longueur : varie-les, en reliant deux idées liées dans une même phrase ou en laissant court un fait simple, sans découper une idée en morceaux.');
  // L'excès inverse, typique d'un texte "humanisé" à la machine : des phrases
  // courtes enchaînées par paires, hachées ("Elle a trouvé ses clients. Ses
  // fondations doivent tenir."). Une phrase courte isolée reste naturelle.
  let pairs = 0;
  for (let i = 1; i < lens.length; i++) if (lens[i] <= 8 && lens[i - 1] <= 8) { pairs++; i++; }
  if (pairs >= 2) out.push('Phrases courtes enchaînées à plusieurs endroits : le texte devient haché, relie-en certaines.');

  // Paragraphes calibrés : même nombre de phrases ou même longueur.
  const plens = body.map(p => words(p).length);
  if (body.length >= 3 && stdev(plens) / mean(plens) < 0.2) out.push('Les paragraphes ont tous la même taille : donne à chacun la place de ce qu\'il a à dire.');

  // Débuts de phrase : "Je… Je… Je…" ou le même mot trois fois de suite.
  const firsts = sents.map(s => fold(words(s)[0] ?? '').replace(/[’'].*$/, ''));
  for (let i = 2; i < firsts.length; i++) {
    if (firsts[i] && firsts[i] === firsts[i - 1] && firsts[i] === firsts[i - 2]) {
      out.push(`Trois phrases de suite commencent par « ${words(sents[i])[0]} » : varie les attaques.`);
      break;
    }
  }

  // Énumérations par trois ("X, Y et Z") répétées : réflexe de rédaction automatique.
  const triads = (body.join(' ').match(/\b[\p{L}’'-]+(?: [\p{L}’'-]+){0,2}, [\p{L}’'-]+(?: [\p{L}’'-]+){0,2},? (?:et|and) [\p{L}’'-]+/gu) ?? []).length;
  if (triads >= 2) out.push('Plusieurs énumérations par trois : garde la plus utile, raconte le reste autrement.');

  // Abstraction : trop de noms en -tion, -ment, -ité, -ance face aux verbes et aux faits.
  const ws = words(body.join(' ')).map(fold);
  const abstract = ws.filter(w => w.length > 6 && /(tion|ment|ite|ance|ence|isme|ure)s?$/.test(w)).length;
  if (ws.length > 80 && abstract / ws.length > 0.09) out.push('Beaucoup de noms abstraits (-tion, -ment, -ité) : remplace-les par ce qui s\'est passé, avec qui, pour quel résultat.');

  // Formule de mise en scène : "… : voilà …", phrase finale en deux-points.
  if (/:\s*(voil[aà]|c['’]est (ça|cela)|that['’]s (it|what))(?=[\s,.!]|$)/i.test(letter)) out.push('Tournure « … : voilà ce que… » : dis la chose directement.');

  // Comparaison avec la voix de l'utilisateur.
  const sampleSents = sentences(sample).filter(s => words(s).length > 1);
  if (sampleSents.length >= 3) {
    const own = mean(sampleSents.map(s => words(s).length));
    if (mean(lens) > own * 1.5) out.push(`Phrases bien plus longues que ta façon d'écrire (${Math.round(mean(lens))} mots en moyenne contre ${Math.round(own)}) : allège-les en retirant le superflu, sans les hacher.`);
  }
  return out;
}

// Mot porteur répété 3 fois ou plus ("tenir", "souhaite") : la lettre tourne
// en rond. Mots de 5 lettres et plus, hors noms propres et mots outils.
const COMMON = new Set(['votre', 'notre', 'cette', 'comme', 'entre', 'depuis', 'aussi', 'leurs', 'avoir', 'toute', 'toutes',
  'their', 'there', 'which', 'about', 'would', 'these', 'those', 'where', 'while', 'other']);
export function repeatedWords(text: string, vocabulary = ''): string[] {
  const body = text.split(/\n+/).slice(1).join(' '); // sans la salutation
  // Vocabulaire du métier (offre, parcours) : sa répétition est normale.
  const trade = new Set((fold(vocabulary).match(/[a-z]+/g) ?? []).map(w => w.replace(/[sx]$/, '')));
  const counts = new Map<string, number>();
  for (const raw of body.match(/[\p{L}’']+/gu) ?? []) {
    if (/^\p{Lu}/u.test(raw)) continue;
    const w = fold(raw).replace(/^[a-z][’']/, '').replace(/[sx]$/, '');
    if (w.length < 5 || COMMON.has(w) || trade.has(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts].filter(([, n]) => n >= 3).map(([w, n]) => `« ${w} » revient ${n} fois : varie ou reformule.`);
}

// Compétence de projet perso ou ajoutée pour l'offre citée dans la même phrase
// qu'un employeur : la lettre lui prête un usage professionnel.
export function weakSkillAtEmployer(text: string, weakSkills: string[], employers: string[]): string[] {
  const out: string[] = [];
  for (const s of sentences(text)) {
    const skill = weakSkills.find(k => mentions(s, k));
    const employer = skill && employers.find(e => e.length >= 2 && mentions(s, e));
    if (skill && employer) out.push(`« ${s} » associe ${skill} à ${employer}, où elle n'a pas été pratiquée : sépare-les.`);
  }
  return out;
}

// Années citées (1900-2099) : seulement celles du parcours, du profil ou de l'offre.
export function inventedYears(text: string, base: FactBase | null, profile: UserProfile | null, offer: string): string[] {
  const years = (s: string) => s.match(/\b(19|20)\d{2}\b/g) ?? [];
  const pool = new Set<string>(years(offer));
  if (base) {
    for (const e of base.experiences) {
      for (const d of [e.start, e.end ?? '']) years(d).forEach(y => pool.add(y));
      for (const f of e.groups.flatMap(g => g.facts)) years(`${f.text.fr} ${f.text.en}`).forEach(y => pool.add(y));
    }
    for (const x of [...base.education, ...base.certifications, ...base.projects]) {
      years(`${x.date} ${x.title.fr} ${x.detail?.fr ?? ''}`).forEach(y => pool.add(y));
    }
  }
  if (profile) for (const v of Object.values(profile)) if (typeof v === 'string') years(v).forEach(y => pool.add(y));
  return [...new Set(years(text))].filter(y => !pool.has(y));
}

// ── Contrôles de la lettre (en plus des consignes au modèle) ──────────────────

// Tics d'écriture d'IA les plus reconnaissables (règles du skill humanize).
const TICS: [RegExp, string][] = [
  [/pour moi,? l['’]important/i, '« Pour moi, l\'important »'],
  [/c['’]est exactement/i, '« c\'est exactement »'],
  [/ce n['’]est pas [^.]{1,60}, c['’]est/i, '« ce n\'est pas X, c\'est Y »'],
  [/\bpas (seulement|uniquement) [^.]{1,60}, mais/i, '« pas seulement X, mais Y »'],
  [/ce que je (recherche|cherche)[^.]{0,40}, c['’]est/i, '« ce que je recherche, c\'est »'],
  [/ce qui (compte|m['’]int[ée]resse|m['’]attire) (vraiment|le plus)?,? c['’]est/i, '« ce qui compte, c\'est »'],
  [/la vraie question/i, '« la vraie question »'],
  [/au c[œo]eur de/i, '« au cœur de »'],
  [/\b(it['’]s not|this is not) [^.]{1,60}, it['’]s\b/i, '« it\'s not X, it\'s Y »'],
  [/\bnot (just|only|merely) [^.]{1,60}, but\b/i, '« not just X, but Y »'],
  [/\bwhat (really )?(matters|counts)( most)?(,| is)/i, '« what matters is »'],
  [/\bwhat i('m| am) looking for[^.]{0,40}\bis\b/i, '« what I\'m looking for is »'],
  [/\bthe real question\b/i, '« the real question »'],
  [/\bat the (heart|core) of\b/i, '« at the heart of »'],
  [/\bthat['’]s exactly\b/i, '« that\'s exactly »'],
  [/\b(delve|tapestry|testament to)\b/i, 'mot typique d\'IA'],
];

export function letterTics(text: string): string[] {
  return TICS.filter(([re]) => re.test(text)).map(([, label]) => `Tic d'écriture : ${label}, à dire directement.`);
}

export function regretPhrases(text: string): string[] {
  return /j['’]aurais (aim[ée]|voulu|souhait[ée])|I would have (liked|loved|wanted)/i.test(text)
    ? ['Conditionnel passé ou regret (« j\'aurais aimé… ») : tourne-le vers l\'avenir.']
    : [];
}

// Note personnelle recopiée : six mots consécutifs identiques suffisent.
export function copiedNote(text: string, note: string): string[] {
  const words = (s: string) => fold(s).replace(/[^a-z0-9' ]/g, ' ').split(/\s+/).filter(Boolean);
  const n = words(note);
  if (n.length < 6) return [];
  const grams = new Set<string>();
  for (let i = 0; i + 6 <= n.length; i++) grams.add(n.slice(i, i + 6).join(' '));
  const t = words(text);
  for (let i = 0; i + 6 <= t.length; i++) {
    if (grams.has(t.slice(i, i + 6).join(' '))) return ['La note personnelle est recopiée telle quelle : reprends l\'idée avec d\'autres mots.'];
  }
  return [];
}

// Le poste actuel (expérience la plus récente) doit apparaître.
export function currentJobMissing(text: string, base: FactBase | null): string[] {
  if (!base?.experiences.length) return [];
  const current = [...base.experiences].sort((a, b) => (b.end ?? '9999').localeCompare(a.end ?? '9999') || b.start.localeCompare(a.start))[0];
  const company = current.company.split(/[,(|]/)[0].trim();
  const words = company.split(/\s+/).filter(w => w.length >= 3);
  const named = words.some(w => mentions(text, w)) || mentions(text, current.role.fr) || mentions(text, current.role.en);
  return named ? [] : [`Le poste actuel (${current.role.fr}, ${company}) n'apparaît pas : cite-le en une phrase reliée à l'offre.`];
}
