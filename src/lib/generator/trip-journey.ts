/**
 * Le parcours du générateur : une question par écran, regroupées en
 * chapitres, autour du brief de `trip-brief.ts`.
 *
 * L'essentiel (où, quand, combien de temps) est le seul passage obligé.
 * Le reste s'affine à la carte depuis un écran central, dans l'ordre que le
 * voyageur veut. Ce module ne contient que la logique : quelles questions,
 * dans quel ordre, ce qui compte comme répondu, ce qu'on suggère selon les
 * réponses déjà données. L'affichage vit dans `components/trip-journey`.
 */

import {
  BUDGETS,
  DAY_STARTS,
  DIETS,
  FAMILIARITY_LEVELS,
  INTERESTS,
  MOBILITIES,
  OCCASIONS,
  PACES,
  SPLURGES,
  TRANSPORTS,
  TRAVEL_TIMES,
  TRAVELER_GROUPS,
  TRIP_SHAPES,
  labelOf,
  labelsOf,
  partySize,
  withGroup,
  withMobility,
  withOccasion,
  type BriefOption,
  type TripBrief,
} from '@/lib/generator/trip-brief'

// ── Chapitres ────────────────────────────────────────────────────────────────

export type ChapterId =
  | 'base'
  | 'trip'
  | 'people'
  | 'rhythm'
  | 'desires'
  | 'limits'

export interface Chapter {
  id: ChapterId
  title: string
  /** Couleur du chapitre dans la jauge de précision. */
  color: string
}

export const CHAPTERS: Chapter[] = [
  { id: 'base', title: 'L’essentiel', color: '#0e1a3a' },
  { id: 'trip', title: 'Le voyage', color: '#1d5fe0' },
  { id: 'people', title: 'Les voyageurs', color: '#6b9af0' },
  { id: 'rhythm', title: 'Rythme et budget', color: '#f26a2e' },
  { id: 'desires', title: 'Envies', color: '#0e7490' },
  { id: 'limits', title: 'Contraintes', color: '#15803d' },
]

export const REFINE_CHAPTERS = CHAPTERS.filter(
  (chapter) => chapter.id !== 'base',
)

// ── Questions ────────────────────────────────────────────────────────────────

export type QuestionId =
  | 'destination'
  | 'when'
  | 'origin'
  | 'shape'
  | 'group'
  | 'party'
  | 'familiarity'
  | 'pace'
  | 'dayStart'
  | 'maxTravelTime'
  | 'budget'
  | 'splurges'
  | 'interests'
  | 'mustSee'
  | 'avoid'
  | 'occasion'
  | 'diets'
  | 'mobility'
  | 'transports'
  | 'booked'
  | 'extra'

export type QuestionKind =
  | 'text'
  | 'area'
  | 'when'
  | 'party'
  | 'single'
  | 'multi'

export type Illustration =
  | 'postcard'
  | 'calendar'
  | 'route'
  | 'shape'
  | 'people'
  | 'passport'
  | 'day'
  | 'train'
  | 'coins'
  | 'podium'
  | 'burst'
  | 'feet'

/** Ce que le parcours sait du voyage : le brief, plus la date de départ. */
export interface JourneyAnswers {
  brief: TripBrief
  startDate: string
}

export interface Question {
  id: QuestionId
  chapter: ChapterId
  kind: QuestionKind
  title: string
  /** Libellé court, pour le récapitulatif et le billet en direct. */
  short: string
  sub?: string
  placeholder?: string
  /** Sans réponse, rien ne part vers l'IA. */
  required?: boolean
  /** Compte dans la jauge de précision. */
  tracked?: boolean
  illustration?: Illustration
  options?: BriefOption[]
  /** L'ordre de sélection a un sens : il devient la priorité. */
  ordered?: boolean
  /** Question montrée seulement si elle a un sens au vu des réponses. */
  showIf?: (answers: JourneyAnswers) => boolean
}

/** « Rien de spécial » : une vraie réponse, qui n'ajoute rien au prompt. */
export const NO_OCCASION: BriefOption = {
  id: 'none',
  label: 'Rien de spécial',
  prompt: '',
}

