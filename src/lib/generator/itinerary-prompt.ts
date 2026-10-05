import { addDays } from '@/lib/generator/itinerary-quality'
import type { GeneratedItinerary } from '@/lib/generator/itinerary-schema'
import {
  activitiesPerDay,
  buildBriefRules,
  buildBriefSections,
  DEFAULT_ACTIVITIES_PER_DAY,
  type TripBrief,
} from '@/lib/generator/trip-brief'

/**
 * Le prompt envoyé à Claude par `/api/generate`.
 *
 * Porté du générateur du site vitrine, où il était copié dans ChatGPT ou
 * Claude. Deux entrées possibles : une phrase libre (mode express) ou le
 * questionnaire détaillé. Les deux produisent le même squelette — même
 * structure JSON, mêmes règles de base — pour qu'un itinéraire reste lisible
 * quelle que soit la façon dont il a été décrit.
 *
 * Seule la consigne de forme a changé : plus besoin d'un bloc ```json à
 * copier d'un geste, la réponse arrive directement dans l'app. On demande donc
 * le JSON minifié nu, que l'app lit au fil de l'eau.
 */

/**
 * La structure attendue, écrite exactement comme la réponse doit l'être :
 * minifiée, sur une seule ligne. Le modèle recopie la mise en forme de
 * l'exemple qu'on lui donne — un squelette indenté produit une réponse
 * indentée, deux à trois fois plus longue, donc plus lente et plus chère. Les
 * champs "a|b" sont des énumérations, les champs optionnels peuvent être
 * omis.
 *
 * `tripTitle` et `summary` viennent avant `days` : l'écran de génération les
 * affiche dès les premiers caractères, avant la première journée.
 */
export const JSON_SHAPE =
  '{"tripTitle":"Titre du voyage","summary":"Résumé du voyage en 2 ou 3 phrases.",' +
  '"days":[{"date":"2026-04-15","city":"Kyoto","title":"Kyoto impérial",' +
  '"dayType":"arrival|sightseeing|travel|rest|departure",' +
  '"coordinates":{"lat":35.0116,"lng":135.7681},' +
  '"highlights":["Point fort 1","Point fort 2"],' +
  '"foodRecommendations":["Plat ou adresse typique"],"walkingDistance":"7 km",' +
  '"tips":["Conseil pratique"],"notes":"Note libre sur la journée.",' +
  '"transport":{"type":"train|car|plane|bus","from":"Ville de départ","to":"Ville d\'arrivée",' +
  '"details":"Ligne, compagnie…","departureTime":"09:15","arrivalTime":"11:30","duration":"2h15"},' +
  '"activities":[{"name":"Nom du lieu","description":"Pourquoi ce lieu vaut le détour.",' +
  '"type":"visit|food|experience|shopping|transport","duration":"1h30",' +
  '"address":"Adresse ou quartier","coordinates":{"lat":35.0,"lng":135.7},' +
  '"openAt":"09:00–18:00","price":10,"currency":"EUR","reservationRequired":false,' +
  '"tags":["incontournable"],"tips":"Conseil pratique."}]}]}'

/**
 * La consigne de forme, commune à la génération et à l'affinage. Le JSON nu,
 * sans bloc de code : l'app le lit tel qu'il arrive, journée par journée.
 */
const FORMAT_LINES = [
  'Réponds UNIQUEMENT avec ce JSON minifié : commence directement par « { » et termine par « } », sans bloc de code, sans aucun texte avant ni après.',
  'Minifié veut dire : tout sur une seule ligne, sans indentation, sans retour à la ligne et sans espace entre les champs. Une réponse indentée est deux à trois fois plus longue, donc plus lente à arriver et coupée plus tôt.',
  'Structure attendue (les champs marqués "a|b" sont des énumérations, choisis une seule valeur ; les champs optionnels peuvent être omis) :',
  '',
  JSON_SHAPE,
]

/** Règles de concision et de complétude, communes aux deux usages. */
const BREVITY_RULES = [
  '- Va droit au but : "description", "tips" et "notes" en une phrase courte (140 caractères maximum), 3 "highlights" et 3 "tags" au maximum. Omets un champ optionnel plutôt que de le remplir approximativement.',
  '- Le JSON doit aller jusqu’à la dernière journée et se terminer par "]}" : si la réponse devient trop longue, raccourcis les textes, jamais le nombre de jours.',
]

/** Mois du départ, en toutes lettres : la saison change tout sur place. */
function monthName(startDate: string): string {
  return new Date(`${startDate}T00:00:00`).toLocaleDateString('fr-FR', {
    month: 'long',
  })
}

/** « 5 jours » / « 1 jour ». */
function daysLabel(count: number): string {
  return `${count} jour${count > 1 ? 's' : ''}`
}

interface PromptParts {
  /** Description du voyage : phrase libre ou brief structuré. */
  trip: string
  startDate: string
  /** Durée imposée, quand le voyageur l'a renseignée. */
  durationDays?: number
  /** Nombre d'activités par jour, ex. « 3 à 5 ». */
  activities: string
  /** Règles supplémentaires issues du questionnaire, déjà préfixées de « - ». */
  extraRules?: string[]
}

