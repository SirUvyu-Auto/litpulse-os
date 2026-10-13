const fs = require('fs');
const path = require('path');

// Ensure process.env is loaded from .env if present
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

class HubSpotService {
  constructor() {
    this.accessToken = process.env.HUBSPOT_ACCESS_TOKEN || '';
  }

  isConfigured() {
    return Boolean(this.accessToken && this.accessToken.startsWith('pat-'));
  }

  async searchDealsOrContacts(queryStr) {
    if (!this.isConfigured() || !queryStr) return null;

    try {
      const url = 'https://api.hubapi.com/crm/v3/objects/deals/search';
      const body = {
        filterGroups: [{
          filters: [{
            propertyName: 'dealname',
            operator: 'CONTAINS_TOKEN',
            value: queryStr
          }]
        }],
        properties: ['dealname', 'dealstage', 'amount', 'pipeline', 'hubspot_owner_id', 'createdate', 'notes_last_updated'],
        limit: 5
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        console.error(`[HubSpot Live API] Search HTTP Error: ${res.status} ${res.statusText}`);
        return null;
      }

      const data = await res.json();
      return data && data.results ? data.results : [];
    } catch (err) {
      console.error('[HubSpot Live API] Search exception:', err.message);
      return null;
    }
  }

  formatLiveStatus(props) {
    if (!props) return 'Lead';
    const leadStatus = props.hs_lead_status;
    if (leadStatus) {
      const map = {
        'NEW': 'New',
        'ATTEMPTED_TO_CONTACT': 'Attempted Contact',
        'IN_PROGRESS': 'In Progress',
        'OPEN_DEAL': 'Open Deal',
        'UNQUALIFIED': 'Unqualified',
        'CONNECTED': 'Connected',
        'BAD_TIMING': 'Bad Timing'
      };
      if (map[leadStatus]) return map[leadStatus];
      return leadStatus.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, ch => ch.toUpperCase());
    }