export const QUESTIONS: Question[] = [
  {
    id: 'destination',
    chapter: 'base',
    kind: 'text',
    title: 'Où partez-vous ?',
    short: 'Destination',
    placeholder: 'Un pays, une région, quelques villes…',
    required: true,
    illustration: 'postcard',
  },
  {
    id: 'when',
    chapter: 'base',
    kind: 'when',
    title: 'Quand, et combien de temps ?',
    short: 'Dates',
    required: true,
    illustration: 'calendar',
  },
  {
    id: 'origin',
    chapter: 'trip',
    kind: 'text',
    title: 'D’où partez-vous ?',
    short: 'Ville de départ',
    sub: 'Pour caler l’arrivée : décalage, bagages, première soirée.',
    placeholder: 'Votre ville de départ',
    tracked: true,
    illustration: 'route',
  },
  {
    id: 'shape',
    chapter: 'trip',
    kind: 'single',
    title: 'Vous bougez, ou vous posez vos valises ?',
    short: 'Organisation',
    tracked: true,
    illustration: 'shape',
    options: TRIP_SHAPES,
  },
  {
    id: 'group',
    chapter: 'people',
    kind: 'single',
    title: 'Qui part ?',
    short: 'Voyageurs',
    tracked: true,
    illustration: 'people',
    options: TRAVELER_GROUPS,
  },
  {
    id: 'party',
    chapter: 'people',
    kind: 'party',
    title: 'Combien êtes-vous ?',
    short: 'Composition',
    illustration: 'people',
    showIf: ({ brief }) => ['friends', 'family', 'group'].includes(brief.group),
  },
  {
    id: 'familiarity',
    chapter: 'people',
    kind: 'single',
    title: 'Vous connaissez déjà l’endroit ?',
    short: 'Déjà venu',
    tracked: true,
    illustration: 'passport',
    options: FAMILIARITY_LEVELS,
  },
  {
    id: 'pace',
    chapter: 'rhythm',
    kind: 'single',
    title: 'Quel rythme ?',
    short: 'Rythme',
    tracked: true,
    illustration: 'day',
    options: PACES,
  },
  {
    id: 'dayStart',
    chapter: 'rhythm',
    kind: 'single',
    title: 'Vous démarrez à quelle heure ?',
    short: 'Réveil',
    tracked: true,
    illustration: 'day',
    options: DAY_STARTS,
  },
  {
    id: 'maxTravelTime',
    chapter: 'rhythm',
    kind: 'single',
    title: 'Combien de trajet par jour, au maximum ?',
    short: 'Trajet max',
    tracked: true,
    illustration: 'train',
    options: TRAVEL_TIMES,
  },
  {
    id: 'budget',
    chapter: 'rhythm',
    kind: 'single',
    title: 'Quel budget sur place ?',
    short: 'Budget',
    tracked: true,
    illustration: 'coins',
    options: BUDGETS,
  },
  {
    id: 'splurges',
    chapter: 'rhythm',
    kind: 'multi',
    title: 'Sur quoi acceptez-vous de mettre le prix ?',
    short: 'Ça vaut le prix',
    tracked: true,
    options: SPLURGES,
    showIf: ({ brief }) => brief.budget !== 'premium',
  },
  {
    id: 'interests',
    chapter: 'desires',
    kind: 'multi',
    title: 'Qu’est-ce qui vous fait voyager ?',
    short: 'Envies',
    sub: 'L’ordre compte : les trois premiers montent sur le podium.',
    tracked: true,
    ordered: true,
    illustration: 'podium',
    options: INTERESTS,
  },
  {
    id: 'mustSee',
    chapter: 'desires',
    kind: 'area',
    title: 'Ce que vous voulez absolument faire',
    short: 'Incontournables',
    placeholder: 'Vos incontournables, séparés par des virgules',
    tracked: true,
  },
  {
    id: 'avoid',
    chapter: 'desires',
    kind: 'area',
    title: 'Ce dont vous ne voulez pas',
    short: 'À éviter',
    placeholder: 'Ex. : les files d’attente, les réveils à 6 h',
    tracked: true,
  },
  {
    id: 'occasion',
    chapter: 'desires',
    kind: 'single',
    title: 'Une occasion particulière ?',
    short: 'Occasion',
    tracked: true,
    illustration: 'burst',
    options: [NO_OCCASION, ...OCCASIONS],
  },
  {
    id: 'diets',
    chapter: 'limits',
    kind: 'multi',
    title: 'Des contraintes alimentaires ?',
    short: 'Alimentation',
    sub: 'Les restaurants proposés en tiendront compte.',
    tracked: true,
    options: DIETS,
  },
  {
    id: 'mobility',
    chapter: 'limits',
    kind: 'single',
    title: 'Vous marchez beaucoup ?',
    short: 'Marche',
    tracked: true,
    illustration: 'feet',
    options: MOBILITIES,
  },
  {
    id: 'transports',
    chapter: 'limits',
    kind: 'multi',
    title: 'Comment vous déplacez-vous sur place ?',
    short: 'Transports',
    sub: 'Sans réponse, l’IA suppose souvent une voiture de location.',
    tracked: true,
    options: TRANSPORTS,
  },
  {
    id: 'booked',
    chapter: 'limits',
    kind: 'area',
    title: 'Déjà réservé ?',
    short: 'Déjà réservé',
    sub: 'L’itinéraire sera construit autour.',
    placeholder: 'Vols, hôtels, activités payées…',
    tracked: true,
  },
  {
    id: 'extra',
    chapter: 'limits',
    kind: 'area',
    title: 'Autre chose à savoir ?',
    short: 'À savoir',
    placeholder: 'Tout ce qu’un agent de voyage devrait savoir',
  },
]

