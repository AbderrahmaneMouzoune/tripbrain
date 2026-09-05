import type { Metadata, Viewport } from 'next'
import { Nunito, Paytone_One, Geist_Mono } from 'next/font/google'
import { PWARegister } from '@/components/pwa-register'
import { AnalyticsProvider } from '@/components/analytics/analytics-provider'
import { ConsentedVercelAnalytics } from '@/components/analytics/vercel-analytics'
import { getSiteUrl } from '@/lib/site-url'
import './globals.css'

const nunito = Nunito({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
})

const paytoneOne = Paytone_One({
  subsets: ['latin'],
  variable: '--font-playfair',
  weight: '400',
  display: 'swap',
})

const _geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-mono-var',
})

export const metadata: Metadata = {
  // Sans base absolue, les images Open Graph sortent en URL relative : aucune
  // messagerie ne sait alors afficher l'aperçu d'un lien partagé.
  metadataBase: getSiteUrl(),
  title: 'TripBrain',
  description:
    'Planifiez et consultez votre itineraire de voyage avec TripBrain',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'TripBrain',
  },
  icons: {
    apple: '/apple-icon.png',
  },
  openGraph: {
    type: 'website',
    siteName: 'TripBrain',
    title: 'TripBrain',
    description:
      'Planifiez et consultez votre itinéraire de voyage avec TripBrain',
    url: 'https://app.tripbrain.fr',
    locale: 'fr_FR',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TripBrain',
    description:
      'Planifiez et consultez votre itinéraire de voyage avec TripBrain',
  },
  alternates: {
    canonical: 'https://app.tripbrain.fr',
  },
}

/**
 * Réglage de la fenêtre d'affichage.
 *
 * Il vit dans son propre export : depuis Next 15, `metadata.viewport` est
 * ignoré, et l'application se retrouvait avec le viewport par défaut. Sur iOS,
 * cela laissait Safari zoomer tout seul dès qu'un champ prenait le focus — le
 * champ de code du partage, par exemple — sans moyen évident de revenir en
 * arrière. `maximumScale` coupe ce zoom automatique ; le zoom à deux doigts,
 * lui, reste possible, parce qu'un texte trop petit doit toujours pouvoir être
 * agrandi.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#2268c7',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="fr">
      <body
        className={`${nunito.variable} ${paytoneOne.variable} font-sans antialiased`}
      >
        <AnalyticsProvider>
          <PWARegister />
          {children}
          <ConsentedVercelAnalytics />
        </AnalyticsProvider>
      </body>
    </html>
  )
}
