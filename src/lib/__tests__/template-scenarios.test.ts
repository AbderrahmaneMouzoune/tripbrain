// Scénarios réels des itinéraires modèles : de la publication par l'auteur à
// la reprise par un inconnu, sur des voyages écrits comme les écrivent les
// utilisateurs — la démo Chine, un Japon de 14 jours saisi à la main, un road
// trip italien, un week-end, un import sans dates, un voyage du générateur.
//
// Chaque scénario joue le parcours entier en mémoire : chiffres de A2, extraits
// surlignés de A3, slug et titre, publication puis lecture publique (rien de
// privé), présélection et étapes de B4, recalage, origine et bannière de B5.
// Ce qui est vérifié ici l'est sur les écrans prévus (#83, #85), pas seulement
// sur des cas d'école.
//
// Les sorties détaillées de chaque scénario sont commentées dans le rapport de
// la campagne de test ; les défauts trouvés sont en fin de fichier.

import {
  generatedItinerarySchema,
  toDayItineraries,
  type GeneratedItinerary,
} from '@/lib/generator/itinerary-schema'
import { addDays, splitIsoDateValue } from '@/lib/iso-date'
import {
  itinerary as demoItinerary,
  type DayItinerary,
} from '@/lib/itinerary-data'
import {
  cleanForTemplate,
  noteExcerpts,
  sensitiveSpans,
  summarizeTemplateCleaning,
  templateKnownPlaces,
  type SensitiveSpan,
} from '@/lib/template-clean'
import {
  DEFAULT_TEMPLATE_OPTIONS,
  type PublicTemplate,
  type TemplateOptions,
} from '@/lib/template-model'
import {
  buildTemplateOrigin,
  durationChoice,
  groupDaysByCity,
  needsBooking,
  retimeTemplate,
  suggestKeptDayIds,
  templateTodo,
} from '@/lib/template-redate'
import { publishTemplate, readTemplate } from '@/lib/template-store'
import { createMemoryTemplateBucket } from './helpers/memory-template-bucket'

// ── Voyages ───────────────────────────────────────────────────────────────────
//
// 1. La démo Chine est `itinerary` (`itinerary-data.ts`), telle quelle.

// ── 2. Japon, 14 jours, écrit à la main ──────────────────────────────────────

function japanTrip(): DayItinerary[] {
  return [
    {
      id: 'jp-d1',
      date: '2026-04-02',
      dayNumber: 1,
      city: 'Tokyo',
      title: 'Arrivée à Shinjuku',
      dayType: 'arrival',
      coordinates: [35.6938, 139.7034],
      notes:
        'Code de la boîte à clés : 4471, appeler Kenji au 080-3312-4471 si souci. Suica à acheter dès Haneda.',
      tips: [
        'Retirer des yens au 7-Eleven, les distributeurs acceptent les cartes étrangères',
      ],
      accommodation: {
        id: 'jp-acc-gracery',
        name: 'Hotel Gracery Shinjuku',
        address: '1-19-1 Kabukicho, Shinjuku-ku, Tokyo',
        bookingUrl:
          'https://secure.booking.com/confirmation.fr.html?aid=304142&bn=4021553117&hostname=www.booking.com',
        checkIn: '2026-04-02T15:00',
        checkOut: '2026-04-06T11:00',
        bookingReference: '4021553117',
        price: 620,
        currency: 'EUR',
        status: 'booked',
      },
      transport: {
        id: 'jp-tr-aller',
        type: 'plane',
        from: 'Paris CDG',
        to: 'Tokyo Haneda (HND)',
        details: 'Air France AF274',
        departureTime: '2026-04-01T13:55',
        arrivalTime: '2026-04-02T09:05',
        duration: '13h10',
        provider: 'Air France',
        bookingReference: 'Q7XK2P',
        seat: '34K',
        terminal: '2E',
        price: 1180,
        currency: 'EUR',
        status: 'booked',
        notes: 'Léa côté hublot, moi couloir. Bagage 23 kg chacun.',
      },
      activities: [
        {
          id: 'jp-a1-1',
          name: 'Omoide Yokocho',
          type: 'food',
          openAt: '19:00',
          status: 'done',
        },
        {
          id: 'jp-a1-2',
          name: 'Golden Gai',
          type: 'experience',
          openAt: '21:00',
          status: 'done',
        },
      ],
    },
    {
      id: 'jp-d2',
      date: '2026-04-03',
      dayNumber: 2,
      city: 'Tokyo',
      title: 'Asakusa et Ueno',
      coordinates: [35.7148, 139.7967],
      activities: [
        {
          id: 'jp-a2-1',
          name: 'Senso-ji',
          type: 'visit',
          openAt: '08:30',
          status: 'done',
        },
        { id: 'jp-a2-2', name: "Parc d'Ueno", type: 'visit', status: 'done' },
        { id: 'jp-a2-3', name: 'Ameyoko', type: 'food', status: 'skipped' },
      ],
    },
    {
      id: 'jp-d3',
      date: '2026-04-04',
      dayNumber: 3,
      city: 'Tokyo',
      title: 'Shibuya, Harajuku',
      coordinates: [35.6595, 139.7005],
      notes:
        'Resto réservé au nom de Mouzoune à 19h30, Sarah arrive en retard. Tél du resto : 03-3496-2241.',
      activities: [
        { id: 'jp-a3-1', name: 'Meiji-jingu', type: 'visit', status: 'done' },
        {
          id: 'jp-a3-2',
          name: 'Takeshita-dori',
          type: 'shopping',
          status: 'done',
        },
        {
          id: 'jp-a3-3',
          name: 'Shibuya Sky',
          type: 'experience',
          reservationRequired: true,
          bookingUrl: 'https://www.shibuya-scramble-square.com/sky/ticket/',
          price: 2500,
          currency: 'JPY',
          status: 'done',
        },
      ],
    },
    {
      id: 'jp-d4',
      date: '2026-04-05',
      dayNumber: 4,
      city: 'Tokyo',
      title: 'Excursion à Nikko',
      coordinates: [36.7199, 139.6982],
      notes:
        'Prendre le Tobu Limited Express à Asakusa, 2 h. Penser au Nikko Pass.',
      activities: [
        {
          id: 'jp-a4-1',
          name: 'Toshogu',
          type: 'visit',
          price: 1600,
          currency: 'JPY',
          status: 'done',
        },
        { id: 'jp-a4-2', name: 'Pont Shinkyo', type: 'visit', status: 'done' },
      ],
    },
    {
      id: 'jp-d5',
      date: '2026-04-06',
      dayNumber: 5,
      city: 'Hakone',
      title: 'Onsen à Hakone',
      coordinates: [35.2324, 139.1069],
      notes:
        'Ryokan : dîner kaiseki à 18h, prévenir pour les allergies de Léa.',
      accommodation: {
        id: 'jp-acc-ginyu',
        name: 'Hakone Ginyu',
        address: '100-1 Miyanoshita, Hakone',
        bookingUrl: 'https://www.hakoneginyu.co.jp/english/',
        checkIn: '2026-04-06T15:00',
        checkOut: '2026-04-07T10:00',
        bookingReference: 'HKN-55821',
        price: 540,
        currency: 'EUR',
        status: 'booked',
      },
      transport: {
        id: 'jp-tr-hakone',
        type: 'train',
        from: 'Tokyo (Shinjuku)',
        to: 'Hakone-Yumoto',
        details: 'Odakyu Romancecar',
        departureTime: '2026-04-06T10:00',
        arrivalTime: '2026-04-06T11:25',
        duration: '1h25',
        provider: 'Odakyu',
        price: 2470,
        currency: 'JPY',
        status: 'completed',
      },
      activities: [
        { id: 'jp-a5-1', name: 'Owakudani', type: 'visit', status: 'done' },
        { id: 'jp-a5-2', name: 'Lac Ashi', type: 'experience', status: 'done' },
      ],
    },
    {
      id: 'jp-d6',
      date: '2026-04-07',
      dayNumber: 6,
      city: 'Kyoto',
      title: "Fushimi Inari à l'aube",
      coordinates: [35.0116, 135.7681],
      accommodation: {
        id: 'jp-acc-kanra',
        name: 'Hotel Kanra Kyoto',
        address: '190 Kitamachi, Shimogyo-ku, Kyoto',
        bookingUrl: 'https://www.booking.com/hotel/jp/kanra-kyoto.fr.html',
        checkIn: '2026-04-07',
        checkOut: '2026-04-12',
        bookingReference: '88123456',
        price: 980,
        currency: 'EUR',
        status: 'booked',
      },
      transport: {
        id: 'jp-tr-shinkansen',
        type: 'train',
        from: 'Odawara',
        to: 'Kyoto',
        details: 'Shinkansen Hikari 637',
        departureTime: '2026-04-07T10:12:00+09:00',
        arrivalTime: '2026-04-07T12:15:00+09:00',
        duration: '2h03',
        provider: 'JR Central',
        bookingReference: 'SMART-EX 2211',
        seat: 'Voiture 7, 12A',
        price: 11500,
        currency: 'JPY',
        status: 'booked',
      },
      activities: [
        {
          id: 'jp-a6-1',
          name: 'Fushimi Inari-taisha',
          type: 'visit',
          openAt: '06:00',
          status: 'done',
        },
        { id: 'jp-a6-2', name: 'Tofuku-ji', type: 'visit', status: 'done' },
      ],
    },
    {
      id: 'jp-d7',
      date: '2026-04-08',
      dayNumber: 7,
      city: 'Kyoto',
      title: 'Arashiyama',
      coordinates: [35.0094, 135.6668],
      notes:
        'Kaiseki chez Gion Karyo réservé sur Tabelog au nom de Yanis Benali, acompte 5000 yens.',
      activities: [
        { id: 'jp-a7-1', name: 'Bambouseraie', type: 'visit', status: 'done' },
        { id: 'jp-a7-2', name: 'Tenryu-ji', type: 'visit', status: 'done' },
        {
          id: 'jp-a7-3',
          name: 'Kaiseki Gion Karyo',
          type: 'food',
          reservationRequired: true,
          price: 14000,
          currency: 'JPY',
          status: 'done',
        },
      ],
    },
    {
      id: 'jp-d8',
      date: '2026-04-09',
      dayNumber: 8,
      city: 'Kyoto',
      title: 'Journée libre à Kyoto',
      dayType: 'free',
      coordinates: [35.0116, 135.7681],
      activities: [],
    },
    {
      id: 'jp-d9',
      date: '2026-04-10',
      dayNumber: 9,
      city: 'Kyoto',
      title: 'Gion et Higashiyama',
      coordinates: [34.9986, 135.7787],
      activities: [
        { id: 'jp-a9-1', name: 'Kiyomizu-dera', type: 'visit', status: 'done' },
        { id: 'jp-a9-2', name: 'Ninenzaka', type: 'shopping', status: 'done' },
      ],
    },
    {
      id: 'jp-d10',
      date: '2026-04-11',
      dayNumber: 10,
      city: 'Nara',
      title: 'Excursion à Nara',
      coordinates: [34.6851, 135.8048],
      transport: {
        id: 'jp-tr-nara',
        type: 'train',
        from: 'Kyoto',
        to: 'Kintetsu Nara',
        details: 'Kintetsu Limited Express',
        departureTime: '2026-04-11 08:40',
        duration: '35 min',
        price: 1280,
        currency: 'JPY',
        status: 'completed',
      },
      activities: [
        { id: 'jp-a10-1', name: 'Todai-ji', type: 'visit', status: 'done' },
        { id: 'jp-a10-2', name: 'Parc de Nara', type: 'visit', status: 'done' },
      ],
    },
    {
      id: 'jp-d11',
      date: '2026-04-12',
      dayNumber: 11,
      city: 'Osaka',
      title: 'Arrivée à Osaka',
      coordinates: [34.6937, 135.5023],
      accommodation: {
        id: 'jp-acc-cross',
        name: 'Cross Hotel Osaka',
        address: '2-5-15 Shinsaibashisuji, Chuo-ku, Osaka',
        bookingUrl:
          'https://www.booking.com/hotel/jp/cross-osaka.fr.html?aid=304142&label=gen173nr',
        checkIn: '2026-04-12T15:00',
        checkOut: '2026-04-15T11:00',
        price: 450,
        currency: 'EUR',
        status: 'booked',
      },
      transport: {
        id: 'jp-tr-osaka',
        type: 'train',
        from: 'Kyoto',
        to: 'Shin-Osaka',
        details: 'JR Special Rapid',
        departureTime: '2026-04-12T10:30',
        duration: '25 min',
        price: 580,
        currency: 'JPY',
      },
      activities: [{ id: 'jp-a11-1', name: 'Dotonbori', type: 'food' }],
    },
    {
      id: 'jp-d12',
      date: '2026-04-13',
      dayNumber: 12,
      city: 'Osaka',
      title: "Château d'Osaka et Umeda",
      coordinates: [34.6873, 135.5262],
      activities: [
        { id: 'jp-a12-1', name: "Château d'Osaka", type: 'visit' },
        { id: 'jp-a12-2', name: 'Umeda Sky Building', type: 'visit' },
      ],
    },
    {
      id: 'jp-d13',
      date: '2026-04-14',
      dayNumber: 13,
      city: 'Osaka',
      title: 'Universal Studios',
      coordinates: [34.6654, 135.4323],
      activities: [
        {
          id: 'jp-a13-1',
          name: 'Universal Studios Japan',
          type: 'experience',
          reservationRequired: true,
          bookingUrl: 'https://www.usj.co.jp/web/en/us/tickets',
          price: 9800,
          currency: 'JPY',
        },
      ],
    },
    {
      id: 'jp-d14',
      date: '2026-04-15',
      dayNumber: 14,
      city: 'Osaka',
      title: 'Départ',
      dayType: 'departure',
      coordinates: [34.4347, 135.244],
      transport: {
        id: 'jp-tr-retour',
        type: 'plane',
        from: 'KIX Kansai Intl.',
        to: 'Paris CDG',
        details: 'Air France AF291',
        departureTime: '2026-04-15T11:45',
        arrivalTime: '2026-04-15T18:30',
        provider: 'Air France',
        bookingReference: 'Q7XK2P',
        bookingUrl:
          'https://wwws.airfrance.fr/trip/manage?bookingCode=Q7XK2P&lastName=BENALI',
        seat: '41A',
        status: 'booked',
      },
      activities: [],
    },
  ]
}

