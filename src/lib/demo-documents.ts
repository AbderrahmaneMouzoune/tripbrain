/**
 * Demo documents — fictional travel paperwork that ships with the demo trip.
 *
 * The onboarding "démo" mode loads a mock itinerary (`@/lib/itinerary-data`);
 * these files populate the Documents tab so the storage / preview / export
 * features can be tried out without uploading anything.
 *
 * Everything is generated at runtime (no binary assets in the repo): a tiny
 * PDF writer for the tickets and confirmations, plain SVG for the boarding
 * pass, plain text for the contact sheet. All the content is fictional and
 * labelled as such inside each document.
 */

import {
  DOCUMENTS_STORE,
  openDocumentsDB,
  type StoredFile,
} from './documents-db'

/** Prefix of every demo document id — used to clean them up on demo exit. */
export const DEMO_DOCUMENT_ID_PREFIX = 'demo-doc-'

const DISCLAIMER = 'Document fictif — exemple de démonstration TripBrain'

// ---------------------------------------------------------------------------
// Minimal PDF writer
// ---------------------------------------------------------------------------

const PAGE_WIDTH = 595 // A4 @ 72dpi
const PAGE_HEIGHT = 842
const MARGIN = 56
/** Usable width between the page margins, in points. */
export const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN
const HEADER_HEIGHT = 92

/** Accent colour of the document headers (theme "electric voltage blue"). */
const ACCENT = '0.161 0.314 0.910'

interface PdfLine {
  /** Text to draw. Omit when using `rule` or `spaceBefore` alone. */
  text?: string
  size?: number
  bold?: boolean
  /** Grey secondary text (labels). */
  muted?: boolean
  /** Extra vertical space (pt) before the line. */
  spaceBefore?: number
  /** Draw a thin horizontal separator instead of text. */
  rule?: boolean
}

interface PdfOptions {
  title: string
  subtitle?: string
  lines: PdfLine[]
}

/** Characters WinAnsi encodes outside of Latin-1 (0x80–0x9F range). */
const WIN_ANSI_EXTRAS: Record<string, number> = {
  '€': 0x80,
  '‚': 0x82,
  '„': 0x84,
  '…': 0x85,
  '†': 0x86,
  '‡': 0x87,
  Š: 0x8a,
  Œ: 0x8c,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '•': 0x95,
  '–': 0x96,
  '—': 0x97,
  '™': 0x99,
  š: 0x9a,
  œ: 0x9c,
  Ÿ: 0x9f,
}

/** Encode a string as WinAnsi bytes; unsupported characters become "?". */
function winAnsiBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code < 0x80 || (code >= 0xa0 && code <= 0xff)) {
      out[i] = code
    } else {
      out[i] = WIN_ANSI_EXTRAS[text[i]] ?? 0x3f // "?"
    }
  }
  return out
}

/**
 * Helvetica advance widths (units/1000) for the printable ASCII range,
 * indexed by `charCode - 32`. Used to wrap text inside the page margins.
 */
const HELVETICA_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278,
  278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584,
  584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556,
  833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278,
  278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222,
  500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500,
  500, 334, 260, 334, 584,
]

/** Widths of the non-ASCII characters used in the documents. */
const EXTRA_WIDTHS: Record<string, number> = {
  '·': 333,
  '—': 1000,
  '–': 556,
  '’': 222,
  '€': 556,
  '…': 1000,
  '•': 350,
}

function charWidth(char: string): number {
  const code = char.charCodeAt(0)
  if (code >= 32 && code <= 126) return HELVETICA_WIDTHS[code - 32]
  const extra = EXTRA_WIDTHS[char]
  if (extra !== undefined) return extra
  // Accented letters share the width of their unaccented counterpart
  return char === char.toUpperCase() ? 667 : 556
}

/** Width of `text` in points. Bold is ~8% wider than regular Helvetica. */
export function textWidth(text: string, size: number, bold: boolean): number {
  let width = 0
  for (const char of text) width += charWidth(char)
  return (width / 1000) * size * (bold ? 1.1 : 1)
}

/** Greedy word wrap so no line runs past the right margin. */
export function wrapText(
  text: string,
  size: number,
  bold: boolean,
  maxWidth: number,
): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (current && textWidth(candidate, size, bold) > maxWidth) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)

  return lines.length > 0 ? lines : ['']
}

