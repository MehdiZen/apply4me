import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowLineDown, ArrowSquareOut, ArrowsClockwise, BookOpenText, CheckCircle, CircleNotch,
  ChatText, Copy, DownloadSimple, Eye, EyeSlash, FileText, Gavel, MagicWand, NotePencil, PaperPlaneTilt, Warning,
} from '@phosphor-icons/react';
import type {
  ApplicationStatus, FactBase, FillResponse, InterviewPrep, Job, LetterLang, LetterReview, PrepItem, ReviewPersona, TailoredCV, UserProfile,
} from '../types';
import { getFactBase, getProfile, sessionGet, sessionSet } from '../lib/storage';
import { tailorCV } from '../lib/tailor';
import { writeCheckedLetter, writeOutreachMessage } from '../lib/llm';
import { interviewPrep, prepSheet } from '../lib/prep';
import { polishLetter, reviewLetter, reviewToHint, type PolishStep } from '../lib/review';
import { setStatus, STATUS_LABEL, upsertFromJob } from '../lib/log';
import { fileSafe, saveCurrentPageAsPDF } from '../lib/pdf';
import { Brand, C, ScoreRing, globalCSS } from '../ui/theme';
import {
  CV_MARGIN, CvDocument, LetterDocument, MM, PAGE_H_MM, docCSS, type CvLayout,
} from './documents';

// Espace candidature : un onglet dédié (il ne se ferme pas tout seul comme le
// popup), qui génère CV + lettre + fiche en parallèle et permet de tout
// relire, corriger et exporter.

interface Work {
  cv: TailoredCV | null;
  letter: string;
  letterIssues: string[];
  review: LetterReview | null;  // jugement de la lettre (à la demande), effacé quand elle est régénérée
  reviewOf: string;             // texte jugé : une retouche depuis rend le jugement caduc
  prep: PrepItem[];
  interview: InterviewPrep | null;
  message: string;              // message court à la personne qui recrute (à la demande)
  messageIssues: string[];
  appId: string | null;
  note: string;
}

const EMPTY_WORK: Work = { cv: null, letter: '', letterIssues: [], review: null, reviewOf: '', prep: [], interview: null, message: '', messageIssues: [], appId: null, note: '' };

type TaskState = 'idle' | 'running' | 'done' | 'error';
type Doc = 'cv' | 'letter';
type Side = 'letter' | 'message' | 'prep' | 'app';

const PERSONAS: { value: ReviewPersona; label: string }[] = [
  { value: 'panel', label: 'Tous les regards' },
  { value: 'recruiter', label: 'RH (premier tri)' },
  { value: 'manager', label: 'Futur manager' },
  { value: 'editor', label: 'Rédacteur' },
];

const REGEN_CHIPS = [
  { label: 'Plus courte', phrase: 'Sois plus court, va à l\'essentiel.' },
  { label: 'Moins formel', phrase: 'Adopte un ton moins formel, plus naturel.' },
  { label: 'Plus chaleureux', phrase: 'Sois plus chaleureux et humain dans le ton.' },
  { label: 'Le « pourquoi vous » est faible', phrase: 'Le paragraphe "pourquoi cette entreprise" ne convainc pas, trouve un angle plus fort et plus spécifique.' },
];

const STATUSES: ApplicationStatus[] = ['generated', 'sent', 'interview', 'rejected', 'offer'];

const EMPTY_LAYOUT: CvLayout = { dropped: new Set(), hideProjects: false, skillCap: null };

const workKey = (id: string) => `work:${id}`;

