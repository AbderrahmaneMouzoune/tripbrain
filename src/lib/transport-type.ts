/**
 * Le mode d'un trajet, quelle que soit la façon dont on l'a écrit.
 *
 * Un tableur importé dit « Ferry », « TGV » ou « Taxi » ; un ancien partage
 * peut porter un type que l'app ne connaissait pas encore. Sans lecture
 * commune, ces trajets arrivaient avec un type hors liste : ni icône ni
 * libellé à l'écran, et le modèle publié les retirait.
 *
 * `normalizeTransportType` ramène n'importe quelle valeur à l'un des types de
 * `Transport['type']` :
 * - un type de l'app est gardé tel quel, casse et espaces ignorés (`car`
 *   compris, tel que l'app l'exporte) ;
 * - sinon, accents et ponctuation sont ignorés aussi, et les mots reconnus,
 *   en français ou en anglais, décident. Quand plusieurs modes se croisent
 *   (« voiture + ferry », « taxi-bateau »), le plus spécifique l'emporte, dans
 *   l'ordre bateau, avion, train, bus, marche ou vélo, voiture : c'est lui qui
 *   se réserve et qui donne au trajet son caractère, la voiture n'étant
 *   souvent que l'accès ;
 * - tout le reste devient `other`, que l'app affiche « Autre trajet ».
 *
 * « car » n'est reconnu que seul : dans une phrase, c'est aussi l'autocar
 * (« car de nuit »), qu'on ne peut pas trancher. La marche et le vélo
 * deviennent `other` : l'app n'a pas de type pour eux, mais « location de
 * vélo » ne doit pas devenir une voiture parce que « location » en est un mot.
 *
 * Pure et sans dépendance : elle sert à l'import (`importItinerary.ts`,
 * `import-files.ts`), au partage reçu (`share.ts`), à la génération
 * (`itinerary-schema.ts`) et au serveur des modèles (`template-shape.ts`).
 */

import type { DayItinerary, Transport } from '@/lib/itinerary-data'

export type TransportType = Transport['type']

/** Les types de trajet de l'app, dans l'ordre où l'édition les propose. */
export const TRANSPORT_TYPES = [
  'train',
  'plane',
  'bus',
  'car',
  'boat',
  'other',
] as const satisfies readonly TransportType[]

// `tsc` échoue si un type ajouté à `itinerary-data.ts` manque à la liste.
const listCovered: [TransportType] extends [(typeof TRANSPORT_TYPES)[number]]
  ? true
  : false = true
void listCovered

export function isTransportType(value: unknown): value is TransportType {
  return (
    typeof value === 'string' &&
    (TRANSPORT_TYPES as readonly string[]).includes(value)
  )
}

/**
 * Mots reconnus, sans accent, par ordre de priorité : le premier groupe dont
 * un mot apparaît l'emporte. `other` regroupe la marche et le vélo, plus
 * spécifiques que la voiture.
 */
const WORD_GROUPS: readonly (readonly [TransportType, readonly string[]])[] = [
  [
    'boat',
    [
      'bateau',
      'boat',
      'ferry',
      'ferries',
      'ferryboat',
      'ship',
      'navire',
      'paquebot',
      'croisiere',
      'cruise',
      'vaporetto',
      'catamaran',
      'hydroglisseur',
      'hydrofoil',
      'jetfoil',
      'speedboat',
      'traghetto',
    ],
  ],
  [
    'plane',
    [
      'avion',
      'vol',
      'flight',
      'plane',
      'airplane',
      'aeroplane',
      'aircraft',
      'airline',
      'aerien',
      'hydravion',
      'seaplane',
    ],
  ],
  [
    'train',
    [
      'train',
      'tgv',
      'ter',
      'ouigo',
      'intercites',
      'thalys',
      'eurostar',
      'shinkansen',
      'rail',
      'railway',
      'ferroviaire',
      'metro',
      'subway',
      'tram',
      'tramway',
      'rer',
    ],
  ],
  ['bus', ['bus', 'autobus', 'autocar', 'coach', 'minibus', 'trolleybus']],
  [
    'other',
    [
      'pied',
      'marche',
      'walk',
      'walking',
      'randonnee',
      'hike',
      'hiking',
      'trek',
      'trekking',
      'velo',
      'bike',
      'bicycle',
      'cycling',
    ],
  ],
  [
    'car',
    [
      'voiture',
      'auto',
      'automobile',
      'taxi',
      'vtc',
      'uber',
      'location',
      'rental',
      'drive',
      'driving',
      'moto',
      'motorbike',
      'motorcycle',
      'covoiturage',
      'carpool',
      'roadtrip',
    ],
  ],
]

/** Expressions de plusieurs mots, lues avant les mots isolés. */
const PHRASES: readonly (readonly [string, TransportType])[] = [
  ['navette maritime', 'boat'],
  ['navette fluviale', 'boat'],
  ['water taxi', 'boat'],
  ['navette routiere', 'bus'],
  ['camping car', 'car'],
  ['road trip', 'car'],
]

const PRIORITY = new Map<TransportType, number>(
  WORD_GROUPS.map(([type], rank) => [type, rank]),
)

const WORDS = new Map<string, TransportType>(
  WORD_GROUPS.flatMap(([type, words]) =>
    words.map((word) => [word, type] as const),
  ),
)

/** Le type d'un mot, au singulier comme au pluriel (« bateaux », « vols »). */
function wordType(word: string): TransportType | undefined {
  return (
    WORDS.get(word) ??
    (/[sx]$/.test(word) ? WORDS.get(word.slice(0, -1)) : undefined)
  )
}

/** Minuscules, sans accent ; tout ce qui n'est ni lettre ni chiffre sépare. */
function simplify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Le type de trajet de l'app que désigne `raw`, `other` à défaut. */
export function normalizeTransportType(raw: unknown): TransportType {
  if (typeof raw !== 'string') return 'other'
  const key = simplify(raw)
  if (isTransportType(key)) return key
  const padded = ` ${key} `
  const found = [
    ...PHRASES.filter(([phrase]) => padded.includes(` ${phrase} `)).map(
      ([, type]) => type,
    ),
    ...key.split(' ').map(wordType),
  ].filter((type) => type !== undefined)
  if (found.length === 0) return 'other'
  return found.reduce((best, type) =>
    (PRIORITY.get(type) ?? Infinity) < (PRIORITY.get(best) ?? Infinity)
      ? type
      : best,
  )
}

/**
 * Les journées d'un import ou d'un partage reçu, chaque trajet ramené à un
 * type de l'app. Une journée dont le trajet est déjà bien typé, ou qui n'en a
 * pas, est rendue telle quelle (même objet) ; rien d'autre n'est vérifié.
 */
export function normalizeItineraryTransports<T extends DayItinerary>(
  days: readonly T[],
): T[] {
  return days.map((day) => {
    // Un fichier JSON n'est pas vérifié en profondeur : ni la journée ni son
    // trajet ne sont forcément des objets.
    if (typeof day !== 'object' || day === null) return day
    const transport: unknown = day.transport
    if (typeof transport !== 'object' || transport === null) return day
    const type: unknown = (transport as { type?: unknown }).type
    if (isTransportType(type)) return day
    return {
      ...day,
      transport: { ...transport, type: normalizeTransportType(type) },
    }
  })
}
