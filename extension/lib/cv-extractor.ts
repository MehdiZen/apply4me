const EXTRACT_PROMPT =
  'Extrais le texte complet de ce CV. Conserve la structure (sections, listes à puces). Texte brut uniquement, sans markdown ni commentaire.';

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function extractWithAnthropic(
  file: File,
  apiKey: string,
  model: string
): Promise<string> {
  const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const base64 = await fileToBase64(file);
  const mediaType = isPDF ? 'application/pdf' : file.type;
  const blockType = isPDF ? 'document' : 'image';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8000,
      messages: [{
        role: 'user',
        content: [
          { type: blockType, source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: EXTRACT_PROMPT },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const data = await res.json() as { content: { text: string }[]; stop_reason?: string };
  // Un CV coupé en silence fausserait toute la base de faits.
  if (data.stop_reason === 'max_tokens') throw new Error('CV trop long : extraction tronquée. Colle le texte à la main.');
  return data.content[0].text;
}

async function extractWithOpenAI(
  file: File,
  apiKey: string,
  model: string
): Promise<string> {
  // Responses API — supporte PDF natif via input_file (Chat Completions a droppé le PDF en sept. 2025)
  const base64 = await fileToBase64(file);
  const mimeType = file.type || 'application/pdf';
  const fileData = `data:${mimeType};base64,${base64}`;

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [{
        role: 'user',
        content: [
          { type: 'input_file', filename: file.name, file_data: fileData },
          { type: 'input_text', text: EXTRACT_PROMPT },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json() as {
    status?: string;
    output: { type: string; content?: { type: string; text: string }[] }[]
  };
  if (data.status === 'incomplete') throw new Error('CV trop long : extraction tronquée. Colle le texte à la main.');
  // Les modèles à raisonnement renvoient d'abord un bloc "reasoning" : on
  // cherche le message, pas le premier élément.
  const text = data.output.find(o => o.type === 'message')?.content?.find(c => c.type === 'output_text')?.text;
  if (!text) throw new Error('Réponse OpenAI sans texte.');
  return text;
}

export async function extractCVFromFile(
  file: File,
  apiKey: string,
  provider: 'anthropic' | 'openai',
  model: string
): Promise<string> {
  const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const isImage = file.type.startsWith('image/');

  if (!isPDF && !isImage) {
    throw new Error('Format non supporté. Colle le texte manuellement.');
  }

  return provider === 'anthropic'
    ? extractWithAnthropic(file, apiKey, model)
    : extractWithOpenAI(file, apiKey, model);
}
