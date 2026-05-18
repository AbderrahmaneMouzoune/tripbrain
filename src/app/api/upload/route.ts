import { route, type Router } from '@better-upload/server'
import { toRouteHandler } from '@better-upload/server/adapters/next'
import { cloudflare } from '@better-upload/server/clients'

const router: Router = {
  client: cloudflare({
    accountId: process.env.R2_ACCOUNT_ID!,
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  }),
  bucketName: process.env.R2_BUCKET_NAME!,
  routes: {
    'itinerary-export': route({
      fileTypes: ['application/json'],
      maxFileSize: 1024 * 1024, // 1 Mo max
      signedUrlExpiresIn: 600, // URL d'upload valide 10 minutes
      onBeforeUpload: async ({ file }) => {
        return {
          objectInfo: {
            key: `exports/${Date.now()}-${file.name}`,
          },
        }
      },
      onAfterSignedUrl: async ({ file }) => {
        const key = file.objectInfo.key
        return {
          // URL publique retournée au client pour générer le QR code
          metadata: { url: `${process.env.R2_PUBLIC_URL}/${key}` },
        }
      },
    }),
  },
}

export const { POST } = toRouteHandler(router)
