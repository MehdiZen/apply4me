import '@fontsource-variable/fraunces';

// ── Identité apply4me ─────────────────────────────────────────────────────────
// Crème, terracotta, espresso. Titres en Fraunces (serif douce, un peu ronde),
// texte courant en sans-serif système pour la lisibilité. Une seule source de
// vérité pour le popup, les réglages et l'espace candidature.

export const C = {
  bg: '#FBF5EC',          // crème
  surface: '#FFFCF7',     // carte
  surfaceHover: '#F7EFE2',
  sunken: '#F3E9DA',      // zones en creux
  border: '#EADBC7',      // sable
  borderStrong: '#DCC6A9',
  borderFocus: '#C56A43',
  text: '#3F2D23',        // espresso
  soft: '#6E5646',
  muted: '#9A8473',
  subtle: '#C9B7A2',
  accent: '#C56A43',      // terracotta
  accentDeep: '#A4532F',
  accentDim: '#F6E4C2',   // miel
  accentFg: '#FFF8EE',
  honeyFg: '#8A5A1E',
  sage: '#E5ECDA',
  sageFg: '#4F6138',
  brick: '#F6E0D8',
  brickFg: '#A13A2C',
  error: '#B23B2E',
  errorDim: '#F6E0D8',
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif",
  display: "'Fraunces Variable', 'Iowan Old Style', Georgia, serif",
  ease: 'cubic-bezier(0.32, 0.72, 0, 1)',
  easeSpring: 'cubic-bezier(0.16, 1, 0.3, 1)',
};

// Logo : silhouette en dogeza (la révérence japonaise), clin d'œil à
// l'humilité de la candidature.
export function DogezaMark({ size = 30 }: { size?: number }) {
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

export function Wordmark({ size = 17 }: { size?: number }) {
  return (
    <span style={{
      fontFamily: C.display, fontSize: size, fontWeight: 620, letterSpacing: '-0.02em',
      color: C.text, lineHeight: 1,
    }}>
      apply<span style={{ color: C.accent, fontStyle: 'italic', fontWeight: 700 }}>4</span>me
    </span>
  );
}

export function Brand({ size = 28 }: { size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <DogezaMark size={size} />
      <Wordmark size={Math.round(size * 0.62)} />
    </div>
  );
}

// Anneau de score : couleur selon le verdict.
export function ScoreRing({ score, tone, size = 56 }: { score: number; tone: 'good' | 'bad' | 'mid'; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const color = tone === 'good' ? C.sageFg : tone === 'bad' ? C.brickFg : C.honeyFg;
  const track = tone === 'good' ? C.sage : tone === 'bad' ? C.brick : C.accentDim;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={6} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeLinecap="round" strokeDasharray={circ}
          strokeDashoffset={circ * (1 - Math.max(0, Math.min(100, score)) / 100)}
          style={{ transition: `stroke-dashoffset 0.9s ${C.easeSpring}` }}
        />
      </svg>
      <span style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: C.display, fontSize: size * 0.32, fontWeight: 650, color,
      }}>{score}</span>
    </div>
  );
}

export const globalCSS = `
  @keyframes spin { to { transform: rotate(360deg) } }
  @keyframes fadeSlide { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
  @keyframes pulse { 0%,100% { opacity: .45 } 50% { opacity: 1 } }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${C.bg}; color: ${C.text}; font-family: ${C.font}; -webkit-font-smoothing: antialiased; }
  input, textarea, button, select { font-family: inherit; }
  ::selection { background: ${C.accentDim}; }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; }
`;
