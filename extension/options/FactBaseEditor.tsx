import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, CaretDown, CaretRight, Database, DownloadSimple,
  Plus, PushPin, Sparkle, Trash, UploadSimple,
} from '@phosphor-icons/react';
import type { Experience, FactBase, LetterLang, Skill, SkillGroupLabel, SkillLevel } from '../types';
import {
  buildFactBaseFromCV, extractNumbers, formatYears, linkEvidence,
  normalizeName, totalExperienceMonths,
} from '../lib/factbase';
import { importProfileFile } from '../lib/bundle';
import { getFactBase, setFactBase } from '../lib/storage';
import { C, ErrorBox, Field, PillBtn, StepHeader } from '../ui/components';

const LEVEL_LABEL: Record<SkillLevel, string> = {
  expert: 'Expert',
  prod: 'Pratiqué en poste',
  touched: 'Notions',
  learning: 'Hors cadre pro',
};

const LEVEL_COLOR: Record<SkillLevel, string> = {
  expert: '#8F4A2C',
  prod: C.accent,
  touched: '#B8895E',
  learning: '#C9B7A2',
};

function clone(base: FactBase): FactBase {
  return JSON.parse(JSON.stringify(base)) as FactBase;
}

export function StepFactBase({
  cvText, onBack, onNext,
}: {
  cvText: string;
  onBack: () => void;
  onNext: () => void;
}) {
  const [base, setBase] = useState<FactBase | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState('');
  const [secondCv, setSecondCv] = useState('');
  const [lang, setLang] = useState<LetterLang>('fr');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getFactBase().then(b => { setBase(b); setLoaded(true); });
  }, []);

  // Toute modification passe par ici : on recalcule chiffres et preuves,
  // qui servent de garde-fous au générateur.
  const update = useCallback((fn: (b: FactBase) => void) => {
    setBase(prev => {
      if (!prev) return prev;
      const next = clone(prev);
      fn(next);
      for (const e of next.experiences) {
        for (const g of e.groups) {
          for (const f of g.facts) {
            f.numbers = [...new Set([...extractNumbers(f.text.fr), ...extractNumbers(f.text.en)])];
          }
        }
      }
      linkEvidence(next);
      return next;
    });
    setDirty(true);
  }, []);

  const save = useCallback(async () => {
    if (base) await setFactBase(base);
    setDirty(false);
  }, [base]);

  const build = useCallback(async () => {
    setBuilding(true);
    setError('');
    try {
      const b = await buildFactBaseFromCV(cvText, secondCv);
      setBase(b);
      await setFactBase(b);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Échec de la construction.');
    } finally {
      setBuilding(false);
    }
  }, [cvText, secondCv]);

  const exportJSON = useCallback(() => {
    if (!base) return;
    const blob = new Blob([JSON.stringify(base, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'apply4me-base-de-faits.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [base]);

  // Arrivée depuis l'étape CV sans base : on la construit directement,
  // l'utilisateur n'a plus qu'à relire.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (loaded && !base && cvText.trim() && !autoStarted.current) {
      autoStarted.current = true;
      build();
    }
  }, [loaded, base, cvText, build]);

  const importJSON = useCallback(async (file: File) => {
    setError('');
    try {
      const { factBase } = await importProfileFile(file);
      if (!factBase) throw new Error();
      setBase(factBase);
      setDirty(false);
    } catch {
      setError('Fichier JSON invalide.');
    }
  }, []);

  const goNext = useCallback(async () => {
    await save();
    onNext();
  }, [save, onNext]);

  if (!loaded) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <StepHeader
        icon={<Database size={9} />}
        step="Étape 3"
        title="Ta base de faits"
        text="Ton CV découpé en faits vérifiables. C'est la seule source utilisée pour adapter ton CV à chaque offre : rien n'y est inventé, tu peux tout corriger."
      />

      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) importJSON(f);
          e.target.value = '';
        }}
      />

      {!base && (
        <>
          <Field
            label="Ton CV dans l'autre langue (optionnel)"
            value={secondCv}
            onChange={setSecondCv}
            multiline
            rows={4}
            placeholder="Colle ici la version anglaise (ou française) de ton CV si tu en as une. Sinon, elle sera traduite fidèlement."
            hint="Avec les deux versions, le CV généré reprend tes vraies phrases dans chaque langue."
          />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <PillBtn onClick={build} loading={building} disabled={!cvText.trim()}>
              <Sparkle size={14} weight="fill" /> Construire depuis mon CV
            </PillBtn>
            <PillBtn onClick={() => fileInput.current?.click()} variant="ghost">
              <UploadSimple size={14} /> Importer un JSON
            </PillBtn>
          </div>
          {building && (
            <p style={{ fontSize: 12, color: C.muted }}>
              Analyse du CV en cours, ça peut prendre une minute…
            </p>
          )}
        </>
      )}

      {error && <ErrorBox message={error} />}

      {base && (
        <>
          <Stats base={base} lang={lang} setLang={setLang} />

          <Section title="Expériences">
            {base.experiences.map((exp, ei) => (
              <ExperienceCard
                key={exp.id}
                exp={exp}
                lang={lang}
                onFactChange={(gi, fi, text) => update(b => {
                  b.experiences[ei].groups[gi].facts[fi].text[lang] = text;
                })}
                onFactDelete={(gi, fi) => update(b => {
                  b.experiences[ei].groups[gi].facts.splice(fi, 1);
                })}
              />
            ))}
          </Section>

          <Section title="Compétences">
            <SkillsEditor
              skills={base.skills}
              groups={base.skillGroups}
              onChange={(i, patch) => update(b => { Object.assign(b.skills[i], patch); })}
              onDelete={i => update(b => { b.skills.splice(i, 1); })}
              onAdd={(name, level) => update(b => {
                if (b.skills.some(s => normalizeName(s.name) === normalizeName(name))) return;
                b.skills.push({
                  name, aliases: [], level, group: b.skillGroups.at(-1)?.id ?? null, evidence: [], source: 'user',
                });
              })}
            />
          </Section>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <PillBtn onClick={exportJSON} variant="ghost">
              <DownloadSimple size={14} /> Exporter
            </PillBtn>
            <PillBtn onClick={() => fileInput.current?.click()} variant="ghost">
              <UploadSimple size={14} /> Importer
            </PillBtn>
            <PillBtn
              onClick={() => {
                if (confirm('Reconstruire la base depuis le CV ? Tes corrections seront perdues.')) setBase(null);
              }}
              variant="ghost"
            >
              <Sparkle size={14} /> Reconstruire
            </PillBtn>
          </div>
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8 }}>
        <PillBtn onClick={onBack} variant="ghost">
          <ArrowLeft size={14} weight="bold" /> Retour
        </PillBtn>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {dirty && <span style={{ fontSize: 12, color: C.muted }}>Modifications non enregistrées</span>}
          <PillBtn onClick={goNext} disabled={!base}>
            Continuer <ArrowRight size={14} weight="bold" />
          </PillBtn>
        </div>
      </div>
    </div>
  );
}

