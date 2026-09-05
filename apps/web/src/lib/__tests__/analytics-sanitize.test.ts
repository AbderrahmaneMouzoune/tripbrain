import {
  REDACTED,
  sanitizeCapture,
  sanitizeEventProperties,
  sanitizeUrlValue,
} from '@/lib/analytics/sanitize'

describe('sanitizeUrlValue', () => {
  it("retire le partage embarqué dans l'URL", () => {
    const url = 'https://app.tripbrain.fr/?import=eJyrVkrLzFHSUUpKLElVsopWys'
    expect(sanitizeUrlValue(url)).toBe('https://app.tripbrain.fr/')
  })

  it('retire un code de partage', () => {
    expect(sanitizeUrlValue('https://app.tripbrain.fr/?code=K7QP2M4X')).toBe(
      'https://app.tripbrain.fr/',
    )
  })

  it('garde les paramètres de provenance', () => {
    expect(
      sanitizeUrlValue(
        'https://tripbrain.fr/?utm_source=newsletter&utm_medium=email&secret=42',
      ),
    ).toBe('https://tripbrain.fr/?utm_source=newsletter&utm_medium=email')
  })

  it('préserve un chemin relatif sans ses paramètres', () => {
    expect(sanitizeUrlValue('/politique-de-confidentialite?code=ABC')).toBe(
      '/politique-de-confidentialite',
    )
  })

  it('supprime un fragment non autorisé', () => {
    expect(sanitizeUrlValue('https://tripbrain.fr/#eyJ0cmlwIjoi')).toBe(
      'https://tripbrain.fr/',
    )
  })

  it('garde une ancre déclarée', () => {
    expect(
      sanitizeUrlValue('https://tripbrain.fr/#faq', {
        allowedFragments: ['faq'],
      }),
    ).toBe('https://tripbrain.fr/#faq')
  })

  it('laisse passer les valeurs sentinelles de PostHog', () => {
    expect(sanitizeUrlValue('$direct')).toBe('$direct')
  })

  it('masque ce qui ne ressemble pas à une URL', () => {
    expect(sanitizeUrlValue('Hôtel Sakura, Kyoto')).toBe(REDACTED)
  })

  it('masque les protocoles autres que http(s)', () => {
    expect(sanitizeUrlValue('javascript:alert(1)')).toBe(REDACTED)
    expect(sanitizeUrlValue('blob:https://app.tripbrain.fr/1234')).toBe(
      REDACTED,
    )
  })
})

describe('sanitizeEventProperties', () => {
  it('ne garde que les propriétés déclarées', () => {
    expect(
      sanitizeEventProperties('trip_imported', {
        source: 'xlsx',
        days_count: 12,
        activities_count: 40,
        city: 'Osaka',
        file_name: 'voyage.xlsx',
      }),
    ).toEqual({ source: 'xlsx', days_count: 12, activities_count: 40 })
  })

  it('rejette une valeur hors de la liste fermée', () => {
    expect(
      sanitizeEventProperties('calendar_exported', { scope: 'Kyoto' }),
    ).toEqual({})
  })

  it('rejette une valeur du mauvais type', () => {
    expect(
      sanitizeEventProperties('edit_changes_saved', {
        changes_count: 'beaucoup',
      }),
    ).toEqual({})
  })

  it('accepte un booléen déclaré', () => {
    expect(
      sanitizeEventProperties('documents_searched', { has_results: false }),
    ).toEqual({ has_results: false })
  })
})

describe('sanitizeCapture', () => {
  it('jette un événement absent du catalogue', () => {
    expect(
      sanitizeCapture({ event: '$autocapture', properties: {} }),
    ).toBeNull()
    expect(
      sanitizeCapture({ event: 'trip_content', properties: {} }),
    ).toBeNull()
    expect(sanitizeCapture(null)).toBeNull()
  })

  it('nettoie les URL des pages vues', () => {
    const result = sanitizeCapture({
      event: '$pageview',
      properties: {
        $current_url: 'https://app.tripbrain.fr/?import=PAYLOAD',
        $referrer: 'https://tripbrain.fr/?code=ABCD1234',
        title: 'TripBrain',
      },
    })

    expect(result?.properties).toEqual({
      $current_url: 'https://app.tripbrain.fr/',
      $referrer: 'https://tripbrain.fr/',
      title: 'TripBrain',
    })
  })

  it("retire l'adresse IP et les éléments capturés", () => {
    const result = sanitizeCapture({
      event: '$pageview',
      properties: {
        $ip: '81.12.34.56',
        $el_text: 'Hôtel Sakura',
        $elements: [{ text: 'Kyoto' }],
        $browser: 'Chrome',
      },
    })

    expect(result?.properties).toEqual({ $browser: 'Chrome' })
  })

  it('retire les propriétés non déclarées des événements du catalogue', () => {
    const result = sanitizeCapture({
      event: 'share_created',
      properties: {
        method: 'server_code',
        days_count: 8,
        share_code: 'K7QP2M4X',
        $current_url: 'https://app.tripbrain.fr/?code=K7QP2M4X',
      },
    })

    expect(result?.properties).toEqual({
      method: 'server_code',
      days_count: 8,
      $current_url: 'https://app.tripbrain.fr/',
    })
  })

  it('supprime toute propriété de personne', () => {
    const result = sanitizeCapture({
      event: 'app_opened',
      properties: { display_mode: 'standalone' },
      $set: { email: 'voyageur@example.com' },
      $set_once: { name: 'Camille' },
      $unset: ['whatever'],
    })

    expect(result).not.toHaveProperty('$set')
    expect(result).not.toHaveProperty('$set_once')
    expect(result).not.toHaveProperty('$unset')
  })

  it('écarte les paramètres publicitaires des événements du SDK', () => {
    const result = sanitizeCapture({
      event: '$pageview',
      properties: {
        utm_source: 'newsletter',
        gclid: 'Cj0KCQjw',
        fbclid: 'IwAR0',
      },
    })

    expect(result?.properties).toEqual({ utm_source: 'newsletter' })
  })
})
