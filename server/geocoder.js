const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CACHE_FILE = path.join(DATA_DIR, 'geocode_cache.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

class GeocodingEngine {
  constructor() {
    this.cache = new Map();
    this.loadCache();
  }

  loadCache() {
    try {
      if (fs.existsSync(CACHE_FILE)) {
        const raw = fs.readFileSync(CACHE_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        Object.entries(parsed).forEach(([key, val]) => {
          this.cache.set(key, val);
        });
        console.log(`[Geocoder] Loaded ${this.cache.size} cached building coordinates.`);
      }
    } catch (err) {
      console.warn('[Geocoder] Failed to load geocode cache:', err.message);
      this.cache = new Map();
    }
  }

  saveCache() {
    try {
      const obj = {};
      this.cache.forEach((val, key) => {
        obj[key] = val;
      });
      fs.writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2), 'utf8');
    } catch (err) {
      console.warn('[Geocoder] Failed to save geocode cache:', err.message);
    }
  }

  normalizeKey(address, city) {
    const a = (address || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    const c = (city || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    return `${c}-${a}`;
  }

  getCachedCoordinates(address, city) {
    const key = this.normalizeKey(address, city);
    return this.cache.get(key) || null;
  }

  _isValidCoordinates(lat, lng, state = 'FL') {
    if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
      return false;
    }
    const cleanState = (state || 'FL').trim().toUpperCase();
    if (cleanState === 'FL' || cleanState === 'FLORIDA') {
      // Precise Florida bounding box
      return lat >= 24.3 && lat <= 31.2 && lng >= -87.8 && lng <= -79.8;
    }
    // Continental United States bounding box for expansion into other counties / states
    return lat >= 24.0 && lat <= 50.0 && lng >= -125.0 && lng <= -66.0;
  }

  async geocodeAddress(address, city, state = 'FL') {
    const key = this.normalizeKey(address, city);
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    // Clean address for search query
    let cleanAddress = (address || '').trim();

    // Strategy A: If pure PO Box with no street address, skip geocoding
    if (/^(?:Universal|West Detention|Law Office)?[^0-9]*P\.?O\.?\s*Box\s*\d+/i.test(cleanAddress)) {
      return null;
    }

    // Strip PO Box when preceded by street number (e.g. "300 S Orange Ave PO Box 1873" -> "300 S Orange Ave")
    if (/\b\d{1,6}\s+[^,]+/i.test(cleanAddress)) {
      cleanAddress = cleanAddress.replace(/\s*(?:P\.?O\.?\s*Box|\bPO\s*Box)\s*[\w\d-]+/i, '');
    }

    // Strip building name prefix before street number (e.g. "Tower Place, 1900 Summit..." -> "1900 Summit...")
    cleanAddress = cleanAddress.replace(/^[^0-9]+,\s*(?=[0-9]+\s+)/i, '');

    // Strip tenant/bank suffixes (e.g. "515 E Las Olas Blvd Suntrust Bank" -> "515 E Las Olas Blvd")
    cleanAddress = cleanAddress.replace(/(?:Blvd|Ave|St|Rd|Dr|Way|Hwy|Ln|Ct)\s+(?:Suntrust\s+Bank|Suntrust|Bank|Inc|LLC|Ph\s*\d+|Apt\s*\d+|Suite\s*[\w\d]+|\.\.\s*\d+)/i, m => {
      return m.split(/\s+(?:Suntrust|Bank|Inc|LLC|Ph|Apt|Suite|\.\.)/i)[0];
    });

    // Strip suite, floor, apt, room artifacts
    cleanAddress = cleanAddress.replace(/,?\s*(?:suite|ste|floor|fl|unit|room|rm|#|penthouse|apt|ph)\s*[a-z0-9-]+/gi, '');
    cleanAddress = cleanAddress.replace(/\.\.\s*\d+/g, '');
    cleanAddress = cleanAddress.replace(/,\s*[A-Z]{2}$/i, '');
    cleanAddress = cleanAddress.replace(/\s+/g, ' ').trim();

    // Multi-state detection
    let targetState = (state || 'FL').trim();
    if (/Athens/i.test(city) || /Kingsland/i.test(city) || /GA\s+Hwy/i.test(cleanAddress)) {
      targetState = 'GA';
    }

    // Clean city (strip accidental zip codes or states)
    let cleanCity = (city || '').replace(/,\s*[A-Z]{2}\b/gi, '').replace(/\b\d{5}\b/g, '').trim();

    // Check for embedded sub-city (e.g. "Plantation" in "6755 W Broward Blvd, Plantation, Fort Lauderdale")
    const embeddedCityMatch = cleanAddress.match(/,\s*([A-Za-z\s]+)$/i);
    let embeddedCity = null;
    if (embeddedCityMatch && !/Blvd|Ave|St|Rd|Dr|Way|Hwy|Ln|Ct/i.test(embeddedCityMatch[1])) {
      embeddedCity = embeddedCityMatch[1].trim();
      cleanAddress = cleanAddress.replace(/,\s*[A-Za-z\s]+$/i, '').trim();
    }

    const queries = [];
    if (embeddedCity) {
      queries.push(`${cleanAddress}, ${embeddedCity}, ${targetState} USA`.replace(/,\s*,/g, ','));
    }
    if (cleanAddress && cleanCity) {
      queries.push(`${cleanAddress}, ${cleanCity}, ${targetState} USA`.replace(/,\s*,/g, ','));
    }

    // Extract starting from street number
    const streetMatch = cleanAddress.match(/\b(\d{1,6}\s+[A-Za-z0-9\s\.]+)/);
    if (streetMatch && streetMatch[1].trim() !== cleanAddress) {
      const streetPart = streetMatch[1].trim();
      if (embeddedCity) queries.push(`${streetPart}, ${embeddedCity}, ${targetState} USA`.replace(/,\s*,/g, ','));
      queries.push(`${streetPart}, ${cleanCity}, ${targetState} USA`.replace(/,\s*,/g, ','));
    }

    // Just address and state
    if (cleanAddress) {
      queries.push(`${cleanAddress}, ${targetState} USA`.replace(/,\s*,/g, ','));
    }

    let coords = null;
    for (const q of queries) {
      // 1. Try Photon first (fast, OSM data)
      coords = await this._queryPhoton(q, state);
      if (coords) break;

      // 2. Fallback to Nominatim
      coords = await this._queryNominatim(q, state);
      if (coords) break;
    }

    if (coords) {
      const record = {
        lat: Number(coords.lat.toFixed(6)),
        lng: Number(coords.lng.toFixed(6)),
        is_precise: true,
        source: coords.source,
        geocoded_at: new Date().toISOString()
      };
      this.cache.set(key, record);
      return record;
    }

    return null;
  }

  async _queryPhoton(query, state = 'FL') {
    try {
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'LitPulseOS/1.0 (delivery-routing)' }
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].geometry.coordinates;
        if (this._isValidCoordinates(lat, lng, state)) {
          return { lat, lng, source: 'photon' };
        }
      }
    } catch (e) {
      // Fallback
    }
    return null;
  }

  async _queryNominatim(query, state = 'FL') {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'LitPulseOS/1.0 (delivery-routing)' }
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        if (this._isValidCoordinates(lat, lng, state)) {
          return { lat, lng, source: 'nominatim' };
        }
      }
    } catch (e) {
      // Ignore
    }
    return null;
  }

  async batchGeocodeBuildings(buildings, limit = 100, onProgress = null) {
    if (!Array.isArray(buildings) || !buildings.length) {
      return { geocoded: 0, cached: 0, failed: 0, total: 0 };
    }

    let newlyGeocoded = 0;
    let cachedCount = 0;
    let failedCount = 0;

    const targets = limit === 'all' || limit >= buildings.length ? buildings : buildings.slice(0, limit);

    for (let i = 0; i < targets.length; i++) {
      const b = targets[i];
      const key = this.normalizeKey(b.address, b.city);

      if (this.cache.has(key)) {
        const cached = this.cache.get(key);
        b.lat = cached.lat;
        b.lng = cached.lng;
        b.is_precise = true;
        b.geocoded = true;
        cachedCount++;
      } else {
        const targetState = b.state || 'FL';
        const res = await this.geocodeAddress(b.address, b.city, targetState);
        if (res) {
          b.lat = res.lat;
          b.lng = res.lng;
          b.is_precise = true;
          b.geocoded = true;
          newlyGeocoded++;
        } else {
          failedCount++;
        }
        await new Promise(r => setTimeout(r, 120));
      }

      if ((i + 1) % 5 === 0) {
        this.saveCache();
      }

      if (onProgress && (i + 1) % 10 === 0) {
        onProgress(i + 1, targets.length, newlyGeocoded, cachedCount);
      }
    }

    this.saveCache();

    return {
      geocoded: newlyGeocoded,
      cached: cachedCount,
      failed: failedCount,
      total: targets.length
    };
  }
}

module.exports = new GeocodingEngine();
