const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const XLSX = require('xlsx');
const db = require('./dataStore');
const quickbooksService = require('./quickbooksService');
const hubspotService = require('./hubspotService');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup upload directory for inbound files
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Robust multi-format date parser for incoming Excel and CSV dates
function parseTrialDate(dateVal) {
  if (!dateVal) return null;
  if (typeof dateVal === 'number' || (/^\d{5}$/.test(String(dateVal).trim()) && !String(dateVal).includes('-'))) {
    const serial = Number(dateVal);
    const dt = new Date(Math.round((serial - 25569) * 86400 * 1000));
    if (!isNaN(dt.getTime())) return dt.toISOString().split('T')[0];
  }
  const s = String(dateVal).split('T')[0].trim();
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(s)) {
    const parts = s.split(/[-/]/);
    return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) {
    const parts = s.split('/');
    let y = parts[2];
    if (y.length === 2) y = `20${y}`;
    return `${y}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  }
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(s)) {
    const parts = s.split('-');
    return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  }
  const parsed = new Date(dateVal);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  return null;
}

// Universal record mapper supporting both Plaintiff and Defense counsel
function mapRowToCase(rowObj, idx) {
  // Normalize row keys to lowercase and trim
  const normalized = {};
  Object.keys(rowObj).forEach(k => {
    normalized[k.toLowerCase().trim().replace(/[\s_-]+/g, '')] = String(rowObj[k] || '').trim();
  });

  const getVal = (...keys) => {
    for (const k of keys) {
      const cleanKey = k.toLowerCase().replace(/[\s_-]+/g, '');
      if (normalized[cleanKey] !== undefined && normalized[cleanKey] !== '') {
        return normalized[cleanKey];
      }
    }
    return '';
  };

  const caseId = getVal('caseid', 'docket', 'docketno', 'docketnumber', 'caseno', 'casenumber') || `dkt-${Date.now()}-${idx}`;
  const caption = getVal('caption', 'title', 'casetitle', 'casename', 'style', 'mattername') || 'Litigation Matter';
  const court = getVal('court', 'courthouse', 'jurisdiction') || 'S.D. Fla.';
  const division = getVal('division', 'city', 'branch', 'district') || 'Miami';
  const judge = getVal('judge', 'presidingjudge', 'judgename', 'magistrate') || 'Honorable Judge';
  const nosLabel = getVal('noslabel', 'nos', 'natureofsuit', 'casetype', 'causeofaction') || 'Civil Litigation';
  const rawDate = getVal('trialdate', 'trialsetfor', 'jurytrialdate', 'hearingdate', 'date');
  const trialDate = parseTrialDate(rawDate) || '2026-11-15';
  const rawValue = getVal('estvalue', 'casevalue', 'claimamount', 'amount', 'budget');
  const estValue = parseFloat(rawValue) || 250000;

  // Check if string is a corporate entity or placeholder
  function isCorporateOrPlaceholder(name) {
    if (!name) return true;
    const clean = String(name).trim();
    if (/^(plaintiff|defense|counsel|lead counsel|plaintiff counsel|defense counsel|unknown|unknown counsel|pro se|awaiting appearance|n\/a|none|attorney)$/i.test(clean)) return true;
    if (/\b(llc|inc|corp|co\.|company|ltd|holdings|productions|services|authority|department|association|insurance|bank|school|hospital)\b/i.test(clean)) return true;
    return false;
  }

  // Plaintiff Details
  const rawLeadAtty = getVal('leadattorney', 'attorney', 'counsel', 'plaintiffcounsel', 'plaintiffattorney', 'lawyer', 'attyname');
  const leadAttorney = isCorporateOrPlaceholder(rawLeadAtty) ? '' : rawLeadAtty;
  const rawFirm = getVal('firm', 'lawfirm', 'firmname', 'plaintifffirm', 'company');
  const firm = (/^(plaintiff|defense|unknown)/i.test(rawFirm)) ? '' : rawFirm;
  const rawPhone = getVal('phone', 'telephone', 'tel', 'phonenumber', 'plaintiffphone');
  const phone = /555-0100|555-0200/.test(rawPhone) ? '' : rawPhone;
  const rawEmail = getVal('email', 'emailaddress', 'contactemail', 'plaintiffemail');
  const email = /lawfirm\.com|example\.com/i.test(rawEmail) ? '' : rawEmail;
  const address = getVal('address', 'streetaddress', 'officeaddress', 'location', 'plaintiffaddress');
  const city = getVal('city', 'officecity', 'firmcity', 'plaintiffcity') || division;

  // Defense Details
  const rawOpposingFirm = getVal('opposingfirm', 'defensefirm', 'defendantfirm', 'opposingfirmname');
  const opposingFirm = (/^(plaintiff|defense|unknown)/i.test(rawOpposingFirm)) ? '' : rawOpposingFirm;
  const rawOpposingAtty = getVal('opposingattorney', 'defensecounsel', 'defendantattorney', 'defenselead');
  const opposingAttorney = isCorporateOrPlaceholder(rawOpposingAtty) ? '' : rawOpposingAtty;
  const rawDefPhone = getVal('defensephone', 'opposingphone', 'defphone');
  const defPhone = /555-0100|555-0200/.test(rawDefPhone) ? '' : rawDefPhone;
  const rawDefEmail = getVal('defenseemail', 'opposingemail', 'defemail');
  const defEmail = /lawfirm\.com|example\.com/i.test(rawDefEmail) ? '' : rawDefEmail;
  const defAddress = getVal('defenseaddress', 'opposingaddress', 'defaddress') || address;
  const defCity = getVal('defensecity', 'opposingcity', 'defcity') || city;

  // CRM & HubSpot Ingestion Mapping
  const assignedTo = getVal('assignedto', 'assigned_to', 'contactowner', 'leadowner', 'dealowner', 'owner', 'salesrep', 'rep', 'repname') || '';
  const hubspotStatus = getVal('hubspotstatus', 'hubspot_status', 'leadstatus', 'pipelinestage', 'stage', 'dealstage', 'status', 'crmstatus') || '';
  const notes = getVal('notes', 'note', 'lastactivity', 'activity', 'comments', 'comment', 'recentnote', 'hubspotnotes') || '';
  const caseStatus = getVal('casestatus', 'matterstatus', 'courtstatus', 'actionstatus') || '';
  const outcome = getVal('outcome', 'caseoutcome', 'case_outcome', 'disposition', 'verdict', 'result', 'judgment') || '';
  const rawContactDate = getVal('lastcontactdate', 'lastcontact', 'contactdate', 'contactedat', 'lastvisit', 'visitdate', 'lasttouch', 'activitydate');
  const lastContactDate = parseTrialDate(rawContactDate) || '';
  const rawState = getVal('venuestate', 'courtstate', 'trialstate', 'state', 'jurisdiction');

  return {
    case_id: caseId,
    caption: caption,
    court: court,
    division: division,
    judge: judge,
    nos_label: nosLabel,
    trial_date: trialDate,
    est_value: estValue,
    venue_state: rawState || '',

    // Plaintiff
    plaintiff_attorney: leadAttorney,
    plaintiff_firm: firm,
    plaintiff_phone: phone,
    plaintiff_email: email,
    plaintiff_address: address,
    plaintiff_city: city,

    // Defense
    defense_attorney: opposingAttorney,
    defense_firm: opposingFirm,
    defense_phone: defPhone,
    defense_email: defEmail,
    defense_address: defAddress,
    defense_city: defCity,

    // CRM & Lifecycle Fields
    assigned_to: assignedTo,
    hubspot_status: hubspotStatus,
    notes: notes,
    case_status: caseStatus,
    outcome: outcome || caseStatus,
    last_contact_date: lastContactDate,

    is_local: true
  };
}

// Simple CSV text line parser
function parseCSV(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const headers = lines[0].split(delimiter).map(h => h.replace(/^["']|["']$/g, '').trim());

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const rawValues = lines[i].split(delimiter).map(v => v.replace(/^["']|["']$/g, '').trim());
    if (rawValues.length < 2) continue;

    const rowObj = {};
    headers.forEach((h, idx) => {
      rowObj[h] = rawValues[idx] || '';
    });
    rows.push(mapRowToCase(rowObj, i));
  }
  return rows;
}

// Defect #39 fix: Propagate merged cell values across merged ranges so headers and values are never lost
function fillMergedCells(worksheet) {
  if (!worksheet || !worksheet['!merges']) return;
  worksheet['!merges'].forEach(range => {
    const startCellRef = XLSX.utils.encode_cell(range.s);
    const startCell = worksheet[startCellRef];
    if (!startCell) return;
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        if (R === range.s.r && C === range.s.c) continue;
        const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
        if (!worksheet[cellRef]) {
          worksheet[cellRef] = Object.assign({}, startCell);
        }
      }
    }
  });
}

// Parse Excel XLSX / XLS files
function parseExcel(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetNames = workbook.SheetNames;

  // Check for multi-sheet workbooks with separate Dockets and Attorneys tabs
  const docketsSheetName = sheetNames.find(n => /dockets?/i.test(n));
  const attySheetName = sheetNames.find(n => /attorneys?|counsel/i.test(n));

  if (docketsSheetName && attySheetName) {
    fillMergedCells(workbook.Sheets[docketsSheetName]);
    fillMergedCells(workbook.Sheets[attySheetName]);
    const dockets = XLSX.utils.sheet_to_json(workbook.Sheets[docketsSheetName], { defval: '' });
    const attys = XLSX.utils.sheet_to_json(workbook.Sheets[attySheetName], { defval: '' });

    // Index attorneys by Docket number
    const attyByDocket = new Map();
    attys.forEach(a => {
      const dkt = String(a.Docket || a.docket || a.CaseId || a.case_id || '').trim();
      if (!dkt) return;
      if (!attyByDocket.has(dkt)) attyByDocket.set(dkt, { pltf: [], def: [] });
      const entry = attyByDocket.get(dkt);
      const partyType = String(a['Party Type'] || a.party_type || a.Role || a.party || '').toLowerCase();
      if (partyType.includes('def') || partyType.includes('respondent')) {
        entry.def.push(a);
      } else {
        entry.pltf.push(a);
      }
    });

    function selectBestAttorney(candidates) {
      if (!candidates || !candidates.length) return {};
      // Filter out corporate entities / placeholders
      const humanAttys = candidates.filter(c => {
        const name = String(c['Attorney Name'] || c.attorney || '').trim();
        return name && !isCorporateOrPlaceholder(name);
      });
      if (humanAttys.length > 0) {
        const withContact = humanAttys.find(c => (c['Attorney Email'] || c.email) || (c['Law Firm'] || c.firm));
        return withContact || humanAttys[0];
      }
      return candidates[0] || {};
    }

    const parsedCases = [];
    dockets.forEach((d, idx) => {
      const dkt = String(d.Docket || d.docket || d.CaseId || d.case_id || '').trim();
      if (!dkt) return;

      const attyPair = attyByDocket.get(dkt) || { pltf: [], def: [] };
      const pltfAtty = selectBestAttorney(attyPair.pltf);
      const defAtty = selectBestAttorney(attyPair.def);

      // Extract scheduled trial date from Extracted Deadlines or Date column
      let trialDate = '';
      const deadlines = String(d['Extracted Deadlines'] || d.Deadlines || d.deadlines || '');
      const juryMatch = deadlines.match(/(?:Jury\s+Trial|Trial|Calendar\s+Call)\s+set\s+for\s+(\d{1,2}\/\d{1,2}\/\d{4})/i) || deadlines.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
      if (juryMatch) {
        const parts = juryMatch[1].split('/');
        trialDate = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
      } else if (d.Date) {
        const dt = new Date(d.Date);
        if (!isNaN(dt.getTime())) {
          trialDate = dt.toISOString().split('T')[0];
        }
      }

      const caseObj = {
        case_id: dkt,
        caption: d.Title || d.title || d.Caption || d.caption || 'Litigation Matter',
        court: d.Court || d.court || 'S.D. Fla.',
        division: d.Division || d.division || 'Miami',
        judge: d.Judge || d.judge || 'Honorable Judge',
        nos_label: d['Nature of Suit / Type'] || d.NatureOfSuit || d.casetype || 'Civil Action',
        trial_date: trialDate || '2026-11-20',

        // Plaintiff Counsel & Address
        lead_attorney: pltfAtty['Attorney Name'] || pltfAtty.attorney || '',
        plaintiff_firm: pltfAtty['Law Firm'] || pltfAtty.firm || '',
        plaintiff_phone: pltfAtty['Attorney Phone'] || pltfAtty.phone || '',
        plaintiff_email: pltfAtty['Attorney Email'] || pltfAtty.email || '',
        plaintiff_address: pltfAtty['Attorney Address'] || pltfAtty.address || '',
        plaintiff_city: d.Division || 'Miami',

        // Defense Counsel & Address
        opposing_attorney: defAtty['Attorney Name'] || defAtty.attorney || '',
        opposing_firm: defAtty['Law Firm'] || defAtty.firm || '',
        defense_phone: defAtty['Attorney Phone'] || defAtty.phone || '',
        defense_email: defAtty['Attorney Email'] || defAtty.email || '',
        defense_address: defAtty['Attorney Address'] || defAtty.address || '',
        defense_city: d.Division || 'Miami'
      };

      parsedCases.push(mapRowToCase(caseObj, idx + 1));
    });

    return parsedCases;
  }

  // Otherwise, find the best sheet that actually contains docket records (skip summary/cover tabs)
  let targetSheetName = sheetNames[0];
  for (const name of sheetNames) {
    if (/summary|cover|readme|index|metadata/i.test(name)) continue;
    const ws = workbook.Sheets[name];
    const sample = XLSX.utils.sheet_to_json(ws, { defval: '', header: 1 });
    if (sample.length > 0) {
      const headerLine = (sample[0] || []).map(String).join(' ').toLowerCase();
      if (headerLine.includes('docket') || headerLine.includes('case') || headerLine.includes('attorney') || headerLine.includes('plaintiff')) {
        targetSheetName = name;
        break;
      }
    }
  }

  const worksheet = workbook.Sheets[targetSheetName];
  fillMergedCells(worksheet);
  const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  return rawRows.map((r, idx) => mapRowToCase(r, idx + 1));
}

// ----------------- API ROUTES ----------------- //

// Admin Stats
app.get('/api/admin/stats', (req, res) => {
  try {
    const stats = db.getAdminStats();
    res.json({ success: true, ...stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin File Upload (CSV, XLSX, XLS, TXT)
app.post('/api/admin/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No delivery file uploaded.' });
    }

    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    let parsedRows = [];

    if (ext === '.xlsx' || ext === '.xls') {
      parsedRows = parseExcel(filePath);
    } else {
      const rawContent = fs.readFileSync(filePath, 'utf8');
      parsedRows = parseCSV(rawContent);
    }

    if (!parsedRows.length) {
      return res.status(400).json({
        success: false,
        error: 'File could not be parsed. Please verify the header row has docket/case_id and attorney fields.'
      });
    }

    const insertedCount = db.addIngestedCases(parsedRows, req.file.originalname, ext === '.xlsx' || ext === '.xls' ? 'Excel Spreadsheet' : 'Court Docket CSV');
    res.json({
      success: true,
      message: `Successfully ingested and normalized ${insertedCount} litigation cases.`,
      recordsCount: insertedCount,
      fileName: req.file.originalname
    });
  } catch (err) {
    console.error('Ingestion error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin Clear All Data (Disabled for safety to prevent accidental total wipes)
app.post('/api/admin/clear', (req, res) => {
  res.status(403).json({
    success: false,
    error: 'Clear All Data is permanently disabled to prevent accidental total data loss. Please use the document log below to delete specific imported files and their associated records.'
  });
});

// Admin Delete Specific Ingested Document and remove all its associated data
app.delete('/api/admin/document/:logId', (req, res) => {
  try {
    const result = db.deleteDocument(req.params.logId);
    if (!result.success) {
      return res.status(404).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/document/delete', (req, res) => {
  try {
    const logId = req.body?.logId || req.body?.log_id;
    if (!logId) return res.status(400).json({ success: false, error: 'Missing logId parameter' });
    const result = db.deleteDocument(logId);
    if (!result.success) {
      return res.status(404).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Geocoding Status & Continuous Coverage
app.get('/api/geocoding/status', (req, res) => {
  try {
    const stats = db.getGeocodeStats();
    res.json({ success: true, ...stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/geocoding/start', async (req, res) => {
  try {
    const stats = await db.startAutoGeocoding();
    res.json({ success: true, message: 'Auto-geocoding worker triggered.', ...stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Operating State & Jurisdiction Registry
app.get('/api/states', (req, res) => {
  try {
    const summary = db.getStatesSummary();
    res.json({ success: true, ...summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Executive Dashboard Overview
app.get('/api/dashboard/overview', (req, res) => {
  try {
    const stateFilter = req.query.state || null;
    const overview = db.getDashboardOverview(stateFilter);
    res.json({ success: true, ...overview });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Granular Drill-Down Data by Key
app.get('/api/drill/:key', (req, res) => {
  try {
    const key = req.params.key;
    const stateFilter = req.query.state || null;
    const drill = db.getDrillData(key, stateFilter);
    res.json({ success: true, ...drill });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Granular Case Dossier (Level 2)
app.get('/api/case/:id', async (req, res) => {
  try {
    const c = db.getCase(req.params.id);
    if (!c) return res.status(404).json({ success: false, error: 'Case not found' });
    const integrationData = db.getCaseInteractions(req.params.id);

    // Fetch live QuickBooks Client Status & Financials
    let qbData = null;
    try {
      qbData = await quickbooksService.getCaseFinancials(c);
    } catch (qbErr) {
      console.warn('[QuickBooks] Live lookup error:', qbErr.message);
    }

    const isClient = qbData ? Boolean(qbData.is_client) : (c.hubspot_status === 'Booked' || c.hubspot_status === 'Won' || c.hubspot_status === 'Signed');
    const finSummary = qbData && qbData.financial_summary ? qbData.financial_summary : integrationData.financial_summary;
    const finalInteractions = (qbData && qbData.interactions && qbData.interactions.length > 0)
      ? [...qbData.interactions, ...(integrationData.interactions || []).filter(x => x.source_key !== 'quickbooks')]
      : integrationData.interactions;

    res.json({
      success: true,
      case: {
        ...c,
        is_client: isClient,
        client_label: isClient ? 'Existing Client' : 'New Prospect'
      },
      read_only_integrations: integrationData.read_only_integrations,
      financial_summary: finSummary,
      interactions: finalInteractions
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Case Read-Only Interactions & Activity Feed Endpoint
app.get('/api/case/:id/interactions', (req, res) => {
  try {
    const data = db.getCaseInteractions(req.params.id);
    if (!data.success) return res.status(404).json(data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Read-Only Integrations Health & Status Endpoint
app.get('/api/integrations/status', (req, res) => {
  const qbConfigured = quickbooksService.isConfigured();
  const hsConfigured = hubspotService.isConfigured();
  res.json({
    success: true,
    mode: 'read-only',
    integrations: {
      hubspot: {
        name: 'HubSpot CRM',
        status: hsConfigured ? 'Connected (Live API Read-Only)' : 'Config Pending (HUBSPOT_ACCESS_TOKEN required in .env)',
        is_live_configured: hsConfigured,
        permissions: ['crm.objects.contacts.read', 'crm.objects.deals.read'],
        icon: 'hubspot'
      },
      outlook: { name: 'Microsoft Outlook M365', status: 'Connected (Read-Only)', permissions: ['Mail.Read', 'Calendars.Read'], icon: 'outlook' },
      quickbooks: {
        name: 'QuickBooks Online',
        status: qbConfigured ? 'Connected (Live API Read-Only)' : 'Config Pending (.env credentials required)',
        is_live_configured: qbConfigured,
        permissions: ['com.intuit.quickbooks.accounting.read'],
        icon: 'quickbooks',
        connect_url: '/api/integrations/quickbooks/connect'
      }
    }
  });
});

// Live HubSpot CRM Owners / Assignees
app.get('/api/crm/owners', async (req, res) => {
  try {
    const owners = await hubspotService.getOwners();
    res.json({ success: true, count: owners.length, owners });
  } catch (err) {
    res.json({ success: true, count: 11, owners: hubspotService.getFallbackOwners() });
  }
});

// QuickBooks OAuth 2.0 Connect Route
app.get('/api/integrations/quickbooks/connect', (req, res) => {
  const authUri = quickbooksService.getAuthUri();
  if (!authUri) {
    return res.status(400).send('QuickBooks CLIENT_ID and CLIENT_SECRET missing in .env file. Please populate .env credentials first.');
  }
  res.redirect(authUri);
});

// QuickBooks OAuth 2.0 Callback Route
app.get('/api/integrations/quickbooks/callback', async (req, res) => {
  const fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
  const result = await quickbooksService.handleCallback(fullUrl, req.query && req.query.realmId);
  if (result && result.success) {
    res.send('<h2>QuickBooks Online Connected Successfully!</h2><p>OAuth 2.0 Tokens saved. You can close this window and return to LitPulse OS.</p>');
  } else {
    res.status(500).send(`<h2>QuickBooks OAuth Error</h2><p>${result ? result.error : 'Authorization failed'}</p>`);
  }
});

// Heat Map Key Variables Weights Endpoints
app.get('/api/heatmap/weights', (req, res) => {
  try {
    const weights = db.getWeights();
    res.json({ success: true, weights });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/heatmap/weights', (req, res) => {
  try {
    const newWeights = db.setWeights(req.body.weights || req.body);
    res.json({ success: true, message: 'Heat Map key variables and weighting engine updated.', weights: newWeights });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cookie-Drop Feedback Loop & Conversion Endpoints
app.get('/api/deliveries/conversions', (req, res) => {
  try {
    const conversions = db.getCookieDropConversions();
    res.json({ success: true, count: conversions.length, conversions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/deliveries/conversion', (req, res) => {
  try {
    const conversion = db.addCookieDropConversion(req.body);
    res.json({
      success: true,
      message: 'Cookie-drop feedback successfully logged and fed back into Heat Map priority system.',
      conversion,
      priority_boost: 15
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Live HubSpot CRM Matcher & Auto-Assign Sync Endpoint
app.post('/api/integrations/hubspot/sync', async (req, res) => {
  try {
    const result = await hubspotService.syncHubSpotWithCases(db.getCases());
    db.recomputeScoresAndBuildings(true);
    db.save();
    res.json({
      success: true,
      message: `HubSpot CRM auto-sync complete. Matched ${result.matched} active targets to live HubSpot contact owners.`,
      ...result
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Building Dossier with all attorney and case outreach records
app.get('/api/building/:id', (req, res) => {
  try {
    const data = db.getBuildingOutreach(req.params.id);
    if (!data || !data.building) return res.status(404).json({ success: false, error: 'Building not found' });
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update Building Parking & Security Access Notes
app.post('/api/building/:id/access', async (req, res) => {
  try {
    const { parking_notes, security_notes } = req.body;
    const b = await db.updateBuildingAccess(req.params.id, parking_notes, security_notes);
    if (!b) return res.status(404).json({ success: false, error: 'Building not found' });
    res.json({ success: true, message: 'Building access notes updated successfully.', building: b });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Resolve Delivery Data Hold (update physical address, suite, geocode, and release hold)
app.post('/api/building/:id/resolve-hold', async (req, res) => {
  try {
    const updated = await db.resolveBuildingHold(req.params.id, req.body);
    if (!updated) return res.status(404).json({ success: false, error: 'Building not found' });
    res.json({
      success: true,
      message: 'Delivery hold resolved successfully. Building address verified and released for courier dispatch.',
      building: updated
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Export Building Outreach CSV
app.get('/api/building/:id/export-csv', (req, res) => {
  try {
    const data = db.getBuildingOutreach(req.params.id);
    if (!data || !data.building) return res.status(404).send('Building not found');

    const b = data.building;
    const cases = data.cases || [];

    const headers = [
      'Building Name',
      'Building Address',
      'City',
      'Attorney Name',
      'Law Firm',
      'Party Side',
      'Re-Hit Status',
      'Date Contacted',
      'Prior Matter',
      'Docket Number',
      'Case Matter',
      'Court',
      'Presiding Judge',
      'Trial Date',
      'Days Until Trial',
      'Direct Phone',
      'Direct Email',
      'Assigned Rep',
      'CRM Status',
      'Conflict Status'
    ];

    const escapeCsv = (val) => {
      const s = String(val ?? '').replace(/"/g, '""');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
    };

    const lines = [headers.join(',')];

    cases.forEach(c => {
      lines.push([
        escapeCsv(b.building_name),
        escapeCsv(b.address),
        escapeCsv(b.city),
        escapeCsv(c.lead_attorney),
        escapeCsv(c.firm),
        escapeCsv(c.party_side),
        escapeCsv(c.is_rehit ? 'Yes' : 'No'),
        escapeCsv(c.rehit_date || ''),
        escapeCsv(c.rehit_prior_matter || ''),
        escapeCsv(c.case_id),
        escapeCsv(c.caption),
        escapeCsv(c.court),
        escapeCsv(c.judge),
        escapeCsv(c.trial_date),
        escapeCsv(c.days_until),
        escapeCsv(c.phone),
        escapeCsv(c.email),
        escapeCsv(c.assigned_to || 'Unassigned'),
        escapeCsv(c.hubspot_status || 'New'),
        escapeCsv(c.conflict_flag ? 'Conflict Locked' : 'Clean')
      ].join(','));
    });

    const csvContent = lines.join('\r\n');
    const safeName = (b.building_name || b.building_id).replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="Building_Outreach_${safeName}.csv"`);
    res.send(csvContent);
  } catch (err) {
    res.status(500).send('Error generating CSV: ' + err.message);
  }
});

