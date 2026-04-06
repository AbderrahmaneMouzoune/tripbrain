export interface EntityMetadata {
  source?: 'user' | 'import' | 'ai'
  priority?: 'must' | 'nice' | 'optional'
}

export interface Accommodation extends EntityMetadata {
  id: string
  name: string
  address: string
  bookingUrl: string
  checkIn: string
  checkOut: string
  images?: string[]
  price?: number
  currency?: string
  bookingReference?: string
  status?: 'planned' | 'booked' | 'checked-in' | 'completed'
}

export interface Activity extends EntityMetadata {
  id: string
  name: string
  description?: string
  type: 'visit' | 'transport' | 'food' | 'experience' | 'shopping'
  duration?: string
  coordinates?: [number, number]
  /** Opening hours / schedule — free-form string, e.g. "09:00–17:00" or "09:00–12:00, 14:00–17:00" */
  openAt?: string
  address?: string
  bookingUrl?: string
  reservationRequired?: boolean
  price?: number
  currency?: string
  rating?: number
  tags?: string[]
  status?: 'planned' | 'done' | 'skipped'
  tips?: string
  images?: string[]
}

export interface Transport extends EntityMetadata {
  id: string
  type: 'train' | 'car' | 'plane' | 'bus'
  from?: string
  to?: string
  details?: string
  /** Human-readable address of the departure point (station, airport terminal, etc.) */
  departureAddress?: string
  departureTime?: string
  arrivalTime?: string
  duration?: string
  provider?: string
  bookingUrl?: string
  bookingReference?: string
  price?: number
  currency?: string
  seat?: string
  gate?: string
  terminal?: string
  status?: 'planned' | 'booked' | 'checked-in' | 'completed'
  notes?: string
}

export interface DayImage {
  url: string
  caption: string
}

export interface DayItinerary extends EntityMetadata {
  id: string
  date: string
  dayNumber: number
  city: string
  title: string
  highlights?: string[]
  foodRecommendations?: string[]
  walkingDistance?: string
  notes?: string
  packingTips?: string[]
  dayType?: string
  tips?: string[]
  accommodation?: Accommodation
  activities: Activity[]
  transport?: Transport
  coordinates: [number, number]
  images?: DayImage[]
}

export const tripStartDate = new Date('2026-05-09')
export const tripEndDate = new Date('2026-05-28')

