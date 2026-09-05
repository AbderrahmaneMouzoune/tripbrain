// Stockage serveur des partages : bucketcode (S3/R2) + codes de synchronisation.
// Les identifiants R2 ne quittent jamais le serveur — le navigateur ne parle
// qu'à /api/share, il n'y a donc ni CORS à configurer ni signature côté client.

import { createBucket, syncCodeAlphabets, type Bucket } from 'bucketcode'
import {
  SHARE_CODE_LENGTH,
  SHARE_MAX_PAYLOAD_CHARS,
  type ShareKind,
} from '@/lib/share'

/** Nom d'application inscrit dans l'enveloppe du snapshot. */
export const SHARE_APP = 'tripbrain'

/**
 * Version du format de `data` stocké dans le snapshot. À incrémenter quand la
 * forme du payload change : une build plus ancienne refusera alors le snapshot
 * au lieu de le lire de travers.
 *
 * Version 2 : le snapshot dit ce qu'il transporte (`kind`), l'itinéraire n'étant
 * plus la seule possibilité. Un serveur en version 1 refuse donc ces snapshots
 * plutôt que de servir des documents à un client qui attend un itinéraire.
 */
export const SHARE_SCHEMA_VERSION = 2

/** Durée de vie d'un code : le temps de passer d'un appareil à l'autre. */
export const SHARE_EXPIRES_IN = 60 * 60

/** Plafond du bucket : le plus permissif des plafonds par nature de partage. */
export const SHARE_MAX_SNAPSHOT_CHARS = Math.max(
  ...Object.values(SHARE_MAX_PAYLOAD_CHARS),
)

/**
 * Ce que contient le snapshot : le payload compressé tel qu'envoyé par le
 * client, et sa nature. Le serveur ne le décode jamais.
 */
export interface SharedSnapshotData {
  payload: string
  kind?: ShareKind
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Variable d'environnement manquante : ${name}`)
  }
  return value
}

let store: Bucket | null = null

/**
 * Handle bucket partagé par les routes d'API. Créé à la première requête pour
 * qu'une variable d'environnement manquante fasse échouer la requête plutôt
 * que le build.
 */
export function getShareStore(): Bucket {
  if (!store) {
    store = createBucket({
      bucket: requireEnv('R2_BUCKET_NAME'),
      endpoint: `https://${requireEnv('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
        secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
      },
      // Namespace interne : les snapshots ne côtoient pas d'autres objets.
      prefix: 'shares',
      // Chiffres uniquement : le code se dicte au téléphone et se saisit au
      // pavé numérique. Huit chiffres valent 26,6 bits — moins que le base32
      // par défaut, mais le code expire en une heure et /api/share/[code] est
      // limité à 30 tentatives par minute.
      syncCode: {
        alphabet: syncCodeAlphabets.digits,
        length: SHARE_CODE_LENGTH,
      },
      maxSize: SHARE_MAX_SNAPSHOT_CHARS,
    })
  }
  return store
}
