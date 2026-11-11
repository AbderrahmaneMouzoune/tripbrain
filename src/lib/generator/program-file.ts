/**
 * Lecture d'un fichier de programme sur l'appareil, avant l'import.
 *
 * Tout ce qui peut se lire ici se lit ici : un Word, un tableur ou un fichier
 * texte sont convertis en texte dans le navigateur, et seul ce texte part au
 * serveur. Le PDF fait exception — sa mise en page porte le sens (tableaux,
 * colonnes) et le modèle le lit mieux tel quel : il part encodé en base64.
 */

import {
  MAX_PROGRAM_FILE_BYTES,
  MAX_PROGRAM_TEXT_LENGTH,
  MIN_PROGRAM_TEXT_LENGTH,
  type ProgramSource,
} from '@/lib/generator/program-import'

/** Extensions proposées par le sélecteur de fichiers. */
export const PROGRAM_FILE_ACCEPT =
  '.pdf,.docx,.xlsx,.csv,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain,text/markdown'

/** Un fichier refusé, avec le message à montrer tel quel. */
export class ProgramFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProgramFileError'
  }
}

export type ProgramFileKind = 'pdf' | 'docx' | 'xlsx' | 'text'

/** Le format d'un fichier d'après son nom, ou `null` s'il n'est pas lisible ici. */
export function programFileKind(name: string): ProgramFileKind | null {
  const extension = name.toLowerCase().split('.').pop() ?? ''
  if (extension === 'pdf') return 'pdf'
  if (extension === 'docx') return 'docx'
  if (extension === 'xlsx') return 'xlsx'
  if (['csv', 'txt', 'md', 'markdown'].includes(extension)) return 'text'
  return null
}

const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

function decodeXml(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (match, code: string) => {
      if (code[0] !== '#') return XML_ENTITIES[code.toLowerCase()] ?? match
      const point =
        code[1].toLowerCase() === 'x'
          ? Number.parseInt(code.slice(2), 16)
          : Number.parseInt(code.slice(1), 10)
      return Number.isFinite(point) ? String.fromCodePoint(point) : match
    },
  )
}

/**
 * Le texte d'un `word/document.xml` : un paragraphe par ligne, les cellules
 * d'un tableau séparées par une barre. La mise en forme est ignorée — seul
 * l'ordre de lecture compte pour recopier un programme.
 */
export function docxXmlToText(xml: string): string {
  return decodeXml(
    xml
      .replace(/<w:tab\b[^>]*\/>/g, '\t')
      .replace(/<w:(?:br|cr)\b[^>]*\/>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<\/w:tc>/g, ' | ')
      .replace(/<\/w:tr>/g, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .split('\n')
    .map((line) =>
      line
        .replace(/\n/g, '')
        .replace(/(?:\s*\|\s*)+$/, '')
        .replace(/[ \t]+/g, ' ')
        .trim(),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function readDocx(buffer: ArrayBuffer): Promise<string> {
  const { strFromU8, unzipSync } = await import('fflate')
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(new Uint8Array(buffer), {
      filter: (file) => file.name === 'word/document.xml',
    })
  } catch {
    throw new ProgramFileError('Ce fichier Word est illisible ou abîmé.')
  }
  const xml = files['word/document.xml']
  if (!xml)
    throw new ProgramFileError('Ce fichier Word est illisible ou abîmé.')
  return docxXmlToText(strFromU8(xml))
}

/** Un classeur en texte : chaque feuille, ligne par ligne, cellules séparées. */
async function readXlsx(buffer: ArrayBuffer): Promise<string> {
  const { Workbook } = await import('exceljs')
  const workbook = new Workbook()
  try {
    await workbook.xlsx.load(buffer)
  } catch {
    throw new ProgramFileError('Ce fichier Excel est illisible ou abîmé.')
  }
  const sheets: string[] = []
  workbook.eachSheet((sheet) => {
    const lines: string[] = []
    sheet.eachRow((row) => {
      const cells: string[] = []
      row.eachCell({ includeEmpty: true }, (cell) => {
        cells.push(cell.text.replace(/\s+/g, ' ').trim())
      })
      const line = cells.join(' | ').replace(/(?:\s*\|\s*)+$/, '')
      if (line.replace(/[|\s]/g, '')) lines.push(line)
    })
    if (lines.length > 0) sheets.push(`# ${sheet.name}\n${lines.join('\n')}`)
  })
  return sheets.join('\n\n')
}

/** Base64 d'un tampon, par tranches : `btoa` ne prend pas un gros tableau d'un coup. */
function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const step = 0x8000
  for (let offset = 0; offset < bytes.length; offset += step) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + step))
  }
  return btoa(binary)
}

/** Vérifie qu'un texte a la taille d'un programme ; rend le texte nettoyé. */
export function checkProgramText(text: string): string {
  const clean = text.replace(/\r\n?/g, '\n').trim()
  if (clean.length < MIN_PROGRAM_TEXT_LENGTH) {
    throw new ProgramFileError(
      'Ce document ne contient presque pas de texte. S’il est scanné (une image), collez plutôt le texte du programme.',
    )
  }
  if (clean.length > MAX_PROGRAM_TEXT_LENGTH) {
    throw new ProgramFileError(
      `Ce programme est trop long (${clean.length.toLocaleString('fr-FR')} caractères, ${MAX_PROGRAM_TEXT_LENGTH.toLocaleString('fr-FR')} au maximum). Importez-le en deux parties, ou retirez les annexes.`,
    )
  }
  return clean
}

/**
 * Lit un fichier de programme et rend ce qui partira au serveur. Lève
 * `ProgramFileError` avec un message à afficher quand le fichier ne convient
 * pas : format, taille, contenu vide.
 */
export async function readProgramFile(file: File): Promise<ProgramSource> {
  const kind = programFileKind(file.name)
  if (!kind) {
    const old = /\.(doc|xls|odt|ods|pages|numbers)$/i.test(file.name)
    throw new ProgramFileError(
      old
        ? 'Ce format n’est pas lu directement. Enregistrez le document en PDF, ou copiez son texte dans l’onglet « Coller le texte ».'
        : 'Format non pris en charge. Choisissez un PDF, un Word (.docx), un Excel (.xlsx), un CSV ou un fichier texte.',
    )
  }
  if (file.size > MAX_PROGRAM_FILE_BYTES) {
    throw new ProgramFileError('Ce fichier est trop lourd : 3 Mo au maximum.')
  }
  if (file.size === 0) throw new ProgramFileError('Ce fichier est vide.')

  const buffer = await file.arrayBuffer()
  if (kind === 'pdf') {
    const head = new TextDecoder().decode(buffer.slice(0, 5))
    if (head !== '%PDF-') {
      throw new ProgramFileError('Ce fichier n’est pas un PDF lisible.')
    }
    return { kind: 'pdf', data: toBase64(buffer) }
  }
  const text =
    kind === 'docx'
      ? await readDocx(buffer)
      : kind === 'xlsx'
        ? await readXlsx(buffer)
        : new TextDecoder().decode(buffer)
  return { kind: 'text', text: checkProgramText(text) }
}