    const lifecycle = props.lifecyclestage;
    if (lifecycle) {
      const map = {
        'opportunity': 'Opportunity',
        'lead': 'Lead',
        'marketingqualifiedlead': 'Marketing Qualified Lead',
        'salesqualifiedlead': 'Sales Qualified Lead',
        'customer': 'Customer',
        'subscriber': 'Subscriber',
        'evangelist': 'Evangelist',
        'other': 'Other'
      };
      if (map[lifecycle]) return map[lifecycle];
      return lifecycle.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, ch => ch.toUpperCase());
    }

    return 'Lead';
  }

  async getAllContacts(forceRefresh = false) {
    if (!this.isConfigured()) return [];
    if (!forceRefresh && this._assignedContactsCache && this._assignedContactsCache.length > 0) {
      return this._assignedContactsCache;
    }

    try {
      const allContacts = [];
      let after = undefined;
      const searchUrl = 'https://api.hubapi.com/crm/v3/objects/contacts/search';

      // Paginate through all contacts that have an assigned HubSpot owner
      while (true) {
        const body = {
          filterGroups: [{
            filters: [{
              propertyName: 'hubspot_owner_id',
              operator: 'HAS_PROPERTY'
            }]
          }],
          properties: ['email', 'firstname', 'lastname', 'company', 'hubspot_owner_id', 'hs_lead_status', 'lifecyclestage'],
          limit: 100
        };
        if (after) body.after = after;

        const res = await fetch(searchUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.accessToken}`
          },
          body: JSON.stringify(body)
        });

        if (!res.ok) {
          console.error(`[HubSpot Live API] Error fetching assigned contacts: ${res.status} ${res.statusText}`);
          break;
        }

        const data = await res.json();
        if (data.results && data.results.length) {
          allContacts.push(...data.results);
        }

        if (data.paging && data.paging.next && data.paging.next.after) {
          after = data.paging.next.after;
        } else {
          break;
        }
      }

      console.log(`[HubSpot Live API] Fetched ${allContacts.length} total assigned contacts with live owners.`);
      this._assignedContactsCache = allContacts;
      return allContacts;
    } catch (err) {
      console.error('[HubSpot Live API] Error fetching contacts:', err.message);
      return this._assignedContactsCache || [];
    }
  }

  async getAllDeals() {
    if (!this.isConfigured()) return [];
    try {
      const url = 'https://api.hubapi.com/crm/v3/objects/deals?limit=100&properties=dealname,dealstage,amount,pipeline,hubspot_owner_id';
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${this.accessToken}` }
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data && data.results) ? data.results : [];
    } catch (err) {
      console.error('[HubSpot Live API] Error fetching deals:', err.message);
      return [];
    }
  }

  getFallbackOwners() {
    return [
      { id: '163689987', name: 'Don Davis', email: 'don@litnmore.com' },
      { id: '161823469', name: 'Mike Sooley', email: 'msooley@litnmore.com' },
      { id: '82166999', name: 'Kristopher Davis', email: 'kmdavis@litnmore.com' },
      { id: '86953947', name: 'Melissa Shugars', email: 'melissa@litnmore.com' },
      { id: '166555050', name: 'Debra Apondi', email: 'debra@collegeproduce.com' },
      { id: '166555020', name: 'Vandross Kaesa', email: 'vandross@collegeproduce.com' },
      { id: '168752750', name: 'Preston Mayieka', email: 'preston@collegeproduce.com' },
      { id: '169060732', name: 'Lincon Uvyu', email: 'lincon@collegeproduce.com' },
      { id: '159703874', name: 'Michael Muchugia', email: 'operations@litnmore.com' },
      { id: '161823470', name: 'Rose Njenga', email: 'rosen@litnmore.com' },
      { id: '162954240', name: 'Collins Ngeno', email: 'collinsn@litnmore.com' }
    ];
  }

  async fetchOwners() {
    if (!this.isConfigured()) return this.getFallbackOwners();
    try {
      const url = 'https://api.hubapi.com/crm/v3/owners';
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${this.accessToken}` }
      });
      if (!res.ok) return this.getFallbackOwners();
      const data = await res.json();
      const owners = (data && data.results ? data.results : [])
        .filter(o => !o.archived)
        .map(o => ({
          id: o.id,
          name: `${o.firstName || ''} ${o.lastName || ''}`.trim(),
          email: o.email || '',
          userId: o.userId
        }));

      this._ownerMap = new Map();
      owners.forEach(o => {
        this._ownerMap.set(String(o.id), o.name);
        if (o.userId) this._ownerMap.set(String(o.userId), o.name);
        if (o.email) this._ownerMap.set(o.email.toLowerCase(), o.name);
      });
      this._ownersCache = owners;
      console.log(`[HubSpot Live API] Synchronized ${owners.length} active portal owners.`);
      return owners;
    } catch (err) {
      console.error('[HubSpot Live API] Error fetching owners:', err.message);
      return this.getFallbackOwners();
    }
  }

  async getOwners() {
    if (this._ownersCache && this._ownersCache.length) return this._ownersCache;
    return await this.fetchOwners();
  }

  async syncHubSpotWithCases(cases) {
    if (!Array.isArray(cases) || !cases.length) return { matched: 0, assigned: 0 };
    await this.fetchOwners();
    const hsContacts = await this.getAllContacts(true);
    const hsDeals = await this.getAllDeals();

    let matchedCount = 0;
    let assignedCount = 0;

    const contactMap = new Map();
    const domainMap = new Map();
    const firmMap = new Map();

    const ignoredDomains = new Set(['hubspot.com', 'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'aol.com', 'icloud.com']);

    hsContacts.forEach(c => {
      const props = c.properties || {};
      if (props.email) {
        const cleanEmail = props.email.toLowerCase().trim();
        contactMap.set(cleanEmail, c);
        const parts = cleanEmail.split('@');
        if (parts[1] && !ignoredDomains.has(parts[1])) {
          domainMap.set(parts[1], c);
        }
      }
      const fullName = `${props.firstname || ''} ${props.lastname || ''}`.trim().toLowerCase();
      if (fullName && fullName.length > 2) {
        contactMap.set(fullName, c);
      }
      if (props.company) {
        const cleanComp = props.company.toLowerCase().trim();
        if (cleanComp.length > 2) {
          firmMap.set(cleanComp, c);
        }
      }
    });

    cases.forEach(c => {
      const e1 = (c.email || c.plaintiff_email || '').toLowerCase().trim();
      const e2 = (c.defense_email || '').toLowerCase().trim();
      const a1 = (c.lead_attorney || c.plaintiff_attorney || '').toLowerCase().trim();
      const a2 = (c.opposing_attorney || c.defense_attorney || '').toLowerCase().trim();
      const f1 = (c.firm || c.plaintiff_firm || '').toLowerCase().trim();
      const f2 = (c.defense_firm || '').toLowerCase().trim();

      let hsMatch = contactMap.get(e1) || contactMap.get(e2);
      if (!hsMatch) hsMatch = contactMap.get(a1) || contactMap.get(a2);
      if (!hsMatch) hsMatch = firmMap.get(f1) || firmMap.get(f2);
      if (!hsMatch && e1.includes('@')) hsMatch = domainMap.get(e1.split('@')[1]);
      if (!hsMatch && e2.includes('@')) hsMatch = domainMap.get(e2.split('@')[1]);

      if (hsMatch) {
        matchedCount++;
        const ownerId = hsMatch.properties ? hsMatch.properties.hubspot_owner_id : null;
        let resolvedOwner = (ownerId && this._ownerMap && this._ownerMap.get(String(ownerId))) || null;
        if (!resolvedOwner && c.assigned_to && c.assigned_to !== 'Martin Isika' && c.assigned_to !== 'Unassigned') {
          resolvedOwner = c.assigned_to;
        }

        if (resolvedOwner) {
          c.assigned_to = resolvedOwner;
          assignedCount++;
        } else {
          c.assigned_to = 'Unassigned';
        }

        c.hubspot_status = this.formatLiveStatus(hsMatch.properties);
        c.hubspot_contact_id = hsMatch.id;
        c.has_cookie_conversion = true;
      }
    });

    console.log(`[HubSpot Live API] Synchronized cases: ${matchedCount} matched, ${assignedCount} assigned to active reps.`);
    return { matched: matchedCount, assigned: assignedCount, totalContacts: hsContacts.length, totalDeals: hsDeals.length };
  }

  async getCaseHubSpotData(c) {
    const isLive = this.isConfigured();
    if (isLive) {
      const deals = await this.searchDealsOrContacts(c.firm || c.lead_attorney || c.caption);
      if (deals && deals.length > 0) {
        const topDeal = deals[0];
        const props = topDeal.properties || {};
        return {
          is_live: true,
          deal_id: topDeal.id,
          deal_name: props.dealname || c.caption,
          deal_stage: props.dealstage || c.hubspot_status || 'In Discussion',
          amount: props.amount ? parseFloat(props.amount) : c.est_value,
          created_at: props.createdate ? props.createdate.split('T')[0] : '2026-09-20',
          interactions: [{
            id: `hb-live-${topDeal.id}`,
            source: 'HubSpot CRM (Live API)',
            source_key: 'hubspot',
            type: 'deal_stage',
            title: `Lead Deal: ${props.dealname || c.caption}`,
            description: `Live CRM Read-Only Sync: Deal Stage: ${props.dealstage || 'Active'} | Value: $${(props.amount || c.est_value).toLocaleString()}`,
            timestamp: props.notes_last_updated ? props.notes_last_updated.split('T')[0] : '2026-09-20',
            author: c.assigned_to || 'Martin Isika',
            badge_color: '#F97316'
          }]
        };
      }
    }

    return {
      is_live: isLive,
      notice: isLive
        ? 'No matching live deals found in HubSpot CRM for this law firm or attorney.'
        : 'HubSpot API Private Access Token missing. Add HUBSPOT_ACCESS_TOKEN in .env file to pull live CRM deals.'
    };
  }
}

module.exports = new HubSpotService();