// ── 3. Italie en voiture, 9 jours, 5 villes ──────────────────────────────────

function florenceNight(id: string) {
  return {
    id,
    name: 'Hotel Davanzati',
    address: 'Via Porta Rossa 5, Firenze',
    bookingUrl: 'https://www.hoteldavanzati.it/',
    checkIn: '2026-09-17T14:00',
    checkOut: '2026-09-20T11:00',
    bookingReference: 'DAV-7781',
    price: 560,
    currency: 'EUR',
    status: 'booked' as const,
  }
}

function italyRoadTrip(): DayItinerary[] {
  return [
    {
      id: 'it-d1',
      date: '2026-09-12',
      dayNumber: 1,
      city: 'Rome',
      title: 'Arrivée à Rome, Trastevere',
      coordinates: [41.8897, 12.4708],
      notes: 'Clés à récupérer chez Giulia (+39 347 123 4567), digicode 81922.',
      accommodation: {
        id: 'it-acc-rome',
        name: 'Hotel Santa Maria',
        address: 'Vicolo del Piede 2, Roma',
        bookingUrl: 'https://www.hotelsantamariatrastevere.it/',
        checkIn: '2026-09-12T14:00',
        checkOut: '2026-09-14T11:00',
        bookingReference: 'SM-20931',
        price: 390,
        currency: 'EUR',
        status: 'booked',
      },
      transport: {
        id: 'it-tr-aller',
        type: 'plane',
        from: 'Paris Orly',
        to: 'Rome Fiumicino (FCO)',
        details: 'Transavia TO3410',
        departureTime: '2026-09-12T07:05',
        arrivalTime: '2026-09-12T09:10',
        provider: 'Transavia',
        bookingReference: 'TVX9QA',
        price: 156,
        currency: 'EUR',
        status: 'booked',
      },
      activities: [
        {
          id: 'it-a1-1',
          name: 'Santa Maria in Trastevere',
          type: 'visit',
          status: 'done',
        },
        { id: 'it-a1-2', name: 'Da Enzo al 29', type: 'food', status: 'done' },
      ],
    },
    {
      id: 'it-d2',
      date: '2026-09-13',
      dayNumber: 2,
      city: 'Rome',
      title: 'Colisée et Forum',
      coordinates: [41.8902, 12.4922],
      activities: [
        {
          id: 'it-a2-1',
          name: 'Colisée',
          type: 'visit',
          reservationRequired: true,
          bookingUrl: 'https://ticketing.colosseo.it/en/',
          price: 18,
          currency: 'EUR',
          status: 'done',
        },
        { id: 'it-a2-2', name: 'Forum romain', type: 'visit', status: 'done' },
      ],
    },
    {
      id: 'it-d3',
      date: '2026-09-14',
      dayNumber: 3,
      city: 'Orvieto',
      title: 'Orvieto, la ville perchée',
      coordinates: [42.7185, 12.1107],
      transport: {
        id: 'it-tr-location',
        type: 'car',
        from: 'Rome',
        to: 'Orvieto',
        details: 'Location Fiat 500L, prise à Roma Termini, rendue à Florence',
        departureAddress: 'Via Giovanni Giolitti 34, Roma Termini',
        departureTime: '2026-09-14T09:00',
        duration: '1h30',
        provider: 'Hertz',
        bookingReference: 'H4471PZ9',
        bookingUrl:
          'https://www.hertz.fr/rentacar/reservation/retrieveConfirmation?confirmationNumber=H4471PZ9',
        price: 412,
        currency: 'EUR',
        status: 'booked',
        notes:
          'Franchise 1200 €, assurance Hertz refusée (couverte par la Visa Premier).',
      },
      accommodation: {
        id: 'it-acc-orvieto',
        name: 'Agriturismo Le Casette',
        address: 'Località Le Casette, Orvieto',
        bookingUrl: 'https://www.agriturismolecasette.it',
        checkIn: '2026-09-14',
        checkOut: '2026-09-15',
        price: 120,
        currency: 'EUR',
        status: 'booked',
      },
      activities: [
        {
          id: 'it-a3-1',
          name: "Duomo d'Orvieto",
          type: 'visit',
          status: 'done',
        },
        {
          id: 'it-a3-2',
          name: 'Pozzo di San Patrizio',
          type: 'visit',
          status: 'done',
        },
      ],
    },
    {
      id: 'it-d4',
      date: '2026-09-15',
      dayNumber: 4,
      city: 'Sienne',
      title: 'Sienne et le Campo',
      coordinates: [43.3188, 11.3308],
      transport: {
        id: 'it-tr-sienne',
        type: 'car',
        from: 'Orvieto',
        to: 'Sienne',
        departureTime: '2026-09-15T10:00',
        duration: '1h45',
        details: 'Par la SR2, parking Il Duomo (ZTL interdite !)',
      },
      accommodation: {
        id: 'it-acc-sienne',
        name: 'Palazzo Ravizza',
        address: 'Pian dei Mantellini 34, Siena',
        bookingUrl: 'https://www.booking.com/hotel/it/palazzo-ravizza.fr.html',
        checkIn: '2026-09-15',
        checkOut: '2026-09-17',
        bookingReference: '3310987722',
        price: 310,
        currency: 'EUR',
        status: 'booked',
      },
      activities: [
        {
          id: 'it-a4-1',
          name: 'Piazza del Campo',
          type: 'visit',
          status: 'done',
        },
        {
          id: 'it-a4-2',
          name: 'Duomo di Siena',
          type: 'visit',
          reservationRequired: true,
          status: 'done',
        },
      ],
    },
    {
      id: 'it-d5',
      date: '2026-09-16',
      dayNumber: 5,
      city: 'Sienne',
      title: "Val d'Orcia en voiture",
      coordinates: [43.0773, 11.6782],
      notes: 'Dégustation chez Marco à Montepulciano, 16h, 25 € par personne.',
      activities: [
        { id: 'it-a5-1', name: 'Pienza', type: 'visit', status: 'done' },
        { id: 'it-a5-2', name: 'Montepulciano', type: 'visit', status: 'done' },
      ],
    },
    {
      id: 'it-d6',
      date: '2026-09-17',
      dayNumber: 6,
      city: 'Florence',
      title: 'Arrivée à Florence',
      coordinates: [43.7696, 11.2558],
      transport: {
        id: 'it-tr-florence',
        type: 'car',
        from: 'Sienne',
        to: 'Florence',
        details: 'Rendre la voiture chez Hertz Firenze avant 12h',
        departureTime: '2026-09-17T09:30',
        duration: '1h15',
      },
      accommodation: florenceNight('it-acc-florence'),
      activities: [
        { id: 'it-a6-1', name: 'Ponte Vecchio', type: 'visit', status: 'done' },
        {
          id: 'it-a6-2',
          name: 'Piazzale Michelangelo',
          type: 'visit',
          status: 'done',
        },
      ],
    },
    {
      id: 'it-d7',
      date: '2026-09-18',
      dayNumber: 7,
      city: 'Florence',
      title: 'Offices et Duomo',
      coordinates: [43.7687, 11.2569],
      // Import d'un tableur : l'hôtel est répété sur chaque nuit.
      accommodation: florenceNight('it-acc-florence-2'),
      activities: [
        {
          id: 'it-a7-1',
          name: 'Galerie des Offices',
          type: 'visit',
          reservationRequired: true,
          bookingUrl: 'https://www.uffizi.it/en/tickets',
          price: 29,
          currency: 'EUR',
          status: 'done',
        },
        {
          id: 'it-a7-2',
          name: 'Coupole de Brunelleschi',
          type: 'visit',
          reservationRequired: true,
          status: 'done',
        },
      ],
    },
    {
      id: 'it-d8',
      date: '2026-09-19',
      dayNumber: 8,
      city: 'Florence',
      title: 'Oltrarno',
      coordinates: [43.7652, 11.2486],
      accommodation: florenceNight('it-acc-florence-3'),
      activities: [
        { id: 'it-a8-1', name: 'Palais Pitti', type: 'visit', status: 'done' },
        {
          id: 'it-a8-2',
          name: 'Jardin de Boboli',
          type: 'visit',
          status: 'done',
        },
      ],
    },
    {
      id: 'it-d9',
      date: '2026-09-20',
      dayNumber: 9,
      city: 'Pise',
      title: 'Pise et vol retour',
      dayType: 'departure',
      coordinates: [43.7228, 10.4017],
      transport: {
        id: 'it-tr-pise',
        type: 'train',
        from: 'Florence',
        to: 'Pise',
        details: 'Regionale Firenze SMN → Pisa Centrale',
        departureTime: '2026-09-20T09:08',
        duration: '1h',
        price: 9.1,
        currency: 'EUR',
      },
      activities: [
        { id: 'it-a9-1', name: 'Tour de Pise', type: 'visit', status: 'done' },
      ],
    },
  ]
}