function App() {
  const jobId = new URLSearchParams(location.search).get('job') ?? '';
  const [job, setJob] = useState<Job | null>(null);
  const [base, setBase] = useState<FactBase | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [work, setWork] = useState<Work>(EMPTY_WORK);
  const [tasks, setTasks] = useState<Record<'cv' | 'letter' | 'prep' | 'message' | 'review', TaskState>>({ cv: 'idle', letter: 'idle', prep: 'idle', message: 'idle', review: 'idle' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [missing, setMissing] = useState(false);
  const [doc, setDoc] = useState<Doc>('cv');
  const [side, setSide] = useState<Side>('letter');
  const [layout, setLayout] = useState<CvLayout>(EMPTY_LAYOUT);
  const [fontsReady, setFontsReady] = useState(false);
  const [highlight, setHighlight] = useState(true);
  const [hint, setHint] = useState('');
  const [persona, setPersona] = useState<ReviewPersona>('panel');
  const [polishing, setPolishing] = useState('');  // étape du peaufinage en cours, '' sinon
  // Colonne des relecteurs : sur l'onglet Lettre, pendant ou après un jugement.
  const showReview = side === 'letter' && (!!work.review || tasks.review === 'running');
  const [status, setStatusState] = useState<ApplicationStatus>('generated');
  const [toast, setToast] = useState('');
  const [printing, setPrinting] = useState<Doc | null>(null);
  const cvRef = useRef<HTMLDivElement>(null);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2600);
  }, []);

  const [overflow, setOverflow] = useState(false);

  const persist = useCallback((next: Work) => {
    setWork(next);
    sessionSet(workKey(jobId), next);
  }, [jobId]);

  // Fusion d'un résultat dans l'état le plus récent, enregistrée tout de suite :
  // un CV terminé n'est pas perdu si l'onglet se ferme avant la lettre.
  const merge = useCallback((patch: Partial<Work>) => {
    setWork(prev => {
      const next = { ...prev, ...patch };
      sessionSet(workKey(jobId), next);
      return next;
    });
  }, [jobId]);

  useEffect(() => { document.fonts.ready.then(() => setFontsReady(true)); }, []);

  // ── Génération ──────────────────────────────────────────────────────────────
  const runCV = useCallback(async (j: Job, b: FactBase, lang: LetterLang) => {
    setTasks(t => ({ ...t, cv: 'running' }));
    try {
      const cv = await tailorCV(j.offer, j.analysis, b, lang, j.stretch);
      setLayout({ dropped: new Set(), hideProjects: false, skillCap: null });
      setTasks(t => ({ ...t, cv: 'done' }));
      return cv;
    } catch (e) {
      setErrors(er => ({ ...er, cv: e instanceof Error ? e.message : 'Échec' }));
      setTasks(t => ({ ...t, cv: 'error' }));
      return null;
    }
  }, []);

  const runLetter = useCallback(async (j: Job, b: FactBase, p: UserProfile, lang: LetterLang, note: string, regenHint?: string, previous?: string) => {
    setTasks(t => ({ ...t, letter: 'running' }));
    try {
      const res = await writeCheckedLetter(j.offer, p, lang, note, regenHint, b, j.stretch,
        { company: j.analysis.company, recruiter: j.analysis.recruiter, formerEmployer: j.analysis.formerEmployer, brief: j.analysis.brief, previous, priorities: j.analysis.requirements });
      setTasks(t => ({ ...t, letter: 'done' }));
      return res;
    } catch (e) {
      setErrors(er => ({ ...er, letter: e instanceof Error ? e.message : 'Échec' }));
      setTasks(t => ({ ...t, letter: 'error' }));
      return null;
    }
  }, []);

  // Révision : questions probables sur le parcours, l'entreprise et les
  // ajouts cochés. Modèle rapide, en même temps que le CV et la lettre.
  const runPrep = useCallback(async (j: Job, b: FactBase, lang: LetterLang) => {
    setTasks(t => ({ ...t, prep: 'running' }));
    setErrors(er => ({ ...er, prep: '' }));
    try {
      const [items, interview] = await Promise.all([prepSheet(j.stretch, j.offer, lang), interviewPrep(j.offer, j.analysis, b, lang)]);
      setTasks(t => ({ ...t, prep: 'done' }));
      return { items, interview };
    } catch (e) {
      setErrors(er => ({ ...er, prep: e instanceof Error ? e.message : 'Échec' }));
      setTasks(t => ({ ...t, prep: 'error' }));
      return { items: [] as PrepItem[], interview: null };
    }
  }, []);

  const generateAll = useCallback(async (j: Job, b: FactBase, p: UserProfile, note: string) => {
    merge({ note });
    const [, , prep] = await Promise.all([
      runCV(j, b, j.lang).then(cv => { if (cv) merge({ cv }); }),
      runLetter(j, b, p, j.lang, note).then(l => { if (l) merge({ letter: l.letter, letterIssues: l.issues, review: null }); }),
      runPrep(j, b, j.lang).then(r => { merge({ prep: r.items, interview: r.interview }); return r.items; }),
    ]);
    const app = await upsertFromJob(j, prep);
    setStatusState(app.status);
    merge({ appId: app.id });
  }, [runCV, runLetter, runPrep, merge]);

  useEffect(() => {
    (async () => {
      const [j, b, p] = await Promise.all([sessionGet<Job>(`job:${jobId}`), getFactBase(), getProfile()]);
      if (!j || !b || !p) { setMissing(true); return; }
      setJob(j); setBase(b); setProfile(p);
      document.title = `${j.analysis.title || 'Candidature'} · apply4me`;
      const saved = await sessionGet<Work>(workKey(jobId));
      if (saved) {
        setWork({ ...EMPTY_WORK, ...saved });
        // Ce qui manque à la reprise n'est pas "en cours" : la génération a été
        // interrompue (onglet fermé, échec). On le dit, avec un bouton Réessayer.
        const lost = 'Génération interrompue ou échouée : relance-la.';
        const state = (ok: boolean): TaskState => (ok ? 'done' : 'error');
        const prepOk = !!saved.interview && (!j.stretch.length || saved.prep.length > 0);
        setTasks({ cv: state(!!saved.cv), letter: state(!!saved.letter), prep: state(prepOk), message: saved.message ? 'done' : 'idle', review: 'idle' });
        setErrors({
          ...(saved.cv ? {} : { cv: lost }),
          ...(saved.letter ? {} : { letter: lost }),
          ...(prepOk ? {} : { prep: lost }),
        });
        return;
      }
      generateAll(j, b, p, '');
    })();
  }, [jobId, generateAll]);

  // La base et le profil peuvent changer dans les options pendant que l'onglet
  // est ouvert : les régénérations doivent partir de la version enregistrée.
  useEffect(() => {
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local') return;
      if ('factBase' in changes) getFactBase().then(b => { if (b) setBase(b); });
      if ('profile' in changes) getProfile().then(p => { if (p) setProfile(p); });
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  // ── Ajustement à une page ───────────────────────────────────────────────────
  // On retire d'abord les faits peu pertinents, puis les projets, puis on
  // raccourcit les lignes de compétences. Jamais de police réduite.
  useLayoutEffect(() => {
    const el = cvRef.current;
    if (!work.cv || !el || !fontsReady) return;
    const limit = (PAGE_H_MM - CV_MARGIN.top - CV_MARGIN.bottom) * MM;
    if (el.offsetHeight <= limit) { setOverflow(false); return; }

    const candidates = work.cv.experiences.flatMap((e, ei) => {
      const kept = e.facts.filter(f => !layout.dropped.has(f.id));
      if (kept.length <= 1) return [];
      return kept.map((f, fi) => ({ id: f.id, rel: f.relevance, ei, fi }));
    }).sort((a, b) => a.rel - b.rel || b.ei - a.ei || b.fi - a.fi);

    const dropFact = (id: string) => setLayout(l => ({ ...l, dropped: new Set([...l.dropped, id]) }));
    if (candidates.length && candidates[0].rel <= 2) dropFact(candidates[0].id);
    else if (!layout.hideProjects) setLayout(l => ({ ...l, hideProjects: true }));
    else if (candidates.length) dropFact(candidates[0].id);
    else if ((layout.skillCap ?? 16) > 6) setLayout(l => ({ ...l, skillCap: (l.skillCap ?? 16) - 2 }));
    // Plus rien à retirer sans toucher à l'essentiel : on le dit au lieu de
    // laisser la page couper le texte en silence.
    else setOverflow(true);
  }, [work.cv, layout, fontsReady]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const regenLetter = useCallback(async (regenHint?: string) => {
    if (!job || !base || !profile) return;
    setErrors(er => ({ ...er, letter: '', review: '' }));
    // Une consigne ajuste la version affichée : le rédacteur la reçoit.
    const res = await runLetter(job, base, profile, job.lang, work.note, regenHint, regenHint?.trim() ? work.letter : undefined);
    if (res) merge({ letter: res.letter, letterIssues: res.issues, review: null });
    setHint('');
  }, [job, base, profile, work.note, work.letter, runLetter, merge]);

  // Message court à la personne qui recrute : à la demande, la lettre reste
  // l'envoi par défaut quand le formulaire en demande une.
  const genMessage = useCallback(async () => {
    if (!job || !base || !profile) return;
    setTasks(t => ({ ...t, message: 'running' }));
    setErrors(er => ({ ...er, message: '' }));
    try {
      const a = job.analysis;
      const res = await writeOutreachMessage(job.offer, profile, job.lang, base, a.title,
        { company: a.company, recruiter: a.recruiter, formerEmployer: a.formerEmployer, brief: a.brief, note: work.note });
      merge({ message: res.message, messageIssues: res.issues });
      setTasks(t => ({ ...t, message: 'done' }));
    } catch (e) {
      setErrors(er => ({ ...er, message: e instanceof Error ? e.message : 'Échec' }));
      setTasks(t => ({ ...t, message: 'error' }));
    }
  }, [job, base, profile, work.note, merge]);

  // Juge : relit la lettre affichée (y compris tes retouches) au regard de
  // l'offre et de ta base ; ses consignes vont dans « Ajuster cette version ».
  const judgeLetter = useCallback(async () => {
    if (!job || !base || !work.letter.trim()) return;
    setTasks(t => ({ ...t, review: 'running' }));
    setErrors(er => ({ ...er, review: '' }));
    try {
      const judged = work.letter;
      const review = await reviewLetter(judged, job.offer, job.analysis, base, job.lang, profile?.writingSample ?? '', persona);
      merge({ review, reviewOf: judged });
      setTasks(t => ({ ...t, review: 'done' }));
    } catch (e) {
      setErrors(er => ({ ...er, review: `Jugement échoué : ${e instanceof Error ? e.message : 'Échec'}` }));
      setTasks(t => ({ ...t, review: 'error' }));
    }
  }, [job, base, profile, work.letter, persona, merge]);

  // Peaufinage : juger, corriger, rejuger, sans intervention ; borné (2
  // corrections) et rend la meilleure version vue. La lettre est verrouillée
  // pendant ce temps pour qu'aucune retouche ne soit écrasée.
  const polish = useCallback(async () => {
    if (!job || !base || !profile || !work.letter.trim()) return;
    const step = (s: PolishStep) => setPolishing(s.kind === 'judge'
      ? (s.round ? `Nouveau jugement (${s.round}/${s.of})…` : 'Jugement…')
      : `Correction ${s.round}/${s.of}…`);
    setTasks(t => ({ ...t, letter: 'running', review: 'running' }));
    setErrors(er => ({ ...er, letter: '', review: '' }));
    try {
      const res = await polishLetter({
        letter: work.letter, offer: job.offer, analysis: job.analysis,
        base, profile, lang: job.lang, note: work.note, hint, stretch: job.stretch,
      }, 2, step);
      merge({ letter: res.letter, letterIssues: res.issues, review: res.review, reviewOf: res.letter });
      if (res.interrupted) setErrors(er => ({ ...er, review: `Peaufinage interrompu (${res.interrupted}) : meilleure version obtenue gardée.` }));
      else flash(res.letter !== work.letter
        ? `Lettre peaufinée (${res.rounds} correction${res.rounds > 1 ? 's' : ''})`
        : res.rounds ? "Les corrections n'ont rien amélioré : version d'origine gardée"
        : res.review.verdict === 'send' ? "Le juge l'enverrait telle quelle"
        : 'Aucune consigne exploitable : relance ou ajuste à la main');
      setTasks(t => ({ ...t, letter: 'done', review: 'done' }));
    } catch (e) {
      // Échec avant tout résultat (premier jugement) : la lettre n'a pas bougé.
      setErrors(er => ({ ...er, review: `Peaufinage échoué : ${e instanceof Error ? e.message : 'Échec'}` }));
      setTasks(t => ({ ...t, letter: 'done', review: 'error' }));
    } finally {
      setPolishing('');
    }
  }, [job, base, profile, work.letter, work.note, hint, merge, flash]);

  const regenPrep = useCallback(async () => {
    if (!job || !base) return;
    const r = await runPrep(job, base, job.lang);
    merge({ prep: r.items, interview: r.interview });
  }, [job, base, runPrep, merge]);

  const regenCV = useCallback(async () => {
    if (!job || !base) return;
    setErrors(er => ({ ...er, cv: '' }));
    const cv = await runCV(job, base, job.lang);
    if (cv) merge({ cv });
  }, [job, base, runCV, merge]);

  const switchLang = useCallback(async () => {
    if (!job || !base || !profile) return;
    const from = job.lang;
    const lang: LetterLang = from === 'fr' ? 'en' : 'fr';
    const next = { ...job, lang };
    const [cv, letter] = await Promise.all([runCV(next, base, lang), runLetter(next, base, profile, lang, work.note)]);
    if (!cv && !letter) { flash('Bascule de langue échouée : rien n\'a changé.'); return; }
    setJob(next);
    await sessionSet(`job:${jobId}`, next);
    merge({ ...(cv ? { cv } : {}), ...(letter ? { letter: letter.letter, letterIssues: letter.issues, review: null } : {}) });
    // Une moitié ratée : le document concerné est resté dans l'ancienne langue.
    if (!cv) flash(`Le CV n'a pas pu être traduit : il est resté en ${from.toUpperCase()}.`);
    if (!letter) flash(`La lettre n'a pas pu être traduite : elle est restée en ${from.toUpperCase()}.`);
  }, [job, base, profile, work.note, jobId, runCV, runLetter, merge, flash]);

  const exportPDF = useCallback(async (which: Doc) => {
    if (!job || !base) return;
    setPrinting(which);
    document.body.dataset.print = which;
    const who = fileSafe(base.identity.name) || 'Candidat';
    const where = fileSafe(job.analysis.company) || 'offre';
    const name = which === 'cv' ? `CV_${who}_${where}.pdf` : `Lettre_${who}_${where}.pdf`;
    try {
      const mode = await saveCurrentPageAsPDF(name);
      if (mode === 'pdf') flash(`${name} téléchargé`);
    } finally {
      delete document.body.dataset.print;
      setPrinting(null);
    }
  }, [job, base, flash]);

  const insertLetter = useCallback(async () => {
    if (!job?.tabId) { flash('Onglet de l\'offre introuvable : copie la lettre.'); return; }
    try {
      // L'onglet a pu changer de site depuis (messagerie, autre offre) : la
      // lettre n'est insérée que sur le site de l'offre.
      const tab = await chrome.tabs.get(job.tabId);
      const origin = (u?: string) => { try { return u ? new URL(u).origin : ''; } catch { return ''; } };
      if (tab.url && job.url && origin(tab.url) !== origin(job.url)) {
        flash('L\'onglet de l\'offre affiche un autre site : copie la lettre.');
        return;
      }
      const res = await chrome.tabs.sendMessage(job.tabId, { type: 'FILL_TEXTAREA', text: work.letter }) as FillResponse | undefined;
      flash(res?.ok ? 'Lettre insérée dans le formulaire' : res?.error ?? 'Insertion impossible');
    } catch {
      flash('Onglet de l\'offre fermé : copie la lettre.');
    }
  }, [job, work.letter, flash]);

  const changeStatus = useCallback(async (s: ApplicationStatus) => {
    if (!work.appId) return;
    setStatusState(s);
    await setStatus(work.appId, s);
  }, [work.appId]);

  // ── Rendu ───────────────────────────────────────────────────────────────────
  if (missing) {
    return (
      <Centered>
        <Brand size={36} />
        <p style={{ color: C.muted, fontSize: 14, maxWidth: 380, textAlign: 'center', lineHeight: 1.6 }}>
          Cette candidature n'existe plus (le navigateur a été fermé depuis). Rouvre l'offre et relance apply4me depuis l'extension.
        </p>
      </Centered>
    );
  }
  if (!job || !base) return <Centered><CircleNotch size={22} color={C.accent} style={{ animation: 'spin .8s linear infinite' }} /></Centered>;

  const m = job.match;
  const tone = m.verdict === 'skip' ? 'bad' : m.score >= 70 ? 'good' : 'mid';
  const droppedCount = layout.dropped.size;
  const busy = Object.values(tasks).some(t => t === 'running');

  return (
    <>
      <style>{globalCSS + docCSS + pageCSS}</style>

      <div className="screen">
        {/* Barre du haut */}
        <header style={{
          position: 'sticky', top: 0, zIndex: 5, background: 'rgba(251,245,236,0.92)', backdropFilter: 'blur(10px)',
          borderBottom: `1px solid ${C.border}`, padding: '12px 28px',
          display: 'flex', alignItems: 'center', gap: 18,
        }}>
          <Brand size={30} />
          <div style={{ width: 1, height: 28, background: C.border }} />
          <ScoreRing score={m.score} tone={tone} size={40} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: C.display, fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {job.analysis.title || 'Candidature'}
            </div>
            <div style={{ fontSize: 12, color: C.muted }}>
              {job.analysis.company || 'Entreprise non détectée'}{job.forced ? ' · candidature forcée' : ''}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          {busy && <Pill tone="honey"><CircleNotch size={12} style={{ animation: 'spin .8s linear infinite' }} /> Rédaction en cours</Pill>}
          <Btn onClick={switchLang} disabled={busy} variant="ghost">
            {job.lang === 'fr' ? 'FR' : 'EN'} → {job.lang === 'fr' ? 'EN' : 'FR'}
          </Btn>
          {job.url && (
            <Btn onClick={() => window.open(job.url, '_blank')} variant="ghost"><ArrowSquareOut size={14} /> Offre</Btn>
          )}
        </header>

        <main style={{
          display: 'grid', gap: 28, padding: '24px 28px 60px', margin: '0 auto',
          // Jugement de la lettre : une colonne de plus à droite, lisible sans
          // faire défiler le panneau de la lettre.
          gridTemplateColumns: showReview ? 'minmax(0, 1fr) 400px 380px' : 'minmax(0, 1fr) 400px',
          maxWidth: showReview ? 1720 : 1320,
        }}>
          {/* Aperçu */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Segmented
                value={doc}
                onChange={v => setDoc(v as Doc)}
                options={[{ value: 'cv', label: 'CV', icon: <FileText size={14} /> }, { value: 'letter', label: 'Lettre', icon: <NotePencil size={14} /> }]}
              />
              <div style={{ flex: 1 }} />
              {doc === 'cv' && job.stretch.length > 0 && (
                <Btn onClick={() => setHighlight(h => !h)} variant="ghost">
                  {highlight ? <EyeSlash size={14} /> : <Eye size={14} />} {highlight ? 'Masquer' : 'Voir'} les ajouts
                </Btn>
              )}
              {doc === 'cv'
                ? <Btn onClick={() => exportPDF('cv')} variant="primary" disabled={!work.cv} loading={printing === 'cv'}><DownloadSimple size={14} weight="bold" /> CV en PDF</Btn>
                : <Btn onClick={() => exportPDF('letter')} variant="primary" disabled={!work.letter} loading={printing === 'letter'}><DownloadSimple size={14} weight="bold" /> Lettre en PDF</Btn>}
            </div>

            {/* Échec d'une régénération alors qu'une version existe déjà : la
                version affichée est l'ancienne, on le dit. */}
            {((doc === 'cv' && work.cv && errors.cv) || (doc === 'letter' && work.letter && errors.letter)) && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: C.brickFg, background: C.brick, padding: '9px 12px', borderRadius: 12, marginBottom: 12 }}>
                <Warning size={15} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1 }}>Dernière génération échouée ({doc === 'cv' ? errors.cv : errors.letter}). La version affichée est la précédente.</span>
                <button onClick={() => (doc === 'cv' ? regenCV() : regenLetter())} style={linkBtn}>Réessayer</button>
              </div>
            )}
            {doc === 'cv' && overflow && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: C.honeyFg, background: C.accentDim, padding: '9px 12px', borderRadius: 12, marginBottom: 12 }}>
                <Warning size={15} style={{ flexShrink: 0 }} />
                Le CV dépasse encore une page : le bas serait coupé dans le PDF. Raccourcis un point dans ta base de faits ou régénère.
              </div>
            )}

            <Paper>
              {doc === 'cv'
                ? (work.cv
                    ? <CvDocument ref={cvRef} base={base} cv={work.cv} layout={layout} highlight={highlight} />
                    : <Placeholder state={tasks.cv} error={errors.cv} label="Adaptation du CV à l'offre" onRetry={regenCV} />)
                : (work.letter
                    ? <LetterDocument base={base} letter={work.letter} lang={job.lang} title={job.analysis.title} company={job.analysis.company} />
                    : <Placeholder state={tasks.letter} error={errors.letter} label="Rédaction de la lettre" onRetry={() => regenLetter()} />)}
            </Paper>

            {doc === 'cv' && work.cv && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14, fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
                {job.stretch.length > 0 && (
                  <span><span style={{ background: '#FBE3C2', padding: '0 4px', borderRadius: 3, color: C.text }}>Surligné</span> : ajouts cochés ({job.stretch.join(', ')}). Le surlignage n'apparaît pas dans le PDF.</span>
                )}
                {droppedCount > 0 && <span>{droppedCount} point{droppedCount > 1 ? 's' : ''} retiré{droppedCount > 1 ? 's' : ''} pour tenir sur une page (les moins utiles pour cette offre).</span>}
                {work.cv.warnings.map((w, i) => <span key={i}>Garde-fou : {w}.</span>)}
                <span>
                  <button onClick={regenCV} disabled={busy} style={linkBtn}>Régénérer le CV</button>
                </span>
              </div>
            )}
          </section>

          {/* Panneau latéral */}
          <aside style={{ position: 'sticky', top: 88, alignSelf: 'start', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Segmented
              value={side}
              onChange={v => setSide(v as Side)}
              options={[
                { value: 'letter', label: 'Lettre', icon: <NotePencil size={14} /> },
                { value: 'message', label: 'Message', icon: <ChatText size={14} /> },
                { value: 'prep', label: 'Entretien', icon: <BookOpenText size={14} /> },
                { value: 'app', label: 'Suivi', icon: <PaperPlaneTilt size={14} /> },
              ]}
              full
            />

            {side === 'letter' && (
              <Card>
                {tasks.letter === 'running' && !work.letter
                  ? <Skeleton lines={9} />
                  : (
                    <textarea
                      value={work.letter}
                      onChange={e => persist({ ...work, letter: e.target.value })}
                      readOnly={!!polishing}
                      rows={16}
                      style={{
                        width: '100%', border: 'none', outline: 'none', resize: 'vertical', background: 'transparent',
                        fontSize: 13, lineHeight: 1.65, color: C.text, minHeight: 300,
                      }}
                    />
                  )}
                {errors.letter && (
                  <div style={{ display: 'flex', gap: 6, fontSize: 11.5, color: C.brickFg, background: C.brick, padding: '8px 10px', borderRadius: 10, marginTop: 8 }}>
                    <Warning size={14} style={{ flexShrink: 0 }} />
                    <span>Génération de la lettre échouée : {errors.letter}</span>
                  </div>
                )}
                {work.letterIssues.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, fontSize: 11.5, color: C.honeyFg, background: C.accentDim, padding: '8px 10px', borderRadius: 10, marginTop: 8 }}>
                    <Warning size={14} style={{ flexShrink: 0 }} />
                    <span>À vérifier : {work.letterIssues.join(' ')}</span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <Btn onClick={insertLetter} variant="primary" disabled={!work.letter}><ArrowLineDown size={14} weight="bold" /> Insérer dans l'offre</Btn>
                  <Btn onClick={() => { navigator.clipboard.writeText(work.letter); flash('Lettre copiée'); }} disabled={!work.letter} variant="soft"><Copy size={14} /> Copier</Btn>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    value={persona}
                    onChange={e => setPersona(e.target.value as ReviewPersona)}
                    title="Qui lit la lettre"
                    style={{ ...inputStyle, width: 'auto', padding: '8px 10px', fontSize: 12 }}
                  >
                    {PERSONAS.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
                  </select>
                  <Btn onClick={judgeLetter} disabled={!work.letter || tasks.letter === 'running'} loading={tasks.review === 'running' && !polishing} variant="soft"><Gavel size={14} /> Juger</Btn>
                </div>
                <div style={{ marginTop: 8 }}>
                  {/* Pas de "loading" : le bouton n'afficherait que le spinner, on veut l'étape. */}
                  <Btn onClick={polish} disabled={!work.letter || tasks.letter === 'running' || tasks.review === 'running'} variant="soft" full>
                    {polishing
                      ? <><CircleNotch size={14} style={{ animation: 'spin .8s linear infinite' }} /> {polishing}</>
                      : <><MagicWand size={14} /> Peaufiner tout seul (tous les regards, 2 corrections max)</>}
                  </Btn>
                </div>
                {errors.review && <p style={{ color: C.error, fontSize: 12, marginTop: 8 }}>{errors.review}</p>}
                <Divider />
                <Label>Pourquoi cette boîte ? (ta vraie raison)</Label>
                <textarea
                  value={work.note}
                  onChange={e => persist({ ...work, note: e.target.value })}
                  rows={2}
                  placeholder="J'utilise leur produit, une amie y travaille, j'ai vu leur talk sur…"
                  style={inputStyle}
                />
                <Label style={{ marginTop: 10 }}>Ajuster cette version</Label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {REGEN_CHIPS.map(c => {
                    const on = hint.includes(c.phrase);
                    return (
                      <button key={c.label} onClick={() => setHint(h => on ? h.replace(c.phrase, '').trim() : `${h} ${c.phrase}`.trim())} style={chip(on)}>
                        {c.label}
                      </button>
                    );
                  })}
                </div>
                <textarea value={hint} onChange={e => setHint(e.target.value)} rows={2} placeholder="Ou écris ta consigne…" style={inputStyle} />
                <div style={{ marginTop: 10 }}>
                  <Btn onClick={() => regenLetter(hint)} variant="soft" loading={tasks.letter === 'running'} disabled={tasks.review === 'running'} full>
                    {hint ? <MagicWand size={14} /> : <ArrowsClockwise size={14} />} Régénérer la lettre
                  </Btn>
                </div>
              </Card>
            )}

            {side === 'message' && (
              <Card>
                <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6, marginBottom: 12 }}>
                  Quelques lignes à envoyer directement à la personne qui recrute (messagerie pro, e-mail). Souvent plus lu qu'une lettre.
                </p>
                {tasks.message === 'running' && <Skeleton lines={5} />}
                {work.message && tasks.message !== 'running' && (
                  <textarea
                    value={work.message}
                    onChange={e => persist({ ...work, message: e.target.value })}
                    rows={8}
                    style={{ width: '100%', border: 'none', outline: 'none', resize: 'vertical', background: 'transparent', fontSize: 13, lineHeight: 1.65, color: C.text }}
                  />
                )}
                {errors.message && <p style={{ color: C.error, fontSize: 12 }}>{errors.message}</p>}
                {work.messageIssues.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, fontSize: 11.5, color: C.honeyFg, background: C.accentDim, padding: '8px 10px', borderRadius: 10, marginTop: 8 }}>
                    <Warning size={14} style={{ flexShrink: 0 }} />
                    <span>À vérifier : {work.messageIssues.join(' ')}</span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <Btn onClick={genMessage} variant={work.message ? 'soft' : 'primary'} loading={tasks.message === 'running'}>
                    {work.message ? <ArrowsClockwise size={14} /> : <MagicWand size={14} />} {work.message ? 'Régénérer' : 'Écrire le message'}
                  </Btn>
                  <Btn onClick={() => { navigator.clipboard.writeText(work.message); flash('Message copié'); }} disabled={!work.message} variant="soft"><Copy size={14} /> Copier</Btn>
                </div>
              </Card>
            )}

            {side === 'prep' && (
              <Card>
                {tasks.prep === 'running' && <Skeleton lines={7} />}
                {tasks.prep === 'error' && (
                  <p style={{ color: C.error, fontSize: 12, marginBottom: 8 }}>
                    {errors.prep}{' '}<button onClick={regenPrep} style={linkBtn}>Réessayer</button>
                  </p>
                )}
                {work.interview && (
                  <div style={{ marginBottom: 16 }}>
                    <Label>On te demandera sûrement</Label>
                    <ol style={{ paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6, color: C.soft, marginBottom: 10 }}>
                      {work.interview.experience.map((q, i) => (
                        <li key={i} style={{ marginBottom: 6 }}>
                          <b style={{ color: C.text, fontWeight: 600 }}>{q.question}</b>
                          {q.answer && <div style={{ color: C.muted }}>{q.answer}</div>}
                        </li>
                      ))}
                    </ol>
                    {work.interview.company.length > 0 && (
                      <>
                        <Label>Sur l'entreprise</Label>
                        <ul style={{ paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6, color: C.soft, marginBottom: 10 }}>
                          {work.interview.company.map((x, i) => <li key={i} style={{ marginBottom: 3 }}>{x}</li>)}
                        </ul>
                      </>
                    )}
                    {work.interview.toAsk.length > 0 && (
                      <>
                        <Label>À poser au recruteur</Label>
                        <ul style={{ paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6, color: C.soft }}>
                          {work.interview.toAsk.map((x, i) => <li key={i} style={{ marginBottom: 3 }}>{x}</li>)}
                        </ul>
                      </>
                    )}
                  </div>
                )}
                {work.prep.length > 0 && (
                  <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6, marginBottom: 12 }}>
                    Tu as ajouté ces compétences au CV. Voilà de quoi en parler honnêtement si on te rappelle.
                  </p>
                )}
                {work.prep.map(item => (
                  <div key={item.skill} style={{ marginBottom: 16 }}>
                    <div style={{ fontFamily: C.display, fontSize: 17, fontWeight: 600, marginBottom: 6 }}>{item.skill}</div>
                    <Label>Les bases</Label>
                    <ol style={{ paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6, color: C.soft, marginBottom: 8 }}>
                      {item.basics.map((b, i) => <li key={i} style={{ marginBottom: 3 }}>{b}</li>)}
                    </ol>
                    <Label>On risque de te demander</Label>
                    <ul style={{ paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6, color: C.soft }}>
                      {item.questions.map((q, i) => <li key={i} style={{ marginBottom: 3 }}>{q}</li>)}
                    </ul>
                  </div>
                ))}
              </Card>
            )}

            {side === 'app' && (
              <Card>
                <Label>Où en est cette candidature ?</Label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                  {STATUSES.map(s => (
                    <button key={s} onClick={() => changeStatus(s)} style={chip(status === s)}>
                      {status === s && <CheckCircle size={12} weight="fill" style={{ marginRight: 4, verticalAlign: -2 }} />}
                      {STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
                <Label>Pourquoi ce score</Label>
                <p style={{ fontSize: 12.5, color: C.soft, lineHeight: 1.6, marginBottom: 10 }}>{m.reason}</p>
                {m.covered.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
                    {m.covered.map(c => <Pill key={c.requirement} tone="sage">{c.requirement}</Pill>)}
                  </div>
                )}
                {(m.hardGaps.length > 0 || m.softGaps.length > 0) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {m.hardGaps.map(g => <Pill key={g} tone="brick">{g}</Pill>)}
                    {m.softGaps.map(g => <Pill key={g} tone="honey">{g}</Pill>)}
                  </div>
                )}
                <Divider />
                <button onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('extension/options/options.html#apps') })} style={linkBtn}>Voir toutes mes candidatures</button>
              </Card>
            )}
          </aside>

          {showReview && (
            <aside style={{ position: 'sticky', top: 88, alignSelf: 'start', maxHeight: 'calc(100vh - 110px)', overflowY: 'auto' }}>
              <Card>
                <Label>Avis des relecteurs</Label>
                {work.review
                  ? (
                    <ReviewPanel
                      review={work.review}
                      stale={work.reviewOf !== work.letter}
                      onUse={r => { setHint(reviewToHint(r)); flash('Consignes du juge ajoutées : relis-les puis régénère'); }}
                    />
                  )
                  : <Skeleton lines={8} />}
              </Card>
            </aside>
          )}
        </main>
      </div>

      {/* Copies non réduites, toujours présentes : la feuille d'impression
          choisit laquelle sortir (data-print), sans attendre de rendu au clic. */}
      <div className="print-root">
        <div className="print-cv">
          {work.cv && <CvDocument base={base} cv={work.cv} layout={layout} highlight={false} />}
        </div>
        <div className="print-letter">
          <LetterDocument base={base} letter={work.letter} lang={job.lang} title={job.analysis.title} company={job.analysis.company} />
        </div>
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 20,
          background: C.text, color: C.accentFg, padding: '10px 18px', borderRadius: 999, fontSize: 13,
          boxShadow: '0 10px 30px rgba(63,45,35,0.25)', animation: 'fadeSlide .3s both',
        }}>{toast}</div>
      )}
    </>
  );
}

