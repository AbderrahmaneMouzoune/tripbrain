/**
 * Le brief détaillé du voyage : les questions qu'un bon agent de voyage
 * poserait avant de proposer quoi que ce soit.
 *
 * Le formulaire express (une phrase libre) suffit pour un premier jet, mais
 * l'IA comble alors les vides toute seule : rythme de touriste pressé, budget
 * moyen, restaurants qui ignorent les allergies. Chaque réponse ci-dessous
 * remplace une supposition du modèle par une contrainte explicite.
 *
 * Toutes les questions sont facultatives sauf la destination : ce qui n'est
 * pas répondu n'apparaît simplement pas dans le brief envoyé à l'IA.
 */

import {
  IconArmchair,
  IconBabyCarriage,
  IconBackpack,
  IconBeach,
  IconBike,
  IconBriefcase,
  IconBuildingArch,
  IconBuildingCastle,
  IconBuildingCommunity,
  IconBuildingStore,
  IconBus,
  IconBusStop,
  IconCake,
  IconCamera,
  IconCandle,
  IconCar,
  IconChefHat,
  IconClock,
  IconClockHour9,
  IconCompass,
  IconConfetti,
  IconCreditCard,
  IconDiamond,
  IconFishOff,
  IconFriends,
  IconGlassFull,
  IconGlassOff,
  IconHeart,
  IconHeartHandshake,
  IconHearts,
  IconHelpCircle,
  IconHome,
  IconLeaf,
  IconMapPin,
  IconMapPinCheck,
  IconMapPinHeart,
  IconMapRoute,
  IconMassage,
  IconMilkOff,
  IconMoodKid,
  IconMoon,
  IconMoonStars,
  IconMountain,
  IconPalette,
  IconPlane,
  IconPlant2,
  IconRoute,
  IconRun,
  IconShoppingBag,
  IconSparkles,
  IconSun,
  IconSunrise,
  IconSteeringWheel,
  IconTicket,
  IconToolsKitchen2,
  IconTrain,
  IconTrekking,
  IconUser,
  IconUsersGroup,
  IconWalk,
  IconWallet,
  IconWheatOff,
  IconWheelchair,
  type Icon,
} from '@tabler/icons-react'

export interface BriefOption {
  id: string
  label: string
  /** Précision affichée sous le libellé, dans le formulaire. */
  hint?: string
  /** Pictogramme affiché devant le libellé : l'œil trouve l'option avant de lire. */
  icon?: Icon
  /** Phrase injectée dans le brief envoyé à l'IA quand l'option est choisie. */
  prompt: string
}

// ── Le voyage ────────────────────────────────────────────────────────────────

export const TRIP_SHAPES: BriefOption[] = [
  {
    id: 'roaming',
    icon: IconRoute,
    label: 'Itinérant',
    hint: 'Plusieurs villes étapes',
    prompt:
      'Voyage itinérant : plusieurs villes étapes, avec les trajets entre elles.',
  },
  {
    id: 'twoBases',
    icon: IconBuildingCommunity,
    label: 'Deux ou trois bases',
    hint: 'Peu de valises à refaire',
    prompt:
      'Deux ou trois bases seulement sur tout le séjour : limite les changements de ville et regroupe les journées par base.',
  },
  {
    id: 'base',
    icon: IconHome,
    label: 'Une seule base',
    hint: 'Excursions à la journée',
    prompt:
      'Une seule base pour tout le séjour : uniquement des excursions à la journée, avec retour au même endroit chaque soir.',
  },
  {
    id: 'undecided',
    icon: IconHelpCircle,
    label: 'À toi de voir',
    prompt:
      'Le voyageur n’a pas d’avis sur le découpage : propose le plus logique et explique ton choix dans le résumé.',
  },
]

// ── Les voyageurs ────────────────────────────────────────────────────────────

export interface TravelerGroupOption extends BriefOption {
  /**
   * Composition proposée quand on choisit ce groupe. Elle remplace les
   * compteurs, qui restent modifiables : c'est un point de départ plausible,
   * pas une règle.
   */
  party: { adults: number; children: number }
}

