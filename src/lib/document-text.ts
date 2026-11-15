/**
 * Lecture du texte d'un PDF, sur le téléphone : par pdf.js dans le
 * navigateur, sinon par une lecture brute sans bibliothèque.
 *
 * La lecture brute décompresse les flux du fichier (FlateDecode) et récupère
 * les chaînes
 * affichées par les opérateurs `Tj` et `TJ`. Cela suffit pour la plupart des
 * confirmations générées par les sites de réservation ; un PDF scanné ou aux
 * polices encodées ne donne rien, et l'app se rabat alors sur le nom du
 * fichier et le contexte. Jamais d'erreur : au pire, une chaîne vide.
 */

/** Au-delà, on ne lit pas : un billet pèse rarement plus. */
const MAX_PDF_BYTES = 8 * 1024 * 1024
/** Assez pour trouver dates, villes et références. */
const MAX_TEXT_LENGTH = 40_000

const latin1 = new TextDecoder('latin1')

async function inflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === 'undefined') return null
  try {
    const stream = new Blob([bytes as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream('deflate'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  } catch {
    return null
  }
}

/** Décode une chaîne littérale PDF : `(Vol AF 276 \(CDG\))`. */
function decodeLiteral(body: string): string {
  return body.replace(/\\([nrtbf()\\]|[0-7]{1,3}|\r?\n)/g, (_, escape) => {
    switch (escape) {
      case 'n':
      case 'r':
      case 't':
      case 'b':
      case 'f':
        return ' '
      case '(':
      case ')':
      case '\\':
        return escape
      default:
        if (/^[0-7]+$/.test(escape)) {
          return String.fromCharCode(parseInt(escape, 8))
        }
        return ''
    }
  })
}

/** Chaînes affichées dans un flux de contenu, une ligne par opérateur. */
export function textFromContentStream(content: string): string {
  const lines: string[] = []
  // `(texte) Tj`, `(texte) '`, `(texte) "` et `[(te) -20 (xte)] TJ`.
  const operators =
    /\[((?:\((?:\\.|[^\\)])*\)|[^\]])*)\]\s*TJ|\(((?:\\.|[^\\)])*)\)\s*(?:Tj|'|")/g
  for (const match of content.matchAll(operators)) {
    if (match[1] !== undefined) {
      const parts = [...match[1].matchAll(/\(((?:\\.|[^\\)])*)\)/g)].map(
        (part) => decodeLiteral(part[1]),
      )
      lines.push(parts.join(''))
    } else if (match[2] !== undefined) {
      lines.push(decodeLiteral(match[2]))
    }
  }
  return lines.join('\n')
}

/**
 * Texte lisible d'un PDF (vide si rien n'est lisible). Dans le navigateur,
 * pdf.js d'abord : il décode les polices encodées que la lecture brute ne
 * sait pas lire (cartes d'embarquement, billets de train). La lecture brute
 * reste le filet quand pdf.js ne se charge pas.
 */
export async function extractPdfText(data: Blob): Promise<string> {
  if (data.size > MAX_PDF_BYTES) return ''
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    try {
      const { pdfText } = await import('@/lib/pdf')
      const text = (await pdfText(data)).slice(0, MAX_TEXT_LENGTH)
      if (text.trim()) return text
    } catch {
      // pdf.js indisponible (hors ligne avant sa première utilisation…).
    }
  }
  return extractPdfTextRaw(data)
}

/** Lecture brute des flux du fichier, sans bibliothèque. */
export async function extractPdfTextRaw(data: Blob): Promise<string> {
  if (data.size > MAX_PDF_BYTES) return ''
  try {
    const bytes = new Uint8Array(await data.arrayBuffer())
    const raw = latin1.decode(bytes)
    const chunks: string[] = []
    let length = 0
    const streams = /(?<!end)stream\r?\n/g
    let match: RegExpExecArray | null
    while ((match = streams.exec(raw)) && length < MAX_TEXT_LENGTH) {
      const start = match.index + match[0].length
      const end = raw.indexOf('endstream', start)
      if (end < 0) break
      // Le dictionnaire du flux précède le mot « stream ».
      const dictionary = raw.slice(Math.max(0, match.index - 400), match.index)
      const lastDict = dictionary.slice(dictionary.lastIndexOf('<<'))
      let content: string | null = null
      if (/\/FlateDecode/.test(lastDict)) {
        // Le saut de ligne avant « endstream » ne fait pas partie des données.
        let stop = end
        while (
          stop > start &&
          (bytes[stop - 1] === 0x0a || bytes[stop - 1] === 0x0d)
        ) {
          stop--
        }
        // …sauf si les données finissent elles-mêmes par ces octets.
        let inflated: Uint8Array | null = null
        for (let last = stop; last <= end && !inflated; last++) {
          inflated = await inflate(bytes.subarray(start, last))
        }
        if (inflated) content = latin1.decode(inflated)
      } else if (!/\/Filter/.test(lastDict)) {
        content = raw.slice(start, end)
      }
      if (content && /T[jJ]/.test(content)) {
        const text = textFromContentStream(content)
        if (text.trim()) {
          chunks.push(text)
          length += text.length
        }
      }
      streams.lastIndex = end + 'endstream'.length
    }
    return chunks.join('\n').slice(0, MAX_TEXT_LENGTH)
  } catch {
    return ''
  }
}

/** Texte de plusieurs fichiers : seuls les PDF sont lus. */
export async function extractDocumentsText(files: File[]): Promise<string> {
  const texts = await Promise.all(
    files.map((file) =>
      file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
        ? extractPdfText(file)
        : Promise.resolve(''),
    ),
  )
  return texts.filter(Boolean).join('\n')
}
