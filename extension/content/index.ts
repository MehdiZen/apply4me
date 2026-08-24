import { extractJobOffer } from '../lib/cleaner';
import { findCoverLetterTarget, fillTarget } from './inject';
import type { ContentRequest, OfferResponse, FillResponse } from '../types';

// Le content script ne fait aucun appel réseau. Il répond au popup :
//  - GET_OFFER       → texte de l'offre + présence d'une zone lettre
//  - FILL_TEXTAREA   → insère la lettre dans cette zone
chrome.runtime.onMessage.addListener((msg: ContentRequest, _sender, sendResponse) => {
  if (msg.type === 'GET_OFFER') {
    const res: OfferResponse = {
      offer: extractJobOffer(),
      hasTextarea: !!findCoverLetterTarget(),
    };
    sendResponse(res);
    return; // réponse synchrone
  }

  if (msg.type === 'FILL_TEXTAREA') {
    const target = findCoverLetterTarget();
    let res: FillResponse;
    if (!target) {
      res = { ok: false, error: 'Aucune zone de texte trouvée sur la page' };
    } else {
      res = fillTarget(target, msg.text)
        ? { ok: true }
        : { ok: false, error: 'Insertion refusée par la page — télécharge le PDF' };
    }
    sendResponse(res);
    return;
  }
});
