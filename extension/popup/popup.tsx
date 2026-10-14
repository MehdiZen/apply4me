import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowRight, ArrowsClockwise, Check, CircleNotch, GearSix, MagnifyingGlass, SealCheck, Warning,
} from '@phosphor-icons/react';
import type {
  FactBase, Job, LetterLang, MatchResult, OfferAnalysis, OfferResponse, OfferSignal, SearchPreferences, Settings,
} from '../types';
import { combineVerdict, evaluateDesirability, type Desirability, type JobVerdict } from '../lib/desirability';
import {
  analysisFingerprint, getApiConfig, getCachedAnalysis, getFactBase, getProfile, getSettings, getStretchMemory, sessionGet,
  sessionSet, setCachedAnalysis, setSettings, setStretchMemory,
} from '../lib/storage';
import { analyzeOffer } from '../lib/requirements';
import { matchOffer } from '../lib/matcher';
import { normalizeName } from '../lib/factbase';
import { loadBundledSeed } from '../lib/bundle';
import { Brand, C, ScoreRing, globalCSS } from '../ui/theme';

// Le popup ne fait que l'étape rapide : lire l'offre, rendre un verdict,
// laisser cocher les ajouts. La rédaction part dans un onglet dédié, qui ne se
// ferme pas si on clique ailleurs.

const MIN_OFFER_CHARS = 220;
const STRETCH_WARN = 6;

const JOB_SIGNALS = [
  'expérience', 'experience', 'compétence', 'competence', 'poste', 'mission',
  'profil', 'recrut', 'candidat', 'cdi', 'cdd', 'stage', 'alternance',
  'salaire', 'télétravail', 'teletravail', 'rejoindre', 'recherchons',
  'offre d\'emploi', 'responsabilité', 'rémunération', 'hiring', 'apply', 'requirements',
];
function looksLikeJobOffer(text: string): boolean {
  const t = text.toLowerCase();
  return JOB_SIGNALS.filter(k => t.includes(k)).length >= 2;
}

type Phase = 'init' | 'no-config' | 'no-offer' | 'analyzing' | 'verdict' | 'error';

interface Analysed { offer: string; analysis: OfferAnalysis; pasted?: boolean }

const cleanUrl = (u: string) => u.split('#')[0];
const jobForKey = (u: string) => `jobFor:${cleanUrl(u)}`;

async function activeTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

async function readOffer(tabId: number): Promise<OfferResponse | null> {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: 'GET_OFFER' }) as OfferResponse;
  } catch {
    return null; // page sans content script (chrome://, PDF, store…)
  }
}

