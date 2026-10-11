/**
 * Exemples de voyages proposés en un clic. Repris à l'identique du générateur
 * du site vitrine (`tripbrain-landing`, `src/lib/trip-examples.ts`) : les deux
 * parcours montrent les mêmes suggestions.
 */

export interface TripExample {
  /** Texte court affiché sur la puce cliquable. */
  label: string
  /** Description complète insérée dans le champ. */
  prompt: string
}

export const TRIP_EXAMPLES: TripExample[] = [
  {
    label: '1 semaine au Japon',
    prompt:
      'Une semaine au Japon en couple, fan de temples et de street food, budget confort, départ mi-avril.',
  },
  {
    label: '5 jours à Lisbonne',
    prompt:
      '5 jours à Lisbonne entre amis, on aime les quartiers qui vivent, les miradors et les bonnes tables sans se ruiner.',
  },
  {
    label: '10 jours de road trip',
    prompt:
      '10 jours de road trip en Andalousie en famille, rythme tranquille, avec des étapes à Séville, Cordoue et Grenade.',
  },
]

/** Placeholder commun aux champs « décris ton voyage ». */
export const TRIP_DESCRIPTION_PLACEHOLDER = TRIP_EXAMPLES[0].prompt
