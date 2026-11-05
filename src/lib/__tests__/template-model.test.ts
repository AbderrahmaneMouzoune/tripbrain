import {
  DEFAULT_TEMPLATE_OPTIONS,
  MAX_SLUG_LENGTH,
  MAX_STAY_KEY_LENGTH,
  MAX_TEMPLATE_CITIES,
  MAX_TEMPLATE_CITY_LENGTH,
  MAX_TEMPLATE_PRIVATE_STAYS,
  checkPrivateStays,
  idSuffixedSlug,
  isListed,
  isStayKey,
  isTemplateSlug,
  isTombstone,
  parsePrivateStays,
  privateStayIds,
  slugify,
  stayKey,
  suffixedSlug,
  templateCities,
  templateSlug,
  toIndexEntry,
  toPublicTemplate,
  unmatchedPrivateStays,
  type TemplateMeta,
  type TemplateTombstone,
} from '@/lib/template-model'
import { day } from './helpers/template-fixtures'

function meta(overrides: Partial<TemplateMeta> = {}): TemplateMeta {
  return {
    id: '0123456789abcdef',
    slug: 'japon-3-jours-tokyo-kyoto',
    version: 1,
    title: 'Deux semaines au Japon',
    authorName: 'Yanis',
    country: 'JP',
    indexable: true,
    includesNotes: false,
    includesPrices: true,
    privateStays: [],
    dayCount: 3,
    cities: ['Tokyo', 'Kyoto'],
    tripYear: 2026,
    publishedAt: '2026-11-03T10:00:00.000Z',
    updatedAt: '2026-11-03T10:00:00.000Z',
    retiredAt: null,
    ownerTokenHash: 'a'.repeat(64),
    ...overrides,
  }
}

/** Une journée par ville, dans l'ordre. */
function tour(cities: string[]) {
  return cities.map((city, index) => day(index + 1, { city }))
}

describe('slugify', () => {
  it('retire les accents et sépare les mots par des tirets', () => {
    expect(slugify('Côte d’Ivoire')).toBe('cote-d-ivoire')
    expect(slugify('  São Paulo ! ')).toBe('sao-paulo')
    expect(slugify('Kraków')).toBe('krakow')
  })

  it('translittère les lettres que NFKD ne décompose pas, au lieu de couper le mot', () => {
    expect(slugify('Cœur')).toBe('coeur')
    expect(slugify('Gießen')).toBe('giessen')
    expect(slugify('Đà Nẵng')).toBe('da-nang')
    expect(slugify('Wrocław')).toBe('wroclaw')
    expect(slugify('Łódź')).toBe('lodz')
    expect(slugify('København')).toBe('kobenhavn')
    expect(slugify('Tromsø')).toBe('tromso')
    expect(slugify('Ærø')).toBe('aero')
    expect(slugify('Þingvellir')).toBe('thingvellir')
    expect(slugify('Diyarbakır')).toBe('diyarbakir')
    expect(slugify('Ħamrun')).toBe('hamrun')
  })

  it('ne garde rien d’un nom sans caractère latin', () => {
    expect(slugify('東京')).toBe('')
  })
})

describe('templateSlug', () => {
  it.each([
    [
      'VN',
      10,
      ['Hanoï', 'Đà Nẵng', 'Hội An'],
      'viet-nam-10-jours-hanoi-da-nang-hoi-an',
    ],
    [
      'PL',
      5,
      ['Kraków', 'Wrocław', 'Łódź'],
      'pologne-5-jours-krakow-wroclaw-lodz',
    ],
    ['DK', 4, ['København', 'Aarhus'], 'danemark-4-jours-kobenhavn-aarhus'],
    [
      'JP',
      14,
      ['Tokyo', 'Kyoto', 'Osaka', 'Nara'],
      'japon-14-jours-tokyo-kyoto-osaka',
    ],
    ['JP', 2, ['東京', 'Kyoto'], 'japon-2-jours-kyoto'],
    ['PT', 1, ['Lisbonne'], 'portugal-1-jour-lisbonne'],
    ['PT', 1, [], 'portugal-1-jour'],
  ])('%s, %i jours, %j → %s', (country, dayCount, cities, expected) => {
    const slug = templateSlug({ country, dayCount, cities })
    expect(slug).toBe(expected)
    expect(isTemplateSlug(slug)).toBe(true)
  })
})