/** Escape the characters that terminate a PDF literal string. */
function pdfString(text: string): string {
  return text.replace(/([\\()])/g, '\\$1')
}

function textOp(
  text: string,
  x: number,
  y: number,
  size: number,
  bold: boolean,
  color: string,
): string {
  const font = bold ? '/F2' : '/F1'
  return `BT ${color} rg ${font} ${size} Tf 1 0 0 1 ${x} ${y.toFixed(2)} Tm (${pdfString(text)}) Tj ET\n`
}

/** Build the page content stream for a document. */
function buildContentStream({ title, subtitle, lines }: PdfOptions): string {
  let content = ''

  // Header band
  content += `${ACCENT} rg 0 ${PAGE_HEIGHT - HEADER_HEIGHT} ${PAGE_WIDTH} ${HEADER_HEIGHT} re f\n`
  content += textOp(title, MARGIN, PAGE_HEIGHT - 50, 17, true, '1 1 1')
  if (subtitle) {
    content += textOp(
      subtitle,
      MARGIN,
      PAGE_HEIGHT - 72,
      10,
      false,
      '0.85 0.89 1',
    )
  }

  let y = PAGE_HEIGHT - HEADER_HEIGHT - 34

  for (const line of lines) {
    y -= line.spaceBefore ?? 0

    if (line.rule) {
      y -= 8
      content += `0.85 0.86 0.9 rg ${MARGIN} ${y.toFixed(2)} ${CONTENT_WIDTH} 0.8 re f\n`
      y -= 10
      continue
    }

    if (line.text === undefined) continue

    const size = line.size ?? 10.5
    const bold = line.bold ?? false
    const color = line.muted ? '0.42 0.45 0.52' : '0.11 0.13 0.18'

    for (const wrapped of wrapText(line.text, size, bold, CONTENT_WIDTH)) {
      y -= size + 4
      content += textOp(wrapped, MARGIN, y, size, bold, color)
    }
  }

  // Footer disclaimer
  content += textOp(DISCLAIMER, MARGIN, 44, 8.5, false, '0.55 0.57 0.63')

  return content
}