export function questionById(id: QuestionId): Question {
  const question = QUESTIONS.find((item) => item.id === id)
  if (!question) throw new Error(`Question inconnue : ${id}`)
  return question
}

/** Questions qui ont un sens au vu des réponses déjà données. */
export function visibleQuestions(answers: JourneyAnswers): Question[] {
  return QUESTIONS.filter(
    (question) => !question.showIf || question.showIf(answers),
  )
}

export function chapterQuestions(
  answers: JourneyAnswers,
  chapter: ChapterId,
): Question[] {
  return visibleQuestions(answers).filter(
    (question) => question.chapter === chapter,
  )
}

// ── Valeurs ──────────────────────────────────────────────────────────────────

type TextField =
  | 'destination'
  | 'origin'
  | 'mustSee'
  | 'avoid'
  | 'booked'
  | 'extra'
type SingleField =
  | 'shape'
  | 'group'
  | 'familiarity'
  | 'pace'
  | 'dayStart'
  | 'maxTravelTime'
  | 'budget'
  | 'occasion'
type MultiField = 'splurges' | 'interests' | 'diets' | 'transports'

/** Valeur d'une question à choix unique (la marche est une liste d'un élément). */
export function singleValue(brief: TripBrief, id: QuestionId): string {
  if (id === 'mobility') return brief.mobility[0] ?? ''
  return brief[id as SingleField] ?? ''
}

export function multiValue(brief: TripBrief, id: QuestionId): string[] {
  return brief[id as MultiField] ?? []
}

export function textValue(brief: TripBrief, id: QuestionId): string {
  return brief[id as TextField] ?? ''
}

export function setText(
  brief: TripBrief,
  id: QuestionId,
  value: string,
): TripBrief {
  return { ...brief, [id as TextField]: value }
}

/**
 * Choisir une option : les déductions de `trip-brief.ts` s'appliquent
 * (« en couple » veut dire deux adultes, une poussette un enfant…).
 */
export function setSingle(
  brief: TripBrief,
  id: QuestionId,
  value: string,
): TripBrief {
  if (id === 'group') return withGroup(brief, value)
  if (id === 'occasion') return withOccasion(brief, value)
  if (id === 'mobility') return withMobility(brief, value ? [value] : [])
  if (id === 'budget' && value === 'premium') {
    // « Sans compter » : la question des postes où dépenser plus disparaît.
    return { ...brief, budget: value, splurges: [] }
  }
  return { ...brief, [id as SingleField]: value }
}

export function setMulti(
  brief: TripBrief,
  id: QuestionId,
  value: string[],
): TripBrief {
  return { ...brief, [id as MultiField]: value }
}

/** Date au format AAAA-MM-JJ, lisible. */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  return !Number.isNaN(new Date(`${value}T00:00:00`).getTime())
}

