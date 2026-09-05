/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // L'app mobile (apps/mobile) ouvre les liens app.tripbrain.fr directement.
  // iOS exige que le fichier d'association, servi sans extension depuis
  // public/.well-known/, soit déclaré en JSON.
  async headers() {
    return [
      {
        source: '/.well-known/apple-app-site-association',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
    ]
  },
}

export default nextConfig
