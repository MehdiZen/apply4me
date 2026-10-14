// PDF via le moteur d'impression de Chromium : Page.printToPDF est exactement
// l'appel qu'utilise page.pdf() de Playwright, donc même rendu (Carlito, A4,
// texte sélectionnable). Il passe par chrome.debugger, permission déclarée
// dans le build Chrome (Chrome refuse "debugger" en optionnel). Sans elle
// (Firefox) : boîte d'impression.

type Debuggee = { tabId: number };
interface DebuggerApi {
  attach(target: Debuggee, version: string): Promise<void>;
  detach(target: Debuggee): Promise<void>;
  sendCommand(target: Debuggee, method: string, params?: object): Promise<unknown>;
}

function debuggerApi(): DebuggerApi | null {
  return (chrome as unknown as { debugger?: DebuggerApi }).debugger ?? null;
}

function downloadBase64(data: string, filename: string): void {
  const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// La page gère elle-même ce qui s'imprime (attribut data-print sur <body> et
// règles @media print). Les marges sont dans la feuille, d'où marges nulles ici.
export async function saveCurrentPageAsPDF(filename: string): Promise<'pdf' | 'print'> {
  const api = debuggerApi();
  const tab = await chrome.tabs.getCurrent();
  if (api && tab?.id !== undefined) {
    const target = { tabId: tab.id };
    try {
      await api.attach(target, '1.3');
      const res = await api.sendCommand(target, 'Page.printToPDF', {
        paperWidth: 8.27,
        paperHeight: 11.69,
        marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0,
        printBackground: true,
        preferCSSPageSize: true,
      }) as { data: string };
      downloadBase64(res.data, filename);
      return 'pdf';
    } catch (e) {
      console.warn('[apply4me:pdf] printToPDF indisponible, bascule sur l\'impression', e);
    } finally {
      await api.detach(target).catch(() => {});
    }
  }
  window.print();
  return 'print';
}

export function fileSafe(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
}
