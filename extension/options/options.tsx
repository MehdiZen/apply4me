import { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Key, FileText, UserCircle, CheckCircle,
  Warning, CircleNotch, ArrowRight, ArrowLeft,
} from '@phosphor-icons/react';
import type { UserProfile } from '../types';
import { testConnection } from '../lib/llm';
import { extractCVFromFile } from '../lib/cv-extractor';

// ── tokens ───────────────────────────────────────────────────────────────────
const C = {
  bg: '#FBF5EC',
  surface: '#FFFCF7',
  surfaceHover: '#F7EFE2',
  border: '#EADBC7',
  borderFocus: '#C56A43',
  text: '#4A352A',
  muted: '#9A8473',
  subtle: '#C9B7A2',
  accent: '#C56A43',
  accentDim: '#F6E4C2',
  accentFg: '#FBF5EC',
  error: '#B23B2E',
  errorDim: '#F6E0D8',
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI Variable', system-ui, sans-serif",
  ease: 'cubic-bezier(0.32, 0.72, 0, 1)',
  easeSpring: 'cubic-bezier(0.16, 1, 0.3, 1)',
};

// ── logo dogeza ───────────────────────────────────────────────────────────────
function DogezaMark({ size = 30 }: { size?: number }) {
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

// ── Bezel card ────────────────────────────────────────────────────────────────
function BezelCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      padding: 1.5, borderRadius: 20,
      background: '#F3E7D6',
      border: `1px solid ${C.border}`,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)',
      ...style,
    }}>
      <div style={{
        borderRadius: 'calc(20px - 1.5px)',
        background: '#FFFCF7',
        boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.5)',
        overflow: 'hidden',
      }}>
        {children}
      </div>
    </div>
  );
}

// ── Input ─────────────────────────────────────────────────────────────────────
function Field({
  label, value, onChange, placeholder, type = 'text', multiline, rows = 3,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  multiline?: boolean;
  rows?: number;
  hint?: string;
}) {
  const [focused, setFocused] = useState(false);
  const base: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 10,
    border: `1px solid ${focused ? C.borderFocus : C.border}`,
    background: focused ? '#FBF1E4' : C.surface,
    color: C.text,
    fontSize: 13,
    fontFamily: C.font,
    outline: 'none',
    resize: 'none' as const,
    transition: `all 0.2s ${C.easeSpring}`,
    lineHeight: 1.6,
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{
        fontSize: 12, fontWeight: 500, color: '#9A8473', letterSpacing: '-0.01em',
      }}>
        {label}
      </label>
      {multiline
        ? <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            rows={rows}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={base}
          />
        : <input
            type={type}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={base}
          />}
      {hint && (
        <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{hint}</p>
      )}
    </div>
  );
}

// ── Pill button ───────────────────────────────────────────────────────────────
function PillBtn({
  onClick, disabled, loading, variant = 'primary', children,
}: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'ghost';
  children: React.ReactNode;
}) {
  const [down, setDown] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      onMouseDown={() => setDown(true)}
      onMouseUp={() => setDown(false)}
      onMouseLeave={() => setDown(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 22px', borderRadius: 9999,
        background: variant === 'primary' ? C.accent : '#F1E6D6',
        color: variant === 'primary' ? C.accentFg : C.text,
        border: `1px solid ${variant === 'primary' ? 'transparent' : C.border}`,
        fontSize: 13, fontWeight: 600, fontFamily: C.font,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transform: down && !disabled ? 'scale(0.97) translateY(1px)' : 'scale(1)',
        transition: `all 0.14s ${C.easeSpring}`,
        outline: 'none', letterSpacing: '-0.01em',
      }}
    >
      {loading
        ? <CircleNotch size={14} style={{ animation: 'spin 0.75s linear infinite' }} />
        : children}
    </button>
  );
}

// ── Step indicator ────────────────────────────────────────────────────────────
const STEPS = [
  { icon: Key, label: 'Connexion' },
  { icon: FileText, label: 'Votre CV' },
  { icon: UserCircle, label: 'Profil' },
];

