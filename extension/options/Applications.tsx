import { useEffect, useState } from 'react';
import { ArrowSquareOut, CaretDown, CaretRight, DownloadSimple, Trash } from '@phosphor-icons/react';
import type { Application, ApplicationStatus } from '../types';
import { listApplications, removeApplication, setStatus, STATUS_LABEL, toCSV } from '../lib/log';
import { C, PillBtn } from '../ui/components';
import { ScoreRing } from '../ui/theme';

const STATUSES: ApplicationStatus[] = ['generated', 'sent', 'interview', 'rejected', 'offer'];

const STATUS_TONE: Record<ApplicationStatus, [string, string]> = {
  generated: ['#F1E6D6', '#7A6450'],
  sent: [C.accentDim, C.honeyFg],
  interview: [C.sage, C.sageFg],
  rejected: [C.brick, C.brickFg],
  offer: ['#D9E8C8', '#3D5A22'],
};

// Le journal sert aussi à calibrer : le taux de réponse par tranche de score
// dit si le seuil est bien placé.
function Stats({ apps }: { apps: Application[] }) {
  const sent = apps.filter(a => a.status !== 'generated');
  const answered = sent.filter(a => a.status === 'interview' || a.status === 'offer');
  const forced = sent.filter(a => a.forced);
  const forcedOk = forced.filter(a => a.status === 'interview' || a.status === 'offer');
  const items = [
    { k: 'Préparées', v: String(apps.length) },
    { k: 'Envoyées', v: String(sent.length) },
    { k: 'Entretiens', v: sent.length ? `${answered.length} (${Math.round((100 * answered.length) / sent.length)} %)` : '0' },
    { k: 'Forcées → entretien', v: forced.length ? `${forcedOk.length}/${forced.length}` : '–' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
      {items.map(i => (
        <div key={i.k} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: '12px 14px' }}>
          <div style={{ fontFamily: C.display, fontSize: 22, fontWeight: 600 }}>{i.v}</div>
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{i.k}</div>
        </div>
      ))}
    </div>
  );
}

export function ApplicationsView() {
  const [apps, setApps] = useState<Application[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const reload = () => listApplications().then(setApps);
  useEffect(() => { reload(); }, []);

  const exportCSV = () => {
    if (!apps) return;
    const url = URL.createObjectURL(new Blob([toCSV(apps)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `apply4me-candidatures-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!apps) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: C.display, fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em' }}>Tes candidatures</h2>
          <p style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Mets à jour le statut quand tu as une réponse : c'est ce qui dira si le score tombe juste.</p>
        </div>
        <PillBtn onClick={exportCSV} variant="ghost" disabled={!apps.length}>
          <DownloadSimple size={14} /> CSV
        </PillBtn>
      </div>

      {apps.length > 0 && <Stats apps={apps} />}

      {apps.length === 0 && (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: C.muted, fontSize: 13.5, border: `1px dashed ${C.borderStrong}`, borderRadius: 20 }}>
          Aucune candidature pour l'instant. Ouvre une offre et clique sur l'extension.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {apps.map(a => {
          const tone = a.verdict === 'skip' ? 'bad' : a.score >= 70 ? 'good' : 'mid';
          const expanded = open === a.id;
          return (
            <div key={a.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' }}>
                <ScoreRing score={a.score} tone={tone} size={38} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {a.title || 'Sans intitulé'}
                  </div>
                  <div style={{ fontSize: 12, color: C.muted }}>
                    {[a.company, new Date(a.date).toLocaleDateString('fr-FR'), a.forced ? 'forcée' : null, a.stretch.length ? `+${a.stretch.length} ajout${a.stretch.length > 1 ? 's' : ''}` : null]
                      .filter(Boolean).join(' · ')}
                  </div>
                </div>
                <select
                  value={a.status}
                  onChange={async e => { await setStatus(a.id, e.target.value as ApplicationStatus); reload(); }}
                  style={{
                    padding: '5px 10px', borderRadius: 999, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    background: STATUS_TONE[a.status][0], color: STATUS_TONE[a.status][1], outline: 'none',
                  }}
                >
                  {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
                {a.url && (
                  <a href={a.url} target="_blank" rel="noreferrer" title="Ouvrir l'offre" style={{ color: C.muted, display: 'flex' }}>
                    <ArrowSquareOut size={16} />
                  </a>
                )}
                <button onClick={() => setOpen(expanded ? null : a.id)} title="Détails" style={iconBtn}>
                  {expanded ? <CaretDown size={14} /> : <CaretRight size={14} />}
                </button>
              </div>
              {expanded && (
                <div style={{ padding: '0 14px 14px 64px', fontSize: 12.5, color: C.soft, lineHeight: 1.6 }}>
                  {a.stretch.length > 0 && <p><b>Ajouté au CV :</b> {a.stretch.join(', ')}</p>}
                  {a.prep.map(p => (
                    <div key={p.skill} style={{ marginTop: 8 }}>
                      <b>{p.skill}</b>
                      <ul style={{ paddingLeft: 18 }}>{p.basics.map((b, i) => <li key={i}>{b}</li>)}</ul>
                    </div>
                  ))}
                  <button
                    onClick={async () => { if (confirm('Supprimer cette candidature du suivi ?')) { await removeApplication(a.id); reload(); } }}
                    style={{ ...iconBtn, marginTop: 8, gap: 5, width: 'auto', padding: '4px 10px', fontSize: 12, color: C.brickFg }}
                  >
                    <Trash size={13} /> Retirer du suivi
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 999, border: `1px solid ${C.border}`, background: 'transparent',
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.soft,
};
