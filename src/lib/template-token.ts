// Jeton propriétaire d'un modèle — serveur uniquement (`node:crypto`).
//
// Un modèle n'a pas de compte : c'est ce jeton, gardé sur le téléphone de
// l'auteur, qui l'autorise à mettre à jour, masquer ou retirer son modèle.
// L'id du modèle, lui, est public (URL, sitemap) : il ne peut rien autoriser.
//
// Le jeton est tiré à la publication — par le téléphone, qui le range avant
// d'envoyer et peut ainsi rejouer une publication sans doublon, ou à défaut
// par le serveur — et le serveur n'en garde que l'empreinte SHA-256. Une
// fuite du bucket ne donne donc aucun droit d'écriture. 256 bits aléatoires
// rendent inutile un hachage lent : il n'y a rien à deviner par force brute.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/** 32 octets = 256 bits. */
export const OWNER_TOKEN_BYTES = 32

/** 32 octets en base64url sans remplissage : toujours 43 caractères. */
const OWNER_TOKEN = /^[A-Za-z0-9_-]{43}$/

/** Empreinte SHA-256 en hexadécimal minuscule : 64 caractères. */
const OWNER_TOKEN_HASH = /^[0-9a-f]{64}$/

export function isOwnerToken(value: unknown): value is string {
  return typeof value === 'string' && OWNER_TOKEN.test(value)
}

/** Une empreinte de jeton telle que `hashOwnerToken` l'écrit : 64 caractères hexadécimaux. */
export function isOwnerTokenHash(value: unknown): value is string {
  return typeof value === 'string' && OWNER_TOKEN_HASH.test(value)
}

/**
 * Nouveau jeton propriétaire, quand le téléphone n'en a pas tiré un lui-même
 * (`createOwnerTokenForClient`, `template-api.ts`, même format).
 */
export function createOwnerToken(): string {
  return randomBytes(OWNER_TOKEN_BYTES).toString('base64url')
}

/** Ce que le serveur stocke à la place du jeton. */
export function hashOwnerToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/**
 * Le jeton correspond-il à l'empreinte stockée ? On compare les empreintes,
 * pas les jetons : elles ont toujours la même longueur, et `timingSafeEqual`
 * prend le même temps quel que soit le premier octet qui diffère — la durée de
 * la réponse ne dit rien de ce qui était presque juste.
 */
export function verifyOwnerToken(token: string, hash: string): boolean {
  if (!OWNER_TOKEN_HASH.test(hash)) return false
  const expected = Buffer.from(hash, 'hex')
  const actual = createHash('sha256').update(token, 'utf8').digest()
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

/**
 * Le jeton d'une requête, lu dans `Authorization: Bearer <jeton>` — jamais
 * dans l'URL (journaux, historique, en-tête Referer) ni dans le corps.
 * `null` si l'en-tête manque ou n'a pas la forme d'un jeton : une écriture
 * sur un modèle répond alors 401, sans même lire le modèle. Une publication,
 * elle, accepte l'en-tête absent (le serveur tire le jeton), pas mal formé.
 */
export function readBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header) return null
  // Le schéma est insensible à la casse (RFC 9110, § 11.1).
  const match = /^Bearer +(\S+)$/i.exec(header.trim())
  const token = match?.[1]
  return isOwnerToken(token) ? token : null
}
