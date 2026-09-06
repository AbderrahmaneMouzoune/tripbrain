// Partage d'un itinéraire, côté navigateur.
//
// Pipeline : données → msgpack → deflate → base64url.
//   • payload ≤ SHARE_INLINE_LIMIT : tout tient dans un QR code autonome
//     (<origin>/?import=<données>) — rien ne quitte l'appareil.
//   • sinon, ou dès qu'un code à recopier est demandé : le payload part vers
//     /api/share, qui le range dans le bucket sous un code de partage.
//
// Le générateur du site vitrine parle le même dialecte : il produit le même
// payload compressé et l'amène ici par `<origin>/#import=<données>`. Voir
// `readIncomingShare`, en bas de ce fichier.

import { encode, decode } from '@msgpack/msgpack'
import { deflateSync, inflateSync } from 'fflate'
import type { DayItinerary } from '@/lib/itinerary-data'

/** Au-delà, un QR code inline devient trop dense pour être scanné confortablement. */
export const SHARE_INLINE_LIMIT = 2000

/**
 * Longueur d'un code de partage — celle que le serveur produit (bucketcode).
 * Le code n'est fait que de chiffres : voir `syncCode` dans `share-store.ts`.
 */
export const SHARE_CODE_LENGTH = 8

export interface ShareCode {
  /** Code canonique, chiffres seuls et sans séparateur : `48205137`. */
  code: string
  /** Fin de validité annoncée par le serveur, si elle est connue. */
  expiresAt: Date | null
}

// ── Encodage ──────────────────────────────────────────────────────────────────

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export async function compressItinerary(
  itinerary: DayItinerary[],
): Promise<string> {
  const packed = encode(itinerary)
  const compressed = deflateSync(packed, { level: 9 })
  return toBase64Url(compressed)
}

// ── Décodage ──────────────────────────────────────────────────────────────────

/**
 * Le payload arrive d'une URL ou d'un serveur : il est validé avant d'atteindre
 * IndexedDB, comme n'importe quel import de fichier.
 */
function isDayItinerary(value: unknown): value is DayItinerary {
  if (typeof value !== 'object' || value === null) return false
  const day = value as Partial<DayItinerary>
  return (
    typeof day.id === 'string' &&
    typeof day.date === 'string' &&
    typeof day.dayNumber === 'number' &&
    typeof day.city === 'string' &&
    typeof day.title === 'string' &&
    Array.isArray(day.activities) &&
    Array.isArray(day.coordinates) &&
    day.coordinates.length === 2 &&
    day.coordinates.every((n) => typeof n === 'number')
  )
}

/** Reconstruit l'itinéraire à partir d'un payload compressé (base64url). */
export function decompressItinerary(compressed: string): DayItinerary[] {
  let decoded: unknown
  try {
    decoded = decode(inflateSync(fromBase64Url(compressed)))
  } catch {
    throw new Error('Données de partage illisibles ou incomplètes.')
  }

  if (!Array.isArray(decoded) || !decoded.every(isDayItinerary)) {
    throw new Error('Le partage ne contient pas d’itinéraire valide.')
  }

  return decoded
}

// ── URLs et mise en forme ─────────────────────────────────────────────────────

function getOrigin(): string {
  return typeof window !== 'undefined' ? window.location.origin : ''
}

/**
 * URL inline compatible PWA pour un itinéraire compressé.
 * Format : `<origin>/?import=<compressed>` — utilisable tel quel dans un QR code.
 */
export function getInlineQrUrl(compressed: string): string {
  return `${getOrigin()}/?import=${compressed}`
}

/**
 * URL d'ouverture d'un code de partage : `<origin>/s/<code>`.
 *
 * Cette page est rendue par le serveur : c'est elle qui porte les métadonnées
 * Open Graph, pour qu'un lien collé dans une messagerie s'affiche en aperçu au
 * lieu d'une adresse nue. Elle bascule ensuite vers `/?code=<code>`, que
 * l'application sait déjà traiter.
 */
export function getShareCodeUrl(code: string): string {
  return `${getOrigin()}/s/${encodeURIComponent(code)}`
}

/** Découpe le code en groupes de quatre — plus facile à lire et à dicter. */
export function formatShareCode(code: string): string {
  return code.replace(/(.{4})(?=.)/g, '$1-')
}

// ── Partage natif ─────────────────────────────────────────────────────────────

/** Ce que la feuille de partage du système reçoit — jamais l'itinéraire lui-même. */
export interface NativeShareContent {
  title: string
  text: string
  url: string
}

/** Comment s'est terminée l'ouverture de la feuille de partage du système. */
export type NativeShareOutcome =
  /** Le contenu est parti dans l'application choisie. */
  | 'shared'
  /** La feuille a été fermée sans rien envoyer — ce n'est pas une erreur. */
  | 'dismissed'
  /** Pas de partage natif ici, ou il a refusé : au reste de l'interface de prendre le relais. */
  | 'unavailable'

/**
 * Le partage natif du système est-il utilisable pour ce contenu ?
 *
 * Toujours `false` côté serveur : le résultat ne doit donc décider d'un rendu
 * qu'après le montage, sinon l'hydratation ne correspondrait pas.
 */
export function canShareNatively(content?: NativeShareContent): boolean {
  if (typeof navigator === 'undefined') return false
  if (typeof navigator.share !== 'function') return false
  // `canShare` dit ce que la plateforme accepte réellement de transmettre.
  if (content && typeof navigator.canShare === 'function') {
    try {
      return navigator.canShare(content)
    } catch {
      return false
    }
  }
  return true
}

/**
 * Ouvre la feuille de partage du système (Web Share API).
 *
 * À appeler directement depuis le clic : les navigateurs exigent un geste
 * utilisateur, et toute attente intercalée invaliderait l'appel.
 */