export function isAnswered(
  question: Question,
  answers: JourneyAnswers,
): boolean {
  const { brief } = answers
  switch (question.kind) {
    case 'when':
      return isIsoDate(answers.startDate) && brief.durationDays > 0
    case 'party':
      return Boolean(brief.group) && partySize(brief) > 0
    case 'single':
      return singleValue(brief, question.id) !== ''
    case 'multi':
      return multiValue(brief, question.id).length > 0
    default:
      return question.id === 'destination'
        ? brief.destination.trim().length >= 2
        : textValue(brief, question.id).trim().length > 0
  }
}

/** Questions obligatoires encore vides : rien ne part sans elles. */
export function missingRequired(answers: JourneyAnswers): Question[] {
  return visibleQuestions(answers).filter(
    (question) => question.required && !isAnswered(question, answers),
  )
}

function formatDate(iso: string, options: Intl.DateTimeFormatOptions): string {
  if (!isIsoDate(iso)) return ''
  return new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', options)
}

/** La réponse en une ligne, pour le récapitulatif et le billet en direct. */
export function answerLabel(
  question: Question,
  answers: JourneyAnswers,
): string {
  const { brief } = answers
  if (!isAnswered(question, answers)) return ''
  switch (question.kind) {
    case 'when':
      return `${formatDate(answers.startDate, { day: 'numeric', month: 'long' })} · ${brief.durationDays} jour${brief.durationDays > 1 ? 's' : ''}`
    case 'party': {
      const parts = [`${brief.adults} adulte${brief.adults > 1 ? 's' : ''}`]
      if (brief.children > 0) {
        parts.push(`${brief.children} enfant${brief.children > 1 ? 's' : ''}`)
      }
      return parts.join(', ')
    }
    case 'single':
      return labelOf(question.options ?? [], singleValue(brief, question.id))
    case 'multi':
      return labelsOf(question.options ?? [], multiValue(brief, question.id))
    default:
      return textValue(brief, question.id).trim()
  }
}

// ── Précision ────────────────────────────────────────────────────────────────

/** Part de la jauge acquise dès que l'essentiel est là. */
export const BASE_PRECISION = 30

function trackedQuestions(answers: JourneyAnswers): Question[] {
  return visibleQuestions(answers).filter((question) => question.tracked)
}

export interface Precision {
  /** De 30 à 100. */
  value: number
  label: string
  answered: number
  total: number
  /** Ce que vaut une réponse d'affinage, en points. */
  unit: number
}

export function precisionOf(answers: JourneyAnswers): Precision {
  const tracked = trackedQuestions(answers)
  const answered = tracked.filter((question) =>
    isAnswered(question, answers),
  ).length
  const unit = tracked.length ? (100 - BASE_PRECISION) / tracked.length : 0
  const value = Math.round(BASE_PRECISION + answered * unit)
  const label =
    value < 50
      ? 'L’essentiel'
      : value < 75
        ? 'Précis'
        : value < 95
          ? 'Très précis'
          : 'Sur mesure'
  return { value, label, answered, total: tracked.length, unit }
}

export interface ChapterProgress {
  chapter: Chapter
  questions: Question[]
  answered: Question[]
  missing: Question[]
  /** Questions comptées dans la jauge. */
  tracked: number
  trackedAnswered: number
}

export function chapterProgress(
  answers: JourneyAnswers,
  chapter: Chapter,
): ChapterProgress {
  const questions = chapterQuestions(answers, chapter.id)
  const answered = questions.filter((question) => isAnswered(question, answers))
  const missing = questions.filter((question) => !isAnswered(question, answers))
  const tracked = questions.filter((question) => question.tracked)
  return {
    chapter,
    questions,
    answered,
    missing,
    tracked: tracked.length,
    trackedAnswered: tracked.filter((question) => isAnswered(question, answers))
      .length,
  }
}

// ── Conseils qui dépendent des réponses ──────────────────────────────────────

