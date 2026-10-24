/* Weather for a game — Open-Meteo (free, no API key).
   Returns the forecast for the hour closest to the game's start. */

export type GameWeather = {
  tempC: number;
  rainChance: number | null;   // %
  code: number;                // WMO weather code
  label: string;
  icon: string;                // Ionicons name
};

// WMO weather codes → label + icon
function describe(code: number, isDay: boolean): { label: string; icon: string } {
  if (code === 0)              return { label: 'Clear',         icon: isDay ? 'sunny-outline' : 'moon-outline' };
  if (code <= 2)               return { label: 'Partly cloudy', icon: isDay ? 'partly-sunny-outline' : 'cloudy-night-outline' };
  if (code === 3)              return { label: 'Cloudy',        icon: 'cloudy-outline' };
  if (code === 45 || code === 48) return { label: 'Fog',        icon: 'cloud-outline' };
  if (code >= 51 && code <= 57) return { label: 'Drizzle',      icon: 'rainy-outline' };
  if (code >= 61 && code <= 67) return { label: 'Rain',         icon: 'rainy-outline' };
  if (code >= 71 && code <= 77) return { label: 'Snow',         icon: 'snow-outline' };
  if (code >= 80 && code <= 82) return { label: 'Showers',      icon: 'rainy-outline' };
  if (code >= 85 && code <= 86) return { label: 'Snow showers', icon: 'snow-outline' };
  if (code >= 95)              return { label: 'Thunderstorm',  icon: 'thunderstorm-outline' };
  return { label: 'Weather', icon: 'cloudy-outline' };
}

const cache = new Map<string, { at: number; data: GameWeather | null }>();
const TTL = 30 * 60_000; // 30 min

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** null when the game is too far ahead (>15 days), in the past, or the request fails. */
export async function getGameWeather(lat: number, lng: number, startsAt: string): Promise<GameWeather | null> {
  const start = new Date(startsAt);
  const days = (start.getTime() - Date.now()) / 86_400_000;
  if (!isFinite(lat) || !isFinite(lng) || days > 15 || days < -1) return null;

  const key = `${lat.toFixed(3)},${lng.toFixed(3)},${startsAt.slice(0, 13)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  try {
    const day = ymd(start);
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&hourly=temperature_2m,precipitation_probability,weather_code,is_day` +
      `&timezone=auto&start_date=${day}&end_date=${day}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const j = await res.json();
    const times: string[] = j.hourly?.time ?? [];
    if (!times.length) throw new Error('no data');

    // Hours come back in the location's local time — match the game's local hour
    const targetHour = start.getHours();
    let idx = times.findIndex((t) => Number(t.slice(11, 13)) === targetHour);
    if (idx < 0) idx = 0;

    const code = j.hourly.weather_code[idx] ?? 0;
    const { label, icon } = describe(code, (j.hourly.is_day?.[idx] ?? 1) === 1);
    const data: GameWeather = {
      tempC: Math.round(j.hourly.temperature_2m[idx]),
      rainChance: j.hourly.precipitation_probability?.[idx] ?? null,
      code, label, icon,
    };
    cache.set(key, { at: Date.now(), data });
    return data;
  } catch {
    cache.set(key, { at: Date.now(), data: null });
    return null;
  }
}
