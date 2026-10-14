import { useState } from 'react';
import { CircleNotch } from '@phosphor-icons/react';
import { C } from './theme';
export { C };


// ── Input ─────────────────────────────────────────────────────────────────────
export function Field({
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
      {label && (
        <label style={{
          fontSize: 12, fontWeight: 500, color: '#9A8473', letterSpacing: '-0.01em',
        }}>
          {label}
        </label>
      )}
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
export function PillBtn({
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

// ── Step header ───────────────────────────────────────────────────────────────
export function StepHeader({
  icon, step, title, text,
}: {
  icon: React.ReactNode;
  step: string;
  title: string;
  text: string;
}) {
  return (
    <div>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 10px', borderRadius: 9999,
        border: `1px solid ${C.border}`, marginBottom: 12,
        fontSize: 10, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase',
      }}>
        {icon} {step}
      </div>
      <h2 style={{ fontFamily: C.display, fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', color: C.text, marginBottom: 6 }}>
        {title}
      </h2>
      <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>{text}</p>
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 8,
      background: C.errorDim, border: '1px solid rgba(178,59,46,0.15)',
      fontSize: 12, color: C.error, lineHeight: 1.5,
    }}>
      {message}
    </div>
  );
}