function StepBar({ current }: { current: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        const done = i < current;
        const active = i === current;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '5px 12px 5px 8px',
              borderRadius: 9999,
              background: active ? C.accentDim : done ? '#F1E6D6' : 'transparent',
              border: `1px solid ${active ? C.borderFocus : done ? C.border : 'transparent'}`,
              transition: `all 0.4s ${C.ease}`,
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%',
                background: done ? C.accent : active ? 'rgba(197,106,67,0.22)' : '#EFE3D2',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: `all 0.4s ${C.ease}`,
                flexShrink: 0,
              }}>
                {done
                  ? <CheckCircle size={12} weight="fill" color={C.accentFg} />
                  : <Icon size={12} color={active ? C.accent : C.muted} />}
              </div>
              <span style={{
                fontSize: 11.5, fontWeight: active ? 600 : 400,
                color: active ? C.text : done ? '#8A7461' : C.muted,
                letterSpacing: '-0.01em',
                transition: `color 0.3s ${C.ease}`,
              }}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{
                width: 24, height: 1,
                background: i < current ? C.accent : C.border,
                transition: `background 0.5s ${C.ease}`,
                opacity: 0.4,
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Model lists ───────────────────────────────────────────────────────────────
const MODELS: Record<'anthropic' | 'openai', { id: string; label: string; desc: string; recommended?: boolean }[]> = {
  anthropic: [
    { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', desc: 'Rapide · pas cher' },
    { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', desc: 'Équilibré', recommended: true },
    { id: 'claude-opus-4-7', label: 'Opus 4.7', desc: 'Meilleur · plus lent' },
  ],
  openai: [
    { id: 'gpt-5.4-nano', label: 'GPT-5.4 nano', desc: '$0.20/1M · rapide', recommended: true },
    { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini', desc: '$0.75/1M · plus fin' },
    { id: 'gpt-5.5', label: 'GPT-5.5', desc: '$5/1M · flagship' },
  ],
};

// ── Step 1 — API ──────────────────────────────────────────────────────────────
function StepAPI({
  apiKey, setApiKey, provider, setProvider, model, setModel, onNext,
}: {
  apiKey: string;
  setApiKey: (v: string) => void;
  provider: 'anthropic' | 'openai';
  setProvider: (v: 'anthropic' | 'openai') => void;
  model: string;
  setModel: (v: string) => void;
  onNext: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<null | boolean>(null);

  const test = useCallback(async () => {
    if (!apiKey) return;
    setTesting(true);
    setResult(null);
    try {
      await chrome.storage.local.set({ apiKey, provider, model });
      const ok = await testConnection();
      setResult(ok);
    } catch {
      setResult(false);
    } finally {
      setTesting(false);
    }
  }, [apiKey, provider, model]);

  const handleProviderChange = (p: 'anthropic' | 'openai') => {
    setProvider(p);
    setModel(MODELS[p].find(m => m.recommended)?.id ?? MODELS[p][0].id);
    setResult(null);
  };

  const models = MODELS[provider];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '3px 10px', borderRadius: 9999,
          border: `1px solid ${C.border}`, marginBottom: 12,
          fontSize: 10, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>
          <Key size={9} /> Étape 1
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.04em', color: C.text, marginBottom: 6 }}>
          Connecte ton IA
        </h2>
        <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
          Ta clé reste stockée localement. Elle n'est jamais envoyée ailleurs qu'à ton provider.
        </p>
      </div>

      {/* Provider selector */}
      <div>
        <p style={{ fontSize: 12, fontWeight: 500, color: '#9A8473', marginBottom: 8 }}>Provider</p>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['anthropic', 'openai'] as const).map(p => (
            <button
              key={p}
              onClick={() => handleProviderChange(p)}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 10,
                border: `1px solid ${provider === p ? C.borderFocus : C.border}`,
                background: provider === p ? C.accentDim : C.surface,
                color: provider === p ? C.text : C.muted,
                fontSize: 12, fontWeight: provider === p ? 600 : 400,
                fontFamily: C.font, cursor: 'pointer',
                transition: `all 0.2s ${C.easeSpring}`, outline: 'none',
              }}
            >
              {p === 'anthropic' ? 'Anthropic' : 'OpenAI'}
            </button>
          ))}
        </div>
      </div>

      {/* Model selector */}
      <div>
        <p style={{ fontSize: 12, fontWeight: 500, color: '#9A8473', marginBottom: 8 }}>Modèle</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {models.map(m => (
            <button
              key={m.id}
              onClick={() => setModel(m.id)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', borderRadius: 10, textAlign: 'left',
                border: `1px solid ${model === m.id ? C.borderFocus : C.border}`,
                background: model === m.id ? C.accentDim : C.surface,
                fontFamily: C.font, cursor: 'pointer',
                transition: `all 0.2s ${C.easeSpring}`, outline: 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                  background: model === m.id ? C.accent : C.muted,
                  transition: `background 0.2s ${C.easeSpring}`,
                }} />
                <span style={{
                  fontSize: 13, fontWeight: model === m.id ? 600 : 400,
                  color: model === m.id ? C.text : '#9A8473',
                }}>
                  {m.label}
                </span>
                {m.recommended && (
                  <span style={{
                    fontSize: 10, padding: '1px 6px', borderRadius: 9999,
                    background: 'rgba(197,106,67,0.16)',
                    color: C.accent, letterSpacing: '0.04em',
                  }}>
                    recommandé
                  </span>
                )}
              </div>
              <span style={{ fontSize: 11, color: C.muted }}>{m.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <Field
        label="Clé API"
        value={apiKey}
        onChange={setApiKey}
        type="password"
        placeholder={provider === 'anthropic' ? 'sk-ant-…' : 'sk-…'}
      />

      {/* Test connection */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <PillBtn onClick={test} disabled={!apiKey} loading={testing} variant="ghost">
          Tester la connexion
        </PillBtn>
        {result !== null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {result
              ? <><CheckCircle size={14} color={C.accent} weight="fill" />
                  <span style={{ fontSize: 12, color: C.accent }}>Connexion réussie</span></>
              : <><Warning size={14} color={C.error} weight="fill" />
                  <span style={{ fontSize: 12, color: C.error }}>Clé invalide</span></>}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8 }}>
        <PillBtn onClick={onNext} disabled={!apiKey}>
          Continuer <ArrowRight size={14} weight="bold" />
        </PillBtn>
      </div>
    </div>
  );
}

// ── Step 2 — CV ───────────────────────────────────────────────────────────────
function StepCV({
  cvText, setCvText, onBack, onNext, apiKey, provider, model,
}: {
  cvText: string;
  setCvText: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
  apiKey: string;
  provider: 'anthropic' | 'openai';
  model: string;
}) {
  const [dragging, setDragging] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');

  const readFile = useCallback(async (file: File) => {
    const isPlainText = file.type === 'text/plain' || file.name.endsWith('.txt');

    if (isPlainText) {
      const reader = new FileReader();
      reader.onload = e => setCvText(e.target?.result as string ?? '');
      reader.readAsText(file);
      return;
    }

    setExtracting(true);
    setExtractError('');
    try {
      const text = await extractCVFromFile(file, apiKey, provider, model);
      setCvText(text);
    } catch (e) {
      setExtractError(e instanceof Error ? e.message : 'Erreur d\'extraction.');
    } finally {
      setExtracting(false);
    }
  }, [apiKey, provider, model, setCvText]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '3px 10px', borderRadius: 9999,
          border: `1px solid ${C.border}`, marginBottom: 12,
          fontSize: 10, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>
          <FileText size={9} /> Étape 2
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.04em', color: C.text, marginBottom: 6 }}>
          Ton CV
        </h2>
        <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
          Colle le texte de ton CV, ou dépose un fichier .txt / .pdf (texte extrait automatiquement).
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) readFile(file);
        }}
        style={{
          padding: '16px', borderRadius: 12,
          border: `1px dashed ${dragging ? C.accent : C.border}`,
          background: dragging ? C.accentDim : 'transparent',
          textAlign: 'center', cursor: 'pointer',
          transition: `all 0.2s ${C.easeSpring}`,
        }}
      >
        <input
          type="file"
          accept=".txt,.pdf,.doc,.docx"
          style={{ display: 'none' }}
          id="cv-upload"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) readFile(file);
          }}
        />
        <label htmlFor="cv-upload" style={{ cursor: extracting ? 'wait' : 'pointer' }}>
          {extracting
            ? <CircleNotch size={20} color={C.accent} style={{ marginBottom: 6, animation: 'spin 0.75s linear infinite' }} />
            : <FileText size={20} color={dragging ? C.accent : C.muted} style={{ marginBottom: 6 }} />}
          <p style={{ fontSize: 12, color: extracting ? C.accent : C.muted }}>
            {extracting
              ? 'Extraction en cours via IA…'
              : <>Dépose un fichier ou{' '}<span style={{ color: C.accent, textDecoration: 'underline' }}>parcourir</span></>}
          </p>
          <p style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
            {provider === 'anthropic' ? 'PDF, PNG, JPG' : 'PNG, JPG (PDF → Anthropic uniquement)'}
          </p>
        </label>
      </div>

      {extractError && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 8,
          padding: '10px 12px', borderRadius: 8,
          background: C.errorDim, border: `1px solid rgba(244,63,94,0.15)`,
        }}>
          <Warning size={14} color={C.error} weight="fill" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 12, color: C.error, lineHeight: 1.5 }}>{extractError}</p>
        </div>
      )}

      <Field
        label="Texte du CV"
        value={cvText}
        onChange={setCvText}
        multiline
        rows={10}
        placeholder="Expériences, formations, compétences techniques…"
        hint="Ce texte sera envoyé au LLM pour personnaliser les candidatures."
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8 }}>
        <PillBtn onClick={onBack} variant="ghost">
          <ArrowLeft size={14} weight="bold" /> Retour
        </PillBtn>
        <PillBtn onClick={onNext} disabled={!cvText.trim()}>
          Continuer <ArrowRight size={14} weight="bold" />
        </PillBtn>
      </div>
    </div>
  );
}