export const TRAVELER_GROUPS: TravelerGroupOption[] = [
  {
    id: 'solo',
    icon: IconUser,
    label: 'Solo',
    hint: 'Rien qu’à toi',
    party: { adults: 1, children: 0 },
    prompt: 'Voyage en solo.',
  },
  {
    id: 'couple',
    icon: IconHeartHandshake,
    label: 'En couple',
    hint: 'À deux',
    party: { adults: 2, children: 0 },
    prompt: 'Voyage en couple.',
  },
  {
    id: 'friends',
    icon: IconFriends,
    label: 'Entre amis',
    hint: 'Une petite bande, jusqu’à 4',
    party: { adults: 4, children: 0 },
    prompt: 'Voyage entre amis : prévois des moments conviviaux le soir.',
  },
  {
    id: 'family',
    icon: IconMoodKid,
    label: 'En famille',
    hint: 'Avec des enfants',
    party: { adults: 2, children: 2 },
    prompt: 'Voyage en famille avec des enfants.',
  },
  {
    id: 'group',
    icon: IconUsersGroup,
    label: 'Groupe (5 et +)',
    hint: 'Tribu, cousins ou collègues',
    party: { adults: 5, children: 0 },
    prompt:
      'Groupe de cinq personnes ou plus : évite les lieux minuscules et les activités qui n’acceptent pas les groupes.',
  },
]

/** Nombre de voyageurs à partir duquel on parle de groupe. */
export const GROUP_SIZE = 5

export const FAMILIARITY_LEVELS: BriefOption[] = [
  {
    id: 'first',
    icon: IconMapPin,
    label: 'Première fois',
    prompt:
      'Première visite de la destination : les incontournables ont toute leur place.',
  },
  {
    id: 'again',
    icon: IconMapPinCheck,
    label: 'Déjà venu une fois',
    prompt:
      'Le voyageur connaît déjà les grands classiques : privilégie ce qu’on voit moins et évite le circuit touristique standard.',
  },
  {
    id: 'regular',
    icon: IconMapPinHeart,
    label: 'J’y retourne souvent',
    prompt:
      'Le voyageur y va régulièrement : ne propose que des lieux pointus, précis et hors des sentiers battus.',
  },
]

// ── Rythme ───────────────────────────────────────────────────────────────────

export interface PaceOption extends BriefOption {
  /** Nombre d'activités par jour demandé à l'IA, ex. « 2 à 3 ». */
  activities: string
}

export const PACES: PaceOption[] = [
  {
    id: 'slow',
    icon: IconArmchair,
    label: 'Tranquille',
    hint: '2 à 3 activités par jour',
    activities: '2 à 3',
    prompt:
      'Rythme tranquille : le voyageur préfère prendre son temps, quitte à voir moins de choses. Laisse des plages libres.',
  },
  {
    id: 'balanced',
    icon: IconWalk,
    label: 'Équilibré',
    hint: '3 à 5 activités par jour',
    activities: '3 à 5',
    prompt:
      'Rythme équilibré : des journées bien remplies mais qui laissent respirer.',
  },
  {
    id: 'intense',
    icon: IconRun,
    label: 'Intense',
    hint: '5 à 7 activités par jour',
    activities: '5 à 7',
    prompt:
      'Rythme intense : le voyageur veut voir un maximum de choses et accepte des journées chargées.',
  },
]

/** Nombre d'activités demandé quand la question sur le rythme est passée. */
export const DEFAULT_ACTIVITIES_PER_DAY = '3 à 6'

export const DAY_STARTS: BriefOption[] = [
  {
    id: 'early',
    icon: IconSunrise,
    label: 'Lève-tôt',
    hint: 'Dès 7 h',
    prompt:
      'Journées qui démarrent tôt, vers 7 h : profite de la lumière du matin et des sites encore vides.',
  },
  {
    id: 'standard',
    icon: IconSun,
    label: 'Normal',
    hint: 'Vers 9 h',
    prompt: 'Journées qui démarrent vers 9 h.',
  },
  {
    id: 'late',
    icon: IconMoonStars,
    label: 'Grasse matinée',
    hint: 'Pas avant 11 h',
    prompt:
      'Le voyageur ne commence pas avant 11 h : ne place aucune activité tôt le matin et étale les journées sur la soirée.',
  },
]

