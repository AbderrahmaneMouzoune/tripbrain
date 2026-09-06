/**
 * Contrepartie webapp de l'application native (apps/mobile).
 *
 * L'app native est une WebView qui charge cette webapp. Avant le chargement,
 * elle injecte `window.TripBrainNative` et ajoute `TripBrainApp/<version>` au
 * user-agent ; c'est ainsi que la page sait qu'elle tourne dans l'app.
 *
 * Dans une WebView, `<a download>` ne fait rien et `navigator.share` n'existe
 * pas sur Android ; et le web n'a ni retour haptique, ni rappels locaux, ni
 * accès au calendrier ou à l'appareil photo. La page confie ces gestes au
 * natif par un bridge.
 *
 * Protocole (garder synchronisé avec apps/mobile/lib/bridge-protocol.ts) :
 *
 * Webapp → natif : window.ReactNativeWebView.postMessage(JSON.stringify(req))
 *   { id, type, payload }
 * Natif → webapp : CustomEvent "tripbrain:native-response"
 *   { id?, type, payload }
 *
 *   share/link          { title?, text?, url }       → share/result        { outcome }
 *   file/share          { name, mimeType?, base64 }  → share/result        { outcome }
 *   haptic/trigger      { kind }                     → (aucune)
 *   qr/scan             {}                           → qr/result           { value }
 *   notifications/sync  { reminders }                → notifications/state { permission, scheduled }
 *   calendar/add        { events }                   → calendar/result     { outcome, count }
 *   app/openSettings    {}                           → (aucune)
 *   (spontané)                                       ← file/import         { name, mimeType?, base64 }
 */

const NATIVE_RESPONSE_EVENT = 'tripbrain:native-response'

/** Au-delà, la feuille de partage (ou l'écran de scan) est considérée perdue. */
const RESPONSE_TIMEOUT_MS = 5 * 60 * 1000

/**
 * Version d'app en dessous de laquelle le bridge est incomplet : la webapp
 * invite alors à mettre à jour. À monter à chaque nouveau type de requête.
 */
export const MIN_NATIVE_APP_VERSION = '1.0.0'

/** Comment s'est terminée l'ouverture de la feuille de partage du système. */
export type NativeShareOutcome =
  /** Le contenu est parti dans l'application choisie. */
  | 'shared'
  /** La feuille a été fermée sans rien envoyer — ce n'est pas une erreur. */
  | 'dismissed'
  /** Pas de partage natif ici, ou il a refusé : au reste de l'interface de prendre le relais. */
  | 'unavailable'

export type NativeHapticKind =
  | 'selection'
  | 'impact'
  | 'success'
  | 'warning'
  | 'error'

export type NativeNotificationPermission =
  | 'granted'
  | 'denied'
  | 'undetermined'
  | 'unsupported'

export interface NativeReminder {
  id: string
  title: string
  body?: string
  /** Date-heure ISO 8601 sans fuseau : l'heure locale de l'appareil. */
  at: string
  path?: string
}

export interface NativeCalendarEvent {
  title: string
  /** `AAAA-MM-JJ` */
  date: string
  endDate?: string
  location?: string
  notes?: string
}

export interface NativeAppInfo {
  platform: 'ios' | 'android' | string
  appVersion: string
}

interface NativeFilePayload {
  name: string
  mimeType?: string
  base64: string
}

type NativeRequestType =
  | 'share/link'
  | 'file/share'
  | 'haptic/trigger'
  | 'qr/scan'
  | 'notifications/sync'
  | 'calendar/add'
  | 'app/openSettings'

