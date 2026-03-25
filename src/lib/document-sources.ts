export interface Source {
  name: string
  /** Branded background colour class (Tailwind bg-*) for the icon avatar */
  bgColor: string
  /** Single letter or emoji shown in the icon avatar */
  letter: string
  deepLink: string
  fallback: string
  /** Short instruction shown below the source name */
  description: string
}

export interface SourceCategory {
  /** Display label */
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
        letter: 'T',
        bgColor: 'bg-sky-600',
        // Trip.com doesn't expose a reliable universal deep link; go directly to
        // the web app so the redirect always works.
        deepLink: 'https://www.trip.com',
        fallback: 'https://www.trip.com',
        description: 'Télécharge ta confirmation de voyage',
      },
      {
        name: 'Booking.com',
        letter: 'B',
        bgColor: 'bg-blue-700',
        deepLink: 'booking://',
        fallback: 'https://booking.com',
        description: 'Télécharge ta confirmation PDF',
      },
      {
        name: 'Airbnb',
        letter: 'A',
        bgColor: 'bg-rose-500',
        deepLink: 'airbnb://',
        fallback: 'https://airbnb.com',
        description: 'Exporte ton itinéraire de réservation',
      },
    ],
  },
  {
    label: 'Emails',
    color: 'purple',
    items: [
      {
        name: 'Gmail',
        letter: 'G',
        bgColor: 'bg-red-500',
        deepLink: 'googlegmail://',
        fallback: 'https://mail.google.com',
        description: "Cherche ta confirmation d'e-mail",
      },
    ],
  },
]


/** Category colour → Tailwind classes (used in the drawer header dots) */
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