export const TRAVEL_TIMES: BriefOption[] = [
  {
    id: 'short',
    icon: IconClock,
    label: '1 h maximum',
    prompt:
      'Une heure de trajet par jour au maximum : regroupe les activités dans le même secteur.',
  },
  {
    id: 'medium',
    icon: IconClockHour9,
    label: '2 à 3 h',
    prompt: 'Deux à trois heures de trajet par jour au maximum.',
  },
  {
    id: 'long',
    icon: IconMapRoute,
    label: 'Peu importe',
    prompt:
      'Les longs trajets ne dérangent pas le voyageur s’ils en valent la peine.',
  },
]

// ── Budget ───────────────────────────────────────────────────────────────────

export interface BudgetOption extends BriefOption {
  /** Enveloppe quotidienne par personne, en euros, pour les estimations. */
  perDay: number
}

export const BUDGETS: BudgetOption[] = [
  {
    id: 'backpacker',
    icon: IconBackpack,
    label: 'Petit budget',
    hint: '~40 € par jour et par personne',
    perDay: 40,
    prompt:
      'Budget serré, environ 40 € par personne et par jour (activités et repas, hors hébergement et transport longue distance) : privilégie le gratuit, les marchés et la cuisine de rue.',
  },
  {
    id: 'moderate',
    icon: IconWallet,
    label: 'Modéré',
    hint: '~80 € par jour et par personne',
    perDay: 80,
    prompt:
      'Budget modéré, environ 80 € par personne et par jour hors hébergement : quelques visites payantes et de bonnes adresses sans excès.',
  },
  {
    id: 'comfort',
    icon: IconCreditCard,
    label: 'Confort',
    hint: '~150 € par jour et par personne',
    perDay: 150,
    prompt:
      'Budget confortable, environ 150 € par personne et par jour hors hébergement : visites payantes, bonnes tables et expériences guidées bienvenues.',
  },
  {
    id: 'premium',
    icon: IconDiamond,
    label: 'Sans compter',
    hint: '300 € et plus',
    perDay: 300,
    prompt:
      'Budget large, 300 € et plus par personne et par jour : les tables et les expériences d’exception sont les bienvenues.',
  },
]

export const SPLURGES: BriefOption[] = [
  {
    id: 'food',
    icon: IconChefHat,
    label: 'La table',
    prompt: 'la gastronomie',
  },
  {
    id: 'experiences',
    icon: IconSparkles,
    label: 'Les expériences',
    prompt: 'les expériences',
  },
  {
    id: 'culture',
    icon: IconTicket,
    label: 'Les visites guidées',
    prompt: 'les visites guidées',
  },
  {
    id: 'comfort',
    icon: IconTrain,
    label: 'Le confort des trajets',
    prompt: 'le confort des trajets',
  },
  {
    id: 'wellness',
    icon: IconMassage,
    label: 'Le bien-être',
    prompt: 'le bien-être',
  },
]

// ── Envies ───────────────────────────────────────────────────────────────────

