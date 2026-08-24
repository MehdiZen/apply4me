import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import webExtension from 'vite-plugin-web-extension';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

// Dépendances optionnelles de jsPDF, utiles seulement à doc.html() que nous
// n'appelons pas — remplacées par un stub pour ne pas embarquer ~220 Ko.
const stub = fileURLToPath(new URL('./stubs/empty.js', import.meta.url));

const browser = (process.env.TARGET_BROWSER ?? 'firefox') as 'chrome' | 'firefox';

function buildManifest() {
  const base = JSON.parse(readFileSync('./manifest.json', 'utf-8'));

  // Chrome n'utilise pas browser_specific_settings (Firefox uniquement).
  if (browser === 'chrome') {
    const { browser_specific_settings: _ff, ...rest } = base;
    return rest;
  }

  return base;
}

// Émet les icônes dans le bundle — le plugin web-extension ne les copie pas seul.
function copyIcons(): Plugin {
  return {
    name: 'apply4me-copy-icons',
    generateBundle() {
      for (const s of [16, 48, 128]) {
        this.emitFile({
          type: 'asset',
          fileName: `icons/${s}.png`,
          source: readFileSync(`icons/${s}.png`),
        });
      }
    },
  };
}

export default defineConfig({
  resolve: {
    alias: {
      html2canvas: stub,
      dompurify: stub,
      canvg: stub,
    },
  },
  plugins: [
    react(),
    webExtension({ manifest: buildManifest }),
    copyIcons(),
  ],
});
