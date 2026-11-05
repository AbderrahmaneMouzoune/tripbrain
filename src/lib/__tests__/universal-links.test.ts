import { GET as getAppleAssociation } from '@/app/.well-known/apple-app-site-association/route'
import { GET as getAssetLinks } from '@/app/.well-known/assetlinks.json/route'

/**
 * Les fichiers qui disent aux téléphones quels liens `app.tripbrain.fr`
 * ouvrent l'app plutôt que le navigateur. Une erreur ici ne casse rien de
 * visible dans la webapp : les liens repartent simplement dans Safari ou
 * Chrome, et Apple garde l'erreur en cache des jours durant.
 */

// ── Apple (AASA) ──────────────────────────────────────────────────────────────

interface AasaComponent {
  '/': string
  '?'?: Record<string, string>
  comment?: string
}

interface AasaDetail {
  appID: string
  appIDs: string[]
  paths: string[]
  components: AasaComponent[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isAasaComponent(value: unknown): value is AasaComponent {
  return (
    isRecord(value) &&
    typeof value['/'] === 'string' &&
    (value['?'] === undefined || isRecord(value['?']))
  )
}

function isAasaDetail(value: unknown): value is AasaDetail {
  return (
    isRecord(value) &&
    typeof value.appID === 'string' &&
    isStringArray(value.appIDs) &&
    isStringArray(value.paths) &&
    Array.isArray(value.components) &&
    value.components.every(isAasaComponent)
  )
}

/** Relit la réponse comme un fichier AASA, en échouant s'il a une autre forme. */
async function readAssociation(): Promise<AasaDetail> {
  const json: unknown = await getAppleAssociation().json()
  const details =
    isRecord(json) && isRecord(json.applinks) ? json.applinks.details : null
  if (!Array.isArray(details) || details.length !== 1) {
    throw new Error('AASA : un seul bloc details attendu')
  }
  const [detail] = details
  if (!isAasaDetail(detail)) throw new Error('AASA : bloc details illisible')
  return detail
}

/** Motif AASA → expression régulière : `*` vaut n'importe quelle suite, `?` un caractère. */
function patternToRegExp(pattern: string): RegExp {
  const source = pattern
    .split('')
    .map((char) => {
      if (char === '*') return '.*'
      if (char === '?') return '.'
      return char.replace(/[.+^${}()|[\]\\/]/g, '\\$&')
    })
    .join('')
  return new RegExp(`^${source}$`)
}

/** Vrai si une règle de `components` fait ouvrir cette URL dans l'app. */
function claims(detail: AasaDetail, href: string): boolean {
  const url = new URL(href, 'https://app.tripbrain.fr')
  return detail.components.some((component) => {
    if (!patternToRegExp(component['/']).test(url.pathname)) return false
    return Object.entries(component['?'] ?? {}).every(([key, pattern]) => {
      const value = url.searchParams.get(key)
      return value !== null && patternToRegExp(pattern).test(value)
    })
  })
}

/** Pages qui doivent rester dans le navigateur, même avec l'app installée. */
const BROWSER_ONLY = [
  '/',
  '/guide',
  '/mentions-legales',
  '/politique-de-confidentialite',
]

describe('apple-app-site-association', () => {
  it('se sert en JSON, comme Apple l’exige', () => {
    expect(getAppleAssociation().headers.get('Content-Type')).toBe(
      'application/json',
    )
  })

  it('désigne l’app TripBrain', async () => {
    const detail = await readAssociation()
    expect(detail.appIDs).toEqual(['4P64Q2X454.fr.tripbrain.mobile'])
    expect(detail.appID).toBe('4P64Q2X454.fr.tripbrain.mobile')
  })

  it('revendique les partages, les codes et les itinéraires modèles', async () => {
    const detail = await readAssociation()
    expect(detail.paths).toEqual(expect.arrayContaining(['/s/*', '/m/*']))
    expect(detail.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ '/': '/s/*' }),
        expect.objectContaining({ '/': '/m/*' }),
        expect.objectContaining({ '/': '/', '?': { code: '?*' } }),
      ]),
    )
    expect(claims(detail, '/s/48205137')).toBe(true)
    expect(claims(detail, '/?code=48205137')).toBe(true)
    expect(claims(detail, '/m/k3v9x2mq8r7t4wza')).toBe(true)
    expect(claims(detail, '/m/k3v9x2mq8r7t4wza?from=site')).toBe(true)
  })

  it('laisse les pages légales, le guide et l’accueil au navigateur', async () => {
    const detail = await readAssociation()
    for (const path of BROWSER_ONLY) {
      expect(claims(detail, path), path).toBe(false)
    }
    // Un `?code=` vide n'est pas un partage.
    expect(claims(detail, '/?code=')).toBe(false)
  })

  it('ne revendique jamais tout le domaine, ancien format compris', async () => {
    const detail = await readAssociation()
    for (const pattern of ['*', '/*']) {
      expect(detail.paths).not.toContain(pattern)
      expect(detail.components.map((c) => c['/'])).not.toContain(pattern)
    }
    for (const path of BROWSER_ONLY.filter((p) => p !== '/')) {
      for (const pattern of detail.paths) {
        expect(patternToRegExp(pattern).test(path), `${pattern} ${path}`).toBe(
          false,
        )
      }
    }
  })
})

