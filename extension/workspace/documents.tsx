// Latin + latin étendu suffisent au français et à l'anglais (œ, €…).
import '@fontsource/carlito/latin-400.css';
import '@fontsource/carlito/latin-700.css';
import '@fontsource/carlito/latin-400-italic.css';
import '@fontsource/carlito/latin-ext-400.css';
import '@fontsource/carlito/latin-ext-700.css';
import { forwardRef } from 'react';
import type { ContractKind, Entry, FactBase, LetterLang, TailoredCV } from '../types';
import { companyCore } from '../lib/factbase';

// Documents imprimables. Volontairement sobres et neutres (pas aux couleurs
// d'apply4me) : c'est le CV du candidat, pas une pub. Base de style validée :
// Carlito (équivalent métrique de Calibri), corps 9,3pt, nom 17pt, titres 9,6pt
// avec filet, marges 11 / 14 / 9 mm.

export const PAGE_W_MM = 210;
export const PAGE_H_MM = 297;
export const CV_MARGIN = { top: 11, right: 14, bottom: 9, left: 14 };
export const LETTER_MARGIN = { top: 22, right: 24, bottom: 20, left: 24 };
export const MM = 96 / 25.4; // px par mm à 96 dpi

const MONTHS: Record<LetterLang, string[]> = {
  fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};

function monthLabel(m: string, lang: LetterLang): string {
  const match = m.match(/^(\d{4})-(\d{2})$/);
  if (!match) return m;
  return `${MONTHS[lang][Number(match[2]) - 1]} ${match[1]}`;
}

const CONTRACT: Record<LetterLang, Record<ContractKind, string>> = {
  fr: { cdi: 'CDI', cdd: 'CDD', alternance: 'alternance', stage: 'stage', freelance: 'freelance', other: '' },
  en: { cdi: 'permanent contract', cdd: 'fixed-term contract', alternance: 'work-study', stage: 'internship', freelance: 'freelance', other: '' },
};

const H: Record<LetterLang, Record<string, string>> = {
  fr: { profile: 'Profil', exp: 'Expérience professionnelle', edu: 'Formation', cert: 'Certifications', skills: 'Compétences', projects: 'Projets personnels', now: "aujourd'hui" },
  en: { profile: 'Profile', exp: 'Experience', edu: 'Education', cert: 'Certifications', skills: 'Skills', projects: 'Side projects', now: 'present' },
};

export const docCSS = `
  .a4 {
    width: ${PAGE_W_MM}mm; height: ${PAGE_H_MM}mm; overflow: hidden;
    background: #fff; color: #1d1d1f; position: relative;
    font-family: 'Carlito', Calibri, 'Segoe UI', sans-serif;
  }
  .a4 .content { position: absolute; }
  .cv { font-size: 9.3pt; line-height: 1.2; }
  .cv .name { font-size: 17pt; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; line-height: 1.05; }
  .cv .headline { font-size: 10.5pt; font-weight: 700; color: #3a3a3c; margin-top: 0.5pt; }
  .cv .contact { font-size: 8.6pt; color: #48484a; margin-top: 2pt; line-height: 1.3; }
  .cv h2 {
    font-size: 9.6pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
    border-bottom: 0.8pt solid #8e8e93; padding-bottom: 1pt; margin: 5.5pt 0 2.5pt;
  }
  .cv p { margin: 0; }
  .cv .exp { margin-bottom: 3pt; }
  .cv .exp-head { display: flex; justify-content: space-between; gap: 8pt; }
  .cv .exp-head b { font-weight: 700; }
  .cv .exp-date { white-space: nowrap; color: #3a3a3c; }
  .cv .ctx { font-style: italic; color: #48484a; }
  .cv .group { font-weight: 700; font-size: 8.9pt; margin-top: 1.5pt; color: #2c2c2e; }
  .cv ul { margin: 0.5pt 0 0 0; padding-left: 11pt; }
  .cv li { margin: 0.3pt 0; padding-left: 1pt; }
  .cv .line { margin: 0.6pt 0; }
  .cv .stretch { background: #FBE3C2; border-radius: 2pt; box-shadow: 0 0 0 1pt #FBE3C2; }
  .letter { font-size: 11pt; line-height: 1.5; }
  .letter .sender b { font-size: 13pt; }
  .letter .sender { color: #3a3a3c; font-size: 9.5pt; line-height: 1.4; }
  .letter .date { text-align: right; margin: 18pt 0 14pt; color: #3a3a3c; }
  .letter .subject { font-weight: 700; margin-bottom: 14pt; }
  /* Aligné à gauche, sans césure : les mots coupés en fin de ligne font amateur dans une lettre. */
  .letter .body p { margin: 0 0 8pt; text-align: left; hyphens: manual; }
  .letter .sign { margin-top: 6pt; font-weight: 700; }
  @media print {
    .cv .stretch { background: none; box-shadow: none; }
  }
`;

