import { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Key, FileText, UserCircle, CheckCircle,
  Warning, CircleNotch, ArrowRight, ArrowLeft, Database, UploadSimple, DownloadSimple,
} from '@phosphor-icons/react';
import { exportProfileFile, importProfileFile, loadBundledSeed } from '../lib/bundle';
import type { SearchPreferences, UserProfile } from '../types';
import { testConnection } from '../lib/llm';
import { defaultModel, upgradeModel } from '../lib/storage';
import { ModelPicker } from './ModelPicker';
import { MODELS } from '../lib/models';
import { extractCVFromFile } from '../lib/cv-extractor';
import { C, Field, PillBtn } from '../ui/components';
import { Brand, globalCSS } from '../ui/theme';
import { StepFactBase } from './FactBaseEditor';
import { ApplicationsView } from './Applications';
import { SettingsPanel } from './SettingsPanel';
import { PreferencesEditor } from './PreferencesEditor';
import { EMPTY_PREFERENCES } from '../lib/preferences';

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


// ── Step indicator ────────────────────────────────────────────────────────────
const STEPS = [
  { icon: Key, label: 'Connexion' },
  { icon: FileText, label: 'Votre CV' },
  { icon: Database, label: 'Base de faits' },
  { icon: UserCircle, label: 'Profil' },
];

