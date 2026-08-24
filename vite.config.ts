import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import webExtension from 'vite-plugin-web-extension';
import { readFileSync } from 'fs';

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
  plugins: [
    react(),
    webExtension({ manifest: buildManifest }),
    copyIcons(),
  ],
});
