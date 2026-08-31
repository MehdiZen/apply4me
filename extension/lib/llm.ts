import type { UserProfile } from '../types';
import { getApiConfig } from './storage';

function log(...args: unknown[]) {
  console.log('[apply4me:llm]', ...args);
}

async function fetchAnthropic(apiKey: string, model: string, prompt: string): Promise<string> {
  log('anthropic →', model, 'prompt', prompt.length);
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
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json() as { content: { text: string }[] };
  return data.content[0].text;
}

async function fetchOpenAI(apiKey: string, model: string, prompt: string): Promise<string> {
  log('openai →', model, 'prompt', prompt.length);
  // GPT-5/o-series exigent max_completion_tokens ; les anciens l'acceptent aussi.
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_completion_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices[0].message.content;
}

// Appel direct — le popup et la page options sont des contextes d'extension,
// jamais soumis au CSP des sites, donc aucun proxy background n'est nécessaire.
export async function callLLM(prompt: string): Promise<string> {
  const config = await getApiConfig();
  if (!config) throw new Error('Clé API non configurée');
  const raw = config.provider === 'anthropic'
    ? await fetchAnthropic(config.apiKey, config.model, prompt)
    : await fetchOpenAI(config.apiKey, config.model, prompt);
  return raw.trim();
}

function field(label: string, value?: string): string {
  const v = (value ?? '').trim();
  return v ? `- ${label} : ${v}\n` : '';
}