describe('isTemplateSlug', () => {
  it.each([
    'portugal-1-jour',
    'portugal-1-jour-lisbonne',
    'portugal-1-jour-lisbonne-2',
    'japon-2-jours',
    'japon-14-jours-tokyo-kyoto-osaka',
    'japon-180-jours-tokyo-k3x9m2',
  ])('reconnaît « %s »', (slug) => {
    expect(isTemplateSlug(slug)).toBe(true)
  })

  it.each([
    'portugal-1-jours-lisbonne',
    'japon-2-jour-kyoto',
    'japon-0-jours',
    'japon-01-jours',
    'japon-11-jour',
    'japon-jours',
    'japon',
    'cote-d-ivoire',
    'Japon-2-jours',
    'japon--2-jours',
  ])('refuse « %s »', (slug) => {
    expect(isTemplateSlug(slug)).toBe(false)
  })
})

describe('idSuffixedSlug', () => {
  const ID = 'k3x9m2abcdefghjk'

  it('ajoute le début de l’id, ou l’id entier', () => {
    expect(idSuffixedSlug('japon-3-jours-tokyo-kyoto', ID)).toBe(
      'japon-3-jours-tokyo-kyoto-k3x9m2',
    )
    expect(idSuffixedSlug('japon-3-jours-tokyo-kyoto', ID, 16)).toBe(
      'japon-3-jours-tokyo-kyoto-k3x9m2abcdefghjk',
    )
  })

  it('reste un slug valide de 80 caractères au plus, sans couper la durée', () => {
    const base = templateSlug({
      country: 'GS',
      dayCount: 180,
      cities: ['Grytviken', 'Stromness Harbour', 'Saint Andrews Bay'],
    })
    expect(base.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH)
    for (const length of [6, 16]) {
      const slug = idSuffixedSlug(base, ID, length)
      expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH)
      expect(isTemplateSlug(slug)).toBe(true)
      expect(slug).toContain('-180-jours')
      expect(slug.endsWith(`-${ID.slice(0, length)}`)).toBe(true)
    }
  })

  it('ne retombe jamais sur un suffixe lisible', () => {
    const base = 'japon-3-jours-tokyo'
    const readable = [1, 2, 3, 4, 5].map((n) => suffixedSlug(base, n))
    expect(readable).not.toContain(idSuffixedSlug(base, ID))
  })
})

describe('templateCities', () => {
  it('garde les villes dans l’ordre du voyage, sans doublon ni vide', () => {
    expect(
      templateCities(tour(['Tokyo', 'tokyo', ' ', 'Kyoto', 'Tokyo'])),
    ).toEqual(['Tokyo', 'Kyoto'])
  })

  it(`garde au plus ${MAX_TEMPLATE_CITIES} villes de ${MAX_TEMPLATE_CITY_LENGTH} caractères`, () => {
    const cities = Array.from({ length: 30 }, (_, index) =>
      index === 0 ? 'Llanfairpwllgwyngyll'.repeat(5) : `Ville ${index}`,
    )
    const kept = templateCities(tour(cities))
    expect(kept).toHaveLength(MAX_TEMPLATE_CITIES)
    expect(kept[0]).toHaveLength(MAX_TEMPLATE_CITY_LENGTH)
    expect(kept.slice(1)).toEqual(cities.slice(1, MAX_TEMPLATE_CITIES))
  })

  it('ne coupe pas un caractère en deux', () => {
    const [city] = templateCities(tour(['🏯'.repeat(100)]))
    expect(Array.from(city)).toHaveLength(MAX_TEMPLATE_CITY_LENGTH)
    expect(city).toBe('🏯'.repeat(MAX_TEMPLATE_CITY_LENGTH))
  })
})