function dateLines(startDate: string, durationDays?: number): string[] {
  const lines = [
    `Le voyage commence le ${startDate}. La première journée porte cette date exacte et chaque journée suivante avance d'un jour : n'invente aucune autre date.`,
  ]
  if (durationDays && durationDays > 0) {
    lines.push(
      `Il dure exactement ${daysLabel(durationDays)} et se termine le ${addDays(
        startDate,
        durationDays - 1,
      )} : le tableau "days" contient exactement ${durationDays} élément${
        durationDays > 1 ? 's' : ''
      }.`,
    )
  }
  lines.push(
    `Le départ a lieu en ${monthName(startDate)} : tiens compte de la saison (météo, horaires réduits, affluence, fermetures annuelles).`,
  )
  return lines
}

function composePrompt({
  trip,
  startDate,
  durationDays,
  activities,
  extraRules = [],
}: PromptParts): string {
  return [
    'Tu es un expert en création d’itinéraires de voyage.',
    'Crée un itinéraire détaillé, réaliste et en français pour le voyage suivant :',
    '',
    trip,
    '',
    ...dateLines(startDate, durationDays),
    '',
    ...FORMAT_LINES,
    '',
    'Règles :',
    `- Un élément dans "days" par jour de voyage, dates ISO consécutives sans trou à partir du ${startDate}.`,
    `- ${activities} activités par jour, ordonnées chronologiquement, avec au moins une pause repas de type "food".`,
    '- Ajoute "transport" uniquement les jours avec un déplacement entre deux villes.',
    '- Ne propose aucun hébergement : le voyageur réserve lui-même et l’ajoutera à la main.',
    '- Utilise de vrais lieux avec des coordonnées GPS approximatives réelles.',
    '- Regroupe les activités géographiquement pour limiter les trajets dans la journée.',
    ...BREVITY_RULES,
    ...extraRules,
  ].join('\n')
}

/**
 * Mode express : une phrase libre suffit, l'IA comble le reste. La durée
 * choisie au sélecteur est imposée : dans l'app elle est toujours connue, et
 * c'est elle qui donne le « Jour n sur N » de l'écran de génération.
 */
export function buildExpressPrompt(
  description: string,
  startDate: string,
  durationDays?: number,
): string {
  return composePrompt({
    trip: description.trim(),
    startDate,
    durationDays,
    activities: DEFAULT_ACTIVITIES_PER_DAY,
  })
}

/** Mode questionnaire : le brief détaillé, section par section. */
export function buildBriefPrompt(brief: TripBrief, startDate: string): string {
  return composePrompt({
    trip: buildBriefSections(brief),
    startDate,
    durationDays: brief.durationDays,
    activities: activitiesPerDay(brief),
    extraRules: buildBriefRules(brief),
  })
}

/**
 * Affinage : l'itinéraire actuel et la demande du voyageur, pour un nouvel
 * itinéraire complet.
 *
 * Le modèle rend tout le voyage plutôt qu'un correctif : c'est plus fiable
 * qu'un format de patch, et l'app compare ensuite avant/après pour montrer
 * les changements. D'où l'insistance à recopier à l'identique ce que la
 * demande ne touche pas — sinon chaque reformulation gratuite apparaîtrait
 * comme un changement proposé.
 *
 * La demande est encadrée de balises : c'est un texte du voyageur, à traiter
 * comme une demande de modification et rien d'autre.
 */
export function buildRefinePrompt(
  itinerary: GeneratedItinerary,
  instruction: string,
  startDate: string,
): string {
  const count = itinerary.days.length
  return [
    'Tu es un expert en création d’itinéraires de voyage.',
    'Voici un itinéraire de voyage existant, au format JSON :',
    '',
    `<itineraire>${JSON.stringify(itinerary)}</itineraire>`,
    '',
    'Le voyageur demande la modification suivante :',
    '',
    `<demande>${instruction.trim()}</demande>`,
    '',
    'Applique cette demande et rends l’itinéraire complet modifié, en français.',
    ...dateLines(startDate),
    '',
    ...FORMAT_LINES,
    '',
    'Règles :',
    `- Garde ${daysLabel(count)} au total, sauf si la demande dit explicitement d’allonger ou de raccourcir le voyage : retirer une étape libère des journées à redistribuer, ajouter une nuit en prend ailleurs.`,
    `- Dates ISO consécutives sans trou à partir du ${startDate}, une journée par élément de "days".`,
    '- Ne change que ce que la demande implique. Recopie à l’identique, champ par champ, les journées et activités qu’elle ne touche pas : mêmes textes, même ordre.',
    '- Ajoute "transport" uniquement les jours avec un déplacement entre deux villes, et mets à jour les trajets si l’ordre des villes change.',
    '- Ne propose aucun hébergement.',
    '- Utilise de vrais lieux avec des coordonnées GPS approximatives réelles.',
    '- Si la demande est impossible ou sans rapport avec le voyage, rends l’itinéraire inchangé.',
    ...BREVITY_RULES,
  ].join('\n')
}
