// Stub des dépendances optionnelles de jsPDF (html2canvas, dompurify, canvg).
// Elles ne servent qu'à doc.html(), que nous n'utilisons pas : on ne génère le
// PDF qu'avec doc.text(). Les aliaser ici évite d'embarquer ~220 Ko inutiles.

const noop = () => {
  throw new Error('apply4me : dépendance jsPDF optionnelle non embarquée (doc.html() non utilisé)');
};

export default noop;
export const Canvg = noop;
export const presets = {};
export const sanitize = (s) => s;
