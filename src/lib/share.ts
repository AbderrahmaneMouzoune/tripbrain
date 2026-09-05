// Partage, côté navigateur.
//
// Deux natures de partage empruntent le même tuyau : l'itinéraire et une
// sélection de documents (voir `document-share.ts`). Toutes deux finissent en
// base64url, sous un code de partage.
//
// Pipeline de l'itinéraire : données → msgpack → deflate → base64url.
//   • payload ≤ SHARE_INLINE_LIMIT : tout tient dans un QR code autonome
//     (<origin>/?import=<données>) — rien ne quitte l'appareil.
//   • sinon, ou dès qu'un code à recopier est demandé : le payload part vers
//     /api/share, qui le range dans le bucket sous un code de partage.

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

/**
 * Forme admise dans une URL de partage : chiffres et séparateurs de lecture.
 *
 * Volontairement tolérant — ce filtre n'est là que pour écarter les adresses
 * fantaisistes ; c'est `/api/share/[code]` qui valide vraiment le code.
 */
export const SHARE_URL_CODE_PATTERN = /^[A-Za-z0-9-]{4,24}$/

/** Ce qu'un code de partage peut contenir. */
export type ShareKind = 'itinerary' | 'documents'

/** Nature retenue quand rien n'est précisé : les partages d'avant les documents. */
export const DEFAULT_SHARE_KIND: ShareKind = 'itinerary'

/**
 * Taille maximale du payload base64url accepté, par nature de partage.
 *
 * Les documents sont des fichiers déjà compressés (PDF, JPEG) : ils pèsent
 * bien plus qu'un itinéraire, mais la requête doit rester sous la limite de
 * corps que les hébergeurs serverless imposent (4,5 Mo chez Vercel).
 */
export const SHARE_MAX_PAYLOAD_CHARS: Record<ShareKind, number> = {
  itinerary: 2 * 1024 * 1024,
  documents: 4 * 1024 * 1024,
}

export function isShareKind(value: unknown): value is ShareKind {
  return value === 'itinerary' || value === 'documents'
}

export interface ShareCode {
  /** Code canonique, chiffres seuls et sans séparateur : `48205137`. */
  code: string
  /** Fin de validité annoncée par le serveur, si elle est connue. */
  expiresAt: Date | null
}

// ── Encodage ──────────────────────────────────────────────────────────────────

/** Assez petit pour ne pas dépasser la pile d'arguments, assez grand pour rester rapide. */
const BASE64_CHUNK_SIZE = 0x8000

export function toBase64Url(bytes: Uint8Array): string {
  // Le payload d'un partage de documents pèse plusieurs mégaoctets : la
  // conversion se fait par tranches, une concaténation caractère par caractère
  // y passerait un temps déraisonnable.
  let binary = ''
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK_SIZE))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export function fromBase64Url(value: string): Uint8Array {
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
 * URL d'ouverture d'un code de partage : `<origin>/s/<code>` pour un
 * itinéraire, `<origin>/d/<code>` pour des documents.
 *
 * Ces pages sont rendues par le serveur : ce sont elles qui portent les
 * métadonnées Open Graph, pour qu'un lien collé dans une messagerie s'affiche
 * en aperçu au lieu d'une adresse nue — et l'annonce correspond alors à ce qui
 * a été partagé. Elles basculent ensuite vers `/?code=<code>`, que
 * l'application sait déjà traiter, quelle que soit la nature du partage.
 */
export function getShareCodeUrl(
  code: string,
  kind: ShareKind = DEFAULT_SHARE_KIND,
): string {
  const segment = kind === 'documents' ? 'd' : 's'
  return `${getOrigin()}/${segment}/${encodeURIComponent(code)}`
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

/** Dépose le payload compressé sur le serveur et retourne le code à partager. */
export async function createShareCode(
  compressed: string,
  kind: ShareKind = DEFAULT_SHARE_KIND,
): Promise<ShareCode> {
  const response = await fetch('/api/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: compressed, kind }),
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

/** Ce qu'un code de partage rend : un payload et de quoi savoir le lire. */
export interface SharedSnapshot {
  kind: ShareKind
  /** Payload compressé (base64url), à décoder selon `kind`. */
  payload: string
  expiresAt: Date | null
}

/**
 * Résout un code de partage en payload brut.
 *
 * La nature du partage vient du serveur : celui qui saisit un code n'a pas à
 * savoir s'il porte un itinéraire ou des documents, c'est la réponse qui le
 * dit et l'interface qui s'adapte.
 */
export async function fetchShare(code: string): Promise<SharedSnapshot> {
  const trimmed = code.trim()
  if (!trimmed) {
    throw new Error('Saisissez un code de partage.')
  }

  const response = await fetch(`/api/share/${encodeURIComponent(trimmed)}`)

  if (!response.ok) {
    throw new Error(await readError(response, 'Code inconnu ou expiré.'))
  }

  const body = (await response.json()) as {
    data?: unknown
    kind?: unknown
    expiresAt?: unknown
  }
  if (typeof body.data !== 'string' || !body.data) {
    throw new Error('Le partage ne contient aucune donnée.')
  }

  return {
    kind: isShareKind(body.kind) ? body.kind : DEFAULT_SHARE_KIND,
    payload: body.data,
    expiresAt:
      typeof body.expiresAt === 'string' ? new Date(body.expiresAt) : null,
  }
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