/** Une phrase d'aide, quand une réponse précédente change la donne. */
export function smartNote(question: Question, answers: JourneyAnswers): string {
  const { brief } = answers
  switch (question.id) {
    case 'shape':
      if (brief.durationDays <= 3) {
        return `Pour ${brief.durationDays} jours, une seule base évite de perdre du temps en valises.`
      }
      if (brief.durationDays >= 10) {
        return `Sur ${brief.durationDays} jours, deux ou trois bases font un bon équilibre.`
      }
      return ''
    case 'mobility':
      return brief.children > 0
        ? `Avec ${brief.children} enfant${brief.children > 1 ? 's' : ''}, la poussette change les trajets proposés.`
        : ''
    case 'maxTravelTime':
      return brief.shape === 'base'
        ? 'Avec une seule base, c’est le temps des excursions à la journée.'
        : ''
    case 'mustSee':
      return brief.familiarity === 'first'
        ? 'Première fois : les grands classiques sont déjà prévus, gardez ici vos envies à vous.'
        : ''
    case 'dayStart':
      return brief.pace === 'intense'
        ? 'Rythme intense : démarrer tôt laisse de la place à tout.'
        : ''
    case 'transports':
      return brief.shape === 'roaming'
        ? 'Itinérant : le train relie souvent les étapes plus vite que la voiture.'
        : ''
    default:
      return ''
  }
}

/** L'option qu'on conseille, au vu des réponses précédentes. */
export function suggestedOption(
  question: Question,
  answers: JourneyAnswers,
): string {
  const { brief } = answers
  switch (question.id) {
    case 'shape':
      if (brief.durationDays <= 3) return 'base'
      if (brief.durationDays >= 10) return 'twoBases'
      return ''
    case 'mobility':
      return brief.children > 0 ? 'stroller' : ''
    case 'dayStart':
      return brief.pace === 'intense' ? 'early' : ''
    case 'maxTravelTime':
      return brief.shape === 'roaming' ? 'medium' : ''
    default:
      return ''
  }
}

// ── Packs : plusieurs réponses en un geste ───────────────────────────────────

export interface Pack {
  label: string
  ids: string[]
  /** Conseillé au vu des réponses précédentes. */
  recommended: boolean
}

export function packsFor(question: Question, answers: JourneyAnswers): Pack[] {
  const { brief } = answers
  const kids = brief.children > 0
  const packs: Pack[] = (() => {
    switch (question.id) {
      case 'transports':
        return [
          {
            label: 'En ville',
            ids: ['walk', 'publicTransport', 'taxi'],
            recommended:
              brief.shape === 'base' || brief.maxTravelTime === 'short',
          },
          {
            label: 'Au fil du rail',
            ids: ['walk', 'train', 'publicTransport'],
            recommended:
              brief.shape === 'roaming' && brief.maxTravelTime !== 'long',
          },
          {
            label: 'Road trip',
            ids: ['car', 'walk'],
            recommended:
              brief.maxTravelTime === 'long' ||
              (kids && brief.shape === 'roaming'),
          },
          {
            label: 'Mobilité douce',
            ids: ['walk', 'bike', 'publicTransport'],
            recommended: brief.mobility.includes('great') && !kids,
          },
          {
            label: 'Sans effort',
            ids: ['taxi', 'car'],
            recommended: brief.mobility.some((id) =>
              ['limited', 'wheelchair', 'stroller'].includes(id),
            ),
          },
        ]
      case 'interests':
        return [
          {
            label: 'Culture',
            ids: ['history', 'museums', 'architecture'],
            recommended: brief.familiarity === 'first',
          },
          {
            label: 'Gourmand',
            ids: ['food', 'local', 'wine'],
            recommended: brief.splurges.includes('food'),
          },
          {
            label: 'Grand air',
            ids: ['nature', 'beach', 'adventure'],
            recommended: brief.mobility.includes('great'),
          },
          {
            label: 'En amoureux',
            ids: ['food', 'photo', 'wellness'],
            recommended:
              brief.group === 'couple' ||
              ['honeymoon', 'anniversary'].includes(brief.occasion),
          },
          {
            label: 'Avec les enfants',
            ids: ['kids', 'beach', 'nature'],
            recommended: kids,
          },
          {
            label: 'Entre potes',
            ids: ['nightlife', 'food', 'offbeat'],
            recommended: brief.group === 'friends' || brief.group === 'group',
          },
          {
            label: 'Hors des sentiers',
            ids: ['local', 'offbeat', 'photo'],
            recommended: brief.familiarity === 'regular',
          },
        ]
      case 'splurges':
        return [
          {
            label: 'Les papilles',
            ids: ['food', 'experiences'],
            recommended: brief.interests.includes('food'),
          },
          {
            label: 'Le cocon',
            ids: ['comfort', 'wellness'],
            recommended: kids || brief.pace === 'slow',
          },
          {
            label: 'Les souvenirs',
            ids: ['experiences', 'culture'],
            recommended: brief.familiarity === 'first',
          },
        ]
      case 'diets':
        return [
          { label: 'Halal', ids: ['halal', 'noAlcohol'], recommended: false },
          {
            label: 'Végétal',
            ids: ['vegan', 'lactoseFree'],
            recommended: false,
          },
          {
            label: 'Végé souple',
            ids: ['vegetarian', 'noSeafood'],
            recommended: false,
          },
        ]
      default:
        return []
    }
  })()
  // Les packs conseillés passent devant, sans changer l'ordre des autres.
  return [
    ...packs.filter((pack) => pack.recommended),
    ...packs.filter((pack) => !pack.recommended),
  ]
}

