import { useEffect, useState } from 'react';
import type { Settings } from '../types';
import { getSettings, setSettings } from '../lib/storage';
import { C } from '../ui/components';

// Réglages du verdict, enregistrés à chaque changement.
export function SettingsPanel() {
  const [s, setS] = useState<Settings | null>(null);
  useEffect(() => { getSettings().then(setS); }, []);
  if (!s) return null;

  // Relu au moment d'écrire : l'option économie se règle ailleurs sur la page.
  const update = async (patch: Partial<Settings>) => {
    setS({ ...s, ...patch });
    await setSettings({ ...(await getSettings()), ...patch });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 18, borderRadius: 18, background: C.sunken, border: `1px solid ${C.border}` }}>
      <p style={{ fontFamily: C.display, fontSize: 17, fontWeight: 600 }}>Règles du verdict</p>

      <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }}>
        <Toggle on={s.allowStretch} onChange={v => update({ allowStretch: v })} />
        <span>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Proposer d'ajouter au CV ce que l'offre demande</span>
          <span style={{ display: 'block', fontSize: 12, color: C.muted, lineHeight: 1.55, marginTop: 2 }}>
            Les compétences demandées et absentes de ta base te sont proposées en cases à cocher. Elles vont uniquement dans la ligne Compétences, jamais dans tes expériences, et la lettre les présente comme des bases en cours d'acquisition.
          </span>
        </span>
      </label>

      <Row label="Skip si l'expérience est sous" hint="du minimum demandé. Les annonces gonflent souvent ce chiffre.">
        <select value={s.yearsTolerance} onChange={e => update({ yearsTolerance: Number(e.target.value) })} style={select}>
          {[0.5, 0.6, 0.7, 0.8, 1].map(v => <option key={v} value={v}>{Math.round(v * 100)} %</option>)}
        </select>
      </Row>

      <Row label="Skip si le score est sous" hint="sur 100, même sans écart bloquant.">
        <select value={s.scoreThreshold} onChange={e => update({ scoreThreshold: Number(e.target.value) })} style={select}>
          {[30, 40, 50, 60, 70].map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </Row>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13, color: C.text }}>
      <span>{label}</span>
      {children}
      <span style={{ fontSize: 12, color: C.muted }}>{hint}</span>
    </div>
  );
}

export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={e => { e.preventDefault(); onChange(!on); }}
      style={{
        width: 38, height: 22, borderRadius: 999, border: 'none', flexShrink: 0, marginTop: 1, cursor: 'pointer',
        background: on ? C.accent : C.borderStrong, position: 'relative', transition: `background .2s ${C.ease}`,
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: on ? 19 : 3, width: 16, height: 16, borderRadius: '50%',
        background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: `left .2s ${C.easeSpring}`,
      }} />
    </button>
  );
}

const select: React.CSSProperties = {
  padding: '5px 10px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface,
  color: C.text, fontSize: 13, fontWeight: 600, outline: 'none', cursor: 'pointer',
};