/** Render a one-page PDF. Returns the raw file bytes. */
export function buildPdf(options: PdfOptions): Uint8Array {
  const content = buildContentStream(options)
  const contentBytes = winAnsiBytes(content)

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      '/Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${contentBytes.length} >>\nstream\n${content}endstream`,
    `<< /Title (${pdfString(options.title)}) /Producer (TripBrain — données de démonstration) >>`,
  ]

  const chunks: Uint8Array[] = []
  let offset = 0
  const push = (chunk: string) => {
    const bytes = winAnsiBytes(chunk)
    chunks.push(bytes)
    offset += bytes.length
  }

  push('%PDF-1.4\n')

  const offsets: number[] = []
  objects.forEach((body, index) => {
    offsets.push(offset)
    push(`${index + 1} 0 obj\n${body}\nendobj\n`)
  })

  const xrefOffset = offset
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const objOffset of offsets) {
    xref += `${objOffset.toString().padStart(10, '0')} 00000 n \n`
  }
  push(xref)
  push(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\n` +
      `startxref\n${xrefOffset}\n%%EOF\n`,
  )

  const total = chunks.reduce((sum, c) => sum + c.length, 0)
  const file = new Uint8Array(total)
  let cursor = 0
  for (const chunk of chunks) {
    file.set(chunk, cursor)
    cursor += chunk.length
  }
  return file
}

/** Two-column "label / value" line pair used by every ticket. */
function field(label: string, value: string): PdfLine[] {
  return [
    { text: label.toUpperCase(), size: 8, muted: true, spaceBefore: 6 },
    { text: value, size: 11.5, bold: true },
  ]
}

// ---------------------------------------------------------------------------
// Boarding pass (SVG)
// ---------------------------------------------------------------------------

interface BoardingPassOptions {
  airline: string
  flight: string
  date: string
  passenger: string
  fromCode: string
  fromCity: string
  toCode: string
  toCity: string
  boarding: string
  departure: string
  gate: string
  seat: string
  reference: string
}

/** Deterministic barcode-ish stripes derived from the booking reference. */
function barcodeBars(seed: string, count: number): string {
  let bars = ''
  let x = 0
  for (let i = 0; i < count; i++) {
    const code = seed.charCodeAt(i % seed.length) + i * 7
    const width = 1.5 + (code % 4)
    if (code % 3 !== 0) {
      bars += `<rect x="${x.toFixed(1)}" y="0" width="${width.toFixed(1)}" height="46" fill="#12161f" />`
    }
    x += width + 1.5
  }
  return bars
}

function buildBoardingPassSvg(o: BoardingPassOptions): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 340" width="760" height="340" font-family="Helvetica, Arial, sans-serif">
  <rect width="760" height="340" rx="22" fill="#ffffff" stroke="#dfe3ec" />
  <rect x="0" y="0" width="760" height="70" rx="22" fill="#2950e8" />
  <rect x="0" y="48" width="760" height="22" fill="#2950e8" />
  <text x="32" y="44" fill="#ffffff" font-size="20" font-weight="bold">${o.airline}</text>
  <text x="728" y="44" fill="#c9d6ff" font-size="14" text-anchor="end">CARTE D'EMBARQUEMENT</text>

  <text x="32" y="128" fill="#6b7280" font-size="11">PASSAGER</text>
  <text x="32" y="150" fill="#12161f" font-size="18" font-weight="bold">${o.passenger}</text>
  <text x="32" y="184" fill="#6b7280" font-size="11">VOL</text>
  <text x="32" y="206" fill="#12161f" font-size="18" font-weight="bold">${o.flight}</text>
  <text x="32" y="240" fill="#6b7280" font-size="11">DATE</text>
  <text x="32" y="262" fill="#12161f" font-size="16">${o.date}</text>

  <text x="250" y="128" fill="#6b7280" font-size="11">DE</text>
  <text x="250" y="158" fill="#12161f" font-size="30" font-weight="bold">${o.fromCode}</text>
  <text x="250" y="178" fill="#6b7280" font-size="12">${o.fromCity}</text>
  <text x="360" y="150" fill="#2950e8" font-size="24">&#8594;</text>
  <text x="420" y="128" fill="#6b7280" font-size="11">VERS</text>
  <text x="420" y="158" fill="#12161f" font-size="30" font-weight="bold">${o.toCode}</text>
  <text x="420" y="178" fill="#6b7280" font-size="12">${o.toCity}</text>

  <text x="250" y="216" fill="#6b7280" font-size="11">EMBARQUEMENT</text>
  <text x="250" y="238" fill="#12161f" font-size="18" font-weight="bold">${o.boarding}</text>
  <text x="420" y="216" fill="#6b7280" font-size="11">DÉCOLLAGE</text>
  <text x="420" y="238" fill="#12161f" font-size="18" font-weight="bold">${o.departure}</text>
  <text x="250" y="270" fill="#6b7280" font-size="11">PORTE</text>
  <text x="250" y="292" fill="#12161f" font-size="18" font-weight="bold">${o.gate}</text>
  <text x="420" y="270" fill="#6b7280" font-size="11">SIÈGE</text>
  <text x="420" y="292" fill="#12161f" font-size="18" font-weight="bold">${o.seat}</text>

  <line x1="580" y1="86" x2="580" y2="316" stroke="#dfe3ec" stroke-dasharray="6 6" />
  <text x="612" y="120" fill="#6b7280" font-size="11">RÉFÉRENCE</text>
  <text x="612" y="142" fill="#12161f" font-size="16" font-weight="bold">${o.reference}</text>
  <g transform="translate(612 170)">${barcodeBars(o.reference, 24)}</g>
  <text x="612" y="238" fill="#12161f" font-size="11">${o.reference}</text>

  <text x="32" y="316" fill="#9aa1ad" font-size="10">${DISCLAIMER}</text>
</svg>
`
}

// ---------------------------------------------------------------------------
// Demo document definitions
// ---------------------------------------------------------------------------

interface DemoDocumentDefinition {
  name: string
  type: string
  build: () => Uint8Array | string
}