// Une fois la configuration faite, toutes les étapes restent accessibles :
// on revient corriger sa base ou son profil sans refaire le parcours.
function StepBar({ current, reachable, onSelect }: { current: number; reachable: number; onSelect: (i: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        const done = i < current;
        const active = i === current;
        const clickable = i <= reachable && !active;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
            <div
              onClick={() => clickable && onSelect(i)}
              style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '5px 12px 5px 8px',
              borderRadius: 9999,
              background: active ? C.accentDim : done ? '#F1E6D6' : 'transparent',
              border: `1px solid ${active ? C.borderFocus : done ? C.border : 'transparent'}`,
              transition: `all 0.4s ${C.ease}`,
              cursor: clickable ? 'pointer' : 'default',
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

// ── Step 1 — API ──────────────────────────────────────────────────────────────
function StepAPI({
  apiKey, setApiKey, provider, setProvider, model, setModel, onNext, onImport, imported,
}: {
  apiKey: string;
  setApiKey: (v: string) => void;
  provider: 'anthropic' | 'openai';
  setProvider: (v: 'anthropic' | 'openai') => void;
  model: string;
  setModel: (v: string) => void;
  onNext: () => void;
  onImport: (file: File) => void;
  imported: boolean;
}) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<null | boolean>(null);
  const importInput = useRef<HTMLInputElement>(null);

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
    setModel(defaultModel(p));
    setResult(null);
  };

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

      <ModelPicker provider={provider} model={model} setModel={setModel} />

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

      {/* Profil déjà prêt : CV, base de faits et réponses en un fichier */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        padding: '12px 14px', borderRadius: 12, border: `1px dashed ${C.border}`,
      }}>
        <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
          {imported
            ? 'Profil importé. Vérifie-le dans les étapes suivantes.'
            : 'Tu as déjà un fichier de profil apply4me ? Importe-le et passe directement à la relecture.'}
        </p>
        <input
          ref={importInput}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) onImport(f);
            e.target.value = '';
          }}
        />
        <PillBtn onClick={() => importInput.current?.click()} variant="ghost">
          {imported ? <CheckCircle size={14} weight="fill" color={C.accent} /> : <UploadSimple size={14} />} Importer
        </PillBtn>
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
  profile, setProfile, onPreferences, onBack, onSave, saving, saved,
}: {
  profile: Partial<UserProfile>;
  setProfile: (p: Partial<UserProfile>) => void;
  onPreferences: (p: SearchPreferences) => void;
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
          <UserCircle size={9} /> Étape 4
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

      <Field label="Ce que les gens apprécient chez toi au travail" value={profile.humanEdge ?? ''} onChange={set('humanEdge')} multiline rows={2}
        placeholder="Ex : je garde mon calme dans le rush, je remarque vite quand un collègue ne va pas bien, je tiens parole même sous pression, les nouveaux se sentent à l'aise avec moi…"
        hint="Ce qui te distingue humainement, au-delà de ton CV." />

      <Field label="Quelques phrases avec tes mots" value={profile.writingSample ?? ''} onChange={set('writingSample')} multiline rows={3}
        placeholder="Écris comme tu parles, par exemple en expliquant à un ami pourquoi tu fais ce métier."
        hint="Le LLM imitera ce registre et ce rythme — c'est le secret pour que la lettre sonne comme toi." />

      <Field label="Autre chose d'important à savoir sur toi ?" value={profile.otherContext ?? ''} onChange={set('otherContext')} multiline rows={2}
        placeholder="Ex : je change de secteur après 10 ans en restauration, je reviens d'un congé parental, j'ai une contrainte de mobilité…"
        hint="Optionnel — un contexte qui ne rentre nulle part ailleurs mais que tu veux que la lettre prenne en compte." />

      <div style={{ display: 'flex', gap: 16 }}>
        <Field label="Ton de la lettre (optionnel)" value={profile.toneHint ?? ''} onChange={set('toneHint')}
          placeholder="Ex : direct, sobre, chaleureux" />
        <Field label="Disponibilité (optionnel)" value={profile.availability ?? ''} onChange={set('availability')}
          placeholder="Ex : 1 mois de préavis" />
      </div>

      <div style={{ paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.03em', color: C.text, margin: '12px 0 4px' }}>Ce que je cherche</h3>
        <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6, marginBottom: 14 }}>
          Ce qui rend un poste bon pour toi, en plus de tes compétences. Chaque offre te dira pourquoi oui, pourquoi non, ligne de l'annonce à l'appui.
        </p>
        <PreferencesEditor value={profile.preferences ?? EMPTY_PREFERENCES} onChange={onPreferences} />
      </div>

      <SettingsPanel />

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
          <PillBtn onClick={async () => { await onSave(); await exportProfileFile(); }} variant="ghost">
            <DownloadSimple size={14} /> Exporter mon profil
          </PillBtn>
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
  const [model, setModel] = useState<string>('claude-sonnet-5-5');
  const [cvText, setCvText] = useState('');
  const [profile, setProfile] = useState<Partial<UserProfile>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [reachable, setReachable] = useState(0);
  const [imported, setImported] = useState(false);
  const [baseKey, setBaseKey] = useState(0); // remonte l'éditeur après un import
  const [loaded, setLoaded] = useState(false); // réglages lus : on peut enregistrer sans écraser
  const [view, setView] = useState<'config' | 'apps'>(location.hash === '#apps' ? 'apps' : 'config');

  const goTo = useCallback((i: number) => {
    setStep(i);
    setReachable(r => Math.max(r, i));
  }, []);

  useEffect(() => {
    (async () => {
      // Build personnel : profil embarqué chargé au premier lancement.
      const seeded = await loadBundledSeed();
      if (seeded) setImported(true);
      const res = await chrome.storage.local.get(['apiKey', 'provider', 'model', 'profile', 'factBase']);
      if (res['apiKey']) setApiKey(res['apiKey'] as string);
      // Modèle absent, ancien ou d'un autre fournisseur : celui recommandé chez
      // le fournisseur enregistré, pour ne jamais garder un réglage incohérent.
      const p = (res['provider'] as 'anthropic' | 'openai' | undefined) ?? 'anthropic';
      const m = upgradeModel(res['model'] as string | undefined);
      setProvider(p);
      setModel(m && MODELS[p].some(x => x.id === m) ? m : defaultModel(p));
      if (res['profile']) {
        const p = res['profile'] as UserProfile;
        setCvText(p.cvText ?? '');
        setProfile(p);
      }
      // Profil et base prêts : tout est accessible. Avec une clé, on ouvre sur
      // la base de faits ; sans, on reste sur la connexion.
      if (res['profile'] && res['factBase']) {
        setReachable(STEPS.length - 1);
        if (res['apiKey']) setStep(2);
      }
      setLoaded(true);
    })();
  }, []);

  // Fournisseur, modèle et clé enregistrés dès qu'ils changent, pas seulement
  // à « Suivant » : un rafraîchissement ne revient plus au modèle par défaut.
  useEffect(() => {
    if (!loaded) return;
    chrome.storage.local.set({ provider, model, ...(apiKey ? { apiKey } : {}) });
  }, [loaded, provider, model, apiKey]);

  const importProfile = useCallback(async (file: File) => {
    try {
      const { profile: p, factBase } = await importProfileFile(file);
      if (p) {
        setProfile(p);
        setCvText(p.cvText);
      }
      setImported(true);
      setBaseKey(k => k + 1);
      if (p && factBase) setReachable(STEPS.length - 1);
    } catch {
      alert('Fichier de profil invalide.');
    }
  }, []);

  const saveStep1 = useCallback(async () => {
    await chrome.storage.local.set({ apiKey, provider, model });
    goTo(1);
  }, [apiKey, provider, model, goTo]);

  // Le CV est enregistré dès cette étape : quitter la page plus tard ne le perd pas.
  const saveStep2 = useCallback(async () => {
    const next = { ...profile, cvText };
    setProfile(next);
    await chrome.storage.local.set({ profile: next });
    goTo(2);
  }, [cvText, profile, goTo]);

  const saveAll = useCallback(async () => {
    setSaving(true);
    const full: UserProfile = {
      cvText,
      targetRole: profile.targetRole ?? '',
      motivations: profile.motivations ?? '',
      proudAchievement: profile.proudAchievement ?? '',
      humanEdge: profile.humanEdge ?? '',
      writingSample: profile.writingSample ?? '',
      otherContext: profile.otherContext,
      toneHint: profile.toneHint,
      salaryExpectation: profile.salaryExpectation,
      availability: profile.availability,
      preferences: profile.preferences,
    };
    await chrome.storage.local.set({ profile: full });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }, [cvText, profile]);

  // Préférences enregistrées dès qu'elles changent : un rafraîchissement ne
  // les perd pas, et le popup juge les offres avec la version à jour.
  const savePreferences = useCallback(async (prefs: SearchPreferences) => {
    setProfile(p => ({ ...p, preferences: prefs }));
    const stored = (await chrome.storage.local.get('profile'))['profile'] as UserProfile | undefined;
    if (stored) await chrome.storage.local.set({ profile: { ...stored, preferences: prefs } });
  }, []);

  const stepContent = [
    <StepAPI
      apiKey={apiKey} setApiKey={setApiKey}
      provider={provider} setProvider={setProvider}
      model={model} setModel={setModel}
      onNext={saveStep1}
      onImport={importProfile} imported={imported}
    />,
    <StepCV
      cvText={cvText} setCvText={setCvText}
      onBack={() => setStep(0)} onNext={saveStep2}
      apiKey={apiKey} provider={provider} model={model}
    />,
    <StepFactBase
      key={baseKey}
      cvText={cvText}
      onBack={() => setStep(1)} onNext={() => goTo(3)}
    />,
    <StepProfile
      profile={profile} setProfile={setProfile} onPreferences={savePreferences}
      onBack={() => setStep(2)} onSave={saveAll}
      saving={saving} saved={saved}
    />,
  ];

  return (
    <>
      <style>{globalCSS + `
        html, body { min-height: 100vh; }
        textarea { scrollbar-width: thin; scrollbar-color: ${C.border} transparent; }
      `}</style>

      {/* Bulles marron, ambiance chill */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', width: 360, height: 360, borderRadius: '50%', background: '#E7C9A8', opacity: 0.4, filter: 'blur(48px)', top: -110, right: -70 }} />
        <div style={{ position: 'absolute', width: 300, height: 300, borderRadius: '50%', background: '#C56A43', opacity: 0.14, filter: 'blur(60px)', bottom: 20, left: -90 }} />
        <div style={{ position: 'absolute', width: 220, height: 220, borderRadius: '50%', background: '#D98A5B', opacity: 0.16, filter: 'blur(52px)', top: '42%', left: '58%' }} />
        <div style={{ position: 'absolute', width: 180, height: 180, borderRadius: '50%', background: '#B8895E', opacity: 0.18, filter: 'blur(46px)', bottom: -50, right: '18%' }} />
        <div style={{ position: 'absolute', width: 130, height: 130, borderRadius: '50%', background: '#E8A23D', opacity: 0.12, filter: 'blur(40px)', top: '12%', left: '30%' }} />
      </div>

      <div style={{
        position: 'relative', zIndex: 1,
        maxWidth: view === 'apps' ? 860 : 720, margin: '0 auto',
        padding: '40px 24px 80px',
        fontFamily: C.font, color: C.text,
        minHeight: '100vh',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 34 }}>
          <Brand size={34} />
          <div style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 999, background: C.sunken, border: `1px solid ${C.border}` }}>
            {([['config', 'Mon profil'], ['apps', 'Candidatures']] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  padding: '7px 16px', borderRadius: 999, border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: 600,
                  background: view === v ? C.surface : 'transparent',
                  color: view === v ? C.text : C.muted,
                  boxShadow: view === v ? '0 1px 3px rgba(63,45,35,0.12)' : 'none',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {view === 'apps' ? <ApplicationsView /> : (
          <>
            {/* Step bar */}
            <div style={{ marginBottom: 28 }}>
              <StepBar current={step} reachable={reachable} onSelect={setStep} />
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
          </>
        )}
      </div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