export async function shareNatively(
  content: NativeShareContent,
): Promise<NativeShareOutcome> {
  if (!canShareNatively(content)) return 'unavailable'

  try {
    await navigator.share(content)
    return 'shared'
  } catch (error) {
    // Fermer la feuille sans choisir d'application lève `AbortError`.
    if (error instanceof DOMException && error.name === 'AbortError') {
      return 'dismissed'
    }
    return 'unavailable'
  }
}

// ── API de partage ────────────────────────────────────────────────────────────

async function readError(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown }
    if (typeof body?.error === 'string' && body.error) return body.error
  } catch {
    // Réponse sans JSON exploitable — le message générique fera l'affaire.
  }
  return fallback
}

/** Dépose l'itinéraire compressé sur le serveur et retourne le code à partager. */
export async function createShareCode(compressed: string): Promise<ShareCode> {
  const response = await fetch('/api/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: compressed }),
  })

  if (!response.ok) {
    throw new Error(
      await readError(response, 'Le partage a échoué. Réessayez.'),
    )
  }

  const body = (await response.json()) as {
    code?: unknown
    expiresAt?: unknown
  }
  if (typeof body.code !== 'string' || !body.code) {
    throw new Error('Code de partage invalide.')
  }

  const expiresAt =
    typeof body.expiresAt === 'string' ? new Date(body.expiresAt) : null

  return { code: body.code, expiresAt }
}

/** Résout un code de partage en itinéraire prêt à être enregistré. */
export async function fetchSharedItinerary(
  code: string,
): Promise<DayItinerary[]> {
  const trimmed = code.trim()
  if (!trimmed) {
    throw new Error('Saisissez un code de partage.')
  }

  const response = await fetch(`/api/share/${encodeURIComponent(trimmed)}`)

  if (!response.ok) {
    throw new Error(await readError(response, 'Code inconnu ou expiré.'))
  }

  const body = (await response.json()) as { data?: unknown }
  if (typeof body.data !== 'string' || !body.data) {
    throw new Error('Le partage ne contient aucune donnée.')
  }

  return decompressItinerary(body.data)
}

// ── Résumé d'un partage reçu ──────────────────────────────────────────────────

export interface SharedItinerarySummary {
  dayCount: number
  /** Première et dernière ville, quand elles diffèrent. */
  firstCity: string
  lastCity: string
  /** Dates extrêmes du voyage, au format ISO tel qu'il est stocké. */
  startDate: string
  endDate: string
}

/** De quoi montrer ce qui va être importé avant d'écraser quoi que ce soit. */
export function summarizeSharedItinerary(
  itinerary: DayItinerary[],
): SharedItinerarySummary | null {
  if (itinerary.length === 0) return null

  const first = itinerary[0]
  const last = itinerary[itinerary.length - 1]

  return {
    dayCount: itinerary.length,
    firstCity: first.city,
    lastCity: last.city,
    startDate: first.date,
    endDate: last.date,
  }
}

/**
 * Temps restant avant expiration, en français : « 45 minutes », « 1 heure ».
 * Retourne `null` quand l'échéance est inconnue ou déjà passée.
 */
export function formatExpiresIn(
  expiresAt: Date | null,
  now: Date = new Date(),
): string | null {
  if (!expiresAt) return null

  const minutes = Math.round((expiresAt.getTime() - now.getTime()) / 60_000)
  if (minutes <= 0) return null
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''}`

  const hours = Math.round(minutes / 60)
  return `${hours} heure${hours > 1 ? 's' : ''}`
}

// ── Arrivée par une URL ───────────────────────────────────────────────────────

/**
 * D'où vient un itinéraire déposé dans l'URL, quand elle le précise.
 *
 * `generator` désigne le générateur du site vitrine : c'est le seul cas où
 * l'itinéraire n'a pas été préparé dans TripBrain, et l'import le dit.
 */
export type ShareOrigin = 'generator'

/** Ce qu'une URL d'arrivée transporte, une fois démêlée. */
export interface IncomingShare {
  /** Itinéraire complet embarqué dans l'URL (QR code autonome, ou site). */
  payload?: string
  /** Code d'un partage déposé sur le serveur. */
  code?: string
  origin?: ShareOrigin
}

/** Valeur du paramètre `from` reconnue comme une provenance. */
function toOrigin(value: string | null): ShareOrigin | undefined {
  return value === 'generator' ? 'generator' : undefined
}

/**
 * Lit l'itinéraire qu'une URL d'arrivée transporte, où qu'il se trouve.
 *
 * Trois chemins y mènent :
 *   • `?import=` — QR code autonome produit par un autre appareil ;
 *   • `?code=` — partage déposé sur le serveur, à résoudre ;
 *   • `#import=` — passage depuis le générateur du site.
 *
 * Le fragment existe pour ce dernier cas : un itinéraire généré pèse bien plus
 * qu'un QR code, et le fragment n'est jamais transmis au serveur — ni dans nos
 * journaux, ni dans ceux d'un intermédiaire. Il l'emporte donc sur la query
 * quand les deux sont présents : c'est le plus récent des deux chemins.
 */
export function readIncomingShare(
  search: string,
  hash: string,
): IncomingShare | null {
  const query = new URLSearchParams(search)
  const fragment = new URLSearchParams(hash.replace(/^#/, ''))

  const payload = fragment.get('import') ?? query.get('import')
  const code = query.get('code')
  if (!payload && !code) return null

  return {
    ...(payload ? { payload } : {}),
    ...(code && !payload ? { code } : {}),
    ...(toOrigin(fragment.get('from') ?? query.get('from')) === 'generator'
      ? { origin: 'generator' as const }
      : {}),
  }
}