// ── Petits composants ─────────────────────────────────────────────────────────

const pageCSS = `
  body { min-height: 100vh; }
  .print-root { display: none; }
  @page { size: A4; margin: 0; }
  @media print {
    html, body { background: #fff !important; }
    .screen { display: none !important; }
    .print-root { display: block; }
    body[data-print="cv"] .print-letter, body[data-print="letter"] .print-cv { display: none; }
  }
`;

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 12, border: `1px solid ${C.border}`,
  background: C.bg, color: C.text, fontSize: 12.5, lineHeight: 1.55, outline: 'none', resize: 'none',
};

const linkBtn: React.CSSProperties = {
  background: 'none', border: 'none', padding: 0, color: C.accent, fontSize: 12.5,
  textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer',
};

function chip(on: boolean): React.CSSProperties {
  return {
    padding: '5px 11px', borderRadius: 999, fontSize: 12, cursor: 'pointer', outline: 'none',
    border: `1px solid ${on ? C.accent : C.border}`,
    background: on ? 'rgba(197,106,67,0.12)' : C.surface,
    color: on ? C.accentDeep : C.soft,
  };
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{globalCSS}</style>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
        {children}
      </div>
    </>
  );
}

// Feuille A4 réduite pour tenir dans la colonne, sans fausser les mesures
// (transform n'affecte pas offsetHeight).
function Paper({ children }: { children: React.ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.8);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / (210 * MM))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={wrap} style={{ width: '100%' }}>
      <div style={{
        width: 210 * MM * scale, height: 297 * MM * scale, margin: '0 auto',
        borderRadius: 6, overflow: 'hidden', background: '#fff',
        boxShadow: '0 1px 2px rgba(63,45,35,0.08), 0 18px 50px -12px rgba(63,45,35,0.22)',
        border: `1px solid ${C.border}`,
      }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: 210 * MM }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function Placeholder({ state, error, label, onRetry }: { state: TaskState; error?: string; label: string; onRetry: () => void }) {
  return (
    <div className="a4" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, fontFamily: C.font }}>
      {state === 'error'
        ? <>
            <Warning size={30} color={C.error} />
            <p style={{ color: C.error, fontSize: 15, maxWidth: 420, textAlign: 'center' }}>{error}</p>
            <Btn onClick={onRetry} variant="primary"><ArrowsClockwise size={14} /> Réessayer</Btn>
          </>
        : <>
            <CircleNotch size={30} color={C.accent} style={{ animation: 'spin .9s linear infinite' }} />
            <p style={{ color: C.muted, fontSize: 16, fontFamily: C.display }}>{label}…</p>
          </>}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: 18,
      boxShadow: '0 1px 0 rgba(255,255,255,0.6) inset, 0 8px 24px -16px rgba(63,45,35,0.25)',
      animation: 'fadeSlide .35s both',
    }}>{children}</div>
  );
}

