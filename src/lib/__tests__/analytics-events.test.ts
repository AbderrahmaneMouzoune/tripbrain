import { analyticsEvents } from '@/lib/analytics/events'
import { sanitizeEventProperties } from '@/lib/analytics/sanitize'

/**
 * Ces tests ne vérifient pas un comportement mais une discipline : ils cassent
 * si quelqu'un ajoute un événement capable de transporter du contenu de voyage.
 */

/** Noms de propriétés qui trahissent une valeur libre, donc du contenu. */
const FORBIDDEN_PROPERTY_NAMES = [
  'name',
  'title',
  'label',
  'query',
  'search',
  'term',
  'text',
  'content',
  'value',
  'url',
  'email',
  'city',
  'address',
  'code',
  'filename',
  'file_name',
  'message',
  // Un modèle est public, mais la mesure n'a pas à savoir lequel : ni son id,
  // ni son adresse, ni le prénom de son auteur, ni son jeton.
  'id',
  'template_id',
  'slug',
  'author',
  'author_name',
  'token',
]

const entries = Object.entries(analyticsEvents)

describe('catalogue des événements', () => {
  it('nomme les événements en snake_case', () => {
    for (const [name] of entries) {
      expect(name).toMatch(/^[a-z][a-z0-9_]*$/)
    }
  })

  it('décrit chaque événement, pour la page de confidentialité', () => {
    for (const [name, definition] of entries) {
      expect(definition.description.length, name).toBeGreaterThan(20)
    }
  })

  it("n'expose aucune propriété capable de porter du texte libre", () => {
    for (const [name, definition] of entries) {
      for (const property of Object.keys(definition.properties)) {
        expect(
          FORBIDDEN_PROPERTY_NAMES.includes(property),
          `${name}.${property}`,
        ).toBe(false)
      }
    }
  })

  it('limite les valeurs à des compteurs, des booléens ou des listes fermées', () => {
    for (const [name, definition] of entries) {
      for (const [property, spec] of Object.entries(definition.properties)) {
        expect(['enum', 'count', 'flag'], `${name}.${property}`).toContain(
          spec.kind,
        )

        if (spec.kind === 'enum') {
          expect(spec.values.length, `${name}.${property}`).toBeGreaterThan(0)
          for (const value of spec.values) {
            // Une valeur d'énumération est un mot-clé technique, jamais une
            // phrase : la contrainte de forme rend la fuite impossible.
            expect(value, `${name}.${property}`).toMatch(/^[a-z][a-z0-9_-]*$/)
            expect(value.length, `${name}.${property}`).toBeLessThanOrEqual(32)
          }
        }
      }
    }
  })
})

describe('mesure des itinéraires modèles (spec, §8)', () => {
  it('dit si une édition enregistrée porte sur un voyage repris', () => {
    expect(analyticsEvents.edit_changes_saved.properties).toEqual({
      changes_count: { kind: 'count' },
      from_template: { kind: 'flag' },
    })
    expect(
      sanitizeEventProperties('edit_changes_saved', {
        changes_count: 3,
        from_template: true,
      }),
    ).toEqual({ changes_count: 3, from_template: true })
  })

  it('dit si une installation suit la reprise d’un modèle', () => {
    expect(analyticsEvents.pwa_installed.properties).toEqual({
      from_template: { kind: 'flag' },
    })
    expect(
      sanitizeEventProperties('pwa_installed', {
        from_template: false,
        template_id: 'k3v9x2mq8r7t4wza',
      }),
    ).toEqual({ from_template: false })
  })

  it('ne connaît que les chemins d’ouverture qui existent', () => {
    expect(analyticsEvents.template_opened.properties.via.values).toEqual([
      'link',
      'site',
      'native',
    ])
  })

  it('ne connaît pas de reprise plus longue que le modèle', () => {
    expect(analyticsEvents.template_taken.properties.duration.values).toEqual([
      'same',
      'shorter',
    ])
    expect(
      sanitizeEventProperties('template_taken', {
        days_count: 7,
        kept_days_count: 10,
        duration: 'longer',
      }),
    ).toEqual({ days_count: 7, kept_days_count: 10 })
  })
})