/** Un pack coché retire ses réponses ; sinon il ajoute celles qui manquent. */
export function togglePack(current: string[], pack: Pack): string[] {
  const on = pack.ids.every((id) => current.includes(id))
  return on
    ? current.filter((id) => !pack.ids.includes(id))
    : [...current, ...pack.ids.filter((id) => !current.includes(id))]
}

// ── Idées en un geste ────────────────────────────────────────────────────────

export interface Ideas {
  label: string
  items: string[]
  /** `replace` remplit le champ, `toggle` ajoute à la liste, `template` ajoute une ligne. */
  mode: 'replace' | 'toggle' | 'template'
}

const DESTINATION_IDEAS = [
  'Portugal',
  'Japon',
  'Italie',
  'Islande',
  'Maroc',
  'Mexique',
]
const ORIGIN_IDEAS = [
  'Paris',
  'Lyon',
  'Marseille',
  'Bruxelles',
  'Genève',
  'Montréal',
]

const MUST_SEE: { match: RegExp; items: string[] }[] = [
  {
    match: /portugal|lisbonne|porto|algarve|madère/i,
    items: [
      'Un fado à l’Alfama',
      'Les azulejos de Porto',
      'Sintra',
      'Une cave à porto',
    ],
  },
  {
    match: /japon|tokyo|kyoto|osaka/i,
    items: [
      'Une nuit en ryokan',
      'Le marché Nishiki',
      'Un onsen',
      'Le Fushimi Inari',
    ],
  },
  {
    match: /italie|rome|florence|venise|naples|toscane|sicile/i,
    items: [
      'Un cours de pâtes',
      'Le Colisée',
      'Une dégustation en Toscane',
      'Les Offices',
    ],
  },
  {
    match: /islande|reykjavik/i,
    items: [
      'Les aurores boréales',
      'Un bain géothermal',
      'Le cercle d’or',
      'Les glaciers',
    ],
  },
  {
    match: /maroc|marrakech|fès|essaouira/i,
    items: [
      'Une nuit dans le désert',
      'Un hammam',
      'La médina de Fès',
      'Un cours de cuisine',
    ],
  },
]

const MUST_SEE_ANY = [
  'Un coucher de soleil',
  'Un marché local',
  'Un cours de cuisine',
  'Une rando',
]

export function ideasFor(
  question: Question,
  answers: JourneyAnswers,
): Ideas | null {
  switch (question.id) {
    case 'destination':
      return { label: 'Idées', items: DESTINATION_IDEAS, mode: 'replace' }
    case 'origin':
      return {
        label: 'Villes fréquentes',
        items: ORIGIN_IDEAS,
        mode: 'replace',
      }
    case 'mustSee': {
      const region = MUST_SEE.find((item) =>
        item.match.test(answers.brief.destination),
      )
      const destination = answers.brief.destination.trim()
      return {
        label: destination ? `Idées pour ${destination}` : 'Idées',
        items: region?.items ?? MUST_SEE_ANY,
        mode: 'toggle',
      }
    }
    case 'avoid':
      return {
        label: 'Souvent cités',
        items: [
          'Les files d’attente',
          'Les lieux trop touristiques',
          'Les réveils à 6 h',
          'Les longues marches',
        ],
        mode: 'toggle',
      }
    case 'booked':
      return {
        label: 'Modèles à compléter',
        items: [
          'Vol aller : arrivée à __ h le jour 1',
          'Vol retour : départ à __ h le dernier jour',
          'Hôtel à __ les __ premières nuits',
          'Activité réservée : __ le jour __',
        ],
        mode: 'template',
      }
    case 'extra':
      return {
        label: 'Souvent cités',
        items: [
          'Allergie alimentaire',
          'Pass de transport déjà acheté',
          'Peur de l’avion',
          'Voyage avec un chien',
        ],
        mode: 'toggle',
      }
    default:
      return null
  }
}

