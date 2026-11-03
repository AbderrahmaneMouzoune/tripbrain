// Tests adverses : vie privée et sécurité de l'API des itinéraires modèles.
//
// Les routes sont appelées en vrai (`Request` → handler exporté) contre le faux
// bucket en mémoire, comme `template-routes.test.ts`. On y cherche :
// (a) des données personnelles qui survivraient au nettoyage, dans le bucket
//     comme dans chaque réponse publique ;
// (b) le jeton propriétaire : en-têtes hostiles, jeton d'un autre modèle,
//     jeton glissé ailleurs, comparaison en temps constant, journaux ;
// (c) l'énumération et le moissonnage par slug ou par id ;
// (d) le contenu injecté que les pages SEO afficheront ;
// (e) les en-têtes `Cache-Control` de chaque réponse ;
// (f) les abus de ressources ;
// (g) l'effacement au retrait.
//
// Convention : un défaut trouvé est écrit en `it.fails` avec le comportement
// attendu. Le jour où il est corrigé, le test passe au rouge : remplacer
// `it.fails` par `it`.

import { createHash, timingSafeEqual } from 'node:crypto'
import { inspect } from 'node:util'
import { encode } from '@msgpack/msgpack'
import { POST } from '@/app/api/templates/route'
import {
  DELETE,
  GET as getTemplate,
  PATCH,
  PUT,
} from '@/app/api/templates/[id]/route'
import { GET as getVersion } from '@/app/api/templates/[id]/v/[n]/route'
import { GET as getBySlug } from '@/app/api/templates/by-slug/[slug]/route'
import { GET as getIndex } from '@/app/api/templates/index/route'
import type { DayItinerary } from '@/lib/itinerary-data'
import { compressItinerary } from '@/lib/share'
import { getTemplateStore } from '@/lib/template-bucket'
import {
  TEMPLATE_ID_ALPHABET,
  TEMPLATE_ID_LENGTH,
  createTemplateId,
  isTemplateId,
} from '@/lib/template-model'
import {
  TEMPLATE_INDEX_KEYS,
  isTemplateIndexKey,
  templateIndexKey,
  readTemplateForOperator,
  retireTemplateAsOperator,
  templateMetaKey,
  templateSlugKey,
  templateVersionKey,
} from '@/lib/template-store'
import { memoryTemplateBucket } from './helpers/memory-template-bucket'
import {
  activity,
  compressedBytes,
  compressedZeros,
  day,
  hotel,
  transport,
} from './helpers/template-fixtures'

// La comparaison du jeton doit passer par `timingSafeEqual` : on l'observe.
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>()
  return {
    ...actual,
    timingSafeEqual: vi.fn(
      (a: NodeJS.ArrayBufferView, b: NodeJS.ArrayBufferView) =>
        actual.timingSafeEqual(a, b),
    ),
  }
})

// Les routes parlent au faux bucket en mémoire au lieu de R2.
vi.mock('@/lib/template-bucket', async () => {
  const { memoryTemplateBucket } =
    await import('./helpers/memory-template-bucket')
  return { getTemplateStore: vi.fn(() => memoryTemplateBucket) }
})

const bucket = memoryTemplateBucket

const NO_STORE = 'no-store'
const VERSION_CACHE = 'public, s-maxage=60'
const LISTING_CACHE = 'public, s-maxage=300, stale-while-revalidate=300'
const NOT_ALLOWED = 'Cet appareil n’est pas autorisé à modifier ce modèle.'

// ── Requêtes ──────────────────────────────────────────────────────────────────

// Une IP par requête : les limiteurs des routes vivent le temps du fichier.
let clients = 0
function clientIp(): string {
  clients += 1
  return `198.51.${Math.floor(clients / 250)}.${clients % 250}`
}

function jsonRequest(
  url: string,
  method: string,
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(`http://localhost${url}`, {
    method,
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': clientIp(),
      ...headers,
    },
  })
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

function idContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

/** `data` d'une écriture pour une valeur quelconque, hors du type. */
function rawData(value: unknown): string {
  return compressedBytes(encode(value))
}

interface Published {
  template: {
    id: string
    slug: string
    version: number
    itinerary: DayItinerary[]
  } & Record<string, unknown>
  ownerToken: string
  /** Texte brut de la réponse 201. */
  text: string
}

async function publishData(
  data: string,
  extra: Record<string, unknown> = {},
): Promise<Published> {
  const response = await POST(
    jsonRequest('/api/templates', 'POST', {
      data,
      country: 'JP',
      title: 'Japon au printemps',
      authorName: 'Yanis',
      ...extra,
    }),
  )
  const text = await response.text()
  expect(response.status, text).toBe(201)
  const body = JSON.parse(text)
  return { template: body.template, ownerToken: String(body.ownerToken), text }
}

async function publish(
  itinerary: DayItinerary[] = twoDays(),
  extra: Record<string, unknown> = {},
): Promise<Published> {
  return publishData(await compressItinerary(itinerary), extra)
}

function read(id: string) {
  return getTemplate(
    new Request(`http://localhost/api/templates/${id}`),
    idContext(id),
  )
}

function readVersion(id: string, n: string) {
  return getVersion(
    new Request(`http://localhost/api/templates/${id}/v/${n}`),
    { params: Promise.resolve({ id, n }) },
  )
}

function readBySlug(slug: string) {
  return getBySlug(
    new Request(`http://localhost/api/templates/by-slug/${slug}`),
    { params: Promise.resolve({ slug }) },
  )
}

function put(id: string, body: unknown, headers: Record<string, string>) {
  return PUT(
    jsonRequest(`/api/templates/${id}`, 'PUT', body, headers),
    idContext(id),
  )
}

function patch(id: string, body: unknown, headers: Record<string, string>) {
  return PATCH(
    jsonRequest(`/api/templates/${id}`, 'PATCH', body, headers),
    idContext(id),
  )
}

function remove(id: string, headers: Record<string, string>, query = '') {
  return DELETE(
    new Request(`http://localhost/api/templates/${id}${query}`, {
      method: 'DELETE',
      headers: { 'X-Forwarded-For': clientIp(), ...headers },
    }),
    idContext(id),
  )
}

// ── Surfaces observées ────────────────────────────────────────────────────────

interface Surface {
  name: string
  status: number
  cacheControl: string | null
  text: string
}

async function surface(name: string, response: Response): Promise<Surface> {
  return {
    name,
    status: response.status,
    cacheControl: response.headers.get('Cache-Control'),
    text: await response.text(),
  }
}

/** Tout ce que l'API publique répond sur un modèle : par id, versions, slug, index. */
async function publicSurfaces(
  id: string,
  slug: string,
  versions: number,
): Promise<Surface[]> {
  const surfaces = [
    await surface(`GET /api/templates/${id}`, await read(id)),
    await surface(`GET by-slug/${slug}`, await readBySlug(slug)),
    await surface('GET index', await getIndex()),
  ]
  for (let n = 1; n <= versions; n++) {
    surfaces.push(
      await surface(`GET ${id}/v/${n}`, await readVersion(id, String(n))),
    )
  }
  return surfaces
}

/** Chaque objet du bucket, sérialisé : ce qu'une fuite de R2 donnerait. */
function bucketSurfaces(): Surface[] {
  return bucket.keys().map((key) => ({
    name: `bucket ${key}`,
    status: 0,
    cacheControl: null,
    text: JSON.stringify(bucket.peek(key)),
  }))
}

/** Les marqueurs `PRIV…` trouvés, surface par surface. */
function plantedLeaks(surfaces: readonly Surface[], pattern = /PRIV[\w-]*/g) {
  return surfaces.flatMap((s) =>
    Array.from(s.text.matchAll(pattern), (match) => `${s.name} : ${match[0]}`),
  )
}

/** Toutes les clés d'objet d'une valeur JSON, à toute profondeur. */
function allKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => allKeys(item, keys))
  else if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      keys.add(key)
      allKeys(item, keys)
    }
  }
  return keys
}

// ── Voyages ───────────────────────────────────────────────────────────────────

/** Deux jours au Japon : listé s'il reste visible. */
function twoDays(): DayItinerary[] {
  return [
    day(1, { title: 'Arrivée à Tokyo' }),
    day(2, {
      city: 'Kyoto',
      title: 'Fushimi Inari',
      coordinates: [35.0116, 135.7681],
      activities: [activity({ id: 'act-fushimi', name: 'Fushimi Inari' })],
    }),
  ]
}

const SECRET_PRICE = 987654.25

/**
 * Un voyage bourré de données personnelles dans chaque champ, chaque clé
 * inconnue, chaque mauvais type. `PRIV…` ne doit jamais ressortir ; `PUB…`
 * est le texte libre que la spec (§5, « tout le reste ») publie tel quel.
 */