export const INTERESTS: BriefOption[] = [
  {
    id: 'history',
    icon: IconBuildingCastle,
    label: 'Histoire et patrimoine',
    prompt: 'histoire et patrimoine',
  },
  {
    id: 'museums',
    icon: IconPalette,
    label: 'Musées et art',
    prompt: 'musées et art',
  },
  {
    id: 'food',
    icon: IconToolsKitchen2,
    label: 'Gastronomie',
    prompt: 'gastronomie',
  },
  {
    id: 'nature',
    icon: IconMountain,
    label: 'Nature et randonnée',
    prompt: 'nature et randonnée',
  },
  {
    id: 'beach',
    icon: IconBeach,
    label: 'Plage et baignade',
    prompt: 'plage et baignade',
  },
  {
    id: 'nightlife',
    icon: IconMoon,
    label: 'Vie nocturne',
    prompt: 'vie nocturne',
  },
  {
    id: 'local',
    icon: IconBuildingStore,
    label: 'Marchés et vie locale',
    prompt: 'marchés et vie locale',
  },
  {
    id: 'architecture',
    icon: IconBuildingArch,
    label: 'Architecture',
    prompt: 'architecture',
  },
  {
    id: 'photo',
    icon: IconCamera,
    label: 'Spots photo',
    prompt: 'spots photo',
  },
  {
    id: 'adventure',
    icon: IconTrekking,
    label: 'Sport et aventure',
    prompt: 'sport et aventure',
  },
  {
    id: 'wellness',
    icon: IconMassage,
    label: 'Bien-être et thermes',
    prompt: 'bien-être et thermes',
  },
  {
    id: 'wine',
    icon: IconGlassFull,
    label: 'Vin et spiritueux',
    prompt: 'vin et spiritueux',
  },
  {
    id: 'shopping',
    icon: IconShoppingBag,
    label: 'Shopping et artisanat',
    prompt: 'shopping et artisanat',
  },
  {
    id: 'kids',
    icon: IconMoodKid,
    label: 'Activités avec enfants',
    prompt: 'activités adaptées aux enfants',
  },
  {
    id: 'offbeat',
    icon: IconCompass,
    label: 'Insolite',
    prompt: 'lieux insolites, hors des sentiers battus',
  },
]

export const OCCASIONS: BriefOption[] = [
  {
    id: 'honeymoon',
    icon: IconHeart,
    label: 'Lune de miel',
    prompt:
      'Le voyage est une lune de miel : prévois quelques moments romantiques marquants.',
  },
  {
    id: 'birthday',
    icon: IconCake,
    label: 'Anniversaire',
    prompt:
      'Le voyage fête un anniversaire : réserve une journée un peu exceptionnelle.',
  },
  {
    id: 'anniversary',
    icon: IconHearts,
    label: 'Anniversaire de couple',
    prompt:
      'Le voyage fête un anniversaire de couple : prévois un dîner ou une expérience à la hauteur.',
  },
  {
    id: 'reunion',
    icon: IconConfetti,
    label: 'Retrouvailles',
    prompt:
      'Le voyage est l’occasion de retrouvailles : privilégie les activités où l’on peut parler et les tables conviviales.',
  },
  {
    id: 'workation',
    icon: IconBriefcase,
    label: 'Voyage avec télétravail',
    prompt:
      'Le voyageur travaille quelques heures par jour : garde une demi-journée libre à chaque journée de travail et privilégie les lieux avec du wifi.',
  },
]

// ── Contraintes ──────────────────────────────────────────────────────────────

export const DIETS: BriefOption[] = [
  {
    id: 'vegetarian',
    icon: IconLeaf,
    label: 'Végétarien',
    prompt: 'végétarien',
  },
  { id: 'vegan', icon: IconPlant2, label: 'Vegan', prompt: 'vegan' },
  { id: 'halal', icon: IconMoon, label: 'Halal', prompt: 'halal' },
  { id: 'kosher', icon: IconCandle, label: 'Casher', prompt: 'casher' },
  {
    id: 'glutenFree',
    icon: IconWheatOff,
    label: 'Sans gluten',
    prompt: 'sans gluten',
  },
  {
    id: 'lactoseFree',
    icon: IconMilkOff,
    label: 'Sans lactose',
    prompt: 'sans lactose',
  },
  {
    id: 'noAlcohol',
    icon: IconGlassOff,
    label: 'Sans alcool',
    prompt: 'sans alcool',
  },
  {
    id: 'noSeafood',
    icon: IconFishOff,
    label: 'Sans fruits de mer',
    prompt: 'sans fruits de mer',
  },
]