// ── 4. Week-end à Lisbonne ───────────────────────────────────────────────────

function lisbonWeekend(): DayItinerary[] {
  return [
    {
      id: 'lx-d1',
      date: '2026-03-14',
      dayNumber: 1,
      city: 'Lisbonne',
      title: 'Alfama et Graça',
      coordinates: [38.7139, -9.1334],
      notes:
        'Airbnb : boîte à clés code 2580, hôte Rui au +351 912 345 678 ou rui.alfama@gmail.com. Dîner au Tasca do Chico, demander Joaquim.',
      accommodation: {
        id: 'lx-acc',
        name: 'Appartement Alfama (Airbnb)',
        address: 'Rua dos Remédios 45, Lisboa',
        bookingUrl:
          'https://www.airbnb.fr/trips/v1/reservation-details/ro/RESERVATION2_CHECKIN/HMQ4ZK8ABC',
        checkIn: '2026-03-14T16:00',
        checkOut: '2026-03-16T10:00',
        bookingReference: 'HMQ4ZK8ABC',
        price: 238,
        currency: 'EUR',
        status: 'booked',
      },
      transport: {
        id: 'lx-tr-aller',
        type: 'plane',
        from: 'Paris Orly',
        to: 'Lisbonne (LIS)',
        details: 'TAP TP433',
        departureTime: '2026-03-14T08:20',
        arrivalTime: '2026-03-14T10:00',
        bookingReference: 'TP8XQ2',
        seat: '17C',
        price: 142,
        currency: 'EUR',
        status: 'booked',
      },
      activities: [
        {
          id: 'lx-a1-1',
          name: 'Miradouro da Graça',
          type: 'visit',
          status: 'done',
        },
        { id: 'lx-a1-2', name: 'Tram 28', type: 'experience', status: 'done' },
        {
          id: 'lx-a1-3',
          name: 'Tasca do Chico',
          type: 'food',
          reservationRequired: true,
          status: 'done',
        },
      ],
    },
    {
      id: 'lx-d2',
      date: '2026-03-15',
      dayNumber: 2,
      city: 'Lisbonne',
      title: 'Belém et LX Factory',
      coordinates: [38.6916, -9.2157],
      notes: 'Pastéis de Belém : faire la queue côté salle, pas au comptoir.',
      activities: [
        { id: 'lx-a2-1', name: 'Tour de Belém', type: 'visit', status: 'done' },
        {
          id: 'lx-a2-2',
          name: 'Pastéis de Belém',
          type: 'food',
          status: 'done',
        },
        {
          id: 'lx-a2-3',
          name: 'LX Factory',
          type: 'shopping',
          status: 'skipped',
        },
      ],
    },
  ]
}

// ── 5. Sans aucune date, villes manquantes (import d'un tableur) ─────────────