function stuffedTrip(): unknown[] {
  return [
    {
      id: 'day-1',
      date: '2026-04-01',
      dayNumber: 1,
      city: 'PUB-ville-1',
      title: 'PUB-titre-jour-1',
      coordinates: [35.6762, 139.6503],
      highlights: ['PUB-highlight', { secret: 'PRIV-highlight-objet' }, 42],
      foodRecommendations: ['PUB-plat', ['PRIV-plat-tableau']],
      walkingDistance: 'PUB-marche',
      packingTips: ['PUB-bagage', null],
      dayType: 'PUB-type-journee',
      tips: ['PUB-conseil-jour', { x: 'PRIV-conseil-objet' }],
      notes: 'PRIV-notes-jour : boîte à clés 4471, Kenji au 080-3312-4471',
      source: 'user',
      priority: 'must',
      // Clés inconnues du type, dont des noms hérités d'`Object.prototype`.
      phone: 'PRIV-jour-telephone',
      passport: { number: 'PRIV-jour-passeport' },
      travelers: [{ name: 'PRIV-jour-voyageur', birthDate: '1990-01-01' }],
      constructor: 'PRIV-jour-constructor',
      prototype: 'PRIV-jour-prototype',
      toString: 'PRIV-jour-toString',
      valueOf: 'PRIV-jour-valueOf',
      hasOwnProperty: 'PRIV-jour-hasOwnProperty',
      images: [
        {
          url: 'https://img.example/jour-1.jpg',
          caption: 'PUB-legende',
          exif: { gps: 'PRIV-image-exif' },
        },
        { url: 'data:image/png;base64,UFJJVg==', caption: 'PRIV-image-data' },
        {
          url: 'blob:https://app.tripbrain.fr/6f1c',
          caption: 'PRIV-image-blob',
        },
        {
          url: 'file:///Users/yanis/Photos/PRIV-image-fichier.jpg',
          caption: 'PRIV-image-fichier',
        },
        {
          url: 'javascript:alert("PRIV-image-js")',
          caption: 'PRIV-image-js-legende',
        },
        'https://img.example/PRIV-image-chaine.jpg',
      ],
      accommodation: {
        id: 'acc-1',
        name: 'PUB-hotel',
        address: 'PUB-adresse-hotel',
        bookingUrl:
          'https://secure.booking.com/confirmation.fr.html?bn=4021553117&pincode=7731',
        checkIn: 'PUB-checkin',
        checkOut: 'PUB-checkout',
        bookingReference: 'PRIVREF4021553117',
        status: 'booked',
        price: SECRET_PRICE,
        currency: 'PRIVCUR',
        images: [
          'https://img.example/hotel.jpg',
          'data:image/jpeg;base64,UFJJVi1ob3RlbA==',
          'file:///PRIV-hotel-fichier.jpg',
        ],
        guestName: 'PRIV-hotel-client',
        doorCode: 'PRIV-hotel-digicode',
        contact: {
          phone: 'PRIV-hotel-telephone',
          nested: { deeper: 'PRIV-hotel-imbrique' },
        },
        source: 'import',
      },
      transport: {
        id: 'tr-1',
        type: 'plane',
        from: 'PUB-depart',
        to: 'PUB-arrivee',
        details: 'PUB-details',
        departureAddress: 'PUB-adresse-depart',
        departureTime: 'PUB-heure-depart',
        arrivalTime: 'PUB-heure-arrivee',
        duration: 'PUB-duree-trajet',
        provider: 'PUB-compagnie',
        bookingUrl:
          'https://wwws.airfrance.fr/trip?bookingCode=PRIVPNR8XK&lastName=PRIVNOM',
        bookingReference: 'PRIVPNR8XK',
        seat: 'PRIV-siege',
        gate: 'PRIV-porte',
        terminal: 'PRIV-terminal',
        status: 'checked-in',
        notes: 'PRIV-notes-trajet',
        price: SECRET_PRICE,
        currency: 'PRIVCUR',
        eTicket: 'PRIV-billet-electronique',
        passengers: ['PRIV-passager'],
      },
      activities: [
        {
          id: 'act-1',
          name: 'PUB-activite',
          description: 'PUB-description',
          type: 'visit',
          duration: 'PUB-duree',
          coordinates: [35.67, 139.7],
          openAt: 'PUB-horaires',
          address: 'PUB-adresse-activite',
          bookingUrl: 'javascript:alert("PRIV-activite-js")',
          reservationRequired: true,
          price: SECRET_PRICE,
          currency: 'PRIVCUR',
          rating: 4.5,
          tags: ['PUB-tag', { x: 'PRIV-tag-objet' }],
          status: 'done',
          tips: 'PUB-conseil-activite',
          images: [
            'https://img.example/act.jpg',
            'blob:https://app.tripbrain.fr/PRIV-activite-blob',
          ],
          notes: 'PRIV-activite-notes',
          confirmationCode: 'PRIV-activite-confirmation',
          bookingReference: 'PRIV-activite-reference',
        },
        {
          id: 'act-2',
          name: 'PUB-activite-2',
          type: 'food',
          coordinates: [1, 2, 'PRIV-coordonnees-en-trop'],
        },
        { id: 'act-3', name: { fr: 'PRIV-nom-objet' }, type: 'visit' },
        { id: 'act-4', description: 'PRIV-activite-sans-nom', type: 'visit' },
        ['PRIV-activite-tableau'],
        'PRIV-activite-chaine',
      ],
    },
    {
      id: 'day-2',
      date: '2026-04-02',
      dayNumber: 2,
      city: 'PUB-ville-2',
      title: 'PUB-titre-jour-2',
      coordinates: [35, 135],
      // Des tableaux, des textes et des types inconnus là où on attend un objet.
      accommodation: [{ id: 'acc-x', name: 'PRIV-hebergement-tableau' }],
      transport: 'PRIV-trajet-chaine',
      images: {
        url: 'https://img.example/PRIV-images-objet.jpg',
        caption: 'x',
      },
      activities: [],
    },
    {
      id: 'day-3',
      date: '2026-04-03',
      dayNumber: 3,
      city: 'PUB-ville-3',
      title: 'PUB-titre-jour-3',
      coordinates: [35, 135],
      transport: { id: 'tr-3', type: 'teleport', from: 'PRIV-type-inconnu' },
      accommodation: { id: 'acc-3', address: 'PRIV-hebergement-sans-nom' },
      activities: [],
    },
  ]
}

/** Textes libres que la spec publie tels quels (§5 « tout le reste »). */
const PUBLISHED_FREE_TEXT = [
  'PUB-ville-1',
  'PUB-titre-jour-1',
  'PUB-highlight',
  'PUB-plat',
  'PUB-marche',
  'PUB-bagage',
  'PUB-type-journee',
  'PUB-conseil-jour',
  'PUB-legende',
  'PUB-hotel',
  'PUB-adresse-hotel',
  'PUB-checkin',
  'PUB-checkout',
  'PUB-depart',
  'PUB-arrivee',
  'PUB-details',
  'PUB-adresse-depart',
  'PUB-heure-depart',
  'PUB-heure-arrivee',
  'PUB-duree-trajet',
  'PUB-compagnie',
  'PUB-activite',
  'PUB-description',
  'PUB-duree',
  'PUB-horaires',
  'PUB-adresse-activite',
  'PUB-tag',
  'PUB-conseil-activite',
  'PUB-activite-2',
  'PUB-ville-2',
  'PUB-titre-jour-2',
  'PUB-ville-3',
  'PUB-titre-jour-3',
]

// ── Cycle ─────────────────────────────────────────────────────────────────────

const consoleMethods = ['log', 'info', 'warn', 'error', 'debug'] as const

beforeEach(() => {
  bucket.reset()
  vi.mocked(getTemplateStore).mockClear()
  vi.mocked(timingSafeEqual).mockClear()
  // Les 500 et les pannes injectées journalisent : on garde la sortie propre,
  // et chaque test qui le veut lit les appels.
  for (const method of consoleMethods) {
    vi.spyOn(console, method).mockImplementation(() => {})
  }
})

afterEach(() => {
  for (const method of consoleMethods) vi.mocked(console[method]).mockRestore()
})

// ── (a) Fuites dans un modèle publié ──────────────────────────────────────────

