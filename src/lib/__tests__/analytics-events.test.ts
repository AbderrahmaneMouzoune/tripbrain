import { analyticsEvents } from '@/lib/analytics/events'

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
