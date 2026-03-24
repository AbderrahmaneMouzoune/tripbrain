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
    label: 'Réservations',
    color: 'blue',
    items: [
      {
        name: 'Trip.com',
        icon: '🌍',
        deepLink: 'ctrip://',
        fallback: 'https://www.trip.com',
      },
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
    ],
  },
  {
    label: 'Emails',
    color: 'purple',
    items: [
      {
        name: 'Gmail',
        icon: '📧',
        deepLink: 'googlegmail://',
        fallback: 'https://mail.google.com',
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
  purple: {
    badge:
      'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    dot: 'bg-purple-500',
  },
}