const DEMO_DOCUMENT_DEFINITIONS: DemoDocumentDefinition[] = [
  {
    name: 'Billet-avion-aller-Paris-Shanghai.pdf',
    type: 'application/pdf',
    build: () =>
      buildPdf({
        title: 'Billet électronique',
        subtitle: 'Air China · Paris CDG - Shanghai PVG',
        lines: [
          ...field('Référence de réservation', 'X7K2QP'),
          ...field('Passagers', 'MARTIN / ALEX (M) · MARTIN / CAMILLE (MME)'),
          { rule: true },
          ...field('Vol', 'CA934 · Airbus A350-900 · Classe économique'),
          ...field('Départ', 'Sam. 9 mai 2026 · 21:05'),
          { text: 'Paris Charles de Gaulle (CDG), Terminal 1', size: 10 },
          ...field('Arrivée', 'Dim. 10 mai 2026 · 14:35 (heure locale)'),
          { text: 'Shanghai Pudong (PVG), Terminal 2', size: 10 },
          ...field('Durée', '11h30 · vol direct'),
          ...field('Sièges', '34A · 34B'),
          ...field(
            'Bagages',
            '1 bagage en soute 23 kg + 1 cabine 8 kg / passager',
          ),
          { rule: true },
          ...field('Tarif total', '1 248,00 EUR pour 2 passagers'),
          ...field('Émis le', '9 février 2026'),
          {
            text: 'Enregistrement en ligne ouvert 48h avant le départ. Se présenter au comptoir 3h avant pour un vol international.',
            size: 10,
            muted: true,
            spaceBefore: 12,
          },
        ],
      }),
  },
  {
    name: 'Billet-avion-retour-Shanghai-Paris.pdf',
    type: 'application/pdf',
    build: () =>
      buildPdf({
        title: 'Billet électronique',
        subtitle: 'Air China · Shanghai SHA - Paris CDG (via Pékin)',
        lines: [
          ...field('Référence de réservation', 'X7K2QP'),
          ...field('Passagers', 'MARTIN / ALEX (M) · MARTIN / CAMILLE (MME)'),
          { rule: true },
          { text: 'SEGMENT 1 · CA1590', size: 9, muted: true },
          ...field('Départ', 'Ven. 29 mai 2026 · 08:55'),
          { text: 'Shanghai Hongqiao (SHA), Terminal 2', size: 10 },
          ...field('Arrivée', 'Ven. 29 mai 2026 · 11:10'),
          { text: 'Pékin Capitale (PEK), Terminal 3', size: 10 },
          { rule: true },
          { text: 'SEGMENT 2 · CA933', size: 9, muted: true },
          ...field('Départ', 'Ven. 29 mai 2026 · 13:30'),
          { text: 'Pékin Capitale (PEK), Terminal 3', size: 10 },
          ...field('Arrivée', 'Ven. 29 mai 2026 · 18:15 (heure de Paris)'),
          { text: 'Paris Charles de Gaulle (CDG), Terminal 1', size: 10 },
          { rule: true },
          ...field(
            'Escale',
            '2h20 à Pékin · bagages enregistrés jusqu’à Paris',
          ),
          ...field('Sièges', '41H · 41K'),
          {
            text: 'Correspondance dans la zone internationale : pas de récupération des bagages à Pékin.',
            size: 10,
            muted: true,
            spaceBefore: 12,
          },
        ],
      }),
  },
  {
    name: 'Confirmation-hotel-Shanghai.pdf',
    type: 'application/pdf',
    build: () =>
      buildPdf({
        title: 'Confirmation de réservation',
        subtitle: "Lingju B&B - Jing'an Temple Branch, Shanghai",
        lines: [
          ...field('Numéro de réservation', '4521 887 342'),
          ...field('Code PIN', '1837'),
          { rule: true },
          ...field('Établissement', "Lingju B&B - Jing'an Temple Branch"),
          {
            text: "Lane 786, Julu Road, Jing'an District, 200000 Shanghai, Chine",
            size: 10,
          },
          ...field('Arrivée', 'Dim. 10 mai 2026 · à partir de 14:00'),
          ...field('Départ', 'Mar. 12 mai 2026 · avant 12:00'),
          ...field('Durée', '2 nuits · 2 adultes'),
          ...field('Chambre', 'Chambre double avec salle de bain privative'),
          { rule: true },
          ...field('Prix total', '143,00 EUR · taxes incluses'),
          ...field('Paiement', "À régler sur place le jour de l'arrivée"),
          ...field(
            'Annulation',
            "Gratuite jusqu'au 7 mai 2026 à 23:59 (heure locale)",
          ),
          {
            text: "Métro ligne 2 ou 7, station Jing'an Temple (sortie 3), puis 6 minutes à pied.",
            size: 10,
            muted: true,
            spaceBefore: 12,
          },
        ],
      }),
  },
  {
    name: 'Billet-train-Shanghai-Qingdao.pdf',
    type: 'application/pdf',
    build: () =>
      buildPdf({
        title: 'Billet de train',
        subtitle: 'China Railway · G195 Shanghai Hongqiao - Qingdao North',
        lines: [
          ...field('Numéro de commande', 'E1234567890'),
          ...field('Voyageurs', 'ALEX MARTIN · CAMILLE MARTIN'),
          { rule: true },
          ...field('Train', 'G195 · train à grande vitesse'),
          ...field('Date', 'Lun. 11 mai 2026'),
          ...field('Départ', '07:53 · Shanghai Hongqiao Railway Station'),
          { text: '200 Hanzhong Road, Changning District, Shanghai', size: 10 },
          ...field('Arrivée', '14:12 · Qingdao North Railway Station'),
          ...field('Durée', '6h19'),
          ...field('Places', 'Voiture 8 · sièges 12C et 12D · 2e classe'),
          { rule: true },
          ...field('Prix', '244,00 CNY par voyageur'),
          {
            text: 'Retrait des billets au guichet avec le passeport, ou passage direct au portillon avec le passeport utilisé pour la réservation. Arriver 40 min avant le départ.',
            size: 10,
            muted: true,
            spaceBefore: 12,
          },
        ],
      }),
  },
  {
    name: 'Billet-avion-Pekin-Xian.pdf',
    type: 'application/pdf',
    build: () =>
      buildPdf({
        title: 'Billet électronique',
        subtitle: 'China Southern Airlines · Pékin PKX - Xi’an XIY',
        lines: [
          ...field('Référence de réservation', '8ZQ4WT'),
          ...field('Passagers', 'MARTIN / ALEX (M) · MARTIN / CAMILLE (MME)'),
          { rule: true },
          ...field('Vol', 'CZ8823 · Boeing 737-900ER'),
          ...field('Date', 'Sam. 16 mai 2026'),
          ...field('Départ', '13:00 · Pékin Daxing (PKX), Terminal 5'),
          ...field('Arrivée', '15:10 · Xi’an Xianyang (XIY), Terminal 3'),
          ...field('Durée', '2h10 · repas servi à bord'),
          ...field('Sièges', '18D · 18F'),
          { rule: true },
          ...field('Prix', '680,00 CNY par passager'),
          {
            text: 'Vol intérieur : présentation du passeport au comptoir, enregistrement fermé 45 min avant le départ.',
            size: 10,
            muted: true,
            spaceBefore: 12,
          },
        ],
      }),
  },
  {
    name: 'Attestation-assurance-voyage.pdf',
    type: 'application/pdf',
    build: () =>
      buildPdf({
        title: "Attestation d'assurance voyage",
        subtitle: 'Nomad Assur · contrat multirisque séjour',
        lines: [
          ...field('Numéro de contrat', 'NA-2026-004712'),
          ...field('Assurés', 'Alex Martin · Camille Martin'),
          ...field(
            'Période de validité',
            'Du 9 mai 2026 au 29 mai 2026 inclus',
          ),
          ...field('Zone couverte', 'Chine continentale et Taïwan'),
          { rule: true },
          { text: 'GARANTIES PRINCIPALES', size: 9, muted: true },
          { text: 'Frais médicaux et hospitalisation : 500 000 EUR', size: 11 },
          { text: 'Rapatriement sanitaire : frais réels', size: 11 },
          {
            text: 'Responsabilité civile à l’étranger : 1 500 000 EUR',
            size: 11,
          },
          { text: 'Bagages et effets personnels : 2 000 EUR', size: 11 },
          {
            text: 'Annulation et interruption de séjour : 5 000 EUR',
            size: 11,
          },
          { rule: true },
          ...field('Assistance 24h/24', '+33 1 00 00 00 00 (numéro fictif)'),
          ...field(
            'Déclaration de sinistre',
            'sinistre@exemple-assurance.test',
          ),
          {
            text: 'Conserver les factures originales et déclarer tout sinistre sous 5 jours ouvrés.',
            size: 10,
            muted: true,
            spaceBefore: 12,
          },
        ],
      }),
  },
  {
    name: 'Carte-embarquement-Shanghai-Taipei.svg',
    type: 'image/svg+xml',
    build: () =>
      buildBoardingPassSvg({
        airline: 'Spring Airlines',
        flight: '9C8951',
        date: 'Lun. 25 mai 2026',
        passenger: 'MARTIN / ALEX',
        fromCode: 'PVG',
        fromCity: 'Shanghai Pudong · T2',
        toCode: 'TPE',
        toCity: 'Taipei Taoyuan · T1',
        boarding: '07:20',
        departure: '08:00',
        gate: 'D62',
        seat: '21C',
        reference: 'BJSKYRR',
      }),
  },
  {
    name: 'Contacts-et-urgences.txt',
    type: 'text/plain',
    build: () =>
      [
        'TRIPBRAIN — CONTACTS & URGENCES (exemple de démonstration)',
        '',
        'NUMÉROS D’URGENCE — CHINE',
        '  Police ................... 110',
        '  Ambulance / SAMU ......... 120',
        '  Pompiers ................. 119',
        '',
        'NUMÉROS D’URGENCE — TAÏWAN',
        '  Police ................... 110',
        '  Pompiers / ambulance ..... 119',
        '',
        'ASSISTANCE VOYAGE',
        '  Nomad Assur (24h/24) ..... +33 1 00 00 00 00 (fictif)',
        '  Contrat .................. NA-2026-004712',
        '',
        'CARTES BANCAIRES — OPPOSITION',
        '  Banque (depuis l’étranger)  +33 1 00 00 00 01 (fictif)',
        '',
        'HÉBERGEMENTS',
        '  Shanghai (10-12 mai) ..... Lingju B&B, Lane 786 Julu Road',
        '  Pékin (13-16 mai) ........ QingJin Xiaoqiao’s Home, CBD Jianguomen',
        '  Taipei (25-28 mai) ....... voir roadbook, jour 16',
        '',
        'À NE PAS OUBLIER',
        '  - Passeport valable 6 mois après le retour',
        '  - Visa L (tourisme) imprimé',
        '  - Alipay / WeChat Pay configurés avant le départ',
        '  - VPN installé avant l’arrivée en Chine',
        '  - Adaptateur secteur type A / I',
        '',
        DISCLAIMER,
        '',
      ].join('\n'),
  },
]

