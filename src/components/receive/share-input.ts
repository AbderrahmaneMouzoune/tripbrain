/**
 * Lecture de ce qu'on colle, scanne ou trouve dans le presse-papiers.
 *
 * Un voyage partagé arrive sous des formes très diverses : huit chiffres
 * dictés (« 4820 5137 »), un lien `/s/<code>` collé depuis une messagerie, un
 * QR code autonome `/?import=…`, ou le retour du générateur `/#import=…`. Tout
 * converge ici vers la même description qu'une URL d'arrivée
 * (`IncomingShare`), pour que le reste du parcours n'ait qu'un seul cas à
 * traiter.
 *
 * Logique pure : aucun accès au navigateur, testée dans
 * `src/lib/__tests__/receive-share-input.test.ts`.
 */

import {
  SHARE_CODE_LENGTH,
  readIncomingShare,
  type IncomingShare,
} from '@/lib/share'
import { shareImportFailureReason } from '@/lib/analytics/metrics'

/** Ne garde que les chiffres d'une saisie : « 4820-5137 » → « 48205137 ». */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

/** Affichage d'un code en saisie : deux groupes de quatre séparés d'un espace. */
export function groupCodeDigits(digits: string): string {
  const clean = digitsOnly(digits).slice(0, SHARE_CODE_LENGTH)
  return clean.length > 4 ? `${clean.slice(0, 4)} ${clean.slice(4)}` : clean
}

/**
 * Le texte est-il un code de partage, et rien d'autre ?
 *
 * Les séparateurs de lecture (espace, tiret, point) sont tolérés, pas le
 * texte autour : un numéro de téléphone ou une date dans un message copié ne
 * doit pas passer pour un code.
 */
export function extractShareCode(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed || !/^[\d\s.\-–—]+$/.test(trimmed)) return null
  const digits = digitsOnly(trimmed)
  return digits.length === SHARE_CODE_LENGTH ? digits : null
}

/**
 * Un lien vient-il de TripBrain ? Le site vitrine, l'app, ou l'origine
 * courante (préproduction, développement local).
 */
export function isTripBrainHost(host: string, currentHost?: string): boolean {
  const normalized = host.toLowerCase()
  if (currentHost && normalized === currentHost.toLowerCase()) return true
  return normalized === 'tripbrain.fr' || normalized.endsWith('.tripbrain.fr')
}

/** `/s/<code>` : la page d'aperçu d'un lien de partage, qui renvoie vers `?code=`. */
const SHARE_PAGE_PATH = /^\/s\/([A-Za-z0-9-]{4,24})\/?$/

function readShareUrl(raw: string, currentHost?: string): IncomingShare | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (!isTripBrainHost(url.host, currentHost)) return null

  const page = url.pathname.match(SHARE_PAGE_PATH)
  if (page) {
    const code = decodeURIComponent(page[1])
    const digits = digitsOnly(code)
    return { code: digits.length === SHARE_CODE_LENGTH ? digits : code }
  }

  return readIncomingShare(url.search, url.hash)
}

/**
 * Ce que transporte un texte collé ou scanné : un code seul, ou un lien de
 * partage TripBrain, éventuellement noyé dans un message (« Voici notre
 * voyage : https://… »). `null` quand il n'y a rien de reconnaissable.
 *
 * `currentHost` (le `location.host` de l'app) fait accepter les liens de
 * l'instance en cours, en plus de `tripbrain.fr`.
 */
export function parseShareInput(
  text: string,
  currentHost?: string,
): IncomingShare | null {
  const code = extractShareCode(text)
  if (code) return { code }

  const urls = text.match(/https?:\/\/[^\s<>"']+/gi) ?? []
  for (const candidate of urls) {
    // Une ponctuation de fin de phrase n'appartient pas au lien.
    const share = readShareUrl(
      candidate.replace(/[.,;:!?)]+$/, ''),
      currentHost,
    )
    if (share) return share
  }
  return null
}

// ── Erreurs de réception ─────────────────────────────────────────────────────

/** Ce qu'on peut dire à l'utilisateur d'un échec, et ce qu'on lui propose. */
export interface ShareErrorDescription {
  /** Code introuvable ou expiré : on propose d'en redemander un ou de scanner. */
  kind: 'not_found' | 'network' | 'invalid' | 'other'
  message: string
}

/**
 * Message français d'un échec de réception. Les routes `/api/share` et le
 * décodage répondent déjà en français ; seuls les cas fréquents sont reformulés
 * pour dire quoi faire.
 */
export function describeShareError(error: unknown): ShareErrorDescription {
  const reason = shareImportFailureReason(error)
  if (reason === 'expired' || reason === 'invalid_code') {
    return {
      kind: 'not_found',
      message:
        'Ce code a expiré ou n’existe pas. Les codes restent valables une heure.',
    }
  }
  if (reason === 'network_error') {
    return {
      kind: 'network',
      message:
        'Erreur réseau : vérifiez votre connexion internet et réessayez.',
    }
  }
  if (reason === 'invalid_payload') {
    return {
      kind: 'invalid',
      message:
        error instanceof Error
          ? error.message
          : 'Le partage ne contient pas d’itinéraire valide.',
    }
  }
  return {
    kind: 'other',
    message: error instanceof Error ? error.message : 'Import impossible.',
  }
}