// ── Sous-composants ───────────────────────────────────────────────────────────

function Stats({ base, lang, setLang }: { base: FactBase; lang: LetterLang; setLang: (l: LetterLang) => void }) {
  const facts = base.experiences.reduce((n, e) => n + e.groups.reduce((m, g) => m + g.facts.length, 0), 0);
  const items = [
    formatYears(totalExperienceMonths(base)) + " d'expérience",
    `${base.experiences.length} expériences`,
    `${facts} faits`,
    `${base.skills.length} compétences`,
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {items.map(t => (
          <span key={t} style={{
            fontSize: 11.5, padding: '4px 10px', borderRadius: 9999,
            background: C.accentDim, color: C.text,
          }}>{t}</span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {(['fr', 'en'] as const).map(l => (
          <button
            key={l}
            onClick={() => setLang(l)}
            style={{
              padding: '4px 10px', borderRadius: 9999, fontSize: 11, fontWeight: 600,
              border: `1px solid ${lang === l ? C.borderFocus : C.border}`,
              background: lang === l ? C.accentDim : 'transparent',
              color: lang === l ? C.text : C.muted, cursor: 'pointer',
            }}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{
        fontSize: 11, fontWeight: 600, color: C.muted,
        letterSpacing: '0.08em', textTransform: 'uppercase',
      }}>{title}</p>
      {children}
    </div>
  );
}

function ExperienceCard({
  exp, lang, onFactChange, onFactDelete,
}: {
  exp: Experience;
  lang: LetterLang;
  onFactChange: (gi: number, fi: number, text: string) => void;
  onFactDelete: (gi: number, fi: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const count = exp.groups.reduce((n, g) => n + g.facts.length, 0);
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: C.surface }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', background: 'transparent', border: 'none',
          cursor: 'pointer', textAlign: 'left', color: C.text,
        }}
      >
        {open ? <CaretDown size={12} /> : <CaretRight size={12} />}
        <span style={{ fontSize: 13, fontWeight: 600 }}>{exp.role[lang]}</span>
        <span style={{ fontSize: 12, color: C.muted }}>· {exp.company}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: C.muted }}>
          {exp.start} → {exp.end ?? (lang === 'fr' ? "aujourd'hui" : 'present')} · {count} fait{count > 1 ? 's' : ''}
        </span>
      </button>
      {open && (
        <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {exp.groups.map((g, gi) => (
            <div key={gi} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {g.title && <p style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>{g.title[lang]}</p>}
              {g.facts.map((f, fi) => (
                <div key={f.id} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <Field
                      label=""
                      value={f.text[lang]}
                      onChange={t => onFactChange(gi, fi, t)}
                      multiline
                      rows={2}
                    />
                    {f.numbers.length > 0 && (
                      <p style={{ fontSize: 10.5, color: C.subtle, marginTop: 3 }}>
                        Chiffres autorisés : {f.numbers.join(' · ')}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => onFactDelete(gi, fi)}
                    title="Supprimer ce fait"
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 6, color: C.subtle }}
                  >
                    <Trash size={14} />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SkillsEditor({
  skills, groups, onChange, onDelete, onAdd,
}: {
  skills: Skill[];
  groups: SkillGroupLabel[];
  onChange: (i: number, patch: Partial<Skill>) => void;
  onDelete: (i: number) => void;
  onAdd: (name: string, level: SkillLevel) => void;
}) {
  const [name, setName] = useState('');
  const [level, setLevel] = useState<SkillLevel>('touched');
  const select = {
    border: 'none', background: 'transparent', color: C.muted,
    fontSize: 11, cursor: 'pointer', outline: 'none', maxWidth: 120,
  } as const;

  // Une rubrique par bloc, comme dans la ligne Compétences du CV ; à la fin,
  // les compétences prouvées par les expériences mais absentes de cette ligne.
  const blocks: { id: string | null; label: string }[] = [
    ...groups.map(g => ({ id: g.id as string | null, label: g.label.fr })),
    ...(groups.length ? [{ id: null, label: 'Hors ligne Compétences' }] : [{ id: null, label: 'Compétences' }]),
  ];
  const known = new Set(groups.map(g => g.id));
  const blockOf = (s: Skill) => (s.group && known.has(s.group) ? s.group : null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {blocks.map(b => {
        const list = skills.map((s, i) => ({ s, i })).filter(({ s }) => blockOf(s) === b.id);
        if (!list.length && b.id === null && groups.length) return null;
        return (
          <div key={b.id ?? '_none'} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>{b.label}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {list.map(({ s, i }) => (
                <div
                  key={s.name}
                  title={s.evidence.length ? `Prouvé par ${s.evidence.length} fait(s)` : 'Aucun fait ne le prouve'}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '3px 4px 3px 10px', borderRadius: 9999,
                    border: `1px solid ${s.pinned ? C.borderFocus : C.border}`, background: C.surface, fontSize: 12,
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: LEVEL_COLOR[s.level] }} />
                  <span style={{ color: C.text }}>{s.name}</span>
                  <select value={s.level} onChange={e => onChange(i, { level: e.target.value as SkillLevel })} style={select}>
                    {(Object.keys(LEVEL_LABEL) as SkillLevel[]).map(l => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
                  </select>
                  {groups.length > 0 && (
                    <select
                      value={blockOf(s) ?? ''}
                      onChange={e => onChange(i, { group: e.target.value || null })}
                      title="Rubrique du CV"
                      style={select}
                    >
                      {groups.map(g => <option key={g.id} value={g.id}>{g.label.fr}</option>)}
                      <option value="">Hors ligne</option>
                    </select>
                  )}
                  <button
                    onClick={() => onChange(i, { pinned: !s.pinned })}
                    title={s.pinned ? 'Affichée sur tous les CV (cliquer pour retirer)' : 'Afficher sur tous les CV'}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 2, color: s.pinned ? C.accent : C.subtle, display: 'flex' }}
                  >
                    <PushPin size={11} weight={s.pinned ? 'fill' : 'regular'} />
                  </button>
                  <button
                    onClick={() => onDelete(i)}
                    title="Retirer"
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 2, color: C.subtle, display: 'flex' }}
                  >
                    <Trash size={11} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <Field label="" value={name} onChange={setName} placeholder="Ajouter une compétence" />
        </div>
        <select
          value={level}
          onChange={e => setLevel(e.target.value as SkillLevel)}
          style={{
            padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.border}`,
            background: C.surface, color: C.text, fontSize: 12,
          }}
        >
          {(Object.keys(LEVEL_LABEL) as SkillLevel[]).map(l => (
            <option key={l} value={l}>{LEVEL_LABEL[l]}</option>
          ))}
        </select>
        <PillBtn
          onClick={() => { if (name.trim()) { onAdd(name.trim(), level); setName(''); } }}
          variant="ghost"
          disabled={!name.trim()}
        >
          <Plus size={14} />
        </PillBtn>
      </div>
      <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
        « Hors cadre pro » : pratiquée en formation, en projet personnel ou en bénévolat. Elle apparaît sur le CV, mais la lettre ne la présente jamais comme une expérience en poste. L'épingle l'affiche sur tous les CV, même quand l'offre ne la demande pas. Les compétences demandées par une offre et absentes d'ici te seront proposées au cas par cas.
      </p>
    </div>
  );
}