// ---------------------------------------------------------------------------
// Store helpers
// ---------------------------------------------------------------------------

/** Build the demo documents as records ready to be stored in IndexedDB. */
export function createDemoDocuments(now: number = Date.now()): StoredFile[] {
  return DEMO_DOCUMENT_DEFINITIONS.map((definition, index) => {
    const content = definition.build()
    const blob = new Blob([content], { type: definition.type })
    // Stagger timestamps so the default "most recent first" sort keeps the
    // documents in the order they are declared.
    const addedAt = now - index * 3_600_000

    return {
      id: `${DEMO_DOCUMENT_ID_PREFIX}${index + 1}`,
      name: definition.name,
      size: blob.size,
      type: definition.type,
      lastModified: addedAt,
      addedAt,
      blob,
    }
  })
}

/**
 * Write the demo documents into the documents store.
 * Ids are stable, so re-seeding replaces the files instead of duplicating them.
 */
export async function seedDemoDocuments(): Promise<void> {
  const db = await openDocumentsDB()
  const tx = db.transaction(DOCUMENTS_STORE, 'readwrite')
  const store = tx.objectStore(DOCUMENTS_STORE)

  for (const file of createDemoDocuments()) {
    store.put(file)
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** Delete every demo document, leaving the user's own files untouched. */
export async function removeDemoDocuments(): Promise<void> {
  const db = await openDocumentsDB()
  const tx = db.transaction(DOCUMENTS_STORE, 'readwrite')
  const store = tx.objectStore(DOCUMENTS_STORE)

  const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
    const request = store.getAllKeys()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  for (const key of keys) {
    if (typeof key === 'string' && key.startsWith(DEMO_DOCUMENT_ID_PREFIX)) {
      store.delete(key)
    }
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
