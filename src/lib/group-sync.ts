/**
 * Voyages à plusieurs : un même itinéraire, tenu à jour sur chaque téléphone.
 *
 * Le partage par code (`share.ts`) envoie une copie : ce que l'un modifie
 * ensuite, l'autre ne le voit jamais. Un voyage de groupe, lui, vit aussi sur
 * le serveur, sous un identifiant secret : chaque téléphone en garde sa copie
 * (le voyage reste lisible hors ligne), envoie ses modifications dès qu'il a
 * du réseau et récupère celles des autres.
 *
 * L'identifiant est un jeton au porteur de 128 bits : qui a le lien
 * d'invitation peut lire et modifier le voyage. Pas de compte, pas de mot de
 * passe — c'est le même contrat que le reste de l'application.
 *
 * Deux écritures simultanées ne s'écrasent pas : le serveur n'accepte une
 * écriture que si elle part de la dernière version (ETag). Sinon il renvoie
 * cette version, le téléphone fusionne (`trip-merge.ts`) et réessaie.
 */

import type { DayItinerary } from '@/lib/itinerary-data'

/** Longueur d'un identifiant de groupe : 16 octets aléatoires en base64url. */
export const GROUP_ID_LENGTH = 22
const GROUP_ID = /^[A-Za-z0-9_-]{22}$/

/** Longueur maximale d'un prénom affiché aux autres voyageurs. */
export const MAX_AUTHOR_LENGTH = 40
/** Longueur maximale d'un titre de voyage stocké avec le groupe. */
export const MAX_GROUP_TITLE_LENGTH = 120

/**
 * Deux ETag désignent-ils la même version ? Les guillemets et le préfixe
 * faible (`W/`) varient selon qui les rapporte (écriture, lecture, proxy) :
 * comparés tels quels, une version inchangée passait pour une nouvelle.
 */
export function sameEtag(a: string | null, b: string | null): boolean {
  const normalize = (value: string) =>
    value.trim().replace(/^W\//, '').replace(/^"|"$/g, '')
  return Boolean(a && b) && normalize(a!) === normalize(b!)
}

export function isGroupId(value: unknown): value is string {
  return typeof value === 'string' && GROUP_ID.test(value)
}

/** Tire un identifiant de groupe imprévisible (crypto, pas Math.random). */
export function createGroupId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Prénom tel qu'il part vers le serveur : nettoyé, borné, ou rien. */
export function cleanAuthor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.replace(/\s+/g, ' ').trim()
  return trimmed ? trimmed.slice(0, MAX_AUTHOR_LENGTH) : null
}

/**
 * Ce que le téléphone sait du groupe d'un voyage. Rangé dans le voyage
 * lui-même (IndexedDB) : il survit à la fermeture de l'application.
 */
export interface TripGroup {
  id: string
  /** Version du serveur sur laquelle repose la copie locale. */
  etag: string | null
  /**
   * Dernière version échangée avec le groupe : l'ancêtre commun de la
   * prochaine fusion. Sans elle, impossible de savoir qui a changé quoi.
   */
  base: { title: string; itinerary: DayItinerary[] } | null
  /** Des modifications locales attendent d'être envoyées. */
  dirty: boolean
  /** Dernier échange réussi avec le serveur (ms). */
  syncedAt: number | null
  /** Qui a écrit la dernière version reçue, et quand (ms). */
  lastAuthor: string | null
  remoteUpdatedAt: number | null
}

/** L'état du groupe tel que le serveur le renvoie. */
export interface GroupState {
  /** Itinéraire compressé (même format que les partages). */
  data: string
  title: string
  author: string | null
  etag: string
  updatedAt: string
}

// ── Liens d'invitation ────────────────────────────────────────────────────────

/** Paramètre d'URL d'une invitation : `<origin>/?groupe=<id>`. */
export const GROUP_INVITE_PARAM = 'groupe'

export function getGroupInviteUrl(id: string, origin?: string): string {
  const base =
    origin ?? (typeof window !== 'undefined' ? window.location.origin : '')
  return `${base}/?${GROUP_INVITE_PARAM}=${encodeURIComponent(id)}`
}

/** Identifiant de groupe porté par une URL d'arrivée, ou `null`. */
export function readGroupInvite(search: string): string | null {
  const id = new URLSearchParams(search).get(GROUP_INVITE_PARAM)
  return isGroupId(id) ? id : null
}

// ── Appels au serveur ─────────────────────────────────────────────────────────

/** Le serveur ne connaît pas (ou plus) ce groupe. */
export class GroupNotFoundError extends Error {
  constructor() {
    super('Ce voyage de groupe n’existe plus.')
    this.name = 'GroupNotFoundError'
  }
}

async function readError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { error?: unknown }
    if (typeof body?.error === 'string' && body.error) return body.error
  } catch {
    // Pas de JSON exploitable : le message générique suffit.
  }
  return fallback
}

