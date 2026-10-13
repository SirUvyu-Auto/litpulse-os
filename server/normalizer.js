// Normalization & Entity Resolution Engine for LitPulse OS

// 1. Generic personal email domains to bypass from firm-domain grouping
const GENERIC_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
  'icloud.com', 'comcast.net', 'bellsouth.net', 'msn.com', 'live.com',
  'att.net', 'sbcglobal.net', 'verizon.net', 'mail.com', 'protonmail.com',
  'proton.me', 'zoho.com', 'ymail.com', 'me.com'
]);

// 2. Verified Florida Legal Venue ZIP Code Ranges
function getCityFromZip(zipStr) {
  if (!zipStr) return null;
  const num = parseInt(zipStr, 10);
  if (isNaN(num)) return null;

  // Specific high-frequency legal hubs
  if (num === 33134 || num === 33146) return 'Coral Gables';
  if (num >= 33139 && num <= 33141) return 'Miami Beach';
  if (num === 33178) return 'Doral';
  if (num === 33180) return 'Aventura';
  if (num >= 33101 && num <= 33299) return 'Miami';

  if (num >= 33301 && num <= 33334) return 'Fort Lauderdale';
  if (num === 33388 || num === 33394) return 'Fort Lauderdale';
  if (num === 33324 || num === 33325) return 'Plantation';
  if (num >= 33326 && num <= 33331) return 'Weston';
  if (num >= 33020 && num <= 33029) return 'Hollywood';
  if (num >= 33010 && num <= 33018) return 'Hialeah';

  if (num >= 33431 && num <= 33434) return 'Boca Raton';
  if (num === 33481 || num === 33486 || num === 33487) return 'Boca Raton';
  if (num === 33410 || num === 33418) return 'Palm Beach Gardens';
  if (num === 33480) return 'Palm Beach';
  if (num >= 33444 && num <= 33484) return 'Delray Beach';
  if (num >= 33401 && num <= 33422) return 'West Palm Beach';

  if (num >= 33601 && num <= 33637) return 'Tampa';
  if (num >= 33701 && num <= 33716) return 'St. Petersburg';
  if (num >= 33755 && num <= 33765) return 'Clearwater';

  if (num >= 32801 && num <= 32839) return 'Orlando';
  if (num >= 32099 && num <= 32277) return 'Jacksonville';
  if (num >= 32301 && num <= 32317) return 'Tallahassee';
  if (num >= 33901 && num <= 33919) return 'Fort Myers';
  if (num >= 34101 && num <= 34120) return 'Naples';
  if (num >= 34230 && num <= 34243) return 'Sarasota';

  return null;
}

// 3. Known Florida Legal Venue Canonical Cities List
const CANONICAL_CITIES = [
  'Miami', 'Fort Lauderdale', 'West Palm Beach', 'Coral Gables',
  'Boca Raton', 'Miami Beach', 'Tampa', 'Orlando', 'Jacksonville',
  'Tallahassee', 'Fort Myers', 'Naples', 'Sarasota', 'St. Petersburg',
  'Hollywood', 'Palm Beach Gardens', 'Delray Beach', 'Doral',
  'Aventura', 'Plantation', 'Hialeah', 'Weston', 'Clearwater',
  'Altamonte Springs', 'Apopka', 'Atlantic Beach', 'Bartow', 'Belle Glade',
  'Bonita Springs', 'Boynton Beach', 'Bradenton', 'Brandon', 'Brooksville',
  'Cape Coral', 'Casselberry', 'Celebration', 'Clermont', 'Cocoa', 'Cocoa Beach',
  'Coconut Creek', 'Coconut Grove', 'Coral Springs', 'Cutler Bay', 'Dade City',
  'Dania Beach', 'Davie', 'Daytona Beach', 'Deerfield Beach', 'DeLand',
  'Dunedin', 'Estero', 'Fernandina Beach', 'Fort Pierce', 'Gainesville',
  'Greenacres', 'Hallandale Beach', 'Homestead', 'Inverness', 'Jacksonville Beach',
  'Jupiter', 'Key Biscayne', 'Key West', 'Kissimmee', 'Lake Mary', 'Lake Worth',
  'Lakeland', 'Largo', 'Lauderdale Lakes', 'Lauderhill', 'Leesburg',
  'Lighthouse Point', 'Longwood', 'Maitland', 'Margate', 'Melbourne',
  'Miami Gardens', 'Miami Lakes', 'Miramar', 'Mount Dora', 'New Smyrna Beach',
  'North Miami', 'North Miami Beach', 'North Palm Beach', 'Oakland Park', 'Ocala',
  'Ocoee', 'Oldsmar', 'Orange Park', 'Ormond Beach', 'Oviedo', 'Palatka',
  'Palm Bay', 'Palm Beach', 'Palm Coast', 'Palm Harbor', 'Palmetto',
  'Panama City', 'Parkland', 'Pembroke Pines', 'Pensacola', 'Pinecrest',
  'Pinellas Park', 'Plant City', 'Pompano Beach', 'Ponte Vedra',
  'Ponte Vedra Beach', 'Port Charlotte', 'Port Orange', 'Port St. Lucie',
  'Punta Gorda', 'Rockledge', 'Royal Palm Beach', 'Sanford', 'Satellite Beach',
  'Sebastian', 'Sebring', 'South Miami', 'Spring Hill', 'St. Augustine',
  'St. Cloud', 'Stuart', 'Sunny Isles Beach', 'Sunrise', 'Surfside',
  'Tamarac', 'Tarpon Springs', 'Tavares', 'Titusville', 'Venice',
  'Vero Beach', 'Wellington', 'Wesley Chapel', 'West Melbourne',
  'Winter Garden', 'Winter Haven', 'Winter Park', 'Winter Springs'
];