export const itinerary: DayItinerary[] = [
  {
    id: 'day-1',
    date: '2026-05-10',
    dayNumber: 1,
    city: 'Shanghai',
    title: 'Arrivée à Shanghai',
    coordinates: [31.2304, 121.4737],
    dayType: 'arrival',
    walkingDistance: '6 km',
    highlights: ['Skyline du Bund', "Temple Jing'an"],
    tips: [
      'Installer Alipay',
      'Utiliser le métro pour les déplacements',
      'Se reposer après le vol',
    ],
    notes: 'Première journée tranquille pour gérer le décalage horaire.',
    images: [
      {
        url: 'https://images.pexels.com/photos/687450/pexels-photo-687450.jpeg',
        caption: 'Shanghai skyline',
      },
      {
        url: 'https://images.pexels.com/photos/650231/pexels-photo-650231.jpeg',
        caption: 'The Bund promenade',
      },
      {
        url: 'https://images.pexels.com/photos/635260/pexels-photo-635260.jpeg',
        caption: "Lobby de l'hôtel",
      },
      {
        url: 'https://images.pexels.com/photos/842654/pexels-photo-842654.jpeg',
        caption: "Vue sur la rue Jing'an",
      },
      {
        url: 'https://images.pexels.com/photos/354941/pexels-photo-354941.jpeg',
        caption: 'Ruelles alentours',
      },
    ],
    accommodation: {
      id: 'acc-day1',
      name: 'Waldorf Astoria Shanghai on the Bund',
      address: '2 Zhongshan East 1st Road, Huangpu District, Shanghai 200002',
      bookingUrl: 'https://www.waldorfastoria.com/shanghai',
      checkIn: '2026-05-10',
      checkOut: '2026-05-12',
      price: 2800,
      currency: 'CNY',
      status: 'booked',
      images: [
        'https://images.pexels.com/photos/271624/pexels-photo-271624.jpeg',
        'https://images.pexels.com/photos/2869387/pexels-photo-2869387.jpeg',
        'https://images.pexels.com/photos/373488/pexels-photo-373488.jpeg',
        'https://images.pexels.com/photos/246002/pexels-photo-246002.jpeg',
        'https://images.pexels.com/photos/271639/pexels-photo-271639.jpeg',
      ],
    },
    activities: [
      { id: 'act-day1-1', name: 'Check-in hôtel', type: 'experience', duration: '1h' },
      {
        id: 'act-day1-2',
        name: "Temple Jing'an",
        type: 'visit',
        duration: '1h30',
        coordinates: [31.2235, 121.4452],
      },
      {
        id: 'act-day1-3',
        name: 'Promenade sur le Bund',
        type: 'visit',
        duration: '2h',
        coordinates: [31.24, 121.49],
      },
      { id: 'act-day1-4', name: 'Dîner Xiaolongbao', type: 'food', duration: '1h30' },
    ],
  },

  {
    id: 'day-2',
    date: '2026-05-11',
    dayNumber: 2,
    city: 'Shanghai',
    title: 'Vieille ville et Yu Garden',
    coordinates: [31.2304, 121.4737],
    dayType: 'exploration',
    walkingDistance: '12 km',
    highlights: ['Yu Garden', 'Bazar Yuyuan', 'Concession française'],
    tips: [
      'Arriver tôt au Yu Garden',
      'Prendre de la monnaie locale pour le bazar',
      'Prévoir beaucoup de photos',
    ],
    notes: 'Quartiers historiques très photogéniques.',
    images: [
      {
        url: 'https://images.pexels.com/photos/650222/pexels-photo-650222.jpeg',
        caption: 'Yu Garden architecture',
      },
      {
        url: 'https://images.pexels.com/photos/3972156/pexels-photo-3972156.jpeg',
        caption: 'Shanghai old streets',
      },
      {
        url: 'https://images.pexels.com/photos/4870808/pexels-photo-4870808.jpeg',
        caption: 'Allées pittoresques du bazar',
      },
      {
        url: 'https://images.pexels.com/photos/683419/pexels-photo-683419.jpeg',
        caption: 'Ponts traditionnels',
      },
      {
        url: 'https://images.pexels.com/photos/683940/pexels-photo-683940.jpeg',
        caption: 'Décorations florales du jardin',
      },
    ],
    activities: [
      {
        id: 'act-day2-1',
        name: 'Yu Garden',
        type: 'visit',
        duration: '2h',
        coordinates: [31.227, 121.4923],
        openAt: '09:00–17:00',
        address: '218 Anren Street, Huangpu District, Shanghai',
        bookingUrl: 'https://www.yugarden.com.cn',
        reservationRequired: false,
        price: 40,
        currency: 'CNY',
        rating: 4.6,
        tags: ['historic', 'garden', 'classic'],
        status: 'planned',
      },
      { id: 'act-day2-2', name: 'Bazar Yuyuan', type: 'shopping', duration: '1h30' },
      { id: 'act-day2-3', name: 'Nanxiang Dumpling House', type: 'food', duration: '1h' },
      {
        id: 'act-day2-4',
        name: 'Balade concession française',
        type: 'visit',
        duration: '2h',
        coordinates: [31.2139, 121.4701],
      },
    ],
    transport: {
      id: 'tr-day2',
      type: 'train',
      from: 'Shanghai',
      to: 'Qingdao',
      details: 'Train G195',
      departureAddress: 'Shanghai Hongqiao Railway Station, 200 Hanzhong Road, Changning District',
      departureTime: '07:53',
      arrivalTime: '14:12',
      duration: '6h19',
      provider: 'China Railway',
      price: 244,
      currency: 'CNY',
      status: 'booked',
    },
  },

  {
    id: 'day-3',
    date: '2026-05-12',
    dayNumber: 3,
    city: 'Qingdao',
    title: 'Ville maritime',
    coordinates: [36.0671, 120.3826],
    dayType: 'coastal',
    walkingDistance: '8 km',
    highlights: ['Jetée Zhanqiao', 'Architecture allemande', 'Plage Qingdao'],
    tips: ['Super coucher de soleil sur la mer', 'Se couvrir en soirée'],
    notes: 'Exploration du front de mer et bâtiments historiques allemands.',
    images: [
      {
        url: 'https://images.pexels.com/photos/5851184/pexels-photo-5851184.jpeg',
        caption: 'Qingdao coastline',
      },
      {
        url: 'https://images.pexels.com/photos/4485231/pexels-photo-4485231.jpeg',
        caption: 'Sea pier',
      },
      {
        url: 'https://images.pexels.com/photos/11875331/pexels-photo-11875331.jpeg',
        caption: 'Plage de Qingdao',
      },
      {
        url: 'https://images.pexels.com/photos/2225891/pexels-photo-2225891.jpeg',
        caption: 'Architecture allemande',
      },
      {
        url: 'https://images.pexels.com/photos/16864552/pexels-photo-16864552.jpeg',
        caption: 'Bords de mer animés',
      },
    ],
    accommodation: {
      id: 'acc-day3',
      name: 'Hilton Qingdao Golden Beach',
      address: '1 Yingkou Lu, Shinan District, Qingdao 266100',
      bookingUrl: 'https://www.hilton.com/qingdao-golden-beach',
      checkIn: '2026-05-12',
      checkOut: '2026-05-13',
      price: 980,
      currency: 'CNY',
      status: 'booked',
    },
    activities: [
      {
        id: 'act-day3-1',
        name: 'Jetée Zhanqiao',
        type: 'visit',
        duration: '1h',
        coordinates: [36.0605, 120.3203],
      },
      {
        id: 'act-day3-2',
        name: 'Cathédrale Saint-Michel',
        type: 'visit',
        duration: '45m',
        coordinates: [36.064, 120.327],
      },
      {
        id: 'act-day3-3',
        name: 'Musée bière Tsingtao',
        type: 'visit',
        duration: '1h30',
        coordinates: [36.0775, 120.32],
      },
      { id: 'act-day3-4', name: 'Dîner fruits de mer', type: 'food', duration: '1h30' },
    ],
    transport: {
      id: 'tr-day3',
      type: 'train',
      from: 'Qingdao',
      to: 'Beijing',
      details: 'Train G206',
      departureAddress: 'Qingdao North Railway Station, 2 Qingnianbei Road, Licang District',
      departureTime: '09:06',
      arrivalTime: '13:35',
      duration: '4h29',
      provider: 'China Railway',
      price: 274,
      currency: 'CNY',
      status: 'booked',
    },
  },

  {
    id: 'day-4',
    date: '2026-05-13',
    dayNumber: 4,
    city: 'Beijing',
    title: 'Arrivée à Pékin',
    coordinates: [39.9042, 116.4074],
    dayType: 'arrival',
    walkingDistance: '6 km',
    highlights: ['Rue Wangfujing', 'Street food locale'],
    tips: [
      'Tester la street food locale',
      'Prévoir de la monnaie pour les petits achats',
    ],
    notes: 'Première journée dans la capitale, découverte du centre-ville.',
    images: [
      {
        url: 'https://images.pexels.com/photos/16144416/pexels-photo-16144416.jpeg',
        caption: 'Beijing street',
      },
      {
        url: 'https://images.pexels.com/photos/1170262/pexels-photo-1170262.jpeg',
        caption: 'Rues animées de Wangfujing',
      },
      {
        url: 'https://images.pexels.com/photos/302718/pexels-photo-302718.jpeg',
        caption: 'Architecture moderne et traditionnelle',
      },
      {
        url: 'https://images.pexels.com/photos/16228208/pexels-photo-16228208.jpeg',
        caption: 'Places publiques',
      },
      {
        url: 'https://images.pexels.com/photos/2846075/pexels-photo-2846075.jpeg',
        caption: 'Monuments historiques',
      },
    ],
    accommodation: {
      id: 'acc-day4',
      name: 'The Opposite House Beijing',
      address: '11 Sanlitun Road, Chaoyang District, Beijing 100027',
      bookingUrl: 'https://www.theoppositehouse.com',
      checkIn: '2026-05-13',
      checkOut: '2026-05-16',
      price: 2200,
      currency: 'CNY',
      status: 'booked',
    },
    activities: [
      { id: 'act-day4-1', name: 'Installation hôtel', type: 'experience', duration: '1h' },
      {
        id: 'act-day4-2',
        name: 'Balade Wangfujing',
        type: 'visit',
        duration: '1h30',
        coordinates: [39.9153, 116.404],
      },
      { id: 'act-day4-3', name: 'Marché street food', type: 'food', duration: '1h30' },
    ],
  },

  {
    id: 'day-5',
    date: '2026-05-14',
    dayNumber: 5,
    city: 'Beijing',
    title: 'Cité interdite',
    coordinates: [39.9042, 116.4074],
    dayType: 'culture',
    walkingDistance: '14 km',
    highlights: ['Place Tiananmen', 'Cité interdite', 'Parc Jingshan'],
    tips: ['Visiter tôt le matin', 'Porter des chaussures confortables'],
    notes: 'Exploration des monuments emblématiques et culture impériale.',
    images: [
      {
        url: 'https://images.pexels.com/photos/20694747/pexels-photo-20694747.jpeg',
        caption: 'Forbidden City',
      },
      {
        url: 'https://images.pexels.com/photos/29474218/pexels-photo-29474218.jpeg',
        caption: 'Parc et jardins impériaux',
      },
      {
        url: 'https://images.pexels.com/photos/3229784/pexels-photo-3229784.jpeg',
        caption: 'Monuments historiques',
      },
      {
        url: 'https://images.pexels.com/photos/3587765/pexels-photo-3587765.jpeg',
        caption: 'Architecture classique',
      },
      {
        url: 'https://images.pexels.com/photos/1486577/pexels-photo-1486577.jpeg',
        caption: 'Rues autour de la Cité interdite',
      },
    ],
    activities: [
      {
        id: 'act-day5-1',
        name: 'Place Tiananmen',
        type: 'visit',
        duration: '45m',
        coordinates: [39.9056, 116.3976],
      },
      {
        id: 'act-day5-2',
        name: 'Cité interdite',
        type: 'visit',
        duration: '3h',
        coordinates: [39.9163, 116.3972],
        openAt: '08:30–17:00',
        address: '4 Jingshan Front Street, Dongcheng District, Beijing',
        bookingUrl: 'https://www.dpm.org.cn/visit/buyTicket.html',
        reservationRequired: true,
        price: 60,
        currency: 'CNY',
        rating: 4.9,
        tags: ['UNESCO', 'imperial', 'historic'],
        status: 'planned',
      },
      { id: 'act-day5-3', name: 'Parc Jingshan', type: 'visit', duration: '1h' },
      { id: 'act-day5-4', name: 'Dîner canard laqué', type: 'food', duration: '1h30' },
    ],
  },

  {
    id: 'day-6',
    date: '2026-05-15',
    dayNumber: 6,
    city: 'Beijing',
    title: 'Grande Muraille',
    coordinates: [39.9042, 116.4074],
    dayType: 'nature',
    walkingDistance: '10 km',
    highlights: [
      'Grande Muraille Mutianyu',
      'Téléphérique',
      'Descente en luge',
    ],
    tips: [
      'Prévoir chaussures de randonnée',
      'Arriver tôt pour éviter la foule',
    ],
    notes: 'Journée nature et aventure sur la Grande Muraille.',
    images: [
      {
        url: 'https://images.pexels.com/photos/3892447/pexels-photo-3892447.jpeg',
        caption: 'Great Wall',
      },
      {
        url: 'https://images.pexels.com/photos/9274494/pexels-photo-9274494.jpeg',
        caption: 'Vue panoramique sur la muraille',
      },
      {
        url: 'https://images.pexels.com/photos/1653823/pexels-photo-1653823.jpeg',
        caption: 'Sections restaurées',
      },
      {
        url: 'https://images.pexels.com/photos/2981806/pexels-photo-2981806.jpeg',
        caption: 'Téléphérique vers le sommet',
      },
      {
        url: 'https://images.pexels.com/photos/2304791/pexels-photo-2304791.jpeg',
        caption: 'Descente en luge sur la muraille',
      },
    ],
    activities: [
      {
        id: 'act-day6-1',
        name: 'Grande Muraille Mutianyu',
        type: 'visit',
        duration: '4h',
        coordinates: [40.4319, 116.5704],
        openAt: '07:30–18:00',
        address: 'Mutianyu Village, Huairou District, Beijing',
        bookingUrl: 'https://www.mutianyugreatwall.com',
        reservationRequired: true,
        price: 65,
        currency: 'CNY',
        rating: 4.9,
        tags: ['UNESCO', 'outdoor', 'hiking'],
        status: 'planned',
      },
      { id: 'act-day6-2', name: 'Téléphérique', type: 'experience', duration: '20m' },
      { id: 'act-day6-3', name: 'Descente luge', type: 'experience', duration: '10m' },
    ],
    transport: {
      id: 'tr-day6',
      type: 'plane',
      from: 'Beijing',
      to: "Xi'an",
      details: 'Air China CA1205',
      departureAddress: 'Beijing Capital International Airport, Terminal 3, Chaoyang District',
      departureTime: '10:30',
      arrivalTime: '12:45',
      duration: '2h15',
      provider: 'Air China',
      terminal: 'T3',
      price: 680,
      currency: 'CNY',
      status: 'booked',
    },
  },

  {
    id: 'day-7',
    date: '2026-05-16',
    dayNumber: 7,
    city: "Xi'an",
    title: 'Quartier musulman',
    coordinates: [34.3416, 108.9398],
    dayType: 'culture',
    walkingDistance: '7 km',
    highlights: ["Street food Xi'an", 'Grande mosquée', 'Souks'],
    tips: ['Prendre de la monnaie locale', 'Tester les spécialités locales'],
    notes: 'Découverte culinaire et culturelle du quartier musulman.',
    images: [
      {
        url: 'https://images.pexels.com/photos/36494135/pexels-photo-36494135.jpeg',
        caption: "Xi'an streets",
      },
      {
        url: 'https://images.pexels.com/photos/5998743/pexels-photo-5998743.jpeg',
        caption: 'Grande mosquée',
      },
      {
        url: 'https://images.pexels.com/photos/5305568/pexels-photo-5305568.jpeg',
        caption: 'Souks et ruelles',
      },
      {
        url: 'https://images.pexels.com/photos/36148228/pexels-photo-36148228.jpeg',
        caption: 'Street food noodles',
      },
      {
        url: 'https://images.pexels.com/photos/3204950/pexels-photo-3204950.jpeg',
        caption: 'Rues historiques',
      },
    ],
    accommodation: {
      id: 'acc-day7',
      name: "Sofitel Legend People's Grand Hotel Xi'an",
      address: "319 Dong Xin Street, Xincheng District, Xi'an 710004",
      bookingUrl: 'https://www.sofitel.com/xian',
      checkIn: '2026-05-16',
      checkOut: '2026-05-18',
      price: 1500,
      currency: 'CNY',
      status: 'booked',
    },
    activities: [
      { id: 'act-day7-1', name: 'Quartier musulman', type: 'visit', duration: '2h' },
      { id: 'act-day7-2', name: 'Grande mosquée', type: 'visit', duration: '1h' },
      { id: 'act-day7-3', name: 'Street food noodles', type: 'food', duration: '1h' },
    ],
  },

  {
    id: 'day-8',
    date: '2026-05-17',
    dayNumber: 8,
    city: "Xi'an",
    title: 'Armée de terre cuite',
    coordinates: [34.3416, 108.9398],
    dayType: 'historic',
    walkingDistance: '8 km',
    highlights: [
      'Terracotta Army',
      "Remparts Xi'an",
      "Pagode de l'oie sauvage",
    ],
    tips: ['Prendre un guide audio', 'Apporter de l’eau et des snacks'],
    notes: 'Journée historique à visiter les sites emblématiques de Xi’an.',
    images: [
      {
        url: 'https://images.pexels.com/photos/36340318/pexels-photo-36340318.jpeg',
        caption: 'Terracotta warriors',
      },
      {
        url: 'https://images.pexels.com/photos/36494135/pexels-photo-36494135.jpeg',
        caption: 'Remparts de Xi’an',
      },
      {
        url: 'https://images.pexels.com/photos/5998743/pexels-photo-5998743.jpeg',
        caption: 'Pagode de l’oie sauvage',
      },
      {
        url: 'https://images.pexels.com/photos/5305568/pexels-photo-5305568.jpeg',
        caption: 'Musée Terracotta Army',
      },
      {
        url: 'https://images.pexels.com/photos/36148228/pexels-photo-36148228.jpeg',
        caption: 'Rues historiques',
      },
    ],
    activities: [
      {
        id: 'act-day8-1',
        name: 'Terracotta Army Museum',
        type: 'visit',
        duration: '3h',
        coordinates: [34.3849, 109.2786],
        openAt: '08:30–17:00',
        address: "Lintong District, Xi'an, Shaanxi",
        bookingUrl: 'https://www.bmy.com.cn/ticket',
        reservationRequired: true,
        price: 150,
        currency: 'CNY',
        rating: 4.8,
        tags: ['UNESCO', 'historic', 'museum'],
        status: 'planned',
      },
      { id: 'act-day8-2', name: "Remparts Xi'an vélo", type: 'experience', duration: '2h' },
      { id: 'act-day8-3', name: "Pagode de l'oie sauvage", type: 'visit', duration: '1h' },
    ],
    transport: {
      id: 'tr-day8',
      type: 'train',
      from: "Xi'an",
      to: 'Chongqing',
      details: 'Train G2197',
      departureAddress: "Xi'an North Railway Station, Weiyang District, Xi'an",
      departureTime: '11:16',
      arrivalTime: '15:04',
      duration: '3h48',
      provider: 'China Railway',
      price: 315,
      currency: 'CNY',
      status: 'booked',
    },
  },

  {
    id: 'day-9',
    date: '2026-05-18',
    dayNumber: 9,
    city: 'Chongqing',
    title: 'Ville cyberpunk',
    coordinates: [29.563, 106.5516],
    dayType: 'exploration',
    walkingDistance: '9 km',
    highlights: ['Hongyadong skyline', 'Promenade Yangtze'],
    tips: [
      'Prendre des photos de nuit',
      'Utiliser le téléphérique pour la vue panoramique',
    ],
    notes: 'Découverte de la ville moderne et animée.',
    images: [
      {
        url: 'https://images.pexels.com/photos/11975552/pexels-photo-11975552.jpeg',
        caption: 'Chongqing skyline',
      },
      {
        url: 'https://images.pexels.com/photos/14785197/pexels-photo-14785197.jpeg',
        caption: 'Ruelles animées',
      },
      {
        url: 'https://images.pexels.com/photos/14062523/pexels-photo-14062523.jpeg',
        caption: 'Hongyadong',
      },
      {
        url: 'https://images.pexels.com/photos/34295532/pexels-photo-34295532.jpeg',
        caption: 'Promenade Yangtze',
      },
      {
        url: 'https://images.pexels.com/photos/14062542/pexels-photo-14062542.jpeg',
        caption: 'Rooftop photo spot',
      },
    ],
    accommodation: {
      id: 'acc-day9',
      name: 'JW Marriott Hotel Chongqing',
      address: '29 Qingyun Road, Yuzhong District, Chongqing 400010',
      bookingUrl: 'https://www.marriott.com/chongqing',
      checkIn: '2026-05-18',
      checkOut: '2026-05-20',
      price: 1350,
      currency: 'CNY',
      status: 'booked',
    },
    activities: [
      { id: 'act-day9-1', name: 'Hongyadong', type: 'visit', duration: '2h' },
      { id: 'act-day9-2', name: 'Promenade Yangtze', type: 'visit', duration: '1h30' },
      { id: 'act-day9-3', name: 'Rooftop photo spot', type: 'experience', duration: '1h' },
    ],
  },

  {
    id: 'day-10',
    date: '2026-05-19',
    dayNumber: 10,
    city: 'Chongqing',
    title: 'Hot pot et métro Liziba',
    coordinates: [29.563, 106.5516],
    dayType: 'culture',
    walkingDistance: '8 km',
    highlights: [
      "Train traversant l'immeuble Liziba",
      'Cuisine épicée du Sichuan',
    ],
    tips: ['Prévoir des vêtements légers : le hot pot est très épicé'],
    notes:
      'Une expérience citadine unique avec l’architecture verticale de Chongqing.',
    images: [
      {
        url: 'https://images.pexels.com/photos/11826841/pexels-photo-11826841.jpeg',
        caption: 'Chongqing skyline de nuit',
      },
      {
        url: 'https://images.pexels.com/photos/11826843/pexels-photo-11826843.jpeg',
        caption: 'Hot pot traditionnel épicé',
      },
      {
        url: 'https://images.pexels.com/photos/32660207/pexels-photo-32660207.jpeg',
        caption: 'Station de métro dans un immeuble',
      },
      {
        url: 'https://images.pexels.com/photos/28883787/pexels-photo-28883787.jpeg',
        caption: 'Ruelles de Ciqikou Ancient Town',
      },
      {
        url: 'https://images.pexels.com/photos/14062523/pexels-photo-14062523.jpeg',
        caption: 'Vue urbaine sur le Yangtsé',
      },
    ],
    activities: [
      { id: 'act-day10-1', name: 'Station Liziba', type: 'visit', duration: '30m' },
      { id: 'act-day10-2', name: 'Ciqikou Ancient Town', type: 'visit', duration: '2h' },
      { id: 'act-day10-3', name: 'Hot pot traditionnel', type: 'food', duration: '2h' },
    ],
    transport: {
      id: 'tr-day10',
      type: 'plane',
      from: 'Chongqing',
      to: 'Zhangjiajie',
      details: 'China Southern CZ6485',
      departureAddress: 'Chongqing Jiangbei International Airport, Terminal 3, Yubei District',
      departureTime: '08:15',
      arrivalTime: '09:40',
      duration: '1h25',
      provider: 'China Southern',
      terminal: 'T3',
      price: 890,
      currency: 'CNY',
      status: 'booked',
    },
  },

  {
    id: 'day-11',
    date: '2026-05-20',
    dayNumber: 11,
    city: 'Zhangjiajie',
    title: 'Montagnes Avatar',
    coordinates: [29.1171, 110.4792],
    dayType: 'nature',
    walkingDistance: '13 km',
    highlights: ['Zhangjiajie National Forest Park', 'Paysages karstiques'],
    tips: ['Arriver tôt pour la lumière du matin'],
    notes: 'Les piliers rocheux ont inspiré les montagnes du film Avatar.',
    images: [
      {
        url: 'https://images.pexels.com/photos/6139686/pexels-photo-6139686.jpeg',
        caption: 'Paysages spectaculaires de Zhangjiajie',
      },
      {
        url: 'https://images.pexels.com/photos/6139687/pexels-photo-6139687.jpeg',
        caption: 'Falaises et forêts verdoyantes',
      },
      {
        url: 'https://images.pexels.com/photos/34683512/pexels-photo-34683512.jpeg',
        caption: 'Vallées profondes du parc national',
      },
      {
        url: 'https://images.pexels.com/photos/21897331/pexels-photo-21897331.jpeg',
        caption: 'Panorama des montagnes brumeuses',
      },
      {
        url: 'https://images.pexels.com/photos/733174/pexels-photo-733174.jpeg',
        caption: 'Sentiers de randonnée à Zhangjiajie',
      },
    ],
    accommodation: {
      id: 'acc-day11',
      name: 'Pullman Zhangjiajie',
      address: '1 Chaoyang Road, Wulingyuan District, Zhangjiajie 427400',
      bookingUrl: 'https://www.pullman-zhangjiajie.com',
      checkIn: '2026-05-20',
      checkOut: '2026-05-23',
      price: 1100,
      currency: 'CNY',
      status: 'booked',
    },
    activities: [
      {
        id: 'act-day11-1',
        name: 'Parc national Zhangjiajie',
        type: 'visit',
        duration: '4h',
        address: 'Zhangjiajie National Forest Park, Wulingyuan District, Zhangjiajie',
        bookingUrl: 'https://www.zhangjiajiepark.com/ticket',
        reservationRequired: true,
        price: 248,
        currency: 'CNY',
        rating: 4.8,
        tags: ['UNESCO', 'nature', 'hiking'],
        status: 'planned',
      },
      { id: 'act-day11-2', name: 'Bailong Elevator', type: 'experience', duration: '30m' },
      { id: 'act-day11-3', name: 'Points de vue Avatar', type: 'visit', duration: '2h' },
    ],
  },

  {
    id: 'day-12',
    date: '2026-05-21',
    dayNumber: 12,
    city: 'Zhangjiajie',
    title: 'Mont Tianzi',
    coordinates: [29.1171, 110.4792],
    dayType: 'nature',
    walkingDistance: '12 km',
    highlights: ['Panoramas karstiques', 'Plateaux rocheux'],
    tips: ['Le téléphérique offre une vue incroyable'],
    notes: 'Zone panoramique idéale pour photos et randonnées.',
    images: [
      {
        url: 'https://images.pexels.com/photos/8138726/pexels-photo-8138726.jpeg',
        caption: 'Mont Tianzi, vue aérienne',
      },
      {
        url: 'https://images.pexels.com/photos/34683512/pexels-photo-34683512.jpeg',
        caption: 'Falaises enveloppées de brume',
      },
      {
        url: 'https://images.pexels.com/photos/6139686/pexels-photo-6139686.jpeg',
        caption: 'Panorama montagneux spectaculaire',
      },
      {
        url: 'https://images.pexels.com/photos/6139687/pexels-photo-6139687.jpeg',
        caption: 'Vallée et pics rocheux',
      },
      {
        url: 'https://images.pexels.com/photos/4621011/pexels-photo-4621011.jpeg',
        caption: 'Forêt dense et sommets',
      },
    ],
    activities: [
      { id: 'act-day12-1', name: 'Tianzi Mountain', type: 'visit', duration: '3h' },
      { id: 'act-day12-2', name: 'Téléphérique', type: 'experience', duration: '30m' },
      { id: 'act-day12-3', name: 'Randonnée vallée', type: 'experience', duration: '2h' },
    ],
  },

  {
    id: 'day-13',
    date: '2026-05-22',
    dayNumber: 13,
    city: 'Zhangjiajie',
    title: 'Mont Tianmen',
    coordinates: [29.1171, 110.4792],
    dayType: 'adventure',
    walkingDistance: '8 km',
    highlights: ["Heaven's Gate", 'Skywalk en verre'],
    tips: ['La route panoramique est impressionnante'],
    notes: 'Téléphérique spectaculaire et passerelle suspendue.',
    images: [
      {
        url: 'https://images.pexels.com/photos/29073778/pexels-photo-29073778.jpeg',
        caption: 'Mont Tianmen et Heaven’s Gate',
      },
      {
        url: 'https://images.pexels.com/photos/33231949/pexels-photo-33231949.jpeg',
        caption: 'Passerelle en verre dans la falaise',
      },
      {
        url: 'https://images.pexels.com/photos/33231950/pexels-photo-33231950.jpeg',
        caption: 'Vue panoramique du parc Tianmen',
      },
      {
        url: 'https://images.pexels.com/photos/33231951/pexels-photo-33231951.jpeg',
        caption: 'Escalier en lacets vers Heaven’s Gate',
      },
      {
        url: 'https://images.pexels.com/photos/34902901/pexels-photo-34902901.jpeg',
        caption: 'Paysage de montagne brumeux',
      },
    ],
    activities: [
      { id: 'act-day13-1', name: 'Téléphérique Tianmen', type: 'experience', duration: '30m' },
      { id: 'act-day13-2', name: 'Glass skywalk', type: 'experience', duration: '1h' },
      { id: 'act-day13-3', name: "Heaven's Gate stairs", type: 'visit', duration: '1h' },
    ],
    transport: {
      id: 'tr-day13',
      type: 'plane',
      from: 'Zhangjiajie',
      to: 'Shanghai',
      details: 'Xiamen Air MF8401',
      departureAddress: 'Zhangjiajie Hehua International Airport, Sangzhi County, Hunan',
      departureTime: '15:30',
      arrivalTime: '17:55',
      duration: '2h25',
      provider: 'Xiamen Air',
      price: 1050,
      currency: 'CNY',
      status: 'booked',
    },
  },

  {
    id: 'day-14',
    date: '2026-05-23',
    dayNumber: 14,
    city: 'Shanghai',
    title: 'Retour à Shanghai',
    coordinates: [31.2304, 121.4737],
    dayType: 'relax',
    walkingDistance: '7 km',
    highlights: ['Nanjing Road', 'Skyline Pudong'],
    tips: ['Profite des lumières de la ville le soir'],
    notes: 'Ambiance urbaine et commerciale détendue.',
    images: [
      {
        url: 'https://images.pexels.com/photos/745243/pexels-photo-745243.jpeg',
        caption: 'Skyline de Shanghai la nuit',
      },
      {
        url: 'https://images.pexels.com/photos/19885/pexels-photo.jpg',
        caption: 'Nanjing Road illuminée',
      },
      {
        url: 'https://images.pexels.com/photos/4441989/pexels-photo-4441989.jpeg',
        caption: 'Quartier commerçant animé',
      },
      {
        url: 'https://images.pexels.com/photos/687453/pexels-photo-687453.jpeg',
        caption: 'Pont illuminé sur la rivière Huangpu',
      },
      {
        url: 'https://images.pexels.com/photos/625645/pexels-photo-625645.jpeg',
        caption: 'Magasins et boutiques de luxe',
      },
    ],
    accommodation: {
      id: 'acc-day14',
      name: 'Shangri-La Hotel Pudong Shanghai',
      address: '33 Fucheng Road, Pudong New Area, Shanghai 200120',
      bookingUrl: 'https://www.shangri-la.com/shanghai/shangrila',
      checkIn: '2026-05-23',
      checkOut: '2026-05-25',
      price: 2400,
      currency: 'CNY',
      status: 'booked',
    },
    activities: [
      { id: 'act-day14-1', name: 'Nanjing Road', type: 'shopping', duration: '2h' },
      { id: 'act-day14-2', name: 'Skyline night photos', type: 'experience', duration: '1h' },
    ],
  },

  {
    id: 'day-15',
    date: '2026-05-24',
    dayNumber: 15,
    city: 'Shanghai',
    title: 'Shanghai futuriste',
    coordinates: [31.2304, 121.4737],
    dayType: 'exploration',
    walkingDistance: '9 km',
    highlights: [
      'Shanghai Tower',
      'Quartier Lujiazui',
      'Vue panoramique de Pudong',
    ],
    tips: [
      'Aller au sommet de la Shanghai Tower au coucher du soleil pour les meilleures photos',
    ],
    notes: 'Quartier financier spectaculaire et moderne de Shanghai.',
    images: [
      {
        url: 'https://images.pexels.com/photos/354941/pexels-photo-354941.jpeg',
        caption: 'Shanghai Tower vue extérieure',
      },
      {
        url: 'https://images.pexels.com/photos/683419/pexels-photo-683419.jpeg',
        caption: 'Skyscrapers Lujiazui',
      },
      {
        url: 'https://images.pexels.com/photos/635261/pexels-photo-635261.jpeg',
        caption: 'Vue panoramique du quartier financier',
      },
      {
        url: 'https://images.pexels.com/photos/417289/pexels-photo-417289.jpeg',
        caption: 'Pont sur la rivière Huangpu',
      },
      {
        url: 'https://images.pexels.com/photos/4139312/pexels-photo-4139312.jpeg',
        caption: 'Illuminations nocturnes sur Pudong',
      },
    ],
    activities: [
      { id: 'act-day15-1', name: 'Shanghai Tower observatory', type: 'visit', duration: '2h' },
      { id: 'act-day15-2', name: 'Lujiazui district walk', type: 'visit', duration: '1h30' },
      { id: 'act-day15-3', name: 'Aquarium Shanghai', type: 'visit', duration: '1h' },
    ],
    transport: {
      id: 'tr-day15',
      type: 'plane',
      from: 'Shanghai',
      to: 'Taipei',
      details: 'China Eastern MU501',
      departureAddress: 'Shanghai Pudong International Airport, Terminal 1, Pudong New Area',
      departureTime: '19:00',
      arrivalTime: '21:10',
      duration: '2h10',
      provider: 'China Eastern',
      terminal: 'T1',
      price: 1350,
      currency: 'CNY',
      status: 'booked',
    },
  },

  {
    id: 'day-16',
    date: '2026-05-25',
    dayNumber: 16,
    city: 'Taipei',
    title: 'Marché de nuit',
    coordinates: [25.033, 121.5654],
    dayType: 'arrival',
    walkingDistance: '6 km',
    highlights: [
      'Shilin Night Market',
      'Street food taïwanaise',
      'Ambiance nocturne animée',
    ],
    tips: ['Tester le bubble tea et les dumplings locaux'],
    notes: 'Un des marchés nocturnes les plus célèbres de Taipei.',
    images: [
      {
        url: 'https://images.pexels.com/photos/704379/pexels-photo-704379.jpeg',
        caption: 'Marché de nuit animé',
      },
      {
        url: 'https://images.pexels.com/photos/1474157/pexels-photo-1474157.jpeg',
        caption: 'Dégustation street food',
      },
      {
        url: 'https://images.pexels.com/photos/2928796/pexels-photo-2928796.jpeg',
        caption: 'Rues bondées du marché',
      },
      {
        url: 'https://images.pexels.com/photos/1717859/pexels-photo-1717859.jpeg',
        caption: 'Étalages de nourriture',
      },
      {
        url: 'https://images.pexels.com/photos/2622171/pexels-photo-2622171.jpeg',
        caption: 'Ambiance nocturne de Taiwan',
      },
    ],
    activities: [{ id: 'act-day16-1', name: 'Shilin Night Market', type: 'food', duration: '2h' }],
  },

  {
    id: 'day-17',
    date: '2026-05-26',
    dayNumber: 17,
    city: 'Taipei',
    title: 'Taipei 101 et Elephant Mountain',
    coordinates: [25.033, 121.5654],
    dayType: 'exploration',
    walkingDistance: '10 km',
    highlights: ['Taipei 101', 'Elephant Mountain', 'Vue sur la ville'],
    tips: ['Monter avant le coucher du soleil pour des photos parfaites'],
    notes: 'Panorama incroyable sur Taipei depuis le sommet de la montagne.',
    images: [
      {
        url: 'https://images.pexels.com/photos/1717935/pexels-photo-1717935.jpeg',
        caption: 'Taipei 101 tower',
      },
      {
        url: 'https://images.pexels.com/photos/1717931/pexels-photo-1717931.jpeg',
        caption: 'Skyline de Taipei',
      },
      {
        url: 'https://images.pexels.com/photos/1717934/pexels-photo-1717934.jpeg',
        caption: 'Sentier vers Elephant Mountain',
      },
      {
        url: 'https://images.pexels.com/photos/981152/pexels-photo-981152.jpeg',
        caption: 'Vue panoramique sur la ville depuis la montagne',
      },
      {
        url: 'https://images.pexels.com/photos/1682852/pexels-photo-1682852.jpeg',
        caption: 'Coucher de soleil derrière Taipei 101',
      },
    ],
    activities: [
      {
        id: 'act-day17-1',
        name: 'Taipei 101 observatory',
        type: 'visit',
        duration: '2h',
        address: 'No. 7, Section 5, Xinyi Road, Xinyi District, Taipei',
        bookingUrl: 'https://www.taipei-101.com.tw/en/observatory',
        reservationRequired: false,
        price: 600,
        currency: 'TWD',
        rating: 4.7,
        tags: ['landmark', 'panoramic', 'urban'],
        status: 'planned',
      },
      { id: 'act-day17-2', name: 'Elephant Mountain hike', type: 'experience', duration: '1h' },
    ],
  },

  {
    id: 'day-18',
    date: '2026-05-27',
    dayNumber: 18,
    city: 'Taipei',
    title: 'Temples historiques et Dihua Street',
    coordinates: [25.033, 121.5654],
    dayType: 'culture',
    walkingDistance: '8 km',
    highlights: ['Temple Longshan', 'Vieille rue Dihua', 'Thé traditionnel'],
    tips: [
      'Excellent endroit pour acheter du thé taïwanais et souvenirs locaux',
    ],
    notes: 'Ambiance historique et traditionnelle.',
    images: [
      {
        url: 'https://images.pexels.com/photos/16648648/pexels-photo-16648648.jpeg',
        caption: 'Temple Longshan',
      },
      {
        url: 'https://images.pexels.com/photos/11997059/pexels-photo-11997059.jpeg',
        caption: 'Rue historique Dihua Street',
      },
      {
        url: 'https://images.pexels.com/photos/6110620/pexels-photo-6110620.jpeg',
        caption: 'Architecture traditionnelle',
      },
      {
        url: 'https://images.pexels.com/photos/28572036/pexels-photo-28572036.jpeg',
        caption: 'Boutiques et maisons traditionnelles',
      },
      {
        url: 'https://images.pexels.com/photos/33466337/pexels-photo-33466337.jpeg',
        caption: 'Ambiance temple et lanternes',
      },
    ],
    activities: [
      { id: 'act-day18-1', name: 'Temple Longshan', type: 'visit', duration: '1h' },
      { id: 'act-day18-2', name: 'Dihua Street', type: 'visit', duration: '1h' },
      { id: 'act-day18-3', name: 'Tea house traditionnel', type: 'food', duration: '1h' },
    ],
    transport: {
      id: 'tr-day18',
      type: 'plane',
      from: 'Taipei',
      to: 'Shanghai',
      details: 'EVA Air BR712',
      departureAddress: 'Taiwan Taoyuan International Airport, Terminal 2, Dayuan District',
      departureTime: '14:30',
      arrivalTime: '16:35',
      duration: '2h05',
      provider: 'EVA Air',
      terminal: 'T2',
      price: 1200,
      currency: 'CNY',
      status: 'booked',
    },
  },

  {
    id: 'day-19',
    date: '2026-05-28',
    dayNumber: 19,
    city: 'Shanghai',
    title: 'Dernier jour et départ',
    coordinates: [31.2304, 121.4737],
    dayType: 'departure',
    walkingDistance: '5 km',
    highlights: [
      'Derniers souvenirs',
      'Skyline finale',
      "Transfert vers l'aéroport",
    ],
    tips: ['Prévoir marge de temps pour le transfert aéroport'],
    notes: 'Fin du voyage avec derniers moments à Shanghai.',
    images: [
      {
        url: 'https://images.pexels.com/photos/650231/pexels-photo-650231.jpeg',
        caption: 'Avion décollant au coucher du soleil',
      },
      {
        url: 'https://images.pexels.com/photos/683940/pexels-photo-683940.jpeg',
        caption: 'Skyline Shanghai au lever du soleil',
      },
      {
        url: 'https://images.pexels.com/photos/745243/pexels-photo-745243.jpeg',
        caption: 'Aéroport moderne pour départ',
      },
      {
        url: 'https://images.pexels.com/photos/687450/pexels-photo-687450.jpeg',
        caption: 'Derniers achats souvenirs',
      },
      {
        url: 'https://images.pexels.com/photos/169647/pexels-photo-169647.jpeg',
        caption: 'Dernier brunch avant le vol',
      },
    ],
    accommodation: {
      id: 'acc-day19',
      name: 'The Shanghai EDITION',
      address: '199 Nanjing East Road, Huangpu District, Shanghai 200001',
      bookingUrl: 'https://www.editionhotels.com/shanghai',
      checkIn: '2026-05-28',
      checkOut: '2026-05-29',
      price: 3200,
      currency: 'CNY',
      status: 'planned',
    },
    activities: [
      { id: 'act-day19-1', name: 'Brunch', type: 'food', duration: '1h' },
      { id: 'act-day19-2', name: 'Derniers achats', type: 'shopping', duration: '1h' },
      { id: 'act-day19-3', name: 'Aéroport', type: 'transport', duration: '2h' },
    ],
  },
]

export function getCurrentDayIndex(): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let i = 0; i < itinerary.length; i++) {
    const dayDate = new Date(itinerary[i].date)
    dayDate.setHours(0, 0, 0, 0)

    if (dayDate.getTime() === today.getTime()) {
      return i
    }
  }

  // If before trip, return first day
  if (today < tripStartDate) return 0
  // If after trip, return last day
  if (today > tripEndDate) return itinerary.length - 1

  return 0
}

export function formatDate(
  dateString: string,
  locale: string = 'fr-FR',
): string {
  const date = new Date(dateString)
  return date.toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

export function getDayStatus(dayDate: string): 'past' | 'current' | 'future' {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const date = new Date(dayDate)
  date.setHours(0, 0, 0, 0)

  if (date < today) return 'past'
  if (date.getTime() === today.getTime()) return 'current'
  return 'future'
}