function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <p style={{ fontSize: 11, fontWeight: 600, color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 6, ...style }}>{children}</p>;
}

// Jugement de la lettre : verdict, points forts, extraits à revoir avec leur
// consigne, faits à ajouter à la base. Les consignes passent dans le champ
// « Ajuster cette version », modifiables avant de régénérer.
function ReviewPanel({ review, stale, onUse }: { review: LetterReview; stale: boolean; onUse: (r: LetterReview) => void }) {
  const send = review.verdict === 'send';
  const list = { paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6, color: C.soft, marginBottom: 10 } as const;
  return (
    <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 14, background: C.sunken }}>
      <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: send ? C.sageFg : C.honeyFg, marginBottom: 10 }}>
        {send ? <CheckCircle size={15} weight="fill" /> : <Warning size={15} weight="fill" />}
        {send ? 'Elle peut partir' : 'À retravailler'}
        {review.reader && <span style={{ fontWeight: 400, color: C.muted }}>· lue par {review.reader}</span>}
      </p>
      {stale && (
        <p style={{ fontSize: 11.5, color: C.muted, marginBottom: 10 }}>
          La lettre a changé depuis ce jugement : relance « Juger » pour la version actuelle.
        </p>
      )}
      {review.good.length > 0 && (
        <>
          <Label>Ce qui marche</Label>
          <ul style={list}>{review.good.map((g, i) => <li key={i}>{g}</li>)}</ul>
        </>
      )}
      {review.issues.length > 0 && (
        <>
          <Label>À revoir</Label>
          <ol style={list}>
            {review.issues.map((x, i) => (
              <li key={i} style={{ marginBottom: 8 }}>
                {x.quote && <div style={{ fontStyle: 'italic', color: C.text }}>« {x.quote} »</div>}
                <div style={{ color: C.muted }}>{x.problem}</div>
                <div><b style={{ fontWeight: 600, color: C.text }}>→</b> {x.fix}</div>
              </li>
            ))}
          </ol>
        </>
      )}
      {review.missingFacts.length > 0 && (
        <>
          <Label>À ajouter à ta base</Label>
          <ul style={list}>{review.missingFacts.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </>
      )}
      {review.issues.length > 0 && !stale && (
        <Btn onClick={() => onUse(review)} variant="soft" full><MagicWand size={14} /> Mettre ces consignes dans « Ajuster »</Btn>
      )}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: C.border, margin: '16px 0 14px' }} />;
}