export const MOBILITIES: BriefOption[] = [
  {
    id: 'great',
    icon: IconTrekking,
    label: 'Grand marcheur',
    hint: '10 km et plus',
    prompt:
      'Le voyageur marche volontiers : 10 km et plus dans la journée ne posent aucun problème.',
  },
  {
    id: 'moderate',
    icon: IconWalk,
    label: 'Marche modérée',
    hint: '5 à 6 km',
    prompt: 'Limite la marche à environ 6 km par jour.',
  },
  {
    id: 'limited',
    icon: IconArmchair,
    label: 'Peu de marche',
    hint: '3 km maximum',
    prompt:
      'Mobilité limitée : 3 km de marche par jour au maximum, privilégie les transports et les lieux proches les uns des autres.',
  },
  {
    id: 'wheelchair',
    icon: IconWheelchair,
    label: 'Fauteuil roulant',
    prompt:
      'Une personne se déplace en fauteuil roulant : ne propose que des lieux accessibles et précise l’accessibilité dans « tips ».',
  },
  {
    id: 'stroller',
    icon: IconBabyCarriage,
    label: 'Poussette',
    prompt:
      'Le groupe se déplace avec une poussette : évite les escaliers, les ruelles pavées et les sentiers difficiles.',
  },
]

export const TRANSPORTS: BriefOption[] = [
  { id: 'walk', icon: IconWalk, label: 'À pied', prompt: 'la marche' },
  {
    id: 'publicTransport',
    icon: IconBus,
    label: 'Transports en commun',
    prompt: 'les transports en commun',
  },
  { id: 'train', icon: IconTrain, label: 'Train', prompt: 'le train' },
  {
    id: 'car',
    icon: IconCar,
    label: 'Voiture de location',
    prompt: 'la voiture de location',
  },
  {
    id: 'bus',
    icon: IconBusStop,
    label: 'Bus longue distance',
    prompt: 'le bus longue distance',
  },
  {
    id: 'plane',
    icon: IconPlane,
    label: 'Vol intérieur',
    prompt: 'l’avion pour les vols intérieurs',
  },
  { id: 'bike', icon: IconBike, label: 'Vélo', prompt: 'le vélo' },
  {
    id: 'taxi',
    icon: IconSteeringWheel,
    label: 'Taxi ou VTC',
    prompt: 'le taxi ou le VTC',
  },
]

// ── Le brief ─────────────────────────────────────────────────────────────────

export interface TripBrief {
  // Le voyage
  destination: string
  origin: string
  durationDays: number
  shape: string
  // Les voyageurs
  group: string
  adults: number
  children: number
  childrenAges: string
  familiarity: string
  // Rythme et budget
  pace: string
  dayStart: string
  maxTravelTime: string
  budget: string
  splurges: string[]
  // Envies
  interests: string[]
  mustSee: string
  avoid: string
  occasion: string
  // Contraintes
  diets: string[]
  mobility: string[]
  transports: string[]
  booked: string
  extra: string
}

export const EMPTY_BRIEF: TripBrief = {
  destination: '',
  origin: '',
  durationDays: 7,
  shape: '',
  group: '',
  adults: 2,
  children: 0,
  childrenAges: '',
  familiarity: '',
  pace: '',
  dayStart: '',
  maxTravelTime: '',
  budget: '',
  splurges: [],
  interests: [],
  mustSee: '',
  avoid: '',
  occasion: '',
  diets: [],
  mobility: [],
  transports: [],
  booked: '',
  extra: '',
}

/** Brief d'exemple, pour montrer en un clic ce que donne un questionnaire rempli. */
export const SAMPLE_BRIEF: TripBrief = {
  destination: 'Japon — Tokyo, Kyoto et un détour par Nara',
  origin: 'Paris',
  durationDays: 8,
  shape: 'twoBases',
  group: 'couple',
  adults: 2,
  children: 0,
  childrenAges: '',
  familiarity: 'first',
  pace: 'balanced',
  dayStart: 'early',
  maxTravelTime: 'medium',
  budget: 'comfort',
  splurges: ['food', 'experiences'],
  interests: ['history', 'food', 'local', 'photo', 'wellness'],
  mustSee: 'Le marché Nishiki, une nuit dans un ryokan, le quartier de Yanaka',
  avoid:
    'Les grands centres commerciaux et les files d’attente de plus d’une heure',
  occasion: 'anniversary',
  diets: ['noSeafood'],
  mobility: ['great'],
  transports: ['walk', 'publicTransport', 'train'],
  booked:
    'Vol Paris–Tokyo Haneda, arrivée le premier jour à 14 h 05. Hôtel à Shinjuku les 4 premières nuits.',
  extra: 'Japan Rail Pass 7 jours déjà acheté.',
}

