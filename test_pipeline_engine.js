/**
 * LitPulse OS - Enterprise Pipeline Test Battery
 * Verifies Kris Davis Directives (Canonical Resolution, Address Correctness, Target Case Preservation)
 * Tests against normalizer.js and dataStore.js in LitPulse OS
 */

const normalizer = require('./server/normalizer');
const db = require('./server/dataStore');

function runTests() {
  console.log('======================================================================');
  console.log('LitPulse OS: Enterprise Pipeline Exclusion & Resolution Test Battery');
  console.log('======================================================================\n');

  let passed = 0;
  let total = 7;

  // Test 1: Category 1 Government Exclusion (DOJ/USAO)
  console.log('TEST 1: Category 1 Government Exclusion (DOJ Civil Division)');
  const rec1 = {
    attorney_name: 'John Doe',
    firm_name: 'U.S. Department of Justice - Civil Division',
    email: 'john.doe@usdoj.gov',
    address: '950 Pennsylvania Ave NW, Washington, DC 20530'
  };
  const res1 = db.processDocketRecord(rec1);
  if (res1.is_excluded && res1.exclusion_code === 'EXCL_GOV_DOJ' && res1.delivery_status === 'ineligible') {
    console.log('  [PASS] Government entity excluded successfully with code:', res1.exclusion_code);
    passed++;
  } else {
    console.error('  [FAIL] Expected EXCL_GOV_DOJ exclusion, got:', res1);
  }

  // Test 2: Category 6 Accredited Legal Building Whitelist (Courthouse Tower)
  console.log('\nTEST 2: Category 6 Commercial Whitelist (Courthouse Tower Tenant)');
  const rec2 = {
    attorney_name: 'Sarah Smith, Esq.',
    firm_name: 'Liebler Gonzalez & Portuondo P.A.',
    email: 'ssmith@lgplaw.com',
    address: 'Courthouse Tower, 44 West Flagler Street, 25th Floor, Miami, FL 33130'
  };
  const res2 = db.processDocketRecord(rec2);
  if (!res2.is_excluded && res2.delivery_status === 'eligible') {
    console.log('  [PASS] Accredited commercial tower tenant protected from false-positive courthouse exclusion');
    passed++;
  } else {
    console.error('  [FAIL] Expected eligible private tenant, got:', res2);
  }

  // Test 3: Kris Directive 2 - Standalone PO Box Detection
  console.log('\nTEST 3: Full-Record Address Correctness (Standalone PO Box)');
  const rec3 = {
    attorney_name: 'Michael Vance',
    firm_name: 'Vance Law Group',
    email: 'mvance@vancelaw.com',
    address: 'P.O. Box 4902, Miami, FL 33101'
  };
  const res3 = db.processDocketRecord(rec3);
  if (res3.is_excluded && res3.exclusion_code === 'EXCL_ADDR_POBOX_ONLY') {
    console.log('  [PASS] Standalone PO box correctly flagged for courier handoff disqualification');
    passed++;
  } else {
    console.error('  [FAIL] Expected EXCL_ADDR_POBOX_ONLY, got:', res3);
  }

  // Test 4: Kris Directive 1 - Upstream Fuzzy Canonical Matching (Homer Bonner)
  console.log('\nTEST 4: Upstream Fuzzy Entity Resolution (Homer Bonner Stem)');
  const rec4 = {
    attorney_name: 'Peter Homer',
    firm_name: 'HomerBonner P A',
    email: 'phomer@homerbonner.com',
    address: '1200 Four Seasons Tower, 1441 Brickell Ave, Miami, FL 33131'
  };
  const res4 = db.processDocketRecord(rec4);
  if (res4.canonical_firm === 'Homer Bonner Jacobs Ortiz') {
    console.log('  [PASS] Fuzzy firm stem correctly mapped to canonical entity:', res4.canonical_firm);
    passed++;
  } else {
    console.error('  [FAIL] Expected Homer Bonner Jacobs Ortiz, got:', res4.canonical_firm);
  }

  // Test 5: Kris Directive 1 - Attorney Nickname Normalization (Bob -> Robert)
  console.log('\nTEST 5: Attorney Nickname Resolution (Bob -> Robert)');
  const rec5 = {
    attorney_name: 'Bob Martinez, Esq.',
    firm_name: 'Martinez & Associates',
    email: 'bmartinez@martinezlaw.com',
    address: '100 SE 2nd St, Suite 2000, Miami, FL 33131'
  };
  const res5 = db.processDocketRecord(rec5);
  if (res5.canonical_attorney === 'Robert Martinez') {
    console.log('  [PASS] Nickname "Bob" normalized to canonical name:', res5.canonical_attorney);
    passed++;
  } else {
    console.error('  [FAIL] Expected Robert Martinez, got:', res5.canonical_attorney);
  }

  // Test 6: Category 4 Suffix Auto-Expansion (150 West Jefferson)
  console.log('\nTEST 6: Category 4 Suffix Auto-Expansion');
  const rawAddr6 = '150 West Jefferson, Suite 100';
  const stdAddr6 = normalizer.standardizeAddress(rawAddr6);
  if (stdAddr6.includes('150 West Jefferson Ave')) {
    console.log('  [PASS] Street missing suffix auto-expanded to:', stdAddr6);
    passed++;
  } else {
    console.error('  [FAIL] Expected 150 West Jefferson Ave, got:', stdAddr6);
  }

  // Test 7: Kris Directive 3 - Target Case Coverage Preservation Gate
  console.log('\nTEST 7: Target Case Coverage Preservation Gate');
  const rec7 = {
    case_id: '1:25-cv-20999',
    caption: 'Alpha Corp v. Omega LLC',
    attorney_name: 'Bob Homer, Esq.',
    firm_name: 'Homer and Bonner Law Firm',
    email: 'bhomer@homerbonner.com',
    address: '1441 Brickell Ave, Suite 1200, Miami, FL 33131'
  };
  const res7 = db.processDocketRecord(rec7);
  if (res7.case_coverage_status === 'SECURED_TARGET_CASE' && res7.delivery_status === 'eligible') {
    console.log('  [PASS] Case coverage secured across firm variations:', res7.case_coverage_status);
    passed++;
  } else {
    console.error('  [FAIL] Expected SECURED_TARGET_CASE, got:', res7);
  }

  console.log('\n----------------------------------------------------------------------');
  console.log(`Summary: ${passed} / ${total} Tests Passed (${Math.round((passed / total) * 100)}%)`);
  console.log('----------------------------------------------------------------------');

  if (passed === total) {
    console.log('[SUCCESS] All enterprise pipeline directives verified 100% operational.');
    process.exit(0);
  } else {
    console.error('[ERROR] One or more pipeline tests failed.');
    process.exit(1);
  }
}

runTests();
