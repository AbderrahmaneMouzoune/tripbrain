// Partage d'une sélection de documents, côté navigateur.
//
// Pipeline : documents choisis → ZIP (exactement le format de l'export) →
// base64url → /api/share, qui le range sous un code de partage. Le serveur ne
// reçoit qu'une chaîne opaque : ni nom de fichier, ni contenu.
//
// Contrairement à l'itinéraire, rien n'est jamais embarqué dans un QR code
// autonome : quelques centaines d'octets suffisent à saturer un QR code, un
// billet d'avion en PDF pèse mille fois plus.

import {
  buildDocumentsZip,
  readDocumentsZip,
  type ParsedZipDocument,
  type ZippableDocument,
} from '@/lib/document-zip'
import {
  SHARE_MAX_PAYLOAD_CHARS,
  fromBase64Url,
  toBase64Url,
} from '@/lib/share'
import { formatFileSize } from '@/lib/utils'

export type { ParsedZipDocument, ZippableDocument }

/**
 * Poids maximal d'une sélection, avant compression.
 *
 * Le payload part en base64, qui pèse quatre tiers de ce qu'il encode. Le ZIP
 * regagne un peu sur les documents texte, presque rien sur un PDF ou une photo :
 * ce plafond sert donc de repère dans l'interface, et `packDocuments` refait le
 * calcul sur le payload réel avant tout envoi.
 */
export const DOCUMENTS_SHARE_MAX_BYTES = Math.floor(
  (SHARE_MAX_PAYLOAD_CHARS.documents * 3) / 4,
)

/** Poids cumulé d'une sélection, tel qu'il est annoncé dans l'interface. */
export function documentsTotalSize(
  documents: readonly { size: number }[],
): number {
  return documents.reduce((total, document) => total + document.size, 0)
}

/** Idem, pour des documents reçus : leur taille est celle de leur contenu. */
export function receivedDocumentsSize(
  documents: readonly ParsedZipDocument[],
): number {
  return documents.reduce((total, document) => total + document.blob.size, 0)
}

/**
 * Emballe les documents choisis en un payload prêt à être déposé.
 *
 * Le refus se fait ici, sur la taille réelle du payload : plus tôt, elle n'est
 * qu'estimée ; plus tard, c'est le serveur qui répondrait 413 après avoir fait
 * transiter plusieurs mégaoctets pour rien.
 */
export async function packDocuments(
  documents: ZippableDocument[],
): Promise<string> {
  if (documents.length === 0) {
    throw new Error('Choisissez au moins un document à partager.')
  }

  const payload = toBase64Url(await buildDocumentsZip(documents))

  if (payload.length > SHARE_MAX_PAYLOAD_CHARS.documents) {
    throw new Error(
      `Sélection trop volumineuse : décochez quelques documents pour rester sous ${formatFileSize(
        DOCUMENTS_SHARE_MAX_BYTES,
      )}.`,
    )
  }

  return payload
}

/**
 * Reconstruit les documents à partir d'un payload reçu.
 *
 * Le payload vient du réseau : une archive illisible ou vide est refusée avant
 * d'atteindre IndexedDB, comme n'importe quel import de fichier.
 */
export async function unpackDocuments(
  payload: string,
): Promise<ParsedZipDocument[]> {
  let documents: ParsedZipDocument[]

  try {
    documents = (await readDocumentsZip(fromBase64Url(payload))).documents
  } catch {
    throw new Error('Données de partage illisibles ou incomplètes.')
  }

  if (documents.length === 0) {
    throw new Error('Ce partage ne contient aucun document.')
  }

  return documents
}