function App() {
  const [phase, setPhase] = useState<Phase>('init');
  const [error, setError] = useState('');
  const [base, setBase] = useState<FactBase | null>(null);
  const [settings, setSettingsState] = useState<Settings | null>(null);
  const [tab, setTab] = useState<chrome.tabs.Tab | null>(null);
  const [data, setData] = useState<Analysed | null>(null);
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [lang, setLang] = useState<LetterLang>('fr');
  const [pasted, setPasted] = useState('');
  const [existingJob, setExistingJob] = useState<string | null>(null);
  const [showAllCovered, setShowAllCovered] = useState(false);

  const [memory, setMemory] = useState<string[]>([]);
  const [prefs, setPrefs] = useState<SearchPreferences | undefined>(undefined);
  // Second axe : ce que la personne cherche. Le verdict affiché combine les deux.
  const desirability = data ? evaluateDesirability(data.analysis, prefs) : null;
  const verdict = match && desirability ? combineVerdict(match, desirability) : null;

  const applyMatch = useCallback(async (a: Analysed, b: FactBase, s: Settings) => {
    const mem = await getStretchMemory();
    const m = matchOffer(a.analysis, b, s, mem);
    setMemory(mem);
    setData(a);
    setMatch(m);
    setChecked(Object.fromEntries(m.stretch.map(x => [x.label, x.checked])));
    setLang(a.analysis.lang);
    setPhase('verdict');
  }, []);

  // Cocher / décocher recalcule le verdict : seules les cases cochées comptent.
  const toggle = useCallback((next: Record<string, boolean>) => {
    setChecked(next);
    if (!data || !base || !settings) return;
    const labels = Object.keys(next).filter(k => next[k]);
    setMatch(matchOffer(data.analysis, base, settings, memory, new Date(), labels));
  }, [data, base, settings, memory]);

  // `pasted` : offre collée à la main, sans lien avec l'onglet ouvert.
  // Déjà analysée (même texte, même base) : le verdict est recalculé sans
  // rappeler l'IA, donc identique d'une ouverture à l'autre. `force` : Réanalyser.
  const analyze = useCallback(async (offer: string, b: FactBase, s: Settings, pasted = false, force = false) => {
    setPhase('analyzing');
    try {
      const wanted = (await getProfile())?.preferences;
      setPrefs(wanted);
      const key = await analysisFingerprint(offer, b, wanted);
      let analysis = force ? null : await getCachedAnalysis(key);
      if (!analysis) {
        analysis = await analyzeOffer(offer, b, wanted);
        // Analyse dégradée : pas mise en cache, pour qu'une réouverture la refasse.
        if (!analysis.warning) await setCachedAnalysis(key, analysis);
      }
      const a: Analysed = { offer, analysis, pasted };
      await applyMatch(a, b, s);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analyse impossible.');
      setPhase('error');
    }
  }, [applyMatch]);

  useEffect(() => {
    (async () => {
      await loadBundledSeed();
      const [config, b, s] = await Promise.all([getApiConfig(), getFactBase(), getSettings()]);
      if (!config || !b) { setPhase('no-config'); return; }
      setBase(b);
      setSettingsState(s);

      const t = await activeTab();
      setTab(t);
      const url = t?.url ?? '';
      if (url) setExistingJob(await sessionGet<string>(jobForKey(url)));

      const res = t?.id !== undefined ? await readOffer(t.id) : null;
      const offer = res?.offer?.trim() ?? '';
      if (offer.length >= MIN_OFFER_CHARS && looksLikeJobOffer(offer)) await analyze(offer, b, s);
      else setPhase('no-offer');
    })();
  }, [analyze]);

  const enableStretch = useCallback(async () => {
    if (!settings || !base || !data) return;
    // Relu au moment d'écrire : un réglage changé dans les options pendant
    // que le popup est ouvert (modèle, économie) n'est pas écrasé.
    const next = { ...(await getSettings()), allowStretch: true };
    await setSettings(next);
    setSettingsState(next);
    await applyMatch(data, base, next);
  }, [settings, base, data, applyMatch]);

  const prepare = useCallback(async () => {
    if (!data || !match || !verdict) return;
    const forced = verdict.verdict === 'skip';
    const stretch = match.stretch.filter(s => checked[s.label]).map(s => s.label);

    // Mémoire des ajouts : coché = pré-coché la prochaine fois, décoché = oublié.
    const memory = new Set(await getStretchMemory());
    for (const s of match.stretch) {
      const k = normalizeName(s.label);
      if (checked[s.label]) memory.add(k); else memory.delete(k);
    }
    await setStretchMemory([...memory]);

    const id = crypto.randomUUID();
    // Offre collée : ni URL ni onglet, sinon "Insérer" écrirait dans une autre
    // page et le suivi se rattacherait à la mauvaise offre.
    const url = data.pasted ? '' : tab?.url ?? '';
    // Le suivi garde le verdict affiché (compétences ET préférences) : une
    // candidature forcée l'est contre ce verdict-là, avec sa raison.
    const shown: MatchResult = forced && match.verdict !== 'skip' ? { ...match, verdict: 'skip', reason: verdict.reason } : match;
    const job: Job = {
      id, url, tabId: data.pasted ? null : tab?.id ?? null, offer: data.offer, analysis: data.analysis,
      match: shown, stretch, lang, forced, createdAt: new Date().toISOString(),
    };
    await sessionSet(`job:${id}`, job);
    if (url) await sessionSet(jobForKey(url), id);
    await chrome.tabs.create({ url: chrome.runtime.getURL(`extension/workspace/workspace.html?job=${id}`) });
    window.close();
  }, [data, match, verdict, checked, tab, lang]);

  const reopen = useCallback(async () => {
    if (!existingJob) return;
    await chrome.tabs.create({ url: chrome.runtime.getURL(`extension/workspace/workspace.html?job=${existingJob}`) });
    window.close();
  }, [existingJob]);

  const reanalyze = useCallback(() => {
    if (data && base && settings) analyze(data.offer, base, settings, data.pasted, true);
  }, [data, base, settings, analyze]);

  return (
    <>
      <style>{globalCSS + `body{width:392px}`}</style>
      <div style={{ width: 392, minHeight: 200 }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 12px' }}>
          <Brand size={28} />
          <IconBtn title="Réglages" onClick={() => chrome.runtime.openOptionsPage()}><GearSix size={16} /></IconBtn>
        </header>

        {phase === 'init' && <Loading label="Lecture de la page" />}
        {phase === 'analyzing' && <Loading label="Lecture de l'offre et comparaison avec ton parcours" />}

        {phase === 'no-config' && (
          <Panel>
            <Title>Bienvenue</Title>
            <Text>Connecte ta clé IA et construis ta base de faits depuis ton CV. Ça prend deux minutes, une seule fois.</Text>
            <div style={{ marginTop: 14 }}>
              <Btn onClick={() => chrome.runtime.openOptionsPage()} variant="primary" full>Configurer apply4me <ArrowRight size={14} weight="bold" /></Btn>
            </div>
          </Panel>
        )}

        {phase === 'error' && (
          <Panel>
            <div style={{ display: 'flex', gap: 8, color: C.error, fontSize: 13, lineHeight: 1.5 }}>
              <Warning size={16} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
            </div>
            <div style={{ marginTop: 12 }}>
              <Btn onClick={() => setPhase('no-offer')} variant="soft" full>Coller l'offre à la main</Btn>
            </div>
          </Panel>
        )}

        {phase === 'no-offer' && (
          <Panel>
            <Title>Pas d'offre détectée ici</Title>
            <Text>Ouvre une page d'offre d'emploi, ou colle son texte ci-dessous.</Text>
            <textarea
              value={pasted}
              onChange={e => setPasted(e.target.value)}
              rows={6}
              placeholder="Intitulé, missions, profil recherché…"
              style={{
                width: '100%', marginTop: 12, padding: '10px 12px', borderRadius: 14, border: `1px solid ${C.border}`,
                background: C.surface, color: C.text, fontSize: 12.5, lineHeight: 1.55, outline: 'none', resize: 'none',
              }}
            />
            <div style={{ marginTop: 10 }}>
              <Btn
                onClick={() => base && settings && analyze(pasted.trim(), base, settings, true)}
                variant="primary" full disabled={pasted.trim().length < 80}
              >
                <MagnifyingGlass size={14} weight="bold" /> Analyser l'offre
              </Btn>
            </div>
          </Panel>
        )}

        {phase === 'verdict' && data && match && settings && verdict && desirability && (
          <Verdict
            data={data}
            match={match}
            verdict={verdict}
            desirability={desirability}
            settings={settings}
            checked={checked}
            setChecked={toggle}
            lang={lang}
            setLang={setLang}
            existingJob={!!existingJob}
            onPrepare={prepare}
            onReopen={reopen}
            onReanalyze={reanalyze}
            onEnableStretch={enableStretch}
            showAllCovered={showAllCovered}
            setShowAllCovered={setShowAllCovered}
          />
        )}
      </div>
    </>
  );
}

// « Pour toi » : pourquoi oui, pourquoi non, chaque point avec la ligne de
// l'annonce qui le justifie. Absent quand aucune préférence n'est remplie.
function ForYou({ d, nextStep }: { d: Desirability; nextStep: string }) {
  const why = [...d.dealbreakers.map(s => ({ s, tone: 'brick' as const })), ...d.negatives.map(s => ({ s, tone: 'honey' as const }))];
  const salary = { 'in-range': 'Dans ta cible', below: 'Sous ton plancher', above: 'Au-dessus de ta cible', unknown: 'Fourchette non indiquée' }[d.salary];
  if (!d.positives.length && !why.length && !d.askSalary && d.salary === 'unknown') return null;
  return (
    <Section title="Pour toi">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {d.positives.length > 0 && (
          <div>
            <p style={{ fontSize: 11.5, fontWeight: 600, color: C.sageFg, marginBottom: 4 }}>Pourquoi oui</p>
            {d.positives.map((s, i) => <Reason key={`${i}-${s.label}`} s={s} mark="✓" color={C.sageFg} />)}
          </div>
        )}
        {why.length > 0 && (
          <div>
            <p style={{ fontSize: 11.5, fontWeight: 600, color: C.brickFg, marginBottom: 4 }}>Pourquoi non</p>
            {why.map(({ s, tone }, i) => <Reason key={`${i}-${s.label}`} s={s} mark="✗" color={tone === 'brick' ? C.brickFg : C.honeyFg} strong={tone === 'brick'} />)}
          </div>
        )}
        {/* Seulement si tu as une cible : sinon le salaire n'est pas jugé. */}
        {(d.salary !== 'unknown' || d.askSalary) && <p style={{ fontSize: 12, color: C.soft }}>Salaire : {salary}</p>}
        <p style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>→ {nextStep}</p>
      </div>
    </Section>
  );
}

function Reason({ s, mark, color, strong }: { s: OfferSignal; mark: string; color: string; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 7, fontSize: 12.5, lineHeight: 1.45, marginBottom: 5 }}>
      <span style={{ color, fontWeight: 700, flexShrink: 0 }}>{mark}</span>
      <span>
        <span style={{ color: C.text, fontWeight: strong ? 650 : 500 }}>{s.label}{strong ? ' (rédhibitoire)' : ''}</span>
        {s.quote && <span style={{ display: 'block', fontSize: 11.5, color: C.muted, fontStyle: 'italic' }}>« {s.quote} »</span>}
      </span>
    </div>
  );
}