describe('toIndexEntry', () => {
  it('reprend les champs publics de la méta', () => {
    expect(toIndexEntry(meta())).toEqual({
      id: '0123456789abcdef',
      slug: 'japon-3-jours-tokyo-kyoto',
      title: 'Deux semaines au Japon',
      country: 'JP',
      dayCount: 3,
      cities: ['Tokyo', 'Kyoto'],
      updatedAt: '2026-11-03T10:00:00.000Z',
    })
  })

  it('reborne les villes d’une méta écrite avant les bornes', () => {
    const cities = Array.from({ length: 1800 }, (_, index) =>
      `${index}`.padEnd(800, 'x'),
    )
    const entry = toIndexEntry(meta({ cities }))
    expect(entry.cities).toHaveLength(MAX_TEMPLATE_CITIES)
    expect(
      entry.cities.every((city) => city.length === MAX_TEMPLATE_CITY_LENGTH),
    ).toBe(true)
    expect(JSON.stringify(entry).length).toBeLessThan(1500)
  })
})

describe('modèle en ligne ou pierre tombale', () => {
  const tombstone: TemplateTombstone = {
    id: '0123456789abcdef',
    version: 2,
    publishedAt: '2026-11-03T10:00:00.000Z',
    retiredAt: '2026-11-04T08:30:00.000Z',
    ownerTokenHash: 'a'.repeat(64),
    wasListed: true,
  }

  it('distingue une pierre tombale par sa date de retrait', () => {
    expect(isTombstone(meta())).toBe(false)
    expect(isTombstone(tombstone)).toBe(true)
  })

  it('ne garde aucun slug dans la pierre tombale', () => {
    expect(tombstone).not.toHaveProperty('slug')
    // Le type le refuse : un slug dirait le pays, la durée et les villes.
    const withSlug: TemplateTombstone = {
      ...tombstone,
      // @ts-expect-error — `slug` n'appartient pas à `TemplateTombstone`.
      slug: 'japon-3-jours-tokyo-kyoto',
    }
    expect(isTombstone(withSlug)).toBe(true)
  })

  it('ne liste qu’un modèle visible, d’au moins deux jours et en ligne', () => {
    expect(isListed(meta())).toBe(true)
    expect(isListed(meta({ indexable: false }))).toBe(false)
    expect(isListed(meta({ dayCount: 1 }))).toBe(false)
    expect(
      isListed({
        indexable: true,
        dayCount: 3,
        retiredAt: tombstone.retiredAt,
      }),
    ).toBe(false)
  })
})

describe('toPublicTemplate', () => {
  it('ne dit jamais quels hébergements sont des logements privés', () => {
    const template = toPublicTemplate(
      meta({ privateStays: ['cheztantelurdes'] }),
      [],
    )
    expect(template).not.toHaveProperty('privateStays')
    expect(template).not.toHaveProperty('ownerTokenHash')
    expect(template).not.toHaveProperty('retiredAt')
    expect(JSON.stringify(template)).not.toContain('cheztantelurdes')
    expect(template).toMatchObject({ includesPrices: true, listed: true })
  })
})