function dateRange(start: string, end: string | null, lang: LetterLang): string {
  return `${monthLabel(start, lang)} – ${end ? monthLabel(end, lang) : H[lang].now}`;
}

function entryLine(e: Entry, lang: LetterLang): string {
  const date = /^\d{4}-\d{2}$/.test(e.date) ? monthLabel(e.date, lang) : e.date;
  return date ? `${e.title[lang]} | ${date}` : e.title[lang];
}

export interface CvLayout {
  dropped: Set<string>;     // faits retirés pour tenir sur une page
  hideProjects: boolean;
  skillCap: number | null;  // nombre max d'éléments par ligne de compétences
}

export const CvDocument = forwardRef<HTMLDivElement, {
  base: FactBase;
  cv: TailoredCV;
  layout: CvLayout;
  highlight: boolean;
}>(function CvDocument({ base, cv, layout, highlight }, ref) {
  const L = cv.lang;
  const m = CV_MARGIN;
  return (
    <div className="a4 cv">
      <div ref={ref} className="content" style={{ top: `${m.top}mm`, left: `${m.left}mm`, right: `${m.right}mm` }}>
        <div className="name">{base.identity.name}</div>
        <div className="headline">{cv.headline}</div>
        <div className="contact">
          {base.identity.contact[L]}<br />
          {[...base.identity.links, base.identity.languages[L]].filter(Boolean).join(' · ')}
        </div>

        <h2>{H[L].profile}</h2>
        <p>{cv.summary}</p>

        <h2>{H[L].exp}</h2>
        {base.experiences.map(exp => {
          const tailored = cv.experiences.find(t => t.id === exp.id);
          if (!tailored) return null;
          const kept = tailored.facts.filter(f => !layout.dropped.has(f.id));
          const contract = CONTRACT[L][exp.contract];
          // Les groupes gardent leur intitulé ; ils sont ordonnés par leur fait
          // le plus pertinent pour cette offre.
          const groups = exp.groups
            .map(g => {
              const facts = kept.filter(f => g.facts.some(x => x.id === f.id));
              return { title: g.title, facts, best: Math.max(0, ...facts.map(f => f.relevance)) };
            })
            .filter(g => g.facts.length)
            .sort((a, b) => b.best - a.best);
          return (
            <div className="exp" key={exp.id}>
              <div className="exp-head">
                <span>
                  <b>{exp.role[L]}</b>, {exp.company}{exp.location ? `, ${exp.location}` : ''}{contract ? ` (${contract})` : ''}
                </span>
                <span className="exp-date">{dateRange(exp.start, exp.end, L)}</span>
              </div>
              {exp.context && <div className="ctx">{exp.context[L]}</div>}
              {groups.map((g, i) => (
                <div key={i}>
                  {g.title && groups.length > 1 && <div className="group">{g.title[L]}</div>}
                  <ul>{g.facts.map(f => <li key={f.id}>{f.text}</li>)}</ul>
                </div>
              ))}
            </div>
          );
        })}

        {base.education.length > 0 && <>
          <h2>{H[L].edu}</h2>
          {base.education.map(e => (
            <div key={e.id} className="line">
              <b>{entryLine(e, L)}</b>{e.detail ? <><br />{e.detail[L]}</> : null}
            </div>
          ))}
        </>}

        {base.certifications.length > 0 && <>
          <h2>{H[L].cert}</h2>
          {base.certifications.map(e => (
            <div key={e.id} className="line">
              {entryLine(e, L)}{e.detail ? ` (${e.detail[L]})` : ''}
            </div>
          ))}
        </>}

        <h2>{H[L].skills}</h2>
        {cv.skills.map(line => {
          // Raccourcir ne retire que les compétences non protégées, en partant
          // de la fin (les moins utiles pour l'offre) ; l'ordre est conservé.
          const cap = layout.skillCap;
          const removable = cap ? Math.max(0, line.items.length - cap) : 0;
          const optional = line.items.filter(it => !it.keep);
          const dropped = new Set(removable ? optional.slice(Math.max(0, optional.length - removable)).map(it => it.name) : []);
          const items = line.items.filter(it => !dropped.has(it.name));
          return (
            <div key={line.group} className="line">
              <b>{line.label} :</b>{' '}
              {items.map((it, i) => (
                <span key={it.name}>
                  <span className={it.stretch && highlight ? 'stretch' : undefined}>{it.name}</span>
                  {i < items.length - 1 ? ', ' : ''}
                </span>
              ))}
            </div>
          );
        })}

        {base.projects.length > 0 && !layout.hideProjects && <>
          <h2>{H[L].projects}</h2>
          <p>{base.projects.map(p => (p.detail ? `${p.title[L]} : ${p.detail[L]}` : p.title[L])).join(' · ')}</p>
        </>}
      </div>
    </div>
  );
});

