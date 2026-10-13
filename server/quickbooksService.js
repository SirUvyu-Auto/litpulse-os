const OAuthClient = require('intuit-oauth');
const fs = require('fs');
const path = require('path');

// Ensure process.env is loaded from .env if present
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

class QuickBooksService {
  constructor() {
    this.clientId = process.env.QUICKBOOKS_CLIENT_ID || '';
    this.clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET || '';
    this.environment = (process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox').toLowerCase();
    this.redirectUri = process.env.QUICKBOOKS_REDIRECT_URI || 'http://localhost:3000/api/integrations/quickbooks/callback';
    this.realmId = process.env.QUICKBOOKS_REALM_ID || '';
    this.refreshToken = process.env.QUICKBOOKS_REFRESH_TOKEN || '';

    this._firmCache = new Map();
    this.oauthClient = null;
    this.initClient();
    if (this.isConfigured()) {
      this.syncAllCustomers().catch(err => console.error('[QuickBooks] Auto-sync error:', err.message));
    }
  }

  initClient() {
    if (this.clientId && this.clientSecret) {
      this.oauthClient = new OAuthClient({
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        environment: this.environment,
        redirectUri: this.redirectUri
      });
      if (this.refreshToken) {
        this.oauthClient.token.setToken({
          refresh_token: this.refreshToken,
          realmId: this.realmId
        });
      }
    }
  }

  isConfigured() {
    return Boolean(this.clientId && this.clientSecret && this.realmId && this.refreshToken);
  }

  getAuthUri() {
    if (!this.clientId || !this.clientSecret) {
      return null;
    }
    try {
      const authUri = this.oauthClient.authorizeUri({
        scope: [OAuthClient.scopes.Accounting],
        state: 'litpulse-qb-auth'
      });
      return authUri;
    } catch (e) {
      console.error('[QuickBooks Service] Failed to build Auth URI:', e.message);
      return null;
    }
  }

  async handleCallback(parseUrl, queryRealmId) {
    if (!this.oauthClient) return null;
    try {
      const authResponse = await this.oauthClient.createToken(parseUrl);
      const token = authResponse.getJson();
      this.refreshToken = token.refresh_token;

      // Extract realmId from query or token
      let capturedRealm = queryRealmId;
      if (!capturedRealm && typeof parseUrl === 'string' && parseUrl.includes('realmId=')) {
        const m = parseUrl.match(/realmId=([a-zA-Z0-9]+)/);
        if (m) capturedRealm = m[1];
      }
      this.realmId = capturedRealm || this.realmId || (token && token.realmId) || '';

      // Update .env file locally if available
      this.updateEnvFile({
        QUICKBOOKS_REFRESH_TOKEN: this.refreshToken,
        QUICKBOOKS_REALM_ID: this.realmId
      });

      return { success: true, realmId: this.realmId, token };
    } catch (err) {
      console.error('[QuickBooks Live API] Callback handling failed:', err.message);
      return { success: false, error: err.message };
    }
  }

  updateEnvFile(updates) {
    try {
      const envPath = path.join(__dirname, '..', '.env');
      if (!fs.existsSync(envPath)) return;
      let content = fs.readFileSync(envPath, 'utf8');
      for (const [key, val] of Object.entries(updates)) {
        if (!val) continue;
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (regex.test(content)) {
          content = content.replace(regex, `${key}=${val}`);
        } else {
          content += `\n${key}=${val}`;
        }
      }
      fs.writeFileSync(envPath, content, 'utf8');
    } catch (e) {
      console.error('[QuickBooks Service] Failed to save updated env tokens:', e.message);
    }
  }

  async refreshAccessToken() {
    if (!this.oauthClient || !this.refreshToken) return null;
    try {
      const authResponse = await this.oauthClient.refreshUsingToken(this.refreshToken);
      const token = authResponse.getJson();
      if (token.refresh_token) {
        this.refreshToken = token.refresh_token;
        this.updateEnvFile({ QUICKBOOKS_REFRESH_TOKEN: this.refreshToken });
      }
      return token.access_token;
    } catch (err) {
      console.error('[QuickBooks Live API] Token refresh failed:', err.message);
      return null;
    }
  }

  // Sync all customers from QuickBooks Online into local firm memory
  async syncAllCustomers() {
    if (!this.isConfigured()) return [];
    try {
      const accessToken = await this.refreshAccessToken();
      if (!accessToken) return [];

      const host = this.environment === 'production' ? 'quickbooks.api.intuit.com' : 'sandbox-quickbooks.api.intuit.com';
      const url = `https://${host}/v3/company/${this.realmId}/query?query=${encodeURIComponent('SELECT * FROM Customer MAXRESULTS 1000')}&minorversion=73`;
      const response = await this.oauthClient.makeApiCall({
        url,
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      });
      const json = response.json || (response.body ? JSON.parse(response.body) : {});
      const customers = (json && json.QueryResponse && json.QueryResponse.Customer) ? json.QueryResponse.Customer : [];

      if (!this._firmCache) this._firmCache = new Map();
      customers.forEach(cust => {
        const names = [
          cust.DisplayName,
          cust.CompanyName,
          cust.PrintOnCheckName,
          cust.GivenName ? `${cust.GivenName} ${cust.FamilyName || ''}`.trim() : null
        ].filter(Boolean);

        const spend = Number(cust.BalanceWithJobs || cust.TotalSpend || 0) || 0;
        const record = {
          isClient: true,
          lifetimeSpend: spend,
          invoiceCount: 1,
          customerId: cust.Id,
          displayName: cust.DisplayName || cust.CompanyName || 'Active Client'
        };

        names.forEach(n => {
          const key = n.toLowerCase().trim();
          if (key && !this._firmCache.has(key)) {
            this._firmCache.set(key, record);
          }
        });
      });
      console.log(`[QuickBooks] Synced ${customers.length} customer records into firm cache.`);
      return customers;
    } catch (e) {
      console.error('[QuickBooks] Failed to sync customers:', e.message);
      return [];
    }
  }

  // Returns live or cached client status: { isClient: boolean, lifetimeSpend: number, invoiceCount: number }
  getClientStatus(firmName, attorneyName) {
    if (!this._firmCache) {
      this._firmCache = new Map();
    }
    const cleanFirm = (firmName || '').toLowerCase().trim();
    const cleanAtty = (attorneyName || '').toLowerCase().trim();
    if (!cleanFirm && !cleanAtty) return { isClient: false, lifetimeSpend: 0, invoiceCount: 0 };

    if (cleanFirm && this._firmCache.has(cleanFirm)) {
      return this._firmCache.get(cleanFirm);
    }
    if (cleanAtty && this._firmCache.has(cleanAtty)) {
      return this._firmCache.get(cleanAtty);
    }

    // Helper to strip standard corporate/legal suffixes
    const stripSuffix = (s) => s.replace(/\b(p\.a\.|pa|llc|pllc|llp|lp|pl|p\.c\.|pc|inc|corp|co|the law offices? of|law offices?|law firm|group)\b/gi, '')
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const normFirm = stripSuffix(cleanFirm);
    if (normFirm && normFirm.length >= 4) {
      for (const [key, val] of this._firmCache.entries()) {
        const normKey = stripSuffix(key);
        if (normKey && normKey.length >= 4) {
          if (normFirm === normKey || (normFirm.length >= 6 && normKey.length >= 6 && (normFirm.includes(normKey) || normKey.includes(normFirm)))) {
            return val;
          }
        }
      }
    }

    return { isClient: false, lifetimeSpend: 0, invoiceCount: 0 };
  }

  // 3-tier revenue prediction calculation (Firm History -> Case Type Average -> Default Floor)
  predictRevenue(caseObj) {
    const firmName = (caseObj.firm || '').toLowerCase().trim();
    const nosCode = caseObj.nos_code || 'default';

    // 1. Level 1: Firm's real historical average from QuickBooks
    if (this._firmCache && this._firmCache.has(firmName)) {
      const fStat = this._firmCache.get(firmName);
      if (fStat.isClient && fStat.invoiceCount > 0 && fStat.lifetimeSpend > 0) {
        const firmAvg = Math.round(fStat.lifetimeSpend / fStat.invoiceCount);
        return { value: firmAvg, source: 'QB Firm Historical Spend', tier: 'level-1' };
      }
    }

    // 2. Level 2: Real Case-Type benchmark if recorded
    if (this._caseTypeAverages && this._caseTypeAverages.has(nosCode)) {
      const avg = this._caseTypeAverages.get(nosCode);
      return { value: avg, source: 'QB Case Type Average', tier: 'level-2' };
    }

    // 3. Level 3: Explicit court claim amount if present on docket, else baseline floor ($25,000)
    if (typeof caseObj.ear === 'number' && caseObj.ear > 0) {
      return { value: caseObj.ear, source: 'Docket Claimed Value', tier: 'docket' };
    }

    return { value: 25000, source: 'Baseline Litigation Floor ($25k)', tier: 'level-3' };
  }

  async queryInvoices(firmName) {
    if (!this.isConfigured()) return null;

    try {
      const accessToken = await this.refreshAccessToken();
      if (!accessToken) return null;

      const host = this.environment === 'production' ? 'quickbooks.api.intuit.com' : 'sandbox-quickbooks.api.intuit.com';
      const cleanFirm = (firmName || '').replace(/'/g, "\\'");
      const query = firmName
        ? `SELECT * FROM Invoice WHERE CustomerRef PRINTING_NAME LIKE '%${cleanFirm}%' MAXRESULTS 10`
        : `SELECT * FROM Invoice MAXRESULTS 10`;

      const url = `https://${host}/v3/company/${this.realmId}/query?query=${encodeURIComponent(query)}&minorversion=73`;
      const response = await this.oauthClient.makeApiCall({
        url,
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      });

      const json = response.json || (response.body ? JSON.parse(response.body) : {});
      const invoices = json && json.QueryResponse && json.QueryResponse.Invoice ? json.QueryResponse.Invoice : [];
      return invoices;
    } catch (err) {
      console.error('[QuickBooks Live API] Query error:', err.message);
      return null;
    }
  }

  async getCaseFinancials(c) {
    const isLive = this.isConfigured();
    if (isLive) {
      const liveInvoices = await this.queryInvoices(c.firm || c.lead_attorney);
      if (liveInvoices && liveInvoices.length > 0) {
        let totalBilled = 0;
        let pending = 0;
        let balance = 0;
        const mappedInvoices = liveInvoices.map((inv, idx) => {
          const amt = inv.TotalAmt || 0;
          const bal = inv.Balance || 0;
          totalBilled += amt;
          if (bal > 0) pending += bal;
          else balance += amt;

          return {
            id: `qb-live-${inv.Id}`,
            source: 'QuickBooks Online (Live API)',
            source_key: 'quickbooks',
            type: 'invoice',
            title: `Invoice #${inv.DocNumber || inv.Id}: ${bal === 0 ? 'Paid' : 'Open Balance'}`,
            description: `Live Financial Sync: Total Billed $${amt.toLocaleString()} | Open Balance: $${bal.toLocaleString()}`,
            timestamp: inv.TxnDate || '2026-10-01',
            author: 'QuickBooks Live OAuth Sync',
            badge_color: '#16A34A',
            financials: {
              invoice_number: inv.DocNumber || `INV-${inv.Id}`,
              amount: amt,
              status: bal === 0 ? 'Paid' : 'Pending',
              retainer_balance: bal
            }
          };
        });

        // Cache this firm as an active client
        if (!this._firmCache) this._firmCache = new Map();
        const firmKey = (c.firm || c.lead_attorney || '').toLowerCase().trim();
        this._firmCache.set(firmKey, {
          isClient: true,
          lifetimeSpend: totalBilled,
          invoiceCount: liveInvoices.length
        });

        return {
          is_live: true,
          is_client: true,
          client_label: 'Existing Client',
          financial_summary: {
            total_billed: totalBilled,
            pending_quotes: pending,
            retainer_balance: balance,
            billing_status: pending > 0 ? 'Open Invoice' : 'Paid / Active'
          },
          interactions: mappedInvoices
        };
      }
    }

    // Default clean response
    return {
      is_live: isLive,
      is_client: false,
      client_label: 'New Prospect',
      financial_summary: {
        total_billed: 0,
        pending_quotes: 0,
        retainer_balance: 0,
        billing_status: 'New Prospect'
      },
      notice: isLive
        ? 'No prior billing history found in QuickBooks Online. Account is a New Prospect.'
        : 'QuickBooks integration active in Standby mode.'
    };
  }
}

module.exports = new QuickBooksService();
