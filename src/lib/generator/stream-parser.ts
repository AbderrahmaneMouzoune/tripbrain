/**
 * Lecture au fil de l'eau du JSON d'itinéraire que `/api/generate` renvoie
 * morceau par morceau.
 *
 * L'écran de génération montre chaque journée dès qu'elle est écrite, sans
 * attendre la fin : il faut donc repérer, dans un JSON encore incomplet, les
 * objets du tableau `days` déjà refermés. Plutôt que de reparser tout le texte
 * à chaque morceau (quadratique sur une réponse de plusieurs dizaines de
 * kilo-octets), l'analyseur garde son état entre deux morceaux et ne lit
 * chaque caractère qu'une fois.
 *
 * Il ne valide rien : une journée refermée est un objet JSON complet, que
 * l'appelant passe ensuite au schéma. Il ne fait que découper.
 */

/**
 * Séparateur entre le JSON et un code d'erreur ajouté par le serveur quand la
 * génération échoue après avoir commencé (le statut HTTP est alors déjà
 * parti). Le caractère « séparateur d'enregistrements » ne peut pas figurer
 * tel quel dans un JSON valide — hors chaîne seuls les blancs sont permis, et
 * dans une chaîne les caractères de contrôle doivent être échappés — : il ne
 * se confond donc jamais avec la réponse du modèle.
 */
export const STREAM_ERROR_MARKER = '\u001e'

/** Journée en cours d'écriture : de quoi l'annoncer avant qu'elle soit finie. */
export interface PartialDay {
  city?: string
  title?: string
  /** Noms des activités déjà écrites, dans l'ordre. */
  activityNames: string[]
}

export interface StreamSnapshot {
  tripTitle?: string
  summary?: string
  /** Objets du tableau `days` déjà refermés, parsés, dans l'ordre. */
  days: unknown[]
  /** Journée commencée mais pas encore refermée. */
  current: PartialDay | null
  /** Vrai une fois le tableau `days` refermé. */
  daysComplete: boolean
}

type Container = '{' | '['

/** Une chaîne JSON terminée ; `JSON.parse` en décode les échappements. */
function decodeString(raw: string): string | undefined {
  try {
    const value: unknown = JSON.parse(raw)
    return typeof value === 'string' ? value : undefined
  } catch {
    return undefined
  }
}

/** Premier `"clé":"valeur"` complet d'un fragment, décodé. */
function readStringField(fragment: string, key: string): string | undefined {
  const match = new RegExp(`"${key}":\\s*("(?:[^"\\\\]|\\\\.)*")`).exec(
    fragment,
  )
  return match ? decodeString(match[1]) : undefined
}

/**
 * Ce qu'on peut dire d'une journée inachevée : sa ville, son titre et les
 * activités déjà nommées. Une expression régulière suffit — ces champs sont
 * des chaînes simples, et une erreur ici ne coûte qu'un libellé manquant.
 */
export function describePartialDay(fragment: string): PartialDay {
  const activitiesAt = fragment.indexOf('"activities"')
  const head = activitiesAt === -1 ? fragment : fragment.slice(0, activitiesAt)
  const activityNames: string[] = []
  if (activitiesAt !== -1) {
    const pattern = /"name":\s*("(?:[^"\\]|\\.)*")/g
    const tail = fragment.slice(activitiesAt)
    for (let match = pattern.exec(tail); match; match = pattern.exec(tail)) {
      const name = decodeString(match[1])
      if (name) activityNames.push(name)
    }
  }
  return {
    city: readStringField(head, 'city'),
    title: readStringField(head, 'title'),
    activityNames,
  }
}

export class IncrementalItineraryParser {
  /** Tout le texte reçu depuis la première accolade. */
  private source = ''
  private position = 0
  private started = false
  private stack: Container[] = []
  private inString = false
  private escaped = false
  private stringStart = -1
  /** Dernière chaîne refermée au niveau de l'objet racine. */
  private lastRootString: string | undefined
  /** Clé en cours au niveau de l'objet racine. */
  private rootKey: string | undefined
  /** Profondeur de pile à laquelle vit le tableau `days`, ou -1. */
  private daysDepth = -1
  private dayStart = -1
  private daysComplete = false
  private days: unknown[] = []
  private header: { tripTitle?: string; summary?: string } = {}

  /** Ajoute un morceau de texte et rend l'état à jour. */
  push(chunk: string): StreamSnapshot {
    if (!this.started) {
      const start = chunk.indexOf('{')
      if (start === -1) return this.snapshot()
      this.started = true
      chunk = chunk.slice(start)
    }
    this.source += chunk
    this.scan()
    return this.snapshot()
  }

  /** Le texte JSON reçu jusqu'ici, à partir de la première accolade. */
  get text(): string {
    return this.source
  }

  snapshot(): StreamSnapshot {
    return {
      ...this.header,
      days: [...this.days],
      current:
        this.dayStart === -1
          ? null
          : describePartialDay(this.source.slice(this.dayStart)),
      daysComplete: this.daysComplete,
    }
  }

  private scan(): void {
    const source = this.source
    for (let i = this.position; i < source.length; i++) {
      const char = source[i]

      if (this.inString) {
        if (this.escaped) this.escaped = false
        else if (char === '\\') this.escaped = true
        else if (char === '"') {
          this.inString = false
          if (this.stack.length === 1) {
            this.lastRootString = decodeString(
              source.slice(this.stringStart, i + 1),
            )
          }
        }
        continue
      }

      if (char === '"') {
        this.inString = true
        this.stringStart = i
      } else if (char === ':' && this.stack.length === 1) {
        this.rootKey = this.lastRootString
      } else if (char === ',' && this.stack.length === 1) {
        this.captureHeader()
        this.rootKey = undefined
      } else if (char === '{' || char === '[') {
        if (
          char === '[' &&
          this.stack.length === 1 &&
          this.rootKey === 'days' &&
          this.daysDepth === -1
        ) {
          this.daysDepth = 2
        }
        this.stack.push(char)
        if (
          char === '{' &&
          this.daysDepth !== -1 &&
          this.stack.length === this.daysDepth + 1
        ) {
          this.dayStart = i
        }
      } else if (char === '}' || char === ']') {
        const depth = this.stack.length
        this.stack.pop()
        if (
          char === '}' &&
          this.dayStart !== -1 &&
          depth === this.daysDepth + 1
        ) {
          this.closeDay(source.slice(this.dayStart, i + 1))
        } else if (char === ']' && depth === this.daysDepth) {
          this.daysComplete = true
          this.daysDepth = -1
        } else if (depth === 1) {
          this.captureHeader()
        }
      }
    }
    this.position = source.length
  }

  private closeDay(raw: string): void {
    this.dayStart = -1
    try {
      this.days.push(JSON.parse(raw))
    } catch {
      // Un objet refermé mais illisible (nombre mal écrit…) : on le saute,
      // la validation finale de la réponse complète en dira plus.
    }
  }

  /** Titre et résumé du voyage, lus dès que leur valeur est refermée. */
  private captureHeader(): void {
    if (this.rootKey === 'tripTitle' || this.rootKey === 'summary') {
      const value = this.lastRootString
      if (value !== undefined) this.header[this.rootKey] = value
    }
  }
}

/** Sépare la réponse du modèle de l'éventuel code d'erreur final. */
export function splitStreamError(text: string): {
  body: string
  error?: string
} {
  const at = text.indexOf(STREAM_ERROR_MARKER)
  if (at === -1) return { body: text }
  return {
    body: text.slice(0, at),
    error: text.slice(at + 1).trim() || 'unknown',
  }
}