// ── Android (Digital Asset Links) ─────────────────────────────────────────────

/** Une empreinte SHA-256 telle que Play Console l'affiche : 32 octets `AB:CD:…`. */
function fingerprint(seed: number): string {
  return Array.from({ length: 32 }, (_, index) =>
    ((seed + index * 37) % 256).toString(16).padStart(2, '0').toUpperCase(),
  ).join(':')
}

const PLAY_SIGNING = fingerprint(0x5a)
const EAS_UPLOAD = fingerprint(0x0c)

async function readAssetLinks(): Promise<unknown> {
  return getAssetLinks().json()
}

describe('assetlinks.json', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('se sert en JSON', () => {
    vi.stubEnv('ANDROID_CERT_FINGERPRINTS', PLAY_SIGNING)
    expect(getAssetLinks().headers.get('Content-Type')).toBe('application/json')
  })

  it('répond une liste vide, mais valable, sans empreinte configurée', async () => {
    vi.stubEnv('ANDROID_CERT_FINGERPRINTS', undefined)
    expect(await readAssetLinks()).toEqual([])
    vi.stubEnv('ANDROID_CERT_FINGERPRINTS', '')
    expect(await readAssetLinks()).toEqual([])
    vi.stubEnv('ANDROID_CERT_FINGERPRINTS', ' , ')
    expect(await readAssetLinks()).toEqual([])
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('autorise l’app TripBrain signée par les certificats configurés', async () => {
    vi.stubEnv('ANDROID_CERT_FINGERPRINTS', `${PLAY_SIGNING},${EAS_UPLOAD}`)
    expect(await readAssetLinks()).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'fr.tripbrain.mobile',
          sha256_cert_fingerprints: [PLAY_SIGNING, EAS_UPLOAD],
        },
      },
    ])
  })

  it('nettoie les espaces, les minuscules et les doublons', async () => {
    vi.stubEnv(
      'ANDROID_CERT_FINGERPRINTS',
      `  ${PLAY_SIGNING.toLowerCase()} ,\n${EAS_UPLOAD} , ${PLAY_SIGNING},`,
    )
    const [statement] = asStatements(await readAssetLinks())
    expect(statement.target.sha256_cert_fingerprints).toEqual([
      PLAY_SIGNING,
      EAS_UPLOAD,
    ])
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('écarte les empreintes mal formées, et le signale', async () => {
    const malformed = [
      PLAY_SIGNING.split(':').slice(0, 31).join(':'), // 31 octets
      `${PLAY_SIGNING}:00`, // 33 octets
      PLAY_SIGNING.replace(/:/g, ''), // sans séparateurs
      PLAY_SIGNING.replace(/^../, 'ZZ'), // pas de l'hexadécimal
      'SHA256:' + EAS_UPLOAD, // préfixe recopié de l'outil
    ]
    vi.stubEnv(
      'ANDROID_CERT_FINGERPRINTS',
      [...malformed, EAS_UPLOAD].join(','),
    )
    const [statement] = asStatements(await readAssetLinks())
    expect(statement.target.sha256_cert_fingerprints).toEqual([EAS_UPLOAD])
    expect(console.warn).toHaveBeenCalledTimes(1)
    // Le journal compte les empreintes écartées sans les recopier : la
    // variable peut contenir n'importe quoi collé par erreur.
    const warning = String(vi.mocked(console.warn).mock.calls[0][0])
    expect(warning).toContain('5 empreinte')
    for (const value of malformed) expect(warning).not.toContain(value)
  })

  it('répond une liste vide quand aucune empreinte n’est valable', async () => {
    vi.stubEnv('ANDROID_CERT_FINGERPRINTS', 'à-remplir')
    expect(await readAssetLinks()).toEqual([])
  })
})

interface AssetStatement {
  relation: string[]
  target: {
    namespace: string
    package_name: string
    sha256_cert_fingerprints: string[]
  }
}

function isAssetStatement(value: unknown): value is AssetStatement {
  return (
    isRecord(value) &&
    Array.isArray(value.relation) &&
    isRecord(value.target) &&
    Array.isArray(value.target.sha256_cert_fingerprints)
  )
}

/** La réponse, relue comme une liste de déclarations Digital Asset Links. */
function asStatements(json: unknown): AssetStatement[] {
  if (!Array.isArray(json) || !json.every(isAssetStatement)) {
    throw new Error('assetlinks.json : liste de déclarations attendue')
  }
  return json
}