/** Ajoute ou retire une idée d'une liste séparée par des virgules. */
export function toggleIdea(value: string, idea: string): string {
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  const next = parts.includes(idea)
    ? parts.filter((part) => part !== idea)
    : [...parts, idea]
  return next.join(', ')
}

export function hasIdea(value: string, idea: string): boolean {
  return value
    .split(',')
    .map((part) => part.trim())
    .includes(idea)
}

// ── Dates ────────────────────────────────────────────────────────────────────

function iso(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Raccourcis de date, calculés à partir d'aujourd'hui. */
export function dateShortcuts(
  today = new Date(),
): { label: string; date: string }[] {
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const saturday = new Date(base)
  saturday.setDate(base.getDate() + ((6 - base.getDay() + 7) % 7 || 7))
  const month = new Date(base)
  month.setMonth(base.getMonth() + 1)
  const summerYear =
    base.getMonth() >= 6 ? base.getFullYear() + 1 : base.getFullYear()
  const summer = new Date(summerYear, 6, 5)
  return [
    { label: 'Samedi prochain', date: iso(saturday) },
    { label: 'Dans un mois', date: iso(month) },
    { label: 'Cet été', date: iso(summer) },
  ]
}

export const DURATION_SHORTCUTS = [
  { label: 'Week-end', days: 3 },
  { label: 'Une semaine', days: 7 },
  { label: 'Dix jours', days: 10 },
  { label: 'Deux semaines', days: 14 },
]

// ── Mode express : une phrase devient des réponses ───────────────────────────

export interface Detected {
  kind: 'Durée' | 'Destination' | 'Voyageurs' | 'Rythme' | 'Budget' | 'Envie'
  value: string
}

const KNOWN_PLACES = [
  'Portugal',
  'Lisbonne',
  'Porto',
  'Japon',
  'Tokyo',
  'Kyoto',
  'Italie',
  'Rome',
  'Florence',
  'Venise',
  'Naples',
  'Sicile',
  'Islande',
  'Maroc',
  'Marrakech',
  'Espagne',
  'Barcelone',
  'Madrid',
  'Séville',
  'Grèce',
  'Athènes',
  'Crète',
  'Mexique',
  'Thaïlande',
  'Bangkok',
  'Vietnam',
  'Écosse',
  'Irlande',
  'Londres',
  'New York',
  'Canada',
  'Québec',
  'Norvège',
  'Croatie',
  'Corse',
  'Bretagne',
  'Provence',
  'Pérou',
  'Bali',
  'Indonésie',
  'Inde',
  'Égypte',
  'Turquie',
  'Istanbul',
]

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Ce qu'une phrase libre révèle du voyage. Rien de magique : des mots-clés,
 * montrés au voyageur avant d'être appliqués, et tout reste modifiable.
 */
export function parseExpress(sentence: string): {
  detected: Detected[]
  brief: Partial<TripBrief>
} {
  const text = normalize(sentence)
  const detected: Detected[] = []
  const patch: Partial<TripBrief> = {}

  const days = text.match(/(\d{1,2})\s*(jours?|j\b|nuits?|semaines?)/)
  if (days) {
    const n = /semaine/.test(days[2])
      ? Number(days[1]) * 7
      : Number(days[1]) + (/nuit/.test(days[2]) ? 1 : 0)
    if (n >= 1 && n <= 30) {
      patch.durationDays = n
      detected.push({ kind: 'Durée', value: `${n} jours` })
    }
  } else if (/week-?end/.test(text)) {
    patch.durationDays = 3
    detected.push({ kind: 'Durée', value: '3 jours' })
  } else if (/une semaine/.test(text)) {
    patch.durationDays = 7
    detected.push({ kind: 'Durée', value: '7 jours' })
  }

  const places = KNOWN_PLACES.filter((place) => text.includes(normalize(place)))
  if (places.length) {
    patch.destination = places.join(', ')
    detected.push({ kind: 'Destination', value: patch.destination })
  } else {
    const loose = sentence.match(
      /\b(?:à|au|aux|en)\s+([A-ZÉÈÎ][\p{L}'-]+(?:\s+[A-ZÉÈÎ][\p{L}'-]+)?)/u,
    )
    if (loose) {
      patch.destination = loose[1]
      detected.push({ kind: 'Destination', value: loose[1] })
    }
  }

  const groups: [RegExp, string][] = [
    [
      /en famille|avec (les|nos|mes) enfants|avec (un|une|deux|trois) enfants?/,
      'family',
    ],
    [/en couple|a deux|amoureux|lune de miel/, 'couple'],
    [/entre (amis|potes|copains)|avec des (amis|potes)/, 'friends'],
    [/en solo|seul\b|seule\b/, 'solo'],
    [/en groupe|entre collegues/, 'group'],
  ]
  const group = groups.find(([pattern]) => pattern.test(text))
  if (group) {
    patch.group = group[1]
    detected.push({
      kind: 'Voyageurs',
      value: labelOf(TRAVELER_GROUPS, group[1]),
    })
  }

  const paces: [RegExp, string][] = [
    [/tranquille|cool|sans se presser|detente|reposant/, 'slow'],
    [/intense|a fond|charge|tout voir/, 'intense'],
    [/equilibre/, 'balanced'],
  ]
  const pace = paces.find(([pattern]) => pattern.test(text))
  if (pace) {
    patch.pace = pace[1]
    detected.push({ kind: 'Rythme', value: labelOf(PACES, pace[1]) })
  }

  const budgets: [RegExp, string][] = [
    [/petit budget|pas cher|sans se ruiner|economique|routard/, 'backpacker'],
    [/budget moyen|modere/, 'moderate'],
    [/confort/, 'comfort'],
    [/luxe|sans compter|haut de gamme/, 'premium'],
  ]
  const budget = budgets.find(([pattern]) => pattern.test(text))
  if (budget) {
    patch.budget = budget[1]
    detected.push({ kind: 'Budget', value: labelOf(BUDGETS, budget[1]) })
  }

  const interestWords: [RegExp, string][] = [
    [/table|manger|gastro|cuisine|restau/, 'food'],
    [/musee|art\b|expo/, 'museums'],
    [/histoire|patrimoine|chateau/, 'history'],
    [/plage|baignade|mer\b/, 'beach'],
    [/rando|nature|montagne/, 'nature'],
    [/fete|nuit|bars?\b|soiree/, 'nightlife'],
    [/archi/, 'architecture'],
    [/marche|local/, 'local'],
    [/photo/, 'photo'],
    [/vin\b|vins\b|degustation/, 'wine'],
  ]
  const interests = interestWords
    .filter(([pattern]) => pattern.test(text))
    .map(([, id]) => id)
    .filter((id, index, all) => all.indexOf(id) === index)
  if (interests.length) {
    patch.interests = interests
    interests.forEach((id) =>
      detected.push({ kind: 'Envie', value: labelOf(INTERESTS, id) }),
    )
  }

  return { detected, brief: patch }
}

