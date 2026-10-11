/**
 * Logique pure de l'écran de partage : échéance d'un code, compte à rebours,
 * mention de confidentialité. Séparée de l'écran pour être testée.
 */

import { SHARE_INLINE_LIMIT, type ShareCode } from '@/lib/share'

/** Durée de vie d'un code déposé sur le serveur (`SHARE_EXPIRES_IN` côté API). */
export const SHARE_CODE_TTL_MS = 60 * 60 * 1000

/** Ce que la feuille de partage du système annonce — jamais le voyage lui-même. */
export const NATIVE_SHARE_TITLE = 'Mon voyage sur TripBrain'
export const NATIVE_SHARE_TEXT =
  'Voici mon itinéraire de voyage : ouvre ce lien pour le retrouver dans TripBrain.'

/** Le voyage compressé tient-il dans un QR code autonome ? */
export function fitsInlineQr(compressed: string): boolean {
  return compressed.length <= SHARE_INLINE_LIMIT
}

/**
 * Fin de validité d'un code : celle annoncée par le serveur quand il la
 * donne, sinon l'heure de création plus une heure.
 */
export function resolveShareExpiry(share: ShareCode, createdAt: number): Date {
  if (share.expiresAt && !Number.isNaN(share.expiresAt.getTime())) {
    return share.expiresAt
  }
  return new Date(createdAt + SHARE_CODE_TTL_MS)
}

/**
 * Temps restant, à la minute : « 59 min », « 1 h 05 », « moins d’une
 * minute ». `null` une fois le code expiré.
 */
export function formatCountdown(
  expiresAt: Date,
  now: number = Date.now(),
): string | null {
  const remaining = expiresAt.getTime() - now
  if (remaining <= 0) return null
  if (remaining < 60_000) return 'moins d’une minute'
  // Arrondi vers le haut : « 1 min » tant qu'il reste une fraction de minute.
  const minutes = Math.ceil(remaining / 60_000)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0
    ? `${hours} h`
    : `${hours} h ${String(rest).padStart(2, '0')}`
}

/** Le code chiffre par chiffre, pour qu'un lecteur d'écran le dicte. */
export function spellShareCode(code: string): string {
  return code.split('').join(' ')
}

/**
 * Mention de confidentialité exacte selon le chemin qu'emprunte le voyage :
 * un petit voyage tient entier dans le QR code et dans le lien, sans dépôt ;
 * sinon (et pour le code à dicter) il passe par le serveur, qui l'efface au
 * bout d'une heure.
 */
export function sharePrivacyNote(canInline: boolean): string {
  return canInline
    ? 'Le QR code et le lien contiennent tout le voyage : rien n’est déposé sur un serveur. Seul le code à dicter transite par TripBrain, et il est effacé au bout d’une heure.'
    : 'Les données transitent par TripBrain le temps du transfert et sont effacées au bout d’une heure.'
}

/** Convertit une erreur inconnue en message explicite en français. */
export function toFrenchShareError(
  error: unknown,
  context: 'share' | 'compress',
): string {
  if (!(error instanceof Error)) {
    return context === 'share'
      ? 'Erreur inconnue lors du partage.'
      : 'Erreur inconnue lors de la compression.'
  }
  const message = error.message.toLowerCase()
  if (message.includes('network') || message.includes('failed to fetch')) {
    return 'Erreur réseau : vérifiez votre connexion internet et réessayez.'
  }
  // Les routes /api/share répondent déjà en français : leur message passe tel quel.
  if (context === 'share') return error.message
  return `Erreur de compression : ${error.message}`
}