// Geocode buildings endpoint (Top 100 or All Buildings)
app.post('/api/deliveries/geocode', async (req, res) => {
  try {
    const scope = req.body && req.body.scope ? req.body.scope : 'top100';
    if (scope === 'all') {
      const stats = await db.startAutoGeocoding();
      res.json({ success: true, message: 'All buildings queued for background geocoding.', ...stats });
    } else {
      const result = await db.geocodeBuildings(scope);
      res.json({ success: true, ...result });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Walkable Distance Clusters ("Park Once, Deliver a Couple")
app.get('/api/deliveries/walkable-clusters', (req, res) => {
  try {
    const city = req.query.city || null;
    const state = req.query.state || null;
    const clusters = db.getWalkableClusters(city, state);
    res.json({ success: true, clusters });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Lead assignment write route (Disabled for strict CRM Read-Only compliance)
app.post('/api/lead/assign', (req, res) => {
  res.status(403).json({
    success: false,
    error: 'Manual assignment disabled. Lead assignments are strictly managed via HubSpot CRM live sync.'
  });
});

// Update Lead Outreach Status
app.post('/api/lead/status', (req, res) => {
  const { case_id, status } = req.body;
  if (!case_id || !status) {
    return res.status(400).json({ success: false, error: 'Missing case_id or status' });
  }
  const ok = db.updateLeadStatus(case_id, status);
  res.json({ success: ok });
});

// Behavior Trial Tendency Analytics
app.get('/api/behavior', (req, res) => {
  try {
    const minClosed = req.query.minClosed !== undefined ? parseInt(req.query.minClosed, 10) : 3;
    const state = req.query.state || null;
    const list = db.getTrialTendency(minClosed, state);
    res.json({ success: true, rows: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Geocode Commercial Office Buildings
app.post('/api/deliveries/geocode', async (req, res) => {
  try {
    const scope = req.body?.scope || 'top100';
    const result = await db.geocodeBuildings(scope);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Judicial Calendar & Analytics
app.get('/api/judges', (req, res) => {
  try {
    const state = req.query.state || null;
    const judges = db.getJudgeAnalytics(state);
    res.json({ success: true, count: judges.length, judges });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Active Trial Cities Endpoint
app.get('/api/cities/active', (req, res) => {
  try {
    const state = req.query.state || null;
    const result = db.getActiveCities(state);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Export Clean Filtered CSV with Contextual Filename
app.get('/api/export/csv', (req, res) => {
  const key = req.query.drillKey || 'outreach';
  const q = req.query.q || '';
  const city = req.query.city || 'ALL';
  const state = req.query.state || 'ALL';
  const assignment = req.query.assignment || 'ALL';
  const partySide = req.query.partySide || 'ALL';
  const windowDays = req.query.window || 'ALL';

  const data = db.getDrillData(key, state);
  let rows = data.rows || [];

  // 1. Text Search Filter
  if (q) {
    const qLower = q.toLowerCase().trim();
    rows = rows.filter(r => JSON.stringify(r).toLowerCase().includes(qLower));
  }

  // 2. City Filter
  if (city && city !== 'ALL') {
    const cLower = city.toLowerCase().trim();
    rows = rows.filter(r => (r.trial_city && r.trial_city.toLowerCase() === cLower) || (r.firm_city && r.firm_city.toLowerCase() === cLower) || (r.city && r.city.toLowerCase() === cLower) || (r.division && r.division.toLowerCase() === cLower));
  }

  // 3. Assignment Filter
  if (assignment && assignment !== 'ALL') {
    if (assignment.toUpperCase() === 'UNASSIGNED') {
      rows = rows.filter(r => !r.assigned_to || r.assigned_to === 'Unassigned' || r.hubspot_status === 'Unassigned');
    } else if (assignment.toUpperCase() === 'ASSIGNED') {
      rows = rows.filter(r => r.assigned_to && r.assigned_to !== 'Unassigned' && r.hubspot_status !== 'Unassigned');
    }
  }

  // 4. Party Side Filter
  if (partySide && partySide !== 'ALL') {
    const pUpper = partySide.toUpperCase();
    if (pUpper === 'PLTF' || pUpper === 'PLAINTIFF') {
      rows = rows.filter(r => (r.party_side || '').toLowerCase().includes('plaint'));
    } else if (pUpper === 'DEF' || pUpper === 'DEFENSE') {
      rows = rows.filter(r => (r.party_side || '').toLowerCase().includes('defen'));
    }
  }

  // 5. Time Window Filter
  if (windowDays && windowDays !== 'ALL') {
    const maxDays = parseInt(windowDays, 10);
    if (!isNaN(maxDays)) {
      rows = rows.filter(r => r.days_until !== undefined && r.days_until > 0 && r.days_until <= maxDays);
    }
  }

  if (!rows.length) {
    return res.status(400).send('No records match the selected export filters.');
  }

  const dateStr = new Date().toISOString().split('T')[0];
  let filenameParts = ['litpulse', key];
  if (assignment !== 'ALL') filenameParts.push(assignment.toLowerCase());
  if (city !== 'ALL') filenameParts.push(city.toLowerCase().replace(/[^a-z0-9]/g, '_'));
  filenameParts.push(dateStr);
  const finalFilename = `${filenameParts.join('_')}.csv`;

  // Building Clusters Export
  if (key === 'deliveries') {
    const headers = [
      'Building ID', 'Building Name', 'Address', 'City', 'Eligible Drops', 'Total Counsel',
      'Firms Count', 'Active Trials', 'Runner Status', 'Parking Notes', 'Security Notes'
    ];
    const csvLines = [headers.join(',')];
    rows.forEach(b => {
      const vals = [
        `"${b.building_id || ''}"`,
        `"${(b.building_name || '').replace(/"/g, '""')}"`,
        `"${(b.address || '').replace(/"/g, '""')}"`,
        `"${b.city || ''}"`,
        `"${b.attorneys_count || b.eligible_drops || 0}"`,
        `"${b.attorneys_count || 0}"`,
        `"${b.firms_count || 0}"`,
        `"${b.active_trials || 0}"`,
        `"${b.runner_status || 'Ready for Drop'}"`,
        `"${(b.parking_notes || '').replace(/"/g, '""')}"`,
        `"${(b.security_notes || '').replace(/"/g, '""')}"`
      ];
      csvLines.push(vals.join(','));
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${finalFilename}"`);
    return res.send(csvLines.join('\n'));
  }

  // Judges Export
  if (key === 'judges') {
    const headers = [
      'Judge Name', 'Court', 'Division', 'Active Trials', 'Earliest Trial Date',
      'High-EAR Matters', 'Total EAR Pipeline ($)', 'Average Priority Score'
    ];
    const csvLines = [headers.join(',')];
    rows.forEach(j => {
      const vals = [
        `"${(j.judge_name || '').replace(/"/g, '""')}"`,
        `"${j.court || 'S.D. Fla.'}"`,
        `"${j.division || ''}"`,
        `"${j.active_trials || 0}"`,
        `"${j.earliest_trial || 'TBD'}"`,
        `"${j.high_ear_cases || 0}"`,
        `"${j.total_ear || 0}"`,
        `"${j.avg_priority || 70}"`
      ];
      csvLines.push(vals.join(','));
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${finalFilename}"`);
    return res.send(csvLines.join('\n'));
  }

  // Standard Cases / Attorney Outreach Export
  const headers = [
    'Target ID', 'Party Side', 'Case ID', 'Caption', 'Lead Attorney', 'Firm', 'Case Outcome', 'Re-Hit Status', 'Date Contacted', 'Prior Matter', 'Firm Address', 'Firm City', 'Trial City', 'Court',
    'Division', 'Judge', 'Trial Date', 'Days Until', 'Priority Score', 'EAR ($)',
    'Trial Probability (%)', 'Direct Phone', 'Direct Email', 'Assigned To', 'CRM Status',
    'Notes'
  ];
  const csvLines = [headers.join(',')];

  rows.forEach(r => {
    const vals = [
      `"${r.target_id || r.case_id || ''}"`,
      `"${r.party_side || 'Plaintiff'}"`,
      `"${r.case_id || ''}"`,
      `"${(r.caption || '').replace(/"/g, '""')}"`,
      `"${(r.lead_attorney || '').replace(/"/g, '""')}"`,
      `"${(r.firm || '').replace(/"/g, '""')}"`,
      `"${(r.outcome || '').replace(/"/g, '""')}"`,
      `"${r.is_rehit ? 'Yes' : 'No'}"`,
      `"${(r.rehit_date || '').replace(/"/g, '""')}"`,
      `"${(r.rehit_prior_matter || '').replace(/"/g, '""')}"`,
      `"${(r.address || '').replace(/"/g, '""')}"`,
      `"${r.firm_city || r.city || ''}"`,
      `"${r.trial_city || r.division || ''}"`,
      `"${r.court || 'S.D. Fla.'}"`,
      `"${r.division || ''}"`,
      `"${(r.judge || '').replace(/"/g, '""')}"`,
      `"${r.trial_date || ''}"`,
      `"${r.days_until !== undefined ? r.days_until : ''}"`,
      `"${r.priority_score || ''}"`,
      `"${r.ear || r.est_value || ''}"`,
      `"${r.print_likelihood ? r.print_likelihood + '%' : ''}"`,
      `"${r.phone || ''}"`,
      `"${r.email || ''}"`,
      `"${r.assigned_to || 'Unassigned'}"`,
      `"${r.hubspot_status || 'New'}"`,
      `"${(r.notes || '').replace(/"/g, '""')}"`
    ];
    csvLines.push(vals.join(','));
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${finalFilename}"`);
  res.send(csvLines.join('\n'));
});

// Start Server
app.listen(PORT, async () => {
  console.log(`LitPulse OS running on http://localhost:${PORT}`);
  // Automatically start background geocoding sweep for any un-geocoded buildings
  db.startAutoGeocoding();

  // Automatically synchronize live HubSpot CRM assigned contacts on startup
  if (hubspotService.isConfigured()) {
    try {
      console.log('[HubSpot] Initiating background CRM contact sync on startup...');
      const result = await hubspotService.syncHubSpotWithCases(db.getCases());
      db.recomputeScoresAndBuildings(false);
      db.save();
      console.log(`[HubSpot] Startup sync complete: matched ${result.matched} cases with ${result.assigned} assigned reps.`);
    } catch (err) {
      console.error('[HubSpot] Background startup sync error:', err.message);
    }
  }
});
