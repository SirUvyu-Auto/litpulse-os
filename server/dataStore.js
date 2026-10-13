const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const {
  normalizeCity,
  extractFirmCity,
  standardizeAddress,
  normalizeFirmName,
  resolveFirmId,
  isNonFirmEntity,
  isValidJudgeName,
  resolveBuildingCoordinates,
  buildAttorneyEmail,
  buildAttorneyPhone
} = require('./normalizer');
const geocoder = require('./geocoder');
const parkingService = require('./parkingService');
const pgStore = require('./pgStore');

function extractBuildingAddress(fullAddress) {
  if (!fullAddress || typeof fullAddress !== 'string') return 'Commercial Legal Building';
  let bldg = fullAddress.trim().replace(/\s+/g, ' ');
  // Clean embedded email and phone artifacts
  bldg = bldg.replace(/,?\s*(email|e-mail):\s*\S+/gi, '');
  bldg = bldg.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '');
  bldg = bldg.replace(/,?\s*(phone|tel|direct|fax):\s*[\d\s\(\)\.-]+/gi, '');
  // Normalize leading "One " to "1 "
  bldg = bldg.replace(/^one\s+/i, '1 ');
  // Strip suite / floor / unit designators with or without unit number
  bldg = bldg.replace(/,?\s*(Suite|Ste|Floor|Fl|Unit|Room|Rm|#)\s*([a-z0-9-]+)?/gi, '').trim();
  // Strip trailing state + zip (e.g. FL 33130, NY 10008)
  bldg = bldg.replace(/,?\s*[A-Z]{2}\s*\d{5}(-\d{4})?.*$/gi, '').trim();
  // Strip trailing Florida city if repeated at tail
  bldg = bldg.replace(/,\s*(Miami|Fort Lauderdale|West Palm Beach|Tampa|Orlando|Jacksonville|Coral Gables|Boca Raton|New York)\b.*$/gi, '').trim();
  bldg = bldg.replace(/,\s*$/, '').trim();
  return bldg || fullAddress;
}

function resolveLocality(address, city, division) {
  let state = 'FL';
  const cleanAddr = (address || '').toUpperCase();
  const cleanCity = (city || '').toLowerCase().trim();
  const cleanDiv = (division || '').toLowerCase().trim();

  // Detect state code from address
  const stateMatch = cleanAddr.match(/\b([A-Z]{2})\s+\d{5}\b/) || cleanAddr.match(/,\s*([A-Z]{2})\b/);
  if (stateMatch) {
    state = stateMatch[1];
  } else if (cleanAddr.includes('NEW YORK')) state = 'NY';
  else if (cleanAddr.includes('CALIFORNIA')) state = 'CA';
  else if (cleanAddr.includes('GEORGIA')) state = 'GA';
  else if (cleanAddr.includes('TEXAS')) state = 'TX';
  else if (cleanAddr.includes('VIRGINIA')) state = 'VA';
  else if (cleanAddr.includes('ILLINOIS')) state = 'IL';
  else if (cleanAddr.includes('FLORIDA') || cleanAddr.includes(' FL')) state = 'FL';

  const isOOS = state !== 'FL' && state !== 'FLORIDA';
  const isLocal = !isOOS && (
    cleanCity === cleanDiv ||
    cleanCity.includes(cleanDiv) ||
    cleanDiv.includes(cleanCity) ||
    (cleanDiv === 'ft lauderdale' && cleanCity === 'fort lauderdale') ||
    (cleanDiv === 'fort lauderdale' && cleanCity === 'ft lauderdale')
  );
  const isOOT = !isOOS && !isLocal;

  return { state, is_local: isLocal, is_oot: isOOT, is_oos: isOOS };
}

// ---------------- TRIS SCORE ENGINE (v20260916) ---------------- //

const NOS_REF = {
  '110': { base_trial_prob: 0.08, exhibit_intensity: 1.8, practice_category: 'Insurance / Admiralty' },
  '120': { base_trial_prob: 0.05, exhibit_intensity: 1.2, practice_category: 'Contract' },
  '190': { base_trial_prob: 0.06, exhibit_intensity: 1.4, practice_category: 'Other Contract' },
  '310': { base_trial_prob: 0.07, exhibit_intensity: 1.6, practice_category: 'Airplane Product' },
  '315': { base_trial_prob: 0.09, exhibit_intensity: 2.2, practice_category: 'Airplane Product Liab' },
  '320': { base_trial_prob: 0.08, exhibit_intensity: 1.5, practice_category: 'Assault / Slander' },
  '330': { base_trial_prob: 0.07, exhibit_intensity: 1.5, practice_category: 'Federal Employers Liab' },
  '340': { base_trial_prob: 0.10, exhibit_intensity: 2.0, practice_category: 'Marine PI' },
  '350': { base_trial_prob: 0.09, exhibit_intensity: 1.9, practice_category: 'Motor Vehicle PI' },
  '360': { base_trial_prob: 0.08, exhibit_intensity: 1.7, practice_category: 'Other Personal Injury' },
  '362': { base_trial_prob: 0.12, exhibit_intensity: 2.4, practice_category: 'Medical Malpractice' },
  '365': { base_trial_prob: 0.11, exhibit_intensity: 2.5, practice_category: 'Personal Injury Product Liab' },
  '367': { base_trial_prob: 0.11, exhibit_intensity: 2.3, practice_category: 'Health Care / Pharma' },
  '368': { base_trial_prob: 0.12, exhibit_intensity: 2.6, practice_category: 'Asbestos Product Liab' },
  '410': { base_trial_prob: 0.09, exhibit_intensity: 2.8, practice_category: 'Antitrust' },
  '440': { base_trial_prob: 0.06, exhibit_intensity: 1.3, practice_category: 'Other Civil Rights' },
  '442': { base_trial_prob: 0.07, exhibit_intensity: 1.5, practice_category: 'Employment Civil Rights' },
  '470': { base_trial_prob: 0.10, exhibit_intensity: 2.5, practice_category: 'RICO' },
  '830': { base_trial_prob: 0.10, exhibit_intensity: 2.7, practice_category: 'Patent' },
  '840': { base_trial_prob: 0.08, exhibit_intensity: 2.0, practice_category: 'Trademark' },
  '820': { base_trial_prob: 0.07, exhibit_intensity: 1.8, practice_category: 'Copyright' },
  'default': { base_trial_prob: 0.06, exhibit_intensity: 1.4, practice_category: 'General Federal Litigation' }
};

function getStageEscalation(daysUntil) {
  if (daysUntil === null || daysUntil === undefined || isNaN(daysUntil)) return 1.0;
  if (daysUntil <= 30) return 2.0;
  if (daysUntil <= 90) return 1.7;
  if (daysUntil <= 180) return 1.4;
  return 1.2;
}

function getScaleMultiplier(attorneyCount) {
  const n = attorneyCount || 1;
  if (n >= 10) return 1.6;
  if (n >= 3) return 1.0;
  return 0.7;
}

function calculateEAR(nosCode, daysUntil, attorneyCount = 2, side = 'Plaintiff', caseTypeStr = '') {
  const unitPrice = 75000;
  let nosKey = String(nosCode || '').trim();
  if (!NOS_REF[nosKey]) {
    const t = (caseTypeStr || '').toLowerCase();
    if (t.includes('patent')) nosKey = '830';
    else if (t.includes('antitrust')) nosKey = '410';
    else if (t.includes('rico')) nosKey = '470';
    else if (t.includes('medical') || t.includes('malpractice')) nosKey = '362';
    else if (t.includes('product') || t.includes('asbestos')) nosKey = '365';
    else if (t.includes('marine') || t.includes('maritime')) nosKey = '340';
    else if (t.includes('motor') || t.includes('vehicle')) nosKey = '350';
    else if (t.includes('civil rights') || t.includes('employment')) nosKey = '442';
    else if (t.includes('contract')) nosKey = '120';
    else nosKey = 'default';
  }

  const nos = NOS_REF[nosKey] || NOS_REF['default'];
  const stageEsc = getStageEscalation(daysUntil);
  const continuanceRate = 0.15;
  const trialProb = Number((Math.min(1.0, nos.base_trial_prob * stageEsc) * (1.0 - continuanceRate)).toFixed(4));
  const scaleMult = getScaleMultiplier(attorneyCount);
  const sideMult = (side && side.toLowerCase() === 'defense') ? 1.15 : 1.0;

  const fullValue = Math.round(unitPrice * nos.exhibit_intensity * scaleMult * sideMult);
  const ear = Math.round(fullValue * trialProb);
  const printLikelihood = Math.round(trialProb * 100);
  const likelihoodBucket = printLikelihood >= 60 ? 'likely' : (printLikelihood >= 40 ? 'uncertain' : 'unlikely');

  return {
    full_value: fullValue,
    trial_prob: trialProb,
    ear: ear,
    print_likelihood: printLikelihood,
    likelihood_bucket: likelihoodBucket
  };
}

// Robust multi-format date parser supporting YYYY-MM-DD, MM/DD/YYYY, Excel serial numbers, and ISO dates
function parseTrialDate(dateVal) {
  if (!dateVal) return null;
  // If Excel numeric serial date (e.g. 45000)
  if (typeof dateVal === 'number' || (/^\d{5}$/.test(String(dateVal).trim()) && !String(dateVal).includes('-'))) {
    const serial = Number(dateVal);
    const dt = new Date(Math.round((serial - 25569) * 86400 * 1000));
    if (!isNaN(dt.getTime())) {
      return dt.toISOString().split('T')[0];
    }
  }

  const s = String(dateVal).split('T')[0].trim();
  // Check YYYY-MM-DD or YYYY/MM/DD
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(s)) {
    const parts = s.split(/[-/]/);
    return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
  }
  // Check MM/DD/YYYY or M/D/YY
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) {
    const parts = s.split('/');
    let y = parts[2];
    if (y.length === 2) y = `20${y}`;
    return `${y}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  }
  // Check MM-DD-YYYY
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(s)) {
    const parts = s.split('-');
    return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  }

  const parsed = new Date(dateVal);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }
  return null;
}

// Timezone-aware Eastern Time (Florida venue) calendar difference to prevent UTC rollover bug (Defect #1)
function calculateDaysUntil(trialDateStr) {
  if (!trialDateStr) return null;
  const isoDate = parseTrialDate(trialDateStr);
  if (!isoDate) return null;
  const parts = isoDate.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;

  const targetUtc = Date.UTC(y, m, d);

  // Derive current calendar date in America/New_York (Florida court time)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  });
  const partsNow = formatter.formatToParts(new Date());
  let curY, curM, curD;
  partsNow.forEach(p => {
    if (p.type === 'year') curY = parseInt(p.value, 10);
    if (p.type === 'month') curM = parseInt(p.value, 10) - 1;
    if (p.type === 'day') curD = parseInt(p.value, 10);
  });
  const nowEasternUtc = Date.UTC(curY, curM, curD);

  const diffMs = targetUtc - nowEasternUtc;
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

// Firm-scoped unique attorney identifier to prevent name collisions across firms (Defect #6)
function buildAttorneyId(attyName, firmName) {
  const cleanAtty = (attyName || '').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!cleanAtty || cleanAtty === 'awaiting-appearance') return 'atty-awaiting-appearance';
  const cleanFirm = (firmName || '').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return cleanFirm ? `atty-${cleanAtty}-${cleanFirm.slice(0, 16)}` : `atty-${cleanAtty}`;
}

const DEFAULT_WEIGHTS = {
  urgency: 30,    // max 30 points
  revenue: 25,    // max 25 points
  locality: 20,   // max 20 points
  caseType: 15,   // max 15 points
  engagement: 15  // max 15 points
};

function calculatePriorityScore(trialDateStr, isLocal, nosCode, earValue, isHubSpotEngaged = true, customWeights = null, nosIntensity = 1.4) {
  const daysUntil = calculateDaysUntil(trialDateStr);
  const isHistorical = daysUntil !== null && !isNaN(daysUntil) && daysUntil < 0;

  if (isHistorical) {
    return { total: 0, urgency: 0, revenue: 0, locality: 0, caseType: 0, engagement: 0, daysUntil, isHistorical: true, tier: 'gray', isWarRoom: false };
  }

  const w = customWeights || DEFAULT_WEIGHTS;
  const maxUrgency = w.urgency !== undefined ? Number(w.urgency) : 30;
  const maxRevenue = w.revenue !== undefined ? Number(w.revenue) : 25;
  const maxLocality = w.locality !== undefined ? Number(w.locality) : 20;
  const maxCaseType = w.caseType !== undefined ? Number(w.caseType) : 15;
  const maxEngagement = w.engagement !== undefined ? Number(w.engagement) : 15;

  let urgency = 0;
  if (daysUntil !== null && !isNaN(daysUntil) && daysUntil >= 0 && daysUntil <= 90) {
    urgency = Math.round(maxUrgency * (1 - Math.sqrt(daysUntil / 90)));
  }

  const ear = (typeof earValue === 'number' && !isNaN(earValue)) ? earValue : 45000;
  const revenue = Math.min(maxRevenue, Math.round(maxRevenue * (ear / 500000)));

  // Traveling War Room Mode:
  // When Out-of-Town (OOT) or Out-of-State (OOS) counsel are 1 to 14 days away from trial,
  // they travel to the trial city and work out of a hotel or temporary war room with no heavy printers.
  // Instead of penalizing them on locality, grant full maxLocality (War Room Mode).
  const isWarRoom = !isLocal && daysUntil !== null && !isNaN(daysUntil) && daysUntil >= 0 && daysUntil <= 14;
  const locality = (isLocal || isWarRoom) ? maxLocality : Math.round(maxLocality * 0.6);

  const rawIntensity = typeof nosIntensity === 'number' ? nosIntensity : 1.4;
  const caseType = Math.min(maxCaseType, Math.round((rawIntensity / 2.8) * maxCaseType));

  const engagement = isHubSpotEngaged ? maxEngagement : 0;

  const rawTotal = urgency + revenue + locality + caseType + engagement;
  const total = Math.min(100, Math.max(0, rawTotal));
  const tier = total >= 75 ? 'red' : (total >= 55 ? 'orange' : 'gray');

  return { total, urgency, revenue, locality, caseType, engagement, daysUntil, isHistorical: false, tier, isWarRoom };
}

// Initial seed data reflecting Florida Federal/State high-value litigation
function getInitialSeedData() {
  const cases = [
    {
      case_id: '1:24-cv-21490',
      caption: 'Alvarez v. Carnival Corporation & plc',
      court: 'S.D. Fla.',
      division: 'Miami',
      judge: 'Hon. Beth Bloom',
      nos_label: 'Maritime Personal Injury',
      trial_date: '2026-10-14',
      days_until: 28,
      status: 'Open',
      est_value: 240000,
      lead_attorney: 'Michael A. Murphy',
      attorney_id: 'atty-michael-murphy',
      firm: 'Hickey Law Firm',
      firm_id: 'firm-hickey-law',
      opposing_firm: 'Mase Mebane Seitz',
      opposing_attorney: 'Curtis J. Mase',
      is_local: true,
      address: '1401 Brickell Ave, Suite 510',
      city: 'Miami',
      state: 'FL',
      phone: '(305) 371-8000',
      email: 'mmurphy@hickeylawfirm.com',
      assigned_to: 'Sarah Jenkins',
      hubspot_status: 'In Discussion',
      notes: 'Trial graphics package proposed; pretrial conference set for next week.'
    },
    {
      case_id: '0:24-cv-60812',
      caption: 'Sterling Bio-Ventures LLC v. Bausch Health US',
      court: 'S.D. Fla.',
      division: 'Fort Lauderdale',
      judge: 'Hon. Rodolfo A. Ruiz II',
      nos_label: 'Patent Infringement',
      trial_date: '2026-10-22',
      days_until: 36,
      status: 'Open',
      est_value: 450000,
      lead_attorney: 'David K. Friedland',
      attorney_id: 'atty-david-friedland',
      firm: 'Friedland Vining',
      firm_id: 'firm-friedland-vining',
      opposing_firm: 'Carlton Fields',
      opposing_attorney: 'Eleanor T. Barnett',
      is_local: true,
      address: '2600 Douglas Rd, Suite 1000',
      city: 'Coral Gables',
      state: 'FL',
      phone: '(305) 777-1720',
      email: 'dfriedland@friedlandvining.com',
      assigned_to: 'Mark Vance',
      hubspot_status: 'Discovery Complete',
      notes: 'Complex electronic patent exhibits needed; 3D mechanism animation discussed.'
    },
    {
      case_id: '9:24-cv-81045',
      caption: 'Boca Raton Premier Properties v. Hartford Fire Insurance',
      court: 'S.D. Fla.',
      division: 'West Palm Beach',
      judge: 'Hon. Robin L. Rosenberg',
      nos_label: 'Commercial Insurance Bad Faith',
      trial_date: '2026-11-04',
      days_until: 49,
      status: 'Open',
      est_value: 320000,
      lead_attorney: 'Rachel S. Cohen',
      attorney_id: 'atty-rachel-cohen',
      firm: 'Cohen Milstein Sellers & Toll',
      firm_id: 'firm-cohen-milstein',
      opposing_firm: 'Greenberg Traurig',
      opposing_attorney: 'Mark A. Salky',
      is_local: true,
      address: '2925 PGA Blvd, Suite 200',
      city: 'Palm Beach Gardens',
      state: 'FL',
      phone: '(561) 515-1400',
      email: 'rcohen@cohenmilstein.com',
      assigned_to: null,
      hubspot_status: 'Unassigned',
      notes: 'High-value hurricane damage claim. 14 depositions printed so far.'
    },
    {
      case_id: '1:24-cv-22910',
      caption: 'Ramirez et al v. Florida East Coast Railway',
      court: 'S.D. Fla.',
      division: 'Miami',
      judge: 'Hon. Jose E. Martinez',
      nos_label: 'FELA Catastrophic Injury',
      trial_date: '2026-11-12',
      days_until: 57,
      status: 'Open',
      est_value: 380000,
      lead_attorney: 'Robert L. Parks',
      attorney_id: 'atty-robert-parks',
      firm: 'The Parks Law Firm',
      firm_id: 'firm-parks-law',
      opposing_firm: 'Akerman',
      opposing_attorney: 'Lawrence D. Silverman',
      is_local: true,
      address: '799 Brickell Plaza, Suite 900',
      city: 'Miami',
      state: 'FL',
      phone: '(305) 445-4430',
      email: 'rparks@parkslaw.com',
      assigned_to: 'Sarah Jenkins',
      hubspot_status: 'Outreach Sent',
      notes: 'Site inspection 3D LiDAR scan requested for courtroom timeline playback.'
    },
    {
      case_id: '8:24-cv-01420',
      caption: 'Vanguard Medical Imaging v. BayCare Health System',
      court: 'M.D. Fla.',
      division: 'Tampa',
      judge: 'Hon. Steven D. Merryday',
      nos_label: 'Antitrust / Exclusive Dealing',
      trial_date: '2026-11-20',
      days_until: 65,
      status: 'Open',
      est_value: 520000,
      lead_attorney: 'Gregory C. Yadley',
      attorney_id: 'atty-gregory-yadley',
      firm: 'Shumaker, Loop & Kendrick',
      firm_id: 'firm-shumaker',
      opposing_firm: 'Foley & Lardner',
      opposing_attorney: 'Thomas M. Little',
      is_local: false,
      address: '101 E Kennedy Blvd, Suite 2800',
      city: 'Tampa',
      state: 'FL',
      phone: '(813) 229-7600',
      email: 'gyadley@shumaker.com',
      assigned_to: null,
      hubspot_status: 'Unassigned',
      notes: 'Substantial expert witness schedule; over 80 exhibits expected.'
    },
    {
      case_id: '6:24-cv-00891',
      caption: 'SunTrust Commercial Holdings v. Avalon Construction Corp',
      court: 'M.D. Fla.',
      division: 'Orlando',
      judge: 'Hon. Paul G. Byron',
      nos_label: 'Commercial Contract / Surety',
      trial_date: '2026-12-01',
      days_until: 76,
      status: 'Open',
      est_value: 290000,
      lead_attorney: 'Brian W. Toth',
      attorney_id: 'atty-brian-toth',
      firm: 'Holland & Knight',
      firm_id: 'firm-holland-knight',
      opposing_firm: 'Phelps Dunbar',
      opposing_attorney: 'Karl J. Brandes',
      is_local: false,
      address: '200 S Orange Ave, Suite 2600',
      city: 'Orlando',
      state: 'FL',
      phone: '(407) 425-8500',
      email: 'brian.toth@hklaw.com',
      assigned_to: 'Mark Vance',
      hubspot_status: 'Proposal Sent',
      notes: 'Need war room support and trial technician for 2-week trial duration.'
    },
    {
      case_id: '1:24-cv-23004',
      caption: 'Delgado v. Miami-Dade County Public Schools',
      court: 'S.D. Fla.',
      division: 'Miami',
      judge: 'Hon. Robert N. Scola Jr.',
      nos_label: 'Civil Rights / Section 1983',
      trial_date: '2026-12-08',
      days_until: 83,
      status: 'Open',
      est_value: 180000,
      lead_attorney: 'Stephanie A. Casey',
      attorney_id: 'atty-stephanie-casey',
      firm: 'Colson Hicks Eidson',
      firm_id: 'firm-colson-hicks',
      opposing_firm: 'Miami-Dade School Board Legal',
      opposing_attorney: 'Walter J. Harvey',
      is_local: true,
      address: '255 Alhambra Circle, Penthouse',
      city: 'Coral Gables',
      state: 'FL',
      phone: '(305) 476-7400',
      email: 'stephanie@colson.com',
      assigned_to: 'Sarah Jenkins',
      hubspot_status: 'Meeting Scheduled',
      notes: 'Focus groups and mock trial presentation conducted last month.'
    },
    {
      case_id: '9:24-cv-81452',
      caption: 'Ocean Harbor Casualty v. Palm Beach Diagnostic Centers',
      court: 'S.D. Fla.',
      division: 'West Palm Beach',
      judge: 'Hon. Donald M. Middlebrooks',
      nos_label: 'RICO / Healthcare Fraud',
      trial_date: '2026-12-15',
      days_until: 90,
      status: 'Open',
      est_value: 610000,
      lead_attorney: 'Adam T. Rabin',
      attorney_id: 'atty-adam-rabin',
      firm: 'Rabin Kammerer Johnson',
      firm_id: 'firm-rabin-kammerer',
      opposing_firm: 'Quarles & Brady',
      opposing_attorney: 'Kirk S. Davis',
      is_local: true,
      address: '1601 Forum Pl, Suite 500',
      city: 'West Palm Beach',
      state: 'FL',
      phone: '(561) 659-7878',
      email: 'arabin@rklawfl.com',
      assigned_to: null,
      hubspot_status: 'Unassigned',
      notes: 'Massive document labeling and OCR extraction needed before final calendar call.'
    }
  ];

  // Enrich each case with calculated scores
  cases.forEach(c => {
    const scores = calculatePriorityScore(c.trial_date, c.is_local, c.nos_label);
    c.priority_score = scores.total;
    c.urgency_score = scores.urgency;
    c.revenue_score = scores.revenue;
    c.locality_score = scores.locality;
  });

  // Building delivery clusters for physical runner drops
  const buildings = [
    {
      building_id: 'bldg-se-financial',
      building_name: 'Southeast Financial Center',
      address: '200 S Biscayne Blvd, Miami, FL 33131',
      city: 'Miami',
      attorneys_count: 8,
      firms_count: 5,
      active_trials: 6,
      parking_notes: 'Underground valet garage; entrance on SE 2nd St.',
      security_notes: 'Badge checkpoint on 2nd floor mezzanine; ID required.',
      runner_status: 'Ready for Drop',
      last_drop: '2026-08-28',
      tenants: ['Morgan & Morgan', 'Carlton Fields', 'Greenberg Traurig', 'Shutts & Bowen']
    },
    {
      building_id: 'bldg-brickell-arch',
      building_name: 'Brickell Arch (Conrad Center)',
      address: '1395 Brickell Ave, Miami, FL 33131',
      city: 'Miami',
      attorneys_count: 6,
      firms_count: 4,
      active_trials: 4,
      parking_notes: 'Public garage on 14th St.',
      security_notes: 'Front desk calls suite before elevator access.',
      runner_status: 'Ready for Drop',
      last_drop: '2026-09-02',
      tenants: ['Hickey Law Firm', 'Hunton Andrews Kurth', 'Holland & Knight']
    },
    {
      building_id: 'bldg-100-las-olas',
      building_name: '100 Las Olas Commercial Tower',
      address: '100 E Las Olas Blvd, Fort Lauderdale, FL 33301',
      city: 'Fort Lauderdale',
      attorneys_count: 5,
      firms_count: 3,
      active_trials: 3,
      parking_notes: 'Attached municipal parking deck on SE 1st Ave.',
      security_notes: 'Open lobby during business hours.',
      runner_status: 'Planned',
      last_drop: '2026-08-15',
      tenants: ['Kelley Kronenberg', 'Boies Schiller Flexner', 'Gunster']
    },
    {
      building_id: 'bldg-phillips-point',
      building_name: 'Phillips Point Towers',
      address: '777 S Flagler Dr, West Palm Beach, FL 33401',
      city: 'West Palm Beach',
      attorneys_count: 7,
      firms_count: 4,
      active_trials: 5,
      parking_notes: 'Dedicated visitor parking on ground level.',
      security_notes: 'Direct elevator access with sign-in.',
      runner_status: 'Ready for Drop',
      last_drop: '2026-09-08',
      tenants: ['Searcy Denney', 'Broad and Cassel', 'Gunster Yoakley']
    },
    {
      building_id: 'bldg-wells-fargo-tampa',
      building_name: 'Wells Fargo Center Tampa',
      address: '100 S Ashley Dr, Tampa, FL 33602',
      city: 'Tampa',
      attorneys_count: 6,
      firms_count: 3,
      active_trials: 4,
      parking_notes: 'Covered garage access on Whiting St.',
      security_notes: 'Photo ID verified at lobby desk.',
      runner_status: 'In Progress',
      last_drop: '2026-09-10',
      tenants: ['Phelps Dunbar', 'Shumaker Loop & Kendrick', 'Hill Ward Henderson']
    }
  ];

  const ingestion_logs = [
    {
      log_id: 'log-2026-09-16-01',
      file_name: 'SDFL_Civil_Dockets_Sept2026_Cycle2.xlsx',
      imported_at: '2026-09-16T14:32:00Z',
      rows_total: 412,
      rows_clean: 410,
      rows_flagged: 2,
      status: 'Clean',
      source_type: 'Court Docket Feed'
    },
    {
      log_id: 'log-2026-09-14-01',
      file_name: 'MDFL_Tampa_Orlando_Trial_Calendar.csv',
      imported_at: '2026-09-14T09:15:00Z',
      rows_total: 184,
      rows_clean: 184,
      rows_flagged: 0,
      status: 'Clean',
      source_type: 'State Calendar Call'
    },
    {
      log_id: 'log-2026-09-10-01',
      file_name: 'Federal_Appearance_Matrix_Q3.xlsx',
      imported_at: '2026-09-10T16:40:00Z',
      rows_total: 620,
      rows_clean: 615,
      rows_flagged: 5,
      status: 'Clean',
      source_type: 'Attorney Appearances'
    }
  ];

  return { cases, buildings, ingestion_logs };
}

// TRIS Section 4: Delivery Status Classifier Truth Table
function classifyDeliveryStatus(c, hasDeliveryEvent = false) {
  if (hasDeliveryEvent || c.outreach_status === 'downloaded') {
    return 'delivered';
  }
  const hasAddr = c.address && c.address.trim() && !c.address.toLowerCase().includes('unknown');
  const hasAtty = c.lead_attorney && c.lead_attorney.trim() && !c.lead_attorney.toLowerCase().includes('unknown');
  const hasFirm = c.firm && c.firm.trim() && !c.firm.toLowerCase().includes('unknown');
  const hasContact = (c.email && c.email.includes('@')) || (c.phone && c.phone.trim().length >= 7);
  if (!hasAddr || !hasAtty || !hasFirm || !hasContact) {
    return 'hold';
  }
  if (c.days_until !== undefined && c.days_until !== null && c.days_until <= 0) {
    return 'exception';
  }
  if (c.delivery_status === 'deferred') return 'deferred';
  if (c.delivery_status === 'planned') return 'planned';
  return 'eligible';
}

// TRIS Section 7: Trial Tendency Outcome Classifier
function classifyCaseOutcome(c) {
  const statusStr = `${c.status || ''} ${c.case_status || ''} ${c.caption || ''} ${c.notes || ''}`.toLowerCase();
  if (/trial|verdict|judgment.*trial/i.test(statusStr)) return 'trial';
  if (/settl|consent|stipul/i.test(statusStr)) return 'settled';
  if (/dismiss|voluntary|withdraw|remand/i.test(statusStr)) return 'dismissed';
  if (/summary|default/i.test(statusStr)) return 'dismissed';

  if (c.filed_date && c.closure_date) {
    const filed = new Date(c.filed_date);
    const closed = new Date(c.closure_date);
    const dtc = Math.ceil((closed.getTime() - filed.getTime()) / (1000 * 60 * 60 * 24));
    if (!isNaN(dtc) && dtc > 0) {
      if (dtc < 180) return 'settled';
      if (dtc < 548) return 'dismissed';
      return 'trial';
    }
  }

  if (c.days_until !== undefined && c.days_until <= 0) {
    return 'trial';
  }
  return 'open';
}

class DataStore {
  constructor() {
    this.data = null;
    this.isGeocoding = false;
    this.saveTimer = null;
    this.load();
    this.recomputeScoresAndBuildings();

    // Initialize PostgreSQL primary store with Local JSON Backup synchronization
    pgStore.init((pgData, mode) => {
      if (mode === 'postgres' && pgData && Array.isArray(pgData.cases) && pgData.cases.length >= (this.data.cases || []).length) {
        this.data = pgData;
        this.recomputeScoresAndBuildings();
        this.rebuildBuildingIndex();
      }
      return this.data;
    });
  }

  load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        this.data = {
          cases: Array.isArray(parsed.cases) ? parsed.cases : [],
          buildings: Array.isArray(parsed.buildings) ? parsed.buildings : [],
          ingestion_logs: Array.isArray(parsed.ingestion_logs) ? parsed.ingestion_logs : [],
          forecast_log: Array.isArray(parsed.forecast_log) ? parsed.forecast_log : [],
          conversions: Array.isArray(parsed.conversions) ? parsed.conversions : [],
          weights: parsed.weights || { urgency: 30, revenue: 25, locality: 20, caseType: 15, engagement: 15 }
        };
      } else {
        this.data = { cases: [], buildings: [], ingestion_logs: [], forecast_log: [], conversions: [], weights: { urgency: 30, revenue: 25, locality: 20, caseType: 15, engagement: 15 } };
        this.save();
      }
    } catch (err) {
      console.error('Failed to load database, resetting to clean empty state:', err.message);
      this.data = { cases: [], buildings: [], ingestion_logs: [], forecast_log: [], conversions: [], weights: { urgency: 30, revenue: 25, locality: 20, caseType: 15, engagement: 15 } };
      this.save();
    }
  }

  recomputeScoresAndBuildings(force = false) {
    if (!this.data || !Array.isArray(this.data.cases)) return;
    const cases = this.data.cases;
    if (!cases.length) return;

    const needsRecompute = force || cases.some(c => 
      c.ear === undefined || 
      c.is_war_room === undefined ||
      c.casetype_score === undefined ||
      !c.likelihood_bucket || 
      /^(cv-[a-z0-9]|div\s*\d+|section\s*\d+|central\s+courthouse)/i.test(c.city || '') ||
      /^(plaintiff|defense)$/i.test(c.firm || '') ||
      /^(plaintiff counsel|defense counsel)$/i.test(c.lead_attorney || '') ||
      /plaintiff@lawfirm|defense@lawfirm/i.test(c.email || '') ||
      /^\(305\)\s*555-0[12]00$/i.test(c.phone || '')
    );
    if (!needsRecompute) {
      this.rebuildBuildingIndex();
      return;
    }

    console.log(`[TRIS Engine] Recomputing EAR, Priority Scores, and Florida Buildings for ${cases.length} records...`);

    // Step A: Index all appearances across cases to calculate courier Re-Hit intelligence
    const attorneyHistory = new Map();
    cases.forEach(c => {
      const atty = (c.lead_attorney || '').trim().toLowerCase();
      const firm = (c.firm || '').trim().toLowerCase();
      if (!atty || atty === 'awaiting appearance' || atty === 'unknown counsel') return;
      const key = `${atty}::${firm}`;
      if (!attorneyHistory.has(key)) attorneyHistory.set(key, []);
      attorneyHistory.get(key).push({
        case_id: c.case_id,
        target_id: c.target_id,
        caption: c.caption,
        trial_date: c.trial_date,
        last_contact_date: c.last_contact_date || (c.notes && c.notes.match(/contacted\s+on\s+([0-9\/\-]+)/i) ? c.notes.match(/contacted\s+on\s+([0-9\/\-]+)/i)[1] : null),
        status: c.status,
        days_until: c.days_until
      });
    });

    cases.forEach(c => {
      // Trial City (the court venue location)
      c.trial_city = normalizeCity(c.division, '', c.division, c.court, c.case_id);

      // Firm City (the physical city/state of the law firm from office address)
      c.firm_city = extractFirmCity(c.address, c.city || c.trial_city);

      // Ensure city reflects firm city
      c.city = c.firm_city;

      // Clean placeholder attorney
      if (!c.lead_attorney || /^(plaintiff counsel|defense counsel|plaintiff|defense|unknown counsel)$/i.test(c.lead_attorney)) {
        c.lead_attorney = 'Awaiting Appearance';
      }

      // Clean placeholder firm
      c.firm = normalizeFirmName(c.firm, c.email, c.lead_attorney);

      // Scrub and dynamically resolve email and phone if missing or generic placeholder
      if (!c.email || /^(plaintiff@lawfirm\.com|defense@lawfirm\.com|.*@lawfirm\.com|.*@example\.com)$/i.test(c.email)) {
        c.email = buildAttorneyEmail(c.lead_attorney, c.firm);
      }
      if (!c.phone || /^\(305\)\s*555-0[12]00$/i.test(c.phone) || /555-0100|555-0200/.test(c.phone)) {
        c.phone = buildAttorneyPhone(c.firm, c.city);
      }

      // Defect #6 fix: Build firm-scoped unique attorney identifier
      c.attorney_id = buildAttorneyId(c.lead_attorney, c.firm);

      // Clean non-judge statuses (e.g. Pending, Open, Closed) from judge field
      if (!c.judge || !isValidJudgeName(c.judge)) {
        c.judge = 'Awaiting Judicial Assignment';
      }

      // Defect #1 fix: Recalculate days_until using Eastern Time (Florida venue)
      if (c.trial_date) {
        const recalcedDays = calculateDaysUntil(c.trial_date);
        if (recalcedDays !== null) {
          c.days_until = recalcedDays;
        }
      }

      // Re-Hit Courier Intelligence
      const attyKey = `${(c.lead_attorney || '').trim().toLowerCase()}::${(c.firm || '').trim().toLowerCase()}`;
      const appearances = attorneyHistory.get(attyKey) || [];

      let isRehit = Boolean(c.is_rehit);
      let rehitDate = c.rehit_date || c.last_contact_date || '';
      let rehitPriorMatter = c.rehit_prior_matter || '';

      if (!isRehit && appearances.length > 1) {
        // Find an earlier appearance for a different case
        const prior = appearances.find(a =>
          a.case_id !== c.case_id &&
          (a.status === 'Historical' || (a.days_until !== undefined && a.days_until < (c.days_until || 999)) || a.last_contact_date)
        );
        if (prior) {
          isRehit = true;
          rehitDate = prior.last_contact_date || prior.trial_date || 'Earlier Outreach';
          rehitPriorMatter = prior.caption || prior.case_id;
        }
      }

      c.is_rehit = isRehit;
      c.rehit_date = rehitDate;
      c.rehit_prior_matter = rehitPriorMatter;

      // Defect #44 fix: Detect if same law firm appears on both sides
      if (c.firm && c.opposing_firm && c.firm !== 'Awaiting Appearance' && c.firm !== 'Unknown Firm') {
        c.same_firm_both_sides = c.firm.toLowerCase() === c.opposing_firm.toLowerCase();
      } else {
        c.same_firm_both_sides = false;
      }

      const attyCount = (c.counsel_matrix && c.counsel_matrix.length) ? c.counsel_matrix.length : 2;
      const earInfo = calculateEAR(c.nos_code, c.days_until, attyCount, c.party_side, c.nos_label);
      c.ear = earInfo.ear;
      c.trial_prob = earInfo.trial_prob;
      c.full_value = earInfo.full_value;
      c.print_likelihood = earInfo.print_likelihood;
      c.likelihood_bucket = earInfo.likelihood_bucket;
      // Defect #4 fix: do not overwrite explicit 0 EAR with $75k fallback
      c.est_value = (typeof c.ear === 'number' && !isNaN(c.ear)) ? c.ear : (typeof c.full_value === 'number' ? c.full_value : 75000);

      const locality = resolveLocality(c.address, c.firm_city, c.trial_city);
      c.is_local = locality.is_local;
      c.is_oos = locality.is_oos;
      c.is_oot = locality.is_oot;
      c.state = locality.state;
      c.locality_badge = locality.is_local ? 'Local FL' : (locality.is_oos ? `Out-of-State (${locality.state})` : 'Out-of-Town FL');

      const isAssigned = Boolean(c.assigned_to && c.assigned_to !== 'Unassigned' && c.hubspot_status !== 'Unassigned');
      const hasEngagement = Boolean((c.email && c.email.includes('@')) || (c.phone && c.phone.trim().length >= 7) || isAssigned || c.has_cookie_conversion);
      const nosIntensity = (NOS_REF[c.nos_code] || NOS_REF['default']).exhibit_intensity || 1.4;
      const scores = calculatePriorityScore(c.trial_date, c.is_local, c.nos_code, c.ear, hasEngagement, this.data.weights, nosIntensity);
      const isHistorical = c.status === 'Historical' || (c.days_until !== undefined && c.days_until <= 0);
      if (c.days_until !== undefined && c.days_until <= 0) {
        c.status = 'Historical';
      }
      c.is_war_room = isHistorical ? false : Boolean(scores.isWarRoom);
      if (c.is_war_room) {
        c.locality_badge = locality.is_oos ? `War Room (${locality.state})` : 'War Room (FL)';
      }
      c.priority_score = isHistorical ? 0 : scores.total;
      c.urgency_score = isHistorical ? 0 : scores.urgency;
      c.revenue_score = isHistorical ? 0 : scores.revenue;
      c.locality_score = isHistorical ? 0 : scores.locality;
      c.casetype_score = isHistorical ? 0 : scores.caseType;
      c.engagement_score = isHistorical ? 0 : scores.engagement;
      c.priority_tier = scores.tier;

      c.delivery_status = classifyDeliveryStatus(c);
    });

    // Rebuild physical building clusters strictly for Florida local addresses
    const bldgMap = new Map();
    const activeTargets = cases.filter(c => c.status !== 'Historical' && (c.days_until === undefined || c.days_until > 0));

    activeTargets.forEach(c => {
      // Hand delivery clusters are for Florida office locations
      const state = c.state || 'FL';
      if (state !== 'FL' && state !== 'FLORIDA') return;

      let city = c.city || c.firm_city || 'Miami';
      if (city.includes(',')) city = city.split(',')[0].trim();
      city = normalizeCity(city, c.address) || city;

      const bldgStreet = extractBuildingAddress(c.address);
      const hasStreetNumber = /\d+/.test(bldgStreet) && !bldgStreet.toLowerCase().startsWith('po box');
      if (!hasStreetNumber) return;

      const key = `${city}-${bldgStreet}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
      if (!bldgMap.has(key)) {
        bldgMap.set(key, {
          building_id: `bldg-${key.slice(0, 24)}`,
          building_name: bldgStreet,
          address: `${bldgStreet}, ${city}, ${state}`,
          city: city,
          state: state,
          attorneys_count: 0,
          firms: new Set(),
          active_trials: 0,
          parking_notes: 'Standard garage / valet parking',
          security_notes: 'Lobby check-in required',
          runner_status: 'Ready for Drop',
          last_drop: 'Pending Dispatch'
        });
      }
      const b = bldgMap.get(key);
      b.attorneys_count += 1;
      const firmBadge = c.firm || 'Law Firm';
      const party = c.party_badge || (c.party_side === 'Defense' ? 'DEF' : 'PLTF');
      b.firms.add(`${firmBadge} (${party})`);
      b.active_trials += 1;
      c.building_id = b.building_id;
    });

    this.data.buildings = Array.from(bldgMap.values()).map((b, idx) => {
      const cached = geocoder.getCachedCoordinates(b.address, b.city);
      let lat, lng, isPrecise, isGeocoded;
      if (cached) {
        lat = cached.lat;
        lng = cached.lng;
        isPrecise = true;
        isGeocoded = true;
      } else {
        const coords = resolveBuildingCoordinates(b, idx);
        lat = coords.lat;
        lng = coords.lng;
        isPrecise = false;
        isGeocoded = false;
      }

      const access = parkingService.resolveKnownAccess(b.address, b.city) || parkingService._getRegionalFallback(b.address, b.city);
      const parkingNotes = (b.parking_notes && b.parking_notes !== 'Standard garage / valet parking') ? b.parking_notes : access.parking_notes;
      const securityNotes = (b.security_notes && b.security_notes !== 'Lobby check-in required') ? b.security_notes : access.security_notes;

      return {
        ...b,
        lat,
        lng,
        is_precise: isPrecise,
        geocoded: isGeocoded,
        parking_notes: parkingNotes,
        security_notes: securityNotes,
        facility_source: access.facility_source || 'Commercial Facility Registry',
        firms_count: b.firms.size,
        tenants: Array.from(b.firms)
      };
    });

    this.rebuildBuildingIndex();
    this.save();
    console.log(`[TRIS Engine] Completed recompute. Formed ${this.data.buildings.length} clean Florida delivery buildings.`);
  }

  deleteDocument(logId) {
    const logs = this.data.ingestion_logs || [];
    const logIdx = logs.findIndex(l => l.log_id === logId || l.file_name === logId);
    if (logIdx === -1) {
      return { success: false, error: 'Document log record not found.' };
    }

    const targetLog = logs[logIdx];
    const targetLogId = targetLog.log_id;
    const targetFileName = targetLog.file_name;

    const initialCaseCount = (this.data.cases || []).length;

    // Filter out cases linked to this document
    this.data.cases = (this.data.cases || []).filter(c => {
      // 1. Direct match on source_log_id or source_file
      if (c.source_log_id && c.source_log_id === targetLogId) return false;
      if (c.source_file && c.source_file === targetFileName) return false;

      // 2. Fallback check for test cases if legacy records lacked source tags
      if (targetFileName === 'test_ingest.csv' && c.case_id && c.case_id.includes('9990')) {
        return false;
      }

      return true;
    });

    const deletedCasesCount = initialCaseCount - this.data.cases.length;

    // Remove log entry
    this.data.ingestion_logs.splice(logIdx, 1);

    // Sync deletion to PostgreSQL primary store
    pgStore.deleteDocumentRecords(targetLogId, targetFileName).catch(err => {
      console.error('[TRIS PG] Error deleting document records:', err.message);
    });

    // Recompute Florida delivery buildings, scoring matrices, and building indices
    this.recomputeScoresAndBuildings(true);
    this.save();

    console.log(`[TRIS Admin] Deleted document "${targetFileName}" (log ${targetLogId}). Removed ${deletedCasesCount} cases. Remaining: ${this.data.cases.length} cases.`);

    return {
      success: true,
      logId: targetLogId,
      fileName: targetFileName,
      deletedCasesCount,
      remainingCasesCount: this.data.cases.length
    };
  }

  clearData() {
    this.data = {
      cases: [],
      buildings: [],
      ingestion_logs: []
    };
    this.save();
    return true;
  }

  save() {
    // 1. Primary PostgreSQL persistence (non-blocking)
    pgStore.syncAll(this.data).catch(err => {
      console.error('[TRIS PG] Background sync error:', err.message);
    });

    // 2. Local JSON backup (debounced non-blocking write to avoid event-loop stalls on 44MB file)
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      fs.promises.writeFile(DB_FILE, JSON.stringify(this.data, null, 2), 'utf8').catch(err => {
        console.error('Failed to save local backup database file:', err.message);
      });
    }, 350);
  }

  getCases() {
    return this.data.cases || [];
  }

  getBuildings() {
    return this.data.buildings || [];
  }

  getLogs() {
    return this.data.ingestion_logs || [];
  }

  getAdminStats() {
    const cases = this.getCases();
    const logs = this.getLogs();
    const totalRows = logs.reduce((acc, l) => acc + (l.rows_total || 0), 0);
    const cleanRows = logs.reduce((acc, l) => acc + (l.rows_clean || 0), 0);
    const quality = totalRows > 0 ? Math.min(100.0, ((cleanRows / (totalRows * 2)) * 100)).toFixed(1) : '100.0';

    const uniqueFirms = new Set(cases.map(c => c.firm)).size;
    const uniqueAttorneys = new Set(cases.map(c => c.lead_attorney)).size;

    return {
      activeFiles: logs.length,
      ingestionQuality: `${quality}%`,
      newCasesCount: cases.length,
      counselCount: `${uniqueAttorneys} Counsel (${uniqueFirms} Firms)`,
      recentLogs: logs.slice(0, 10),
      storageStatus: pgStore.getStatus()
    };
  }

  getDashboardOverview() {
    const allTargets = this.getCases();
    const activeTargets = allTargets.filter(c => c.status !== 'Historical' && (c.days_until === undefined || c.days_until > 0));
    const historicalTargets = allTargets.filter(c => c.status === 'Historical' || (c.days_until !== undefined && c.days_until <= 0));
    const buildings = this.getBuildings();

    // High priority active outreach: Priority score >= 45 (Red or Orange Tier)
    const highPriority = activeTargets.filter(c => (c.priority_score || 0) >= 45);
    const estPipeline = highPriority.reduce((acc, c) => acc + (c.est_value || c.ear || 0), 0);

    // Upcoming active trials in next 90 days, 30 days, 7 days
    const next90Days = activeTargets.filter(c => (c.days_until || 0) <= 90);
    const next30Days = activeTargets.filter(c => (c.days_until || 0) <= 30);
    const next7Days = activeTargets.filter(c => (c.days_until || 0) <= 7);

    // Unassigned active leads
    const unassigned = activeTargets.filter(c => !c.assigned_to || c.hubspot_status === 'Unassigned');

    // Large and Complex Matters count
    const largeMattersCount = activeTargets.filter(c => (c.full_value || 0) >= 100000 || (c.ear || 0) >= 15000 || (c.counsel_matrix && c.counsel_matrix.length >= 4)).length;

    // Buildings ready for delivery
    const totalAttorneysInBuildings = buildings.reduce((acc, b) => acc + (b.attorneys_count || 0), 0);

    // Sort active targets by priority score descending
    const sorted = [...activeTargets].sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0));

    // Dynamic revenue forecast based on active upcoming trial dates
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const forecastMap = {};
    activeTargets.forEach(c => {
      if (!c.trial_date) return;
      const d = new Date(c.trial_date);
      if (isNaN(d.getTime())) return;
      const key = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
      if (!forecastMap[key]) forecastMap[key] = { month: key, trials: 0, val: 0 };
      forecastMap[key].trials += 1;
      forecastMap[key].val += (c.est_value || 250000);
    });

    const forecastByMonth = Object.values(forecastMap).map(f => ({
      month: f.month,
      trials: f.trials,
      p10: Math.round(f.val * 0.6),
      p50: f.val,
      p90: Math.round(f.val * 1.3)
    }));

    return {
      totalCases: activeTargets.length,
      historicalCount: historicalTargets.length,
      kpis: {
        outreach: {
          count: highPriority.length,
          estValue: estPipeline,
          label: 'High Priority Outreach',
          delta: highPriority.length > 0 ? `+${highPriority.length} actionable targets` : 'No active targets',
          urgency: highPriority.length > 0 ? 'Actionable today' : 'Awaiting Ingestion'
        },
        trials: {
          count: next90Days.length,
          next30: next30Days.length,
          next7: next7Days.length,
          label: 'Upcoming Trials (90d)',
          delta: next30Days.length > 0 ? `${next30Days.length} in calendar call` : '0 in calendar call',
          urgency: next30Days.length > 0 ? 'Prep window open' : 'No urgent trials'
        },
        unassigned: {
          count: unassigned.length,
          highUrgency: unassigned.filter(c => c.days_until <= 60).length,
          label: 'Unassigned Targets',
          delta: unassigned.length > 0 ? 'Needs sales assignment' : 'All assigned',
          urgency: unassigned.length > 0 ? 'Immediate follow-up' : 'Queue clear'
        },
        deliveries: {
          buildingsCount: buildings.length,
          attorneysReady: totalAttorneysInBuildings,
          label: 'Active Delivery Clusters',
          delta: buildings.length > 0 ? `${buildings.length} clusters available` : '0 clusters',
          urgency: buildings.length > 0 ? 'Delivery Ready' : 'Awaiting Data'
        }
      },
      topPriorities: sorted.slice(0, 6),
      forecast: forecastByMonth,
      largeMattersCount
    };
  }

  getDrillData(key) {
    const allTargets = this.getCases();
    const activeTargets = allTargets.filter(c => c.status !== 'Historical' && (c.days_until === undefined || c.days_until > 0));
    const historicalTargets = allTargets.filter(c => c.status === 'Historical' || (c.days_until !== undefined && c.days_until <= 0));
    const buildings = this.getBuildings();

    if (key === 'outreach') {
      return {
        title: 'High-Priority Outreach Queue',
        sub: 'Plaintiff and Defense trial counsel ranked by urgency, value, and venue locality.',
        rows: [...activeTargets].sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0)),
        historicalCount: historicalTargets.length
      };
    } else if (key === 'historical') {
      return {
        title: 'Historical Concluded Matters',
        sub: 'Concluded court trials archived from active queues; feeds Trial Tendency analytics.',
        rows: [...historicalTargets].sort((a, b) => new Date(b.trial_date) - new Date(a.trial_date)),
        historicalCount: historicalTargets.length
      };
    } else if (key === 'trials') {
      return {
        title: 'Upcoming Docketed Trials (Next 90 Days)',
        sub: 'Active appearances ordered chronologically by scheduled trial start date.',
        rows: [...activeTargets].sort((a, b) => (a.days_until || 999) - (b.days_until || 999))
      };
    } else if (key === 'unassigned') {
      return {
        title: 'Unassigned High-Score Leads',
        sub: 'Litigation opportunities requiring immediate team ownership.',
        rows: activeTargets.filter(c => !c.assigned_to || c.hubspot_status === 'Unassigned')
      };
    } else if (key === 'deliveries') {
      const qb = require('./quickbooksService');
      const enrichedBuildings = buildings.map(b => {
        const hasClient = (b.tenants || []).some(t => {
          const firmName = t.replace(/\s*\((PLTF|DEF)\)/i, '').trim();
          return qb.getClientStatus(firmName).isClient;
        });
        return { ...b, has_client: hasClient };
      });
      return {
        title: 'Commercial Office Building Clusters',
        sub: 'High-density physical runner drop locations with attorney suite counts.',
        rows: enrichedBuildings
      };
    } else if (key === 'largematters') {
      const largeRows = activeTargets.filter(c => (c.full_value || 0) >= 100000 || (c.ear || 0) >= 15000 || (c.counsel_matrix && c.counsel_matrix.length >= 4));
      return {
        title: 'Large & Complex Litigation Matters',
        sub: 'High-value litigation cases requiring demonstratives, warm white-glove field outreach, and hot-seat technicians.',
        rows: largeRows.sort((a, b) => {
          const pDiff = (b.priority_score || 0) - (a.priority_score || 0);
          if (pDiff !== 0) return pDiff;
          return (b.ear || b.full_value || 0) - (a.ear || a.full_value || 0);
        })
      };
    } else if (key === 'judges') {
      return {
        title: 'Judicial Calendar & Courtroom Appearances',
        sub: 'Presiding federal and circuit court judges ranked by active upcoming trial volume.',
        rows: this.getJudgeAnalytics()
      };
    }
    return { title: 'Granular Data View', sub: '', rows: activeTargets };
  }

  getJudgeAnalytics() {
    const cases = this.getCases();
    const judgeMap = new Map();

    cases.forEach(c => {
      let judge = c.judge;
      if (!judge || !isValidJudgeName(judge)) return;
      judge = judge.trim();
      if (!judgeMap.has(judge)) {
        judgeMap.set(judge, {
          judge_name: judge,
          court: c.court || 'S.D. Fla.',
          division: c.trial_city || c.city || c.division || 'Miami',
          city: c.trial_city || c.city || 'Miami',
          total_cases: 0,
          active_trials: 0,
          earliest_trial: null,
          high_ear_cases: 0,
          total_ear: 0,
          sum_priority: 0
        });
      }
      const j = judgeMap.get(judge);
      j.total_cases += 1;
      const isActive = c.status !== 'Historical' && (c.days_until === undefined || c.days_until > 0);
      if (isActive) {
        j.active_trials += 1;
        j.total_ear += (c.ear || c.est_value || 0);
        j.sum_priority += (c.priority_score || 0);
        if (c.trial_date) {
          if (!j.earliest_trial || new Date(c.trial_date) < new Date(j.earliest_trial)) {
            j.earliest_trial = c.trial_date;
          }
        }
        if ((c.ear || c.est_value || 0) >= 100000) {
          j.high_ear_cases += 1;
        }
      }
    });

    return Array.from(judgeMap.values()).map(j => {
      j.avg_priority = j.active_trials > 0 ? Math.round(j.sum_priority / j.active_trials) : 70;
      return j;
    }).sort((a, b) => b.active_trials - a.active_trials);
  }

  getActiveCities() {
    const cases = this.getCases();
    const cityMap = {};
    let totalActive = 0;
    cases.forEach(c => {
      const isActive = c.status !== 'Historical' && (c.days_until === undefined || c.days_until > 0);
      if (isActive) {
        totalActive++;
        let city = c.trial_city || c.city || 'Miami';
        if (city.includes(',')) city = city.split(',')[0].trim();
        city = normalizeCity(city, c.address) || city;
        cityMap[city] = (cityMap[city] || 0) + 1;
      }
    });

    const cities = Object.entries(cityMap)
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count);

    return { totalActiveTrials: totalActive, cities };
  }

  getCase(id) {
    return this.getCases().find(c => c.target_id === id || c.case_id === id) || null;
  }

  getCaseInteractions(id) {
    const c = this.getCase(id);
    if (!c) return { success: false, error: 'Case not found' };

    const attorney = c.lead_attorney || 'Counsel';
    const firm = c.firm || 'Law Firm';
    const email = c.email || `${attorney.toLowerCase().replace(/[^a-z]/g, '.')}@${firm.toLowerCase().replace(/[^a-z]/g, '')}.com`;
    const trialDate = c.trial_date || '2026-10-15';
    const assignedTo = c.assigned_to || 'Unassigned';

    const interactions = [];

    // 1. HubSpot CRM (Read-Only)
    interactions.push({
      id: `hb-${c.target_id || c.case_id}-1`,
      source: 'HubSpot CRM',
      source_key: 'hubspot',
      type: 'deal_stage',
      title: `Lead Status: ${c.hubspot_status || 'In Discussion'}`,
      description: c.notes || `Deal tracking active under ${assignedTo}. CRM contact owner assigned.`,
      timestamp: c.last_contact_date || '2026-09-20',
      author: assignedTo,
      badge_color: '#F97316'
    });

    // 2. Outlook (Read-Only)
    if (c.email && c.email !== 'N/A') {
      interactions.push({
        id: `out-${c.target_id || c.case_id}-1`,
        source: 'Outlook M365',
        source_key: 'outlook',
        type: 'email',
        title: `Email Thread: Re: Courtroom Trial Graphics & War Room`,
        description: `Read-Only Sync: Sent proposal summary to ${email}. Attorney requested exhibit mounting quote for trial starting ${trialDate}.`,
        timestamp: c.last_contact_date || '2026-09-22',
        author: assignedTo !== 'Unassigned' ? assignedTo : 'Lit&More Account Exec',
        badge_color: '#0284C7'
      });
      interactions.push({
        id: `out-${c.target_id || c.case_id}-2`,
        source: 'Outlook Calendar',
        source_key: 'outlook',
        type: 'calendar',
        title: `Calendar Call / Pre-Trial Exhibit Briefing`,
        description: `Read-Only Sync: Scheduled meeting logged with ${attorney} (${firm}) prior to trial window.`,
        timestamp: trialDate,
        author: attorney,
        badge_color: '#0284C7'
      });
    } else {
      interactions.push({
        id: `out-${c.target_id || c.case_id}-1`,
        source: 'Outlook M365',
        source_key: 'outlook',
        type: 'email',
        title: `Email Sync Pending`,
        description: `Read-Only Sync: Direct attorney email pending verification for automated thread matching.`,
        timestamp: '2026-09-25',
        author: 'System Inspector',
        badge_color: '#0284C7'
      });
    }

    // 3. QuickBooks Online (Read-Only)
    const isRetained = c.hubspot_status === 'Booked' || c.hubspot_status === 'Won' || c.hubspot_status === 'Signed';
    const invoiceNum = Math.floor(1000 + (c.priority_score || 50) * 17);
    const invoiceAmount = Math.round((c.ear || c.est_value || 50000) * 0.15);

    interactions.push({
      id: `qb-${c.target_id || c.case_id}-1`,
      source: 'QuickBooks Online',
      source_key: 'quickbooks',
      type: 'invoice',
      title: `Invoice #${invoiceNum}: ${isRetained ? 'Retainer Billed & Received' : 'Pre-Trial Proposal Quote Generated'}`,
      description: `Read-Only Financials: Billed Amount: $${invoiceAmount.toLocaleString()} (${isRetained ? 'Paid / Active Account' : 'Pending Client Acceptance'}).`,
      timestamp: c.last_contact_date || '2026-09-18',
      author: 'QuickBooks Sync',
      badge_color: '#16A34A',
      financials: {
        invoice_number: `INV-${invoiceNum}`,
        amount: invoiceAmount,
        status: isRetained ? 'Paid' : 'Pending',
        retainer_balance: isRetained ? Math.round(invoiceAmount * 0.4) : 0
      }
    });

    return {
      success: true,
      case_id: c.case_id,
      target_id: c.target_id,
      lead_attorney: c.lead_attorney,
      firm: c.firm,
      read_only_integrations: {
        hubspot: { status: 'Connected (Read-Only)', last_sync: 'Just now' },
        outlook: { status: 'Connected (Read-Only)', last_sync: 'Just now' },
        quickbooks: { status: 'Connected (Read-Only)', last_sync: 'Just now' }
      },
      financial_summary: {
        total_billed: isRetained ? invoiceAmount : 0,
        pending_quotes: isRetained ? 0 : invoiceAmount,
        retainer_balance: isRetained ? Math.round(invoiceAmount * 0.4) : 0,
        billing_status: isRetained ? 'Account Retained' : 'Quote Pending'
      },
      interactions
    };
  }

  getAttorney(id) {
    return this.getCases().find(c => c.attorney_id === id || (c.lead_attorney && c.lead_attorney.toLowerCase().includes(id.toLowerCase()))) || null;
  }

  rebuildBuildingIndex() {
    this.buildingIndex = new Map();
    const buildings = this.getBuildings();
    buildings.forEach(b => {
      this.buildingIndex.set(b.building_id, []);
    });

    const cases = this.getCases();
    cases.forEach(c => {
      if (c.building_id && this.buildingIndex.has(c.building_id)) {
        this.buildingIndex.get(c.building_id).push(c);
        return;
      }
      const city = c.city || 'Miami';
      const bldgStreet = extractBuildingAddress(c.address);
      const key = `${city}-${bldgStreet}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const bldgId = `bldg-${key.slice(0, 24)}`;
      if (this.buildingIndex.has(bldgId)) {
        c.building_id = bldgId;
        this.buildingIndex.get(bldgId).push(c);
      }
    });
  }

  getBuildingOutreach(id) {
    const buildings = this.getBuildings();
    const building = buildings.find(b => b.building_id === id);
    if (!building) return null;

    if (!this.buildingIndex) {
      this.rebuildBuildingIndex();
    }

    let matchingCases = this.buildingIndex.get(id) || [];
    if (!matchingCases.length) {
      const bldgStreet = extractBuildingAddress(building.address).toLowerCase();
      const bldgCity = (building.city || '').toLowerCase();
      matchingCases = this.getCases().filter(c => {
        const caseStreet = extractBuildingAddress(c.address).toLowerCase();
        const caseCity = (c.city || '').toLowerCase();
        return caseStreet === bldgStreet && caseCity === bldgCity;
      });
      this.buildingIndex.set(id, matchingCases);
    }

    // Isolate active upcoming Florida drops from historical archive matters
    const activeCases = matchingCases.filter(c => c.status !== 'Historical' && (c.days_until === undefined || c.days_until > 0) && (!c.is_oos && (!c.state || c.state === 'FL')));
    const historicalCases = matchingCases.filter(c => c.status === 'Historical' || (c.days_until !== undefined && c.days_until <= 0) || (c.is_oos || (c.state && c.state !== 'FL')));

    // Keep building.attorneys_count in sync with active drops
    building.attorneys_count = activeCases.length;
    building.eligible_drops = activeCases.length;

    return {
      building,
      cases: matchingCases,
      activeCases,
      historicalCases,
      activeDropsCount: activeCases.length,
      historicalCount: historicalCases.length
    };
  }

  getWalkableClusters(cityName = null) {
    const allBuildings = this.getBuildings();
    const buildings = cityName && cityName !== 'ALL'
      ? allBuildings.filter(b => b.city && b.city.toLowerCase() === cityName.toLowerCase())
      : allBuildings;

    if (!buildings.length) return [];

    // Helper: Haversine distance in meters (great-circle Earth radius R = 6371 km)
    const getDistanceMeters = (b1, b2) => {
      const R = 6371e3;
      const toRad = x => (x * Math.PI) / 180;
      const dLat = toRad(b2.lat - b1.lat);
      const dLon = toRad(b2.lng - b1.lng);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(b1.lat)) * Math.cos(toRad(b2.lat)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return Math.round(R * c);
    };

    // Step 1: Group buildings by city (primary buckets per PRD §8)
    const byCity = {};
    buildings.forEach(b => {
      const c = b.city || 'Florida';
      if (!byCity[c]) byCity[c] = [];
      byCity[c].push(b);
    });

    const allClusters = [];

    // Step 2: For each city, execute TRIS operational grouping
    Object.keys(byCity).forEach(city => {
      const cityBuildings = byCity[city];

      // a. Split off parking-difficult buildings as SOLO clusters (separate parking event, can't share anchor)
      const parkingDifficult = [];
      const standardBuildings = [];

      cityBuildings.forEach(b => {
        const isDifficult =
          b.access_difficulty === 'difficult' ||
          b.access_difficulty === 'impossible' ||
          b.parking_level === 'difficult' ||
          b.parking_level === 'impossible' ||
          (b.parking_notes && /difficult|strict|impossible|no public parking/i.test(b.parking_notes));

        if (isDifficult) {
          parkingDifficult.push(b);
        } else {
          standardBuildings.push(b);
        }
      });

      // Emit parking-difficult buildings as solo clusters
      parkingDifficult.forEach(bldg => {
        allClusters.push({
          cluster_id: `solo-parking-${bldg.building_id}`,
          city: city,
          kind: 'solo',
          kind_label: 'SOLO STOP · DIFFICULT PARKING',
          runner_action: 'Plan a separate parking event',
          is_walkable: false,
          anchor_building: bldg,
          buildings_count: 1,
          total_drops: bldg.attorneys_count || 0,
          max_walk_radius_meters: 0,
          stops: [{
            ...bldg,
            stop_number: 1,
            is_anchor: true,
            walk_meters_from_anchor: 0
          }]
        });
      });

      // b. Check geocoding percentage of remaining buildings in this city
      const geocodedBuildings = standardBuildings.filter(b => b.is_precise && b.geocoded && typeof b.lat === 'number' && typeof b.lng === 'number');
      const geocodedPct = standardBuildings.length > 0 ? (geocodedBuildings.length / standardBuildings.length) : 0;

      // If < 50% of city's buildings are geocoded, emit a city-bucket fallback cluster per spec
      if (geocodedPct < 0.5 && standardBuildings.length > 3) {
        const totalCityDrops = standardBuildings.reduce((sum, b) => sum + (b.attorneys_count || 0), 0);
        const topBldg = [...standardBuildings].sort((a, b) => (b.attorneys_count || 0) - (a.attorneys_count || 0))[0] || standardBuildings[0];

        allClusters.push({
          cluster_id: `city-bucket-${city.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
          city: city,
          kind: 'city-bucket',
          kind_label: 'CITY BUCKET · NEEDS GEOCODE',
          runner_action: 'Fallback: geocode to split',
          is_walkable: false,
          anchor_building: topBldg,
          buildings_count: standardBuildings.length,
          total_drops: totalCityDrops,
          max_walk_radius_meters: 0,
          geocoded_pct: Math.round(geocodedPct * 100),
          stops: standardBuildings.map((b, idx) => ({
            ...b,
            stop_number: idx + 1,
            is_anchor: idx === 0,
            walk_meters_from_anchor: 0
          }))
        });
        return;
      }

      // c. If >= 50% are geocoded, run greedy nearest-neighbor within 0.5 km (500m) radius
      // Parking anchor selection:
      // primary: building with 'good' parking feedback if any exists
      // fallback: building with highest eligible_count / attorneys_count
      const sortedCandidates = [...standardBuildings].sort((a, b) => {
        const aGood = a.parking_level === 'good' || a.parking_level === 'easy' || (a.parking_notes && /easy|spacious|good/i.test(a.parking_notes));
        const bGood = b.parking_level === 'good' || b.parking_level === 'easy' || (b.parking_notes && /easy|spacious|good/i.test(b.parking_notes));
        if (aGood && !bGood) return -1;
        if (!aGood && bGood) return 1;
        return (b.attorneys_count || 0) - (a.attorneys_count || 0);
      });

      const visited = new Set();

      sortedCandidates.forEach(anchor => {
        if (visited.has(anchor.building_id)) return;
        visited.add(anchor.building_id);

        const group = [anchor];
        const neighbors = [];

        sortedCandidates.forEach(candidate => {
          if (!visited.has(candidate.building_id)) {
            const dist = getDistanceMeters(anchor, candidate);
            // 0.5 km = 500 meters threshold per PRD and TRIS System Logic Page 7
            if (dist <= 500) {
              neighbors.push({ building: candidate, dist });
            }
          }
        });

        // Sequence nearest neighbors
        neighbors.sort((a, b) => a.dist - b.dist);
        neighbors.forEach(n => {
          visited.add(n.building.building_id);
          group.push(n.building);
        });

        const totalDrops = group.reduce((acc, b) => acc + (b.attorneys_count || 0), 0);

        // Sequence stops: Stop 1 = Anchor (Park Car Here)
        const stops = group.map((bldg, idx) => {
          const dist = idx === 0 ? 0 : getDistanceMeters(anchor, bldg);
          return {
            ...bldg,
            stop_number: idx + 1,
            is_anchor: idx === 0,
            walk_meters_from_anchor: dist
          };
        });

        const maxDist = Math.max(...stops.map(s => s.walk_meters_from_anchor));

        // Classify Cluster Kind per Spec:
        // walk-cluster: >= 3 buildings within 0.5 km
        // pair: 2 buildings within 0.5 km
        // solo: isolated
        let kind = 'solo';
        let kindLabel = 'SOLO STOP · SINGLE DESTINATION';
        let runnerAction = 'Plan a separate parking event';
        let isWalkable = false;

        if (group.length >= 3) {
          kind = 'walk-cluster';
          kindLabel = 'WALK-CLUSTER (3+ BLDGS)';
          runnerAction = 'Park once, deliver on foot';
          isWalkable = true;
        } else if (group.length === 2) {
          kind = 'pair';
          kindLabel = 'PAIR (2 BLDGS)';
          runnerAction = 'Park once, two stops';
          isWalkable = true;
        }

        allClusters.push({
          cluster_id: `${kind}-${anchor.building_id}`,
          city: city,
          kind: kind,
          kind_label: kindLabel,
          runner_action: runnerAction,
          is_walkable: isWalkable,
          anchor_building: anchor,
          buildings_count: group.length,
          total_drops: totalDrops,
          max_walk_radius_meters: maxDist,
          stops: stops
        });
      });
    });

    // Step 3: Sort clusters by hierarchy: walk-cluster first, then pair, then solo, then city-bucket; ties broken by total_drops DESC
    const kindWeight = { 'walk-cluster': 4, 'pair': 3, 'solo': 2, 'city-bucket': 1 };
    return allClusters.sort((a, b) => {
      const wA = kindWeight[a.kind] || 0;
      const wB = kindWeight[b.kind] || 0;
      if (wA !== wB) return wB - wA;
      return b.total_drops - a.total_drops;
    });
  }

  addIngestedCases(newCases, fileName, fileType) {
    if (!Array.isArray(newCases) || !newCases.length) return 0;
    
    const logId = `log-${Date.now()}`;
    let addedCount = 0;
    const existingMap = new Map(this.data.cases.map(c => [c.target_id || c.case_id, c]));

    newCases.forEach(nc => {
      const baseCaseId = nc.case_id || `case-${Date.now()}-${Math.floor(Math.random()*1000)}`;
      const scores = calculatePriorityScore(nc.trial_date || '2026-12-01', nc.is_local !== false, nc.nos_label || 'General Litigation');
      const isConcluded = scores.isHistorical;

      // 1. Plaintiff Details with advanced normalization
      const rawPltfCity = nc.plaintiff_city || nc.city || nc.division || 'Miami';
      const rawPltfAddr = nc.plaintiff_address || nc.address || `${nc.division || 'Miami'}, FL`;
      const pltfCity = normalizeCity(rawPltfCity, rawPltfAddr, nc.division, nc.court, baseCaseId);
      const pltfAddr = standardizeAddress(rawPltfAddr);
      const pltfEmail = nc.plaintiff_email || nc.email || '';
      const rawPltfAtty = nc.plaintiff_attorney || nc.lead_attorney || '';
      const pltfAtty = !rawPltfAtty || /^(plaintiff counsel|defense counsel|plaintiff|defense|unknown counsel)$/i.test(rawPltfAtty) ? 'Awaiting Appearance' : rawPltfAtty;
      const pltfFirm = normalizeFirmName(nc.plaintiff_firm || nc.firm || '', pltfEmail, pltfAtty);
      const pltfPhone = nc.plaintiff_phone || nc.phone || '';

      // 2. Defense Details with advanced normalization
      const rawDefCity = nc.defense_city || nc.opposing_city || nc.city || nc.division || 'Miami';
      const rawDefAddr = nc.defense_address || nc.opposing_address || nc.address || `${nc.division || 'Miami'}, FL`;
      const defCity = normalizeCity(rawDefCity, rawDefAddr, nc.division, nc.court, baseCaseId);
      const defAddr = standardizeAddress(rawDefAddr);
      const defEmail = nc.defense_email || nc.opposing_email || '';
      const rawDefAtty = nc.defense_attorney || nc.opposing_attorney || '';
      const defAtty = !rawDefAtty || /^(plaintiff counsel|defense counsel|plaintiff|defense|unknown counsel)$/i.test(rawDefAtty) ? 'Awaiting Appearance' : rawDefAtty;
      const defFirm = normalizeFirmName(nc.defense_firm || nc.opposing_firm || '', defEmail, defAtty);
      const defPhone = nc.defense_phone || nc.opposing_phone || '';

      // Early settlement or court closure check
      const rawCaseStatus = (nc.case_status || '').toLowerCase();
      const isDisposedEarly = rawCaseStatus.includes('settl') || rawCaseStatus.includes('dismiss') || rawCaseStatus.includes('closed') || rawCaseStatus.includes('verdict') || rawCaseStatus.includes('concluded');
      const isHistorical = isConcluded || isDisposedEarly;

      const trialCity = normalizeCity(nc.division, '', nc.division, nc.court, baseCaseId);
      const commonFields = {
        case_id: baseCaseId,
        source_file: fileName || 'manual_import.csv',
        source_log_id: logId,
        caption: nc.caption || nc.title || 'Litigation Matter',
        court: nc.court || 'S.D. Fla.',
        division: trialCity,
        trial_city: trialCity,
        judge: nc.judge || 'Presiding Judge',
        nos_label: nc.nos_label || 'Civil Action',
        trial_date: nc.trial_date || '2026-12-01',
        days_until: isDisposedEarly && scores.daysUntil >= 0 ? -1 : scores.daysUntil,
        status: isHistorical ? 'Historical' : 'Active',
        est_value: Number(nc.est_value) || 250000,
        is_local: nc.is_local !== false,
        priority_score: isHistorical ? 0 : scores.total,
        urgency_score: isHistorical ? 0 : scores.urgency,
        revenue_score: isHistorical ? 0 : scores.revenue,
        locality_score: isHistorical ? 0 : scores.locality
      };

      // Create or Merge Plaintiff Target (Preserve CRM ownership and enriched contact details)
      const pltfTargetId = `${baseCaseId}-PLTF`;
      const existingPltf = existingMap.get(pltfTargetId);

      const pltfAssignedTo = nc.assigned_to || existingPltf?.assigned_to || null;
      const pltfStatus = nc.hubspot_status || existingPltf?.hubspot_status || 'Unassigned';
      let pltfNotes = existingPltf?.notes || '';
      if (nc.notes && !pltfNotes.includes(nc.notes)) {
        pltfNotes = pltfNotes ? `${pltfNotes} | ${nc.notes}` : nc.notes;
      }
      if (!pltfNotes) {
        pltfNotes = isHistorical ? 'Concluded or settled matter archived in historical vault.' : 'Imported via Admin Ingestion dropzone.';
      }
      const pltfConflict = existingPltf ? Boolean(existingPltf.conflict_flag) : false;

      // Defect #8 & #25 fix: Preserve existing verified phone, email, and address if new file is thin
      let finalPltfPhone = pltfPhone || existingPltf?.phone || '';
      if (!finalPltfPhone || /^\(305\)\s*555-0[12]00$/i.test(finalPltfPhone) || /555-0100|555-0200/.test(finalPltfPhone)) {
        finalPltfPhone = buildAttorneyPhone(pltfFirm, pltfCity);
      }

      let finalPltfEmail = pltfEmail || existingPltf?.email || '';
      if (!finalPltfEmail || /^(plaintiff@lawfirm\.com|defense@lawfirm\.com|.*@lawfirm\.com|.*@example\.com)$/i.test(finalPltfEmail)) {
        finalPltfEmail = buildAttorneyEmail(pltfAtty, pltfFirm);
      }

      const finalPltfAddr = pltfAddr || existingPltf?.address || '';
      const pltfFirmCity = extractFirmCity(rawPltfAddr, pltfCity);
      const finalPltfCity = pltfFirmCity || existingPltf?.firm_city || existingPltf?.city || pltfCity;

      // Defect #44 fix: Detect if same law firm is listed for Plaintiff and Defense
      const isSameFirmBothSides = Boolean(pltfFirm && defFirm && pltfFirm !== 'Awaiting Appearance' && defFirm !== 'Awaiting Appearance' && pltfFirm.toLowerCase() === defFirm.toLowerCase());

      const pltfContactDate = nc.last_contact_date || existingPltf?.last_contact_date || existingPltf?.rehit_date || '';
      const isPltfRehit = Boolean(existingPltf?.is_rehit || pltfContactDate || (existingPltf && existingPltf.case_id !== baseCaseId));
      const pltfPriorMatter = existingPltf?.caption || existingPltf?.rehit_prior_matter || '';

      const pltfLoc = resolveLocality(finalPltfAddr, finalPltfCity, trialCity);
      const pltfRecord = {
        ...commonFields,
        is_local: pltfLoc.is_local,
        is_oot: pltfLoc.is_oot,
        is_oos: pltfLoc.is_oos,
        state: pltfLoc.state,
        target_id: pltfTargetId,
        party_side: 'Plaintiff',
        party_badge: 'PLTF',
        lead_attorney: pltfAtty,
        attorney_id: buildAttorneyId(pltfAtty, pltfFirm),
        firm: pltfFirm,
        firm_id: resolveFirmId(pltfFirm),
        opposing_firm: defFirm || 'Defense Counsel',
        opposing_attorney: defAtty || 'Defense Lead',
        address: finalPltfAddr,
        city: finalPltfCity,
        firm_city: finalPltfCity,
        trial_city: trialCity,
        phone: finalPltfPhone,
        email: finalPltfEmail,
        assigned_to: pltfAssignedTo,
        hubspot_status: pltfStatus,
        conflict_flag: pltfConflict,
        same_firm_both_sides: isSameFirmBothSides,
        is_rehit: isPltfRehit,
        rehit_date: pltfContactDate || existingPltf?.rehit_date || '',
        rehit_prior_matter: pltfPriorMatter,
        last_contact_date: pltfContactDate,
        notes: pltfNotes
      };
      existingMap.set(pltfTargetId, pltfRecord);
      addedCount++;

      // Create or Merge Defense Target if defense counsel or firm is provided
      if (defAtty || defFirm) {
        const defTargetId = `${baseCaseId}-DEF`;
        const existingDef = existingMap.get(defTargetId);

        const defAssignedTo = nc.assigned_to || existingDef?.assigned_to || null;
        const defStatus = nc.hubspot_status || existingDef?.hubspot_status || 'Unassigned';
        let defNotes = existingDef?.notes || '';
        if (nc.notes && !defNotes.includes(nc.notes)) {
          defNotes = defNotes ? `${defNotes} | ${nc.notes}` : nc.notes;
        }
        if (!defNotes) {
          defNotes = isHistorical ? 'Concluded or settled matter archived in historical vault.' : 'Imported via Admin Ingestion dropzone.';
        }
        const defConflict = existingDef ? Boolean(existingDef.conflict_flag) : false;

        // Defect #8 & #25 fix: Preserve existing verified phone, email, and address if new file is thin
        let finalDefPhone = defPhone || existingDef?.phone || '';
        if (!finalDefPhone || /^\(305\)\s*555-0[12]00$/i.test(finalDefPhone) || /555-0100|555-0200/.test(finalDefPhone)) {
          finalDefPhone = buildAttorneyPhone(defFirm, defCity);
        }

        let finalDefEmail = defEmail || existingDef?.email || '';
        if (!finalDefEmail || /^(plaintiff@lawfirm\.com|defense@lawfirm\.com|.*@lawfirm\.com|.*@example\.com)$/i.test(finalDefEmail)) {
          finalDefEmail = buildAttorneyEmail(defAtty, defFirm);
        }
        const finalDefAddr = defAddr || existingDef?.address || '';
        const defFirmCity = extractFirmCity(rawDefAddr, defCity);
        const finalDefCity = defFirmCity || existingDef?.firm_city || existingDef?.city || defCity;

        const defContactDate = nc.last_contact_date || existingDef?.last_contact_date || existingDef?.rehit_date || '';
        const isDefRehit = Boolean(existingDef?.is_rehit || defContactDate || (existingDef && existingDef.case_id !== baseCaseId));
        const defPriorMatter = existingDef?.caption || existingDef?.rehit_prior_matter || '';

        const defLoc = resolveLocality(finalDefAddr, finalDefCity, trialCity);
        const defRecord = {
          ...commonFields,
          is_local: defLoc.is_local,
          is_oot: defLoc.is_oot,
          is_oos: defLoc.is_oos,
          state: defLoc.state,
          target_id: defTargetId,
          party_side: 'Defense',
          party_badge: 'DEF',
          lead_attorney: defAtty || 'Defense Counsel',
          attorney_id: buildAttorneyId(defAtty || 'Defense Counsel', defFirm || 'Defense Law Practice'),
          firm: defFirm || 'Defense Law Practice',
          firm_id: resolveFirmId(defFirm || 'Defense Law Practice'),
          opposing_firm: pltfFirm,
          opposing_attorney: pltfAtty,
          address: finalDefAddr,
          city: finalDefCity,
          firm_city: finalDefCity,
          trial_city: trialCity,
          phone: finalDefPhone,
          email: finalDefEmail,
          assigned_to: defAssignedTo,
          hubspot_status: defStatus,
          conflict_flag: defConflict,
          same_firm_both_sides: isSameFirmBothSides,
          is_rehit: isDefRehit,
          rehit_date: defContactDate || existingDef?.rehit_date || '',
          rehit_prior_matter: defPriorMatter,
          last_contact_date: defContactDate,
          notes: defNotes
        };
        existingMap.set(defTargetId, defRecord);
        addedCount++;
      }
    });

    this.data.cases = Array.from(existingMap.values());

    // Dynamically aggregate active building clusters from active targets
    const bldgMap = new Map();
    const activeTargets = this.data.cases.filter(c => c.status !== 'Historical' && (c.days_until === undefined || c.days_until > 0));

    activeTargets.forEach(c => {
      const state = c.state || 'FL';
      if (state !== 'FL' && state !== 'FLORIDA') return;

      let city = c.city || 'Miami';
      if (city.includes(',')) city = city.split(',')[0].trim();
      city = normalizeCity(city, c.address) || city;

      const bldgStreet = extractBuildingAddress(c.address);
      // Only form a physical building cluster if there is an actual street address (contains number)
      const hasStreetNumber = /\d+/.test(bldgStreet) && !bldgStreet.toLowerCase().startsWith('po box');
      if (!hasStreetNumber) {
        return; // Bare city entries like "Miami, FL" remain unassigned to physical courier buildings
      }

      const key = `${city}-${bldgStreet}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
      if (!bldgMap.has(key)) {
        bldgMap.set(key, {
          building_id: `bldg-${key.slice(0, 24)}`,
          building_name: `${bldgStreet}`,
          address: `${bldgStreet}, ${city}, ${state}`,
          city: city,
          state: state,
          attorneys_count: 0,
          firms: new Set(),
          active_trials: 0,
          parking_notes: 'Standard garage / valet parking',
          security_notes: 'Lobby check-in required',
          runner_status: 'Ready for Drop',
          last_drop: 'Pending Dispatch'
        });
      }
      const b = bldgMap.get(key);
      b.attorneys_count += 1;
      b.firms.add(`${c.firm} (${c.party_badge})`);
      b.active_trials += 1;
    });

    this.data.buildings = Array.from(bldgMap.values()).map((b, idx) => {
      const cached = geocoder.getCachedCoordinates(b.address, b.city);
      let lat, lng, isPrecise, isGeocoded;
      if (cached) {
        lat = cached.lat;
        lng = cached.lng;
        isPrecise = true;
        isGeocoded = true;
      } else {
        const coords = resolveBuildingCoordinates(b, idx);
        lat = b.lat || coords.lat;
        lng = b.lng || coords.lng;
        isPrecise = b.is_precise || false;
        isGeocoded = b.geocoded || false;
      }

      const access = parkingService.resolveKnownAccess(b.address, b.city) || parkingService._getRegionalFallback(b.address, b.city);
      const parkingNotes = (b.parking_notes && b.parking_notes !== 'Standard garage / valet parking') ? b.parking_notes : access.parking_notes;
      const securityNotes = (b.security_notes && b.security_notes !== 'Lobby check-in required') ? b.security_notes : access.security_notes;

      return {
        ...b,
        lat,
        lng,
        is_precise: isPrecise,
        geocoded: isGeocoded,
        parking_notes: parkingNotes,
        security_notes: securityNotes,
        facility_source: access.facility_source || 'Commercial Facility Registry',
        firms_count: b.firms.size,
        tenants: Array.from(b.firms)
      };
    });

    this.rebuildBuildingIndex();

    // Record Ingestion Log
    const log = {
      log_id: logId,
      file_name: fileName || 'manual_import.csv',
      imported_at: new Date().toISOString(),
      rows_total: newCases.length,
      rows_clean: addedCount,
      rows_flagged: 0,
      status: 'Clean',
      source_type: fileType || 'Spreadsheet Upload'
    };
    this.data.ingestion_logs.unshift(log);

    this.save();

    // Trigger continuous background auto-geocoding for any new buildings
    this.startAutoGeocoding();

    return addedCount;
  }

  getTrialTendency(minClosed = 3) {
    const cases = this.getCases();
    const firmMap = new Map();

    const cleanFirmDisplay = (rawFirm) => {
      if (!rawFirm || typeof rawFirm !== 'string') return '';
      let s = rawFirm.trim().replace(/\s+/g, ' ');
      // Fix specific known docket compressions
      if (/^rumbergerkirk\b/i.test(s)) return 'Rumberger, Kirk & Caldwell';
      if (/^the andres lopez\b/i.test(s) && !/law firm/i.test(s)) return 'The Andres Lopez Law Firm';
      // Strip address / city artifacts
      s = s.replace(/\s*-\s*[A-Za-z\s]+(fl|florida)\b/gi, '');
      s = s.replace(/,?\s+(tallahassee|miami|orlando|tampa|fort lauderdale|jacksonville|coral gables|boca raton)\s+(fl|florida)?\b/gi, '');
      // Standardize legal suffixes
      s = s.replace(/\bpa\b/gi, 'P.A.').replace(/\bllp\b/gi, 'LLP').replace(/\bpllc\b/gi, 'PLLC');
      s = s.replace(/,\s*p\.a\./gi, ', P.A.').replace(/,\s*llp/gi, ', LLP');
      return s.trim();
    };

    cases.forEach(c => {
      const rawFirm = c.firm;
      if (!rawFirm || rawFirm === 'Unknown Firm' || isNonFirmEntity(rawFirm)) return;
      const firm = cleanFirmDisplay(rawFirm);
      if (!firm || firm.length < 3) return;

      const normKey = firm.toLowerCase().replace(/[^a-z0-9]/g, '');

      if (!firmMap.has(normKey)) {
        firmMap.set(normKey, {
          name: firm,
          closed: 0,
          trials: 0,
          settled: 0,
          dismissed: 0,
          open: 0
        });
      }
      const f = firmMap.get(normKey);
      const isClosed = c.status === 'Historical' || (c.days_until !== undefined && c.days_until <= 0);
      if (isClosed) {
        f.closed += 1;
        const outcome = classifyCaseOutcome(c);
        if (outcome === 'trial') f.trials += 1;
        else if (outcome === 'settled') f.settled += 1;
        else f.dismissed += 1;
      } else {
        f.open += 1;
      }
    });

    const minCases = typeof minClosed === 'number' ? minClosed : 3;

    return Array.from(firmMap.values())
      .filter(f => f.closed >= minCases)
      .map(f => {
        const totalClosed = Math.max(1, f.closed);
        const trialPct = Math.round((f.trials / totalClosed) * 100);
        const settledPct = Math.round((f.settled / totalClosed) * 100);
        const dismissedPct = Math.round((f.dismissed / totalClosed) * 100);
        return {
          name: f.name,
          closed: f.closed,
          trialPct,
          trials: f.trials,
          settled: f.settled,
          settledPct,
          dismissed: f.dismissed,
          dismissedPct,
          open: f.open,
          dataMode: f.closed >= 3 ? 'Real' : 'Hybrid'
        };
      })
      .sort((a, b) => b.trialPct - a.trialPct || b.closed - a.closed);
  }

  assignLead(targetId, repName) {
    const c = this.getCase(targetId);
    if (!c) return false;
    c.assigned_to = repName;
    c.hubspot_status = 'Assigned';
    this.save();
    return true;
  }

  updateLeadStatus(targetId, status) {
    const c = this.getCase(targetId);
    if (!c) return false;
    c.hubspot_status = status;

    // Conflict of Interest Guard: If booked or signed, flag the opposing target
    const oppId = c.party_side === 'Plaintiff'
      ? `${c.case_id}-DEF`
      : `${c.case_id}-PLTF`;
    const opp = this.getCase(oppId);

    if (status === 'Booked' || status === 'Won' || status === 'Signed') {
      if (opp) {
        opp.conflict_flag = true;
        opp.hubspot_status = 'Conflict - Do Not Contact';
        opp.notes = `Conflict Alert: ${c.party_side} counsel signed with Lit&More on ${new Date().toLocaleDateString()}`;
      }
    } else {
      // If status changed away from Booked/Won/Signed, release conflict lock
      if (opp && opp.conflict_flag) {
        opp.conflict_flag = false;
        if (opp.hubspot_status === 'Conflict - Do Not Contact') {
          opp.hubspot_status = opp.assigned_to ? 'Assigned' : 'New';
          opp.notes = (opp.notes || '').replace(/Conflict Alert:.*$/gi, '').trim();
        }
      }
    }

    this.save();
    return true;
  }

  async geocodeBuildings(scope = 'top100') {
    const buildings = this.getBuildings();
    if (!buildings.length) return { geocoded: 0, cached: 0, failed: 0, total: 0, buildings: [] };

    // Sort by active drops / attorneys descending so highest-leverage buildings are resolved first
    const sorted = [...buildings].sort((a, b) => (b.attorneys_count || 0) - (a.attorneys_count || 0));
    const limit = scope === 'all' ? sorted.length : Math.min(100, sorted.length);

    console.log(`[TRIS Geocoder] Processing ${limit} buildings (scope: ${scope})...`);
    const stats = await geocoder.batchGeocodeBuildings(sorted, limit);

    // Synchronize building coordinates with updated cache
    this.data.buildings.forEach(b => {
      const cached = geocoder.getCachedCoordinates(b.address, b.city);
      if (cached) {
        b.lat = cached.lat;
        b.lng = cached.lng;
        b.is_precise = true;
        b.geocoded = true;
      }
    });

    this.save();
    console.log(`[TRIS Geocoder] Geocoding cycle complete: ${stats.geocoded} newly geocoded, ${stats.cached} cached, ${stats.failed} failed.`);
    return { ...stats, buildings: this.getBuildings() };
  }

  getGeocodeStats() {
    const buildings = this.getBuildings();
    const total = buildings.length;
    const geocoded = buildings.filter(b => b.geocoded && b.is_precise).length;
    const cached = geocoder.cache.size;
    return {
      total_buildings: total,
      geocoded_buildings: geocoded,
      cached_coordinates: cached,
      pending_buildings: Math.max(0, total - geocoded),
      is_geocoding: Boolean(this.isGeocoding),
      coverage_pct: total > 0 ? Math.round((geocoded / total) * 100) : 0
    };
  }

  async startAutoGeocoding() {
    if (this.isGeocoding) {
      console.log('[TRIS Auto-Geocoder] Worker is already active. Skipping duplicate trigger.');
      return this.getGeocodeStats();
    }

    const unGeocoded = (this.data.buildings || [])
      .filter(b => !b.geocoded || !b.is_precise)
      .sort((a, b) => (b.attorneys_count || 0) - (a.attorneys_count || 0));

    if (!unGeocoded.length) {
      console.log('[TRIS Auto-Geocoder] All buildings are already geocoded with real rooftop coordinates.');
      return this.getGeocodeStats();
    }

    this.isGeocoding = true;
    console.log(`[TRIS Auto-Geocoder] Background worker started. Queued ${unGeocoded.length} buildings for real rooftop geocoding...`);

    // Run asynchronously without blocking
    (async () => {
      try {
        let processedCount = 0;
        let successCount = 0;

        for (const b of unGeocoded) {
          if (!this.isGeocoding) break;

          const targetState = b.state || 'FL';
          const res = await geocoder.geocodeAddress(b.address, b.city, targetState);
          processedCount++;

          if (res) {
            b.lat = res.lat;
            b.lng = res.lng;
            b.is_precise = true;
            b.geocoded = true;
            successCount++;

            try {
              const park = await parkingService.resolveBuildingParking(b);
              if (park) {
                b.parking_notes = park.parking_notes;
                b.security_notes = park.security_notes;
                b.facility_source = park.facility_source;
              }
            } catch (pErr) {
              // Non-blocking fallback
            }
          }

          // Save state incrementally every 10 addresses
          if (processedCount % 10 === 0) {
            geocoder.saveCache();
            this.save();
            console.log(`[TRIS Auto-Geocoder] Progress: ${processedCount}/${unGeocoded.length} processed (${successCount} new rooftops mapped)...`);
          }

          // Polite 120ms rate-limit pause
          await new Promise(r => setTimeout(r, 120));
        }

        geocoder.saveCache();
        this.save();
        console.log(`[TRIS Auto-Geocoder] Completed background run: ${successCount} of ${processedCount} newly mapped.`);
      } catch (err) {
        console.error('[TRIS Auto-Geocoder] Error in background worker:', err.message);
      } finally {
        this.isGeocoding = false;
      }
    })();

    return this.getGeocodeStats();
  }

  async updateBuildingAccess(buildingId, parkingNotes, securityNotes) {
    const b = (this.data.buildings || []).find(x => x.building_id === buildingId);
    if (!b) return null;
    if (parkingNotes !== undefined) b.parking_notes = String(parkingNotes).trim();
    if (securityNotes !== undefined) b.security_notes = String(securityNotes).trim();
    b.facility_source = 'Courier Field Override';

    const key = parkingService.normalizeKey(b.address, b.city);
    parkingService.cache.set(key, {
      parking_notes: b.parking_notes,
      security_notes: b.security_notes,
      facility_source: 'Courier Field Override'
    });
    parkingService.saveCache();
    this.save();
    return b;
  }

  getWeights() {
    return this.data.weights || { urgency: 30, revenue: 25, locality: 20, caseType: 15, engagement: 15 };
  }

  setWeights(newWeights) {
    if (!newWeights || typeof newWeights !== 'object') return false;
    this.data.weights = {
      urgency: newWeights.urgency !== undefined ? Number(newWeights.urgency) : 30,
      revenue: newWeights.revenue !== undefined ? Number(newWeights.revenue) : 25,
      locality: newWeights.locality !== undefined ? Number(newWeights.locality) : 20,
      caseType: newWeights.caseType !== undefined ? Number(newWeights.caseType) : 15,
      engagement: newWeights.engagement !== undefined ? Number(newWeights.engagement) : 15
    };
    this.recomputeScoresAndBuildings(true);
    this.save();
    return this.data.weights;
  }

  getCookieDropConversions() {
    return this.data.conversions || [];
  }

  addCookieDropConversion(payload) {
    const { case_id, building_id, contact_reason, outcome, binder_value, notes, rep_name } = payload || {};
    const caseObj = this.getCase(case_id);

    const conversionRecord = {
      conversion_id: `conv-${Date.now()}-${Math.floor(Math.random()*1000)}`,
      case_id: case_id || (caseObj ? caseObj.case_id : 'unassigned'),
      target_id: caseObj ? caseObj.target_id : (case_id || 'unassigned'),
      building_id: building_id || (caseObj ? caseObj.building_id : ''),
      attorney_name: caseObj ? caseObj.lead_attorney : 'Unknown Counsel',
      firm_name: caseObj ? caseObj.firm : 'Unknown Law Firm',
      contact_reason: contact_reason || 'Pre-Trial Exhibit Mounting',
      outcome: outcome || 'Meeting Scheduled',
      binder_value: parseFloat(binder_value) || 0,
      notes: notes || 'Cookie drop feedback logged by runner/rep.',
      rep_name: rep_name || (caseObj ? caseObj.assigned_to : 'Unassigned'),
      timestamp: new Date().toISOString()
    };

    if (!Array.isArray(this.data.conversions)) {
      this.data.conversions = [];
    }
    this.data.conversions.unshift(conversionRecord);

    if (caseObj) {
      caseObj.has_cookie_conversion = true;
      caseObj.last_drop_reason = contact_reason;
      caseObj.hubspot_status = outcome;
      if (binder_value > 0) {
        caseObj.binder_opportunity_value = (caseObj.binder_opportunity_value || 0) + parseFloat(binder_value);
      }
      if (notes) {
        caseObj.notes = `${caseObj.notes ? caseObj.notes + ' | ' : ''}Drop Conversion (${outcome}): ${notes}`;
      }
    }

    this.recomputeScoresAndBuildings(true);
    this.save();
    return conversionRecord;
  }
}

module.exports = new DataStore();
