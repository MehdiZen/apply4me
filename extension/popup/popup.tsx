import { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import {
  GearSix, Copy, CheckCircle, PaperPlane,
  DownloadSimple, ArrowLineDown, ArrowsClockwise, CircleNotch,
  NotePencil, CaretDown, CaretRight,
} from '@phosphor-icons/react';
import { getApiConfig, getProfile } from '../lib/storage';
import { generateCoverLetter, generateHeadline } from '../lib/llm';
import { downloadCoverLetterPDF } from '../lib/pdf';
import type { UserProfile, OfferResponse, FillResponse } from '../types';

// ── palette marron chaleureuse ────────────────────────────────────────────────
const C = {
  bg: '#FBF5EC',        // crème
  surface: '#FAF1E2',   // surface chaude
  soft: '#F1E6D6',      // pilule douce
  softFg: '#7A6450',
  paper: '#F7EFE2',     // zone lettre
  border: '#EADBC7',    // sable
  text: '#4A352A',      // espresso
  muted: '#9A8473',     // brun doux
  label: '#B0875F',     // brun caramel (labels)
  accent: '#C56A43',    // terracotta
  accentFg: '#FBF5EC',
  honey: '#F6E4C2',     // miel (secondaire)
  honeyFg: '#8A5A1E',
  sage: '#E7EDDD',      // sauge (succès)
  sageFg: '#4F6138',
  error: '#B23B2E',
  errorDim: '#F6E0D8',
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI Variable', system-ui, sans-serif",
  mono: "'SF Mono', 'Geist Mono', 'JetBrains Mono', monospace",
  ease: 'cubic-bezier(0.16, 1, 0.3, 1)',
};

const MIN_OFFER_CHARS = 220;

const JOB_SIGNALS = [
  'expérience', 'experience', 'compétence', 'competence', 'poste', 'mission',
  'profil', 'recrut', 'candidat', 'cdi', 'cdd', 'stage', 'alternance',
  'salaire', 'télétravail', 'teletravail', 'rejoindre', 'recherchons',
  'offre d\'emploi', 'responsabilité', 'rémunération', 'hiring', 'apply',
];
function looksLikeJobOffer(text: string): boolean {
  const t = text.toLowerCase();
  let hits = 0;
  for (const k of JOB_SIGNALS) if (t.includes(k)) { hits++; if (hits >= 2) return true; }
  return false;
}

// ── logo dogeza ───────────────────────────────────────────────────────────────
function DogezaMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
      <rect x="3" y="3" width="94" height="94" rx="23" fill={C.accent} />
      <line x1="12" y1="80" x2="88" y2="80" stroke="#2A1A12" strokeWidth="3" strokeLinecap="round" opacity="0.85" />
      <rect x="54" y="70" width="31" height="10" rx="5" fill={C.bg} stroke="#2A1A12" strokeWidth="3" />
      <line x1="63" y1="72" x2="71" y2="54" stroke="#2A1A12" strokeWidth="18" strokeLinecap="round" />
      <line x1="63" y1="72" x2="71" y2="54" stroke={C.bg} strokeWidth="13" strokeLinecap="round" />
      <path d="M73,56 C72,38 61,31 50,34 C43,36 39,46 41,57 C46,60 56,61 64,61 C71,61 74,58 73,56 Z" fill={C.bg} stroke="#2A1A12" strokeWidth="3" strokeLinejoin="round" />
      <line x1="49" y1="57" x2="45" y2="77" stroke="#2A1A12" strokeWidth="12" strokeLinecap="round" />
      <line x1="49" y1="57" x2="45" y2="77" stroke={C.bg} strokeWidth="8" strokeLinecap="round" />
      <circle cx="32" cy="62" r="11.5" fill={C.bg} stroke="#2A1A12" strokeWidth="3" />
    </svg>
  );
}