function undatedScotland(): DayItinerary[] {
  const base = { coordinates: [0, 0] as [number, number], activities: [] }
  return [
    {
      ...base,
      id: 'sc-1',
      date: '',
      dayNumber: 1,
      city: 'Édimbourg',
      title: 'Royal Mile',
      accommodation: {
        id: 'sc-acc-edi',
        name: 'Grassmarket Hotel',
        address: '94-96 Grassmarket, Edinburgh',
        bookingUrl: '',
        checkIn: '',
        checkOut: '',
      },
      activities: [
        {
          id: 'sc-a1',
          name: "Château d'Édimbourg",
          type: 'visit',
          reservationRequired: true,
        },
      ],
    },
    {
      ...base,
      id: 'sc-2',
      date: '',
      dayNumber: 2,
      city: 'Édimbourg',
      title: "Arthur's Seat",
    },
    {
      ...base,
      id: 'sc-3',
      date: '',
      dayNumber: 3,
      city: '',
      title: 'Route vers les Highlands',
      notes: 'Pause à Pitlochry, appeler Fiona pour la clé du cottage.',
      transport: {
        id: 'sc-tr-1',
        type: 'car',
        from: 'Édimbourg',
        to: 'Inverness',
        duration: '3h30',
      },
    },
    {
      ...base,
      id: 'sc-4',
      date: '',
      dayNumber: 4,
      city: 'Inverness',
      title: 'Loch Ness',
      accommodation: {
        id: 'sc-acc-inv',
        name: 'Cottage de Fiona',
        address: '',
        bookingUrl: '',
        checkIn: '',
        checkOut: '',
      },
    },
    {
      ...base,
      id: 'sc-5',
      date: '',
      dayNumber: 5,
      city: '',
      title: 'Île de Skye',
    },
    {
      ...base,
      id: 'sc-6',
      date: '',
      dayNumber: 6,
      city: 'Glasgow',
      title: 'Retour par Glencoe',
      transport: {
        id: 'sc-tr-2',
        type: 'car',
        from: 'Inverness',
        to: 'Glasgow',
      },
    },
  ]
}

// ── 6. Voyage du générateur ─────────────────────────────────────────────────

const GENERATED_VIETNAM: GeneratedItinerary = {
  tripTitle: '10 jours au Viêt Nam, du nord au sud',
  summary: 'Hanoï, la baie d’Along, Hội An et Saïgon.',
  days: [
    {
      date: '2026-11-20',
      city: 'Hanoï',
      title: 'Vieux quartier de Hanoï',
      dayType: 'arrival',
      coordinates: { lat: 21.0285, lng: 105.8542 },
      notes: 'Journée douce pour encaisser le décalage horaire.',
      tips: [
        'Traverser la rue à allure constante, les scooters vous contournent',
      ],
      activities: [
        { name: 'Lac Hoan Kiem', type: 'visit', duration: '1h' },
        {
          name: 'Bún chả chez Hương Liên',
          type: 'food',
          price: 60000,
          currency: 'VND',
        },
      ],
    },
    {
      date: '2026-11-21',
      city: 'Hanoï',
      title: 'Mausolée et temple de la Littérature',
      dayType: 'sightseeing',
      coordinates: { lat: 21.0368, lng: 105.8346 },
      notes: 'Le Mausolée ferme le lundi et l’après-midi : y aller avant 11h.',
      activities: [
        { name: 'Mausolée de Hô Chi Minh', type: 'visit' },
        {
          name: 'Temple de la Littérature',
          type: 'visit',
          price: 30000,
          currency: 'VND',
        },
        {
          name: 'Spectacle de marionnettes sur l’eau',
          type: 'experience',
          reservationRequired: true,
        },
      ],
    },
    {
      date: '2026-11-22',
      city: 'Baie d’Along',
      title: 'Croisière dans la baie',
      dayType: 'travel',
      notes: 'Nuit à bord de la jonque, réservée par le voyageur.',
      transport: {
        type: 'bus',
        from: 'Hanoï',
        to: 'Baie d’Along',
        duration: '2h30',
      },
      activities: [
        {
          name: 'Croisière en jonque',
          type: 'experience',
          reservationRequired: true,
        },
        { name: 'Kayak dans la grotte Luon', type: 'experience' },
      ],
    },
    {
      date: '2026-11-23',
      city: 'Hội An',
      title: 'Arrivée à Hội An',
      dayType: 'travel',
      coordinates: { lat: 15.8801, lng: 108.338 },
      transport: {
        type: 'plane',
        from: 'Hanoï',
        to: 'Đà Nẵng',
        details: 'Vietnam Airlines ou Vietjet, 1h20',
        duration: '1h20',
      },
      activities: [{ name: 'Vieille ville de Hội An', type: 'visit' }],
    },
    {
      date: '2026-11-24',
      city: 'Hội An',
      title: 'Sur mesure chez le tailleur',
      dayType: 'sightseeing',
      coordinates: { lat: 15.8794, lng: 108.335 },
      notes:
        'Commander les vêtements tôt : deux essayages chez Bebe Tailor avant le départ.',
      activities: [
        { name: 'Pont couvert japonais', type: 'visit' },
        {
          name: 'Cours de cuisine à Tra Que',
          type: 'experience',
          reservationRequired: true,
        },
      ],
    },
    {
      date: '2026-11-25',
      city: 'Hội An',
      title: 'Journée de repos à la plage',
      dayType: 'rest',
      coordinates: { lat: 15.9, lng: 108.37 },
      activities: [{ name: 'Plage d’An Bàng', type: 'experience' }],
    },
    {
      date: '2026-11-26',
      city: 'Hô Chi Minh-Ville',
      title: 'Saïgon moderne',
      dayType: 'travel',
      coordinates: { lat: 10.7769, lng: 106.7009 },
      transport: {
        type: 'plane',
        from: 'Đà Nẵng',
        to: 'Hô Chi Minh-Ville',
        duration: '1h25',
      },
      activities: [{ name: 'Marché Bến Thành', type: 'shopping' }],
    },
    {
      date: '2026-11-27',
      city: 'Hô Chi Minh-Ville',
      title: 'Tunnels de Cu Chi',
      dayType: 'sightseeing',
      activities: [
        { name: 'Tunnels de Cu Chi', type: 'visit', reservationRequired: true },
      ],
    },
    {
      date: '2026-11-28',
      city: 'Delta du Mékong',
      title: 'Marchés flottants',
      dayType: 'sightseeing',
      coordinates: { lat: 10.0452, lng: 105.7469 },
      transport: {
        type: 'bus',
        from: 'Hô Chi Minh-Ville',
        to: 'Cần Thơ',
        duration: '3h30',
      },
      activities: [{ name: 'Marché flottant de Cái Răng', type: 'visit' }],
    },
    {
      date: '2026-11-29',
      city: 'Hô Chi Minh-Ville',
      title: 'Départ',
      dayType: 'departure',
      coordinates: { lat: 10.8188, lng: 106.6519 },
      transport: {
        type: 'bus',
        from: 'Cần Thơ',
        to: 'Hô Chi Minh-Ville',
        duration: '3h30',
      },
      activities: [{ name: 'Café vietnamien à la Bến Thành', type: 'food' }],
    },
  ],
}

/** Comme `/api/generate` : la réponse validée par le schéma, puis convertie. */
function generatedVietnam(): DayItinerary[] {
  return toDayItineraries(generatedItinerarySchema.parse(GENERATED_VIETNAM))
}

// ── Outils ────────────────────────────────────────────────────────────────────

const PUBLISHED_AT = new Date('2026-11-03T10:00:00.000Z')

/** Publie comme le ferait A3, puis relit comme le repreneur (B2). */
async function publishAndRead(
  itinerary: readonly DayItinerary[],
  country: string,
  options: TemplateOptions = DEFAULT_TEMPLATE_OPTIONS,
): Promise<PublicTemplate> {
  const bucket = createMemoryTemplateBucket()
  const { meta } = await publishTemplate(bucket, {
    itinerary,
    title: null,
    authorName: 'Yanis',
    country,
    options,
    indexable: true,
    now: PUBLISHED_AT,
  })
  const read = await readTemplate(bucket, meta.id)
  if (read.status !== 'active') throw new Error(`Lecture : ${read.status}`)
  return read.template
}

/** Ce que A3 surligne : `kind:texte`, dans l'ordre. */
function highlights(text: string, spans: readonly SensitiveSpan[]): string[] {
  return spans.map((span) => `${span.kind}:${text.slice(span.start, span.end)}`)
}

function noteHighlights(note: string, trip: readonly DayItinerary[]) {
  return highlights(note, sensitiveSpans(note, templateKnownPlaces(trip)))
}

