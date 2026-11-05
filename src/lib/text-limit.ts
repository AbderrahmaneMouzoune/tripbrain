// Bornes de longueur des textes saisis (titres, prénoms). Module sans
// dépendance : `group-sync.ts` (navigateur) comme le store des modèles
// (serveur) l'importent sans cycle.

/** Une paire UTF-16 entière, ou une moitié isolée. */
const SURROGATES = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g

/**
 * Le texte en UTF-16 valide : chaque moitié de paire isolée devient U+FFFD,
 * comme le ferait `String.prototype.toWellFormed`, absent des Safari
 * antérieurs à 16.4.
 */
export function wellFormedText(text: string): string {
  return text.replace(SURROGATES, (match) =>
    match.length === 2 ? match : '\uFFFD',
  )
}

/**
 * Borne un texte à `max` unités UTF-16 (la mesure de `maxLength` en HTML),
 * sans jamais laisser de surrogate isolé : un emoji à cheval sur la borne
 * est retiré en entier plutôt que coupé en deux.
 */
export function truncateText(text: string, max: number): string {
  const wellFormed = wellFormedText(text)
  if (wellFormed.length <= max) return wellFormed
  const cut = wellFormed.slice(0, max)
  return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut
}