// ── Réponses qui en entraînent d'autres ──────────────────────────────────────
//
// Un bon agent de voyage ne repose pas une question dont il connaît déjà la
// réponse : « en couple » veut dire deux adultes, une poussette veut dire un
// enfant. Chaque fonction ci-dessous applique une de ces déductions, sans
// jamais écraser ce que le voyageur a lui-même précisé.

/** Si l'un des voyageurs est un enfant, les activités pour enfants comptent. */
function withKidsInterest(brief: TripBrief): TripBrief {
  const hasKids = brief.children > 0
  const listed = brief.interests.includes('kids')
  if (hasKids === listed) return brief
  return {
    ...brief,
    interests: hasKids
      ? [...brief.interests, 'kids']
      : brief.interests.filter((id) => id !== 'kids'),
  }
}

/** Choisir « qui part » remplit la composition, sans figer les compteurs. */
export function withGroup(brief: TripBrief, group: string): TripBrief {
  const option = TRAVELER_GROUPS.find((item) => item.id === group)
  const next: TripBrief = { ...brief, group }
  if (!option) return next
  return withKidsInterest({ ...next, ...option.party })
}

/**
 * Les compteurs corrigent le groupe quand ils le contredisent : cinq adultes
 * ne sont plus « en couple », et une famille sans enfant n'en est plus une.
 * Un groupe cohérent est laissé tel quel.
 */
export function withParty(
  brief: TripBrief,
  party: Partial<Pick<TripBrief, 'adults' | 'children'>>,
): TripBrief {
  const next = { ...brief, ...party }
  const total = next.adults + next.children
  let group = next.group
  if (next.children > 0 && ['solo', 'couple', 'friends'].includes(group)) {
    group = 'family'
  } else if (next.children === 0 && group === 'family') {
    group = ''
  }
  if (total >= GROUP_SIZE && ['solo', 'couple', 'friends'].includes(group)) {
    group = 'group'
  } else if (group === 'group' && total < GROUP_SIZE) {
    group = ''
  }
  if (next.adults === 1 && next.children === 0 && group === 'couple') {
    group = 'solo'
  }
  if (next.adults === 2 && next.children === 0 && group === 'solo') {
    group = 'couple'
  }
  return withKidsInterest({ ...next, group })
}

/** Une lune de miel ou un anniversaire de couple se fête à deux. */
export function withOccasion(brief: TripBrief, occasion: string): TripBrief {
  const next = { ...brief, occasion }
  if (
    ['honeymoon', 'anniversary'].includes(occasion) &&
    !brief.group &&
    brief.children === 0
  ) {
    return withGroup(next, 'couple')
  }
  return next
}

/** Une poussette suppose un enfant à bord. */
export function withMobility(brief: TripBrief, mobility: string[]): TripBrief {
  const next = { ...brief, mobility }
  const added = mobility.find((id) => !brief.mobility.includes(id))
  if (added === 'stroller' && brief.children === 0) {
    return withParty(next, { children: 1 })
  }
  return next
}

/** Nombre de voyageurs, adultes et enfants confondus. */
export function partySize(brief: TripBrief): number {
  return brief.adults + brief.children
}

/**
 * Estimation de l'enveloppe du séjour : budget quotidien × voyageurs × jours.
 * Un ordre de grandeur, pour donner un sens concret au tarif à la journée.
 */
export function estimatedBudget(brief: TripBrief): number | null {
  const budget = BUDGETS.find((option) => option.id === brief.budget)
  if (!budget) return null
  return budget.perDay * partySize(brief) * brief.durationDays
}

/** Date de retour, la veille du dernier jour compris. */
export function returnDate(
  startDate: string,
  durationDays: number,
): Date | null {
  if (!startDate) return null
  const date = new Date(`${startDate}T00:00:00`)
  if (Number.isNaN(date.getTime())) return null
  date.setDate(date.getDate() + Math.max(0, durationDays - 1))
  return date
}

// ── Traduction du brief en texte pour l'IA ───────────────────────────────────

