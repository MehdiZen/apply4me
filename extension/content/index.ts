import { extractJobOffer } from '../lib/cleaner';
import { findCoverLetterTextarea, fillTextarea } from './inject';
import type { ContentRequest, OfferResponse, FillResponse } from '../types';

// Le content script ne fait aucun appel réseau. Il répond au popup :
//  - GET_OFFER       → texte de l'offre + présence d'une zone lettre
//  - FILL_TEXTAREA   → insère la lettre dans cette zone
chrome.runtime.onMessage.addListener((msg: ContentRequest, _sender, sendResponse) => {
  if (msg.type === 'GET_OFFER') {
    const res: OfferResponse = {
      offer: extractJobOffer(),
      hasTextarea: !!findCoverLetterTextarea(),
    };
    sendResponse(res);
    return; // réponse synchrone
  }

  if (msg.type === 'FILL_TEXTAREA') {
    const ta = findCoverLetterTextarea();
    const res: FillResponse = ta
      ? { ok: fillTextarea(ta, msg.text) }
      : { ok: false, error: 'Aucune zone de texte trouvée sur la page' };
    sendResponse(res);
    return;
  }
});
