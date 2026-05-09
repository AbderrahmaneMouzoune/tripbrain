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
export const tripEndDate = new Date('2026-05-29')

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
      name: "柃居 B&B - Jing'an Temple Branch",
      address:
        "Lane 786, Julu Road, Jing'an District, Shanghai, Jing'an, 200000 Shanghai, Chine",
      bookingUrl: 'https://secure.booking.com/confirmation.fr.html?aid=2311236',
      checkIn: '2026-05-10',
      checkOut: '2026-05-12',
      price: 143,
      currency: 'EUR',
      status: 'booked',
    },
    activities: [
      {
        id: 'act-day1-1',
        name: 'Check-in hôtel',
        type: 'experience',
        duration: '1h',
      },
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
      {
        id: 'act-day1-4',
        name: 'Dîner Xiaolongbao',
        type: 'food',
        duration: '1h30',
      },
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
      {
        id: 'act-day2-2',
        name: 'Bazar Yuyuan',
        type: 'shopping',
        duration: '1h30',
      },
      {
        id: 'act-day2-3',
        name: 'Nanxiang Dumpling House',
        type: 'food',
        duration: '1h',
      },
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
      departureAddress:
        'Shanghai Hongqiao Railway Station, 200 Hanzhong Road, Changning District',
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
      name: 'Lan Beike Apartment (Qingdao May Fourth Square)',
      address:
        'Room 101, 1st Floor, Tower C, China Railway Qingdao Center, No. 8 Yi, Hong Kong Middle Road, Shinan, Qingdao, Shandong, Chine',
      bookingUrl:
        'https://fr.trip.com/hotels/ctorderdetail?orderid=1306267683942772',
      checkIn: '2026-05-12',
      checkOut: '2026-05-13',
      price: 57,
      currency: 'EUR',
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
      {
        id: 'act-day3-4',
        name: 'Dîner fruits de mer',
        type: 'food',
        duration: '1h30',
      },
    ],
    transport: {
      id: 'tr-day3',
      type: 'train',
      from: 'Qingdao',
      to: 'Beijing',
      details: 'Train G206',
      departureAddress:
        'Qingdao North Railway Station, 2 Qingnianbei Road, Licang District',
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
      name: "QingJin Xiaoqiao's Home Hotel Apartment (Beijing CBD Jianguomen Store)",
      address:
        '6th Floor and 8th Floor, Building 1, No. 11, Jianhua South Road, Chaoyang, Pékin, Chine',
      bookingUrl:
        'https://fr.trip.com/hotels/ctorderdetail?orderid=1306266282777808',
      checkIn: '2026-05-13',
      checkOut: '2026-05-16',
      price: 136,
      currency: 'EUR',
      status: 'booked',
    },
    activities: [
      {
        id: 'act-day4-1',
        name: 'Installation hôtel',
        type: 'experience',
        duration: '1h',
      },
      {
        id: 'act-day4-2',
        name: 'Balade Wangfujing',
        type: 'visit',
        duration: '1h30',
        coordinates: [39.9153, 116.404],
      },
      {
        id: 'act-day4-3',
        name: 'Marché street food',
        type: 'food',
        duration: '1h30',
      },
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
      {
        id: 'act-day5-3',
        name: 'Parc Jingshan',
        type: 'visit',
        duration: '1h',
      },
      {
        id: 'act-day5-4',
        name: 'Dîner canard laqué',
        type: 'food',
        duration: '1h30',
      },
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
      {
        id: 'act-day6-2',
        name: 'Téléphérique',
        type: 'experience',
        duration: '20m',
      },
      {
        id: 'act-day6-3',
        name: 'Descente luge',
        type: 'experience',
        duration: '10m',
      },
    ],
    transport: {
      id: 'tr-day6',
      type: 'plane',
      from: 'Beijing',
      to: "Xi'an",
      details: 'Air China CA1205',
      departureAddress:
        'Beijing Capital International Airport, Terminal 3, Chaoyang District',
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
      name: "Mcsrh Hotel (Xi'an Bell and Drum Tower Branch)",
      address: "No. 1 East 4th Lane, Beilin, Xi'an, Shaanxi, Chine",
      bookingUrl:
        'https://fr.trip.com/hotels/ctorderdetail?orderid=1306266282777808',
      checkIn: '2026-05-16',
      checkOut: '2026-05-18',
      price: 77,
      currency: 'EUR',
      status: 'booked',
    },
    activities: [
      {
        id: 'act-day7-1',
        name: 'Quartier musulman',
        type: 'visit',
        duration: '2h',
      },
      {
        id: 'act-day7-2',
        name: 'Grande mosquée',
        type: 'visit',
        duration: '1h',
      },
      {
        id: 'act-day7-3',
        name: 'Street food noodles',
        type: 'food',
        duration: '1h',
      },
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
      {
        id: 'act-day8-2',
        name: "Remparts Xi'an vélo",
        type: 'experience',
        duration: '2h',
      },
      {
        id: 'act-day8-3',
        name: "Pagode de l'oie sauvage",
        type: 'visit',
        duration: '1h',
      },
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
      name: 'Qimen Theme Hotel (Jiefangbei Hongyadong Shop)',
      address:
        '31st Floor, Tower D, Shidai Haoyuan, No. 7 Qingnian Road, Yuzhong District, Chongqing, Chine',
      bookingUrl: 'https://www.trip.com/w/ruzj63ZWsT2',
      checkIn: '2026-05-18',
      checkOut: '2026-05-20',
      price: 88,
      currency: 'EUR',
      status: 'booked',
    },
    activities: [
      { id: 'act-day9-1', name: 'Hongyadong', type: 'visit', duration: '2h' },
      {
        id: 'act-day9-2',
        name: 'Promenade Yangtze',
        type: 'visit',
        duration: '1h30',
      },
      {
        id: 'act-day9-3',
        name: 'Rooftop photo spot',
        type: 'experience',
        duration: '1h',
      },
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
      {
        id: 'act-day10-1',
        name: 'Station Liziba',
        type: 'visit',
        duration: '30m',
      },
      {
        id: 'act-day10-2',
        name: 'Ciqikou Ancient Town',
        type: 'visit',
        duration: '2h',
      },
      {
        id: 'act-day10-3',
        name: 'Hot pot traditionnel',
        type: 'food',
        duration: '2h',
      },
    ],
    transport: {
      id: 'tr-day10',
      type: 'train',
      from: 'Chongqing',
      to: 'Zhangjiajie',
      status: 'planned',
    },
  },

  {
    id: 'day-11',
    date: '2026-05-20',
    dayNumber: 11,
    city: 'Zhangjiajie',
    title: 'Arrivée à Zhangjiajie',
    coordinates: [29.117, 110.4792],
    dayType: 'arrival',
    walkingDistance: '5 km',
    highlights: ['Parc national', 'Montagnes Avatar'],
    tips: [
      'Prévoir des chaussures de randonnée',
      'Arriver tôt pour éviter la foule',
    ],
    notes: 'Installation et première découverte du parc.',
    images: [],
    accommodation: {
      id: 'acc-day11',
      name: 'Zhangjiajie Local Vibe Downtown Guesthouse',
      address:
        'Units 601 and 1203, Building 4, Chongwen Street, Yongding District, Zhangjiajie City, Hunan Province, Zhangjiajie Futian Huafu (Phase I), 427000 Zhangjiajie, Chine',
      bookingUrl: 'https://secure.booking.com/confirmation.fr.html?aid=2369322',
      checkIn: '2026-05-20',
      checkOut: '2026-05-23',
      price: 138,
      currency: 'EUR',
      status: 'booked',
    },
    activities: [
      {
        id: 'act-day11-1',
        name: 'Installation guesthouse',
        type: 'experience',
        duration: '1h',
      },
      {
        id: 'act-day11-2',
        name: 'Balade Yongding District',
        type: 'visit',
        duration: '2h',
      },
      {
        id: 'act-day11-3',
        name: 'Dîner local',
        type: 'food',
        duration: '1h30',
      },
    ],
  },

  {
    id: 'day-12',
    date: '2026-05-21',
    dayNumber: 12,
    city: 'Zhangjiajie',
    title: 'Montagnes Avatar',
    coordinates: [29.117, 110.4792],
    dayType: 'nature',
    walkingDistance: '15 km',
    highlights: [
      'Zhangjiajie National Forest Park',
      'Avatar Hallelujah Mountain',
      'Golden Whip Stream',
    ],
    tips: [
      'Partir très tôt le matin',
      'Emporter eau et snacks pour la journée',
    ],
    notes: 'Journée complète de randonnée dans le parc national.',
    images: [],
    activities: [
      {
        id: 'act-day12-1',
        name: 'Zhangjiajie National Forest Park',
        type: 'visit',
        duration: '6h',
        coordinates: [29.3249, 110.4343],
      },
      {
        id: 'act-day12-2',
        name: 'Avatar Hallelujah Mountain',
        type: 'visit',
        duration: '2h',
      },
      {
        id: 'act-day12-3',
        name: 'Golden Whip Stream',
        type: 'visit',
        duration: '2h',
      },
    ],
  },

  {
    id: 'day-13',
    date: '2026-05-22',
    dayNumber: 13,
    city: 'Zhangjiajie',
    title: 'Tianmen Mountain',
    coordinates: [29.117, 110.4792],
    dayType: 'nature',
    walkingDistance: '10 km',
    highlights: ['Tianmen Mountain', 'Glass Skywalk', 'Porte du Ciel'],
    tips: [
      'Prévoir le vertige pour le Glass Skywalk',
      'Le téléphérique est le plus long du monde',
    ],
    notes: 'Dernière journée à Zhangjiajie avant le départ pour Shanghai.',
    images: [],
    activities: [
      {
        id: 'act-day13-1',
        name: 'Tianmen Mountain',
        type: 'visit',
        duration: '4h',
        coordinates: [29.0525, 110.4847],
      },
      {
        id: 'act-day13-2',
        name: 'Glass Skywalk',
        type: 'experience',
        duration: '1h',
      },
      {
        id: 'act-day13-3',
        name: 'Porte du Ciel',
        type: 'visit',
        duration: '1h',
      },
    ],
    transport: {
      id: 'tr-day13',
      type: 'plane',
      from: 'Zhangjiajie',
      to: 'Shanghai',
      status: 'planned',
    },
  },

  {
    id: 'day-14',
    date: '2026-05-23',
    dayNumber: 14,
    city: 'Shanghai',
    title: 'Retour à Shanghai',
    coordinates: [31.2304, 121.4737],
    dayType: 'exploration',
    walkingDistance: '8 km',
    highlights: ['Nanjing Road', 'Shopping'],
    tips: ['Profiter des dernières emplettes'],
    notes: 'Deuxième passage à Shanghai pour explorer de nouveaux quartiers.',
    images: [],
    accommodation: {
      id: 'acc-day14',
      name: 'Xin Hui City Hotel (Shanghai Railway Station Changshou Road Subway Station Branch)',
      address: 'No. 949 Jiaozhou Road, Putuo, Shanghai, Chine',
      bookingUrl:
        'https://fr.trip.com/hotels/ctorderdetail?orderid=1306266282788121',
      checkIn: '2026-05-23',
      checkOut: '2026-05-25',
      price: 140,
      currency: 'EUR',
      status: 'booked',
    },
    activities: [
      {
        id: 'act-day14-1',
        name: 'Installation hôtel',
        type: 'experience',
        duration: '1h',
      },
      {
        id: 'act-day14-2',
        name: 'Nanjing Road',
        type: 'shopping',
        duration: '2h',
        coordinates: [31.2352, 121.4728],
      },
      {
        id: 'act-day14-3',
        name: 'Dîner Shanghai',
        type: 'food',
        duration: '1h30',
      },
    ],
  },

  {
    id: 'day-15',
    date: '2026-05-24',
    dayNumber: 15,
    city: 'Shanghai',
    title: 'Dernière journée Shanghai',
    coordinates: [31.2304, 121.4737],
    dayType: 'exploration',
    walkingDistance: '6 km',
    highlights: ['Tianzifang', 'Derniers achats'],
    tips: ['Faire les derniers achats souvenirs'],
    notes: 'Journée libre avant le départ pour Taiwan.',
    images: [],
    activities: [
      {
        id: 'act-day15-1',
        name: 'Tianzifang',
        type: 'visit',
        duration: '2h',
        coordinates: [31.2084, 121.4684],
      },
      {
        id: 'act-day15-2',
        name: 'Shopping souvenirs',
        type: 'shopping',
        duration: '2h',
      },
    ],
    transport: {
      id: 'tr-day15',
      type: 'plane',
      from: 'Shanghai',
      to: 'Taipei',
      status: 'planned',
    },
  },

  {
    id: 'day-16',
    date: '2026-05-25',
    dayNumber: 16,
    city: 'Taipei',
    title: 'Arrivée à Taipei',
    coordinates: [25.033, 121.5654],
    dayType: 'arrival',
    walkingDistance: '7 km',
    highlights: ['Taipei 101', 'Ximending'],
    tips: ['Le MRT est très pratique', 'Changer des TWD à l\u0027aéroport'],
    notes: 'Découverte de la capitale taïwanaise.',
    images: [],
    accommodation: {
      id: 'acc-day16',
      name: 'Caesar Metro Taipei',
      address: 'No.167 Bangka Blvd, Wanhua District, Taipei, Taïwan, Chine',
      bookingUrl:
        'https://fr.trip.com/hotels/ctorderdetail?orderid=1306267683977184',
      checkIn: '2026-05-25',
      checkOut: '2026-05-28',
      price: 254,
      currency: 'EUR',
      status: 'booked',
    },
    activities: [
      {
        id: 'act-day16-1',
        name: 'Installation hôtel',
        type: 'experience',
        duration: '1h',
      },
      {
        id: 'act-day16-2',
        name: 'Taipei 101',
        type: 'visit',
        duration: '2h',
        coordinates: [25.0339, 121.5645],
      },
      {
        id: 'act-day16-3',
        name: 'Ximending',
        type: 'visit',
        duration: '2h',
        coordinates: [25.0424, 121.5081],
      },
      {
        id: 'act-day16-4',
        name: 'Night market',
        type: 'food',
        duration: '1h30',
      },
    ],
  },

  {
    id: 'day-17',
    date: '2026-05-26',
    dayNumber: 17,
    city: 'Taipei',
    title: 'Jiufen et Shifen',
    coordinates: [25.033, 121.5654],
    dayType: 'exploration',
    walkingDistance: '10 km',
    highlights: ['Village de Jiufen', 'Cascades Shifen', 'Lanternes'],
    tips: ['Prendre le train pour Shifen', 'Jiufen est bondé le week-end'],
    notes: 'Excursion dans les villages pittoresques autour de Taipei.',
    images: [],
    activities: [
      {
        id: 'act-day17-1',
        name: 'Village de Jiufen',
        type: 'visit',
        duration: '3h',
        coordinates: [25.1094, 121.8444],
      },
      {
        id: 'act-day17-2',
        name: 'Cascades Shifen',
        type: 'visit',
        duration: '1h30',
        coordinates: [25.0314, 121.7765],
      },
      {
        id: 'act-day17-3',
        name: 'Lâcher de lanternes',
        type: 'experience',
        duration: '30m',
      },
    ],
  },

  {
    id: 'day-18',
    date: '2026-05-27',
    dayNumber: 18,
    city: 'Taipei',
    title: 'Dernier jour à Taipei',
    coordinates: [25.033, 121.5654],
    dayType: 'culture',
    walkingDistance: '8 km',
    highlights: ['Longshan Temple', 'Marché Shilin', 'Din Tai Fung'],
    tips: ['Goûter le bubble tea taïwanais'],
    notes: 'Dernière journée à Taipei, profiter de la street food.',
    images: [],
    activities: [
      {
        id: 'act-day18-1',
        name: 'Longshan Temple',
        type: 'visit',
        duration: '1h',
        coordinates: [25.0372, 121.4999],
      },
      {
        id: 'act-day18-2',
        name: 'Din Tai Fung',
        type: 'food',
        duration: '1h30',
      },
      {
        id: 'act-day18-3',
        name: 'Shilin Night Market',
        type: 'food',
        duration: '2h',
        coordinates: [25.0882, 121.5244],
      },
    ],
    transport: {
      id: 'tr-day18',
      type: 'plane',
      from: 'Taipei',
      to: 'Shanghai',
      status: 'planned',
    },
  },

  {
    id: 'day-19',
    date: '2026-05-28',
    dayNumber: 19,
    city: 'Shanghai',
    title: 'Dernière nuit à Shanghai',
    coordinates: [31.2304, 121.4737],
    dayType: 'exploration',
    walkingDistance: '5 km',
    highlights: ['Dernière promenade', 'Souvenirs'],
    tips: ['Préparer les valises pour le retour'],
    notes: 'Dernière soirée en Chine avant le retour.',
    images: [],
    accommodation: {
      id: 'acc-day19',
      name: 'Yun He Ye Bo Hotel (Shanghai Wuning Road Global Harbor)',
      address:
        '2nd to 5th Floors, Zone C, 1st Floor, No. 503 Wuning Road, Putuo, Shanghai, Chine',
      bookingUrl:
        'https://fr.trip.com/hotels/ctorderdetail?orderid=1306266282794491',
      checkIn: '2026-05-28',
      checkOut: '2026-05-29',
      price: 102,
      currency: 'EUR',
      status: 'booked',
    },
    activities: [
      {
        id: 'act-day19-1',
        name: 'Dernière promenade Bund',
        type: 'visit',
        duration: '2h',
        coordinates: [31.24, 121.49],
      },
      {
        id: 'act-day19-2',
        name: 'Dîner d\u0027adieu',
        type: 'food',
        duration: '2h',
      },
    ],
  },

  {
    id: 'day-20',
    date: '2026-05-29',
    dayNumber: 20,
    city: 'Shanghai',
    title: 'Départ',
    coordinates: [31.2304, 121.4737],
    dayType: 'departure',
    notes: 'Checkout et départ pour l\u0027aéroport.',
    images: [],
    activities: [
      {
        id: 'act-day20-1',
        name: 'Checkout hôtel',
        type: 'experience',
        duration: '1h',
      },
      {
        id: 'act-day20-2',
        name: 'Transfert aéroport Hongqiao',
        type: 'transport',
        duration: '1h30',
      },
    ],
    transport: {
      id: 'tr-day20',
      type: 'plane',
      from: 'Shanghai',
      to: 'Paris',
      details: 'Air China CA1590 + CA933 (via Pékin)',
      departureAddress:
        'Aéroport international de Shanghai Hongqiao, Terminal 2',
      departureTime: '08:55',
      arrivalTime: '18:15',
      duration: '13h20 (escale 2h20 à Pékin)',
      provider: 'Air China',
      terminal: 'T2',
      status: 'booked',
      notes:
        'Escale à Pékin (PEK T3, 2h20) — pas besoin de récupérer les bagages. CA1590 SHA→PEK 08:55–11:10, CA933 PEK→CDG 13:30–18:15.',
    },
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