export async function generateCoverLetter(
  jobOffer: string,
  profile: UserProfile,
  companyNote?: string,
  regenHint?: string
): Promise<string> {
  const note = (companyNote ?? '').trim();
  const hint = (regenHint ?? '').trim();

  // Raison personnelle fournie par l'utilisateur : le seul élément que le modèle
  // ne peut pas déduire de l'offre. Elle prend le pas sur le §3 générique.
  const noteBlock = note
    ? `\nCE QUI RELIE PERSONNELLEMENT LE CANDIDAT À CETTE ENTREPRISE (écrit par lui, à intégrer avec naturel au paragraphe 3) :
"""
${note}
"""
Reformule-le dans le fil de la lettre sans le citer mot pour mot, et sans RIEN inventer autour : n'ajoute aucun détail, aucune anecdote, aucun fait qui ne figure pas ci-dessus.\n`
    : '';

  // Instruction ponctuelle sur CETTE tentative (ex : "trop long", "moins formel").
  // Prioritaire sur le style par défaut, mais ne lève jamais les garde-fous
  // anti-invention / anti-arrogance ci-dessous.
  const hintBlock = hint
    ? `\nAJUSTEMENT DEMANDÉ PAR LE CANDIDAT SUR CETTE VERSION (à respecter en priorité, sans jamais inventer de fait nouveau ni casser les règles ci-dessous) :
"""
${hint}
"""\n`
    : '';

  const prompt = `Tu écris la lettre de motivation À LA PLACE du candidat, comme un nègre littéraire qui imite sa voix. Le résultat doit donner l'impression d'avoir été écrit par lui — pas par une IA, pas par un modèle de lettre.

OFFRE D'EMPLOI :
${jobOffer}

LE CANDIDAT (n'invente jamais au-delà de ces éléments) :
${field('Poste visé', profile.targetRole)}${field('CV', profile.cvText)}${field('Ce qui le motive', profile.motivations)}${field('Réussite concrète dont il est fier', profile.proudAchievement)}${field('Ce qu\'il apporte au-delà du CV', profile.humanEdge)}${field('Contexte supplémentaire à prendre en compte', profile.otherContext)}${field('Ton souhaité', profile.toneHint)}${field('Prétentions', profile.salaryExpectation)}${field('Disponibilité', profile.availability)}
ÉCHANTILLON DE SA FAÇON D'ÉCRIRE — imite ce registre, ce rythme, ce niveau de langue :
"""
${(profile.writingSample || '').trim() || '(non fourni — adopte un ton naturel, direct, sans sur-formalité)'}
"""
${noteBlock}
OBJECTIF : une lettre de MOTIVATION. Elle doit montrer pourquoi CE candidat veut CE poste dans CETTE entreprise — pas réciter son CV ni empiler ses compétences. Une lettre qui pourrait être envoyée telle quelle à un concurrent est ratée.

ANGLE DIRECTEUR — renverse subtilement la perspective. Pars du BESOIN de l'entreprise tel qu'exprimé dans l'offre, et montre en quoi le candidat est la réponse à ce besoin. Le lecteur doit se dire « cette personne a compris notre problème et sait le résoudre », jamais « voici mon CV ». On SUGGÈRE la valeur par les faits, on ne la proclame pas : INTERDIT « j'ai exactement le profil », « vous avez besoin de moi », « je suis le candidat idéal », « je corresponds parfaitement ». La confiance vient des preuves, pas des affirmations. Reste humble : aligner un besoin réel et une réussite réelle suffit à faire passer le message.

PLAN — 4 paragraphes courts, 230 à 300 mots :
1. Accroche : nomme un besoin ou un enjeu RÉEL de l'offre (sa mission, une phrase précise du poste) et amorce, sans arrogance, pourquoi tu t'y connectes. Prouve que tu as lu CETTE offre.
2. UNE seule preuve, la plus pertinente : un projet ou une réussite précise, développée, qui répond DIRECTEMENT à ce besoin. Fais le pont implicite « vous cherchez X → j'ai déjà fait X ». Surtout pas un inventaire de technologies.
3. Pourquoi eux : ${note ? 'appuie-toi EN PRIORITÉ sur le lien personnel fourni ci-dessus — c\'est lui qui rend ce paragraphe unique — et relie-le à ce que le candidat cherche. Complète éventuellement avec un élément concret de l\'offre.' : 'repère UN élément concret et spécifique que l\'entreprise dit d\'elle-même dans l\'offre'} (un programme, une façon de travailler, une valeur affichée, un détail du poste — JAMAIS un mot creux type "innovation", "excellence", "leader") et croise-le avec une motivation réelle du candidat. INTERDIT de paraphraser ou de renvoyer les mots-clés de l'offre ("vous parlez de X, ça m'attire"). C'est l'intersection [spécificité réelle de CETTE entreprise] × [ce qui fait vraiment vibrer le candidat] qui rend ce paragraphe non interchangeable.
4. Clôture courte et ouverte : une phrase qui appelle un échange. Jamais de logistique (préavis, disponibilité) en guise de fin.
${hintBlock}
RÈGLES :
- Français, vouvoiement. Ouvre par "Madame, Monsieur,". Termine OBLIGATOIREMENT par "Cordialement," seul sur la toute dernière ligne, sans signer de nom.
- Quel que soit le métier (soin, vente, artisanat, tech, enseignement…), bannis le jargon et les sigles. Au maximum 2 ou 3 termes spécialisés, et seulement s'ils parlent au recruteur — jamais une liste. Décris toujours l'impact concret et le résultat, pas l'outil ni le sigle. La lettre doit être limpide pour un recruteur non spécialiste du domaine, au premier passage.
- INTERDIT d'ouvrir par : "Je me permets de", "C'est avec un grand/vif intérêt", "Fort de mon expérience", "Actuellement à la recherche".
- Bannis les tics d'IA et les clichés : "polyvalent / rigoureux / dynamique / passionné / motivé", "mon profil correspond parfaitement", "rejoindre vos équipes", "relever de nouveaux défis", "n'hésitez pas à me contacter", "je serais ravi / honoré", les triades d'adjectifs, les phrases creuses applicables à n'importe qui.
- Varie la longueur des phrases (certaines courtes). Reste naturel et fidèle à l'échantillon d'écriture. Pas de sur-formalité guindée.
- Si le nom de l'entreprise figure dans l'offre, utilise-le. Sinon, aucun crochet ni placeholder du type [Entreprise].
- N'invente aucune expérience, aucun diplôme, aucun chiffre absent du profil. Ne mentionne le préavis ou la disponibilité QUE si l'offre le demande explicitement, et sans contradiction.
- N'attribue JAMAIS une expérience, un projet ou un résultat à un employeur, un lieu ou une période autres que ceux indiqués dans le profil. Si l'employeur exact est incertain, reste général ("sur un projet industriel", "lors d'une mission") plutôt que de nommer une entreprise au risque de te tromper.

SORTIE : uniquement le texte de la lettre, prêt à coller. Aucun commentaire, aucun objet, aucune adresse, aucun markdown.`;
  return callLLM(prompt);
}

// Accroche / titre de CV aligné sur l'offre — l'utilisateur la colle dans son CV.
export async function generateHeadline(
  jobOffer: string,
  profile: UserProfile
): Promise<string> {
  const raw = await callLLM(`À partir de cette offre et de ce profil, propose UNE accroche de CV honnête qui aligne le candidat sur le poste, sans mentir ni sur-vendre.

OFFRE :
${jobOffer}

PROFIL :
${field('Poste visé', profile.targetRole)}${field('CV', profile.cvText)}${field('Réussite', profile.proudAchievement)}
Réponds UNIQUEMENT avec l'accroche : un titre court, éventuellement suivi d'un sous-titre de 6 à 10 mots. 15 mots maximum au total. Pas de guillemets, pas de superlatif creux, pas de commentaire.`);
  return raw.replace(/^["'«»\s]+|["'«»\s]+$/g, '');
}

export async function testConnection(): Promise<boolean> {
  try {
    await callLLM('Réponds uniquement "ok"');
    return true;
  } catch {
    return false;
  }
}
