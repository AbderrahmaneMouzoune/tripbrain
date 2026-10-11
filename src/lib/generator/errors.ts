/**
 * Les échecs possibles du générateur, partagés par les routes (qui les
 * renvoient) et l'app (qui les affiche et les mesure).
 *
 * Une liste fermée plutôt que des messages libres : l'écran choisit son repli
 * selon la cause (proposer le générateur du site, relancer, patienter), et la
 * mesure n'en remonte que le code — jamais le texte du voyage.
 */

export const GENERATOR_FAILURE_REASONS = [
  /** Pas de clé d'API sur ce serveur : le générateur du site prend le relais. */
  'not_configured',
  /** Trop de générations depuis cet appareil : la limite du serveur. */
  'rate_limited',
  /** Le service du modèle est saturé ou a refusé faute de quota. */
  'overloaded',
  /** Le modèle a décliné la demande. */
  'refused',
  /** La réponse n'a pas pu être lue comme un itinéraire. */
  'invalid_json',
  /** Demande mal formée (date passée, description trop courte…). */
  'invalid_request',
  /** Connexion perdue entre l'app et le serveur. */
  'network',
  'unknown',
] as const

export type GeneratorFailureReason = (typeof GENERATOR_FAILURE_REASONS)[number]

export function isGeneratorFailureReason(
  value: unknown,
): value is GeneratorFailureReason {
  return (
    typeof value === 'string' &&
    (GENERATOR_FAILURE_REASONS as readonly string[]).includes(value)
  )
}

/** Message par défaut de chaque cause, quand le serveur n'en dit pas plus. */
export const FAILURE_MESSAGES: Record<GeneratorFailureReason, string> = {
  not_configured:
    'Le générateur intégré n’est pas encore disponible sur ce serveur.',
  rate_limited:
    'Vous avez lancé beaucoup de générations d’affilée. Réessayez dans un moment.',
  overloaded:
    'Le service de génération est très sollicité. Réessayez dans quelques minutes.',
  refused:
    'Cette demande n’a pas pu être traitée. Reformulez votre voyage et réessayez.',
  invalid_json:
    'La réponse reçue était incomplète ou illisible. Relancez la génération.',
  invalid_request: 'La demande est incomplète. Vérifiez les champs.',
  network: 'La connexion a été perdue. Vérifiez le réseau et réessayez.',
  unknown: 'La génération a échoué. Réessayez dans un instant.',
}

/** Statut HTTP renvoyé pour chaque cause détectée avant le début du flux. */
export const FAILURE_STATUS: Record<GeneratorFailureReason, number> = {
  not_configured: 503,
  rate_limited: 429,
  overloaded: 503,
  refused: 422,
  invalid_json: 502,
  invalid_request: 400,
  network: 502,
  unknown: 500,
}
