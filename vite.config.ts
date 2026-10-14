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

  // Firefox ne connaît pas chrome.debugger : le PDF y passe par l'impression.
  return { ...base, permissions: base.permissions.filter((p: string) => p !== 'debugger') };
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

// Build personnel : A4M_SEED=seed/xxx.profil.json embarque un profil chargé
// au premier lancement. Jamais dans le build public (seed/ est gitignoré).
function bundleSeed(): Plugin {
  return {
    name: 'apply4me-seed',
    generateBundle() {
      const seed = process.env.A4M_SEED;
      if (!seed) return;
      this.emitFile({ type: 'asset', fileName: 'seed.json', source: readFileSync(seed) });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    webExtension({
      manifest: buildManifest,
      // Page ouverte par le popup, absente du manifest.
      additionalInputs: ['extension/workspace/workspace.html'],
    }),
    copyIcons(),
    bundleSeed(),
  ],
});
