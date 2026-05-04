/**
 * City → coordinates lookup via OpenStreetMap Nominatim. Free, no API key,
 * but rate-limited to ~1 req/s and asks for a User-Agent that identifies
 * the calling app. Used to resolve `home_city` to `home_latitude`/`home_longitude`
 * during employee registration.
 *
 * If the call fails or returns nothing, the caller should fall back to
 * the lat/lng the client already supplied (geolocator on the device).
 */

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'FindlyServer/0.1 (contact: tech@findly.app)';

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  display_name: string;
}

export async function geocodeIsraeliCity(city: string): Promise<GeocodeResult | null> {
  const trimmed = city.trim();
  if (!trimmed) return null;

  const url = new URL(NOMINATIM_BASE);
  url.searchParams.set('q', trimmed);
  url.searchParams.set('countrycodes', 'il');
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('accept-language', 'he');

  try {
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const arr = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    const hit = arr[0];
    if (!hit) return null;
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { latitude: lat, longitude: lng, display_name: hit.display_name };
  } catch {
    return null;
  }
}
