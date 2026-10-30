/**
 * Contrepartie webapp de l’application native (dépôt tripbrain-app).
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
 * Protocole (garder synchronisé avec tripbrain-app, lib/bridge-protocol.ts) :
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
 *   app/ready           { capabilities }             → (aucune)            v2
 *   ui/statusBar        { style: light|dark }        → (aucune)            v2
 *   maps/open           { mode, name?, address?, coordinates?, url } → (aucune) v2
 *   keepAwake/set       { active }                   → (aucune)            v2
 *   app/requestReview   {}                           → (aucune)            v2
 *   (spontané)                                       ← file/import         { name, mimeType?, base64 }
 *   (spontané)                                       ← app/navigate        { path }   v2
 *   (spontané)                                       ← app/resume          {}         v2
 *
 * v2 : le natif injecte `capabilities` (types de requête qu'il sait traiter)
 * dans `window.TripBrainNative`. Un build sans cette liste ne connaît que les
 * types v1 : toute requête v2 passe par `hasNativeCapability()` avant d'être
 * envoyée, sinon le natif l'ignorerait et le bouton ne ferait rien. En retour,
 * la page annonce par `app/ready` ce qu'elle sait recevoir (`navigate` :
 * ouvrir un chemin sans recharger) ; sans cette annonce, le natif garde son
 * comportement v1 (rechargement de la page).
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
  /** Types de requête traités par le natif ; absent avant la v2. */
  capabilities?: string[]
}

/** Ce que tout build natif sait faire, liste `capabilities` ou non. */
const V1_CAPABILITIES: readonly string[] = [
  'share/link',
  'file/share',
  'haptic/trigger',
  'qr/scan',
  'notifications/sync',
  'calendar/add',
  'app/openSettings',
]

/** Ce que la page sait recevoir du natif, annoncé par `app/ready`. */
const WEB_CAPABILITIES: readonly string[] = ['navigate']

export type NativeStatusBarStyle = 'light' | 'dark'

