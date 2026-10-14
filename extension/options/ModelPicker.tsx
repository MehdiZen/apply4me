import { useEffect, useState } from 'react';
import { estimateCost, MODELS, modelFor, STEPS, type Provider, type Tier } from '../lib/models';
import { getSettings, setSettings } from '../lib/storage';
import { C } from '../ui/components';
import { Toggle } from './SettingsPanel';

// Choix du modèle : ce que vaut chacun, ce que coûtent 100 candidatures, et
// quel modèle fait quelle étape. L'option économie est enregistrée tout de
// suite, comme le modèle (voir App).
export function ModelPicker({ provider, model, setModel }: {
  provider: Provider;
  model: string;
  setModel: (id: string) => void;
}) {
  const [economy, setEconomy] = useState<boolean | null>(null);
  useEffect(() => { getSettings().then(s => setEconomy(s.economy)); }, []);
  const eco = economy ?? true;
  const toggle = async (v: boolean) => {
    setEconomy(v);
    await setSettings({ ...(await getSettings()), economy: v });
  };

  const models = MODELS[provider];
  const label = (id: string) => models.find(m => m.id === id)?.label ?? id;
  const per100 = (id: string) => `~${Math.round(estimateCost(provider, id, eco) * 100)} $`;
  const lower = modelFor(provider, model, 'lower', true);
  const hasLower = lower !== model;
  const TIER_NOTE: Record<Tier, string> = { main: '', lower: hasLower && eco ? ' (économie)' : '', fast: ' (toujours le plus rapide)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <p style={{ fontSize: 12, fontWeight: 500, color: '#9A8473' }}>Modèle</p>
        <p style={{ fontSize: 11, color: C.muted }}>coût estimé pour 100 candidatures complètes</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {models.map(m => {
          const on = model === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setModel(m.id)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                padding: '10px 14px', borderRadius: 10, textAlign: 'left',
                border: `1px solid ${on ? C.borderFocus : C.border}`,
                background: on ? C.accentDim : C.surface,
                fontFamily: C.font, cursor: 'pointer', outline: 'none',
                transition: `all 0.2s ${C.easeSpring}`,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: on ? C.accent : C.muted }} />
                <span style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 13, fontWeight: on ? 600 : 500, color: on ? C.text : '#9A8473' }}>
                    {m.label}
                    {m.recommended && (
                      <span style={{ marginLeft: 8, fontSize: 10, padding: '1px 6px', borderRadius: 9999, background: 'rgba(197,106,67,0.16)', color: C.accent }}>
                        recommandé
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: 11.5, color: C.muted }}>{m.role}</span>
                </span>
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: on ? C.text : C.muted, whiteSpace: 'nowrap' }}>{per100(m.id)}</span>
            </button>
          );
        })}
      </div>

      <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: hasLower ? 'pointer' : 'default', marginTop: 4, opacity: hasLower ? 1 : 0.6 }}>
        <Toggle on={eco && hasLower} onChange={v => { if (hasLower) toggle(v); }} />
        <span>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Économie</span>
          <span style={{ display: 'block', fontSize: 12, color: C.muted, lineHeight: 1.55, marginTop: 2 }}>
            {hasLower
              ? <>Le CV et le message au recruteur passent sur {label(lower)}. Ce sont des étapes contrôlées par le code : la perte de qualité est faible. L'analyse, la lettre et le juge restent sur {label(model)}.</>
              : <>{label(model)} est déjà le modèle le plus économique : tout tourne dessus.</>}
          </span>
        </span>
      </label>

      <div style={{ padding: '10px 14px', borderRadius: 12, background: C.sunken, border: `1px solid ${C.border}` }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 6 }}>Qui fait quoi</p>
        {STEPS.map(s => (
          <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, lineHeight: 1.8 }}>
            <span style={{ color: C.soft }}>{s.label}</span>
            <span style={{ color: C.text, fontWeight: 500 }}>
              {label(modelFor(provider, model, s.tier, eco))}
              <span style={{ color: C.muted, fontWeight: 400 }}>{TIER_NOTE[s.tier]}</span>
            </span>
          </div>
        ))}
        <p style={{ fontSize: 11, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>
          Estimations d'après la taille des prompts. Les modèles qui raisonnent (hors {models[0].label}) peuvent coûter jusqu'à deux fois plus.
        </p>
      </div>
    </div>
  );
}