describe('(a) aucune donnée retirée ne ressort d’un modèle publié', () => {
  it('ni dans le bucket ni dans une réponse publique, champ par champ', async () => {
    const published = await publishData(rawData(stuffedTrip()), {
      title: 'PUB-titre-modele',
      authorName: 'PUB-prenom',
      options: { includeNotes: false, includePrices: false },
    })
    const { id, slug } = published.template
    const surfaces = [
      {
        name: 'POST 201',
        status: 201,
        cacheControl: null,
        text: published.text,
      },
      ...(await publicSurfaces(id, slug, 1)),
      ...bucketSurfaces(),
    ]
    expect(surfaces.filter((s) => s.status >= 400)).toEqual([])

    expect(plantedLeaks(surfaces)).toEqual([])
    // Référence de la confirmation Booking.com, prix (relevés à 987 654,25)
    for (const s of surfaces) {
      expect(s.text, s.name).not.toContain('4021553117')
      expect(s.text, s.name).not.toContain('987654')
    }

    // Aucune clé retirée, nulle part
    const version = bucket.peek(templateVersionKey(id, 1))
    const keys = allKeys(version)
    for (const key of [
      'bookingReference',
      'seat',
      'gate',
      'terminal',
      'status',
      'notes',
      'price',
      'currency',
    ]) {
      expect(keys, key).not.toContain(key)
    }
    const itinerary = (version as { itinerary: DayItinerary[] }).itinerary
    // `bookingUrl` est requis sur un hébergement : vidé plutôt que retiré.
    expect(itinerary[0].accommodation?.bookingUrl).toBe('')
    expect(itinerary[0].transport).not.toHaveProperty('bookingUrl')
    expect(itinerary[0].activities[0]).not.toHaveProperty('bookingUrl')
    // Les entrées mal formées sont retirées, pas devinées
    expect(itinerary[0].activities.map((a) => a.id)).toEqual(['act-1', 'act-2'])
    expect(itinerary[0].activities[1]).not.toHaveProperty('coordinates')
    expect(itinerary[1]).not.toHaveProperty('accommodation')
    expect(itinerary[1]).not.toHaveProperty('transport')
    expect(itinerary[1]).not.toHaveProperty('images')
    expect(itinerary[2]).not.toHaveProperty('transport')
    expect(itinerary[2]).not.toHaveProperty('accommodation')
    expect(itinerary[0].images).toEqual([
      { url: 'https://img.example/jour-1.jpg', caption: 'PUB-legende' },
    ])
    // Aucun prototype modifié par une clé `constructor` ou `toString`
    expect({}.toString()).toBe('[object Object]')
  })

  it('documente les textes libres publiés tels quels (spec §5, « tout le reste »)', async () => {
    const { template } = await publishData(rawData(stuffedTrip()), {
      options: { includeNotes: false, includePrices: false },
    })
    const bySlug = await (await readBySlug(template.slug)).text()
    // Ces champs partent sans filtre : un numéro, un nom ou une référence
    // saisis dedans sont publiés. L'écran A3 ne montre que les notes.
    expect(
      PUBLISHED_FREE_TEXT.filter((text) => !bySlug.includes(text)),
    ).toEqual([])
  })

  it('refuse une clé `__proto__` sans rien écrire', async () => {
    const payload = JSON.parse(
      '[{"id":"day-1","date":"2026-04-01","dayNumber":1,"city":"Tokyo","title":"t","activities":[],"coordinates":[1,2],"__proto__":{"polluted":"PRIV-proto"}}]',
    )
    const response = await POST(
      jsonRequest('/api/templates', 'POST', {
        data: rawData(payload),
        country: 'JP',
      }),
    )
    expect(response.status).toBe(400)
    expect(bucket.keys()).toEqual([])
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('n’envoie ni les notes ni les prix exclus, même cachés dans les réglages du corps', async () => {
    // `options` est lu tel quel : des clés en plus n'activent rien.
    const { template } = await publishData(rawData(stuffedTrip()), {
      options: {
        includeNotes: false,
        includePrices: false,
        include_notes: true,
        notes: true,
        __proto__: { includeNotes: true },
      },
    })
    expect(template.includesNotes).toBe(false)
    expect(template.includesPrices).toBe(false)
    expect(JSON.stringify(template)).not.toContain('PRIV-notes')
  })
})

// ── (a) Liens de réservation ──────────────────────────────────────────────────

interface LinkCase {
  label: string
  url: string
  /** Référence portée par l'entité (hébergement, trajet). */
  reference?: string
}

/** Liens privés que le nettoyage retire bien (spec §5, design §3.1). */
const PRIVATE_LINKS: LinkCase[] = [
  {
    label: 'Booking.com, confirmation',
    url: 'https://secure.booking.com/confirmation.fr.html?aid=304142&bn=4021553117&pincode=7731',
  },
  {
    label: 'Booking.com, mes réservations',
    url: 'https://secure.booking.com/myreservations.fr.html?aid=304142',
  },
  {
    label: 'Airbnb, itinéraire',
    url: 'https://www.airbnb.fr/reservation/itinerary?code=HMX4T2KQ9P',
  },
  {
    label: 'Expedia, voyage avec sa référence',
    url: 'https://www.expedia.fr/trips/72118734123456',
    reference: '72118734123456',
  },
  {
    label: 'Hotels.com, référence espacée',
    url: 'https://fr.hotels.com/trips/72118734999999',
    reference: '7211 8734 999999',
  },
  {
    label: 'Trip.com, commande',
    url: 'https://fr.trip.com/hotels/ctorderdetail?orderid=1306267683942772',
  },
  {
    label: 'SNCF Connect',
    url: 'https://www.sncf-connect.com/app/trips/details?reference=QWERTY&name=DUPONT',
  },
  {
    label: 'Air France',
    url: 'https://wwws.airfrance.fr/trip?bookingCode=K7X2PQ&lastName=DUPONT',
  },
  {
    label: 'easyJet',
    url: 'https://www.easyjet.com/fr/secure/MyEasyJet.mvc/ViewBooking?bookingReference=EZY7Q2K&lastName=Dupont',
  },
  {
    label: 'Ryanair',
    url: 'https://www.ryanair.com/fr/fr/trip/manage?pnr=RYN4KX',
  },
  {
    label: 'référence avec d’autres séparateurs',
    url: 'https://hotel.example/stay/4021-553-117',
    reference: '4021553117',
  },
  {
    label: 'référence encodée',
    url: 'https://hotel.example/stay/%4B%37%58%32%50%51',
    reference: 'K7X2PQ',
  },
  {
    label: 'référence dans l’ancre',
    url: 'https://hotel.example/stay#K7X2PQ',
    reference: 'k7x-2pq',
  },
  {
    label: 'tout en majuscules',
    url: 'HTTPS://HOTEL.EXAMPLE/CONFIRMATION/AB12',
  },
  { label: 'identifiants', url: 'https://yanis:motdepasse@hotel.example/' },
  { label: 'javascript:', url: 'javascript:alert(document.cookie)' },
  { label: 'javascript: casse mêlée', url: 'JaVaScRiPt:alert(1)' },
  { label: 'javascript: après des espaces', url: '   javascript:alert(1)' },
  {
    label: 'javascript: coupé par une tabulation',
    url: 'java\tscript:alert(1)',
  },
  {
    label: 'data:',
    url: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
  },
  { label: 'blob:', url: 'blob:https://app.tripbrain.fr/6f1c' },
  { label: 'file:', url: 'file:///Users/yanis/billets/af276.pdf' },
  { label: 'vbscript:', url: 'vbscript:msgbox(1)' },
  { label: 'relatif au protocole', url: '//hotel.example/stay/4021553117' },
]

/** Une journée par lien, porté par l'hébergement, le trajet et une activité. */
function linkTrip(cases: readonly LinkCase[]): DayItinerary[] {
  return cases.map((link, index) =>
    day(index + 1, {
      id: `day-lien-${index + 1}`,
      date: '2026-04-01',
      accommodation: hotel({
        id: `acc-${index}`,
        bookingUrl: link.url,
        bookingReference: link.reference,
      }),
      transport: transport({
        id: `tr-${index}`,
        bookingUrl: link.url,
        bookingReference: link.reference,
      }),
      // Une activité n'a pas de référence : seuls les marqueurs la protègent.
      activities: link.reference
        ? []
        : [activity({ id: `act-${index}`, bookingUrl: link.url })],
    }),
  )
}

/** Tous les textes d'une valeur JSON, clés comprises. */
function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) value.forEach((item) => allStrings(item, out))
  else if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      out.push(key)
      allStrings(item, out)
    }
  }
  return out
}