/** Destination à ouvrir dans l'app de cartes du téléphone. */
export interface NativeMapsTarget {
  /** `directions` : itinéraire jusqu'au lieu ; `search` : le lieu sur la carte. */
  mode: 'directions' | 'search'
  name?: string
  address?: string
  /** `[latitude, longitude]` */
  coordinates?: [number, number]
  /** Lien web équivalent : repli du natif si aucune app ne s'ouvre. */
  url: string
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
  | 'app/ready'
  | 'ui/statusBar'
  | 'maps/open'
  | 'keepAwake/set'
  | 'app/requestReview'

interface NativeResponse {
  id?: string
  type: string
  payload: unknown
}

declare global {
  interface Window {
    TripBrainNative?: NativeAppInfo
    ReactNativeWebView?: { postMessage: (message: string) => void }
    /** Événements natifs arrivés avant l'hydratation (script de `layout.tsx`). */
    __tbNativeEvents?: NativeResponse[]
  }
}

/** Suffixe user-agent ajouté par l'app native. */
const NATIVE_USER_AGENT_PATTERN = /\bTripBrainApp\/\d/

/**
 * Script du `<head>`, exécuté avant tout rendu :
 * - pose `data-native` sur `<html>` dans l'app, pour que le CSS (`native:`)
 *   s'applique dès la première peinture, sans attendre l'hydratation ;
 * - garde de côté les événements spontanés du natif (fichier ouvert avec
 *   TripBrain, lien à ouvrir) arrivés avant que React n'écoute.
 */
export const NATIVE_BOOT_SCRIPT = `(function(){try{var n=window.TripBrainNative;if(n||/\\bTripBrainApp\\/\\d/.test(navigator.userAgent)){document.documentElement.setAttribute('data-native',(n&&n.platform)||'app')}window.__tbNativeEvents=window.__tbNativeEvents||[];window.addEventListener('${NATIVE_RESPONSE_EVENT}',function(e){var d=e.detail;if(d&&!d.id&&(d.type==='file/import'||d.type==='app/navigate'))window.__tbNativeEvents.push(d)})}catch(_){}})()`

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

/**
 * La page tourne-t-elle dans l'app native ? Pour les décisions d'interface
 * seulement (masquer l'installation PWA, adapter un texte) : en plus du global
 * injecté, accepte le suffixe user-agent, présent même si l'injection a raté.
 * Les appels au bridge passent, eux, par `isNativeApp()`.
 */
export function isInsideNativeApp(): boolean {
  if (typeof window === 'undefined') return false
  return (
    getNativeApp() !== null ||
    NATIVE_USER_AGENT_PATTERN.test(window.navigator.userAgent)
  )
}

/**
 * Le natif sait-il traiter ce type de requête ? Un build antérieur à la liste
 * `capabilities` ne connaît que les types v1.
 */
export function hasNativeCapability(type: string): boolean {
  const app = getNativeApp()
  if (!app) return false
  const capabilities = Array.isArray(app.capabilities)
    ? app.capabilities
    : V1_CAPABILITIES
  return capabilities.includes(type)
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
 * été fermé sans rien scanner. La page traite la valeur elle-même ; un natif
 * v1 ouvrait en plus la WebView sur le lien lu (rechargement de la page).
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
export async function syncNativeReminders(
  reminders: NativeReminder[],
): Promise<{
  permission: NativeNotificationPermission
  scheduled: number
} | null> {
  lastSyncedReminders = reminders
  const state = await requestNative<{
    permission: NativeNotificationPermission
    scheduled: number
  }>('notifications/sync', { reminders }, 'notifications/state')
  if (state) {
    nativeNotificationPermission = state.permission
    window.dispatchEvent(new Event(NATIVE_PERMISSION_EVENT))
  }
  return state
}

/** Signale un changement de `getNativeNotificationPermission()`. */
export const NATIVE_PERMISSION_EVENT =
  'tripbrain:native-notification-permission'

let lastSyncedReminders: NativeReminder[] = []
let pendingNativeReminders: NativeReminder[] | null = null

/**
 * Liste complète des rappels, même quand la page n'en synchronise encore
 * aucun (autorisation jamais demandée) : `requestNativeNotifications()` la
 * synchronise, et c'est elle qui fait apparaître la demande du système.
 */
export function setPendingNativeReminders(reminders: NativeReminder[]): void {
  pendingNativeReminders = reminders
}
let nativeNotificationPermission: NativeNotificationPermission | null = null

/**
 * Autorisation des notifications de l'app, telle que la dernière
 * synchronisation l'a lue ; `null` tant qu'aucune n'a eu lieu.
 */
export function getNativeNotificationPermission(): NativeNotificationPermission | null {
  return nativeNotificationPermission
}

/**
 * Redemande l'autorisation en resynchronisant les derniers rappels : le natif
 * ne la demande que s'il a quelque chose à planifier.
 */
export function requestNativeNotifications(): Promise<NativeNotificationPermission | null> {
  markNativeNotificationsAsked()
  return syncNativeReminders(
    pendingNativeReminders ?? lastSyncedReminders,
  ).then((state) => state?.permission ?? null)
}

const NOTIFICATIONS_ASKED_KEY = 'tripbrain:native-notifications-asked'

/**
 * L'utilisateur a-t-il déjà demandé les rappels (bouton « Autoriser », « Ouvrir
 * mon voyage ») ? Tant que non, la page ne synchronise pas de rappels : le
 * natif demanderait l'autorisation au lancement, sans contexte.
 */
export function hasAskedNativeNotifications(): boolean {
  try {
    return localStorage.getItem(NOTIFICATIONS_ASKED_KEY) === '1'
  } catch {
    return false
  }
}

function markNativeNotificationsAsked(): void {
  try {
    localStorage.setItem(NOTIFICATIONS_ASKED_KEY, '1')
  } catch {
    // Stockage bloqué : la demande sera reposée au prochain geste.
  }
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

// ── Événements spontanés du natif ─────────────────────────────────────────────

/**
 * Appelle `handler` pour chaque événement spontané `type` du natif, y compris
 * ceux arrivés avant l'abonnement (gardés par `NATIVE_BOOT_SCRIPT`). Retourne
 * la fonction de désabonnement.
 */
export function onNativeEvent(
  type: 'file/import' | 'app/navigate' | 'app/resume',
  handler: (payload: unknown) => void,
): () => void {
  if (typeof window === 'undefined') return () => {}

  const consume = (detail: NativeResponse) => {
    const queue = window.__tbNativeEvents
    if (queue) {
      const index = queue.indexOf(detail)
      if (index !== -1) queue.splice(index, 1)
    }
    handler(detail.payload)
  }

  const pending = (window.__tbNativeEvents ?? []).filter(
    (detail) => detail.type === type,
  )
  for (const detail of pending) consume(detail)

  const listener = (event: Event) => {
    const detail = (event as CustomEvent<NativeResponse>).detail
    if (!detail || detail.id || detail.type !== type) return
    consume(detail)
  }
  window.addEventListener(NATIVE_RESPONSE_EVENT, listener)
  return () => window.removeEventListener(NATIVE_RESPONSE_EVENT, listener)
}

// ── Fichiers ouverts avec TripBrain ───────────────────────────────────────────

/**
 * Appelle `handler` quand l'app native remet un fichier ouvert « avec
 * TripBrain » (Mail, Fichiers, AirDrop), y compris pendant le démarrage.
 * Retourne la fonction de désabonnement.
 */
export function onNativeFileImport(handler: (file: File) => void): () => void {
  return onNativeEvent('file/import', (raw) => {
    const payload = raw as Partial<NativeFilePayload> | undefined
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
  })
}

// ── v2 : cycle de vie, système, cartes ────────────────────────────────────────

/**
 * Signale au natif que la page est prête : il retire le splash et peut
 * désormais ouvrir un chemin sans recharger (`app/navigate`). Appelé par
 * l'accueil à chaque montage ; le natif accepte les annonces répétées.
 */
export function notifyNativeReady(): void {
  if (!hasNativeCapability('app/ready')) return
  postNative('app/ready', { capabilities: WEB_CAPABILITIES })
}

/**
 * Retire l'annonce de `notifyNativeReady` quand l'accueil n'est plus affiché
 * (guide, pages légales via un lien interne) : plus personne n'y écoute
 * `app/navigate`, le natif ouvrira donc ses liens en changeant d'adresse.
 */
export function withdrawNativeReady(): void {
  if (!hasNativeCapability('app/ready')) return
  postNative('app/ready', { capabilities: [] })
}

/** Couleur des icônes de la barre d'état : `light` sur fond sombre. */
export function setNativeStatusBarStyle(style: NativeStatusBarStyle): void {
  if (!hasNativeCapability('ui/statusBar')) return
  postNative('ui/statusBar', { style })
}

/**
 * Confie la destination à l'app de cartes du téléphone (choix Plans, Google
 * Maps, Waze…). Retourne `false` si le natif ne sait pas le faire : le lien
 * web garde alors la main.
 */
export function openMapsNatively(target: NativeMapsTarget): boolean {
  if (!hasNativeCapability('maps/open')) return false
  return postNative('maps/open', target)
}

let keepAwakeCount = 0

/**
 * Garde l'écran allumé (mode conduite, génération en cours). Le natif n'a
 * qu'un seul verrou pour la page : chaque demandeur appelle `true` puis
 * `false`, et le verrou n'est rendu qu'au départ du dernier.
 */
export function setNativeKeepAwake(active: boolean): void {
  if (!hasNativeCapability('keepAwake/set')) return
  const previous = keepAwakeCount
  keepAwakeCount = Math.max(0, keepAwakeCount + (active ? 1 : -1))
  if ((previous === 0) === (keepAwakeCount === 0)) return
  postNative('keepAwake/set', { active: keepAwakeCount > 0 })
}

/**
 * Propose de noter l'app sur le store. Le système décide seul d'afficher ou
 * non la demande, et la limite à quelques fois par an.
 */
export function requestNativeReview(): void {
  if (!hasNativeCapability('app/requestReview')) return
  postNative('app/requestReview', {})
}