export function todayLabel(lang: LetterLang, d = new Date()): string {
  return lang === 'fr'
    ? `Le ${d.getDate()} ${MONTHS.fr[d.getMonth()]} ${d.getFullYear()}`
    : `${MONTHS.en[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// Intitulé du poste sans le nom de l'entreprise, que les pages d'offre mettent
// souvent dans le titre ("Ubisoft Web Tools Programmer") : l'objet l'ajoute déjà.
export function jobTitle(title: string, company: string): string {
  // Tirets longs remplacés d'abord : "Développeur — Acme" devient "Développeur - Acme".
  let t = title.replace(/\s*[—–]\s*/g, ' - ').trim();
  const name = company.split(/[,(|]/)[0].trim();
  // Nom complet, puis nom sans mot générique ("Groupe Ubisoft" → "Ubisoft") :
  // jamais un mot courant seul, "Chef de groupe produit" reste intact.
  for (const n of [name, companyCore(company)].filter(x => x.length >= 3)) {
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp(`(^|\\s)(chez |at |@ ?)?${esc}(?=\\s|$|[,:|-])`, 'gi'), ' ');
  }
  return t.replace(/(\s*[,:|-]\s*)+$/, '').replace(/^(\s*[,:|-]\s*)+/, '').replace(/\s{2,}/g, ' ').trim();
}

export function LetterDocument({ base, letter, lang, title, company }: {
  base: FactBase | null;
  letter: string;
  lang: LetterLang;
  title: string;
  company: string;
}) {
  const m = LETTER_MARGIN;
  const paras = letter.split(/\n+/).map(p => p.trim()).filter(Boolean);
  const role = jobTitle(title, company);
  const subject = role
    ? (lang === 'fr'
        ? `Objet : candidature au poste ${/^[aeiouyhàâéèêëîïôöùûü]/i.test(role) ? "d'" : 'de '}${role}`
        : `Application for ${role}`)
    : '';
  return (
    <div className="a4 letter">
      <div className="content" style={{ top: `${m.top}mm`, left: `${m.left}mm`, right: `${m.right}mm` }}>
        {base && (
          <div className="sender">
            <b>{base.identity.name}</b><br />
            {base.identity.contact[lang]}
          </div>
        )}
        <div className="date">{todayLabel(lang)}</div>
        {subject && <div className="subject">{subject}{company ? (lang === 'fr' ? `, ${company}` : ` at ${company}`) : ''}</div>}
        <div className="body">{paras.map((p, i) => <p key={i}>{p}</p>)}</div>
        {base && <div className="sign">{base.identity.name}</div>}
      </div>
    </div>
  );
}
