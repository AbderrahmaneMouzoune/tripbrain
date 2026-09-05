/**
 * Qui, en dehors de l'application, a le droit de déposer un partage.
 *
 * Le générateur du site vitrine produit un itinéraire pour cette app : quand
 * il est généré sur un ordinateur et attendu sur un téléphone, il passe par
 * `/api/share` comme n'importe quel partage, puis par un code à huit chiffres.
 * Cet appel-là vient d'une autre origine (`tripbrain.fr`), d'où cette liste.
 *
 * Rien d'autre n'est ouvert : la lecture (`/api/share/[code]`) reste sur
 * l'origine de l'app, et le dépôt garde sa limite de débit et sa taille
 * maximale — le contrôle d'origine n'est qu'un filtre de plus.
 */

/** Origines admises en dur : le site vitrine, avec et sans `www`. */
const DEFAULT_ALLOWED_ORIGINS = [
  'https://tripbrain.fr',
  'https://www.tripbrain.fr',
] as const

/**
 * Origines supplémentaires, séparées par des virgules. Sert aux
 * préproductions du site (`https://…vercel.app`), qui changent à chaque
 * déploiement et n'ont donc rien à faire dans le code.
 */
function extraOrigins(): string[] {
  return (process.env.SHARE_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

/** L'origine de la requête est-elle autorisée à déposer un partage ? */
export function isAllowedOrigin(origin: string | null): origin is string {
  if (!origin) return false
  return (
    DEFAULT_ALLOWED_ORIGINS.includes(
      origin as (typeof DEFAULT_ALLOWED_ORIGINS)[number],
    ) || extraOrigins().includes(origin)
  )
}

/**
 * En-têtes à joindre à une réponse pour qu'un navigateur accepte de la lire
 * depuis une autre origine. Vides quand l'origine n'est pas dans la liste :
 * la requête aboutit côté serveur, mais le navigateur en refuse la lecture.
 *
 * `Vary: Origin` est là quoi qu'il arrive — sans lui, un cache partagé
 * servirait à tous la réponse taillée pour un seul.
 */
export function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = { Vary: 'Origin' }
  if (!isAllowedOrigin(origin)) return headers

  headers['Access-Control-Allow-Origin'] = origin
  headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
  headers['Access-Control-Allow-Headers'] = 'Content-Type'
  // Une journée de préflight en cache : le dépôt d'un partage n'en fait qu'un.
  headers['Access-Control-Max-Age'] = '86400'
  return headers
}

/** Réponse au préflight : rien à renvoyer d'autre que les en-têtes. */
export function preflightResponse(request: Request): Response {
  const origin = request.headers.get('origin')
  return new Response(null, {
    status: isAllowedOrigin(origin) ? 204 : 403,
    headers: corsHeaders(origin),
  })
}