// ── Button (pilule) ─────────────────────────────────────────────────────────
type Variant = 'primary' | 'secondary' | 'success' | 'soft' | 'ghost';
const VAR: Record<Variant, { bg: string; fg: string; bd: string }> = {
  primary:   { bg: C.accent, fg: C.accentFg, bd: 'transparent' },
  secondary: { bg: C.honey,  fg: C.honeyFg,  bd: 'transparent' },
  success:   { bg: C.sage,   fg: C.sageFg,   bd: 'transparent' },
  soft:      { bg: C.soft,   fg: C.softFg,   bd: 'transparent' },
  ghost:     { bg: 'transparent', fg: C.softFg, bd: '#E0CDB4' },
};
function Btn({
  onClick, disabled, variant = 'soft', children, full, loading,
}: {
  onClick: () => void;
  disabled?: boolean;
  variant?: Variant;
  children: React.ReactNode;
  full?: boolean;
  loading?: boolean;
}) {
  const [down, setDown] = useState(false);
  const v = VAR[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      onMouseDown={() => setDown(true)}
      onMouseUp={() => setDown(false)}
      onMouseLeave={() => setDown(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        width: full ? '100%' : undefined,
        padding: '9px 16px', borderRadius: 999,
        border: `1px solid ${v.bd}`,
        background: v.bg, color: v.fg,
        fontSize: 12.5, fontWeight: 500, fontFamily: C.font,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transform: down && !disabled ? 'scale(0.96)' : 'scale(1)',
        transition: `all 0.14s ${C.ease}`,
        outline: 'none', letterSpacing: '-0.01em', whiteSpace: 'nowrap',
      }}
    >
      {loading
        ? <CircleNotch size={13} style={{ animation: 'spin 0.75s linear infinite' }} />
        : children}
    </button>
  );
}

// ── Copyable block ──────────────────────────────────────────────────────────
function OutputBlock({ title, text, paper }: { title: string; text: string; paper?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div style={{ margin: '0 16px 12px', borderRadius: 16, border: `1px solid ${C.border}`, overflow: 'hidden', background: '#FFFCF7' }}>
      <div style={{
        padding: '9px 11px 9px 13px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', background: C.surface,
      }}>
        <span style={{ fontSize: 11, color: C.label, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          {title}
        </span>
        <Btn onClick={copy} variant="soft">
          {copied
            ? <><CheckCircle size={12} color={C.sageFg} weight="fill" /> Copié</>
            : <><Copy size={12} /> Copier</>}
        </Btn>
      </div>
      <div style={{
        padding: '12px 13px', maxHeight: paper ? 190 : 78, overflowY: 'auto',
        fontSize: 12, lineHeight: 1.7, color: '#6A5141',
        whiteSpace: 'pre-wrap', fontFamily: C.font, background: paper ? C.paper : '#FFFCF7',
      }}>
        {text}
      </div>
    </div>
  );
}

type Phase = 'init' | 'no-config' | 'ready' | 'generating' | 'done' | 'error';

interface S {
  phase: Phase;
  message: string;
  offer: string;
  offerChars: number;
  hasTextarea: boolean;
  letter: string;
  headline: string;
  inserted: boolean;
  note: string;
  noteOpen: boolean;
}

const PROFILE_KEYS = ['targetRole', 'motivations', 'proudAchievement', 'humanEdge', 'writingSample'] as const;

function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  return new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => resolve(tabs[0] ?? null));
  });
}
function sendToTab<T>(tabId: number, msg: object): Promise<T | null> {
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, msg, res => {
      if (chrome.runtime.lastError || !res) { resolve(null); return; }
      resolve(res as T);
    });
  });
}

interface Cached { letter: string; headline: string; note?: string }
const cacheKey = (url: string) => 'lm:' + url.split('#')[0];
async function getCached(url: string): Promise<Cached | null> {
  try { const k = cacheKey(url); const r = await chrome.storage.session.get(k); return (r[k] as Cached) ?? null; }
  catch { return null; }
}
async function setCached(url: string, val: Cached): Promise<void> {
  try { await chrome.storage.session.set({ [cacheKey(url)]: val }); } catch { /* session indispo */ }
}