interface NativeResponse {
  id?: string
  type: string
  payload: unknown
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

/** Compare deux versions `x.y.z` : négatif si `a` précède `b`. */
export function compareVersions(a: string, b: string): number {
  const parse = (value: string) =>
    value.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const left = parse(a)
  const right = parse(b)
  const length = Math.max(left.length, right.length)
  for (let i = 0; i < length; i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** L'app native est-elle trop ancienne pour le bridge que cette page attend ? */
export function isNativeAppOutdated(): boolean {
  const app = getNativeApp()
  if (!app) return false
  return compareVersions(app.appVersion, MIN_NATIVE_APP_VERSION) < 0
}

let requestCounter = 0

/** Envoie une requête sans attendre de réponse. */
function postNative(type: NativeRequestType, payload: unknown): boolean {
  const bridge =
    typeof window === 'undefined' ? undefined : window.ReactNativeWebView
  if (!bridge) return false
  try {
    bridge.postMessage(JSON.stringify({ type, payload }))
    return true
  } catch {
    return false
  }
}

/**
 * Envoie une requête au natif et attend la réponse du type indiqué.
 *
 * Résout `null` si le natif ne répond pas : l'interface reprend alors son
 * comportement web habituel.
 */
function requestNative<T>(
  type: NativeRequestType,
  payload: unknown,
  responseType: string,
  timeoutMs = RESPONSE_TIMEOUT_MS,
): Promise<T | null> {
  const bridge =
    typeof window === 'undefined' ? undefined : window.ReactNativeWebView
  if (!bridge) return Promise.resolve(null)

  const id = `${Date.now()}-${++requestCounter}`

  return new Promise((resolve) => {
    const finish = (value: T | null) => {
      window.removeEventListener(NATIVE_RESPONSE_EVENT, onResponse)
      clearTimeout(timer)
      resolve(value)
    }

    const onResponse = (event: Event) => {
      const detail = (event as CustomEvent<NativeResponse>).detail
      if (detail?.id !== id || detail.type !== responseType) return
      finish((detail.payload as T) ?? null)
    }

    const timer = setTimeout(() => finish(null), timeoutMs)
    window.addEventListener(NATIVE_RESPONSE_EVENT, onResponse)

    try {
      bridge.postMessage(JSON.stringify({ id, type, payload }))
    } catch {
      finish(null)
    }
  })
}

// ── Partage ───────────────────────────────────────────────────────────────────

/** Ouvre la feuille de partage du système avec un lien. */
export async function shareLinkNatively(content: {
  title?: string
  text?: string
  url: string
}): Promise<NativeShareOutcome> {
  const result = await requestNative<{ outcome: NativeShareOutcome }>(
    'share/link',
    content,
    'share/result',
  )
  return result?.outcome ?? 'unavailable'
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

/** Reconstruit un fichier à partir de ce que le natif a lu sur le disque. */
function fileFromBase64({ name, mimeType, base64 }: NativeFilePayload): File {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new File([bytes], name, { type: mimeType ?? '' })
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
  const result = await requestNative<{ outcome: NativeShareOutcome }>(
    'file/share',
    { name, mimeType: blob.type || undefined, base64 },
    'share/result',
  )
  return result?.outcome ?? 'unavailable'
}

// ── Sensations et capteurs ────────────────────────────────────────────────────

/** Retour haptique ; sans effet hors de l'app. */
export function triggerHaptic(kind: NativeHapticKind): void {
  if (!isNativeApp()) return
  postNative('haptic/trigger', { kind })
}

/**
 * Ouvre l'écran de scan natif. Résout la valeur lue, ou `null` si l'écran a
 * été fermé sans rien scanner. Un QR code TripBrain est un lien : le natif
 * navigue alors de lui-même, la page n'a rien à faire de plus.
 */
export async function scanQrNatively(): Promise<string | null> {
  const result = await requestNative<{ value: string | null }>(
    'qr/scan',
    {},
    'qr/result',
  )
  return result?.value ?? null
}

// ── Rappels et calendrier ─────────────────────────────────────────────────────

/**
 * Remplace les rappels locaux du téléphone par ceux du voyage courant.
 * Une liste vide efface tout sans demander de permission.
 */
export function syncNativeReminders(reminders: NativeReminder[]): Promise<{
  permission: NativeNotificationPermission
  scheduled: number
} | null> {
  return requestNative(
    'notifications/sync',
    { reminders },
    'notifications/state',
  )
}

/** Écrit des journées dans le calendrier du téléphone. */
export function addToNativeCalendar(events: NativeCalendarEvent[]): Promise<{
  outcome: 'added' | 'denied' | 'unavailable'
  count: number
} | null> {
  return requestNative('calendar/add', { events }, 'calendar/result')
}

/** Ouvre les réglages de l'app dans le système (permissions refusées). */
export function openNativeSettings(): void {
  postNative('app/openSettings', {})
}

// ── Fichiers ouverts avec TripBrain ───────────────────────────────────────────

/**
 * Appelle `handler` quand l'app native remet un fichier ouvert « avec
 * TripBrain » (Mail, Fichiers, AirDrop). Retourne la fonction de désabonnement.
 */
export function onNativeFileImport(handler: (file: File) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<NativeResponse>).detail
    if (detail?.type !== 'file/import') return
    const payload = detail.payload as Partial<NativeFilePayload> | undefined
    if (
      !payload ||
      typeof payload.name !== 'string' ||
      typeof payload.base64 !== 'string'
    ) {
      return
    }
    try {
      handler(fileFromBase64(payload as NativeFilePayload))
    } catch (error) {
      console.warn('Fichier reçu de l’app illisible', error)
    }
  }
  window.addEventListener(NATIVE_RESPONSE_EVENT, listener)
  return () => window.removeEventListener(NATIVE_RESPONSE_EVENT, listener)
}