// 50 US States + DC
const VALID_US_STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL',
  'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME',
  'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH',
  'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI',
  'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
]);

// Non-city prefixes that indicate a building, unit, or suite
const NON_CITY_WORDS = /^(suite|ste|unit|apt|apartment|room|rm|floor|fl|ph|penthouse|building|bldg|tower|plaza|center|blvd|boulevard|ave|avenue|st|street|rd|road|dr|drive|hwy|highway|way|court|ct|po box|p\.o\.)\b/i;

// 4. Common Typo & Abbreviation Alias Dictionary
const CITY_ALIASES = {
  'maimi': 'Miami',
  'mami': 'Miami',
  'mia': 'Miami',
  'city of miami': 'Miami',
  'greater miami': 'Miami',
  'ft lauderdale': 'Fort Lauderdale',
  'ft. lauderdale': 'Fort Lauderdale',
  'ftlauderdale': 'Fort Lauderdale',
  'fort laud': 'Fort Lauderdale',
  'ft laud': 'Fort Lauderdale',
  'ftl': 'Fort Lauderdale',
  'wpb': 'West Palm Beach',
  'west palm': 'West Palm Beach',
  'w. palm beach': 'West Palm Beach',
  'w palm beach': 'West Palm Beach',
  'w palm bch': 'West Palm Beach',
  'west palm bch': 'West Palm Beach',
  'boca': 'Boca Raton',
  'boca ratone': 'Boca Raton',
  'gables': 'Coral Gables',
  'coral gable': 'Coral Gables',
  'miami bch': 'Miami Beach',
  'mia beach': 'Miami Beach',
  'south beach': 'Miami Beach',
  'st petersburg': 'St. Petersburg',
  'st. petersburg': 'St. Petersburg',
  'st pete': 'St. Petersburg',
  'st. pete': 'St. Petersburg',
  'saint petersburg': 'St. Petersburg',
  'ft myers': 'Fort Myers',
  'ft. myers': 'Fort Myers',
  'fort meyers': 'Fort Myers',
  'pb gardens': 'Palm Beach Gardens',
  'pbg': 'Palm Beach Gardens',
  'palm beach gdn': 'Palm Beach Gardens',
  'palm beach gdns': 'Palm Beach Gardens',
  'orl': 'Orlando',
  'tpa': 'Tampa',
  'jax': 'Jacksonville',
  'dania': 'Dania Beach',
  'boynton': 'Boynton Beach',
  'deland': 'DeLand',
  'hallandale': 'Hallandale Beach',
  'sunny isles': 'Sunny Isles Beach',
  'lauderdale by the sea': 'Fort Lauderdale',
  'ponte vedra': 'Ponte Vedra Beach',
  'saint augustine': 'St. Augustine',
  'st augustine': 'St. Augustine',
  'st. augustine': 'St. Augustine'
};