function squash(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

/** Les liens (ou leur référence) qui ressortent quelque part. */
async function leakedLinks(
  cases: readonly LinkCase[],
  extra: Record<string, unknown> = {},
): Promise<string[]> {
  const { template } = await publish(linkTrip(cases), extra)
  const surfaces = [
    ...(await publicSurfaces(template.id, template.slug, 1)),
    ...bucketSurfaces(),
  ]
  const texts = surfaces.flatMap((s) =>
    s.text ? allStrings(JSON.parse(s.text)) : [],
  )
  const squashed = texts.map(squash)
  return cases
    .filter(
      (link) =>
        texts.includes(link.url) ||
        texts.includes(link.url.trim()) ||
        (link.reference !== undefined &&
          squashed.some((text) => text.includes(squash(link.reference!)))),
    )
    .map((link) => `${link.label} : ${link.url}`)
}

describe('(a) liens de réservation', () => {
  it('retire les confirmations, espaces clients et schémas dangereux, sur chaque entité', async () => {
    expect(await leakedLinks(PRIVATE_LINKS)).toEqual([])
  })

  // Défaut corrigé : seuls des marqueurs anglais et la référence de l'entité
  // elle-même protégeaient un lien. Une activité n'a jamais de référence, et
  // un séjour répété sur plusieurs nuits ne la porte souvent qu'une fois.
  const MISSED_LINKS: LinkCase[] = [
    {
      label: 'Expedia, page du voyage, référence non saisie',
      url: 'https://www.expedia.fr/trips/72118734123456',
    },
    {
      label: 'Hotels.com, itineraryId',
      url: 'https://fr.hotels.com/booking/details?itineraryId=72118734123456',
    },
    {
      label: 'Viator, réservation du compte',
      url: 'https://www.viator.com/fr-FR/account/booking/BR-1078812345',
    },
    {
      label: 'Klook, numéro de commande',
      url: 'https://www.klook.com/fr/order/detail/?orderNo=KLK123456789',
    },
    {
      label: 'Trainline, billets du compte',
      url: 'https://www.thetrainline.com/my-account/bookings/7f3c2a91-0b5e-4d4e',
    },
    {
      label: 'numéro de réservation',
      url: 'https://www.hotel-exemple.fr/sejour?bookingNumber=88123456',
    },
    {
      label: 'code PIN Booking.com',
      url: 'https://secure.booking.com/help/booking?pincode=7731&id=4021553117',
    },
    {
      label: 'réservation accentuée',
      url: 'https://www.hotel-exemple.fr/ma-réservation/88123456',
    },
  ]
  for (const link of MISSED_LINKS) {
    it(`retire « ${link.label} »`, async () => {
      expect(await leakedLinks([link])).toEqual([])
    })
  }

  it('la référence d’une nuit retire aussi le lien des autres nuits du même hôtel', async () => {
    const url = 'https://hotel.example/stay/4021553117'
    const { template } = await publish([
      day(1, {
        accommodation: hotel({
          bookingUrl: url,
          bookingReference: '4021553117',
        }),
      }),
      // Deuxième nuit : même hôtel, même lien, référence saisie une seule fois.
      day(2, { accommodation: hotel({ id: 'acc-2', bookingUrl: url }) }),
    ])
    const stored = JSON.stringify(
      bucket.peek(templateVersionKey(template.id, 1)),
    )
    expect(stored).not.toContain('4021553117')
  })

  // Défaut corrigé : un lien qui porte l'e-mail ou le téléphone de l'auteur
  // n'était retiré que si le paramètre s'appelait exactement `email=`.
  const CONTACT_LINKS: LinkCase[] = [
    {
      label: 'e-mail en paramètre `mail`',
      url: 'https://www.hotel-exemple.fr/sejour?mail=yanis.dupont%40gmail.com',
    },
    {
      label: 'e-mail en paramètre `e`',
      url: 'https://www.hotel-exemple.fr/sejour?e=yanis.dupont@gmail.com',
    },
    {
      label: 'e-mail dans le chemin',
      url: 'https://www.hotel-exemple.fr/clients/yanis.dupont@gmail.com/sejour',
    },
    {
      label: 'téléphone en paramètre',
      url: 'https://www.hotel-exemple.fr/sejour?tel=%2B33612345678',
    },
  ]
  for (const link of CONTACT_LINKS) {
    it(`retire un lien avec ${link.label}`, async () => {
      expect(await leakedLinks([link])).toEqual([])
    })
  }
})

// ── (a) Notes, prix et dates ──────────────────────────────────────────────────

describe('(a) notes, prix et dates', () => {
  function tripWithNotes(): DayItinerary[] {
    return [
      day(1, {
        notes: 'PRIV-note : digicode 4471, appeler Kenji au 080-3312-4471',
        transport: transport({
          notes: 'PRIV-note-trajet',
          price: SECRET_PRICE,
        }),
      }),
      day(2, { city: 'Kyoto', notes: 'PRIV-note-jour-2' }),
    ]
  }

  it('notes exclues par défaut : ni dans le bucket ni dans les réponses', async () => {
    const { template } = await publish(tripWithNotes())
    expect(template.includesNotes).toBe(false)
    const surfaces = [
      ...(await publicSurfaces(template.id, template.slug, 1)),
      ...bucketSurfaces(),
    ]
    expect(plantedLeaks(surfaces)).toEqual([])
  })

  it.fails(
    'défaut : une mise à jour qui retire les notes ne les laisse pas publiques dans l’ancienne version',
    async () => {
      const { template, ownerToken } = await publish(tripWithNotes(), {
        options: { includeNotes: true, includePrices: true },
      })
      expect(JSON.stringify(template)).toContain('PRIV-note')
      // L'auteur se ravise : notes et prix retirés.
      const updated = await put(
        template.id,
        {
          data: await compressItinerary(tripWithNotes()),
          options: { includeNotes: false, includePrices: false },
        },
        bearer(ownerToken),
      )
      expect(updated.status).toBe(200)
      expect(await (await read(template.id)).text()).not.toContain('PRIV-note')
      // La version 1, publique et en cache CDN, sert encore les notes et le prix.
      const v1 = await (await readVersion(template.id, '1')).text()
      expect(v1).not.toContain('PRIV-note')
      expect(v1).not.toContain('987654')
    },
  )

  it.fails(
    'défaut : les réponses publiques ne donnent pas les dates exactes d’un voyage à venir',
    async () => {
      // Voyage préparé, pas encore fait (spec §2 : « ou l'a préparé »).
      const { template } = await publish([
        day(1, {
          date: '2027-04-03',
          accommodation: hotel({
            checkIn: '2027-04-03T15:00',
            checkOut: '2027-04-05T11:00',
          }),
        }),
        day(2, {
          date: '2027-04-04',
          transport: transport({ departureTime: '2027-04-04T09:12' }),
        }),
      ])
      expect(template.listed).toBe(true)
      expect(template.tripYear).toBe(2027)
      for (const s of await publicSurfaces(template.id, template.slug, 1)) {
        // Les maquettes B2 et C1 n'affichent que « avr. 2027 ».
        expect(s.text, s.name).not.toMatch(/2027-04-0[345]/)
      }
    },
  )
})

// ── (b) Jeton propriétaire ────────────────────────────────────────────────────

describe('(b) jeton propriétaire', () => {
  it('n’apparaît que dans la réponse 201 ; l’empreinte jamais ; le bucket ne garde que l’empreinte', async () => {
    const published = await publish()
    const { id, slug } = published.template
    const token = published.ownerToken
    const hash = createHash('sha256').update(token).digest('hex')
    expect(published.text).toContain(token)
    expect(published.text).not.toContain(hash)
    expect(published.text).not.toContain('ownerTokenHash')

    const surfaces = [
      await surface(
        'PUT',
        await put(
          id,
          { data: await compressItinerary(twoDays()) },
          bearer(token),
        ),
      ),
      await surface(
        'PATCH',
        await patch(id, { authorName: 'Léa' }, bearer(token)),
      ),
      ...(await publicSurfaces(id, slug, 2)),
      await surface('DELETE', await remove(id, bearer(token))),
      ...(await publicSurfaces(id, slug, 2)),
    ]
    expect(surfaces.map((s) => s.status)).toEqual([
      200, 200, 200, 200, 200, 200, 200, 200, 410, 410, 200, 410, 410,
    ])
    for (const s of surfaces) {
      expect(s.text, s.name).not.toContain(token)
      expect(s.text, s.name).not.toContain(hash)
      expect(s.text, s.name).not.toContain('ownerToken')
    }
    for (const s of bucketSurfaces())
      expect(s.text, s.name).not.toContain(token)
    expect(bucket.peek(templateMetaKey(id))).toMatchObject({
      ownerTokenHash: hash,
    })
  })

  it('les réglages de publication et la réponse de lecture ne portent ni jeton ni empreinte', async () => {
    const { template, ownerToken } = await publish()
    const index = await (await getIndex()).text()
    const meta = await (await read(template.id)).text()
    for (const text of [index, meta]) {
      expect(text).not.toContain(ownerToken)
      expect(text).not.toMatch(/ownerToken|retiredAt|[0-9a-f]{64}/)
    }
  })

  describe('en-têtes refusés (401, même message, rien n’est lu ni écrit)', () => {
    const headers: [string, (token: string) => Record<string, string>][] = [
      ['sans en-tête', () => ({})],
      ['« Bearer » seul', () => ({ Authorization: 'Bearer' })],
      ['« Bearer » et une espace', () => ({ Authorization: 'Bearer ' })],
      ['schéma Basic', (t) => ({ Authorization: `Basic ${t}` })],
      ['schéma Token', (t) => ({ Authorization: `Token ${t}` })],
      ['jeton nu', (t) => ({ Authorization: t })],
      ['un caractère en trop', (t) => ({ Authorization: `Bearer ${t}x` })],
      [
        'un caractère en moins',
        (t) => ({ Authorization: `Bearer ${t.slice(1)}` }),
      ],
      ['deux jetons', (t) => ({ Authorization: `Bearer ${t} ${t}` })],
      ['deux en-têtes', (t) => ({ Authorization: `Bearer ${t}, Bearer ${t}` })],
      [
        'jeton en base64 standard',
        (t) => ({ Authorization: `Bearer ${t.replace(/[-_]/g, '+')}+` }),
      ],
      [
        'démesuré (64 Kio)',
        () => ({ Authorization: `Bearer ${'A'.repeat(65_536)}` }),
      ],
      [
        'caractères non ASCII',
        () => ({ Authorization: `Bearer ${'é'.repeat(43)}` }),
      ],
    ]

    it.each(headers)('%s', async (_label, build) => {
      const { template, ownerToken } = await publish()
      const id = template.id
      const metaBefore = JSON.stringify(bucket.peek(templateMetaKey(id)))
      const writesBefore = bucket.puts.length
      vi.mocked(getTemplateStore).mockClear()

      const responses = [
        await put(
          id,
          { data: await compressItinerary(twoDays()) },
          build(ownerToken),
        ),
        await patch(id, { indexable: false }, build(ownerToken)),
        await remove(id, build(ownerToken)),
      ]
      for (const response of responses) {
        expect(response.status).toBe(401)
        expect(response.headers.get('Cache-Control')).toBe(NO_STORE)
        expect(await response.json()).toEqual({ error: NOT_ALLOWED })
      }
      // Refusé avant le bucket
      expect(getTemplateStore).not.toHaveBeenCalled()
      expect(bucket.puts.length).toBe(writesBefore)
      expect(JSON.stringify(bucket.peek(templateMetaKey(id)))).toBe(metaBefore)
    })
  })

  it('accepte le schéma sans tenir compte de la casse (RFC 9110)', async () => {
    const { template, ownerToken } = await publish()
    const response = await patch(
      template.id,
      { authorName: 'Léa' },
      { Authorization: `bEaReR   ${ownerToken}  ` },
    )
    expect(response.status).toBe(200)
  })

  it('refuse le jeton d’un autre modèle (403, même message) sans rien écrire', async () => {
    const victim = await publish()
    const attacker = await publish()
    const id = victim.template.id
    const metaBefore = JSON.stringify(bucket.peek(templateMetaKey(id)))
    const keysBefore = bucket.keys()
    const writesBefore = bucket.puts.length

    const responses = [
      await put(
        id,
        { data: await compressItinerary(twoDays()) },
        bearer(attacker.ownerToken),
      ),
      await patch(id, { indexable: false }, bearer(attacker.ownerToken)),
      await remove(id, bearer(attacker.ownerToken)),
    ]
    for (const response of responses) {
      expect(response.status).toBe(403)
      expect(response.headers.get('Cache-Control')).toBe(NO_STORE)
      expect(await response.json()).toEqual({ error: NOT_ALLOWED })
    }
    expect(bucket.puts.length).toBe(writesBefore)
    expect(bucket.keys()).toEqual(keysBefore)
    expect(JSON.stringify(bucket.peek(templateMetaKey(id)))).toBe(metaBefore)
    expect((await read(id)).status).toBe(200)
  })

  it('ignore un jeton passé dans l’adresse ou dans le corps', async () => {
    const { template, ownerToken } = await publish()
    const id = template.id
    const query = `?token=${ownerToken}&ownerToken=${ownerToken}&access_token=${ownerToken}`
    const inBody = {
      ownerToken,
      token: ownerToken,
      authorization: `Bearer ${ownerToken}`,
    }
    const responses = [
      await PUT(
        jsonRequest(`/api/templates/${id}${query}`, 'PUT', {
          ...inBody,
          data: await compressItinerary(twoDays()),
        }),
        idContext(id),
      ),
      await PATCH(
        jsonRequest(`/api/templates/${id}${query}`, 'PATCH', {
          ...inBody,
          indexable: false,
        }),
        idContext(id),
      ),
      await remove(id, {}, query),
    ]
    expect(responses.map((r) => r.status)).toEqual([401, 401, 401])
    expect((await read(id)).status).toBe(200)
    expect((await (await read(id)).json()).template.listed).toBe(true)
  })

  it('compare les empreintes en temps constant (`timingSafeEqual`)', async () => {
    const { template, ownerToken } = await publish()
    const other = await publish()
    vi.mocked(timingSafeEqual).mockClear()

    expect(
      (await patch(template.id, { indexable: false }, bearer(other.ownerToken)))
        .status,
    ).toBe(403)
    expect(timingSafeEqual).toHaveBeenCalled()
    for (const [a, b] of vi.mocked(timingSafeEqual).mock.calls) {
      // Deux empreintes SHA-256, jamais le jeton lui-même
      expect((a as Buffer).length).toBe(32)
      expect((b as Buffer).length).toBe(32)
    }

    vi.mocked(timingSafeEqual).mockClear()
    expect((await remove(template.id, bearer(ownerToken))).status).toBe(200)
    expect(timingSafeEqual).toHaveBeenCalled()
  })

  it('ne journalise jamais le jeton, même sur les pannes', async () => {
    const { template, ownerToken } = await publish()
    const id = template.id
    const other = await publish()

    // Pannes : lecture R2, index qui ne suit pas un retrait, écriture refusée.
    const getSpy = vi
      .spyOn(bucket, 'getSnapshot')
      .mockRejectedValueOnce(new Error('R2 indisponible'))
    expect(
      (await patch(id, { indexable: false }, bearer(ownerToken))).status,
    ).toBe(500)
    getSpy.mockRestore()

    bucket.beforePut = (key) => {
      if (isTemplateIndexKey(key)) throw new Error('index indisponible')
    }
    expect(
      (await remove(other.template.id, bearer(other.ownerToken))).status,
    ).toBe(503)
    bucket.beforePut = (key) => {
      if (key.endsWith('/v/2')) throw new Error('écriture refusée')
    }
    expect(
      (
        await put(
          id,
          { data: await compressItinerary(twoDays()) },
          bearer(ownerToken),
        )
      ).status,
    ).toBe(500)
    bucket.beforePut = null
    expect((await remove(id, bearer(ownerToken))).status).toBe(200)

    const logged = consoleMethods.flatMap((method) =>
      vi
        .mocked(console[method])
        .mock.calls.map((args) =>
          args
            .map((arg) =>
              arg instanceof Error
                ? `${arg.message}\n${arg.stack}\n${inspect(arg, { depth: 8 })}`
                : inspect(arg, { depth: 8 }),
            )
            .join(' '),
        ),
    )
    expect(logged.length).toBeGreaterThan(0)
    for (const line of logged) {
      expect(line).not.toContain(ownerToken)
      expect(line).not.toContain(other.ownerToken)
    }
  })
})

// ── (c) Énumération et moissonnage ────────────────────────────────────────────

describe('(c) énumération', () => {
  async function notFoundShape(slug: string) {
    const response = await readBySlug(slug)
    return {
      status: response.status,
      cacheControl: response.headers.get('Cache-Control'),
      body: await response.text(),
    }
  }

  it('par le slug, un modèle non listé ou retiré sans avoir été listé ressemble à un slug inconnu', async () => {
    const unknown = await notFoundShape('japon-2-jours-tokyo-kyoto')

    const linkOnly = await publish(twoDays(), { indexable: false })
    const oneDay = await publish([day(1, { city: 'Nara' })])
    const retired = await publish(
      [day(1, { city: 'Nikko' }), day(2, { city: 'Nikko' })],
      { indexable: false },
    )
    expect(
      (await remove(retired.template.id, bearer(retired.ownerToken))).status,
    ).toBe(200)

    for (const slug of [
      linkOnly.template.slug,
      oneDay.template.slug,
      retired.template.slug,
    ]) {
      expect(await notFoundShape(slug)).toEqual(unknown)
    }
    expect(unknown.status).toBe(404)
    expect(unknown.cacheControl).toBe(NO_STORE)
    // Un slug malformé non plus ne dit rien de plus.
    expect(await notFoundShape('JAPON-2-jours')).toEqual(unknown)
    // L'index ne liste aucun d'eux.
    expect(await (await getIndex()).json()).toEqual({ entries: [] })
  })

  it('un modèle listé puis retiré répond 410 par son slug (page à sortir des moteurs)', async () => {
    const { template, ownerToken } = await publish()
    expect((await remove(template.id, bearer(ownerToken))).status).toBe(200)
    const response = await readBySlug(template.slug)
    expect(response.status).toBe(410)
    expect(await response.json()).toEqual({
      status: 'retired',
      error: 'Ce modèle a été retiré.',
    })
  })

  it('par l’id, inconnu et malformé répondent pareil, sans dire lequel', async () => {
    const shapes = []
    for (const id of ['0000000000000000', 'ZZZ', '../index', 'index']) {
      const response = await read(id)
      shapes.push({
        status: response.status,
        cacheControl: response.headers.get('Cache-Control'),
        body: await response.text(),
      })
    }
    expect(new Set(shapes.map((s) => JSON.stringify(s))).size).toBe(1)
    expect(shapes[0].status).toBe(404)
  })

  it('les ids sont tirés uniformément dans l’alphabet de Crockford, 16 caractères', async () => {
    const ids = Array.from({ length: 4000 }, createTemplateId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every(isTemplateId)).toBe(true)
    expect(TEMPLATE_ID_ALPHABET).toHaveLength(32)
    expect(TEMPLATE_ID_LENGTH * 5).toBeGreaterThanOrEqual(80)
    // Chaque symbole apparaît, à chaque position, sans biais grossier.
    for (let position = 0; position < TEMPLATE_ID_LENGTH; position++) {
      const counts = new Map<string, number>()
      for (const id of ids) {
        counts.set(id[position], (counts.get(id[position]) ?? 0) + 1)
      }
      expect(counts.size).toBe(32)
      // Espérance 125 par symbole ; 60 serait à plus de 6 écarts-types.
      expect(Math.min(...counts.values())).toBeGreaterThan(60)
    }
    // Les ids rendus par l'API ont la même forme.
    const { template } = await publish()
    expect(isTemplateId(template.id)).toBe(true)
  })

  it.fails(
    'défaut : publier le même parcours ne révèle pas qu’un modèle « lien seulement » ou retiré l’occupe',
    async () => {
      // Sans la victime : le slug qu'obtient la sonde.
      const alone = await publish(twoDays())
      const baseline = alone.template.slug
      bucket.reset()

      // La victime publie en « lien seulement » ; le slug ne répond pas.
      const victim = await publish(twoDays(), { indexable: false })
      expect((await readBySlug(victim.template.slug)).status).toBe(404)

      // La sonde publie le même pays, la même durée, les mêmes villes.
      const probe = await publish(twoDays())
      const own = (t: Published['template']) =>
        t.slug.replace(new RegExp(`-(${t.id}|${t.id.slice(0, 6)})$`), '')
      // Attendu : rien ne distingue cette réponse de celle d'un bucket vide.
      expect(own(probe.template)).toBe(baseline)
    },
  )
})

// ── (d) Contenu injecté ───────────────────────────────────────────────────────

describe('(d) contenu injecté que les pages SEO afficheront', () => {
  const SCRIPT = '<script>alert("xss")</script>'
  const ONERROR = '"><img src=x onerror=alert(1)>'

  it('stocke le texte tel quel (le rendu doit échapper) et filtre les URL', async () => {
    const quotedUrl = 'https://hotel.example/"><script>alert(1)</script>'
    const quotedImage = 'https://img.example/x.jpg" onerror="alert(1)'
    const { template } = await publish(
      [
        day(1, {
          city: `Tokyo ${SCRIPT}`,
          title: `Jour ${ONERROR}`,
          tips: [`javascript:alert(1)`],
          images: [
            { url: 'javascript:alert(1)//.jpg', caption: SCRIPT },
            { url: quotedImage, caption: ONERROR },
          ],
          accommodation: hotel({
            name: SCRIPT,
            bookingUrl: 'javascript:alert(1)',
            images: [
              'JAVASCRIPT:alert(1)',
              'data:image/svg+xml,<svg onload=alert(1)>',
            ],
          }),
          transport: transport({ bookingUrl: quotedUrl, details: ONERROR }),
          activities: [
            activity({
              name: 'javascript:alert(1)',
              description: `<a href="javascript:alert(1)">clic</a>`,
              bookingUrl: 'jAvAsCrIpT:alert(1)',
              images: ['vbscript:msgbox(1)', 'https://img.example/ok.jpg'],
            }),
          ],
        }),
        day(2, { city: 'Kyoto' }),
      ],
      {
        title: `Japon ${SCRIPT}`,
        authorName: `Yanis ${ONERROR}`,
      },
    )
    // Le slug ne garde que [a-z0-9-] ; le pays est un code ISO.
    expect(template.slug).toMatch(/^[a-z0-9-]+$/)
    expect(template.slug).toBe(
      'japon-2-jours-tokyo-script-alert-xss-script-kyoto',
    )
    expect(template.country).toBe('JP')

    const bySlug = (await (await readBySlug(template.slug)).json()).template
    // Texte : stocké et renvoyé tel quel (documenté : à échapper au rendu).
    expect(bySlug.title).toBe(`Japon ${SCRIPT}`)
    expect(bySlug.authorName).toBe(`Yanis ${ONERROR}`)
    expect(bySlug.cities).toEqual([`Tokyo ${SCRIPT}`, 'Kyoto'])
    const [first] = bySlug.itinerary as DayItinerary[]
    expect(first.title).toBe(`Jour ${ONERROR}`)
    expect(first.accommodation?.name).toBe(SCRIPT)
    expect(first.activities[0].name).toBe('javascript:alert(1)')

    // URL : seules les http(s) restent, telles que saisies (non normalisées).
    expect(first.accommodation?.bookingUrl).toBe('')
    expect(first.accommodation).not.toHaveProperty('images')
    expect(first.activities[0]).not.toHaveProperty('bookingUrl')
    expect(first.activities[0].images).toEqual(['https://img.example/ok.jpg'])
    expect(first.images).toEqual([{ url: quotedImage, caption: ONERROR }])
    expect(first.transport?.bookingUrl).toBe(quotedUrl)

    const index = (await (await getIndex()).json()).entries
    expect(index[0].title).toBe(`Japon ${SCRIPT}`)
    // Un schéma dangereux ne reste que dans du texte libre (nom d'activité,
    // conseil), jamais dans un champ d'URL, ni dans le bucket ni en réponse.
    const surfaces = [
      ...(await publicSurfaces(template.id, template.slug, 1)),
      ...bucketSurfaces(),
    ]
    const schemes = surfaces.flatMap((s) =>
      allStrings(JSON.parse(s.text)).filter((text) =>
        /^\s*(?:java|vb)script:|^\s*(?:data|blob|file):/i.test(text),
      ),
    )
    expect(new Set(schemes)).toEqual(new Set(['javascript:alert(1)']))
  })
})

// ── (e) Cache ─────────────────────────────────────────────────────────────────

describe('(e) Cache-Control de chaque réponse', () => {
  it('aucune erreur, aucune réponse au propriétaire, aucune écriture en cache public', async () => {
    const rows: string[] = []
    const note = (label: string, response: Response) =>
      rows.push(
        `${label} → ${response.status} ${response.headers.get('Cache-Control')}${
          response.headers.get('Set-Cookie') ? ' + cookie' : ''
        }`,
      )

    // Publication
    const response201 = await POST(
      jsonRequest('/api/templates', 'POST', {
        data: await compressItinerary(twoDays()),
        country: 'JP',
      }),
    )
    note('POST', response201)
    const { template, ownerToken } = await response201.json()
    const id: string = template.id
    note(
      'POST corps illisible',
      await POST(jsonRequest('/api/templates', 'POST', 'x')),
    )
    note(
      'POST trop gros',
      await POST(
        new Request('http://localhost/api/templates', {
          method: 'POST',
          body: '{}',
          headers: {
            'Content-Length': String(10 * 1024 * 1024),
            'X-Forwarded-For': clientIp(),
          },
        }),
      ),
    )
    let limited: Response | null = null
    for (let i = 0; i < 11; i++) {
      limited = await POST(
        new Request('http://localhost/api/templates', {
          method: 'POST',
          body: '{}',
          headers: { 'X-Forwarded-For': '192.0.2.250' },
        }),
      )
    }
    note('POST limité', limited!)
    vi.mocked(getTemplateStore).mockImplementationOnce(() => {
      throw new Error('R2_ACCOUNT_ID manquant')
    })
    note(
      'POST non configuré',
      await POST(
        jsonRequest('/api/templates', 'POST', {
          data: await compressItinerary(twoDays()),
          country: 'JP',
        }),
      ),
    )
    bucket.beforePut = () => {
      throw new Error('R2 indisponible')
    }
    note(
      'POST panne',
      await POST(
        jsonRequest('/api/templates', 'POST', {
          data: await compressItinerary(twoDays()),
          country: 'JP',
        }),
      ),
    )
    bucket.beforePut = null

    // Lectures
    note('GET id', await read(id))
    note('GET id inconnu', await read('0000000000000000'))
    note('GET v/1', await readVersion(id, '1'))
    note('GET v/9', await readVersion(id, '9'))
    note('GET v/0', await readVersion(id, '0'))
    note('GET slug', await readBySlug(template.slug))
    note('GET slug inconnu', await readBySlug('japon-9-jours'))
    note('GET index', await getIndex())

    // Écritures du propriétaire
    const data = await compressItinerary(twoDays())
    note('PUT', await put(id, { data }, bearer(ownerToken)))
    note('PUT sans jeton', await put(id, { data }, {}))
    note('PUT mauvais jeton', await put(id, { data }, bearer('B'.repeat(43))))
    note(
      'PUT id inconnu',
      await put('0000000000000000', { data }, bearer(ownerToken)),
    )
    note(
      'PUT corps illisible',
      await put(id, { data: 'x' }, bearer(ownerToken)),
    )
    note('PATCH', await patch(id, { authorName: 'Léa' }, bearer(ownerToken)))
    note('PATCH vide', await patch(id, {}, bearer(ownerToken)))
    bucket.beforePut = (key) => {
      if (isTemplateIndexKey(key)) throw new Error('index indisponible')
    }
    note(
      'PATCH masquer, index en panne',
      await patch(id, { indexable: false }, bearer(ownerToken)),
    )
    note('DELETE, index en panne', await remove(id, bearer(ownerToken)))
    bucket.beforePut = null
    note('DELETE', await remove(id, bearer(ownerToken)))
    note('DELETE rejoué', await remove(id, bearer(ownerToken)))
    const listed = await publish(twoDays(), { title: 'Listé' })
    expect(
      (await remove(listed.template.id, bearer(listed.ownerToken))).status,
    ).toBe(200)

    // Après le retrait
    note('GET id retiré', await read(id))
    note('GET v/1 retiré', await readVersion(id, '1'))
    // Masqué juste avant son retrait : il n'a plus de page.
    note('GET slug retiré non listé', await readBySlug(template.slug))
    note('GET slug retiré listé', await readBySlug(listed.template.slug))
    note('PUT retiré', await put(id, { data }, bearer(ownerToken)))
    note(
      'PATCH retiré',
      await patch(id, { indexable: true }, bearer(ownerToken)),
    )

    // Pannes de lecture : rien d'illisible en cache
    const other = await publish(twoDays(), { title: 'Autre' })
    bucket.poke(templateVersionKey(other.template.id, 1), { illisible: true })
    note('GET v/1 illisible', await readVersion(other.template.id, '1'))
    note('GET id illisible', await read(other.template.id))
    bucket.poke(templateMetaKey(other.template.id), { illisible: true })
    note('GET slug méta illisible', await readBySlug(other.template.slug))
    bucket.poke(templateIndexKey(other.template.id), { illisible: true })
    note('GET index illisible', await getIndex())

    expect(rows).toEqual([
      `POST → 201 ${NO_STORE}`,
      `POST corps illisible → 400 ${NO_STORE}`,
      `POST trop gros → 413 ${NO_STORE}`,
      `POST limité → 429 ${NO_STORE}`,
      `POST non configuré → 503 ${NO_STORE}`,
      `POST panne → 500 ${NO_STORE}`,
      `GET id → 200 ${NO_STORE}`,
      `GET id inconnu → 404 ${NO_STORE}`,
      `GET v/1 → 200 ${VERSION_CACHE}`,
      `GET v/9 → 404 ${NO_STORE}`,
      `GET v/0 → 404 ${NO_STORE}`,
      `GET slug → 200 ${LISTING_CACHE}`,
      `GET slug inconnu → 404 ${NO_STORE}`,
      `GET index → 200 ${LISTING_CACHE}`,
      `PUT → 200 ${NO_STORE}`,
      `PUT sans jeton → 401 ${NO_STORE}`,
      `PUT mauvais jeton → 403 ${NO_STORE}`,
      `PUT id inconnu → 404 ${NO_STORE}`,
      `PUT corps illisible → 400 ${NO_STORE}`,
      `PATCH → 200 ${NO_STORE}`,
      `PATCH vide → 400 ${NO_STORE}`,
      `PATCH masquer, index en panne → 503 ${NO_STORE}`,
      `DELETE, index en panne → 503 ${NO_STORE}`,
      `DELETE → 200 ${NO_STORE}`,
      `DELETE rejoué → 200 ${NO_STORE}`,
      `GET id retiré → 410 ${NO_STORE}`,
      // Une minute de cache, sans rallonge : voulu (design §5).
      `GET v/1 retiré → 410 ${VERSION_CACHE}`,
      `GET slug retiré non listé → 404 ${NO_STORE}`,
      // Le site vitrine garde le 410 en cache : voulu (design §5).
      `GET slug retiré listé → 410 ${LISTING_CACHE}`,
      `PUT retiré → 410 ${NO_STORE}`,
      `PATCH retiré → 410 ${NO_STORE}`,
      `GET v/1 illisible → 500 ${NO_STORE}`,
      `GET id illisible → 500 ${NO_STORE}`,
      `GET slug méta illisible → 500 ${NO_STORE}`,
      `GET index illisible → 500 ${NO_STORE}`,
    ])
  })
})

// ── (f) Abus de ressources ────────────────────────────────────────────────────

/** Un itinéraire valable dont une clé ignorée cache `depth` tableaux imbriqués. */
function deeplyNested(depth: number): string {
  const placeholder = 'PLACEHOLDER-PROFONDEUR'
  const bytes = Buffer.from(encode([{ ...day(1), extra: placeholder }]))
  const marker = Buffer.from(encode(placeholder))
  const at = bytes.indexOf(marker)
  // 0x91 : tableau d'un élément ; 0xc0 : nil, au fond.
  const deep = Buffer.concat([Buffer.alloc(depth, 0x91), Buffer.from([0xc0])])
  return compressedBytes(
    Buffer.concat([
      bytes.subarray(0, at),
      deep,
      bytes.subarray(at + marker.length),
    ]),
  )
}

async function publishStatus(data: string): Promise<number> {
  const response = await POST(
    jsonRequest('/api/templates', 'POST', { data, country: 'JP' }),
  )
  return response.status
}

describe('(f) abus de ressources', () => {
  it('refuse un Content-Length démesuré sans lire le corps', async () => {
    const request = new Request('http://localhost/api/templates', {
      method: 'POST',
      body: '{"data":"x"}',
      headers: {
        'Content-Length': String(50 * 1024 * 1024),
        'X-Forwarded-For': clientIp(),
      },
    })
    const response = await POST(request)
    expect(response.status).toBe(413)
    expect(request.bodyUsed).toBe(false)
    expect(bucket.keys()).toEqual([])
  })

  it('borne le payload, la décompression, les journées, les activités, les chaînes, les clés et les listes', async () => {
    const statuses = {
      payload: await publishStatus('A'.repeat(2 * 1024 * 1024 + 1)),
      bombe: await publishStatus(compressedZeros(64 * 1024 * 1024)),
      journees: await publishStatus(
        rawData(Array.from({ length: 181 }, (_, i) => day(i + 1))),
      ),
      activites: await publishStatus(
        rawData([
          day(1, {
            activities: Array.from({ length: 101 }, (_, i) =>
              activity({ id: `a-${i}` }),
            ),
          }),
        ]),
      ),
      chaine: await publishStatus(
        rawData([day(1, { title: 'x'.repeat(32 * 1024 + 1) })]),
      ),
      cles: await publishStatus(
        rawData([
          {
            ...day(1),
            ...Object.fromEntries(
              Array.from({ length: 70 }, (_, i) => [`k${i}`, i]),
            ),
          },
        ]),
      ),
      liste: await publishStatus(
        rawData([
          day(1, { tips: Array.from({ length: 1000 }, (_, i) => `t${i}`) }),
        ]),
      ),
    }
    expect(statuses).toEqual({
      payload: 413,
      bombe: 413,
      journees: 413,
      activites: 413,
      chaine: 413,
      cles: 413,
      liste: 413,
    })
    expect(bucket.keys()).toEqual([])
  })

  it('borne les villes et le titre de la méta et de l’index', async () => {
    const long = 'Ville'.repeat(40)
    const days = Array.from({ length: 14 }, (_, i) =>
      day(i + 1, { city: `${i}-${long}` }),
    )
    const { template } = await publish(days, { title: 'T'.repeat(5000) })
    const entry = (await (await getIndex()).json()).entries[0]
    for (const cities of [template.cities as string[], entry.cities]) {
      expect(cities).toHaveLength(10)
      expect(
        Math.max(...cities.map((c: string) => c.length)),
      ).toBeLessThanOrEqual(80)
    }
    expect(entry.title).toHaveLength(120)
  })

  it('refuse une imbrication profonde cachée dans une clé ignorée', async () => {
    // 200 000 niveaux tiennent dans 400 octets compressés. À 2 Mio (la borne
    // décompressée), une requête de 2,9 Ko coûte ~340 Mo de tas et ~0,7 s de
    // CPU sous Node 22 ; un vrai voyage ne dépasse pas 5 niveaux.
    const data = deeplyNested(200_000)
    expect(data.length).toBeLessThan(1000)
    expect(await publishStatus(data)).toBe(413)
    expect(bucket.keys()).toEqual([])
    // Un voyage réel (5 niveaux) passe toujours : 8 niveaux sont permis.
    expect(await publishStatus(deeplyNested(6))).toBe(201)
    expect(await publishStatus(deeplyNested(7))).toBe(413)
  })

  it('un modèle listé entre dans l’index même après des centaines de modèles de remplissage', async () => {
    // Échelle réduite : le faux bucket compte le JSON brut, R2 le gzip
    // (4 Mio). Avec 120 caractères de titre et 10 villes de 80 caractères
    // peu compressibles, une entrée pèse ~2,4 Ko gzippés : ~1 800
    // publications suffisaient à boucher l'index unique, soit ~3 h à 10 par
    // minute depuis une IP. Découpé en 32 morceaux (premier caractère de
    // l'id, tiré au hasard), il en faut 32 fois plus ; un morceau plein lève
    // une alerte et l'opérateur rattrape le modèle resté dehors
    // (template-store.test.ts › index en morceaux).
    bucket.maxSize = 12_000
    const noise = (seed: number) =>
      Array.from({ length: 80 }, (_, i) =>
        String.fromCharCode(97 + ((seed * 7919 + i * 104729) % 26)),
      ).join('')
    for (let n = 0; n < 15; n++) {
      await publish(
        Array.from({ length: 10 }, (_, i) =>
          day(i + 1, { city: noise(n * 10 + i) }),
        ),
        {
          title: noise(1000 + n)
            .repeat(2)
            .slice(0, 120),
        },
      )
    }
    // Puis de petits modèles comblent la place restante, jusqu'au refus.
    const indexIds = async (): Promise<string[]> =>
      (await (await getIndex()).json()).entries.map(
        (entry: { id: string }) => entry.id,
      )
    for (let n = 0; n < 40; n++) {
      const filler = await publish(twoDays(), { title: `Remplissage ${n}` })
      if (!(await indexIds()).includes(filler.template.id)) break
    }
    const legit = await publish(twoDays(), { title: 'Japon en deux jours' })
    expect(legit.template.listed).toBe(true)
    // Spec §4.3 : un modèle listé entre dans le sitemap.
    expect(await indexIds()).toContain(legit.template.id)
  })
})

// ── (g) Effacement au retrait ─────────────────────────────────────────────────

describe('(g) retrait : il ne reste que la pierre tombale et le slug', () => {
  /** Douze villes : seules les trois premières vont dans le slug. */
  function authoredTrip(marker: string): DayItinerary[] {
    const cities = [
      'Tokyo',
      'Kyoto',
      'Osaka',
      ...Array.from({ length: 9 }, (_, i) => `PRIV-ville-${i + 4}`),
    ]
    return cities.map((city, i) =>
      day(i + 1, {
        city,
        title: `PRIV-titre-jour-${i + 1}`,
        notes: `PRIV-note-${marker}`,
        activities: [
          activity({ id: `a-${i}`, name: `PRIV-activite-${marker}` }),
        ],
        accommodation: hotel({ name: `PRIV-hotel-${marker}` }),
      }),
    )
  }

  const TOMBSTONE_KEYS = [
    'id',
    'ownerTokenHash',
    'publishedAt',
    'retiredAt',
    'slug',
    'version',
    'wasListed',
  ]

  it('par l’auteur, après mises à jour et changement de prénom', async () => {
    const { template, ownerToken } = await publish(authoredTrip('v1'), {
      title: 'PRIV-titre-modele',
      authorName: 'PRIV-prenom',
      options: { includeNotes: true, includePrices: true },
    })
    const { id, slug } = template
    expect(slug).toBe('japon-12-jours-tokyo-kyoto-osaka')
    const neighbour = await publish(twoDays(), { title: 'Voisin' })

    expect(
      (
        await put(
          id,
          {
            data: await compressItinerary(authoredTrip('v2')),
            title: 'PRIV-titre-v2',
          },
          bearer(ownerToken),
        )
      ).status,
    ).toBe(200)
    expect(
      (await patch(id, { authorName: 'PRIV-prenom-2' }, bearer(ownerToken)))
        .status,
    ).toBe(200)
    expect((await remove(id, bearer(ownerToken))).status).toBe(200)

    const own = bucket
      .keys()
      .filter(
        (key) => key.startsWith(`${id}/`) || key === templateSlugKey(slug),
      )
    expect(own.sort()).toEqual(
      [templateMetaKey(id), templateSlugKey(slug)].sort(),
    )
    expect(
      Object.keys(bucket.peek(templateMetaKey(id)) as object).sort(),
    ).toEqual(TOMBSTONE_KEYS)
    expect(bucket.peek(templateSlugKey(slug))).toEqual({ id })
    expect(
      TEMPLATE_INDEX_KEYS.flatMap(
        (key) =>
          (bucket.peek(key) as { entries: { id: string }[] } | undefined)
            ?.entries ?? [],
      ).map((entry) => entry.id),
    ).toEqual([neighbour.template.id])
    expect(plantedLeaks(bucketSurfaces())).toEqual([])
    expect(plantedLeaks(await publicSurfaces(id, slug, 2))).toEqual([])
    // Le voisin n'a rien perdu.
    expect((await read(neighbour.template.id)).status).toBe(200)
  })

  it('par l’opérateur, à partir du slug', async () => {
    const { template } = await publish(authoredTrip('op'), {
      title: 'PRIV-titre-op',
      authorName: 'PRIV-prenom-op',
    })
    const result = await retireTemplateAsOperator(bucket, template.slug)
    expect(result).toMatchObject({ id: template.id, wasListed: true })
    expect(plantedLeaks(bucketSurfaces())).toEqual([])
    expect(await readTemplateForOperator(bucket, template.id)).toMatchObject({
      status: 'retired',
      inIndex: false,
      versionsLeft: 0,
    })
  })

  it('masquer le modèle retire son titre et ses villes de l’index public', async () => {
    const { template, ownerToken } = await publish(authoredTrip('masque'), {
      title: 'PRIV-titre-masque',
    })
    const shard = templateIndexKey(template.id)
    expect(JSON.stringify(bucket.peek(shard))).toContain('PRIV')
    expect(
      (await patch(template.id, { indexable: false }, bearer(ownerToken)))
        .status,
    ).toBe(200)
    expect(JSON.stringify(bucket.peek(shard))).not.toContain('PRIV')
    expect(await (await getIndex()).text()).not.toContain('PRIV')
  })

  it('une mise à jour concurrente ne laisse pas de version dans R2 après un retrait réussi', async () => {
    const { template, ownerToken } = await publish(authoredTrip('course'))
    const id = template.id
    const realPut = bucket.putSnapshot.bind(bucket)
    let retiredStatus = 0
    const spy = vi
      .spyOn(bucket, 'putSnapshot')
      .mockImplementation(async (key, data, options) => {
        if (key === templateVersionKey(id, 2) && retiredStatus === 0) {
          // L'auteur retire le modèle depuis un autre appareil pendant que
          // la mise à jour prépare sa version 2.
          retiredStatus = (await remove(id, bearer(ownerToken))).status
        } else if (
          key === templateMetaKey(id) &&
          (data as { version?: number }).version === 2
        ) {
          // Puis l'écriture de la méta de la mise à jour se perd (réseau).
          throw new Error('ECONNRESET')
        }
        return realPut(key, data, options)
      })
    const updated = await put(
      id,
      { data: await compressItinerary(authoredTrip('course-v2')) },
      bearer(ownerToken),
    )
    spy.mockRestore()
    expect(retiredStatus).toBe(200)
    // La mise à jour voit le retrait en relisant la méta après sa version :
    // elle efface celle-ci et répond « retiré ».
    expect(updated.status).toBe(410)
    // Attendu : le retrait annoncé réussi n'a laissé aucun contenu.
    expect(bucket.keys().filter((key) => key.startsWith(`${id}/v/`))).toEqual(
      [],
    )
  })
})
