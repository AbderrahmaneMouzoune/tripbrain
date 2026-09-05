/**
 * Protocole bridge WebView ↔ webapp.
 *
 * Webapp → natif : window.ReactNativeWebView.postMessage(JSON.stringify(req))
 *   { id, type: "share/link", payload: { title?, text?, url } }
 *   { id, type: "file/share", payload: { name, mimeType?, base64 } }
 *
 * Natif → webapp : injection JS qui dispatch un CustomEvent
 *   window.dispatchEvent(new CustomEvent("tripbrain:native-response", { detail: res }))
 *   { id, type: "share/result", payload: { outcome } }
 *
 * Pourquoi ce bridge : dans une WebView, ni `<a download>` (exports JSON,
 * ICS, ZIP, modèles) ni `navigator.share` (Android) ne fonctionnent. La
 * webapp confie donc ces gestes au natif, qui ouvre la feuille de partage
 * du système.
 *
 * La contrepartie webapp vit dans apps/web/src/lib/native-app.ts — garder
 * les deux fichiers synchronisés.
 *
 * Fonctions pures, sans dépendance React Native : elles se testent avec Vitest.
 */

export const BRIDGE_RESPONSE_EVENT = 'tripbrain:native-response'

/** Nom du global injecté avant le chargement de la page. */
export const NATIVE_GLOBAL_NAME = 'TripBrainNative'

/** Comment s'est terminée la feuille de partage du système. */
export type ShareOutcome = 'shared' | 'dismissed' | 'unavailable'

export interface ShareLinkPayload {
  title?: string
  text?: string
  url: string
}

export interface ShareFilePayload {
  name: string
  mimeType?: string
  /** Contenu du fichier, encodé en base64 (sans préfixe `data:`). */
  base64: string
}

export type BridgeRequest =
  | { id?: string; type: 'share/link'; payload: ShareLinkPayload }
  | { id?: string; type: 'file/share'; payload: ShareFilePayload }

export interface BridgeShareResponse {
  id?: string
  type: 'share/result'
  payload: { outcome: ShareOutcome }
}

export interface NativeGlobals {
  platform: string
  appVersion: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string'
}

/**
 * Lit un message venu de la webapp. Tout ce qui n'est pas une requête bridge
 * bien formée (autre lib, bruit, payload incomplet) est ignoré.
 */
export function parseBridgeRequest(raw: string): BridgeRequest | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(parsed)) return null

  const { id, type, payload } = parsed
  if (!optionalString(id)) return null
  if (!isRecord(payload)) return null

  if (type === 'share/link') {
    if (typeof payload.url !== 'string' || !payload.url) return null
    if (!optionalString(payload.title) || !optionalString(payload.text)) {
      return null
    }
    return {
      id,
      type,
      payload: { title: payload.title, text: payload.text, url: payload.url },
    }
  }

  if (type === 'file/share') {
    if (typeof payload.name !== 'string' || !payload.name) return null
    if (typeof payload.base64 !== 'string') return null
    if (!optionalString(payload.mimeType)) return null
    return {
      id,
      type,
      payload: {
        name: payload.name,
        mimeType: payload.mimeType,
        base64: payload.base64,
      },
    }
  }

  return null
}

/**
 * Script injecté dans la WebView pour répondre à une requête bridge.
 * Termine par `true` : requis par react-native-webview.
 */
export function buildBridgeResponseScript(
  response: BridgeShareResponse,
): string {
  return `window.dispatchEvent(new CustomEvent(${JSON.stringify(
    BRIDGE_RESPONSE_EVENT,
  )}, { detail: ${JSON.stringify(response)} })); true;`
}

/**
 * Script injecté avant le chargement de la page : signale à la webapp
 * qu'elle tourne dans l'app native (en complément du user-agent).
 */
export function buildInjectedGlobalsScript(globals: NativeGlobals): string {
  return `window.${NATIVE_GLOBAL_NAME} = ${JSON.stringify(globals)}; true;`
}