function optionsById(catalog: BriefOption[], ids: string[]): BriefOption[] {
  return ids
    .map((id) => catalog.find((option) => option.id === id))
    .filter((option): option is BriefOption => Boolean(option))
}

function optionById(
  catalog: BriefOption[],
  id: string,
): BriefOption | undefined {
  return catalog.find((option) => option.id === id)
}

export function labelsOf(catalog: BriefOption[], ids: string[]): string {
  return optionsById(catalog, ids)
    .map((option) => option.label)
    .join(', ')
}

export function labelOf(catalog: BriefOption[], id: string): string {
  return optionById(catalog, id)?.label ?? ''
}

/** Énumération en français : « a, b et c ». */
function enumerate(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`
}

function travelersLine(brief: TripBrief): string {
  const parts: string[] = []
  if (brief.adults > 0) {
    parts.push(`${brief.adults} adulte${brief.adults > 1 ? 's' : ''}`)
  }
  if (brief.children > 0) {
    const ages = brief.childrenAges.trim()
    parts.push(
      `${brief.children} enfant${brief.children > 1 ? 's' : ''}${ages ? ` (${ages})` : ''}`,
    )
  }
  return parts.join(' et ')
}

/**
 * Le brief tel qu'il apparaît dans le prompt : des sections courtes, une
 * information par ligne. Les questions sans réponse sont omises plutôt que
 * marquées « non renseigné », pour ne pas attirer l'attention du modèle sur
 * des vides qu'il comblerait au hasard.
 */
export function buildBriefSections(brief: TripBrief): string {
  const sections: { title: string; lines: string[] }[] = []

  const trip: string[] = [
    `Destination : ${brief.destination.trim() || '[à compléter : ta destination]'}`,
  ]
  if (brief.origin.trim()) {
    trip.push(
      `Le voyageur part de ${brief.origin.trim()} : la première journée est une journée d’arrivée sur place.`,
    )
  }
  const shape = optionById(TRIP_SHAPES, brief.shape)
  if (shape) trip.push(shape.prompt)
  sections.push({ title: 'Le voyage', lines: trip })

  const travelers: string[] = []
  const group = optionById(TRAVELER_GROUPS, brief.group)
  if (group) travelers.push(group.prompt)
  const composition = travelersLine(brief)
  if (composition) travelers.push(`Composition : ${composition}.`)
  const familiarity = optionById(FAMILIARITY_LEVELS, brief.familiarity)
  if (familiarity) travelers.push(familiarity.prompt)
  if (travelers.length > 0) {
    sections.push({ title: 'Les voyageurs', lines: travelers })
  }

  const rhythm: string[] = []
  const pace = optionById(PACES, brief.pace)
  if (pace) rhythm.push(pace.prompt)
  const dayStart = optionById(DAY_STARTS, brief.dayStart)
  if (dayStart) rhythm.push(dayStart.prompt)
  const travelTime = optionById(TRAVEL_TIMES, brief.maxTravelTime)
  if (travelTime) rhythm.push(travelTime.prompt)
  const budget = optionById(BUDGETS, brief.budget)
  if (budget) rhythm.push(budget.prompt)
  if (brief.splurges.length > 0) {
    rhythm.push(
      `Le voyageur accepte de dépenser davantage pour ${enumerate(
        optionsById(SPLURGES, brief.splurges).map((option) => option.prompt),
      )}.`,
    )
  }
  if (rhythm.length > 0) {
    sections.push({ title: 'Rythme et budget', lines: rhythm })
  }

  const desires: string[] = []
  if (brief.interests.length > 0) {
    desires.push(
      `Centres d’intérêt, du plus important au moins important : ${optionsById(
        INTERESTS,
        brief.interests,
      )
        .map((option) => option.prompt)
        .join(', ')}.`,
    )
  }
  if (brief.mustSee.trim()) {
    desires.push(`À inclure absolument : ${brief.mustSee.trim()}`)
  }
  if (brief.avoid.trim()) {
    desires.push(`À éviter : ${brief.avoid.trim()}`)
  }
  const occasion = optionById(OCCASIONS, brief.occasion)
  if (occasion) desires.push(occasion.prompt)
  if (desires.length > 0) {
    sections.push({ title: 'Envies', lines: desires })
  }

  const constraints: string[] = []
  if (brief.diets.length > 0) {
    constraints.push(
      `Alimentation : ${enumerate(
        optionsById(DIETS, brief.diets).map((option) => option.prompt),
      )}.`,
    )
  }
  optionsById(MOBILITIES, brief.mobility).forEach((option) =>
    constraints.push(option.prompt),
  )
  if (brief.transports.length > 0) {
    constraints.push(
      `Moyens de déplacement disponibles sur place : ${enumerate(
        optionsById(TRANSPORTS, brief.transports).map(
          (option) => option.prompt,
        ),
      )}.`,
    )
  }
  if (brief.booked.trim()) {
    constraints.push(`Déjà réservé : ${brief.booked.trim()}`)
  }
  if (brief.extra.trim()) {
    constraints.push(`À savoir : ${brief.extra.trim()}`)
  }
  if (constraints.length > 0) {
    sections.push({ title: 'Contraintes', lines: constraints })
  }

  return sections
    .map(({ title, lines }) =>
      [`## ${title}`, ...lines.map((line) => `- ${line}`)].join('\n'),
    )
    .join('\n\n')
}