function Skeleton({ lines }: { lines: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: '4px 0' }}>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} style={{ height: 10, borderRadius: 5, background: C.sunken, width: `${70 + ((i * 37) % 30)}%`, animation: 'pulse 1.4s ease-in-out infinite', animationDelay: `${i * 0.08}s` }} />
      ))}
    </div>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone: 'sage' | 'brick' | 'honey' }) {
  const t = { sage: [C.sage, C.sageFg], brick: [C.brick, C.brickFg], honey: [C.accentDim, C.honeyFg] }[tone];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, background: t[0], color: t[1], fontSize: 11.5, fontWeight: 500 }}>
      {children}
    </span>
  );
}

function Segmented({ value, onChange, options, full }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; icon?: React.ReactNode }[];
  full?: boolean;
}) {
  return (
    <div style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 999, background: C.sunken, border: `1px solid ${C.border}`, width: full ? '100%' : undefined }}>
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{
            flex: full ? 1 : undefined, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
            background: value === o.value ? C.surface : 'transparent',
            color: value === o.value ? C.text : C.muted,
            boxShadow: value === o.value ? '0 1px 3px rgba(63,45,35,0.12)' : 'none',
            transition: `all .2s ${C.easeSpring}`,
          }}
        >
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}

type Variant = 'primary' | 'soft' | 'ghost';
function Btn({ onClick, children, variant = 'soft', disabled, loading, full }: {
  onClick: () => void;
  children: React.ReactNode;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  full?: boolean;
}) {
  const v = {
    primary: { bg: C.accent, fg: C.accentFg, bd: 'transparent' },
    soft: { bg: C.accentDim, fg: C.honeyFg, bd: 'transparent' },
    ghost: { bg: 'transparent', fg: C.soft, bd: C.borderStrong },
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        width: full ? '100%' : undefined, padding: '8px 15px', borderRadius: 999,
        background: v.bg, color: v.fg, border: `1px solid ${v.bd}`,
        fontSize: 12.5, fontWeight: 600, cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1, whiteSpace: 'nowrap', transition: `transform .12s ${C.easeSpring}`,
      }}
      onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.97)'; }}
      onMouseUp={e => { e.currentTarget.style.transform = ''; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; }}
    >
      {loading ? <CircleNotch size={14} style={{ animation: 'spin .8s linear infinite' }} /> : children}
    </button>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
