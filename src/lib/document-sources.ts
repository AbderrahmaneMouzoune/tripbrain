export interface Source {
  name: string
  deepLink: string
  fallback: string
  /** Single emoji icon shown next to the source name */
  icon: string
}

export interface SourceCategory {
  /** Display label including emoji prefix */
  label: string
  /** Accent colour class (Tailwind text-* + bg-*) used in the drawer */
  color: string
  items: Source[]
}

export const SOURCE_CATEGORIES: SourceCategory[] = [
  {
    label: 'Transports',
    color: 'blue',
    items: [
      {
        name: 'Air France',
        icon: '✈️',
        deepLink: 'airfrance://',
        fallback: 'https://www.airfrance.fr',
      },
      {
        name: 'Ryanair',
        icon: '✈️',
        deepLink: 'ryanair://',
        fallback: 'https://www.ryanair.com',
      },
      {
        name: 'easyJet',
        icon: '✈️',
        deepLink: 'easyjet://',
        fallback: 'https://www.easyjet.com',
      },
      {
        name: 'Trainline',
        icon: '🚆',
        deepLink: 'trainline://',
        fallback: 'https://www.thetrainline.com',
      },
      {
        name: 'SNCF Connect',
        icon: '🚆',
        deepLink: 'sncfconnect://',
        fallback: 'https://www.sncf-connect.com',
      },
    ],
  },
  {
    label: 'Hébergements',
    color: 'orange',
    items: [
      {
        name: 'Booking.com',
        icon: '🏨',
        deepLink: 'booking://',
        fallback: 'https://booking.com',
      },
      {
        name: 'Airbnb',
        icon: '🏠',
        deepLink: 'airbnb://',
        fallback: 'https://airbnb.com',
      },
      {
        name: 'Hotels.com',
        icon: '🏨',
        deepLink: 'hotelscom://',
        fallback: 'https://hotels.com',
      },
    ],
  },
  {
    label: 'Activités',
    color: 'green',
    items: [
      {
        name: 'GetYourGuide',
        icon: '🎟️',
        deepLink: 'getyourguide://',
        fallback: 'https://www.getyourguide.com',
      },
      {
        name: 'Viator',
        icon: '🎟️',
        deepLink: 'viator://',
        fallback: 'https://www.viator.com',
      },
      {
        name: 'Klook',
        icon: '🎟️',
        deepLink: 'klook://',
        fallback: 'https://www.klook.com',
      },
    ],
  },
  {
    label: 'Emails & fichiers',
    color: 'purple',
    items: [
      {
        name: 'Gmail',
        icon: '📧',
        deepLink: 'googlegmail://',
        fallback: 'https://mail.google.com',
      },
      {
        name: 'Google Drive',
        icon: '📁',
        deepLink: 'googledrive://',
        fallback: 'https://drive.google.com',
      },
      {
        name: 'Dropbox',
        icon: '📦',
        deepLink: 'dbapi-2://',
        fallback: 'https://dropbox.com',
      },
    ],
  },
]

/** Category colour → Tailwind classes */
export const CATEGORY_COLOR_CLASSES: Record<
  string,
  { badge: string; dot: string }
> = {
  blue: {
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    dot: 'bg-blue-500',
  },
  orange: {
    badge:
      'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    dot: 'bg-orange-500',
  },
  green: {
    badge:
      'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    dot: 'bg-green-500',
  },
  purple: {
    badge:
      'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    dot: 'bg-purple-500',
  },
}
