/**
 * Protocole bridge WebView ↔ webapp.
 *
 * Webapp → natif : window.ReactNativeWebView.postMessage(JSON.stringify(req))
 *   { id, type, payload }
 *
 * Natif → webapp : injection JS qui dispatch un CustomEvent
 *   window.dispatchEvent(new CustomEvent("tripbrain:native-response", { detail }))
 *   { id?, type, payload }
 *
 * Requêtes (webapp → natif) et leur réponse :
 *   share/link          { title?, text?, url }         → share/result        { outcome }
 *   file/share          { name, mimeType?, base64 }    → share/result        { outcome }
 *   haptic/trigger      { kind }                       → (aucune)
 *   qr/scan             {}                             → qr/result           { value }
 *   notifications/sync  { reminders: [...] }           → notifications/state { permission, scheduled }
 *   calendar/add        { events: [...] }              → calendar/result     { outcome, count }
 *   app/openSettings    {}                             → (aucune)
 *
 * Événements spontanés (natif → webapp, sans id) :
 *   file/import         { name, mimeType?, base64 }    — fichier ouvert avec TripBrain
 *
 * Pourquoi ce bridge : dans une WebView, ni `<a download>` (exports JSON,
 * ICS, ZIP, modèles) ni `navigator.share` (Android) ne fonctionnent, et le
 * web n'a ni retour haptique, ni rappels locaux, ni accès au calendrier.
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

export type HapticKind =
  | 'selection'
  | 'impact'
  | 'success'
  | 'warning'
  | 'error'

const HAPTIC_KINDS: readonly HapticKind[] = [
  'selection',
  'impact',
  'success',
  'warning',
  'error',
]

/** Un rappel local : le téléphone le présente à l'heure dite, sans réseau. */
export interface ReminderPayload {
  /** Stable d'une synchronisation à l'autre (identifiant de l'entité). */
  id: string
  title: string
  body?: string
  /** Date-heure ISO 8601, en heure locale de l'appareil. */
  at: string
  /** Chemin de la webapp à ouvrir au tap (ex. `/`). */
  path?: string
}

/** Un événement à écrire dans le calendrier du téléphone (journée entière). */
export interface CalendarEventPayload {
  title: string
  /** Jour de début, `AAAA-MM-JJ`. */
  date: string
  /** Jour de fin exclu, `AAAA-MM-JJ` ; le lendemain si absent. */
  endDate?: string
  location?: string
  notes?: string
}

export type BridgeRequest =
  | { id?: string; type: 'share/link'; payload: ShareLinkPayload }
  | { id?: string; type: 'file/share'; payload: ShareFilePayload }
  | { id?: string; type: 'haptic/trigger'; payload: { kind: HapticKind } }
  | { id?: string; type: 'qr/scan'; payload: Record<string, never> }
  | {
      id?: string
      type: 'notifications/sync'
      payload: { reminders: ReminderPayload[] }
    }
  | {
      id?: string
      type: 'calendar/add'
      payload: { events: CalendarEventPayload[] }
    }
  | { id?: string; type: 'app/openSettings'; payload: Record<string, never> }

export type NotificationPermission =
  | 'granted'
  | 'denied'
  | 'undetermined'
  | 'unsupported'

export type CalendarOutcome = 'added' | 'denied' | 'unavailable'

export type BridgeResponse =
  | { id?: string; type: 'share/result'; payload: { outcome: ShareOutcome } }
  | { id?: string; type: 'qr/result'; payload: { value: string | null } }
  | {
      id?: string
      type: 'notifications/state'
      payload: { permission: NotificationPermission; scheduled: number }
    }
  | {
      id?: string
      type: 'calendar/result'
      payload: { outcome: CalendarOutcome; count: number }
    }
  | { id?: undefined; type: 'file/import'; payload: ShareFilePayload }

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

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function parseReminder(value: unknown): ReminderPayload | null {
  if (!isRecord(value)) return null
  const { id, title, body, at, path } = value
  if (!nonEmptyString(id) || !nonEmptyString(title) || !nonEmptyString(at)) {
    return null
  }
  if (!optionalString(body) || !optionalString(path)) return null
  return { id, title, body, at, path }
}

function parseCalendarEvent(value: unknown): CalendarEventPayload | null {
  if (!isRecord(value)) return null
  const { title, date, endDate, location, notes } = value
  if (!nonEmptyString(title) || !nonEmptyString(date)) return null
  if (
    !optionalString(endDate) ||
    !optionalString(location) ||
    !optionalString(notes)
  ) {
    return null
  }
  return { title, date, endDate, location, notes }
}

/** Lit une liste en ignorant les entrées mal formées ; `null` si ce n'en est pas une. */
function parseList<T>(
  value: unknown,
  parse: (item: unknown) => T | null,
): T[] | null {
  if (!Array.isArray(value)) return null
  const parsed: T[] = []
  for (const item of value) {
    const result = parse(item)
    if (result) parsed.push(result)
  }
  return parsed
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

  const { id, type } = parsed
  if (!optionalString(id)) return null
  const payload = isRecord(parsed.payload) ? parsed.payload : {}

  switch (type) {
    case 'share/link': {
      if (!nonEmptyString(payload.url)) return null
      if (!optionalString(payload.title) || !optionalString(payload.text)) {
        return null
      }
      return {
        id,
        type,
        payload: { title: payload.title, text: payload.text, url: payload.url },
      }
    }
    case 'file/share': {
      if (!nonEmptyString(payload.name)) return null
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
    case 'haptic/trigger': {
      const kind = payload.kind
      if (!HAPTIC_KINDS.includes(kind as HapticKind)) return null
      return { id, type, payload: { kind: kind as HapticKind } }
    }
    case 'qr/scan':
      return { id, type, payload: {} }
    case 'notifications/sync': {
      const reminders = parseList(payload.reminders, parseReminder)
      if (!reminders) return null
      return { id, type, payload: { reminders } }
    }
    case 'calendar/add': {
      const events = parseList(payload.events, parseCalendarEvent)
      if (!events) return null
      return { id, type, payload: { events } }
    }
    case 'app/openSettings':
      return { id, type, payload: {} }
    default:
      return null
  }
}

/**
 * Script injecté dans la WebView pour répondre à une requête bridge ou lui
 * signaler un événement. Termine par `true` : requis par react-native-webview.
 */
export function buildBridgeResponseScript(response: BridgeResponse): string {
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
