import type { Metadata } from 'next'
import { Nunito, Paytone_One, Geist_Mono } from 'next/font/google'
import { PWARegister } from '@/components/pwa-register'
import { PwaInstallProvider } from '@/components/pwa-install-provider'
import { PwaInstallPrompt } from '@/components/pwa-install-prompt'
import { INSTALL_EVENT_CAPTURE_SCRIPT } from '@/lib/pwa-install'
import { AnalyticsProvider } from '@/components/analytics/analytics-provider'
import { ConsentedVercelAnalytics } from '@/components/analytics/vercel-analytics'
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
  title: 'TripBrain',
  description:
    'Planifiez et consultez votre itineraire de voyage avec TripBrain',
  manifest: '/manifest.json',
  themeColor: '#2268c7',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'TripBrain',
  },
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: 'cover',
  },
  icons: {
    apple: '/apple-icon.png',
  },
  other: {
    // Équivalent standard de `apple-mobile-web-app-capable`, lu par Chrome/Edge.
    'mobile-web-app-capable': 'yes',
  },
  openGraph: {
    siteName: 'TripBrain',
    title: 'TripBrain',
    description:
      'Planifiez et consultez votre itinéraire de voyage avec TripBrain',
    url: 'https://app.tripbrain.fr',
  },
  alternates: {
    canonical: 'https://app.tripbrain.fr',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="fr">
      <head>
        {/*
          `beforeinstallprompt` peut se déclencher avant l'hydratation React :
          on le met de côté dès le chargement du document.
        */}
        <script
          id="pwa-install-capture"
          dangerouslySetInnerHTML={{ __html: INSTALL_EVENT_CAPTURE_SCRIPT }}
        />
      </head>
      <body
        className={`${nunito.variable} ${paytoneOne.variable} font-sans antialiased`}
      >
        <AnalyticsProvider>
          <PWARegister />
          <PwaInstallProvider>
            {children}
            <PwaInstallPrompt />
          </PwaInstallProvider>
          <ConsentedVercelAnalytics />
        </AnalyticsProvider>
      </body>
    </html>
  )
}