/**
 * Les contraintes qui s'ajoutent aux règles de base du prompt. Elles disent au
 * modèle quoi faire, là où le brief se contente de décrire le voyageur.
 */
export function buildBriefRules(brief: TripBrief): string[] {
  const rules: string[] = []

  if (brief.shape === 'base') {
    rules.push(
      '- Aucune nuit ailleurs qu’à la base : les excursions repartent et reviennent dans la même journée.',
    )
  }
  if (brief.children > 0) {
    const ages = brief.childrenAges.trim()
    rules.push(
      `- Chaque journée doit contenir au moins une activité qui plaise à un enfant${
        ages ? ` de ${ages}` : ''
      }, et des pauses entre deux visites.`,
    )
  }
  if (brief.diets.length > 0) {
    rules.push(
      `- Toutes les activités de type "food" et les "foodRecommendations" doivent être compatibles avec un régime ${enumerate(
        optionsById(DIETS, brief.diets).map((option) => option.prompt),
      )} : vérifie que le lieu propose vraiment ce type de plats et précise-le dans "tips".`,
    )
  }
  if (
    brief.mobility.includes('limited') ||
    brief.mobility.includes('wheelchair')
  ) {
    rules.push(
      '- Renseigne "walkingDistance" chaque jour et garde-la sous la limite indiquée ; mentionne l’accessibilité de chaque lieu dans "tips".',
    )
  }
  if (brief.transports.length > 0) {
    rules.push(
      `- Le voyageur se déplace uniquement avec ${enumerate(
        optionsById(TRANSPORTS, brief.transports).map(
          (option) => option.prompt,
        ),
      )} : ne propose aucun trajet qui exige un autre moyen, ni pour les activités ni pour les transports entre villes.`,
    )
  }
  if (brief.budget) {
    rules.push(
      '- Renseigne "price" et "currency" pour chaque activité payante, et respecte le budget indiqué sur l’ensemble de la journée.',
    )
  }
  if (brief.mustSee.trim()) {
    rules.push(
      '- Les lieux et expériences listés dans « À inclure absolument » figurent tous dans l’itinéraire, placés au meilleur moment.',
    )
  }
  if (brief.avoid.trim()) {
    rules.push(
      '- Rien de ce qui figure dans « À éviter » n’apparaît, même indirectement.',
    )
  }
  if (brief.booked.trim()) {
    rules.push(
      '- Construis l’itinéraire autour de ce qui est déjà réservé : horaires d’arrivée, nuits déjà posées, activités déjà payées.',
    )
  }

  return rules
}

/** Nombre d'activités par jour à demander, selon le rythme choisi. */
export function activitiesPerDay(brief: TripBrief): string {
  return (
    PACES.find((pace) => pace.id === brief.pace)?.activities ??
    DEFAULT_ACTIVITIES_PER_DAY
  )
}