function parseState(body: unknown): GroupState {
  const value = body as Partial<GroupState> | null
  if (
    !value ||
    typeof value.data !== 'string' ||
    typeof value.etag !== 'string' ||
    typeof value.updatedAt !== 'string'
  ) {
    throw new Error('Réponse du serveur illisible.')
  }
  return {
    data: value.data,
    title: typeof value.title === 'string' ? value.title : '',
    author: cleanAuthor(value.author),
    etag: value.etag,
    updatedAt: value.updatedAt,
  }
}

interface WriteBody {
  data: string
  title: string
  author: string | null
}

/** Crée le groupe à partir du voyage, et renvoie son identifiant. */
export async function createGroup(
  body: WriteBody,
): Promise<GroupState & { id: string }> {
  const response = await fetch('/api/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(
      await readError(response, 'La synchronisation n’a pas pu démarrer.'),
    )
  }
  const json = (await response.json()) as { id?: unknown }
  if (!isGroupId(json.id)) throw new Error('Réponse du serveur illisible.')
  return { ...parseState(json), id: json.id }
}

export type FetchGroupResult =
  | { status: 'unchanged' }
  | { status: 'changed'; state: GroupState }

/**
 * Lit le groupe. Avec l'ETag connu, le serveur répond « inchangé » sans
 * renvoyer l'itinéraire : c'est le cas de presque toutes les vérifications.
 */
export async function fetchGroup(
  id: string,
  etag?: string | null,
): Promise<FetchGroupResult> {
  const response = await fetch(`/api/groups/${encodeURIComponent(id)}`, {
    headers: etag ? { 'If-None-Match': etag } : undefined,
    cache: 'no-store',
  })
  if (response.status === 304) return { status: 'unchanged' }
  if (response.status === 404) throw new GroupNotFoundError()
  if (!response.ok) {
    throw new Error(await readError(response, 'Synchronisation impossible.'))
  }
  return { status: 'changed', state: parseState(await response.json()) }
}

/**
 * Version actuelle du groupe sur le serveur, sans télécharger le voyage.
 * Sert à dire « à jour » ou « nouvelle version disponible ».
 */
export async function checkGroupVersion(id: string): Promise<string> {
  const response = await fetch(`/api/groups/${encodeURIComponent(id)}`, {
    method: 'HEAD',
    cache: 'no-store',
  })
  if (response.status === 404) throw new GroupNotFoundError()
  const version = response.headers.get('X-Group-Version')
  if (!response.ok || !version) {
    throw new Error('Vérification impossible.')
  }
  return version
}

/**
 * Où en est la copie de ce téléphone par rapport au groupe :
 * - `synced` : la même version que les autres ;
 * - `behind` : les autres ont modifié le voyage depuis ;
 * - `ahead` : des modifications d'ici ne sont pas encore envoyées ;
 * - `diverged` : les deux à la fois ;
 * - `unknown` : pas encore vérifié (hors ligne, par exemple).
 */
export type GroupVersionState =
  | 'synced'
  | 'behind'
  | 'ahead'
  | 'diverged'
  | 'unknown'

export function groupVersionState(
  group: Pick<TripGroup, 'etag' | 'dirty'>,
  remoteVersion: string | null,
): GroupVersionState {
  if (!remoteVersion) return group.dirty ? 'ahead' : 'unknown'
  const same = sameEtag(group.etag, remoteVersion)
  if (group.dirty) return same ? 'ahead' : 'diverged'
  return same ? 'synced' : 'behind'
}

export type PushGroupResult =
  | { status: 'saved'; etag: string; updatedAt: string }
  /** Quelqu'un a écrit entre-temps : voici sa version, à fusionner. */
  | { status: 'conflict'; current: GroupState }

/** Envoie la copie locale, à condition qu'elle parte de `ifMatch`. */
export async function pushGroup(
  id: string,
  body: WriteBody,
  ifMatch: string | null,
): Promise<PushGroupResult> {
  const response = await fetch(`/api/groups/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(ifMatch ? { 'If-Match': ifMatch } : {}),
    },
    body: JSON.stringify(body),
  })
  if (response.status === 404) throw new GroupNotFoundError()
  if (response.status === 412) {
    const json = (await response.json()) as { current?: unknown }
    return { status: 'conflict', current: parseState(json.current) }
  }
  if (!response.ok) {
    throw new Error(await readError(response, 'Synchronisation impossible.'))
  }
  const json = (await response.json()) as {
    etag?: unknown
    updatedAt?: unknown
  }
  if (typeof json.etag !== 'string' || typeof json.updatedAt !== 'string') {
    throw new Error('Réponse du serveur illisible.')
  }
  return { status: 'saved', etag: json.etag, updatedAt: json.updatedAt }
}