/** Applique ce que la phrase a révélé, sans rien perdre de la phrase elle-même. */
export function applyExpress(brief: TripBrief, sentence: string): TripBrief {
  const { brief: patch } = parseExpress(sentence)
  let next: TripBrief = { ...brief, ...patch }
  if (patch.group) next = withGroup({ ...next, group: '' }, patch.group)
  const trimmed = sentence.trim()
  if (trimmed) {
    const note = `En une phrase : ${trimmed}`
    next.extra = (brief.extra ? `${brief.extra}\n${note}` : note).slice(0, 300)
  }
  return next
}

// ── Budget du séjour ─────────────────────────────────────────────────────────

/** « 1 250 € », arrondi à 50 € : un ordre de grandeur, pas un devis. */
export function formatEuros(amount: number): string {
  const rounded = Math.round(amount / 50) * 50
  return `${rounded.toLocaleString('fr-FR').replace(/ /g, ' ')} €`
}

export function tripTotalFor(brief: TripBrief, budgetId: string): string {
  const budget = BUDGETS.find((option) => option.id === budgetId)
  if (!budget) return ''
  const total =
    budget.perDay * Math.max(1, partySize(brief)) * brief.durationDays
  return `${budgetId === 'premium' ? '+ de ' : '≈ '}${formatEuros(total)}`
}