// Levenshtein distance calculation for typo tolerance
function levenshteinDistance(s1, s2) {
  const a = s1.toLowerCase();
  const b = s2.toLowerCase();
  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// Normalize city using ZIP anchor, alias dictionary, courtroom division mapping, and fuzzy distance
function normalizeCity(rawCity, rawAddress, fallbackDivision, courtStr, docketStr) {
  // Step 1: Check for 5-digit ZIP code in address or city string
  const fullText = `${rawAddress || ''} ${rawCity || ''}`;
  const zipMatch = fullText.match(/\b(\d{5})\b/);
  if (zipMatch) {
    const cityFromZip = getCityFromZip(zipMatch[1]);
    if (cityFromZip) return cityFromZip;
  }

  // Step 2: Check if address has an explicit major Florida city name
  const addrLower = (rawAddress || '').toLowerCase();
  for (const canon of CANONICAL_CITIES) {
    const canonLower = canon.toLowerCase();
    const regex = new RegExp(`\\b${canonLower}\\b`, 'i');
    if (regex.test(addrLower)) {
      return canon;
    }
  }

  // Step 3: Check if input string is an internal court division code (Cv-a, Div 33, Section 7, etc.)
  let clean = (rawCity || '').trim().replace(/,?\s+(FL|FLORIDA)$/i, '').trim();
  const isDivisionCode = !clean || /^(cv-[a-z0-9]|div\s*\d+|division\s*[a-z0-9]+|section\s*\d+|central\s+courthouse|open|unknown|[a-z]{1,2}:\s*circuit|fm-|pr-|cr-|fc-|fx:|fz:|s:\s*felony|fa:|fi:|fh:)/i.test(clean);

  if (isDivisionCode) {
    // Resolve from Court, Jurisdiction, Division, or Docket
    const combined = `${courtStr || ''} ${fallbackDivision || ''} ${docketStr || ''} ${clean}`.toLowerCase();
    if (combined.includes('duval') || combined.includes('fourth circuit') || combined.includes(' 4th') || clean.toLowerCase().startsWith('cv-')) return 'Jacksonville';
    if (combined.includes('orange') || combined.includes('osceola') || combined.includes('ninth circuit') || combined.includes(' 9th') || (docketStr && docketStr.endsWith('-O')) || clean.toLowerCase().startsWith('div ')) return 'Orlando';
    if (combined.includes('hillsborough') || combined.includes('thirteenth circuit') || combined.includes('13th') || combined.includes('tampa')) return 'Tampa';
    if (combined.includes('broward') || combined.includes('seventeenth') || combined.includes('17th') || combined.includes('lauderdale') || combined.includes('central courthouse')) return 'Fort Lauderdale';
    if (combined.includes('palm beach') || combined.includes('fifteenth') || combined.includes('15th') || combined.includes('north county') || combined.includes('circuit civil central')) return 'West Palm Beach';
    if (combined.includes('miami') || combined.includes('eleventh') || combined.includes('11th') || combined.includes('sdfl')) return 'Miami';
    if (combined.includes('pinellas') || combined.includes('sixth circuit') || combined.includes(' 6th')) return 'St. Petersburg';
    if (combined.includes('leon') || combined.includes('second circuit') || combined.includes(' 2nd')) return 'Tallahassee';
    if (combined.includes('lee') || combined.includes('twentieth') || combined.includes('20th')) return 'Fort Myers';
    if (combined.includes('collier')) return 'Naples';
    if (combined.includes('bay') || combined.includes('fourteenth') || combined.includes('14th')) return 'Panama City';
    if (combined.includes('escambia') || combined.includes('first circuit') || combined.includes(' 1st')) return 'Pensacola';
    if (combined.includes('alachua') || combined.includes('eighth') || combined.includes(' 8th')) return 'Gainesville';
    if (combined.includes('marion') || combined.includes('fifth') || combined.includes(' 5th')) return 'Ocala';
    if (fallbackDivision && CANONICAL_CITIES.includes(fallbackDivision)) return fallbackDivision;
    if (fallbackDivision && CITY_ALIASES[fallbackDivision.toLowerCase()]) return CITY_ALIASES[fallbackDivision.toLowerCase()];
    return 'Miami';
  }

  const cleanLower = clean.toLowerCase();

  // Step 4: Check Alias Dictionary
  if (CITY_ALIASES[cleanLower]) {
    return CITY_ALIASES[cleanLower];
  }

  // Step 5: Check Exact Canonical Match (case-insensitive)
  const exactMatch = CANONICAL_CITIES.find(c => c.toLowerCase() === cleanLower);
  if (exactMatch) return exactMatch;

  // Step 6: Fuzzy Levenshtein Match against Canonical Cities
  let bestMatch = null;
  let minDistance = 999;

  for (const canon of CANONICAL_CITIES) {
    const dist = levenshteinDistance(cleanLower, canon.toLowerCase());
    const threshold = canon.length <= 5 ? 1 : 2;
    if (dist <= threshold && dist < minDistance) {
      minDistance = dist;
      bestMatch = canon;
    }
  }

  if (bestMatch) {
    return bestMatch;
  }

  // Fallback: Clean title case
  return clean.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

// Extract the firm's physical city and state from office address
function extractFirmCity(address, fallbackCity) {
  if (!address || typeof address !== 'string') return fallbackCity ? normalizeCity(fallbackCity) : 'Miami';
  let clean = address.trim()
    .replace(/,?\s*(email|e-mail):\s*\S+/gi, '')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '')
    .replace(/,?\s*(phone|tel|direct|fax):\s*[\d\s\(\)\.-]+/gi, '')
    .trim();

  // Pattern 1: Match from tail: , City, ST 12345 or , City, ST
  const tailRegex = /,\s*([^,]+?),\s*([A-Za-z]{2})(?:\s*[-–]\s*\d{4})?(?:\s+(\d{5})(?:-\d{4})?)?\s*$/;
  const match = clean.match(tailRegex);
  if (match) {
    let rawCity = match[1].trim();
    const st = match[2].trim().toUpperCase();

    // Verify valid 2-letter US state code and reject non-city tokens (suite, bldg, penthouse, etc.)
    if (VALID_US_STATES.has(st) && !NON_CITY_WORDS.test(rawCity)) {
      // Strip any lingering suite/unit prefix in the city token
      rawCity = rawCity.replace(/^(suite|ste|unit|apt|room|rm|floor|fl|bldg|building|tower|plaza|ph|penthouse)\s*[a-z0-9#-]*\s+/i, '').trim();

      if (st === 'FL' || st === 'FLORIDA') {
        const normalized = normalizeCity(rawCity, address);
        if (normalized) return normalized;
        return rawCity.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      } else {
        const cityTitle = rawCity.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        return `${cityTitle}, ${st}`;
      }
    }
  }

  // Pattern 2: Check 5-digit zip code in address
  const zipMatch = clean.match(/\b(3[234]\d{3})\b/);
  if (zipMatch) {
    const zCity = getCityFromZip(zipMatch[1]);
    if (zCity) return zCity;
  }

  // Pattern 3: Look for canonical Florida cities in the address string
  for (const c of CANONICAL_CITIES) {
    if (new RegExp(`\\b${c}\\b`, 'i').test(clean)) {
      return c;
    }
  }

  return fallbackCity ? normalizeCity(fallbackCity) : 'Miami';
}

// 5. Standardize Street Addresses
function standardizeAddress(rawAddress, fallbackCity) {
  if (!rawAddress || typeof rawAddress !== 'string') return fallbackCity ? `${fallbackCity}, FL` : '';
  let addr = rawAddress.trim().replace(/\s+/g, ' ');

  // If address is an internal court division code, return fallback city
  if (/^(cv-[a-z0-9]|div\s*\d+|section\s*\d+|[a-z]{1,2}:\s*circuit|central\s+courthouse|open|fm-|pr-|cr-|fc-|fx:|fz:|fa:|fh:|fi:)/i.test(addr)) {
    return fallbackCity ? `${fallbackCity}, FL` : '';
  }

  // Strip embedded email or phone numbers
  addr = addr.replace(/,?\s*(email|e-mail):\s*\S+/gi, '');
  addr = addr.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '');
  addr = addr.replace(/,?\s*(phone|tel|direct|fax):\s*[\d\s\(\)\.-]+/gi, '');

  // Normalize leading "One " to "1 "
  addr = addr.replace(/^one\s+/i, '1 ');

  // Standardize suite / floor designators
  addr = addr.replace(/\b(ste|ste\.|suite|unit|#)\s*([a-z0-9-]+)\b/gi, 'Suite $2');
  addr = addr.replace(/\b(floor|fl\.)\s*(\d{1,2})\b/gi, 'Floor $2');
  addr = addr.replace(/\bfl\s+(\d{1,2})\b/gi, 'Floor $1');
  // Strip dangling unnumbered unit keywords
  addr = addr.replace(/,?\s*\b(suite|ste|floor|fl|unit|room|rm)\b(?!\s+[a-z0-9#-]+)/gi, '');

  // Standardize road types
  addr = addr.replace(/\b(boulevard|blvd\.?)\b/gi, 'Blvd');
  addr = addr.replace(/\b(avenue|ave\.?)\b/gi, 'Ave');
  addr = addr.replace(/\b(street|st\.?)\b/gi, 'St');
  addr = addr.replace(/\b(road|rd\.?)\b/gi, 'Rd');
  addr = addr.replace(/\b(drive|dr\.?)\b/gi, 'Dr');
  addr = addr.replace(/\b(court|ct\.?)\b/gi, 'Ct');
  addr = addr.replace(/\b(parkway|pkwy\.?)\b/gi, 'Pkwy');
  addr = addr.replace(/\b(highway|hwy\.?)\b/gi, 'Hwy');
  addr = addr.replace(/\b(building|bldg\.?)\b/gi, 'Building');

  // Standardize spelled-out ordinals for numbered streets (e.g. Second St -> 2nd St)
  addr = addr.replace(/\bfirst\b/gi, '1st');
  addr = addr.replace(/\bsecond\b/gi, '2nd');
  addr = addr.replace(/\bthird\b/gi, '3rd');
  addr = addr.replace(/\bfourth\b/gi, '4th');
  addr = addr.replace(/\bfifth\b/gi, '5th');
  addr = addr.replace(/\bsixth\b/gi, '6th');
  addr = addr.replace(/\bseventh\b/gi, '7th');
  addr = addr.replace(/\beighth\b/gi, '8th');
  addr = addr.replace(/\bninth\b/gi, '9th');
  addr = addr.replace(/\btenth\b/gi, '10th');
  addr = addr.replace(/\beleventh\b/gi, '11th');
  addr = addr.replace(/\btwelfth\b/gi, '12th');

  // Standardize compass directions (both spelled-out and punctuated)
  addr = addr.replace(/\b(southeast|s\.e\.)\b/gi, 'SE');
  addr = addr.replace(/\b(southwest|s\.w\.)\b/gi, 'SW');
  addr = addr.replace(/\b(northeast|n\.e\.)\b/gi, 'NE');
  addr = addr.replace(/\b(northwest|n\.w\.)\b/gi, 'NW');
  addr = addr.replace(/(^|\s)S\.E\.(\s|$)/gi, '$1SE$2');
  addr = addr.replace(/(^|\s)S\.W\.(\s|$)/gi, '$1SW$2');
  addr = addr.replace(/(^|\s)N\.E\.(\s|$)/gi, '$1NE$2');
  addr = addr.replace(/(^|\s)N\.W\.(\s|$)/gi, '$1NW$2');

  return addr.replace(/\s+/g, ' ').replace(/,\s*$/, '').trim();
}

// 6. Corporate Email Domain Registry for Major Litigation Law Firms
const LAW_FIRM_DOMAIN_REGISTRY = {
  'gtlaw.com': 'Greenberg Traurig',
  'hklaw.com': 'Holland & Knight',
  'forthepeople.com': 'Morgan & Morgan',
  'carltonfields.com': 'Carlton Fields',
  'podhurst.com': 'Podhurst Orseck',
  'hickeylawfirm.com': 'Hickey Law Firm',
  'colson.com': 'Colson Hicks Eidson',
  'shumaker.com': 'Shumaker, Loop & Kendrick',
  'foley.com': 'Foley & Lardner',
  'csklegal.com': 'Cole, Scott & Kissane',
  'stearnsweaver.com': 'Stearns Weaver Miller',
  'bilzin.com': 'Bilzin Sumberg',
  'gunster.com': 'Gunster',
  'shutts.com': 'Shutts & Bowen',
  'gray-robinson.com': 'GrayRobinson',
  'grayrobinson.com': 'GrayRobinson',
  'akerman.com': 'Akerman',
  'bergersingerman.com': 'Berger Singerman',
  'bsfllp.com': 'Boies Schiller Flexner',
  'boies-schiller.com': 'Boies Schiller Flexner',
  'kobrekim.com': 'Kobre & Kim',
  'quinnemanuel.com': 'Quinn Emanuel Urquhart & Sullivan',
  'jonesday.com': 'Jones Day',
  'sidley.com': 'Sidley Austin',
  'mwe.com': 'McDermott Will & Emery',
  'kirkland.com': 'Kirkland & Ellis',
  'reedsmith.com': 'Reed Smith',
  'whitecase.com': 'White & Case',
  'klgates.com': 'K&L Gates',
  'bakerdonelson.com': 'Baker Donelson',
  'saul.com': 'Saul Ewing',
  'wickersmith.com': 'Wicker Smith',
  'kubickidraper.com': 'Kubicki Draper',
  'searcylaw.com': 'Searcy Denney Scarola Barnhart & Shipley',
  'clarkfountain.com': 'Clark, Fountain, La Vista, Littky-Rubin & Whitman',
  'rubensteinlaw.com': 'Rubenstein Law'
};

const FIRM_NAME_TO_DOMAIN_MAP = {
  'greenberg traurig': 'gtlaw.com',
  'holland & knight': 'hklaw.com',
  'morgan & morgan': 'forthepeople.com',
  'carlton fields': 'carltonfields.com',
  'podhurst orseck': 'podhurst.com',
  'hickey law firm': 'hickeylawfirm.com',
  'colson hicks eidson': 'colson.com',
  'shumaker, loop & kendrick': 'shumaker.com',
  'shumaker': 'shumaker.com',
  'foley & lardner': 'foley.com',
  'cole, scott & kissane': 'csklegal.com',
  'stearns weaver miller': 'stearnsweaver.com',
  'bilzin sumberg': 'bilzin.com',
  'gunster': 'gunster.com',
  'shutts & bowen': 'shutts.com',
  'grayrobinson': 'gray-robinson.com',
  'akerman': 'akerman.com',
  'berger singerman': 'bergersingerman.com',
  'boies schiller flexner': 'bsfllp.com',
  'kobre & kim': 'kobrekim.com',
  'quinn emanuel urquhart & sullivan': 'quinnemanuel.com',
  'jones day': 'jonesday.com',
  'sidley austin': 'sidley.com',
  'mcdermott will & emery': 'mwe.com',
  'kirkland & ellis': 'kirkland.com',
  'reed smith': 'reedsmith.com',
  'white & case': 'whitecase.com',
  'k&l gates': 'klgates.com',
  'baker donelson': 'bakerdonelson.com',
  'saul ewing': 'saul.com',
  'wicker smith': 'wickersmith.com',
  'kubicki draper': 'kubickidraper.com',
  'searcy denney scarola barnhart & shipley': 'searcylaw.com',
  'clark, fountain, la vista, littky-rubin & whitman': 'clarkfountain.com',
  'rubenstein law': 'rubensteinlaw.com'
};

const KNOWN_FIRM_PHONES = {
  'hickey law firm': '(305) 371-8000',
  'friedland vining': '(305) 777-1720',
  'cohen milstein sellers & toll': '(561) 515-1400',
  'the parks law firm': '(305) 445-4430',
  'shumaker, loop & kendrick': '(813) 229-7600',
  'shumaker': '(813) 229-7600',
  'holland & knight': '(407) 425-8500',
  'colson hicks eidson': '(305) 476-7400',
  'rabin kammerer johnson': '(561) 659-7878',
  'greenberg traurig': '(305) 579-0500',
  'morgan & morgan': '(404) 965-1600',
  'carlton fields': '(305) 530-0050',
  'akerman': '(305) 374-5600',
  'boies schiller flexner': '(305) 539-8400',
  'cole, scott & kissane': '(305) 350-5300',
  'wicker smith': '(305) 448-3939',
  'shutts & bowen': '(305) 358-6300',
  'gunster': '(561) 655-1980',
  'bilzin sumberg': '(305) 374-7580',
  'stearns weaver miller': '(305) 789-3200',
  'podhurst orseck': '(305) 358-2800'
};

function buildAttorneyEmail(attorneyName, firmName) {
  if (!attorneyName || /^(awaiting|unknown|pro se|plaintiff|defense|counsel|lead)/i.test(attorneyName.trim())) {
    return 'N/A';
  }

  const cleanAtty = attorneyName.replace(/\s*,?\s*esq\.?$/i, '').trim();
  const parts = cleanAtty.split(/\s+/).filter(p => p.length > 1 && !/^[a-z]\.$/i.test(p));

  if (!parts.length) return 'N/A';

  let first = parts[0] ? parts[0].toLowerCase().replace(/[^a-z]/g, '') : '';
  let last = parts.length > 1 ? parts[parts.length - 1].toLowerCase().replace(/[^a-z]/g, '') : '';

  if (!first && !last) return 'N/A';
  if (!last) {
    last = first;
    first = '';
  }

  const cleanFirm = (firmName || '').toLowerCase().trim();
  let domain = '';

  if (cleanFirm && FIRM_NAME_TO_DOMAIN_MAP[cleanFirm]) {
    domain = FIRM_NAME_TO_DOMAIN_MAP[cleanFirm];
  } else if (cleanFirm) {
    for (const [fName, fDom] of Object.entries(FIRM_NAME_TO_DOMAIN_MAP)) {
      if (cleanFirm.includes(fName) || fName.includes(cleanFirm)) {
        domain = fDom;
        break;
      }
    }
  }

  if (!domain && cleanFirm && !/^(awaiting|unknown|plaintiff|defense|n\/a|none)/i.test(cleanFirm)) {
    const words = cleanFirm.replace(/law office of|the|law|firm|group|offices|associates|partners|llp|pllc|pa|pc|chtd|chartered/gi, '').trim().split(/\s+/).filter(Boolean);
    const slug = words.join('').replace(/[^a-z0-9]/g, '');
    if (slug.length >= 3) {
      domain = `${slug}law.com`;
    }
  }

  if (!domain || domain === 'lawfirm.com') {
    return 'N/A';
  }

  const firstInitial = first ? first.charAt(0) : '';
  return `${firstInitial}${last}@${domain}`;
}

function buildAttorneyPhone(firmName, city) {
  const cleanFirm = (firmName || '').toLowerCase().trim();
  if (cleanFirm) {
    for (const [fName, fPhone] of Object.entries(KNOWN_FIRM_PHONES)) {
      if (cleanFirm.includes(fName) || fName.includes(cleanFirm)) {
        return fPhone;
      }
    }
  }

  return 'N/A';
}


// 7. Firm Name Standardization (FNS) Normalizer
function normalizeFirmName(rawName, email, attorneyName) {
  // Step 1: Check corporate domain if email provided
  if (email && typeof email === 'string' && email.includes('@')) {
    const domain = email.split('@')[1].toLowerCase().trim();
    if (!GENERIC_EMAIL_DOMAINS.has(domain) && LAW_FIRM_DOMAIN_REGISTRY[domain]) {
      return LAW_FIRM_DOMAIN_REGISTRY[domain];
    }
  }

  let clean = (rawName || '').trim().replace(/\s+/g, ' ');

  // Standardize conjunctions & HTML entities
  clean = clean.replace(/&amp;/gi, '&');
  clean = clean.replace(/\band\b/gi, '&');

  // Strip leading noise words
  clean = clean.replace(/^(the\s+)?(law\s+offices?\s+of|law\s+practice\s+of|offices?\s+of|law\s+group\s+of)\s+/gi, '');

  // Strip trailing corporate legal suffixes repeatedly
  const suffixPattern = /,?\s+(P\.?A\.?|LLP|PLLC|P\.?C\.?|LLC|Inc\.?|Chartered|Chtd\.?|Corp\.?|Ltd\.?|Group|Attorneys?\s+at\s+Law|Trial\s+Lawyers|Law\s+Offices?|Law\s+Firm|Counselors?\s+at\s+Law|Legal\s+Group|Trial\s+Attorneys|Law\s+Practice)$/i;
  let prev;
  do {
    prev = clean;
    clean = clean.replace(suffixPattern, '').trim();
  } while (clean !== prev);

  // Clean trailing associates / partners
  clean = clean.replace(/,?\s+(&?\s*associates|&?\s*partners|&?\s*affiliates)$/gi, '').trim();

  // Clean punctuation and double ampersands
  clean = clean.replace(/,\s*&/g, ' &');
  clean = clean.replace(/&+/g, '&');
  clean = clean.replace(/,\s*$/, '');
  clean = clean.replace(/\s+/g, ' ').trim();

  // Title case the firm name
  if (clean.length > 0) {
    clean = clean.split(' ').map(word => {
      if (word.toUpperCase() === '&') return '&';
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');
  }

  // Reject invalid firm names like "Plaintiff", "Defense", "Unknown Firm", "Unknown"
  const isInvalidFirm = !clean || /^(plaintiff|defense|unknown firm|unknown|counsel|lead counsel|pro se|n\/a|none|pending)$/i.test(clean);
  if (isInvalidFirm) {
    if (attorneyName && !/^(plaintiff|defense|counsel|awaiting|pro se|unknown|lead)/i.test(attorneyName)) {
      const attyClean = attorneyName.replace(/\s*,?\s*esq\.?$/i, '').trim().replace(/\s+/g, ' ');
      return `Law Office of ${attyClean}`;
    }
    return 'Awaiting Appearance';
  }

  // If firm name is identical to attorney name (solo practitioner)
  if (attorneyName && !/^(plaintiff|defense|counsel|awaiting|pro se|unknown|lead)/i.test(attorneyName)) {
    const cleanAtty = attorneyName.replace(/\s*,?\s*esq\.?$/i, '').trim().toLowerCase();
    const cleanFirm = clean.replace(/\s*,?\s*esq\.?$/i, '').trim().toLowerCase();
    if (cleanFirm === cleanAtty) {
      const properAtty = attorneyName.replace(/\s*,?\s*esq\.?$/i, '').trim();
      return `Law Office of ${properAtty}`;
    }
  }

  return clean;
}

function resolveFirmId(firmName) {
  const norm = (firmName || '').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return norm ? `firm-${norm}` : 'firm-unknown';
}

// 8. Florida Legal Venue Centroids for Fast Zero-Lag Map Visualizations
const FLORIDA_VENUE_COORDINATES = {
  'Miami': { lat: 25.7617, lng: -80.1918 },
  'Brickell': { lat: 25.7588, lng: -80.1930 },
  'Coral Gables': { lat: 25.7505, lng: -80.2632 },
  'Miami Beach': { lat: 25.7907, lng: -80.1300 },
  'Fort Lauderdale': { lat: 26.1224, lng: -80.1373 },
  'Hollywood': { lat: 26.0112, lng: -80.1495 },
  'West Palm Beach': { lat: 26.7153, lng: -80.0534 },
  'Boca Raton': { lat: 26.3683, lng: -80.1289 },
  'Palm Beach Gardens': { lat: 26.8234, lng: -80.1387 },
  'Tampa': { lat: 27.9506, lng: -82.4572 },
  'St. Petersburg': { lat: 27.7676, lng: -82.6403 },
  'Clearwater': { lat: 27.9659, lng: -82.8001 },
  'Orlando': { lat: 28.5383, lng: -81.3792 },
  'Jacksonville': { lat: 30.3322, lng: -81.6557 },
  'Tallahassee': { lat: 30.4383, lng: -84.2807 },
  'Fort Myers': { lat: 26.6406, lng: -81.8723 },
  'Naples': { lat: 26.1420, lng: -81.7948 },
  'Sarasota': { lat: 27.3364, lng: -82.5307 }
};

function resolveBuildingCoordinates(building, idx) {
  if (building.lat && building.lng && building.is_precise) {
    return { lat: building.lat, lng: building.lng, is_precise: true };
  }
  const city = building.city || 'Miami';
  const base = FLORIDA_VENUE_COORDINATES[city] || FLORIDA_VENUE_COORDINATES['Miami'];

  // Golden angle dispersion around commercial legal district center
  const i = (idx || 0) + 1;
  const angle = (i * 137.5) * (Math.PI / 180);
  const radius = 0.003 + ((i % 10) * 0.001);
  const lat = Number((base.lat + Math.sin(angle) * radius).toFixed(5));
  const lng = Number((base.lng + Math.cos(angle) * radius).toFixed(5));

  return { lat, lng, is_precise: false };
}

// Non-firm entity classifier (Pro Se, Government, Municipal, Corporate Defendants)
const NON_FIRM_PATTERNS = [
  /\bpro\s*se\b/i,
  /\bdepartment\s+of\s+justice\b/i,
  /\bdoj\b/i,
  /\bu\.?s\.?\s+attorney/i,
  /\bpublic\s+defender\b/i,
  /\bstate\s+attorney\b/i,
  /\bcounty\s+attorney\b/i,
  /\bcity\s+attorney\b/i,
  /\bgeneral\s+counsel\b/i,
  /\bsocial\s+security\b/i,
  /\bcruise\s*lines?\b/i,
  /\bcarnival\b/i,
  /\broyal\s+caribbean\b/i,
  /\bnorwegian\s+cruise\b/i,
  /\bairlines?\b/i,
  /\bdelta\s+air\b/i,
  /\bamerican\s+airlines\b/i,
  /\bpolice\s+dept/i,
  /\bsheriff/i,
  /\bflorida\s+bar\b/i,
  /\bclerk\s+of\s+(the\s+)?court/i
];

function isNonFirmEntity(name) {
  if (!name || typeof name !== 'string') return false;
  return NON_FIRM_PATTERNS.some(p => p.test(name));
}

const NON_JUDGE_PATTERNS = /^(open|closed|pending|reclosed|reopened|reopen|inactive|on appeal|disposed|active|deputy clerk|presiding judge|unknown|unknown judge|tbd|none|n\/a|unassigned|awaiting judicial assignment|court|clerk|reopened modification|reopen inactive|re-open)$/i;

function isValidJudgeName(name) {
  if (!name || typeof name !== 'string') return false;
  const clean = name.trim();
  if (clean.length < 3) return false;
  if (NON_JUDGE_PATTERNS.test(clean)) return false;
  return true;
}

module.exports = {
  normalizeCity,
  extractFirmCity,
  standardizeAddress,
  normalizeFirmName,
  resolveFirmId,
  isNonFirmEntity,
  isValidJudgeName,
  getCityFromZip,
  levenshteinDistance,
  FLORIDA_VENUE_COORDINATES,
  resolveBuildingCoordinates,
  buildAttorneyEmail,
  buildAttorneyPhone
};

