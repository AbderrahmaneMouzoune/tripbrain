/**
 * Shared example data used by the format guide dialog (CSV + JSON tabs).
 * Keep both examples in sync when the data model changes.
 */

export { EXAMPLE_CSV } from '@/lib/csv-parser'

export const EXAMPLE_JSON = JSON.stringify(
  {
    tripStartDate: '2026-06-01',
    tripEndDate: '2026-06-05',
    itinerary: [
      {
        date: '2026-06-01',
        dayNumber: 1,
        city: 'Paris',
        title: 'Arrivée à Paris',
        coordinates: [48.8566, 2.3522],
        dayType: 'arrival',
        walkingDistance: '4 km',
        notes: "Journée tranquille pour s'installer.",
        highlights: ['Tour Eiffel', 'Montmartre'],
        tips: ['Prendre le RER B depuis CDG'],
        foodRecommendations: ['Steak frites brasserie', 'Croissants chez Paul'],
        packingTips: ['Prévoir un adaptateur électrique'],
        activities: [
          { name: 'Tour Eiffel', type: 'visit', duration: '2h' },
          { name: 'Dîner quartier latin', type: 'food', duration: '1h30' },
        ],
        accommodation: {
          name: 'Hôtel des Arts',
          address: '12 rue de la Paix, Paris',
          bookingUrl: 'https://booking.com/hotel-des-arts',
          checkIn: '15:00',
          checkOut: '11:00',
        },
        transport: {
          type: 'plane',
          from: 'Lyon',
          to: 'Paris',
          details: 'Vol AF1234 - arrivée 14h00',
        },
      },
    ],
  },
  null,
  2,
)