function Verdict({
  data, match, verdict, desirability, settings, checked, setChecked, lang, setLang, existingJob,
  onPrepare, onReopen, onReanalyze, onEnableStretch, showAllCovered, setShowAllCovered,
}: {
  data: Analysed;
  match: MatchResult;
  verdict: JobVerdict;
  desirability: Desirability;
  settings: Settings;
  checked: Record<string, boolean>;
  setChecked: (c: Record<string, boolean>) => void;
  lang: LetterLang;
  setLang: (l: LetterLang) => void;
  existingJob: boolean;
  onPrepare: () => void;
  onReopen: () => void;
  onReanalyze: () => void;
  onEnableStretch: () => void;
  showAllCovered: boolean;
  setShowAllCovered: (v: boolean) => void;
}) {
  const a = data.analysis;
  const apply = verdict.verdict !== 'skip';
  const tone = !apply ? 'bad' : verdict.verdict === 'maybe' ? 'mid' : match.score >= 70 ? 'good' : 'mid';
  const headline = verdict.verdict === 'apply' ? 'Fonce' : verdict.verdict === 'maybe' ? 'À voir' : match.verdict === 'skip' ? 'Écart trop grand' : 'Pas pour toi';
  const stretchLabels = new Set(match.stretch.map(s => normalizeName(s.label)));
  // Ce qui est proposé en case n'est pas répété dans "Il te manque".
  const softGaps = match.softGaps.filter(g => !stretchLabels.has(normalizeName(g)));
  const hardGaps = match.hardGaps.filter(g => !stretchLabels.has(normalizeName(g)));
  const checkedCount = Object.values(checked).filter(Boolean).length;
  const covered = showAllCovered ? match.covered : match.covered.slice(0, 8);
  // Seuls les outils nommés deviennent des cases : le lien n'est proposé que s'il y en a.
  const uncoveredTech = a.requirements.filter(r => r.kind === 'tech' && r.named !== false && !r.matches.length).length;

  return (
    <div style={{ animation: 'fadeSlide .35s both' }}>
      {/* L'offre */}
      <div style={{ padding: '0 16px 12px' }}>
        <div style={{ fontFamily: C.display, fontSize: 19, fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.2 }}>
          {a.title || 'Offre sans intitulé'}
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
          {[a.company || (a.recruiter ? `Client de ${a.recruiter}` : ''), match.yearsNeed ? `${match.yearsNeed} ans demandés` : null].filter(Boolean).join(' · ') || 'Entreprise non détectée'}
        </div>
      </div>

      {/* Verdict */}
      <div style={{
        margin: '0 16px', padding: 14, borderRadius: 20, display: 'flex', gap: 14, alignItems: 'center',
        background: apply ? (tone === 'good' ? C.sage : C.accentDim) : C.brick,
      }}>
        <ScoreRing score={match.score} tone={tone} size={58} />
        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: C.display, fontSize: 16, fontWeight: 650,
            color: apply ? (tone === 'good' ? C.sageFg : C.honeyFg) : C.brickFg,
          }}>
            {verdict.verdict === 'apply' ? <SealCheck size={17} weight="fill" /> : <Warning size={17} weight="fill" />}
            {headline}
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.5, color: C.soft, marginTop: 2 }}>{verdict.reason}</div>
        </div>
      </div>
      {a.warning && (
        <p style={{ margin: '8px 18px 0', fontSize: 11, color: C.brickFg, lineHeight: 1.45, display: 'flex', gap: 5 }}>
          <Warning size={13} style={{ flexShrink: 0, marginTop: 1 }} /> {a.warning}
        </p>
      )}
      <p style={{ margin: '7px 18px 0', fontSize: 10.5, color: C.muted, lineHeight: 1.45 }}>
        Le score mesure la couverture des compétences demandées. Il ne voit ni le niveau visé, ni le nombre de candidats, ni les questions du formulaire.
      </p>

      <div style={{ padding: '14px 16px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <ForYou d={desirability} nextStep={verdict.nextStep} />

        {match.covered.length > 0 && (
          <Section title={`Tu couvres (${match.covered.length})`}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {covered.map(c => (
                <Chip key={c.requirement} tone="sage" title={`Prouvé par : ${c.skill}`}>
                  {c.requirement}{c.level === 'learning' ? ' · hors cadre pro' : ''}
                </Chip>
              ))}
              {match.covered.length > 8 && (
                <button onClick={() => setShowAllCovered(!showAllCovered)} style={linkBtn}>
                  {showAllCovered ? 'moins' : `+${match.covered.length - 8}`}
                </button>
              )}
            </div>
          </Section>
        )}

        {(match.hardGaps.length > 0 || softGaps.length > 0) && (
          <Section title="Il te manque">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {hardGaps.map(g => <Chip key={g} tone="brick">{g}</Chip>)}
              {softGaps.map(g => <Chip key={g} tone="honey">{g}</Chip>)}
            </div>
            {!settings.allowStretch && uncoveredTech > 0 && (
              <p style={{ fontSize: 11.5, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
                Les ATS filtrent sur ces mots-clés.{' '}
                <button onClick={onEnableStretch} style={linkBtn}>Me proposer de les ajouter au CV</button>
              </p>
            )}
          </Section>
        )}

        {match.stretch.length > 0 && (
          <Section title="Ajouter à ton CV ?">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 4 }}>
              {match.stretch.map(s => {
                const on = !!checked[s.label];
                return (
                  <label key={s.label} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 12, cursor: 'pointer',
                    background: on ? 'rgba(197,106,67,0.08)' : 'transparent', transition: `background .15s ${C.ease}`,
                  }}>
                    <input type="checkbox" checked={on} onChange={() => setChecked({ ...checked, [s.label]: !on })} style={{ display: 'none' }} />
                    <span style={{
                      width: 18, height: 18, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: `1.5px solid ${on ? C.accent : C.borderStrong}`, background: on ? C.accent : C.surface,
                      transition: `all .15s ${C.easeSpring}`,
                    }}>
                      {on && <Check size={12} weight="bold" color={C.accentFg} />}
                    </span>
                    <span style={{ fontSize: 13, color: C.text, flex: 1 }}>{s.label}</span>
                    {s.mandatory && <span style={{ fontSize: 10.5, color: C.brickFg, fontWeight: 600 }}>exigé</span>}
                  </label>
                );
              })}
            </div>
            <p style={{ fontSize: 11, color: checkedCount > STRETCH_WARN ? C.brickFg : C.muted, marginTop: 7, lineHeight: 1.5 }}>
              {checkedCount > STRETCH_WARN
                ? `${checkedCount} ajouts : à ce stade le CV ressemble à une copie de l'annonce.`
                : 'Ligne Compétences uniquement, jamais dans tes expériences. La lettre les présentera comme des bases que tu développes.'}
            </p>
          </Section>
        )}
      </div>

      {/* Actions */}
      <div style={{
        position: 'sticky', bottom: 0, marginTop: 14, padding: '12px 16px 14px',
        background: `linear-gradient(to bottom, rgba(251,245,236,0), ${C.bg} 30%)`,
      }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <LangToggle lang={lang} setLang={setLang} />
          <div style={{ flex: 1 }}>
            <Btn onClick={onPrepare} variant={apply ? 'primary' : 'ghost'} full>
              {apply ? 'Préparer ma candidature' : 'Préparer quand même'} <ArrowRight size={14} weight="bold" />
            </Btn>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 9, fontSize: 11.5 }}>
          <button onClick={onReanalyze} style={{ ...linkBtn, color: C.muted, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <ArrowsClockwise size={12} /> Réanalyser
          </button>
          {existingJob && <button onClick={onReopen} style={linkBtn}>Rouvrir la candidature déjà préparée</button>}
        </div>
        {!apply && (
          <p style={{ fontSize: 11, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
            {match.verdict !== 'skip'
              ? 'Ce qui coince vient de ce que tu cherches, pas de tes compétences : à toi de voir si ça se discute.'
              : match.hardGaps.length > 0 && match.hardGaps.every(g => /ans demandés/.test(g))
              ? 'Seules les années bloquent : une durée dans une annonce est souvent un souhait. Si le reste colle, tente, c\'est noté dans le suivi.'
              : 'Si tu y vas quand même, c\'est noté dans le suivi : tu verras plus tard si ça valait le coup.'}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Petits composants ─────────────────────────────────────────────────────────

const linkBtn: React.CSSProperties = {
  background: 'none', border: 'none', padding: 0, color: C.accent, fontSize: 'inherit',
  cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3,
};

function Loading({ label }: { label: string }) {
  return (
    <div style={{ padding: '26px 16px 30px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <CircleNotch size={24} color={C.accent} style={{ animation: 'spin .8s linear infinite' }} />
      <p style={{ fontSize: 13, color: C.muted, textAlign: 'center', fontFamily: C.display }}>{label}…</p>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: '4px 16px 18px', animation: 'fadeSlide .3s both' }}>{children}</div>;
}

function Title({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: C.display, fontSize: 19, fontWeight: 600, letterSpacing: '-0.015em', marginBottom: 4 }}>{children}</div>;
}

function Text({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6 }}>{children}</p>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ fontSize: 10.5, fontWeight: 650, color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 7 }}>{title}</p>
      {children}
    </div>
  );
}

function Chip({ children, tone, title }: { children: React.ReactNode; tone: 'sage' | 'brick' | 'honey'; title?: string }) {
  const t = { sage: [C.sage, C.sageFg], brick: [C.brick, C.brickFg], honey: [C.accentDim, C.honeyFg] }[tone];
  return (
    <span title={title} style={{ padding: '3px 9px', borderRadius: 999, background: t[0], color: t[1], fontSize: 11.5, fontWeight: 500 }}>
      {children}
    </span>
  );
}

function LangToggle({ lang, setLang }: { lang: LetterLang; setLang: (l: LetterLang) => void }) {
  return (
    <div title="Langue du CV et de la lettre" style={{ display: 'flex', padding: 3, borderRadius: 999, background: C.sunken, border: `1px solid ${C.border}` }}>
      {(['fr', 'en'] as const).map(l => (
        <button key={l} onClick={() => setLang(l)} style={{
          padding: '6px 10px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 650,
          background: lang === l ? C.surface : 'transparent', color: lang === l ? C.text : C.muted,
          boxShadow: lang === l ? '0 1px 3px rgba(63,45,35,0.12)' : 'none',
        }}>{l.toUpperCase()}</button>
      ))}
    </div>
  );
}

function IconBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button onClick={onClick} title={title} style={{
      width: 32, height: 32, borderRadius: 999, border: `1px solid ${C.border}`, background: C.surface,
      color: C.soft, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
    }}>{children}</button>
  );
}

function Btn({ onClick, children, variant = 'soft', disabled, full }: {
  onClick: () => void;
  children: React.ReactNode;
  variant?: 'primary' | 'soft' | 'ghost';
  disabled?: boolean;
  full?: boolean;
}) {
  const v = {
    primary: { bg: C.accent, fg: C.accentFg, bd: 'transparent' },
    soft: { bg: C.accentDim, fg: C.honeyFg, bd: 'transparent' },
    ghost: { bg: C.surface, fg: C.soft, bd: C.borderStrong },
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: full ? '100%' : undefined,
        padding: '10px 16px', borderRadius: 999, background: v.bg, color: v.fg, border: `1px solid ${v.bd}`,
        fontSize: 13, fontWeight: 650, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
        boxShadow: variant === 'primary' ? '0 6px 16px -8px rgba(164,83,47,0.6)' : 'none',
        transition: `transform .12s ${C.easeSpring}`,
      }}
      onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.97)'; }}
      onMouseUp={e => { e.currentTarget.style.transform = ''; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; }}
    >
      {children}
    </button>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
