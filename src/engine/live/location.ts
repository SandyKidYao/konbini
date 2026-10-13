// Where is the viewer? Browser geolocation first (asks permission), then an IP lookup — trusted only if its
// time zone agrees with this device's (VPNs are common) — then a city for the device's time zone.
export interface Place {
  lat: number;
  lon: number;
  name?: string;
  /** true when the position is a guess (IP or time zone), not a precise fix */
  approx: boolean;
  source: 'gps' | 'ip' | 'timezone' | 'manual';
}

const TZ_CITIES: Record<string, [string, number, number]> = {
  'Asia/Shanghai': ['上海', 31.23, 121.47], 'Asia/Chongqing': ['重庆', 29.56, 106.55], 'Asia/Urumqi': ['乌鲁木齐', 43.83, 87.62],
  'Asia/Hong_Kong': ['香港', 22.32, 114.17], 'Asia/Macau': ['澳门', 22.2, 113.55], 'Asia/Taipei': ['台北', 25.03, 121.57],
  'Asia/Tokyo': ['東京', 35.68, 139.69], 'Asia/Seoul': ['首尔', 37.57, 126.98], 'Asia/Singapore': ['新加坡', 1.35, 103.82],
  'Asia/Bangkok': ['曼谷', 13.76, 100.5], 'Asia/Kolkata': ['新德里', 28.61, 77.21], 'Asia/Dubai': ['迪拜', 25.2, 55.27],
  'Europe/London': ['伦敦', 51.51, -0.13], 'Europe/Paris': ['巴黎', 48.86, 2.35], 'Europe/Berlin': ['柏林', 52.52, 13.4],
  'Europe/Moscow': ['莫斯科', 55.76, 37.62], 'America/New_York': ['纽约', 40.71, -74.01], 'America/Chicago': ['芝加哥', 41.88, -87.63],
  'America/Denver': ['丹佛', 39.74, -104.99], 'America/Los_Angeles': ['洛杉矶', 34.05, -118.24], 'America/Toronto': ['多伦多', 43.65, -79.38],
  'America/Vancouver': ['温哥华', 49.28, -123.12], 'America/Sao_Paulo': ['圣保罗', -23.55, -46.63], 'Australia/Sydney': ['悉尼', -33.87, 151.21],
  'Australia/Melbourne': ['墨尔本', -37.81, 144.96], 'Pacific/Auckland': ['奥克兰', -36.85, 174.76],
};

export const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

function fromGeolocation(timeout = 9000): Promise<Place | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, approx: false, source: 'gps' }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout, maximumAge: 30 * 60 * 1000 },
    );
  });
}

async function fromIp(): Promise<Place | null> {
  try {
    const r = await withTimeout(fetch('https://get.geojs.io/v1/ip/geo.json'), 6000);
    const j = await r.json() as { latitude: string; longitude: string; city?: string; timezone?: string };
    if (!j.timezone || j.timezone !== deviceTimeZone()) return null;   // probably a VPN or proxy exit
    return { lat: Number(j.latitude), lon: Number(j.longitude), name: j.city, approx: true, source: 'ip' };
  } catch { return null; }
}

function fromTimeZone(): Place {
  const c = TZ_CITIES[deviceTimeZone()] ?? TZ_CITIES['Asia/Tokyo'];
  return { lat: c[1], lon: c[2], name: c[0], approx: true, source: 'timezone' };
}

/** A readable name for a position (city or district), in Chinese where available. */
export async function placeName(lat: number, lon: number): Promise<string | undefined> {
  try {
    const r = await withTimeout(fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=zh`), 6000);
    const j = await r.json() as { city?: string; locality?: string; principalSubdivision?: string };
    return (j.city || j.locality || j.principalSubdivision || '').replace(/市$/, '') || undefined;
  } catch { return undefined; }
}

export async function locate(): Promise<Place> {
  const gps = await fromGeolocation();
  if (gps) return { ...gps, name: await placeName(gps.lat, gps.lon) };
  return (await fromIp()) ?? fromTimeZone();
}
