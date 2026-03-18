import type { Metadata } from 'next'
import { DM_Sans, Playfair_Display, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { PWARegister } from '@/components/pwa-register'
import './globals.css'

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
})

const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  style: ['normal', 'italic'],
  display: 'swap',
})

const _geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-mono-var',
})

export const metadata: Metadata = {
  title: 'Ouzbekistan 2026 - Mon Itineraire',
  description:
    'Itineraire de voyage en Ouzbekistan: Tachkent, Samarcande, Boukhara, Khiva et le desert Kyzylkum',
  manifest: '/manifest.json',
  themeColor: '#8B5A2B',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Ouzbekistan 2026',
  },
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
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
        className={`${dmSans.variable} ${playfairDisplay.variable} font-sans antialiased`}
      >
        <PWARegister />
        {children}
        <Analytics />
      </body>
    </html>
  )
}