function App() {
  const [s, setS] = useState<S>({
    phase: 'init', message: '', offer: '', offerChars: 0, hasTextarea: false,
    letter: '', headline: '', inserted: false, note: '', noteOpen: false,
  });
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tabUrl, setTabUrl] = useState<string>('');
  const patch = useCallback((p: Partial<S>) => setS(prev => ({ ...prev, ...p })), []);

  const runGeneration = useCallback(async (offer: string, prof: UserProfile, url: string, note?: string) => {
    patch({ phase: 'generating', message: 'Rédaction en cours…', letter: '', headline: '', inserted: false });
    try {
      const letter = await generateCoverLetter(offer, prof, note);
      let headline = '';
      try { headline = await generateHeadline(offer, prof); } catch { /* accroche optionnelle */ }
      if (url) await setCached(url, { letter, headline, note });
      patch({ phase: 'done', message: 'Lettre prête.', letter, headline });
    } catch (e) {
      patch({ phase: 'error', message: e instanceof Error ? e.message : 'Échec de la génération.' });
    }
  }, [patch]);

  useEffect(() => {
    (async () => {
      const [config, prof] = await Promise.all([getApiConfig(), getProfile()]);
      if (!config || !prof?.cvText) {
        patch({ phase: 'no-config', message: 'Configure ta clé API et ton CV pour commencer.' });
        return;
      }
      setProfile(prof);

      const tab = await getActiveTab();
      const url = tab?.url ?? '';
      setTabUrl(url);

      const res = tab?.id ? await sendToTab<OfferResponse>(tab.id, { type: 'GET_OFFER' }) : null;
      const offer = res?.offer ?? '';
      const hasTextarea = res?.hasTextarea ?? false;
      patch({ offer, hasTextarea, offerChars: offer.trim().length });

      const cached = url ? await getCached(url) : null;
      if (cached?.letter) {
        patch({
          phase: 'done', message: 'Lettre prête.',
          letter: cached.letter, headline: cached.headline,
          note: cached.note ?? '', noteOpen: !!cached.note,
        });
        return;
      }

      if (offer.trim().length >= MIN_OFFER_CHARS && looksLikeJobOffer(offer)) {
        await runGeneration(offer, prof, url);
      } else if (offer.trim().length >= MIN_OFFER_CHARS) {
        patch({ phase: 'ready', message: 'Page lue. Génère si c\'est bien une offre d\'emploi.' });
      } else {
        patch({ phase: 'ready', message: "Ouvre une page d'offre d'emploi pour générer." });
      }
    })();
  }, [patch, runGeneration]);

  const regenerate = useCallback(() => {
    if (profile && s.offer.trim()) runGeneration(s.offer, profile, tabUrl, s.note);
  }, [profile, s.offer, s.note, tabUrl, runGeneration]);

  const insert = useCallback(async () => {
    const tab = await getActiveTab();
    const res = tab?.id ? await sendToTab<FillResponse>(tab.id, { type: 'FILL_TEXTAREA', text: s.letter }) : null;
    if (res?.ok) patch({ inserted: true, message: 'Lettre insérée dans le formulaire.' });
    else patch({ message: res?.error ?? 'Insertion impossible — télécharge le PDF.' });
  }, [s.letter, patch]);

  const download = useCallback(() => downloadCoverLetterPDF(s.letter), [s.letter]);

  const busy = s.phase === 'generating';
  const cvChars = profile?.cvText?.trim().length ?? 0;
  const profileFilled = profile ? PROFILE_KEYS.filter(k => (profile[k] ?? '').trim()).length : 0;
  const weakBasis = s.offerChars === 0 || (cvChars === 0 && profileFilled === 0);

  const numColor = (n: number) => (n ? C.text : C.error);

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        *{box-sizing:border-box;margin:0;padding:0}
        body{width:380px;background:${C.bg};-webkit-font-smoothing:antialiased}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px}
      `}</style>

      <div style={{ width: 380, background: C.bg, fontFamily: C.font, color: C.text }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', borderBottom: `1px solid ${C.border}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <DogezaMark size={28} />
            <span style={{ fontSize: 15, fontWeight: 500, letterSpacing: '-0.01em' }}>apply4me</span>
          </div>
          <Btn onClick={() => chrome.runtime.openOptionsPage()} variant="soft">
            <GearSix size={13} /> Config
          </Btn>
        </div>

        {/* Status */}
        <div style={{
          padding: '11px 16px', minHeight: 42, display: 'flex', alignItems: 'center', gap: 8,
          background: s.phase === 'error' ? C.errorDim : 'transparent',
          borderBottom: `1px solid ${C.border}`, transition: `background 0.35s ${C.ease}`,
        }}>
          {busy && <CircleNotch size={13} color={C.accent} style={{ animation: 'spin 0.75s linear infinite', flexShrink: 0 }} />}
          <p style={{ fontSize: 11.5, lineHeight: 1.55, color: s.phase === 'error' ? C.error : C.muted }}>
            {s.message || (s.phase === 'init' ? 'Lecture de la page…' : '…')}
          </p>
        </div>

        {s.phase === 'no-config' ? (
          <div style={{ padding: 16 }}>
            <Btn onClick={() => chrome.runtime.openOptionsPage()} variant="primary" full>
              <GearSix size={13} weight="fill" /> Ouvrir la configuration
            </Btn>
          </div>
        ) : (
          <>
            {(s.phase === 'ready' || s.phase === 'error') && (
              <div style={{ padding: '13px 16px' }}>
                <Btn onClick={regenerate} variant="primary" full disabled={!s.offer.trim()} loading={busy}>
                  <PaperPlane size={13} weight="fill" /> Générer la lettre
                </Btn>
              </div>
            )}

            {/* Transparence */}
            {(s.letter || busy) && (
              <div style={{
                margin: '13px 16px 0', padding: '9px 13px', borderRadius: 13,
                background: weakBasis ? C.errorDim : C.surface,
                border: `1px solid ${weakBasis ? '#E9C3B8' : C.border}`,
                fontSize: 11.5, lineHeight: 1.5, color: weakBasis ? C.error : C.muted,
              }}>
                Basé sur : offre <b style={{ color: numColor(s.offerChars) }}>{s.offerChars}</b> car.
                {' · '}CV <b style={{ color: numColor(cvChars) }}>{cvChars}</b> car.
                {' · '}profil <b style={{ color: numColor(profileFilled) }}>{profileFilled}/5</b>
                {weakBasis && <> — refais la <span style={{ textDecoration: 'underline', cursor: 'pointer' }}
                  onClick={() => chrome.runtime.openOptionsPage()}>config</span></>}
              </div>
            )}

            {/* Outputs */}
            <div style={{ marginTop: 13 }} />
            {s.headline && <OutputBlock title="Accroche CV — adaptée à l'offre" text={s.headline} />}
            {s.letter && <OutputBlock title="Lettre de motivation" text={s.letter} paper />}

            {/* Note perso — le seul élément que le modèle ne peut pas deviner */}
            {(s.letter || s.phase === 'ready') && (
              <div style={{ margin: '0 16px 12px' }}>
                <button
                  onClick={() => patch({ noteOpen: !s.noteOpen })}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'transparent', border: 'none', padding: '4px 0',
                    color: s.note.trim() ? C.accent : C.muted,
                    fontSize: 11.5, fontFamily: C.font, cursor: 'pointer', outline: 'none',
                  }}
                >
                  {s.noteOpen ? <CaretDown size={12} weight="bold" /> : <CaretRight size={12} weight="bold" />}
                  <NotePencil size={13} />
                  Pourquoi cette boîte&nbsp;? {s.note.trim() && !s.noteOpen ? '· note ajoutée' : ''}
                </button>

                {s.noteOpen && (
                  <div style={{ marginTop: 8 }}>
                    <textarea
                      value={s.note}
                      onChange={e => patch({ note: e.target.value })}
                      rows={3}
                      placeholder="Ex : j'utilise leur appli tous les jours · une amie y travaille et m'en dit du bien · j'ai vu leur reportage sur…"
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: 13,
                        border: `1px solid ${C.border}`, background: '#FFFCF7',
                        color: C.text, fontSize: 12, lineHeight: 1.6, fontFamily: C.font,
                        outline: 'none', resize: 'none',
                      }}
                    />
                    <p style={{ fontSize: 10.5, color: C.muted, lineHeight: 1.5, margin: '6px 2px 8px' }}>
                      Ta vraie raison, avec tes mots. C'est ce qui rend la lettre unique — l'IA ne peut pas l'inventer.
                    </p>
                    <Btn onClick={regenerate} variant="primary" full loading={busy} disabled={!s.offer.trim()}>
                      <ArrowsClockwise size={13} weight="bold" />
                      {s.letter ? 'Régénérer avec ma note' : 'Générer avec ma note'}
                    </Btn>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            {s.letter && (
              <div style={{ padding: '2px 16px 16px', display: 'flex', gap: 8, alignItems: 'center' }}>
                <Btn onClick={regenerate} variant="ghost" loading={busy}>
                  <ArrowsClockwise size={13} /> Régénérer
                </Btn>
                <div style={{ flex: 1 }} />
                {s.hasTextarea && (
                  <Btn onClick={insert} variant={s.inserted ? 'success' : 'primary'} disabled={s.inserted}>
                    {s.inserted
                      ? <><CheckCircle size={13} weight="fill" color={C.sageFg} /> Insérée</>
                      : <><ArrowLineDown size={13} weight="bold" /> Insérer</>}
                  </Btn>
                )}
                <Btn onClick={download} variant={s.hasTextarea ? 'secondary' : 'primary'}>
                  <DownloadSimple size={13} weight="bold" /> PDF
                </Btn>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