function idsWithout(trip: readonly DayItinerary[], dayNumbers: number[]) {
  return trip
    .filter((day) => !dayNumbers.includes(day.dayNumber))
    .map((day) => day.id)
}

function idsOf(trip: readonly DayItinerary[], dayNumbers: number[]) {
  return trip
    .filter((day) => dayNumbers.includes(day.dayNumber))
    .map((day) => day.id)
}

function byId(trip: readonly DayItinerary[], id: string): DayItinerary {
  const found = trip.find((day) => day.id === id)
  if (!found) throw new Error(`Journée ${id} absente`)
  return found
}

/** Clés que le nettoyage retire toujours, où qu'elles soient. */
const PRIVATE_KEYS = [
  'bookingReference',
  'seat',
  'gate',
  'terminal',
  'status',
  'ownerTokenHash',
  'retiredAt',
]

function allKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => allKeys(item, keys))
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      keys.add(key)
      allKeys(item, keys)
    }
  }
  return keys
}

const placeKey = (text: string | undefined) =>
  (text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

// ── 1. Démo Chine ─────────────────────────────────────────────────────────────

describe('scénario réel : la démo Chine (20 jours)', () => {
  it('A2 : annonce les vrais chiffres de la démo', () => {
    expect(
      summarizeTemplateCleaning(demoItinerary, DEFAULT_TEMPLATE_OPTIONS),
    ).toEqual({
      goes: {
        days: 20,
        activities: 62,
        accommodations: 9,
        transports: 9,
        tips: 72,
      },
      stays: {
        bookingReferences: 2,
        seats: 5,
        statuses: 13,
        notes: 25,
        prices: 0,
        privateLinks: 7,
        deviceImages: 0,
      },
    })
  })

  it('A3 : ne prend aucun mot des notes de la démo pour un prénom', () => {
    const notes = demoItinerary.flatMap((day) =>
      [day.notes, day.transport?.notes].filter(
        (note): note is string => !!note,
      ),
    )
    const names = notes.flatMap((note) =>
      noteHighlights(note, demoItinerary).filter((h) => h.startsWith('name:')),
    )
    expect(names).toEqual([])
  })

  it('publie sans rien de privé, avec un slug, un titre et une année lisibles', async () => {
    const template = await publishAndRead(demoItinerary, 'CN')
    expect(template).toMatchObject({
      slug: 'chine-20-jours-shanghai-qingdao-beijing',
      title: 'Shanghai, Qingdao et 5 autres villes',
      country: 'CN',
      dayCount: 20,
      tripYear: 2026,
      listed: true,
      includesNotes: false,
    })
    const keys = allKeys(template)
    for (const key of [...PRIVATE_KEYS, 'notes'])
      expect(keys).not.toContain(key)
    const json = JSON.stringify(template)
    expect(json).not.toMatch(/confirmation|orderid|BJSKYR/i)
  })

  it('retirer Qingdao recoud Shanghai → Pékin, sans les horaires du G195', async () => {
    const template = await publishAndRead(demoItinerary, 'CN')
    const retimed = retimeTemplate(template.itinerary, {
      startDate: '2027-05-01',
      keptDayIds: idsWithout(template.itinerary, [3]),
    })
    expect(byId(retimed, 'day-2').transport).toEqual({
      id: 'tr-day2',
      type: 'train',
      from: 'Shanghai',
      to: 'Beijing',
    })
    expect(retimed.map((day) => day.city)).not.toContain('Qingdao')
  })

  it('retirer Zhangjiajie ne garde qu’un trajet recousu : celui du jour d’arrivée', async () => {
    const template = await publishAndRead(demoItinerary, 'CN')
    const retimed = retimeTemplate(template.itinerary, {
      startDate: '2027-05-01',
      keptDayIds: idsWithout(template.itinerary, [11, 12, 13]),
    })
    expect(byId(retimed, 'day-10').transport).toBeUndefined()
    expect(byId(retimed, 'day-14').transport).toEqual({
      id: 'tr-day14',
      type: 'plane',
      from: 'Chongqing',
      to: 'PVG Shanghai Pudong Intl.',
    })
  })

  it('retirer le jour 1 : l’hôtel de Shanghai passe sur la première nuit gardée', async () => {
    const template = await publishAndRead(demoItinerary, 'CN')
    const retimed = retimeTemplate(template.itinerary, {
      startDate: '2027-05-01',
      keptDayIds: idsWithout(template.itinerary, [1]),
    })
    expect(retimed[0].accommodation).toMatchObject({
      id: 'acc-day1',
      checkIn: '2027-05-01',
      checkOut: '2027-05-02',
    })
  })
})

// ── 2. Japon, 14 jours ────────────────────────────────────────────────────────

describe('scénario réel : Japon 14 jours écrit à la main', () => {
  it('A2 : compte chaque hôtel une fois et les références sans doublon', () => {
    expect(
      summarizeTemplateCleaning(japanTrip(), DEFAULT_TEMPLATE_OPTIONS),
    ).toEqual({
      goes: {
        days: 14,
        activities: 25,
        accommodations: 4,
        transports: 6,
        tips: 1,
      },
      stays: {
        bookingReferences: 5,
        seats: 4,
        statuses: 30,
        notes: 6,
        prices: 0,
        privateLinks: 2,
        deviceImages: 0,
      },
    })
  })

  it('A3 : montre le digicode, le téléphone et les prénoms des deux notes sensibles', () => {
    const excerpts = noteExcerpts(japanTrip())
    expect(
      excerpts.map((excerpt) => ({
        day: excerpt.dayNumber,
        marks: highlights(excerpt.text, excerpt.spans),
      })),
    ).toEqual([
      {
        day: 1,
        marks: ['digits:4471', 'name:Kenji', 'phone:080-3312-4471'],
      },
      {
        day: 3,
        marks: ['name:Mouzoune', 'name:Sarah', 'phone:03-3496-2241'],
      },
    ])
  })

  it('A3 : un lieu du voyage (Haneda, Gion Karyo) n’est jamais un prénom', () => {
    const trip = japanTrip()
    expect(noteHighlights(trip[0].notes!, trip)).not.toContain('name:Haneda')
    expect(noteHighlights(trip[6].notes!, trip)).toEqual([
      'name:Yanis Benali',
      'digits:5000',
    ])
  })

  it('publie sans références, sièges, notes ni liens de confirmation', async () => {
    const template = await publishAndRead(japanTrip(), 'JP')
    expect(template).toMatchObject({
      slug: 'japon-14-jours-tokyo-hakone-kyoto',
      title: 'Tokyo, Hakone et 3 autres villes',
      cities: ['Tokyo', 'Hakone', 'Kyoto', 'Nara', 'Osaka'],
      tripYear: 2026,
      listed: true,
      authorName: 'Yanis',
    })
    const json = JSON.stringify(template)
    for (const secret of [
      '4021553117',
      'Q7XK2P',
      'HKN-55821',
      '88123456',
      'SMART-EX',
      '34K',
      '4471',
      'Mouzoune',
      'BENALI',
      'confirmation',
    ]) {
      expect(json).not.toContain(secret)
    }
    expect(allKeys(template)).not.toContain('notes')
    expect(template.itinerary[0].accommodation?.bookingUrl).toBe('')
    expect(template.itinerary[13].transport).not.toHaveProperty('bookingUrl')
    expect(template.itinerary[5].accommodation?.bookingUrl).toBe(
      'https://www.booking.com/hotel/jp/kanra-kyoto.fr.html',
    )
  })

  it('reprise en 11 jours au 3 avril 2027 : du 3 au 13 avril, heures intactes (critère de B3)', async () => {
    const template = await publishAndRead(japanTrip(), 'JP')
    const keptDayIds = suggestKeptDayIds(template.itinerary, 11)
    // La journée libre, puis un jour au milieu des deux plus longs séjours
    // (Osaka, Tokyo) : le jour du vol retour reste.
    expect(idsWithout(template.itinerary, [3, 8, 13])).toEqual(keptDayIds)
    const retimed = retimeTemplate(template.itinerary, {
      startDate: '2027-04-03',
      keptDayIds,
    })
    expect(retimed.map((day) => [day.dayNumber, day.date])).toEqual(
      Array.from({ length: 11 }, (_, i) => [
        i + 1,
        `2027-04-${String(3 + i).padStart(2, '0')}`,
      ]),
    )
    expect(byId(retimed, 'jp-d6').transport).toMatchObject({
      departureTime: '2027-04-07T10:12:00+09:00',
      arrivalTime: '2027-04-07T12:15:00+09:00',
    })
    expect(byId(retimed, 'jp-d10').transport?.departureTime).toBe(
      '2027-04-10 08:40',
    )
    expect(retimed.at(-1)?.id).toBe('jp-d14')
    expect(durationChoice(template.itinerary.length, retimed.length)).toBe(
      'shorter',
    )
  })

  it('cale chaque séjour sur ses nuits, excursion à Nara comprise', async () => {
    const template = await publishAndRead(japanTrip(), 'JP')
    const retimed = retimeTemplate(template.itinerary, {
      startDate: '2027-04-03',
      keptDayIds: template.itinerary.map((day) => day.id),
    })
    const stays = retimed.flatMap((day) =>
      day.accommodation
        ? [
            [
              day.accommodation.name,
              day.accommodation.checkIn,
              day.accommodation.checkOut,
            ],
          ]
        : [],
    )
    expect(stays).toEqual([
      ['Hotel Gracery Shinjuku', '2027-04-03T15:00', '2027-04-07T11:00'],
      ['Hakone Ginyu', '2027-04-07T15:00', '2027-04-08T10:00'],
      ['Hotel Kanra Kyoto', '2027-04-08', '2027-04-13'],
      ['Cross Hotel Osaka', '2027-04-13T15:00', '2027-04-16T11:00'],
    ])
    // Le vol aller part la veille du jour 1, comme chez l'auteur.
    expect(retimed[0].transport?.departureTime).toBe('2027-04-02T13:55')
  })

  it('retirer Hakone retire son ryokan et le Romancecar ; B4 l’annonce « retiré »', async () => {
    const template = await publishAndRead(japanTrip(), 'JP')
    const keptDayIds = idsWithout(template.itinerary, [5])
    const retimed = retimeTemplate(template.itinerary, {
      startDate: '2027-04-03',
      keptDayIds,
    })
    const json = JSON.stringify(retimed)
    expect(json).not.toContain('Hakone Ginyu')
    expect(json).not.toContain('Hakone-Yumoto')
    const hakone = groupDaysByCity(
      template.itinerary,
      keptDayIds,
      '2027-04-03',
    ).find((group) => group.city === 'Hakone')
    expect(hakone).toMatchObject({ days: 0, range: null })
  })

  it('retirer la journée libre resserre le séjour à Kyoto', async () => {
    const template = await publishAndRead(japanTrip(), 'JP')
    const retimed = retimeTemplate(template.itinerary, {
      startDate: '2027-04-03',
      keptDayIds: idsWithout(template.itinerary, [8]),
    })
    expect(byId(retimed, 'jp-d6').accommodation).toMatchObject({
      checkIn: '2027-04-08',
      checkOut: '2027-04-12',
    })
    expect(retimed.map((day) => day.title)).not.toContain(
      'Journée libre à Kyoto',
    )
  })

  it('retirer l’arrivée à Kyoto : l’hôtel passe sur la nuit gardée suivante', async () => {
    const template = await publishAndRead(japanTrip(), 'JP')
    const retimed = retimeTemplate(template.itinerary, {
      startDate: '2027-04-03',
      keptDayIds: idsWithout(template.itinerary, [6]),
    })
    expect(byId(retimed, 'jp-d7').accommodation).toMatchObject({
      id: 'jp-acc-kanra',
      checkIn: '2027-04-08',
      checkOut: '2027-04-12',
    })
  })

  it('retirer la dernière ville : plus de vol depuis Kansai ni d’hôtel à Osaka', async () => {
    const template = await publishAndRead(japanTrip(), 'JP')
    const retimed = retimeTemplate(template.itinerary, {
      startDate: '2027-04-03',
      keptDayIds: idsWithout(template.itinerary, [11, 12, 13, 14]),
    })
    expect(retimed).toHaveLength(10)
    expect(JSON.stringify(retimed)).not.toMatch(/Osaka|Kansai/)
  })

  it('B5 : liste les 4 hôtels, 6 trajets et 3 visites sur réservation', async () => {
    const template = await publishAndRead(japanTrip(), 'JP')
    const retimed = retimeTemplate(template.itinerary, {
      startDate: '2027-04-03',
      keptDayIds: template.itinerary.map((day) => day.id),
    })
    expect(templateTodo(retimed)).toEqual({
      accommodations: [
        'Hotel Gracery Shinjuku',
        'Hakone Ginyu',
        'Hotel Kanra Kyoto',
        'Cross Hotel Osaka',
      ],
      transports: 6,
      bookableActivities: 3,
    })
  })

  it('l’origine du voyage repris garde l’auteur, l’année et les journées gardées', async () => {
    const template = await publishAndRead(japanTrip(), 'JP')
    const keptDayIds = suggestKeptDayIds(template.itinerary, 7)
    const retimed = retimeTemplate(template.itinerary, {
      startDate: '2027-04-03',
      keptDayIds,
    })
    const origin = buildTemplateOrigin(
      template,
      retimed,
      { startDate: '2027-04-03', keptDayIds },
      1_800_000_000_000,
    )
    expect(origin).toMatchObject({
      templateId: template.id,
      version: 1,
      title: 'Tokyo, Hakone et 3 autres villes',
      authorName: 'Yanis',
      tripYear: 2026,
      startDate: '2027-04-03',
      keptDayIds: retimed.map((day) => day.id),
    })
    expect(origin.base).toEqual(retimed)
  })
})

// ── 3. Italie en voiture ──────────────────────────────────────────────────────

describe('scénario réel : Italie en voiture (9 jours, 5 villes)', () => {
  it('A2 : l’hôtel répété sur chaque nuit compte une fois, prix compris', () => {
    const summary = summarizeTemplateCleaning(italyRoadTrip(), {
      includeNotes: true,
      includePrices: false,
    })
    expect(summary.goes).toEqual({
      days: 9,
      activities: 17,
      accommodations: 4,
      transports: 5,
      tips: 0,
    })
    expect(summary.stays).toMatchObject({
      bookingReferences: 5,
      notes: 0,
      prices: 9,
      privateLinks: 1,
    })
  })

  it('A3 : surligne le prénom, le téléphone italien et le digicode', () => {
    const trip = italyRoadTrip()
    expect(noteHighlights(trip[0].notes!, trip)).toEqual([
      'name:Giulia',
      'phone:+39 347 123 4567',
      'digits:81922',
    ])
  })

  it('publie sans la référence ni le lien de la location Hertz', async () => {
    const template = await publishAndRead(italyRoadTrip(), 'IT')
    expect(template.slug).toBe('italie-9-jours-rome-orvieto-sienne')
    const json = JSON.stringify(template)
    expect(json).not.toMatch(/H4471PZ9|hertz\.fr|Giulia|Visa Premier/)
    expect(template.itinerary[2].transport).toMatchObject({
      provider: 'Hertz',
      price: 412,
    })
  })

  it('l’hôtel répété sur chaque nuit (import de tableur) garde un seul séjour', async () => {
    const template = await publishAndRead(italyRoadTrip(), 'IT')
    const retimed = retimeTemplate(template.itinerary, {
      startDate: '2027-06-05',
      keptDayIds: idsWithout(template.itinerary, [6]),
    })
    const florence = retimed
      .filter((day) => day.city === 'Florence')
      .map((day) => [
        day.date,
        day.accommodation?.checkIn,
        day.accommodation?.checkOut,
      ])
    expect(florence).toEqual([
      ['2027-06-10', '2027-06-10T14:00', '2027-06-12T11:00'],
      ['2027-06-11', '2027-06-10T14:00', '2027-06-12T11:00'],
    ])
  })

  it('retirer Orvieto recoud Rome → Sienne en voiture, sans les détails de l’ancien trajet', async () => {
    const template = await publishAndRead(italyRoadTrip(), 'IT')
    const retimed = retimeTemplate(template.itinerary, {
      startDate: '2027-06-05',
      keptDayIds: idsWithout(template.itinerary, [3]),
    })
    expect(byId(retimed, 'it-d4').transport).toEqual({
      id: 'it-tr-sienne',
      type: 'car',
      from: 'Rome',
      to: 'Sienne',
    })
  })

  it('retirer Rome : la voiture vers Orvieto part de nulle part de connu', async () => {
    const template = await publishAndRead(italyRoadTrip(), 'IT')
    const retimed = retimeTemplate(template.itinerary, {
      startDate: '2027-06-05',
      keptDayIds: idsWithout(template.itinerary, [1, 2]),
    })
    expect(retimed[0].transport).toEqual({
      id: 'it-tr-location',
      type: 'car',
      to: 'Orvieto',
    })
  })

  it('B5 : les trajets en voiture ne comptent pas parmi les trajets à réserver', async () => {
    const template = await publishAndRead(italyRoadTrip(), 'IT')
    const retimed = retimeTemplate(template.itinerary, {
      startDate: '2027-06-05',
      keptDayIds: template.itinerary.map((day) => day.id),
    })
    expect(templateTodo(retimed)).toEqual({
      accommodations: [
        'Hotel Santa Maria',
        'Agriturismo Le Casette',
        'Palazzo Ravizza',
        'Hotel Davanzati',
      ],
      transports: 2,
      bookableActivities: 4,
    })
  })
})

// ── 4. Week-end à Lisbonne ────────────────────────────────────────────────────

describe('scénario réel : week-end à Lisbonne (2 jours)', () => {
  it('A3 : surligne code, prénoms, téléphone et e-mail de l’hôte', () => {
    const [excerpt] = noteExcerpts(lisbonWeekend())
    expect(highlights(excerpt.text, excerpt.spans)).toEqual([
      'digits:2580',
      'name:Rui',
      'phone:+351 912 345 678',
      'email:rui.alfama@gmail.com',
      'name:Joaquim',
    ])
  })

  it('deux jours suffisent pour être listé ; un seul jour reste en lien seulement', async () => {
    const weekend = await publishAndRead(lisbonWeekend(), 'PT')
    expect(weekend).toMatchObject({
      slug: 'portugal-2-jours-lisbonne',
      title: 'Lisbonne',
      listed: true,
    })
    expect(weekend.itinerary[0].accommodation?.bookingUrl).toBe('')
    const oneDay = await publishAndRead(lisbonWeekend().slice(0, 1), 'PT')
    expect(oneDay).toMatchObject({
      slug: 'portugal-1-jour-lisbonne',
      listed: false,
    })
  })

  it('notes incluses par l’auteur : elles partent telles quelles', async () => {
    const template = await publishAndRead(lisbonWeekend(), 'PT', {
      includeNotes: true,
      includePrices: true,
    })
    expect(template.includesNotes).toBe(true)
    expect(template.itinerary[0].notes).toContain('+351 912 345 678')
  })

  it('reprise d’un seul jour : l’appartement ne compte plus qu’une nuit', async () => {
    const template = await publishAndRead(lisbonWeekend(), 'PT')
    const first = retimeTemplate(template.itinerary, {
      startDate: '2027-02-27',
      keptDayIds: suggestKeptDayIds(template.itinerary, 1),
    })
    expect(first).toHaveLength(1)
    expect(first[0].accommodation).toMatchObject({
      checkIn: '2027-02-27T16:00',
      checkOut: '2027-02-28T10:00',
    })
    const second = retimeTemplate(template.itinerary, {
      startDate: '2027-02-27',
      keptDayIds: idsOf(template.itinerary, [2]),
    })
    expect(second[0]).toMatchObject({ id: 'lx-d2', date: '2027-02-27' })
    expect(second[0].accommodation).toMatchObject({
      id: 'lx-acc',
      checkIn: '2027-02-27T16:00',
      checkOut: '2027-02-28T10:00',
    })
    expect(second[0].transport).toBeUndefined()
  })
})

// ── 5. Sans dates, villes manquantes ──────────────────────────────────────────

describe('scénario réel : Écosse importée sans aucune date', () => {
  it('se publie sans année, avec un slug tiré des villes renseignées', async () => {
    const template = await publishAndRead(undatedScotland(), 'GB')
    expect(template).toMatchObject({
      slug: 'royaume-uni-6-jours-edimbourg-inverness-glasgow',
      title: 'Édimbourg, Inverness et Glasgow',
      tripYear: null,
      listed: true,
    })
  })

  it('le jour 1 prend la date choisie ; les séjours sans date le restent', async () => {
    const template = await publishAndRead(undatedScotland(), 'GB')
    const retimed = retimeTemplate(template.itinerary, {
      startDate: '2027-07-10',
      keptDayIds: template.itinerary.map((day) => day.id),
    })
    expect(retimed.map((day) => day.date)).toEqual([
      '2027-07-10',
      '2027-07-11',
      '2027-07-12',
      '2027-07-13',
      '2027-07-14',
      '2027-07-15',
    ])
    expect(retimed[0].accommodation).toMatchObject({
      checkIn: '',
      checkOut: '',
    })
  })

  it('B4 : une journée sans ville forme une étape au nom vide', async () => {
    const template = await publishAndRead(undatedScotland(), 'GB')
    const groups = groupDaysByCity(
      template.itinerary,
      template.itinerary.map((day) => day.id),
      '2027-07-10',
    )
    expect(groups.map((group) => group.city)).toEqual([
      'Édimbourg',
      '',
      'Inverness',
      '',
      'Glasgow',
    ])
  })

  it('retirer Inverness : le trajet qui y menait disparaît, le suivant perd son départ', async () => {
    const template = await publishAndRead(undatedScotland(), 'GB')
    const retimed = retimeTemplate(template.itinerary, {
      startDate: '2027-07-10',
      keptDayIds: idsWithout(template.itinerary, [4]),
    })
    expect(byId(retimed, 'sc-3').transport).toBeUndefined()
    expect(byId(retimed, 'sc-6').transport).toEqual({
      id: 'sc-tr-2',
      type: 'car',
      to: 'Glasgow',
    })
  })
})

// ── 6. Voyage du générateur ───────────────────────────────────────────────────

describe('scénario réel : voyage tiré du générateur (Viêt Nam, 10 jours)', () => {
  it('A2 : ni hôtel ni statut « prévu » compté', () => {
    const summary = summarizeTemplateCleaning(
      generatedVietnam(),
      DEFAULT_TEMPLATE_OPTIONS,
    )
    expect(summary.goes).toMatchObject({ accommodations: 0, transports: 5 })
    expect(summary.stays).toMatchObject({ statuses: 0, notes: 4 })
  })

  it('se publie avec ses coordonnées manquantes en [0, 0] et un slug sans accents', async () => {
    const template = await publishAndRead(generatedVietnam(), 'VN')
    expect(template.slug).toBe('viet-nam-10-jours-hanoi-baie-d-along-hoi-an')
    expect(template.itinerary[7].coordinates).toEqual([0, 0])
    expect(template.cities).toEqual([
      'Hanoï',
      'Baie d’Along',
      'Hội An',
      'Hô Chi Minh-Ville',
      'Delta du Mékong',
    ])
  })

  it('suggère de retirer d’abord la journée de repos, puis un jour du plus long séjour, jamais le départ', async () => {
    const template = await publishAndRead(generatedVietnam(), 'VN')
    // La plage à Hội An (repos), puis le 2ᵉ jour à Saïgon : le plus tardif des
    // séjours de deux jours. Le delta du Mékong et le départ restent.
    expect(suggestKeptDayIds(template.itinerary, 8)).toEqual(
      idsWithout(template.itinerary, [6, 8]),
    )
  })

  it('B5 : ni hôtel ni référence, tous les trajets restent à réserver', async () => {
    const template = await publishAndRead(generatedVietnam(), 'VN')
    const retimed = retimeTemplate(template.itinerary, {
      startDate: '2027-01-10',
      keptDayIds: template.itinerary.map((day) => day.id),
    })
    expect(templateTodo(retimed)).toEqual({
      accommodations: [],
      transports: 5,
      bookableActivities: 4,
    })
  })
})

// ── Invariants sur toutes les sélections ──────────────────────────────────────

const SCENARIOS: [string, () => DayItinerary[]][] = [
  ['démo Chine', () => demoItinerary],
  ['Japon', japanTrip],
  ['Italie', italyRoadTrip],
  ['Lisbonne', lisbonWeekend],
  ['Écosse sans dates', undatedScotland],
  ['générateur Viêt Nam', generatedVietnam],
]

/** Chaque journée retirée seule, chaque ville retirée, chaque début et fin. */
function selectionsOf(trip: readonly DayItinerary[]): string[][] {
  const ids = trip.map((day) => day.id)
  const selections: string[][] = [ids]
  ids.forEach((_, index) =>
    selections.push(ids.filter((__, other) => other !== index)),
  )
  for (let count = 1; count < ids.length; count++) {
    selections.push(ids.slice(0, count), ids.slice(ids.length - count))
  }
  for (const city of new Set(trip.map((day) => placeKey(day.city)))) {
    selections.push(
      trip.filter((day) => placeKey(day.city) !== city).map((day) => day.id),
    )
  }
  return selections.filter((selection) => selection.length > 0)
}

describe.each(SCENARIOS)(
  'invariants du recalage : %s',
  (_: string, build: () => DayItinerary[]) => {
    it('dates sans trou, séjours cohérents, B4 annonce les dates de B5', () => {
      const template = cleanForTemplate(build(), DEFAULT_TEMPLATE_OPTIONS)
      const templateCities = new Set(
        template.map((day) => placeKey(day.city)).filter(Boolean),
      )
      for (const startDate of ['2027-03-27', '2028-02-25']) {
        for (const keptDayIds of selectionsOf(template)) {
          const retimed = retimeTemplate(template, { startDate, keptDayIds })
          const keptCities = new Set(retimed.map((day) => placeKey(day.city)))
          const end = addDays(startDate, retimed.length)
          retimed.forEach((day, rank) => {
            expect(day.date).toBe(addDays(startDate, rank))
            expect(day.dayNumber).toBe(rank + 1)
            const stay = day.accommodation
            const checkIn = stay && splitIsoDateValue(stay.checkIn)
            const checkOut = stay && splitIsoDateValue(stay.checkOut)
            if (checkIn && checkOut) {
              // La nuit de la journée tombe dans le séjour, qui finit au plus
              // tard le lendemain de la dernière journée.
              expect(checkIn.date <= day.date).toBe(true)
              expect(day.date < checkOut.date).toBe(true)
              expect(checkOut.date <= end).toBe(true)
            }
            const transport = day.transport
            if (transport?.from && transport.to) {
              expect(placeKey(transport.from)).not.toBe(placeKey(transport.to))
            }
            for (const place of [transport?.from, transport?.to]) {
              const key = placeKey(place)
              if (templateCities.has(key))
                expect(keptCities.has(key)).toBe(true)
            }
          })
          const announced = groupDaysByCity(template, keptDayIds, startDate)
            .flatMap((group) => group.entries)
            .filter((day) => day.kept)
            .map((day) => [day.id, day.date])
          expect(announced).toEqual(retimed.map((day) => [day.id, day.date]))
        }
      }
    })
  },
)

// ── Défauts relevés par ces scénarios, corrigés ───────────────────────────────
//
// Anciens `it.fails` de la campagne de test, gardés en non-régression.

describe('défauts corrigés (anciens it.fails, gardés en non-régression)', () => {
  it('B5 : un trajet ou un hôtel marqué « Réservé » sans référence ne reste pas à réserver', async () => {
    const template = await publishAndRead(japanTrip(), 'JP')
    const retimed = retimeTemplate(template.itinerary, {
      startDate: '2027-04-03',
      keptDayIds: template.itinerary.map((day) => day.id),
    })
    // Le repreneur touche « Réservé » sur chaque trajet et chaque hôtel
    // (transport-screen.tsx), sans saisir de référence.
    const booked = retimed.map((day) => ({
      ...day,
      ...(day.accommodation && {
        accommodation: { ...day.accommodation, status: 'booked' as const },
      }),
      ...(day.transport && {
        transport: { ...day.transport, status: 'booked' as const },
      }),
    }))
    expect(templateTodo(booked)).toEqual({
      accommodations: [],
      transports: 0,
      // Les visites ne sont ni faites ni abandonnées : elles restent.
      bookableActivities: 3,
    })
    // Bannière et pastilles disent la même chose.
    for (const day of booked) {
      if (day.accommodation) expect(needsBooking(day.accommodation)).toBe(false)
      if (day.transport) expect(needsBooking(day.transport)).toBe(false)
    }
  })

  it('retirer le 2e passage à Shanghai recoud Zhangjiajie → Taipei, sans le vol 9C8951', async () => {
    const template = await publishAndRead(demoItinerary, 'CN')
    const retimed = retimeTemplate(template.itinerary, {
      startDate: '2027-05-01',
      keptDayIds: idsWithout(template.itinerary, [14, 15]),
    })
    const taipei = byId(retimed, 'day-16')
    expect(retimed[retimed.indexOf(taipei) - 1].city).toBe('Zhangjiajie')
    expect(taipei.transport).toEqual({
      id: 'tr-day16',
      type: 'plane',
      from: 'Zhangjiajie',
      to: 'Taipei',
    })
    // Le 3ᵉ passage, lui, garde son vol Taipei → Shanghai.
    expect(byId(retimed, 'day-19').transport).toMatchObject({
      from: 'Taipei',
      to: 'Shanghai',
      provider: 'Spring Airlines',
    })
    expect(templateTodo(retimed).accommodations).not.toContain(
      'Xin Hui City Hotel (Shanghai Railway Station Changshou Road Subway Station Branch)',
    )
  })

  it('retirer Taipei : le vol Taipei → Shanghai disparaît, on est déjà à Shanghai', async () => {
    const template = await publishAndRead(demoItinerary, 'CN')
    const retimed = retimeTemplate(template.itinerary, {
      startDate: '2027-05-01',
      keptDayIds: idsWithout(template.itinerary, [16, 17, 18]),
    })
    expect(byId(retimed, 'day-19')).not.toHaveProperty('transport')
    expect(JSON.stringify(retimed)).not.toContain('Taipei')
  })

  it('retirer Hội An recoud Baie d’Along → Hô Chi Minh-Ville, sans le vol de Đà Nẵng', async () => {
    const template = await publishAndRead(generatedVietnam(), 'VN')
    const retimed = retimeTemplate(template.itinerary, {
      startDate: '2027-01-10',
      keptDayIds: idsWithout(template.itinerary, [4, 5, 6]),
    })
    const saigon = byId(retimed, 'day-7')
    expect(saigon.transport).toMatchObject({
      type: 'plane',
      from: 'Baie d’Along',
      to: 'Hô Chi Minh-Ville',
    })
    // Le générateur marque ses trajets `source: 'ai'` : rien d'autre ne reste.
    expect(Object.keys(saigon.transport!).sort()).toEqual([
      'from',
      'id',
      'source',
      'to',
      'type',
    ])
  })

  it('retirer le delta du Mékong ne laisse pas un bus Cần Thơ → Saïgon à qui est déjà à Saïgon', async () => {
    const template = await publishAndRead(generatedVietnam(), 'VN')
    const retimed = retimeTemplate(template.itinerary, {
      startDate: '2027-01-10',
      keptDayIds: idsWithout(template.itinerary, [9]),
    })
    expect(byId(retimed, 'day-10').transport).toBeUndefined()
    // Le premier passage à Saïgon retiré, le bus du delta repart de Hội An.
    const withoutSaigon = retimeTemplate(template.itinerary, {
      startDate: '2027-01-10',
      keptDayIds: idsWithout(template.itinerary, [7, 8]),
    })
    expect(byId(withoutSaigon, 'day-9').transport).toMatchObject({
      from: 'Hội An',
      to: 'Cần Thơ',
    })
    expect(byId(withoutSaigon, 'day-9').transport).not.toHaveProperty(
      'duration',
    )
  })

  it('retirer Hakone recoud Tokyo → Kyoto, sans le Shinkansen d’Odawara, ses horaires ni son prix', async () => {
    const template = await publishAndRead(japanTrip(), 'JP')
    const retimed = retimeTemplate(template.itinerary, {
      startDate: '2027-04-03',
      keptDayIds: idsWithout(template.itinerary, [5]),
    })
    expect(byId(retimed, 'jp-d6').transport).toEqual({
      id: 'jp-tr-shinkansen',
      type: 'train',
      from: 'Tokyo',
      to: 'Kyoto',
    })
  })

  it('B4 : compte des journées, pas des nuits (Osaka · 4 jours, départ compris)', async () => {
    const template = await publishAndRead(japanTrip(), 'JP')
    const groups = groupDaysByCity(
      template.itinerary,
      template.itinerary.map((day) => day.id),
      '2027-04-03',
    )
    expect(groups.map((group) => [group.city, group.days])).toEqual([
      ['Tokyo', 4],
      ['Hakone', 1],
      ['Kyoto', 4],
      ['Nara', 1],
      ['Osaka', 4],
    ])
    expect(groups.at(-1)).not.toHaveProperty('nights')
  })

  it('A3 : un prénom après « : » est surligné (« Hôte : Rui »)', () => {
    expect(
      highlights(
        'Hôte : Rui, très sympa.',
        sensitiveSpans('Hôte : Rui, très sympa.'),
      ),
    ).toContain('name:Rui')
  })

  it('A3 : un lieu nommé dans un titre du voyage n’est pas un prénom (Asakusa)', () => {
    const trip = japanTrip()
    expect(noteHighlights(trip[3].notes!, trip)).not.toContain('name:Asakusa')
    // « Tobu Limited Express » : un service de train, pas une personne.
    expect(noteHighlights(trip[3].notes!, trip)).toEqual([])
  })

  it('A3 : l’extrait montré n’est pas fait que de faux noms (« Visa Premier »)', () => {
    const excerpts = noteExcerpts(italyRoadTrip())
    const marks = excerpts.flatMap((excerpt) =>
      highlights(excerpt.text, excerpt.spans),
    )
    expect(marks).not.toContain('name:Premier')
    expect(marks).not.toContain('name:Hertz')
    // Les deux notes qui portent un vrai prénom passent devant la franchise.
    expect(excerpts.map((excerpt) => excerpt.dayId)).toEqual(['it-d1', 'it-d5'])
    expect(marks).toContain('name:Marco')
  })
})