describe('hébergements privés : clés et réglages', () => {
  it('publie par défaut toutes les adresses', () => {
    expect(DEFAULT_TEMPLATE_OPTIONS.privateStays).toEqual([])
  })

  it('donne la même clé à chaque écriture du même nom', () => {
    const key = stayKey({ id: 'acc-1', name: 'Chez Tante Lurdes' })
    expect(key).toBe('cheztantelurdes')
    for (const name of [
      'chez tante lurdes',
      '  CHEZ   TANTE  LURDES ',
      'Chéz Tânte Lurdes',
      'Chez Tante Lurdes',
      'Ｃｈｅｚ Tante Lurdes',
    ]) {
      expect(stayKey({ id: 'acc-2', name })).toBe(key)
    }
    expect(stayKey({ id: 'acc-3', name: 'Chez Tante Lurdes 2' })).not.toBe(key)
  })

  it('désigne un hébergement sans nom par son id', () => {
    expect(stayKey({ id: 'acc-7', name: '' })).toBe('#acc-7')
    expect(stayKey({ id: 'acc-7', name: ' ​ ' })).toBe('#acc-7')
  })

  it('donne une clé stable, bornée, que la validation accepte', () => {
    for (const name of [
      'İstanbul Evi',
      'ℌaus am See',
      'Ǆungla',
      '東京の家',
      '🏠 Maison',
      'x'.repeat(500),
      `${'🏠'.repeat(150)}`,
    ]) {
      const key = stayKey({ id: 'acc', name })
      expect(key.length).toBeLessThanOrEqual(MAX_STAY_KEY_LENGTH)
      expect(key.isWellFormed()).toBe(true)
      expect(stayKey({ id: 'autre', name: key })).toBe(key)
      expect(isStayKey(key)).toBe(true)
    }
  })

  it('refuse un nom brut, un texte vide ou trop long', () => {
    expect(isStayKey('cheztantelurdes')).toBe(true)
    expect(isStayKey('#acc-7')).toBe(true)
    expect(isStayKey('Chez Tante Lurdes')).toBe(false)
    expect(isStayKey('chez tante')).toBe(false)
    expect(isStayKey('')).toBe(false)
    expect(isStayKey('x'.repeat(MAX_STAY_KEY_LENGTH + 1))).toBe(false)
    expect(isStayKey('\ud83c')).toBe(false)
    expect(isStayKey(42)).toBe(false)
  })

  it('valide une liste reçue : clés valides, sans doublon, bornée', () => {
    expect(parsePrivateStays([])).toEqual([])
    expect(
      parsePrivateStays(['cheztantelurdes', '#acc-7', 'cheztantelurdes']),
    ).toEqual(['cheztantelurdes', '#acc-7'])
    expect(parsePrivateStays(undefined)).toBeNull()
    expect(parsePrivateStays('cheztantelurdes')).toBeNull()
    expect(parsePrivateStays(['Chez Tante Lurdes'])).toBeNull()
    expect(parsePrivateStays([null])).toBeNull()
    expect(
      parsePrivateStays(
        Array.from({ length: MAX_TEMPLATE_PRIVATE_STAYS }, (_, i) => `#${i}`),
      ),
    ).toHaveLength(MAX_TEMPLATE_PRIVATE_STAYS)
    expect(
      parsePrivateStays(
        Array.from(
          { length: MAX_TEMPLATE_PRIVATE_STAYS + 1 },
          (_, i) => `#${i}`,
        ),
      ),
    ).toBeNull()
  })
})

describe('hébergements privés renommés après la publication (A4)', () => {
  const marie = (id: string, name = 'Chez Marie') => ({
    id,
    name,
    address: '12 rue des Lilas, 3e étage',
    bookingUrl: '',
    checkIn: '2026-04-01',
    checkOut: '2026-04-03',
  })
  const published = (name: string) => [
    day(1, { accommodation: marie('acc-marie-1', name) }),
    day(2, { accommodation: marie('acc-marie-2', name) }),
    day(3, {
      accommodation: {
        ...marie('acc-hotel'),
        name: 'Hotel Gracery',
        address: '',
      },
    }),
  ]

  it('retient les ids des hébergements masqués, une fois chacun', () => {
    expect(privateStayIds(published('Chez Marie'), ['chezmarie'])).toEqual([
      'acc-marie-1',
      'acc-marie-2',
    ])
    expect(privateStayIds(published('Chez Marie'), [])).toEqual([])
  })

  it('repère une clé qui ne désigne plus aucun hébergement', () => {
    const renamed = published('Chez Marie & Paul')
    expect(unmatchedPrivateStays(renamed, ['chezmarie'])).toEqual(['chezmarie'])
    expect(unmatchedPrivateStays(renamed, ['chezmarie&paul'])).toEqual([])
    expect(
      unmatchedPrivateStays(published('Chez Marie'), ['chezmarie']),
    ).toEqual([])
  })

  it('retrouve par son id un hébergement masqué puis renommé', () => {
    const info = {
      privateStays: ['chezmarie'],
      privateStayIds: privateStayIds(published('Chez Marie'), ['chezmarie']),
    }
    expect(checkPrivateStays(published('Chez Marie'), info)).toEqual({
      privateStays: ['chezmarie'],
      carried: [],
      unmatched: [],
    })
    expect(checkPrivateStays(published('Chez Marie & Paul'), info)).toEqual({
      privateStays: ['chezmarie&paul'],
      carried: ['chezmarie&paul'],
      unmatched: ['chezmarie'],
    })
    // Publié avant `privateStayIds` : la clé perdue est signalée quand même.
    expect(
      checkPrivateStays(published('Chez Marie & Paul'), {
        privateStays: ['chezmarie'],
      }),
    ).toEqual({ privateStays: [], carried: [], unmatched: ['chezmarie'] })
  })
})
