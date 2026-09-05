/**
 * Contrepartie webapp de l'application native (apps/mobile).
 *
 * L'app native est une WebView qui charge cette webapp. Avant le chargement,
 * elle injecte `window.TripBrainNative` et ajoute `TripBrainApp/<version>` au
 * user-agent ; c'est ainsi que la page sait qu'elle tourne dans l'app.
 *
 * Dans une WebView, deux gestes du web ne fonctionnent pas :
 * - `<a download>` (exports JSON, ICS, ZIP, modèles, QR code) ne fait rien ;
 * - `navigator.share` n'existe pas sur Android.
 * La page les confie donc au natif, qui ouvre la feuille de partage du
 * système.
 *
 * Protocole (garder synchronisé avec apps/mobile/lib/bridge-protocol.ts) :
 *
 * Webapp → natif : window.ReactNativeWebView.postMessage(JSON.stringify(req))
 *   { id, type: "share/link", payload: { title?, text?, url } }
 *   { id, type: "file/share", payload: { name, mimeType?, base64 } }
 *
 * Natif → webapp : CustomEvent "tripbrain:native-response"
 *   { id, type: "share/result", payload: { outcome } }
 */

const NATIVE_RESPONSE_EVENT = 'tripbrain:native-response'

/** Au-delà, la feuille de partage est considérée comme perdue. */
const RESPONSE_TIMEOUT_MS = 5 * 60 * 1000

/** Comment s'est terminée l'ouverture de la feuille de partage du système. */
export type NativeShareOutcome =
  /** Le contenu est parti dans l'application choisie. */
  | 'shared'
  /** La feuille a été fermée sans rien envoyer — ce n'est pas une erreur. */
  | 'dismissed'
  /** Pas de partage natif ici, ou il a refusé : au reste de l'interface de prendre le relais. */
  | 'unavailable'

export interface NativeAppInfo {
  platform: 'ios' | 'android' | string
  appVersion: string
}

interface NativeResponse {
  id?: string
  type: 'share/result'
  payload: { outcome: NativeShareOutcome }
}

declare global {
  interface Window {
    TripBrainNative?: NativeAppInfo
    ReactNativeWebView?: { postMessage: (message: string) => void }
  }
}

/**
 * Description de l'app native qui héberge la page, ou `null` dans un
 * navigateur.
 *
 * Toujours `null` côté serveur : le résultat ne doit décider d'un rendu
 * qu'après le montage, sinon l'hydratation ne correspondrait pas.
 */
export function getNativeApp(): NativeAppInfo | null {
  if (typeof window === 'undefined') return null
  const info = window.TripBrainNative
  if (!info || typeof window.ReactNativeWebView?.postMessage !== 'function') {
    return null
  }
  return info
}

export function isNativeApp(): boolean {
  return getNativeApp() !== null
}

let requestCounter = 0

/**
 * Envoie une requête au natif et attend sa réponse.
 *
 * Résout `unavailable` si le natif ne répond pas : l'interface reprend alors
 * son comportement web habituel.
 */
function requestNative(
  type: 'share/link' | 'file/share',
  payload: Record<string, unknown>,
): Promise<NativeShareOutcome> {
  const bridge = window.ReactNativeWebView
  if (!bridge) return Promise.resolve('unavailable')

  const id = `${Date.now()}-${++requestCounter}`

  return new Promise((resolve) => {
    const finish = (outcome: NativeShareOutcome) => {
      window.removeEventListener(NATIVE_RESPONSE_EVENT, onResponse)
      clearTimeout(timer)
      resolve(outcome)
    }

    const onResponse = (event: Event) => {
      const detail = (event as CustomEvent<NativeResponse>).detail
      if (detail?.id !== id || detail.type !== 'share/result') return
      finish(detail.payload?.outcome ?? 'unavailable')
    }

    const timer = setTimeout(() => finish('unavailable'), RESPONSE_TIMEOUT_MS)
    window.addEventListener(NATIVE_RESPONSE_EVENT, onResponse)

    try {
      bridge.postMessage(JSON.stringify({ id, type, payload }))
    } catch {
      finish('unavailable')
    }
  })
}

/** Ouvre la feuille de partage du système avec un lien. */
export function shareLinkNatively(content: {
  title?: string
  text?: string
  url: string
}): Promise<NativeShareOutcome> {
  return requestNative('share/link', content)
}

/** Lit un Blob en base64, sans le préfixe `data:`. */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const result = String(reader.result)
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.readAsDataURL(blob)
  })
}

/**
 * Remet un fichier au natif, qui ouvre la feuille de partage du système
 * (« Enregistrer dans Fichiers », Drive, mail, aperçu…).
 */
export async function shareFileNatively(
  blob: Blob,
  name: string,
): Promise<NativeShareOutcome> {
  let base64: string
  try {
    base64 = await blobToBase64(blob)
  } catch {
    return 'unavailable'
  }
  return requestNative('file/share', {
    name,
    mimeType: blob.type || undefined,
    base64,
  })
}
