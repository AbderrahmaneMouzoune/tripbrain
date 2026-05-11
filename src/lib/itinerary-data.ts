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
    foodRecommendations: [
      'Xiaolongbao (小笼包) — raviolis vapeur au bouillon',
      'Shengjianbao (生煎包) — raviolis poêlés croustillants',
      'Cong you bing (葱油饼) — galettes aux oignons verts',
      'Wonton à la shanghaïenne en bouillon',
      'Thé au lait perlé (bubble tea) chez une enseigne locale',
    ],
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
        description:
          "Installation au B&B près du temple Jing'an, quartier calme et central.",
        type: 'experience',
        duration: '1h',
        status: 'planned',
      },
      {
        id: 'act-day1-2',
        name: "Temple Jing'an",
        description:
          'Temple bouddhiste millénaire au cœur de Shanghai, célèbre pour sa statue de Bouddha en jade.',
        type: 'visit',
        duration: '1h30',
        coordinates: [31.2235, 121.4452],
        address: "1686 Nanjing West Road, Jing'an District, Shanghai",
        openAt: '07:30–17:00',
        price: 50,
        currency: 'CNY',
        rating: 4.5,
        tags: ['temple', 'bouddhisme', 'historic'],
        reservationRequired: false,
        status: 'planned',
      },
      {
        id: 'act-day1-3',
        name: 'Promenade sur le Bund',
        description:
          'Promenade emblématique le long du Huangpu avec vue sur le skyline de Pudong et les bâtiments coloniaux.',
        type: 'visit',
        duration: '2h',
        coordinates: [31.24, 121.49],
        address: 'Zhongshan East 1st Road, Huangpu District, Shanghai',
        tags: ['skyline', 'promenade', 'iconic'],
        rating: 4.8,
        reservationRequired: false,
        status: 'planned',
      },
      {
        id: 'act-day1-4',
        name: 'Dîner Xiaolongbao',
        description:
          'Dégustation des célèbres raviolis vapeur shanghaïens (小笼包), spécialité incontournable.',
        type: 'food',
        duration: '1h30',
        coordinates: [31.2291, 121.4737],
        address: "Julu Road, Jing'an District, Shanghai",
        tags: ['cuisine locale', 'xiaolongbao', 'dumpling'],
        tips: 'Percer le xiaolongbao avec les baguettes pour libérer le bouillon avant de manger.',
        status: 'planned',
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
    foodRecommendations: [
      'Nanxiang xiaolongbao au bazar Yuyuan',
      'Tofu puant frit (臭豆腐) — street food du bazar',
      'Tangyuan (汤圆) — boulettes de riz glutineux sucrées',
      'Café et pâtisseries dans la concession française',
      'Hongshao rou (红烧肉) — porc braisé caramélisé shanghaïen',
    ],
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
        description:
          'Jardin classique chinois de la dynastie Ming (1559), avec pavillons, bassins et rocailles sur 2 hectares.',
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
        description:
          'Marché traditionnel entourant le Yu Garden, avec boutiques de souvenirs, thé et street food.',
        type: 'shopping',
        duration: '1h30',
        coordinates: [31.2274, 121.4926],
        address: '269 Fangbang Middle Road, Huangpu District, Shanghai',
        tags: ['marché', 'souvenirs', 'street food'],
        rating: 4.3,
        reservationRequired: false,
        status: 'planned',
      },
      {
        id: 'act-day2-3',
        name: 'Nanxiang Dumpling House',
        description:
          'Restaurant historique (depuis 1900) célèbre pour ses xiaolongbao, situé dans le bazar Yuyuan.',
        type: 'food',
        duration: '1h',
        coordinates: [31.2277, 121.4921],
        address: '85 Yuyuan Road, Huangpu District, Shanghai',
        price: 60,
        currency: 'CNY',
        rating: 4.2,
        tags: ['xiaolongbao', 'historique', 'dumpling'],
        tips: "File d'attente souvent longue au RDC — le 2e étage est plus rapide avec service à table.",
        status: 'planned',
      },
      {
        id: 'act-day2-4',
        name: 'Balade concession française',
        description:
          "Promenade dans les rues bordées de platanes de l'ancienne concession française, avec cafés et boutiques.",
        type: 'visit',
        duration: '2h',
        coordinates: [31.2139, 121.4701],
        address: 'Fuxing Road / Huaihai Road, Xuhui District, Shanghai',
        tags: ['colonial', 'promenade', 'architecture'],
        rating: 4.6,
        reservationRequired: false,
        status: 'planned',
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
    foodRecommendations: [
      "Huîtres grillées à l'ail (蒜蓉烤生蚝) — spécialité locale",
      'Palourdes sautées au piment',
      'Bière Tsingtao fraîche non pasteurisée (à la brasserie)',
      'Crevettes sel et poivre',
      'Jiaozi aux fruits de mer',
    ],
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
        description:
          'Jetée symbôle de Qingdao construite en 1892, avec le pavillon Huilan à son extrémité.',
        type: 'visit',
        duration: '1h',
        coordinates: [36.0605, 120.3203],
        address: '12 Taiping Road, Shinan District, Qingdao',
        openAt: '07:00–19:00',
        price: 0,
        currency: 'CNY',
        rating: 4.4,
        tags: ['landmark', 'maritime', 'gratuit'],
        reservationRequired: false,
        status: 'planned',
      },
      {
        id: 'act-day3-2',
        name: 'Cathédrale Saint-Michel',
        description:
          "Cathédrale catholique de style gothique allemand construite en 1934, une des plus grandes d'Asie de l'Est.",
        type: 'visit',
        duration: '45m',
        coordinates: [36.064, 120.327],
        address: '15 Zhejiang Road, Shinan District, Qingdao',
        openAt: '08:00–17:00',
        price: 10,
        currency: 'CNY',
        rating: 4.5,
        tags: ['architecture', 'colonial', 'religieux'],
        reservationRequired: false,
        status: 'planned',
      },
      {
        id: 'act-day3-3',
        name: 'Musée bière Tsingtao',
        description:
          "Musée installé dans l'ancienne brasserie allemande de 1903, avec dégustation de bière fraîche incluse.",
        type: 'visit',
        duration: '1h30',
        coordinates: [36.0775, 120.32],
        address: '56 Dengzhou Road, Shibei District, Qingdao',
        openAt: '08:30–16:30',
        price: 60,
        currency: 'CNY',
        rating: 4.5,
        tags: ['brasserie', 'musée', 'dégustation'],
        reservationRequired: false,
        tips: 'La bière non pasteurisée (en fin de visite) est bien meilleure que la version export.',
        status: 'planned',
      },
      {
        id: 'act-day3-4',
        name: 'Dîner fruits de mer',
        description:
          'Dégustation de fruits de mer ultra-frais dans les restaurants du front de mer de Qingdao.',
        type: 'food',
        duration: '1h30',
        coordinates: [36.0571, 120.3212],
        address: 'Shinan District, Qingdao',
        tags: ['fruits de mer', 'cuisine locale', 'front de mer'],
        tips: "Commander des huîtres grillées à l'ail et des palourdes sautées, spécialités de Qingdao.",
        status: 'planned',
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
    foodRecommendations: [
      'Jianbing (煎饼) — crêpe chinoise garnie œuf-sauce-coriandre',
      'Tanghulu (糖葫芦) — brochettes de fruits caramélisés',
      'Baozi vapeur farcis au porc (包子)',
      'Zhajiangmian (炸酱面) — nouilles sauce soja et porc haché',
      "Brochettes d'agneau épicées (羊肉串)",
    ],
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
        description:
          "Arrivée et installation dans l'appartement-hôtel du quartier CBD, proche de Jianguomen.",
        type: 'experience',
        duration: '1h',
        status: 'planned',
      },
      {
        id: 'act-day4-2',
        name: 'Balade Wangfujing',
        description:
          'Rue commerçante emblématique de Pékin, mélange de grands magasins, boutiques et street food.',
        type: 'visit',
        duration: '1h30',
        coordinates: [39.9153, 116.404],
        address: 'Wangfujing Street, Dongcheng District, Beijing',
        tags: ['shopping', 'street food', 'iconic'],
        rating: 4.3,
        reservationRequired: false,
        status: 'planned',
      },
      {
        id: 'act-day4-3',
        name: 'Marché street food',
        description:
          'Donghuamen Night Market — brochettes, scorpions frits, fruits de mer, et spécialités pékinoises.',
        type: 'food',
        duration: '1h30',
        coordinates: [39.9142, 116.4063],
        address: 'Donghuamen Street, Dongcheng District, Beijing',
        tags: ['night market', 'street food', 'brochettes'],
        tips: 'Tester le jianbing (煥饼) et les tanghulu (糖葫芦), deux snacks incontournables.',
        status: 'planned',
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
    foodRecommendations: [
      'Canard laqué de Pékin (北京烤鸭) — chez Quanjude ou Da Dong',
      'Lü da gun (驴打滚) — gâteau de riz glutineux au soja',
      'Douzhi (豆汁) — boisson fermentée aux haricots mungo (typique pékinois)',
      'Nouilles tirées à la main (拉面)',
      'Aiwowo (艾窝窝) — boulette de riz fourrée sucrée',
    ],
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
        description:
          'Plus grande place publique du monde (440 000 m²), cœur symbolique de la Chine moderne.',
        type: 'visit',
        duration: '45m',
        coordinates: [39.9056, 116.3976],
        address: 'Tiananmen Square, Dongcheng District, Beijing',
        tags: ['landmark', 'historique', 'iconic'],
        rating: 4.6,
        reservationRequired: false,
        status: 'planned',
      },
      {
        id: 'act-day5-2',
        name: 'Cité interdite',
        description:
          'Palais impérial de 72 hectares (1420–1912), plus grand complexe palatial au monde — 9 999 pièces.',
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
        description:
          'Colline artificielle offrant la meilleure vue panoramique sur la Cité interdite et Pékin.',
        type: 'visit',
        duration: '1h',
        coordinates: [39.9249, 116.3966],
        address: '44 Jingshan West Street, Xicheng District, Beijing',
        openAt: '06:00–21:00',
        price: 2,
        currency: 'CNY',
        rating: 4.7,
        tags: ['panorama', 'parc', 'vue'],
        reservationRequired: false,
        tips: 'Monter au Pavillon Wanchun au sommet pour la vue à 360° sur la Cité interdite.',
        status: 'planned',
      },
      {
        id: 'act-day5-4',
        name: 'Dîner canard laqué',
        description:
          'Dégustation du célèbre canard laqué de Pékin (北京烤鸭), spécialité impériale depuis 600 ans.',
        type: 'food',
        duration: '1h30',
        coordinates: [39.9286, 116.4044],
        address: 'Dongcheng District, Beijing',
        tags: ['canard laqué', 'cuisine impériale', 'incontournable'],
        tips: "Réserver à l'avance dans les restaurants réputés (Quanjude ou Da Dong).",
        price: 200,
        currency: 'CNY',
        status: 'planned',
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
    foodRecommendations: [
      'Restaurant local près de Mutianyu — poulet fermé braisé (nongjiayuan)',
      'Truite arc-en-ciel de rivière grillée',
      'Maïs grillé et patates douces rôties (stands près de la muraille)',
      'Thé au jasmin dans les maisons de thé au pied de la muraille',
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
        description:
          'Section restaurée de la Grande Muraille, moins fréquentée que Badaling, avec 23 tours de guet sur 5,4 km.',
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
        description:
          'Téléphérique de Mutianyu pour monter sur la muraille, vue spectaculaire sur les montagnes.',
        type: 'experience',
        duration: '20m',
        coordinates: [40.4319, 116.5704],
        price: 120,
        currency: 'CNY',
        tags: ['téléphérique', 'panorama', 'aventure'],
        status: 'planned',
      },
      {
        id: 'act-day6-3',
        name: 'Descente luge',
        description:
          'Toboggan alpin pour redescendre de la muraille — fun et rapide !',
        type: 'experience',
        duration: '10m',
        coordinates: [40.4319, 116.5704],
        price: 100,
        currency: 'CNY',
        tags: ['luge', 'aventure', 'fun'],
        tips: "Freiner dans les virages et profiter de la vue — possibilité de s'arrêter pour des photos.",
        status: 'planned',
      },
    ],
    transport: {
      id: 'tr-day6',
      type: 'plane',
      from: 'PKX Beijing Daxing Intl.',
      to: 'XIY Xi’an Xianyang Intl.',
      details:
        'China Southern Airlines CZ8823 | Meal | Boeing 737-900ER (Mid-sized)',
      departureAddress: 'Beijing Daxing International Airport (PKX), Beijing',
      departureTime: '13:00',
      arrivalTime: '15:10',
      duration: '2h 10m',
      provider: 'China Southern Airlines',
      terminal: 'T5',
      price: 680,
      currency: 'CNY',
      status: 'booked',
      notes: 'May 16 | 2h 10m — All times are shown in local time',
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
    foodRecommendations: [
      'Roujiamo (肉夹馍) — le « burger chinois », pain farci au porc braisé',
      "Yangrou paomo (羊肉泡馍) — soupe d'agneau au pain émietté",
      "Biang biang noodles (— nouilles larges épicées à l'huile de piment",
      'Liangpi (凉皮) — nouilles froides au vinaigre et sésame',
      'Persimmon cakes (柿子饼) — gâteaux au kaki frits',
    ],
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
        description:
          'Quartier historique Hui avec ruelles animées, étals de street food, épices et artisanat.',
        type: 'visit',
        duration: '2h',
        coordinates: [34.2637, 108.9403],
        address: "Beiyuanmen Street, Lianhu District, Xi'an",
        tags: ['street food', 'culture', 'marché'],
        rating: 4.6,
        reservationRequired: false,
        tips: 'Goûter le yangrou paomo (羊肉泡馍) et le roujiamo (肉夹馍), le « burger chinois ».',
        status: 'planned',
      },
      {
        id: 'act-day7-2',
        name: 'Grande mosquée',
        description:
          "Grande Mosquée de Xi'an, fondée en 742, mélange unique d'architecture chinoise et islamique.",
        type: 'visit',
        duration: '1h',
        coordinates: [34.2614, 108.9371],
        address: "30 Huajue Lane, Lianhu District, Xi'an",
        openAt: '08:00–19:00',
        price: 25,
        currency: 'CNY',
        rating: 4.5,
        tags: ['mosquée', 'historique', 'architecture'],
        reservationRequired: false,
        status: 'planned',
      },
      {
        id: 'act-day7-3',
        name: 'Street food noodles',
        description:
          'Dégustation de biang biang noodles (“écrites avec le caractère le plus complexe du chinois”) — nouilles larges épicées.',
        type: 'food',
        duration: '1h',
        coordinates: [34.2625, 108.9395],
        address: "Quartier musulman, Lianhu District, Xi'an",
        price: 25,
        currency: 'CNY',
        tags: ['noodles', 'biang biang', 'cuisine locale'],
        tips: 'Essayer aussi les persimmon cakes (柿子饼), dessert local populaire.',
        status: 'planned',
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
    foodRecommendations: [
      "Guantang bao (灘汤包) — gros baozi farci au bouillon de Xi'an",
      'Zenggao (甘糕) — gâteau de riz aux jujubes (spécialité locale)',
      'Suanmei tang (酸梅汤) — boisson au jus de prune acidé et fraîch',
      'Hulatang (胡辣汤) — soupe épicée du matin',
      "Youpo chemian (油泼扒面) — nouilles à l'huile de piment fraîche",
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
        description:
          "Armée de 8 000 soldats en terre cuite grandeur nature enterrés avec l'empereur Qin Shi Huang en 210 av. J.-C.",
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
        description:
          'Tour à vélo sur les remparts de la dynastie Ming (14 km de circonférence), les mieux conservés de Chine.',
        type: 'experience',
        duration: '2h',
        coordinates: [34.2658, 108.9456],
        address: "South Gate (Yongning Gate), Beilin District, Xi'an",
        openAt: '08:00–22:00',
        price: 54,
        currency: 'CNY',
        rating: 4.7,
        tags: ['vélo', 'remparts', 'panorama'],
        tips: 'Location de vélo : 45 CNY/2h. Tandem disponible. Départ recommandé depuis South Gate.',
        status: 'planned',
      },
      {
        id: 'act-day8-3',
        name: "Pagode de l'oie sauvage",
        description:
          "Pagode bouddhiste de 64m construite en 652, symbole de Xi'an. Fontaines musicales sur la place.",
        type: 'visit',
        duration: '1h',
        coordinates: [34.2185, 108.9593],
        address: "Da Ci'en Temple, 1 Yanta South Road, Yanta District, Xi'an",
        openAt: '08:00–17:30',
        price: 40,
        currency: 'CNY',
        rating: 4.6,
        tags: ['pagode', 'bouddhisme', 'UNESCO'],
        reservationRequired: false,
        tips: 'Le spectacle de fontaines musicales a lieu le soir sur la place nord (gratuit).',
        status: 'planned',
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
    foodRecommendations: [
      'Xiaomian (小面) — nouilles épicées de Chongqing au poivre de Sichuan',
      'Suanla fen (酸辣粉) — vermicelles de patate douce aigre-épicées',
      'Brochettes de cervelle de lapin (spécialité locale)',
      "Chaoshou (抄手) — wontons à l'huile de piment de Chongqing",
      'Jus de canne à sucre fraîchement pressé',
    ],
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
      {
        id: 'act-day9-1',
        name: 'Hongyadong',
        description:
          "Complexe de 11 étages bâti à flanc de falaise, inspiré de l'architecture Bayu — surnommé « le Spirited Away réel ».",
        type: 'visit',
        duration: '2h',
        coordinates: [29.5638, 106.5831],
        address: '88 Cangbai Road, Yuzhong District, Chongqing',
        openAt: '11:00–23:00',
        price: 0,
        currency: 'CNY',
        rating: 4.5,
        tags: ['architecture', 'nuit', 'iconic'],
        reservationRequired: false,
        tips: 'Venir à la tombée de la nuit pour les illuminations — vue incroyable depuis le pont Qiansi Men.',
        status: 'planned',
      },
      {
        id: 'act-day9-2',
        name: 'Promenade Yangtze',
        description:
          'Balade sur les berges aménagées du Yangtze avec vue sur le skyline illuminé de Chongqing.',
        type: 'visit',
        duration: '1h30',
        coordinates: [29.5592, 106.5786],
        address: "Nanbin Road, Nan'an District, Chongqing",
        tags: ['promenade', 'rivière', 'nuit'],
        rating: 4.4,
        reservationRequired: false,
        status: 'planned',
      },
      {
        id: 'act-day9-3',
        name: 'Rooftop photo spot',
        description:
          'Point de vue en hauteur pour photographier la skyline de Chongqing et le confluent des deux fleuves.',
        type: 'experience',
        duration: '1h',
        coordinates: [29.5617, 106.5825],
        tags: ['photo', 'panorama', 'skyline'],
        tips: "Le meilleur moment est à l'heure bleue (juste après le coucher du soleil).",
        status: 'planned',
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
    foodRecommendations: [
      'Hot pot de Chongqing (重庆火锅) — bouillon rouge au piment et poivre de Sichuan',
      'Maoxuewang (毛血旺) — ragoût de sang de canard épicé',
      'Douhua (豆花) — tofu soyeux au piment',
      'Lazi ji (辣子鸡) — poulet frit aux piments séchés',
      'Bing fen (冰粉) — dessert gelée glacée au sucre roux',
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
        description:
          'Station de métro célèbre où le monorail traverse un immeuble résidentiel de 19 étages — unique au monde.',
        type: 'visit',
        duration: '30m',
        coordinates: [29.5528, 106.5287],
        address: 'Liziba Station, Line 2, Yuzhong District, Chongqing',
        price: 0,
        currency: 'CNY',
        tags: ['métro', 'insolite', 'architecture'],
        rating: 4.6,
        tips: "Se placer sur la plateforme d'observation extérieure pour voir le train entrer dans l'immeuble.",
        status: 'planned',
      },
      {
        id: 'act-day10-2',
        name: 'Ciqikou Ancient Town',
        description:
          'Vieux quartier de la dynastie Ming, ruelles pavées avec boutiques de thé, artisanat et street food.',
        type: 'visit',
        duration: '2h',
        coordinates: [29.58, 106.4514],
        address: 'Ciqikou, Shapingba District, Chongqing',
        openAt: '08:00–21:00',
        price: 0,
        currency: 'CNY',
        rating: 4.3,
        tags: ['ancien', 'artisanat', 'thé'],
        reservationRequired: false,
        tips: 'Acheter du mahua (torsade frite sucrée), la spécialité du quartier.',
        status: 'planned',
      },
      {
        id: 'act-day10-3',
        name: 'Hot pot traditionnel',
        description:
          "Expérience du hot pot sichuanais à Chongqing, sa ville d'origine — bouillon rouge ultra-épicé.",
        type: 'food',
        duration: '2h',
        coordinates: [29.5587, 106.5762],
        address: 'Jiefangbei, Yuzhong District, Chongqing',
        price: 100,
        currency: 'CNY',
        rating: 4.7,
        tags: ['hot pot', 'épicé', 'sichuan'],
        tips: 'Commander un bouillon « yuanyang » (mi-épicé, mi-doux) si vous ne supportez pas trop le piment.',
        status: 'planned',
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
    foodRecommendations: [
      'Poisson en tête de pierre (石蝴蚤鱼) — spécialité du Hunan',
      'Tofu fumé local (煴豆腐)',
      'Lamian épicées au porc haché (style Hunan)',
      'Larou (腊肉) — porc fumé/séché du Hunan',
      "Poivrons sautés à l'ail (尖椒炒肉) — plat classique hunannais",
    ],
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
        description:
          'Arrivée et installation dans la guesthouse du centre-ville de Zhangjiajie.',
        type: 'experience',
        duration: '1h',
        status: 'planned',
      },
      {
        id: 'act-day11-2',
        name: 'Balade Yongding District',
        description:
          'Découverte du centre-ville de Zhangjiajie, marché local et ambiance de ville de montagne.',
        type: 'visit',
        duration: '2h',
        coordinates: [29.1168, 110.4792],
        address: 'Yongding District, Zhangjiajie City, Hunan',
        tags: ['ville', 'marché', 'balade'],
        status: 'planned',
      },
      {
        id: 'act-day11-3',
        name: 'Dîner local',
        description:
          'Cuisine du Hunan (xiang cai) — très épicée et parfumée, différente du Sichuan.',
        type: 'food',
        duration: '1h30',
        coordinates: [29.1175, 110.4785],
        address: 'Yongding District, Zhangjiajie City, Hunan',
        tags: ['cuisine Hunan', 'épicé', 'cuisine locale'],
        tips: 'Essayer le poisson en tête de pierre (石蝴蚤鱼) et le tofu fumé local.',
        status: 'planned',
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
    foodRecommendations: [
      'Sanxiaguo (三下锅) — fondue sèche aux trois ingrédients au choix',
      'Riz sauté au porc fumé du Hunan',
      'Pâte de piment maison sur du riz blanc',
      'Snacks de randonnée : œufs de thé et graines de tournesol',
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
        description:
          'Premier parc national forestier de Chine (1982), célèbre pour ses piliers de grès vertigineux.',
        type: 'visit',
        duration: '6h',
        coordinates: [29.3249, 110.4343],
        address: 'Wulingyuan District, Zhangjiajie City, Hunan',
        openAt: '07:00–18:00',
        price: 225,
        currency: 'CNY',
        rating: 4.9,
        tags: ['UNESCO', 'nature', 'randonnée'],
        reservationRequired: true,
        tips: 'Le billet est valable 4 jours. Prendre la navette gratuite dans le parc.',
        status: 'planned',
      },
      {
        id: 'act-day12-2',
        name: 'Avatar Hallelujah Mountain',
        description:
          'Pilier de grès de 150m renommé après le film Avatar (2009). Vue à couper le souffle.',
        type: 'visit',
        duration: '2h',
        coordinates: [29.3472, 110.4338],
        address: 'Yuanjiajie Scenic Area, Wulingyuan, Zhangjiajie',
        tags: ['Avatar', 'panorama', 'iconic'],
        rating: 4.9,
        tips: "Accès par l'ascenseur de Bailong (le plus haut ascenseur extérieur du monde, 326m).",
        status: 'planned',
      },
      {
        id: 'act-day12-3',
        name: 'Golden Whip Stream',
        description:
          "Sentier de 7,5 km le long d'un ruisseau cristallin au fond de la vallée, entouré de piliers rocheux.",
        type: 'visit',
        duration: '2h',
        coordinates: [29.3186, 110.4444],
        address: 'Golden Whip Stream, Wulingyuan, Zhangjiajie',
        tags: ['randonnée', 'nature', 'rivière'],
        rating: 4.7,
        tips: 'Chemin plat et ombragé, idéal pour souffler après la montée. Possibilité de croiser des singes.',
        status: 'planned',
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
    foodRecommendations: [
      'Choudoufu frit (臭豆腐) — version Hunan ultra-épicée',
      'Mifen (米粉) — nouilles de riz du Hunan au bouillon',
      'Chou sauté au vinaigre et piment (style Hunan)',
      'Tangyou baba (糖油粑粑) — béignets de riz glutineux sucrés',
    ],
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
        description:
          'Montagne sacrée de 1 518m avec le plus long téléphérique du monde (7 455m).',
        type: 'visit',
        duration: '4h',
        coordinates: [29.0525, 110.4847],
        address:
          'Tianmen Mountain National Park, Yongding District, Zhangjiajie',
        openAt: '08:00–16:00',
        price: 278,
        currency: 'CNY',
        rating: 4.8,
        tags: ['montagne', 'téléphérique', 'nature'],
        reservationRequired: true,
        tips: "Réserver les billets en ligne à l'avance — quota journalier limité.",
        status: 'planned',
      },
      {
        id: 'act-day13-2',
        name: 'Glass Skywalk',
        description:
          "Passerelle en verre à 1 430m d'altitude, accrochée à la falaise — 60m de long, vertige garanti.",
        type: 'experience',
        duration: '1h',
        coordinates: [29.0525, 110.4847],
        price: 5,
        currency: 'CNY',
        tags: ['vertige', 'verre', 'aventure'],
        rating: 4.7,
        tips: 'Chaussons antidérapants fournis sur place. Pas de selfie stick autorisé.',
        status: 'planned',
      },
      {
        id: 'act-day13-3',
        name: 'Porte du Ciel',
        description:
          'Arche naturelle de 131m de haut percée dans la montagne, accessible par 999 marches.',
        type: 'visit',
        duration: '1h',
        coordinates: [29.0494, 110.4841],
        tags: ['naturel', 'escalier', 'iconic'],
        rating: 4.8,
        tips: "Les 999 marches sont raides — possibilité de prendre l'escalator pour une partie.",
        status: 'planned',
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
    foodRecommendations: [
      'Shengjianbao (生煎包) — la version frite du xiaolongbao',
      'Paigu nianfan (排骨年糕) — travers de porc sur riz glutineux',
      'Cifàn (糍饭) — onigiri shanghaïen au riz gluant',
      'Wontons en bouillon de crevettes séchées',
      'Soy milk chaud + youtiao (油条) pour le petit-déj',
    ],
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
        description:
          "Arrivée à l'hôtel près de la gare de Shanghai, quartier Putuo.",
        type: 'experience',
        duration: '1h',
        status: 'planned',
      },
      {
        id: 'act-day14-2',
        name: 'Nanjing Road',
        description:
          "Plus célèbre rue commerçante de Chine (5,5 km), de People's Square au Bund. Piétonne sur une grande partie.",
        type: 'shopping',
        duration: '2h',
        coordinates: [31.2352, 121.4728],
        address: 'Nanjing East Road, Huangpu District, Shanghai',
        tags: ['shopping', 'piéton', 'iconic'],
        rating: 4.4,
        reservationRequired: false,
        status: 'planned',
      },
      {
        id: 'act-day14-3',
        name: 'Dîner Shanghai',
        description:
          'Cuisine shanghaïenne — hongshao rou (porc braisé caramélisé), crevettes au thé Longjing.',
        type: 'food',
        duration: '1h30',
        coordinates: [31.2341, 121.4735],
        address: 'Nanjing Road area, Huangpu District, Shanghai',
        tags: ['cuisine shanghaïenne', 'restaurant', 'local'],
        tips: 'Essayer le shengjianbao (生煎包), la version frite du xiaolongbao — spécialité locale.',
        status: 'planned',
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
    foodRecommendations: [
      'Café spécialité dans les ruelles de Tianzifang',
      'Scallion oil noodles (葱油拌面) — nouilles simples et parfumées',
      'Dazhaxie (大闸蟹) — crabes poilus de Shanghai (en saison)',
      'Thé Longjing dans un salon de thé traditionnel',
    ],
    tips: ['Faire les derniers achats souvenirs'],
    notes: 'Journée libre avant le départ pour Taiwan.',
    images: [],
    activities: [
      {
        id: 'act-day15-1',
        name: 'Tianzifang',
        description:
          "Labyrinthe de ruelles dans l'ancienne concession française, reconverti en quartier arty avec galeries et cafés.",
        type: 'visit',
        duration: '2h',
        coordinates: [31.2084, 121.4684],
        address: '210 Taikang Road, Huangpu District, Shanghai',
        openAt: '10:00–22:00',
        tags: ['art', 'cafés', 'galeries'],
        rating: 4.4,
        reservationRequired: false,
        tips: 'Se perdre dans les petites ruelles — chaque passage cache des boutiques originales.',
        status: 'planned',
      },
      {
        id: 'act-day15-2',
        name: 'Shopping souvenirs',
        description:
          'Derniers achats de souvenirs : thé chinois, soieries, calligraphie, objets en jade.',
        type: 'shopping',
        duration: '2h',
        coordinates: [31.2304, 121.4737],
        tags: ['souvenirs', 'shopping', 'thé'],
        tips: 'Le thé en vrac est un excellent souvenir — négocier les prix dans les petites boutiques.',
        status: 'planned',
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
    foodRecommendations: [
      'Pepper bun (胡椒餅) — petit pain farci porc-poivre cuit au four en terre',
      'Bubble tea (bo ba nǎi chá) — le vrai, à Taïwan où il a été inventé',
      'Lu rou fan (滷肉飯) — riz au porc braisé, plat national taïwanais',
      'Gua bao (券包) — sandwich vapeur au porc braisé et cacahuètes',
      'Mango shaved ice (芒果剗冰) — glace pilée à la mangue fraîche',
    ],
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
        description:
          'Arrivée au Caesar Metro Taipei, quartier Wanhua, proche du MRT.',
        type: 'experience',
        duration: '1h',
        status: 'planned',
      },
      {
        id: 'act-day16-2',
        name: 'Taipei 101',
        description:
          'Gratte-ciel de 508m (101 étages), ancien plus haut bâtiment du monde. Observatoire au 89e étage.',
        type: 'visit',
        duration: '2h',
        coordinates: [25.0339, 121.5645],
        address: 'No. 7, Section 5, Xinyi Road, Xinyi District, Taipei',
        openAt: '11:00–21:00',
        price: 600,
        currency: 'TWD',
        rating: 4.6,
        tags: ['gratte-ciel', 'observatoire', 'iconic'],
        reservationRequired: false,
        tips: "Monter à l'observatoire en fin de journée pour voir le coucher de soleil puis la ville illuminée.",
        status: 'planned',
      },
      {
        id: 'act-day16-3',
        name: 'Ximending',
        description:
          'Quartier piéton branché de Taipei, équivalent du Harajuku de Tokyo — shopping, street art, cinémas.',
        type: 'visit',
        duration: '2h',
        coordinates: [25.0424, 121.5081],
        address: 'Ximending, Wanhua District, Taipei',
        tags: ['shopping', 'street art', 'jeunesse'],
        rating: 4.4,
        reservationRequired: false,
        status: 'planned',
      },
      {
        id: 'act-day16-4',
        name: 'Night market',
        description:
          'Marché de nuit de Raohe — un des plus anciens de Taipei, réputé pour le pepper bun (胡椒餅).',
        type: 'food',
        duration: '1h30',
        coordinates: [25.0509, 121.5774],
        address: 'Raohe Street, Songshan District, Taipei',
        openAt: '17:00–00:00',
        tags: ['night market', 'street food', 'local'],
        rating: 4.5,
        tips: "Le pepper bun (胡椒餅) à l'entrée est le meilleur de Taipei — file d'attente normale.",
        status: 'planned',
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
    foodRecommendations: [
      'Yuyuan (苋圆) — boulettes de taro fourrées à Jiufen',
      'Ayu (香魚) — petit poisson grillé de rivière',
      'Thé oolong au salon A-MEI Tea House de Jiufen',
      'Peanut ice cream roll (花生卷冰淇淋) — crêpe à la glace et cacahuètes',
      'Boulettes de poisson de Jiufen',
    ],
    tips: ['Prendre le train pour Shifen', 'Jiufen est bondé le week-end'],
    notes: 'Excursion dans les villages pittoresques autour de Taipei.',
    images: [],
    activities: [
      {
        id: 'act-day17-1',
        name: 'Village de Jiufen',
        description:
          'Village de montagne ayant inspiré « Le Voyage de Chihiro » — ruelles en escalier, lanternes rouges, salons de thé.',
        type: 'visit',
        duration: '3h',
        coordinates: [25.1094, 121.8444],
        address: 'Jishan Street, Ruifang District, New Taipei City',
        tags: ['Ghibli', 'thé', 'montagne'],
        rating: 4.5,
        reservationRequired: false,
        tips: 'Prendre un thé au salon A-MEI Tea House pour la vue sur la mer. Venir en semaine pour éviter la foule.',
        status: 'planned',
      },
      {
        id: 'act-day17-2',
        name: 'Cascades Shifen',
        description:
          'Cascades de 20m de large surnommées le « petit Niagara de Taïwan », entourées de végétation tropicale.',
        type: 'visit',
        duration: '1h30',
        coordinates: [25.0314, 121.7765],
        address: 'Shifen, Pingxi District, New Taipei City',
        openAt: '09:00–18:00',
        price: 0,
        currency: 'TWD',
        rating: 4.5,
        tags: ['cascade', 'nature', 'rando'],
        reservationRequired: false,
        tips: '15 minutes de marche depuis la gare de Shifen. Chemin facile et bien aménagé.',
        status: 'planned',
      },
      {
        id: 'act-day17-3',
        name: 'Lâcher de lanternes',
        description:
          'Écrire ses vœux sur une lanterne en papier et la lâcher au-dessus des voies ferrées de Shifen.',
        type: 'experience',
        duration: '30m',
        coordinates: [25.0424, 121.7773],
        address: 'Shifen Old Street, Pingxi District, New Taipei City',
        price: 150,
        currency: 'TWD',
        tags: ['lanterne', 'tradition', 'vœux'],
        rating: 4.6,
        tips: 'Choisir une lanterne multicolore (chaque couleur = un type de vœu différent).',
        status: 'planned',
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
    foodRecommendations: [
      'Xiaolongbao Din Tai Fung — les meilleurs au monde (classiques + truffe)',
      'Da ji pai (大雞排) — steak de poulet frit géant au marché Shilin',
      'Oyster omelette (蛤仔煩) — omelette aux huîtres et fécule',
      'Stinky tofu (臭豆腐) — version taïwanaise frite avec chou mariné',
      'Douhua (豆花) — tofu soyeux sucré au sirop de gingembre',
    ],
    tips: ['Goûter le bubble tea taïwanais'],
    notes: 'Dernière journée à Taipei, profiter de la street food.',
    images: [],
    activities: [
      {
        id: 'act-day18-1',
        name: 'Longshan Temple',
        description:
          'Temple bouddhiste-taoïste de 1738, le plus ancien et vénéré de Taipei. Architecture richement ornée.',
        type: 'visit',
        duration: '1h',
        coordinates: [25.0372, 121.4999],
        address: 'No. 211, Guangzhou Street, Wanhua District, Taipei',
        openAt: '06:00–22:00',
        price: 0,
        currency: 'TWD',
        rating: 4.6,
        tags: ['temple', 'bouddhisme', 'taoïsme'],
        reservationRequired: false,
        tips: 'Possibilité de faire une divination gratuite avec les blocs lunaires (jiaobei).',
        status: 'planned',
      },
      {
        id: 'act-day18-2',
        name: 'Din Tai Fung',
        description:
          'Chaîne de restaurants étoilée Michelin, mondialement célèbre pour ses xiaolongbao parfaits.',
        type: 'food',
        duration: '1h30',
        coordinates: [25.0339, 121.5298],
        address: "No. 194, Section 2, Xinyi Road, Da'an District, Taipei",
        openAt: '10:00–21:00',
        price: 400,
        currency: 'TWD',
        rating: 4.7,
        tags: ['Michelin', 'xiaolongbao', 'institution'],
        reservationRequired: false,
        tips: 'Commander les xiaolongbao classiques, truffe noire, et les nouilles dan dan.',
        status: 'planned',
      },
      {
        id: 'act-day18-3',
        name: 'Shilin Night Market',
        description:
          'Plus grand et célèbre marché de nuit de Taipei — street food, jeux, vêtements.',
        type: 'food',
        duration: '2h',
        coordinates: [25.0882, 121.5244],
        address: 'No. 101, Jihe Road, Shilin District, Taipei',
        openAt: '16:00–00:00',
        tags: ['night market', 'street food', 'iconic'],
        rating: 4.4,
        tips: 'Incontournables : steak de poulet frit géant (豪大大雞排), oyster omelette, mango shaved ice.',
        status: 'planned',
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
    foodRecommendations: [
      'Dernier xiaolongbao ou shengjianbao — pour la route',
      "Malatang (麻辣烫) — fondue individuelle au choix d'ingrédients",
      'Thé au chrysanthème frais',
      'Dapanji (大盘鸡) — poulet braisé aux pommes de terre et nouilles',
    ],
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
        description:
          'Dernière balade le long du Bund pour profiter une dernière fois du skyline de Pudong.',
        type: 'visit',
        duration: '2h',
        coordinates: [31.24, 121.49],
        address: 'Zhongshan East 1st Road, Huangpu District, Shanghai',
        tags: ['promenade', 'skyline', 'adieu'],
        status: 'planned',
      },
      {
        id: 'act-day19-2',
        name: 'Dîner d\u0027adieu',
        description:
          'Dernier repas en Chine — récapitulatif des meilleurs plats du voyage.',
        type: 'food',
        duration: '2h',
        coordinates: [31.2304, 121.4737],
        address: 'Putuo District, Shanghai',
        tags: ['dernier repas', 'adieu', 'cuisine chinoise'],
        tips: 'Profiter pour commander tous les plats préférés découverts pendant le voyage.',
        status: 'planned',
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
    foodRecommendations: [
      'Petit-déj shanghaïen : soy milk + youtiao + cifàn',
      "Snacks pour l'avion : sachets de graines et fruits séchés",
    ],
    notes: 'Checkout et départ pour l\u0027aéroport.',
    images: [],
    activities: [
      {
        id: 'act-day20-1',
        name: 'Checkout hôtel',
        description: 'Checkout et vérification des bagages avant le départ.',
        type: 'experience',
        duration: '1h',
        status: 'planned',
      },
      {
        id: 'act-day20-2',
        name: 'Transfert aéroport Hongqiao',
        description:
          "Trajet en taxi ou métro vers l'aéroport international de Shanghai Hongqiao (Terminal 2).",
        type: 'transport',
        duration: '1h30',
        coordinates: [31.1979, 121.3362],
        address: 'Shanghai Hongqiao International Airport, Terminal 2',
        tips: 'Prévoir 2h minimum avant le vol — les contrôles de sécurité peuvent être longs.',
        status: 'planned',
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
