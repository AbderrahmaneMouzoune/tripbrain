/**
 * Lecture du JSON renvoyé par le modèle.
 *
 * Porté du générateur du site vitrine, où le texte arrivait par copier-coller.
 * Ici il arrive directement de l'API, mais les mêmes accidents restent
 * possibles : bloc de code malgré la consigne, phrase d'introduction, et
 * surtout une réponse coupée net — limite de longueur du modèle, génération
 * arrêtée par le voyageur, réseau perdu. On isole l'objet, et s'il s'arrête en
 * plein milieu on le referme au dernier endroit sûr plutôt que de tout jeter :
 * neuf journées récupérées valent mieux qu'un message d'erreur.
 */

export interface ParsedAiJson {
  value: unknown
  /** Vrai quand la réponse s'arrêtait en plein JSON et a dû être refermée. */
  truncated: boolean
}

interface Scan {
  /** Fin (exclusive) de l'objet, ou -1 s'il ne se referme jamais. */
  end: number
  /** Où couper un objet interrompu sans laisser de valeur à moitié écrite. */
  cut: number
  /** Ce qu'il reste à fermer à cet endroit, du plus intérieur au plus extérieur. */
  closers: string
}

/**
 * Parcourt le texte à partir de son accolade ouvrante et rend la fin de
 * l'objet — ou de quoi le refermer s'il n'en a pas.
 *
 * On garde la pile des accolades et crochets ouverts, et pour chacun la
 * dernière position où son contenu était complet : une virgule, ou la
 * fermeture d'un enfant. Couper là puis vider la pile donne le plus grand
 * JSON valide contenu dans une réponse tronquée.
 */
function scanObject(source: string): Scan {
  /** Caractères de fermeture attendus, du plus extérieur au plus intérieur. */
  const closers: string[] = []
  /** Pour chaque conteneur ouvert, l'index où couper proprement. */
  const cuts: number[] = []
  let inString = false
  let escaped = false

  for (let i = 0; i < source.length; i++) {
    const char = source[i]

    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }

    if (char === '"') {
      inString = true
    } else if (char === '{' || char === '[') {
      closers.push(char === '{' ? '}' : ']')
      // Un conteneur vide reste valide : c'est le repli minimal.
      cuts.push(i + 1)
    } else if (char === '}' || char === ']') {
      closers.pop()
      cuts.pop()
      // L'objet est refermé : ce qui suit appartient au texte autour.
      if (closers.length === 0) {
        return { end: i + 1, cut: i + 1, closers: '' }
      }
      // L'enfant qui vient de se fermer est complet : le parent peut couper
      // juste après.
      cuts[cuts.length - 1] = i + 1
    } else if (char === ',' && cuts.length > 0) {
      // Tout ce qui précède la virgule est complet, la suite ne l'est pas
      // forcément : on coupe avant elle.
      cuts[cuts.length - 1] = i
    }
  }

  return {
    end: -1,
    cut: cuts[cuts.length - 1] ?? 0,
    closers: closers.reverse().join(''),
  }
}

/**
 * Extrait l'objet JSON de la réponse du modèle.
 *
 * Lève un `SyntaxError` quand le texte n'est pas exploitable, et une `Error`
 * au message explicite quand il ne contient aucun objet : l'appelant affiche
 * l'un ou l'autre tel quel.
 */
export function parseAiJson(raw: string): ParsedAiJson {
  const start = raw.indexOf('{')
  if (start === -1) {
    throw new Error('Aucun objet JSON trouvé dans la réponse.')
  }

  const source = raw.slice(start)
  const scan = scanObject(source)

  if (scan.end !== -1) {
    return { value: JSON.parse(source.slice(0, scan.end)), truncated: false }
  }

  const value: unknown = JSON.parse(source.slice(0, scan.cut) + scan.closers)
  // Refermer une accolade isolée donne « {} » : la coupure n'a rien laissé,
  // et la réponse n'était probablement pas du JSON.
  if (!value || Object.keys(value).length === 0) {
    throw new SyntaxError('Le JSON de la réponse est vide ou illisible.')
  }

  return { value, truncated: true }
}
