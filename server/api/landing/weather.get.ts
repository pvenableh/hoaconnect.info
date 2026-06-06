// server/api/landing/weather.get.ts
//
// Live local weather for an org's public landing Weather widget. One platform
// OpenWeatherMap key (server-only env OPENWEATHER_API_KEY) covers all tenants.
// Lat/lon is geocoded from the org's address on first use and cached back onto
// settings.landing.geo so subsequent calls skip geocoding. If the key is unset,
// returns null so the widget hides gracefully.
//
// Cached ~30 min per slug to stay well inside OpenWeather's free tier.
import { readItems, updateItem } from "@directus/sdk";
import { normalizeLandingConfig, type LandingGeo } from "~~/shared/utils/landing";

interface WeatherPayload {
  temp: number;
  feels_like: number;
  humidity: number;
  wind: number;
  condition: string;
  description: string;
  icon: string; // OpenWeather icon code (e.g. "01d")
  city: string;
}

async function geocode(apiKey: string, org: any): Promise<LandingGeo | null> {
  const zip = (org.zip || "").toString().trim();
  try {
    if (zip) {
      const r: any = await $fetch(
        `https://api.openweathermap.org/geo/1.0/zip?zip=${encodeURIComponent(zip)},US&appid=${apiKey}`
      ).catch(() => null);
      if (r && Number.isFinite(r.lat) && Number.isFinite(r.lon)) {
        return { lat: r.lat, lon: r.lon };
      }
    }
    const q = [org.street_address, org.city, org.state].filter(Boolean).join(", ");
    if (q) {
      const r: any = await $fetch(
        `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(q + ", US")}&limit=1&appid=${apiKey}`
      ).catch(() => null);
      if (Array.isArray(r) && r[0] && Number.isFinite(r[0].lat)) {
        return { lat: r[0].lat, lon: r[0].lon };
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

export default defineCachedEventHandler(
  async (event): Promise<WeatherPayload | null> => {
    const { slug } = getQuery(event);
    const config = useRuntimeConfig();
    const apiKey = config.openWeatherApiKey as string | undefined;
    if (!apiKey || !slug) return null;

    const directus = getTypedDirectus();
    const orgs = await directus.request(
      readItems("hoa_organizations", {
        filter: { slug: { _eq: slug as string } },
        fields: [
          "street_address",
          "city",
          "state",
          "zip",
          { settings: ["id", "landing"] },
        ],
        limit: 1,
      })
    );
    const org: any = orgs?.[0];
    if (!org) return null;

    const settings = org.settings && typeof org.settings === "object" ? org.settings : null;
    const cfg = normalizeLandingConfig(settings?.landing);

    let geo = cfg.geo;
    if (!geo) {
      geo = await geocode(apiKey, org);
      // Persist the resolved coordinates so we never geocode this org again.
      if (geo && settings?.id) {
        try {
          await directus.request(
            updateItem("block_settings", settings.id, {
              landing: { ...cfg, geo },
            } as any)
          );
        } catch {
          /* non-fatal */
        }
      }
    }
    if (!geo) return null;

    const w: any = await $fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${geo.lat}&lon=${geo.lon}&appid=${apiKey}&units=imperial`
    ).catch(() => null);
    if (!w || !w.main || !Array.isArray(w.weather) || !w.weather[0]) return null;

    return {
      temp: Math.round(w.main.temp),
      feels_like: Math.round(w.main.feels_like),
      humidity: Math.round(w.main.humidity),
      wind: Math.round(w.wind?.speed ?? 0),
      condition: w.weather[0].main,
      description: w.weather[0].description,
      icon: w.weather[0].icon,
      city: w.name || org.city || "",
    };
  },
  {
    maxAge: 60 * 30,
    name: "landing-weather",
    getKey: (event) => String(getQuery(event).slug || "none"),
  }
);
