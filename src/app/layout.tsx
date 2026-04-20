import type { Metadata } from 'next'
import { Nunito, Paytone_One, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { PWARegister } from '@/components/pwa-register'
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
      <body
        className={`${nunito.variable} ${paytoneOne.variable} font-sans antialiased`}
      >
        <PWARegister />
        {children}
        <Analytics />
      </body>
    </html>
  )
}