// ── Step 3 — Profile ──────────────────────────────────────────────────────────
function StepProfile({
  profile, setProfile, onBack, onSave, saving, saved,
}: {
  profile: Partial<UserProfile>;
  setProfile: (p: Partial<UserProfile>) => void;
  onBack: () => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}) {
  const set = (k: keyof UserProfile) => (v: string) =>
    setProfile({ ...profile, [k]: v });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '3px 10px', borderRadius: 9999,
          border: `1px solid ${C.border}`, marginBottom: 12,
          fontSize: 10, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>
          <UserCircle size={9} /> Étape 3
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.04em', color: C.text, marginBottom: 6 }}>
          Ton profil
        </h2>
        <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
          C'est ce qui rendra tes lettres fidèles à toi — pas des modèles génériques. Réponds avec tes mots, sois concret.
        </p>
      </div>

      <Field label="Quel poste / domaine vises-tu ?" value={profile.targetRole ?? ''} onChange={set('targetRole')}
        placeholder="Ex : infirmier en gériatrie, conseiller de vente, assistant administratif, chef de projet, développeur…"
        hint="Cadre la pertinence de chaque lettre." />

      <Field label="Ce qui te motive vraiment dans ce métier" value={profile.motivations ?? ''} onChange={set('motivations')} multiline rows={2}
        placeholder="Ex : aider concrètement les gens, voir un projet aboutir, transmettre, bien faire les choses jusqu'au bout…" />

      <Field label="Une réussite dont tu es fier (du concret)" value={profile.proudAchievement ?? ''} onChange={set('proudAchievement')} multiline rows={3}
        placeholder="Ex : j'ai réorganisé l'accueil d'un service et réduit l'attente de moitié ; j'ai lancé un rayon qui a fait +20% de ventes ; j'ai formé 3 nouveaux collègues."
        hint="Avec contexte, action, résultat — idéalement un chiffre. C'est ta meilleure preuve." />

      <Field label="Ce que tu apportes, au-delà de ton CV" value={profile.humanEdge ?? ''} onChange={set('humanEdge')} multiline rows={2}
        placeholder="Ex : je débloque les gens autour de moi, j'assume les sujets que personne ne veut prendre…"
        hint="Ce qui te distingue humainement, qu'un recruteur ne devine pas en lisant tes lignes." />

      <Field label="Quelques phrases avec tes mots" value={profile.writingSample ?? ''} onChange={set('writingSample')} multiline rows={3}
        placeholder="Écris comme tu parles, par exemple en expliquant à un ami pourquoi tu fais ce métier."
        hint="Le LLM imitera ce registre et ce rythme — c'est le secret pour que la lettre sonne comme toi." />

      <div style={{ display: 'flex', gap: 16 }}>
        <Field label="Ton de la lettre (optionnel)" value={profile.toneHint ?? ''} onChange={set('toneHint')}
          placeholder="Ex : direct, sobre, chaleureux" />
        <Field label="Disponibilité (optionnel)" value={profile.availability ?? ''} onChange={set('availability')}
          placeholder="Ex : 1 mois de préavis" />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8 }}>
        <PillBtn onClick={onBack} variant="ghost">
          <ArrowLeft size={14} weight="bold" /> Retour
        </PillBtn>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {saved && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle size={14} color={C.accent} weight="fill" />
              <span style={{ fontSize: 12, color: C.accent }}>Sauvegardé</span>
            </div>
          )}
          <PillBtn onClick={onSave} loading={saving}>
            Terminer <CheckCircle size={14} weight="bold" />
          </PillBtn>
        </div>
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
function App() {
  const [step, setStep] = useState(0);
  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState<'anthropic' | 'openai'>('anthropic');
  const [model, setModel] = useState<string>('claude-sonnet-4-6');
  const [cvText, setCvText] = useState('');
  const [profile, setProfile] = useState<Partial<UserProfile>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    chrome.storage.local.get(['apiKey', 'provider', 'model', 'profile'], res => {
      if (res['apiKey']) setApiKey(res['apiKey'] as string);
      if (res['provider']) setProvider(res['provider'] as 'anthropic' | 'openai');
      if (res['model']) setModel(res['model'] as string);
      if (res['profile']) {
        const p = res['profile'] as UserProfile;
        setCvText(p.cvText ?? '');
        setProfile(p);
      }
    });
  }, []);

  const saveStep1 = useCallback(async () => {
    await chrome.storage.local.set({ apiKey, provider, model });
    setStep(1);
  }, [apiKey, provider, model]);

  const saveStep2 = useCallback(async () => {
    setProfile(prev => ({ ...prev, cvText }));
    setStep(2);
  }, [cvText]);

  const saveAll = useCallback(async () => {
    setSaving(true);
    const full: UserProfile = {
      cvText,
      targetRole: profile.targetRole ?? '',
      motivations: profile.motivations ?? '',
      proudAchievement: profile.proudAchievement ?? '',
      humanEdge: profile.humanEdge ?? '',
      writingSample: profile.writingSample ?? '',
      toneHint: profile.toneHint,
      salaryExpectation: profile.salaryExpectation,
      availability: profile.availability,
    };
    await chrome.storage.local.set({ profile: full });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }, [cvText, profile]);

  const stepContent = [
    <StepAPI
      apiKey={apiKey} setApiKey={setApiKey}
      provider={provider} setProvider={setProvider}
      model={model} setModel={setModel}
      onNext={saveStep1}
    />,
    <StepCV
      cvText={cvText} setCvText={setCvText}
      onBack={() => setStep(0)} onNext={saveStep2}
      apiKey={apiKey} provider={provider} model={model}
    />,
    <StepProfile
      profile={profile} setProfile={setProfile}
      onBack={() => setStep(1)} onSave={saveAll}
      saving={saving} saved={saved}
    />,
  ];

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeSlide {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { min-height: 100vh; background: ${C.bg}; }
        body { -webkit-font-smoothing: antialiased; }
        input, textarea, button { font-family: inherit; }
        textarea { scrollbar-width: thin; scrollbar-color: #EADBC7 transparent; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #EADBC7; border-radius: 2px; }
      `}</style>

      {/* Bulles marron — ambiance chill */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', width: 360, height: 360, borderRadius: '50%', background: '#E7C9A8', opacity: 0.4, filter: 'blur(48px)', top: -110, right: -70 }} />
        <div style={{ position: 'absolute', width: 300, height: 300, borderRadius: '50%', background: '#C56A43', opacity: 0.14, filter: 'blur(60px)', bottom: 20, left: -90 }} />
        <div style={{ position: 'absolute', width: 220, height: 220, borderRadius: '50%', background: '#D98A5B', opacity: 0.16, filter: 'blur(52px)', top: '42%', left: '58%' }} />
        <div style={{ position: 'absolute', width: 180, height: 180, borderRadius: '50%', background: '#B8895E', opacity: 0.18, filter: 'blur(46px)', bottom: -50, right: '18%' }} />
        <div style={{ position: 'absolute', width: 130, height: 130, borderRadius: '50%', background: '#E8A23D', opacity: 0.12, filter: 'blur(40px)', top: '12%', left: '30%' }} />
      </div>

      <div style={{
        position: 'relative', zIndex: 1,
        maxWidth: 680, margin: '0 auto',
        padding: '52px 24px 80px',
        fontFamily: C.font, color: C.text,
        minHeight: '100vh',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 40 }}>
          <DogezaMark size={32} />
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.03em' }}>
            apply4me
          </span>
          <span style={{
            marginLeft: 4, fontSize: 10, color: C.muted,
            padding: '2px 7px', borderRadius: 9999,
            border: `1px solid ${C.border}`,
            letterSpacing: '0.06em', textTransform: 'uppercase',
          }}>
            Configuration
          </span>
        </div>

        {/* Step bar */}
        <div style={{ marginBottom: 36 }}>
          <StepBar current={step} />
        </div>

        {/* Step content */}
        <BezelCard>
          <div
            key={step}
            style={{
              padding: '36px 40px',
              animation: 'fadeSlide 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
            }}
          >
            {stepContent[step]}
          </div>
        </BezelCard>
      </div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
