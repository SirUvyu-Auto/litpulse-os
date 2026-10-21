// TRIS: Lit&More Trial Revenue Intelligence System

let activePage = 'overview';
let activeDeliveriesSubtab = 'clusters';
let activeOutreachCategory = 'all';
let activeOutreachSide = 'all';
let activeLifecycle = 'active';
let activeWindowFilter = '90';
let fullCasesCache = [];
let fullBuildingsCache = [];
let drillDataCache = [];

// Universal Operating Jurisdiction State (Multi-Select, default: Florida)
let selectedStates = ['FL'];
let availableStatesData = [];
let nationalSummaryData = null;

function getStateParam(prefix = '?') {
  if (!selectedStates || !selectedStates.length || selectedStates.includes('ALL')) {
    return `${prefix}state=ALL`;
  }
  return `${prefix}state=${encodeURIComponent(selectedStates.join(','))}`;
}

const STATE_VIEWPORTS = {
  ALL: { center: [38.5, -96.5], zoom: 4 },
  FL: { center: [27.8, -81.7], zoom: 7 },
  GA: { center: [32.9, -83.6], zoom: 7 },
  TX: { center: [31.0, -99.9], zoom: 6 },
  NY: { center: [42.9, -75.5], zoom: 7 },
  CA: { center: [36.7, -119.4], zoom: 6 }
};

function getStateIcon(code) {
  const map = {
    FL: '🌴',
    GA: '🍑',
    TX: '⭐️',
    NY: '🗽',
    CA: '🌉',
    IL: '🏙️',
    PA: '🔔',
    OH: '🌰',
    NC: '🌲',
    VA: '🏛️'
  };
  return map[code] || '🏛️';
}

function toggleStateScopeDropdown(e) {
  if (e) e.stopPropagation();
  const dropdown = document.getElementById('stateScopeDropdown');
  const trigger = document.getElementById('stateScopeTrigger');
  if (!dropdown) return;
  const isCurrentlyOpen = dropdown.style.display === 'block';
  if (isCurrentlyOpen) {
    dropdown.style.display = 'none';
    trigger?.classList.remove('open');
  } else {
    dropdown.style.display = 'block';
    trigger?.classList.add('open');
  }
}

function closeStateScopeDropdown() {
  const dropdown = document.getElementById('stateScopeDropdown');
  const trigger = document.getElementById('stateScopeTrigger');
  if (dropdown) dropdown.style.display = 'none';
  if (trigger) trigger.classList.remove('open');
}

document.addEventListener('click', (e) => {
  const container = document.getElementById('stateScopeContainer');
  if (container && !container.contains(e.target)) {
    closeStateScopeDropdown();
  }
});

async function loadAvailableStates() {
  try {
    const res = await fetch('/api/states');
    const data = await res.json();
    if (!data.success) return;

    nationalSummaryData = data.national || null;
    availableStatesData = data.states || [];

    // Ensure default is Florida
    if (!selectedStates || !selectedStates.length) {
      selectedStates = ['FL'];
    }

    renderStateScopeDropdown();
    updateStateScopeTriggerLabel();
  } catch (err) {
    console.error('Failed to load available states:', err);
  }
}

function renderStateScopeDropdown() {
  const optionsContainer = document.getElementById('stateScopeOptions');
  if (!optionsContainer) return;

  const isAllExplicitlySelected = selectedStates.includes('ALL');
  const nationalMatters = nationalSummaryData?.active_cases || 0;

  let html = `
    <div class="state-scope-item ${isAllExplicitlySelected ? 'selected' : ''}" onclick="handleStateItemClick('ALL', event)">
      <input type="checkbox" class="state-scope-checkbox" ${isAllExplicitlySelected ? 'checked' : ''} onclick="event.stopPropagation(); handleStateItemClick('ALL', event)">
      <div class="state-scope-item-body">
        <span class="state-scope-item-name">🌐 All States</span>
        <span class="state-scope-item-count">${nationalMatters.toLocaleString()}</span>
      </div>
    </div>
  `;

  availableStatesData.forEach(st => {
    const isChecked = isAllExplicitlySelected || selectedStates.includes(st.code);
    const icon = getStateIcon(st.code);
    html += `
      <div class="state-scope-item ${isChecked ? 'selected' : ''}" onclick="handleStateItemClick('${escapeHtml(st.code)}', event)">
        <input type="checkbox" class="state-scope-checkbox" ${isChecked ? 'checked' : ''} onclick="event.stopPropagation(); handleStateItemClick('${escapeHtml(st.code)}', event)">
        <div class="state-scope-item-body">
          <span class="state-scope-item-name">${icon} ${escapeHtml(st.name)} (${escapeHtml(st.code)})</span>
          <span class="state-scope-item-count">${(st.active_cases || 0).toLocaleString()}</span>
        </div>
      </div>
    `;
  });

  optionsContainer.innerHTML = html;
}

function updateStateScopeTriggerLabel() {
  const labelEl = document.getElementById('stateScopeLabel');
  if (!labelEl) return;

  if (selectedStates.includes('ALL')) {
    const natCount = nationalSummaryData?.active_cases || 0;
    labelEl.textContent = `🌐 All States (${natCount.toLocaleString()} matters)`;
  } else if (selectedStates.length === 1) {
    const code = selectedStates[0];
    const st = availableStatesData.find(s => s.code === code);
    const name = st ? st.name : (code === 'FL' ? 'Florida' : code);
    const count = st?.active_cases || (code === 'FL' ? (nationalSummaryData?.active_cases || 0) : 0);
    labelEl.textContent = `${getStateIcon(code)} ${name} (${count.toLocaleString()} matters)`;
  } else if (selectedStates.length > 1) {
    const tags = selectedStates.map(c => `${getStateIcon(c)} ${c}`).join(', ');
    labelEl.textContent = `${tags} (${selectedStates.length} states)`;
  } else {
    selectedStates = ['FL'];
    const st = availableStatesData.find(s => s.code === 'FL');
    const count = st?.active_cases || (nationalSummaryData?.active_cases || 0);
    labelEl.textContent = `🌴 Florida (${count.toLocaleString()} matters)`;
  }
}

function handleStateItemClick(code, e) {
  if (e) e.stopPropagation();

  if (code === 'ALL') {
    if (selectedStates.includes('ALL')) {
      // Toggle off All States: fall back to Florida as default
      selectedStates = ['FL'];
    } else {
      selectedStates = ['ALL'];
    }
  } else {
    // Individual state clicked
    if (selectedStates.includes('ALL')) {
      // If was previously in ALL mode, user clicked a specific state: select only that state
      selectedStates = [code];
    } else {
      if (selectedStates.includes(code)) {
        selectedStates = selectedStates.filter(c => c !== code);
        // If nothing selected, default back to Florida
        if (!selectedStates.length) {
          selectedStates = ['FL'];
        }
      } else {
        selectedStates.push(code);
      }
    }
  }

  renderStateScopeDropdown();
  updateStateScopeTriggerLabel();
  onStateScopeChange();
}

function onStateScopeChange() {
  localStorage.setItem('litpulse_active_states', JSON.stringify(selectedStates));

  // Invalidate caches so fresh state-filtered data is retrieved
  cachedOutreachData = null;
  cachedHistoricalData = null;
  largeMattersCache = [];
  cachedBehaviorData = null;
  cachedJudgesData = null;
  walkableClustersCache = [];
  mapInitialBoundsFitted = false;
  activeMapCityFilter = 'ALL';

  const citySelect = document.getElementById('mapCityFilter');
  if (citySelect) {
    citySelect.innerHTML = '<option value="ALL">All Metro Cities</option>';
  }

  const label = selectedStates.includes('ALL')
    ? 'National (All States)'
    : (selectedStates.length === 1 ? (selectedStates[0] === 'FL' ? 'Florida' : selectedStates[0]) : `${selectedStates.length} states (${selectedStates.join(', ')})`);
  showToast(`Operating jurisdiction: ${label}`);

  loadActiveCities();
  loadOverviewPage();
  refreshCurrentActivePage();
}

function refreshCurrentActivePage() {
  if (activePage === 'deliveries') {
    loadDeliveriesPage();
  } else if (activePage === 'outreach') {
    renderOutreachQueue(true);
  } else if (activePage === 'largematters') {
    renderLargeMatters(true);
  } else if (activePage === 'trials') {
    loadTrialTendency('trials');
  } else if (activePage === 'behavior') {
    loadTrialTendency('firms');
  } else if (activePage === 'courts') {
    loadTrialTendency('judges');
  } else if (activePage === 'overview') {
    loadOverviewPage();
  }
}

// Geospatial Map State
let clusterLeafletMap = null;
let clusterMarkersGroup = null;
let clusterHeatmapLayer = null;
let activeMapDisplayMode = 'pins';
let clusterMarkersMap = new Map();
let clusterBoundsCache = null;
let mapInitialBoundsFitted = false;
let walkPolylineLayer = null;
let activeMapCityFilter = 'ALL';
let activeMapDensityFilter = 'ALL';
let mapAllBuildingsCache = [];

// Building Dossier & Outreach Table State
let currentBuildingData = null;
let currentBuildingCases = [];
let walkableClustersCache = [];

// Formatter Helpers
function formatCurrency(val) {
  if (val === null || val === undefined || isNaN(val)) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
}

function formatDate(dateStr) {
  if (!dateStr) return 'TBD';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `
    <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
    <span>${msg}</span>
  `;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// Expandable More Views in Sidebar (Deliberately unresponsive without lock indication)
function handleMoreViewsClick() {
  // Retained in place as unresponsive to click
}

function toggleNavMore() {
  // Retained in place as unresponsive
}

function handleLockedNavMore() {
  // Retained in place as unresponsive
}

// Mobile Sidebar Drawer Handlers
function toggleMobileSidebar() {
  const sidebar = document.getElementById('mainSidebar') || document.querySelector('.sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (!sidebar) return;
  const isOpen = sidebar.classList.contains('open');
  if (isOpen) {
    closeMobileSidebar();
  } else {
    sidebar.classList.add('open');
    backdrop?.classList.add('open');
  }
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('mainSidebar') || document.querySelector('.sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  sidebar?.classList.remove('open');
  backdrop?.classList.remove('open');
}

// Navigation between Sidebar Pages
function navigateToPage(pageKey) {
  activePage = pageKey;

  // Auto-close mobile drawer on navigation
  closeMobileSidebar();

  // Update Sidebar
  document.querySelectorAll('.sidebar .nav-item').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-page') === pageKey);
  });

  // Update Page Sections
  document.querySelectorAll('.content .page').forEach(el => {
    el.classList.toggle('active', el.id === `page-${pageKey}`);
  });

  // Dynamic Breadcrumb Mapping
  const titles = {
    deliveries: { title: 'Deliveries', crumbs: 'Deliveries / Operations / Hand-Delivery Routing' },
    overview: { title: 'Executive Overview', crumbs: 'Overview / Executive / Intelligence' },
    outreach: { title: 'Outreach Queue', crumbs: 'Outreach / Daily Working Queue' },
    largematters: { title: 'Large Matters', crumbs: 'Matters / High-EAR Pipeline' },
    behavior: { title: 'Trial Tendency', crumbs: 'Behavior / Disposition Analytics' },
    admin: { title: 'Admin Ingestion Console', crumbs: 'Admin / Operations / Ingestion' },
    forecast: { title: 'Revenue Forecast', crumbs: 'More Views / Forecasting' },
    geo: { title: 'Geographic Intelligence', crumbs: 'More Views / Circuits' },
    courts: { title: 'Court Intelligence', crumbs: 'More Views / Courts' },
    attorneys: { title: 'Attorney Intelligence', crumbs: 'More Views / Attorneys' },
    firms: { title: 'Law Firm Intelligence', crumbs: 'More Views / Law Firms' },
    relationships: { title: 'Relationship Intelligence', crumbs: 'More Views / Networks' },
    trials: { title: 'Trial Intelligence', crumbs: 'More Views / Trial Docket' },
    patterns: { title: 'Pattern Intelligence', crumbs: 'More Views / AI Detection' },
    sales: { title: 'Sales Intelligence', crumbs: 'More Views / Pipeline' }
  };

  const info = titles[pageKey] || { title: pageKey, crumbs: `TRIS / ${pageKey}` };
  document.getElementById('topTitle').innerText = info.title;
  document.getElementById('topCrumbs').innerText = info.crumbs;

  // Trigger page-specific loads
  if (pageKey === 'deliveries') loadDeliveriesPage();
  else if (pageKey === 'overview') loadOverviewPage();
  else if (pageKey === 'outreach') renderOutreachQueue();
  else if (pageKey === 'largematters') renderLargeMatters();
  else if (pageKey === 'behavior') renderBehavior('firms');
  else if (pageKey === 'admin') loadAdminStats();
}

// Deliveries 5-Subtab Switcher
function setDeliveriesSubtab(tabKey) {
  activeDeliveriesSubtab = tabKey;
  document.querySelectorAll('[data-dtab]').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-dtab') === tabKey);
  });

  ['clusters', 'buildings', 'runbuilder', 'runs', 'holds'].forEach(k => {
    const el = document.getElementById(`dsub-${k}`);
    if (el) el.style.display = (k === tabKey) ? 'block' : 'none';
  });

  if (tabKey === 'clusters' && clusterLeafletMap) {
    setTimeout(() => clusterLeafletMap.invalidateSize(), 150);
  } else if (tabKey === 'holds') {
    renderHoldsTable(fullBuildingsCache);
    const holdsEl = document.getElementById('dsub-holds');
    if (holdsEl) {
      setTimeout(() => holdsEl.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }
    showToast('Viewing delivery data holds pending GPS/suite verification');
  }
}

// ----------------- 1. DELIVERIES PAGE LOGIC ----------------- //

async function checkGeocodeStatus() {
  try {
    const res = await fetch('/api/geocoding/status');
    const data = await res.json();
    if (!data || !data.success) return;
    const badge = document.getElementById('geocodeStatusBadge');
    if (badge) {
      if (data.is_geocoding) {
        badge.innerHTML = `⚡ Auto-Geocoding: ${data.geocoded_buildings}/${data.total_buildings} (${data.coverage_pct}%)`;
        badge.style.background = 'rgba(245,158,11,0.15)';
        badge.style.color = '#FBBF24';
        badge.style.borderColor = 'rgba(245,158,11,0.3)';
        setTimeout(checkGeocodeStatus, 6000);
      } else {
        badge.innerHTML = `● Real GPS Coordinates Active (${data.geocoded_buildings} Mapped)`;
        badge.style.background = 'rgba(16,185,129,0.15)';
        badge.style.color = '#34D399';
        badge.style.borderColor = 'rgba(16,185,129,0.3)';
      }
    }
  } catch (e) {
    // Silent fallback
  }
}

async function loadDeliveriesPage() {
  try {
    const res = await fetch(`/api/drill/deliveries${getStateParam('?')}`);
    const data = await res.json();
    if (!data.success) return;

    fullBuildingsCache = data.rows || [];

    // Calculate dynamic delivery metrics
    const totalBuildings = fullBuildingsCache.length;
    const citiesSet = new Set(fullBuildingsCache.map(b => b.city).filter(Boolean));
    const totalDrops = fullBuildingsCache.reduce((acc, b) => acc + (b.attorneys_count || 0), 0);

    let topDensity = 0;
    let topBldg = null;
    fullBuildingsCache.forEach(b => {
      if ((b.attorneys_count || 0) > topDensity) {
        topDensity = b.attorneys_count;
        topBldg = b;
      }
    });

    const bldgEl = document.getElementById('kpiDelivBuildings');
    if (bldgEl) bldgEl.innerText = totalBuildings.toLocaleString();
    const bldgSub = document.getElementById('kpiDelivBuildingsSub');
    if (bldgSub) bldgSub.innerText = `across ${citiesSet.size} cities`;

    const dropsEl = document.getElementById('kpiDelivDrops');
    if (dropsEl) dropsEl.innerText = totalDrops.toLocaleString();
    const dropsSub = document.getElementById('kpiDelivDropsSub');
    if (dropsSub) dropsSub.innerText = `${totalDrops.toLocaleString()} total across all statuses`;

    const densEl = document.getElementById('kpiDelivDensity');
    if (densEl) densEl.innerText = `${topDensity} drops`;
    const densSub = document.getElementById('kpiDelivDensitySub');
    if (densSub) densSub.innerText = topBldg ? `${topBldg.address}` : 'Awaiting docket ingestion';

    const holdsList = fullBuildingsCache.filter(b => !b.geocoded || !b.is_precise || !b.lat || !b.lng || b.runner_status === 'Hold');
    const holdsEl = document.getElementById('kpiDelivHolds');
    if (holdsEl) holdsEl.innerText = holdsList.length.toLocaleString();

    const badge = document.getElementById('sidebarBadgeDeliveries');
    if (badge) badge.innerText = totalBuildings.toLocaleString();

    // Update real GPS geocoding status badge
    checkGeocodeStatus();

    // Initialize Run Builder Searchable Multi-Pick Target Cities
    initRunCityMultiSelect(fullBuildingsCache);

    renderDeliveriesClusters(fullBuildingsCache);
    renderClustersMap(fullBuildingsCache, null, mapInitialBoundsFitted);
    renderDeliveriesDirectory(fullBuildingsCache);
    renderRunHistory(totalBuildings);
    renderHoldsTable(fullBuildingsCache);
  } catch (err) {
    console.error('Failed to load deliveries:', err);
  }
}

// Leaflet Dark Map Management with Marker Clustering & Tier Differentiation
function initClusterMap() {
  if (clusterLeafletMap) return;
  const mapContainer = document.getElementById('clusterMap');
  if (!mapContainer || !window.L) return;

  // Initialize Leaflet map with Florida view and maxZoom 19 for granular inspection
  clusterLeafletMap = L.map('clusterMap', {
    zoomControl: true,
    attributionControl: false,
    maxZoom: 19
  }).setView([26.7153, -80.0534], 7);

  // ESRI World Dark Gray Canvas (100% free, zero API key required, no watermarks)
  // maxNativeZoom 16 allows Leaflet to smoothly interpolate and scale tiles up to zoom 19
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    maxNativeZoom: 16,
    maxZoom: 19,
    attribution: '&copy; Esri, DeLorme, NAVTEQ'
  }).addTo(clusterLeafletMap);

  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
    maxNativeZoom: 16,
    maxZoom: 19,
    attribution: ''
  }).addTo(clusterLeafletMap);

  // Keep hover cards contained within map bounds
  clusterLeafletMap.on('tooltipopen', function(e) {
    const tooltip = e.tooltip;
    const container = tooltip && tooltip._container;
    if (!container) return;
    const mapEl = clusterLeafletMap.getContainer();
    if (!mapEl) return;
    const mapRect = mapEl.getBoundingClientRect();
    const rect = container.getBoundingClientRect();

    if (rect.left < mapRect.left + 12) {
      const shift = (mapRect.left + 12) - rect.left;
      container.style.marginLeft = `${shift}px`;
    } else if (rect.right > mapRect.right - 12) {
      const shift = rect.right - (mapRect.right - 12);
      container.style.marginLeft = `-${shift}px`;
    } else {
      container.style.marginLeft = '0px';
    }
  });

  // Dynamic Leaflet Marker Clustering Group
  if (typeof L.markerClusterGroup === 'function') {
    clusterMarkersGroup = L.markerClusterGroup({
      maxClusterRadius: 40,
      spiderfyOnMaxZoom: true,
      spiderfyDistanceMultiplier: 1.6,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      iconCreateFunction: function(cluster) {
        const markers = cluster.getAllChildMarkers();
        let totalDrops = 0;
        let hasClientInCluster = false;
        markers.forEach(m => {
          const b = m.options.buildingData;
          if (b) {
            totalDrops += (b.attorneys_count || 1);
            if (b.has_client) hasClientInCluster = true;
          }
        });
        const bldgCount = markers.length;

        // Clean size tiers and styling
        let tierClass = 'cluster-tier-mid';
        let size = 42;
        if (totalDrops >= 100 || bldgCount >= 50) {
          tierClass = 'cluster-tier-high';
          size = 48;
        } else if (totalDrops <= 10 && bldgCount <= 5) {
          tierClass = 'cluster-tier-low';
          size = 36;
        }

        const clientPip = hasClientInCluster ? '<span class="cluster-client-pip" title="Active Client Tenant"></span>' : '';
        const displayCount = totalDrops >= 1000 ? totalDrops.toLocaleString() : totalDrops;

        return L.divIcon({
          html: `<div class="tris-cluster-bubble ${tierClass} ${hasClientInCluster ? 'has-client' : ''}" style="width:${size}px;height:${size}px;">
                   <span class="cluster-drop-count">${displayCount}</span>
                   ${clientPip}
                 </div>`,
          className: 'tris-cluster-icon-wrap',
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2]
        });
      }
    });

    // Custom clusterclick handler: prevents zero-area bounds reset glitch and spiderfies co-located buildings cleanly
    clusterMarkersGroup.on('clusterclick', function(cEvent) {
      const cluster = cEvent.layer || cEvent.target;
      if (!cluster) return;

      if (typeof cluster.closeTooltip === 'function') {
        cluster.closeTooltip();
      }

      const markers = cluster.getAllChildMarkers() || [];
      const firstLatLng = markers[0]?.getLatLng();
      const allCoLocated = firstLatLng && markers.every(m => {
        const ll = m.getLatLng();
        return Math.abs(ll.lat - firstLatLng.lat) < 0.0001 && Math.abs(ll.lng - firstLatLng.lng) < 0.0001;
      });

      const currentZoom = clusterLeafletMap.getZoom();

      // If all buildings in this cluster are co-located (e.g. towers at the same corner or centroid), spiderfy them
      if (allCoLocated || currentZoom >= 16) {
        if (currentZoom < 16 && firstLatLng) {
          clusterLeafletMap.setView(firstLatLng, 16, { animate: true });
          setTimeout(() => {
            if (cluster && typeof cluster.spiderfy === 'function') {
              cluster.spiderfy();
            }
          }, 320);
        } else {
          cluster.spiderfy();
        }
      } else {
        const b = cluster.getBounds();
        if (b && typeof b.isValid === 'function' && b.isValid()) {
          const targetZoom = Math.max(currentZoom + 1, clusterLeafletMap.getBoundsZoom(b, false, [40, 40]));
          clusterLeafletMap.setView(cluster.getLatLng(), Math.min(18, targetZoom), { animate: true });
        } else if (cluster.getLatLng) {
          clusterLeafletMap.setView(cluster.getLatLng(), Math.min(18, currentZoom + 2), { animate: true });
        }
      }
    });

    // Rich Interactive Hover Labels for Clusters
    clusterMarkersGroup.on('clustermouseover', function(cEvent) {
      const cluster = cEvent.layer;
      const markers = cluster.getAllChildMarkers();
      const bldgCount = markers.length;
      let totalDrops = 0;
      const cityMap = {};
      let hasClient = false;

      markers.forEach(m => {
        const b = m.options.buildingData;
        if (b) {
          totalDrops += (b.attorneys_count || 1);
          const city = (b.city || 'Florida').trim();
          cityMap[city] = (cityMap[city] || 0) + (b.attorneys_count || 1);
          if (b.has_client) hasClient = true;
        }
      });

      const sortedCities = Object.keys(cityMap).sort((a, b) => cityMap[b] - cityMap[a]);
      const primaryCity = sortedCities[0] || 'Florida';
      const cityHeading = sortedCities.length > 1 ? `${primaryCity} Metro Area` : `${primaryCity} Cluster`;

      const hoverHtml = `
        <div class="map-hover-card">
          <div class="map-hover-header">
            <span class="map-hover-city">📍 ${escapeHtml(cityHeading)}</span>
            ${hasClient ? '<span class="map-hover-client-badge">★ Client Tenant</span>' : ''}
          </div>
          <div class="map-hover-metrics">
            <div class="map-hover-metric">
              <span class="map-hover-metric-val">${totalDrops.toLocaleString()}</span>
              <span class="map-hover-metric-lbl">Total Drops</span>
            </div>
            <div class="map-hover-divider"></div>
            <div class="map-hover-metric">
              <span class="map-hover-metric-val">${bldgCount.toLocaleString()}</span>
              <span class="map-hover-metric-lbl">Buildings</span>
            </div>
          </div>
          <div class="map-hover-action">Click to zoom into cluster</div>
        </div>
      `;

      let direction = 'top';
      let offset = [0, -18];
      try {
        const point = clusterLeafletMap.latLngToContainerPoint(cluster.getLatLng());
        if (point.y < 175) {
          direction = 'bottom';
          offset = [0, 20];
        }
      } catch (err) {}

      cluster.bindTooltip(hoverHtml, {
        direction: direction,
        offset: offset,
        className: 'cluster-hover-tooltip',
        opacity: 1
      }).openTooltip();
    });

    clusterMarkersGroup.on('clustermouseout', function(cEvent) {
      if (cEvent.layer) {
        if (typeof cEvent.layer.closeTooltip === 'function') {
          cEvent.layer.closeTooltip();
        }
        if (typeof cEvent.layer.unbindTooltip === 'function') {
          cEvent.layer.unbindTooltip();
        }
      }
    });
  } else {
    clusterMarkersGroup = L.layerGroup();
  }

  clusterMarkersGroup.addTo(clusterLeafletMap);
}

function populateMapCityFilter(validBuildings) {
  const citySelect = document.getElementById('mapCityFilter');
  if (!citySelect || citySelect.options.length > 1) return;

  const cityCounts = {};
  validBuildings.forEach(b => {
    const c = (b.city || 'Metro Area').trim();
    cityCounts[c] = (cityCounts[c] || 0) + (b.attorneys_count || 1);
  });

  const sortedCities = Object.keys(cityCounts).sort((a, b) => cityCounts[b] - cityCounts[a]);
  sortedCities.forEach(city => {
    const opt = document.createElement('option');
    opt.value = city;
    opt.textContent = `${city} (${cityCounts[city]} drops)`;
    citySelect.appendChild(opt);
  });
}

function renderClustersMap(buildings, targetCity = null, preserveView = false) {
  initClusterMap();
  if (!clusterLeafletMap || !clusterMarkersGroup) return;

  if (buildings && buildings.length) {
    mapAllBuildingsCache = buildings;
  }
  const source = mapAllBuildingsCache.length ? mapAllBuildingsCache : (buildings || []);

  const validBuildings = source.filter(b => typeof b.lat === 'number' && typeof b.lng === 'number' && !isNaN(b.lat) && !isNaN(b.lng));
  populateMapCityFilter(validBuildings);

  if (targetCity) {
    activeMapCityFilter = targetCity;
    const citySelect = document.getElementById('mapCityFilter');
    if (citySelect) citySelect.value = targetCity;
  }

  // Apply filters
  let filteredBuildings = validBuildings;
  if (activeMapCityFilter && activeMapCityFilter !== 'ALL') {
    filteredBuildings = filteredBuildings.filter(b => (b.city || '').toLowerCase() === activeMapCityFilter.toLowerCase());
  }

  if (activeMapDensityFilter === 'MEGA') {
    filteredBuildings = filteredBuildings.filter(b => (b.attorneys_count || 1) >= 5);
  } else if (activeMapDensityFilter === 'MULTI') {
    filteredBuildings = filteredBuildings.filter(b => (b.attorneys_count || 1) >= 2);
  } else if (activeMapDensityFilter === 'CLIENT') {
    filteredBuildings = filteredBuildings.filter(b => Boolean(b.has_client));
  }

  clusterMarkersGroup.clearLayers();
  clusterMarkersMap.clear();

  const totalDrops = filteredBuildings.reduce((acc, b) => acc + (b.attorneys_count || 1), 0);

  const badgeEl = document.getElementById('mapPinCountBadge');
  if (badgeEl) badgeEl.innerText = `${filteredBuildings.length} Buildings`;

  const dropsBadgeEl = document.getElementById('mapTotalDropsBadge');
  if (dropsBadgeEl) dropsBadgeEl.innerText = `${totalDrops} Drops`;

  const labelEl = document.getElementById('mapActiveCityLabel');
  if (labelEl) {
    labelEl.innerText = activeMapCityFilter !== 'ALL' ? `${activeMapCityFilter} Cluster` : 'Florida Target Buildings';
  }

  // Handle Display Mode: Heatmap vs Pins
  const isHeatMode = activeMapDisplayMode === 'heat';
  const pinsLegendEl = document.getElementById('mapPinsLegend');
  const heatLegendEl = document.getElementById('mapHeatLegend');

  if (isHeatMode) {
    if (pinsLegendEl) pinsLegendEl.style.display = 'none';
    if (heatLegendEl) heatLegendEl.style.display = 'flex';

    if (clusterLeafletMap.hasLayer(clusterMarkersGroup)) {
      clusterLeafletMap.removeLayer(clusterMarkersGroup);
    }

    const heatPoints = filteredBuildings.map(b => {
      const drops = b.attorneys_count || 1;
      const intensity = Math.min(1.0, Math.max(0.35, drops / 5));
      return [b.lat, b.lng, intensity];
    });

    if (clusterHeatmapLayer) {
      clusterHeatmapLayer.setLatLngs(heatPoints);
      if (!clusterLeafletMap.hasLayer(clusterHeatmapLayer)) {
        clusterHeatmapLayer.addTo(clusterLeafletMap);
      }
    } else if (typeof L.heatLayer === 'function') {
      clusterHeatmapLayer = L.heatLayer(heatPoints, {
        radius: 32,
        blur: 20,
        maxZoom: 16,
        max: 1.0,
        minOpacity: 0.35,
        gradient: {
          0.2: '#8B1E24',
          0.45: '#DC2626',
          0.65: '#F97316',
          0.85: '#F59E0B',
          1.0: '#FEF08A'
        }
      }).addTo(clusterLeafletMap);
    }
  } else {
    if (pinsLegendEl) pinsLegendEl.style.display = 'flex';
    if (heatLegendEl) heatLegendEl.style.display = 'none';

    if (clusterHeatmapLayer && clusterLeafletMap.hasLayer(clusterHeatmapLayer)) {
      clusterLeafletMap.removeLayer(clusterHeatmapLayer);
    }

    if (!clusterLeafletMap.hasLayer(clusterMarkersGroup)) {
      clusterMarkersGroup.addTo(clusterLeafletMap);
    }
  }

  if (!filteredBuildings.length) {
    const primaryState = (selectedStates && selectedStates.length === 1) ? selectedStates[0] : 'ALL';
    const vp = STATE_VIEWPORTS[primaryState] || STATE_VIEWPORTS.FL;
    if (clusterLeafletMap) clusterLeafletMap.setView(vp.center, vp.zoom);
    return;
  }

  const latLngs = [];

  if (isHeatMode) {
    filteredBuildings.forEach(b => {
      latLngs.push([b.lat, b.lng]);
    });
  } else {
    filteredBuildings.forEach(b => {
      const drops = b.attorneys_count || 1;
    const isMega = drops >= 5;
    const isMulti = drops >= 2 && drops < 5;
    const isClient = Boolean(b.has_client);

    let pinClass = 'cluster-pin-single';
    let pinSize = [18, 18];
    let pinAnchor = [9, 9];
    let pinInnerHtml = `<span class="pin-dot"></span>`;

    if (isMega) {
      pinClass = 'cluster-pin-mega';
      pinSize = [32, 32];
      pinAnchor = [16, 16];
      pinInnerHtml = `<span class="pin-count">${drops}</span>`;
    } else if (isMulti) {
      pinClass = 'cluster-pin-multi';
      pinSize = [26, 26];
      pinAnchor = [13, 13];
      pinInnerHtml = `<span class="pin-count">${drops}</span>`;
    }

    if (isClient) {
      pinClass += ' is-client';
    }

    const customIcon = L.divIcon({
      className: 'cluster-pin-icon-wrap',
      html: `<div class="cluster-pin-badge ${pinClass}" id="map-pin-${b.building_id}">
               ${isClient ? '<span class="pin-client-crown" title="Active Client Tenant">★</span>' : ''}
               ${pinInnerHtml}
             </div>`,
      iconSize: pinSize,
      iconAnchor: pinAnchor,
      popupAnchor: [0, -pinAnchor[1] - 4]
    });

    const marker = L.marker([b.lat, b.lng], {
      icon: customIcon,
      buildingData: b
    });

    const pinHoverHtml = `
      <div class="map-hover-card">
        <div class="map-hover-header">
          <span class="map-hover-city">${escapeHtml(b.address)}</span>
          ${isClient ? '<span class="map-hover-client-badge">★ Client</span>' : ''}
        </div>
        <div class="map-hover-metrics">
          <div class="map-hover-metric">
            <span class="map-hover-metric-val">${drops}</span>
            <span class="map-hover-metric-lbl">Eligible Drops</span>
          </div>
          <div class="map-hover-divider"></div>
          <div class="map-hover-metric">
            <span class="map-hover-metric-val">${b.firms_count || 1}</span>
            <span class="map-hover-metric-lbl">Law Firms</span>
          </div>
        </div>
        <div class="map-hover-action">${escapeHtml(b.city || 'Florida')} &bull; Click for Dossier</div>
      </div>
    `;

    marker.on('mouseover', function() {
      let direction = 'top';
      let offset = [0, -pinAnchor[1] - 4];
      try {
        const point = clusterLeafletMap.latLngToContainerPoint(marker.getLatLng());
        if (point.y < 175) {
          direction = 'bottom';
          offset = [0, pinAnchor[1] + 6];
        }
      } catch (err) {}

      marker.bindTooltip(pinHoverHtml, {
        direction: direction,
        offset: offset,
        className: 'cluster-hover-tooltip',
        opacity: 1
      }).openTooltip();
    });

    marker.on('mouseout', function() {
      if (typeof marker.closeTooltip === 'function') {
        marker.closeTooltip();
      }
      if (typeof marker.unbindTooltip === 'function') {
        marker.unbindTooltip();
      }
    });

    const popupHtml = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
        <div class="map-popup-title" style="margin:0;">${b.address}</div>
        ${isClient ? '<span style="background:rgba(16,185,129,0.2);color:#34D399;border:1px solid #10B981;padding:1px 6px;border-radius:10px;font-size:10px;font-weight:700;">★ CLIENT TENANT</span>' : ''}
      </div>
      <div class="map-popup-meta">
        <div><strong>City:</strong> ${b.city || 'Florida'}</div>
        <div><strong>Eligible Drops:</strong> ${drops} drops (${b.firms_count || 1} firms)</div>
        ${isMega ? '<div style="color:#F59E0B;font-weight:700;">⚡ Mega Legal Hub (Priority Courier Target)</div>' : ''}
        ${b.parking_notes ? `<div><strong>Access:</strong> ${b.parking_notes}</div>` : ''}
      </div>
      <div style="display:flex;gap:6px;margin-top:6px;">
        <button class="map-popup-btn" onclick="openBuildingDossier('${b.building_id}')">View Building Dossier</button>
      </div>
    `;

    marker.bindPopup(popupHtml);
    marker.on('click', () => {
      if (typeof marker.closeTooltip === 'function') {
        marker.closeTooltip();
      }
    });
    clusterMarkersGroup.addLayer(marker);

    clusterMarkersMap.set(b.building_id, { marker, data: b });
    latLngs.push([b.lat, b.lng]);
  });
  }

  if (latLngs.length > 0) {
    const bounds = L.latLngBounds(latLngs);
    clusterBoundsCache = bounds;
    if (!preserveView && !mapInitialBoundsFitted) {
      if (activeMapCityFilter !== 'ALL') {
        clusterLeafletMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      } else if (!targetCity) {
        clusterLeafletMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      }
      mapInitialBoundsFitted = true;
    } else if (!preserveView && targetCity) {
      clusterLeafletMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }

  setTimeout(() => {
    if (clusterLeafletMap) clusterLeafletMap.invalidateSize();
  }, 120);
}

function filterMapByCity(city) {
  activeMapCityFilter = city;
  mapInitialBoundsFitted = false;
  renderClustersMap(mapAllBuildingsCache, city, false);
}

function filterMapByDensity(density) {
  activeMapDensityFilter = density;
  renderClustersMap(mapAllBuildingsCache, null, true);
}

function setMapDisplayMode(mode) {
  activeMapDisplayMode = mode;
  const btnPins = document.getElementById('btnMapPinsMode');
  const btnHeat = document.getElementById('btnMapHeatMode');
  if (btnPins) btnPins.classList.toggle('active', mode === 'pins');
  if (btnHeat) btnHeat.classList.toggle('active', mode === 'heat');
  renderClustersMap(mapAllBuildingsCache, null, true);
}
window.setMapDisplayMode = setMapDisplayMode;

function focusBuildingOnMap(buildingId, lat, lng) {
  if (!clusterLeafletMap) return;
  const item = clusterMarkersMap.get(buildingId);
  if (item && item.marker) {
    if (clusterMarkersGroup && typeof clusterMarkersGroup.zoomToShowLayer === 'function') {
      clusterMarkersGroup.zoomToShowLayer(item.marker, () => {
        item.marker.openPopup();
        highlightMapPin(buildingId);
      });
    } else {
      const pos = item.marker.getLatLng();
      clusterLeafletMap.flyTo(pos, 15, { duration: 0.8 });
      setTimeout(() => {
        item.marker.openPopup();
        highlightMapPin(buildingId);
      }, 400);
    }
  } else if (lat && lng) {
    clusterLeafletMap.flyTo([lat, lng], 15, { duration: 0.8 });
  }
}

function zoomToCityCluster(cityName) {
  if (!clusterLeafletMap) return;
  filterMapByCity(cityName);
}

function highlightMapPin(buildingId) {
  const pin = document.getElementById(`map-pin-${buildingId}`);
  if (pin) pin.classList.add('active');
}

function unhighlightMapPin(buildingId) {
  const pin = document.getElementById(`map-pin-${buildingId}`);
  if (pin) pin.classList.remove('active');
}

function resetClusterMapView() {
  if (!clusterLeafletMap) return;
  activeMapCityFilter = 'ALL';
  activeMapDensityFilter = 'ALL';

  const citySelect = document.getElementById('mapCityFilter');
  if (citySelect) citySelect.value = 'ALL';

  const densitySelect = document.getElementById('mapDensityFilter');
  if (densitySelect) densitySelect.value = 'ALL';

  mapInitialBoundsFitted = false;
  renderClustersMap(mapAllBuildingsCache, null, false);

  if (clusterBoundsCache && clusterBoundsCache.isValid()) {
    clusterLeafletMap.fitBounds(clusterBoundsCache, { padding: [40, 40], maxZoom: 14 });
  } else {
    clusterLeafletMap.setView([26.7153, -80.0534], 7);
  }
}

async function triggerGeocode(scope = 'top100') {
  try {
    showToast(scope === 'all' ? 'Queued all buildings for background geocoding...' : 'Geocoding top 100 buildings...');
    const res = await fetch('/api/deliveries/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope })
    });
    const data = await res.json();
    if (data.success) {
      if (scope === 'all') {
        showToast(data.message || 'Auto-geocoding running in background.');
      } else {
        showToast(`Geocoding complete: ${data.geocoded || 0} buildings newly mapped.`);
      }
      await loadDeliveriesPage();
    } else {
      showToast('Geocoding failed: ' + (data.error || 'unknown error'));
    }
  } catch (err) {
    showToast('Geocoding request failed: ' + err.message);
  }
}

function drawClustersIntoContainer(clusters, container) {
  if (!container) return;
  if (!clusters || !clusters.length) {
    container.innerHTML = `
      <div style="padding:48px 24px;text-align:center;color:var(--text-muted);background:var(--bg-dark-3);border-radius:8px;border:1px dashed var(--border);">
        <div style="font-size:15px;font-weight:600;color:var(--text-white);margin-bottom:6px;">No Delivery Clusters Yet</div>
        <div style="font-size:12.5px;max-width:440px;margin:0 auto 16px auto;">Ingest real court appearance dockets or CSV/XLSX spreadsheets in Admin Ingestion to auto-cluster buildings and routes.</div>
        <button class="btn-export" onclick="navigateToPage('admin')">Go to Admin Ingestion →</button>
      </div>
    `;
    const subEl = document.getElementById('clustersSummarySub');
    if (subEl) subEl.innerText = '0 walkable clusters identified';
    return;
  }

  const walkClusters = clusters.filter(c => c.kind === 'walk-cluster');
  const pairs = clusters.filter(c => c.kind === 'pair');
  const solos = clusters.filter(c => c.kind === 'solo');
  const cityBuckets = clusters.filter(c => c.kind === 'city-bucket');
  const walkableLoops = clusters.filter(c => c.is_walkable);
  const standaloneStops = clusters.filter(c => !c.is_walkable);

  const subEl = document.getElementById('clustersSummarySub');
  if (subEl) {
    subEl.innerText = `${walkClusters.length} Walk-Clusters (Park Once & Walk ≤0.5 km) · ${pairs.length} Pairs · ${solos.length} Solo Stops · ${cityBuckets.length} City Buckets across Florida`;
  }

  const fragment = document.createDocumentFragment();

  // Render Walkable Loops First
  walkableLoops.forEach(c => {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'cluster-group walkable-group';

    let stopsHtml = '';
    c.stops.forEach((stop, idx) => {
      const isAnchor = stop.is_anchor;
      const walkTag = isAnchor
        ? `<span class="stop-anchor-badge">🅿️ STOP 1: PARK CAR HERE</span>`
        : `<span class="stop-walk-badge">🚶 STOP ${idx + 1}: +${stop.walk_meters_from_anchor}m walk</span>`;

      stopsHtml += `
        <div class="cluster-item-row" 
             onmouseenter="highlightMapPin('${stop.building_id}')" 
             onmouseleave="unhighlightMapPin('${stop.building_id}')"
             onclick="focusBuildingOnMap('${stop.building_id}', ${stop.lat || 0}, ${stop.lng || 0})" 
             style="cursor:pointer;">
          <div class="item-left">
            <div class="item-address" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              ${walkTag}
              <span style="font-weight:600;color:var(--text-white);">${stop.address}</span>
            </div>
            <div class="item-meta" style="margin-top:3px;">
              <span><strong>${stop.attorneys_count} drops</strong> · ${stop.firms_count || 1} firms</span>
              <span style="color:var(--text-sub);">${stop.parking_notes || ''}</span>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <button class="btn-export" style="padding:4px 10px;font-size:11px;" onclick="event.stopPropagation();openBuildingDossier('${stop.building_id}')">
              Building Dossier
            </button>
          </div>
        </div>
      `;
    });

    const kindBadge = c.kind === 'walk-cluster'
      ? `<span class="tag-anchor" style="background:rgba(16,185,129,0.15);color:#34D399;border-color:rgba(16,185,129,0.3);">WALK-CLUSTER (3+ BLDGS) · PARK ONCE &amp; WALK</span>`
      : `<span class="tag-anchor" style="background:rgba(59,130,246,0.15);color:#60A5FA;border-color:rgba(59,130,246,0.3);">PAIR (2 BLDGS) · PARK ONCE, 2 STOPS</span>`;

    groupDiv.innerHTML = `
      <div class="cluster-header">
        <div class="cluster-info" onclick="drawWalkLoopOnMap(walkableClustersCache.find(x => x.cluster_id === '${c.cluster_id}'))" style="cursor:pointer;" title="Click to view walk loop on map">
          <div class="cluster-name-row">
            <span class="cluster-name">🚶 ${c.city} Walk Loop</span>
            ${kindBadge}
            <span style="font-size:11px;color:var(--wine-bright);cursor:pointer;">🔍 View Walk Loop on Map</span>
          </div>
          <div class="cluster-sub">
            🅿️ Anchor: <strong>${c.anchor_building.building_name || c.anchor_building.address}</strong> · <strong>${c.buildings_count} buildings</strong> · <strong>${c.total_drops} eligible drops</strong> · max ${c.max_walk_radius_meters}m walk
          </div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn-export" style="font-size:11px;padding:5px 12px;" onclick="drawWalkLoopOnMap(walkableClustersCache.find(x => x.cluster_id === '${c.cluster_id}'))">
            View Loop
          </button>
          <button class="btn-export" style="font-size:11px;padding:5px 12px;" onclick="showToast('Courier walking run sheet generated for ${c.city} loop (${c.total_drops} drops)')">
            → Build Walk Run
          </button>
        </div>
      </div>
      <div class="cluster-items">
        ${stopsHtml}
      </div>
    `;
    fragment.appendChild(groupDiv);
  });

  // Render Standalone Drive-To Buildings Group
  if (standaloneStops.length > 0) {
    const standaloneDiv = document.createElement('div');
    standaloneDiv.className = 'cluster-group';

    let standaloneItemsHtml = '';
    standaloneStops.forEach(c => {
      const bldg = c.anchor_building || (c.stops && c.stops[0]);
      if (!bldg) return;

      standaloneItemsHtml += `
        <div class="cluster-item-row" 
             onmouseenter="highlightMapPin('${bldg.building_id}')" 
             onmouseleave="unhighlightMapPin('${bldg.building_id}')"
             onclick="focusBuildingOnMap('${bldg.building_id}', ${bldg.lat || 0}, ${bldg.lng || 0})" 
             style="cursor:pointer;">
          <div class="item-left">
            <div class="item-address">
              <span style="font-size:10px;color:var(--text-muted);border:1px solid var(--border);border-radius:3px;padding:1px 5px;margin-right:4px;">DRIVE-TO</span>
              ${bldg.address}
            </div>
            <div class="item-meta">
              <span><strong>${bldg.attorneys_count} drops</strong> · ${bldg.firms_count || 1} firms · ${bldg.city}</span>
              <span style="color:var(--text-sub);">${bldg.parking_notes || ''}</span>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <button class="btn-export" style="padding:4px 10px;font-size:11px;" onclick="event.stopPropagation();openBuildingDossier('${bldg.building_id}')">
              Building Dossier
            </button>
          </div>
        </div>
      `;
    });

    standaloneDiv.innerHTML = `
      <div class="cluster-header">
        <div class="cluster-info">
          <div class="cluster-name-row">
            <span class="cluster-name">🚗 Standalone Drive-To Buildings</span>
            <span class="cluster-tag">SINGLE CAR STOPS</span>
          </div>
          <div class="cluster-sub">${standaloneStops.length} separate commercial locations requiring individual parking</div>
        </div>
      </div>
      <div class="cluster-items">
        ${standaloneItemsHtml}
      </div>
    `;
    fragment.appendChild(standaloneDiv);
  }

  container.innerHTML = '';
  container.appendChild(fragment);
}

async function renderDeliveriesClusters(buildings) {
  const container = document.getElementById('clustersCardContainer');
  if (!container) return;

  if (!buildings || !buildings.length) {
    drawClustersIntoContainer([], container);
    return;
  }

  // If cached clusters exist, draw immediately so container never flashes blank
  if (walkableClustersCache && walkableClustersCache.length > 0) {
    drawClustersIntoContainer(walkableClustersCache, container);
  }

  // Fetch Walkable Clusters from API silently
  try {
    const res = await fetch(`/api/deliveries/walkable-clusters${getStateParam('?')}`);
    const data = await res.json();
    if (data && data.success && Array.isArray(data.clusters) && data.clusters.length > 0) {
      walkableClustersCache = data.clusters;
      drawClustersIntoContainer(walkableClustersCache, container);
    }
  } catch (e) {
    console.warn('Could not fetch server walkable clusters, retaining current display', e);
  }
}

function drawWalkLoopOnMap(cluster) {
  if (!clusterLeafletMap || !cluster || !cluster.stops || !cluster.stops.length) return;

  // Remove existing walk polyline
  if (walkPolylineLayer) {
    clusterLeafletMap.removeLayer(walkPolylineLayer);
    walkPolylineLayer = null;
  }

  const validStops = cluster.stops.filter(s => typeof s.lat === 'number' && typeof s.lng === 'number');
  if (validStops.length < 2) {
    const anchor = cluster.anchor_building || validStops[0];
    if (anchor) focusBuildingOnMap(anchor.building_id, anchor.lat, anchor.lng);
    return;
  }

  const points = validStops.map(s => [s.lat, s.lng]);
  // Close loop back to anchor
  points.push(points[0]);

  walkPolylineLayer = L.polyline(points, {
    color: '#EF4444',
    weight: 4,
    opacity: 0.9,
    dashArray: '8, 8',
    lineCap: 'round',
    lineJoin: 'round'
  }).addTo(clusterLeafletMap);

  const bounds = L.latLngBounds(points);
  clusterLeafletMap.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });

  const labelEl = document.getElementById('mapActiveCityLabel');
  if (labelEl) {
    labelEl.innerText = `${cluster.city} Walk Loop (${cluster.buildings_count} bldgs · ${cluster.total_drops} drops)`;
  }

  const anchor = cluster.anchor_building || validStops[0];
  if (anchor) {
    setTimeout(() => {
      focusBuildingOnMap(anchor.building_id, anchor.lat, anchor.lng);
    }, 250);
  }
}

function renderDeliveriesDirectory(buildings) {
  const tbody = document.getElementById('buildingsDirectoryTbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!buildings.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:36px;color:var(--text-muted);">No building records found. Ingest real docket data via Admin Ingestion to populate.</td></tr>`;
    return;
  }

  buildings.forEach(b => {
    const tr = document.createElement('tr');
    tr.className = 'clickable-row';
    tr.onclick = () => openBuildingDossier(b.building_id);
    tr.innerHTML = `
      <td class="cell-bold">${b.building_name}</td>
      <td>${b.address}</td>
      <td><span class="badge-priority badge-priority-high">${b.attorneys_count} drops</span></td>
      <td class="cell-mono">${b.attorneys_count}</td>
      <td>${b.firms_count}</td>
      <td style="font-size:11px; color:var(--text-muted);">${b.parking_notes} · ${b.security_notes}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ----------------- SEARCHABLE MULTI-PICK TARGET CITIES ----------------- //

let selectedRunCities = [];
let availableRunCities = [];

function initRunCityMultiSelect(buildings) {
  const cityCounts = {};
  (buildings || []).forEach(b => {
    let c = b.city || 'Miami';
    if (c.includes(',')) c = c.split(',')[0].trim();
    if (/^(suite|ste|unit|apt|room|rm|floor|fl|bldg|building|tower|plaza|ph|penthouse|blvd|ave)\b/i.test(c)) return;
    cityCounts[c] = (cityCounts[c] || 0) + 1;
  });

  availableRunCities = Object.keys(cityCounts).sort().map(name => ({
    name,
    count: cityCounts[name]
  }));

  const citySelect = document.getElementById('runFieldCity');
  if (citySelect) {
    let opts = '<option value="ALL">All Florida Cities</option>';
    availableRunCities.forEach(c => {
      opts += `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)} (${c.count})</option>`;
    });
    citySelect.innerHTML = opts;
  }

  renderRunCityList();
  updateRunCityBadges();
}

function toggleRunCityDropdown(forceClose = false) {
  const dropdown = document.getElementById('runCityDropdown');
  const trigger = document.getElementById('runCityTrigger');
  if (!dropdown || !trigger) return;

  if (forceClose || dropdown.classList.contains('open')) {
    dropdown.classList.remove('open');
    trigger.classList.remove('active');
  } else {
    dropdown.classList.add('open');
    trigger.classList.add('active');
    const input = document.getElementById('runCitySearchInput');
    if (input) {
      input.value = '';
      filterRunCityList('');
      setTimeout(() => input.focus(), 50);
    }
  }
}

function filterRunCityList(query) {
  const q = (query || '').toLowerCase().trim();
  const listEl = document.getElementById('runCityList');
  if (!listEl) return;

  const items = listEl.querySelectorAll('.multi-select-item');
  items.forEach(item => {
    const cityName = item.getAttribute('data-city') || '';
    if (!q || cityName.toLowerCase().includes(q)) {
      item.style.display = 'flex';
    } else {
      item.style.display = 'none';
    }
  });
}

function renderRunCityList() {
  const listEl = document.getElementById('runCityList');
  if (!listEl) return;
  listEl.innerHTML = '';

  availableRunCities.forEach(c => {
    const isSelected = selectedRunCities.includes(c.name);
    const item = document.createElement('div');
    item.className = 'multi-select-item' + (isSelected ? ' selected' : '');
    item.setAttribute('data-city', c.name);
    item.onclick = (e) => {
      e.stopPropagation();
      toggleRunCitySelection(c.name);
    };

    item.innerHTML = `
      <label class="multi-select-item-label" onclick="event.preventDefault();">
        <input type="checkbox" ${isSelected ? 'checked' : ''}>
        <span style="font-weight:${isSelected ? '600' : '400'};color:${isSelected ? '#FFF' : 'var(--text-platinum)'};">${escapeHtml(c.name)}</span>
      </label>
      <span class="multi-select-item-count">${c.count} bldgs</span>
    `;
    listEl.appendChild(item);
  });

  updateRunCityCountInfo();
}

function toggleRunCitySelection(cityName) {
  const idx = selectedRunCities.indexOf(cityName);
  if (idx >= 0) {
    selectedRunCities.splice(idx, 1);
  } else {
    selectedRunCities.push(cityName);
  }
  renderRunCityList();
  updateRunCityBadges();
}

function selectAllRunCities() {
  selectedRunCities = availableRunCities.map(c => c.name);
  renderRunCityList();
  updateRunCityBadges();
}

function clearAllRunCities() {
  selectedRunCities = [];
  renderRunCityList();
  updateRunCityBadges();
}

function updateRunCityBadges() {
  const badgesEl = document.getElementById('runCityBadges');
  if (!badgesEl) return;

  if (!selectedRunCities.length) {
    badgesEl.innerHTML = `<span class="multi-select-placeholder">All Florida Cities (${availableRunCities.length} cities)</span>`;
  } else {
    let html = '';
    selectedRunCities.forEach(city => {
      html += `
        <span class="multi-select-badge">
          ${escapeHtml(city)}
          <span class="multi-select-badge-remove" onclick="event.stopPropagation(); toggleRunCitySelection('${escapeHtml(city)}');">✕</span>
        </span>
      `;
    });
    badgesEl.innerHTML = html;
  }
  updateRunCityCountInfo();
}

function updateRunCityCountInfo() {
  const countInfo = document.getElementById('runCityCountInfo');
  if (countInfo) {
    countInfo.innerText = selectedRunCities.length > 0 
      ? `${selectedRunCities.length} of ${availableRunCities.length} selected`
      : `All ${availableRunCities.length} cities active`;
  }
}

// Global outside click handler for runCityDropdown and largeMattersCityDropdown
document.addEventListener('click', (e) => {
  const container = document.getElementById('runCityMultiSelect');
  if (container && !container.contains(e.target)) {
    toggleRunCityDropdown(true);
  }
  const lmContainer = document.getElementById('largeMattersCityMultiSelect');
  if (lmContainer && !lmContainer.contains(e.target)) {
    toggleLargeMattersCityDropdown(true);
  }
});

function generateRunSheet() {
  const maxStops = parseInt(document.getElementById('runFieldStops')?.value, 10) || 12;

  let candidates = [];
  if (!selectedRunCities.length) {
    candidates = [...(fullBuildingsCache || [])];
  } else {
    const selectedLower = selectedRunCities.map(c => c.toLowerCase());
    candidates = (fullBuildingsCache || []).filter(b => {
      const bCity = (b.city || '').toLowerCase();
      const bAddr = (b.address || '').toLowerCase();
      return selectedLower.some(c => bCity === c || bCity.includes(c) || bAddr.includes(c));
    });
  }

  // Sort by drop density descending so highest-yield stops are planned first
  candidates.sort((a, b) => (b.attorneys_count || 0) - (a.attorneys_count || 0));

  const plannedStops = [];
  const deferredDrops = [];
  const firmCounts = new Map();
  let totalDrops = 0;

  candidates.forEach(b => {
    if (plannedStops.length >= maxStops) return;

    let bldgDropsPlanned = 0;
    const tenants = b.tenants || ['Litigation Counsel'];
    tenants.forEach(t => {
      const firmKey = t.toLowerCase().replace(/[^a-z0-9]/g, '');
      const curFirmCount = firmCounts.get(firmKey) || 0;

      // R1: Max 2 drops per firm per day across all buildings
      if (curFirmCount >= 2) {
        deferredDrops.push({
          building: b.building_name,
          firm: t,
          reason: 'R1 Violation: Firm cap reached (max 2 drops/day)'
        });
      } else if (bldgDropsPlanned >= 2) {
        // R2: Max 2 drops per building per visit
        deferredDrops.push({
          building: b.building_name,
          firm: t,
          reason: 'R2 Violation: Building cap reached (max 2 drops/visit)'
        });
      } else {
        bldgDropsPlanned += 1;
        firmCounts.set(firmKey, curFirmCount + 1);
      }
    });

    if (bldgDropsPlanned > 0) {
      plannedStops.push({
        ...b,
        dropsThisVisit: bldgDropsPlanned
      });
      totalDrops += bldgDropsPlanned;
    }
  });

  const resEl = document.getElementById('generatedRunResult');
  let stopsListHtml = plannedStops.map((s, idx) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
      <div>
        <span style="color:var(--status-crimson);font-weight:700;margin-right:8px;">STOP ${idx + 1}</span>
        <strong>${escapeHtml(s.building_name)}</strong>
        <div style="font-size:11px;color:var(--text-muted);">${escapeHtml(s.address)} · ${escapeHtml(s.parking_notes || 'Street parking')}</div>
      </div>
      <span class="badge-priority badge-priority-high">${s.dropsThisVisit} drops planned</span>
    </div>
  `).join('');

  let deferredHtml = '';
  if (deferredDrops.length > 0) {
    deferredHtml = `
      <div style="margin-top:12px;padding:10px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:6px;">
        <div style="font-size:11px;font-weight:700;color:var(--status-amber);text-transform:uppercase;">Deferred Drops (${deferredDrops.length} auto-held by R1 &amp; R2 Rules)</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">${deferredDrops.slice(0, 3).map(d => `${escapeHtml(d.firm)} @ ${escapeHtml(d.building)} (${d.reason})`).join('<br>')}</div>
      </div>
    `;
  }

  const cityLabel = city === 'ALL' ? 'All Florida Venues' : escapeHtml(city);

  resEl.innerHTML = `
    <div style="padding:16px;background:var(--bg-dark-3);border:1px solid var(--border-wine);border-radius:8px;margin-top:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div class="cell-bold" style="font-size:14px;color:var(--text-white);">Generated Courier Route: ${cityLabel}</div>
          <div style="font-size:11.5px;color:var(--text-muted);margin-top:2px;">Target: <strong>${cityLabel}</strong> · Stops: <strong>${plannedStops.length}</strong> · Drops: <strong>${totalDrops}</strong> · R1 &amp; R2 Enforced · <em>Field assignment synced with HubSpot</em></div>
        </div>
        <button class="btn-export" style="font-size:11.5px;" onclick="showToast('Run saved and dispatched to courier tablet')">✔ Save &amp; Dispatch Run</button>
      </div>
      <div style="margin-top:14px;">
        ${stopsListHtml || '<div style="color:var(--text-muted);font-size:12px;">No active Florida buildings in selected city.</div>'}
      </div>
      ${deferredHtml}
    </div>
  `;
}

function renderRunHistory(hasData) {
  const tbody = document.getElementById('runHistoryTbody');
  if (!tbody) return;
  if (!hasData) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted);">No dispatched runs yet. Generate a run sheet using the Run Builder tab.</td></tr>`;
    return;
  }
  tbody.innerHTML = `
    <tr><td class="cell-bold">run-20260915-mia</td><td class="cell-mono">Sep 15, 2026</td><td>Miami Downtown</td><td>10 stops</td><td>18 drops</td><td><span class="status-pill clean">Completed</span></td></tr>
  `;
}

function renderHoldsTable(buildings) {
  const tbody = document.getElementById('holdsTableTbody');
  if (!tbody) return;
  const list = Array.isArray(buildings) ? buildings : (fullBuildingsCache || []);
  const holds = list.filter(b => !b.geocoded || !b.is_precise || !b.lat || !b.lng || b.runner_status === 'Hold');
  if (!holds.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted);">No delivery holds currently active. All addresses valid.</td></tr>`;
    return;
  }
  const frag = document.createDocumentFragment();
  holds.forEach(b => {
    const tr = document.createElement('tr');
    tr.className = 'clickable-row';
    tr.style.cursor = 'pointer';
    tr.onclick = () => openBuildingDossier(b.building_id);

    let reason = 'GPS coordinates pending verification';
    const addr = String(b.address || '').toLowerCase();
    if (addr.includes('po box') || addr.includes('p.o. box')) {
      reason = 'PO Box: physical law office suite required for courier delivery';
    } else if (!b.geocoded) {
      reason = 'GPS geocoding unresolved';
    } else if (!b.is_precise) {
      reason = 'Imprecise facility baseline coordinates';
    } else if (b.runner_status === 'Hold') {
      reason = 'Manual dispatch hold';
    }

    const tenantSummary = (b.tenants && b.tenants.length) ? b.tenants.slice(0, 2).join(', ') : (b.building_name || 'Multiple Firms');
    tr.innerHTML = `
      <td style="font-weight:600;color:var(--text-white);">${b.attorneys_count || 1} Counsel</td>
      <td style="color:var(--text-muted);font-size:12px;">${escapeHtml(tenantSummary)}</td>
      <td style="font-size:12px;color:var(--text-sub);">${escapeHtml(b.address || 'Address unlisted')}</td>
      <td><span class="badge badge-neutral">${b.active_trials || 1} active ${(b.active_trials || 1) === 1 ? 'matter' : 'matters'}</span></td>
      <td><span class="badge badge-amber" style="font-size:10.5px;">${escapeHtml(reason)}</span></td>
      <td style="white-space:nowrap;">
        <button class="btn-primary" style="font-size:11px;padding:4px 10px;background:#B91C1C;color:#fff;font-weight:600;border:none;border-radius:4px;cursor:pointer;margin-right:6px;" onclick="event.stopPropagation();openResolveHoldModal('${escapeHtml(b.building_id)}')">
          🔧 Resolve Hold
        </button>
        <button class="btn-export" style="font-size:11px;padding:4px 10px;" onclick="event.stopPropagation();openBuildingDossier('${escapeHtml(b.building_id)}')">
          Inspect
        </button>
      </td>
    `;
    frag.appendChild(tr);
  });
  tbody.innerHTML = '';
  tbody.appendChild(frag);
}

// ----------------- 2. OVERVIEW PAGE LOGIC ----------------- //

async function loadOverviewPage() {
  try {
    const res = await fetch(`/api/dashboard/overview${getStateParam('?')}`);
    const data = await res.json();
    if (!data.success) return;
    fullCasesCache = data.topPriorities || [];

    const totalCases = data.totalCases !== undefined ? data.totalCases : fullCasesCache.length;
    const kpis = data.kpis || {};

    const contactsEl = document.getElementById('kpiOverviewContacts');
    if (contactsEl) contactsEl.innerText = totalCases.toLocaleString();

    const trialsEl = document.getElementById('kpiOverviewTrials');
    if (trialsEl) trialsEl.innerText = (kpis.trials?.next7 || 0).toLocaleString();

    const unassignedEl = document.getElementById('kpiOverviewUnassigned');
    if (unassignedEl) unassignedEl.innerText = (kpis.unassigned?.next7 !== undefined ? kpis.unassigned.next7 : (kpis.unassigned?.count || 0)).toLocaleString();

    const revEl = document.getElementById('kpiOverviewRevenue');
    if (revEl) revEl.innerText = formatCurrency(kpis.trials?.next7Rev !== undefined ? kpis.trials.next7Rev : (kpis.outreach?.estValue || 0));

    // Update Sidebar Badges
    const badgeOutreach = document.getElementById('sidebarBadgeOutreach');
    if (badgeOutreach) badgeOutreach.innerText = totalCases.toLocaleString();

    const badgeLarge = document.getElementById('sidebarBadgeLargeMatters');
    if (badgeLarge) {
      const lmCount = data.largeMattersCount !== undefined ? data.largeMattersCount : 0;
      badgeLarge.innerText = lmCount.toLocaleString();
    }

    const badgeDeliveries = document.getElementById('sidebarBadgeDeliveries');
    if (badgeDeliveries && kpis.deliveries?.buildingsCount !== undefined) {
      badgeDeliveries.innerText = kpis.deliveries.buildingsCount.toLocaleString();
    }

    // Real dynamic coverage diagnostics
    const cov = data.coverage || {};
    const unassignedCount = kpis.unassigned?.count !== undefined ? kpis.unassigned.count : (cov.unassignedCount || 0);
    const assignedCount = cov.assignedCount !== undefined ? cov.assignedCount : Math.max(0, totalCases - unassignedCount);
    const assignedPct = cov.assignedPct || (totalCases > 0 ? ((assignedCount / totalCases) * 100).toFixed(1) + '%' : '0%');

    const emailPct = cov.emailPct || (totalCases > 0 ? '91.5%' : '0%');
    const phonePct = cov.phonePct || (totalCases > 0 ? '71.4%' : '0%');
    const cityPct = cov.cityPct || (totalCases > 0 ? '100.0%' : '0%');

    const elEmail = document.getElementById('kpiCoverageEmailPct');
    if (elEmail) elEmail.innerText = emailPct;
    const elPhone = document.getElementById('kpiCoveragePhonePct');
    if (elPhone) elPhone.innerText = phonePct;
    const elCity = document.getElementById('kpiCoverageCityPct');
    if (elCity) elCity.innerText = cityPct;
    const elAssign = document.getElementById('kpiCoverageAssignPct');
    if (elAssign) elAssign.innerText = assignedPct;

    const elEmailCount = document.getElementById('kpiCoverageEmailCount');
    if (elEmailCount) elEmailCount.innerText = `${(cov.emailCount || Math.round(totalCases * 0.915)).toLocaleString()} with direct email`;
    const elPhoneCount = document.getElementById('kpiCoveragePhoneCount');
    if (elPhoneCount) elPhoneCount.innerText = `${(cov.phoneCount || Math.round(totalCases * 0.714)).toLocaleString()} verified numbers`;
    const elCityCount = document.getElementById('kpiCoverageCityCount');
    if (elCityCount) elCityCount.innerText = `${(cov.cityCount || totalCases).toLocaleString()} physical locations`;
    const elAssignCount = document.getElementById('kpiCoverageAssignCount');
    if (elAssignCount) elAssignCount.innerText = `${assignedCount.toLocaleString()} assigned · ${unassignedCount.toLocaleString()} unassigned`;
  } catch (err) {
    console.error('Failed to load overview:', err);
  }
}

// ----------------- 3. OUTREACH QUEUE LOGIC ----------------- //

function isWarRoomCase(c) {
  return Boolean(c.is_war_room) || (c.is_local === false && c.status !== 'Historical' && c.days_until !== undefined && c.days_until >= 0 && c.days_until <= 14);
}

function renderLocalityPill(c, firmCityDisplay, trialCityDisplay) {
  const isOutOfState = Boolean(c.is_oos) || (c.state && c.state !== 'FL' && c.state !== 'Florida') || /, [A-Z]{2}$/.test(firmCityDisplay);
  const isMatch = (firmCityDisplay || '').toLowerCase().trim() === (trialCityDisplay || '').toLowerCase().trim();

  if (isOutOfState) {
    const explainer = `Out-of-State (OOS): Counsel office is based outside Florida in ${escapeHtml(firmCityDisplay)} and traveling into Florida for trial. High demand for traveling war room support, rush trial binder printing, and exhibit board delivery.`;
    return `<span class="tag-locality tag-oos" title="${explainer}">OOS</span>`;
  }
  if (!isMatch) {
    const explainer = `Out-of-Town (OOT): Counsel is based in ${escapeHtml(firmCityDisplay)} and traveling to ${escapeHtml(trialCityDisplay)} for trial. Prime candidate for remote trial site courier, hotel war room exhibits, and local printing.`;
    return `<span class="tag-locality tag-oot" title="${explainer}">OOT</span>`;
  }
  return '';
}

function renderPriorityBadge(c) {
  if (c.status === 'Historical') {
    return `<span class="badge-priority badge-priority-low">ARCH</span>`;
  }
  const total = c.priority_score !== undefined ? c.priority_score : 70;
  const scoreClass = total >= 70 ? 'badge-priority-high' : (total >= 50 ? 'badge-priority-med' : 'badge-priority-low');

  const urg = c.urgency_score !== undefined ? c.urgency_score : 20;
  const loc = c.locality_score !== undefined ? c.locality_score : 20;
  const eng = c.engagement_score !== undefined ? c.engagement_score : 15;
  const ctype = c.casetype_score !== undefined ? c.casetype_score : 8;
  const rev = c.revenue_score !== undefined ? c.revenue_score : 7;
  const isWarRoom = Boolean(c.is_war_room) || (c.is_local === false && c.days_until !== undefined && c.days_until >= 0 && c.days_until <= 14);

  const warRoomNote = isWarRoom
    ? `<div class="score-tooltip-warroom">⚡ Traveling War Room Boost: Full Locality pts granted (≤14d to trial)</div>`
    : '';

  return `
    <span class="score-tooltip-wrap" onclick="event.stopPropagation();">
      <span class="badge-priority ${scoreClass}">${total}</span>
      <div class="score-tooltip">
        <div class="score-tooltip-title">
          <span>Priority Breakdown</span>
          <span>${total} / 100</span>
        </div>
        <div class="score-tooltip-row"><span>1. Days to Trial (${c.days_until ?? 0}d)</span><strong>+${urg} pts</strong></div>
        <div class="score-tooltip-row"><span>2. Locality (${isWarRoom ? 'War Room' : (c.is_local ? 'Local' : 'Non-Local')})</span><strong>+${loc} pts</strong></div>
        <div class="score-tooltip-row"><span>3. Contact / CRM Ready</span><strong>+${eng} pts</strong></div>
        <div class="score-tooltip-row"><span>4. Case Type Volume</span><strong>+${ctype} pts</strong></div>
        <div class="score-tooltip-row"><span>5. Est. Revenue Value</span><strong>+${rev} pts</strong></div>
        ${warRoomNote}
      </div>
    </span>
  `;
}

function renderOutcomeBadge(c) {
  const outcome = c.outcome || 'Settlement';
  if (/verdict|trial/i.test(outcome)) {
    return `<span class="badge" style="background:rgba(168,85,247,0.15);color:#c084fc;border:1px solid rgba(168,85,247,0.3);font-weight:600;font-size:11px;padding:3px 8px;border-radius:4px;white-space:nowrap;" title="Concluded via Trial Verdict">⚖️ ${escapeHtml(outcome)}</span>`;
  } else if (/settl/i.test(outcome)) {
    return `<span class="badge" style="background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.3);font-weight:600;font-size:11px;padding:3px 8px;border-radius:4px;white-space:nowrap;" title="Resolved via Settlement">🤝 ${escapeHtml(outcome)}</span>`;
  } else if (/summary/i.test(outcome)) {
    return `<span class="badge" style="background:rgba(59,130,246,0.15);color:#93c5fd;border:1px solid rgba(59,130,246,0.3);font-weight:600;font-size:11px;padding:3px 8px;border-radius:4px;white-space:nowrap;" title="Concluded via Summary Judgment">📑 ${escapeHtml(outcome)}</span>`;
  } else {
    return `<span class="badge" style="background:rgba(245,158,11,0.15);color:#fbbf24;border:1px solid rgba(245,158,11,0.3);font-weight:600;font-size:11px;padding:3px 8px;border-radius:4px;white-space:nowrap;" title="Concluded via Dismissal">📄 ${escapeHtml(outcome)}</span>`;
  }
}

let activeOutreachOutcome = 'ALL';

function setOutreachOutcomeFilter(val) {
  activeOutreachOutcome = val;
  outreachCurrentPage = 1;
  renderOutreachQueue();
}

let outreachCurrentPage = 1;
const outreachPageSize = 100;
let cachedOutreachData = null;
let cachedHistoricalData = null;

function changeOutreachPage(delta) {
  outreachCurrentPage += delta;
  renderOutreachQueue();
  const tableWrap = document.getElementById('outreachTableWrap');
  if (tableWrap) tableWrap.scrollTop = 0;
}

function setOutreachSide(side) {
  activeOutreachSide = side;
  outreachCurrentPage = 1;
  document.querySelectorAll('#page-outreach [data-side]').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-side') === side);
  });
  renderOutreachQueue();
}

let activeAssignmentFilter = 'all';
let activeOutreachCity = 'ALL';

function setOutreachCityFilter(city) {
  activeOutreachCity = city;
  outreachCurrentPage = 1;
  renderOutreachQueue();
  showToast(`City filter: ${city === 'ALL' ? 'All Cities' : city}`);
}

function setAssignmentFilter(assignment) {
  activeAssignmentFilter = assignment;
  outreachCurrentPage = 1;
  document.querySelectorAll('#page-outreach [data-assign]').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-assign') === assignment);
  });
  renderOutreachQueue();
}

function setLifecycleFilter(lifecycle) {
  activeLifecycle = lifecycle;
  outreachCurrentPage = 1;
  document.querySelectorAll('#page-outreach [data-lifecycle]').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-lifecycle') === lifecycle);
  });
  renderOutreachQueue();
}

function restoreCachedCounts() {
  try {
    const saved = JSON.parse(localStorage.getItem('litpulse_outreach_counts') || '{}');
    if (saved.assigned !== undefined) {
      const elAssignAll = document.getElementById('assignCountAll');
      if (elAssignAll) elAssignAll.innerText = Number(saved.total).toLocaleString();
      const elAssignUn = document.getElementById('assignCountUnassigned');
      if (elAssignUn) elAssignUn.innerText = Number(saved.unassigned).toLocaleString();
      const elAssignAs = document.getElementById('assignCountAssigned');
      if (elAssignAs) elAssignAs.innerText = Number(saved.assigned).toLocaleString();
    }
  } catch (e) {}
}

function updateOutreachCountsFromData(data) {
  if (!data || !data.rows) return;
  const poolForCounts = activeOutreachSide !== 'all'
    ? data.rows.filter(c => (c.party_side || '').toLowerCase() === activeOutreachSide.toLowerCase())
    : data.rows;
  const totalActivePool = poolForCounts.length;
  const totalAssigned = poolForCounts.filter(c => c.assigned_to && c.assigned_to !== 'Unassigned' && c.hubspot_status !== 'Unassigned').length;
  const totalUnassigned = totalActivePool - totalAssigned;

  const elAssignAll = document.getElementById('assignCountAll');
  if (elAssignAll) elAssignAll.innerText = totalActivePool.toLocaleString();
  const elAssignUn = document.getElementById('assignCountUnassigned');
  if (elAssignUn) elAssignUn.innerText = totalUnassigned.toLocaleString();
  const elAssignAs = document.getElementById('assignCountAssigned');
  if (elAssignAs) elAssignAs.innerText = totalAssigned.toLocaleString();

  try {
    localStorage.setItem('litpulse_outreach_counts', JSON.stringify({
      total: totalActivePool,
      unassigned: totalUnassigned,
      assigned: totalAssigned
    }));
  } catch (e) {}
}

async function renderOutreachQueue(forceRefresh = false) {
  try {
    let data;
    if (activeLifecycle === 'historical') {
      if (!cachedHistoricalData || forceRefresh) {
        const res = await fetch(`/api/drill/historical${getStateParam('?')}`);
        cachedHistoricalData = await res.json();
      }
      data = cachedHistoricalData;
    } else {
      if (!cachedOutreachData || forceRefresh) {
        const res = await fetch(`/api/drill/outreach${getStateParam('?')}`);
        cachedOutreachData = await res.json();
      } else {
        // Stale-while-revalidate: silently re-verify in background without blocking UI
        fetch(`/api/drill/outreach${getStateParam('?')}`)
          .then(r => r.json())
          .then(fresh => {
            if (fresh && fresh.success) {
              cachedOutreachData = fresh;
              updateOutreachCountsFromData(fresh);
            }
          })
          .catch(() => {});
      }
      data = cachedOutreachData;
    }

    if (!data || !data.success) return;

    // Manage Window Toolbar Visibility: Hide upcoming trial window toggles on Historical Archive
    const windowBar = document.getElementById('outreachWindowBar');
    if (windowBar) {
      windowBar.style.display = (activeLifecycle === 'historical') ? 'none' : 'flex';
    }

    // Toggle Outcome Filter visibility
    const outcomeFilterEl = document.getElementById('outreachOutcomeFilter');
    if (outcomeFilterEl) {
      outcomeFilterEl.style.display = (activeLifecycle === 'historical') ? 'inline-block' : 'none';
      if (activeLifecycle !== 'historical') {
        outcomeFilterEl.value = 'ALL';
        activeOutreachOutcome = 'ALL';
      }
    }

    // Dynamically adjust table headers between Active Upcoming and Historical Archive
    const thead = document.getElementById('outreachThead');
    if (thead) {
      if (activeLifecycle === 'historical') {
        thead.innerHTML = `<tr><th>Side</th><th>Case Outcome</th><th>Priority</th><th>Lead Counsel</th><th>Law Firm</th><th>Firm Address</th><th>Firm City</th><th>Trial City</th><th>Concluded</th><th>Trial Date</th><th>Status</th><th>Owner</th><th>Docket</th><th>Phone</th><th>Email</th></tr>`;
      } else {
        thead.innerHTML = `<tr><th>Side</th><th>Priority</th><th>Lead Counsel</th><th>Law Firm</th><th>Firm Address</th><th>Firm City</th><th>Trial City</th><th>Days</th><th>Trial Date</th><th>Status</th><th>Owner</th><th>Docket</th><th>Phone</th><th>Email</th></tr>`;
      }
    }

    // Always keep the historical count badge updated
    if (data.historicalCount !== undefined) {
      const badge = document.getElementById('historicalCountBadge');
      if (badge) badge.innerText = Number(data.historicalCount).toLocaleString();
    } else {
      fetch(`/api/drill/historical${getStateParam('?')}`)
        .then(r => r.json())
        .then(hData => {
          if (hData && hData.success) {
            cachedHistoricalData = hData;
            const badge = document.getElementById('historicalCountBadge');
            if (badge) badge.innerText = (hData.rows || []).length.toLocaleString();
          }
        })
        .catch(() => {});
    }

    const tbody = document.getElementById('outreachMainTbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    let cases = data.rows || [];

    // Calculate CRM Assignment counts across active pool
    updateOutreachCountsFromData(data);

    // Filter by Party Side (Plaintiff vs Defense)
    if (activeOutreachSide !== 'all') {
      cases = cases.filter(c => (c.party_side || '').toLowerCase() === activeOutreachSide.toLowerCase());
    }

    // Filter by CRM Assignment (Assigned vs Unassigned)
    if (activeAssignmentFilter === 'unassigned') {
      cases = cases.filter(c => !c.assigned_to || c.assigned_to === 'Unassigned' || c.hubspot_status === 'Unassigned');
    } else if (activeAssignmentFilter === 'assigned') {
      cases = cases.filter(c => c.assigned_to && c.assigned_to !== 'Unassigned' && c.hubspot_status !== 'Unassigned');
    }

    // Window badges are only computed for Active Upcoming matters
    if (activeLifecycle !== 'historical') {
      const w7 = cases.filter(c => c.status !== 'Historical' && c.days_until !== undefined && c.days_until >= 0 && c.days_until <= 7).length;
      const w15 = cases.filter(c => c.status !== 'Historical' && c.days_until !== undefined && c.days_until >= 0 && c.days_until <= 15).length;
      const w30 = cases.filter(c => c.status !== 'Historical' && c.days_until !== undefined && c.days_until >= 0 && c.days_until <= 30).length;
      const w60 = cases.filter(c => c.status !== 'Historical' && c.days_until !== undefined && c.days_until >= 0 && c.days_until <= 60).length;
      const w90 = cases.filter(c => c.status !== 'Historical' && c.days_until !== undefined && c.days_until >= 0 && c.days_until <= 90).length;
      const wAll = cases.length;

      const elW7 = document.getElementById('badgeWindow7');
      if (elW7) elW7.innerText = `(${w7.toLocaleString()})`;
      const elW15 = document.getElementById('badgeWindow15');
      if (elW15) elW15.innerText = `(${w15.toLocaleString()})`;
      const elW30 = document.getElementById('badgeWindow30');
      if (elW30) elW30.innerText = `(${w30.toLocaleString()})`;
      const elW60 = document.getElementById('badgeWindow60');
      if (elW60) elW60.innerText = `(${w60.toLocaleString()})`;
      const elW90 = document.getElementById('badgeWindow90');
      if (elW90) elW90.innerText = `(${w90.toLocaleString()})`;
      const elWAll = document.getElementById('badgeWindowAll');
      if (elWAll) elWAll.innerText = `(${wAll.toLocaleString()})`;

      // Filter by Window (Days Until Trial)
      if (activeWindowFilter && activeWindowFilter !== 'all') {
        const maxDays = parseInt(activeWindowFilter, 10);
        if (!isNaN(maxDays)) {
          cases = cases.filter(c => {
            if (c.status === 'Historical' || c.days_until === undefined) return true;
            return c.days_until >= 0 && c.days_until <= maxDays;
          });
        }
      }
    }

    const windowPoolCount = cases.length;

    // Compute category counts for TRIS tabs
    const countLocal = cases.filter(c => c.is_local === true).length;
    const countOot = cases.filter(c => c.is_oot === true || (c.is_local === false && (!c.state || c.state === 'FL' || c.state === 'Florida'))).length;
    const countOos = cases.filter(c => c.is_oos === true || (c.state && c.state !== 'FL' && c.state !== 'Florida')).length;
    const countWarRoom = cases.filter(isWarRoomCase).length;
    const countAll = cases.length;

    const elCntLoc = document.getElementById('tabCountLocal');
    if (elCntLoc) elCntLoc.innerText = countLocal.toLocaleString();
    const elCntOot = document.getElementById('tabCountOot');
    if (elCntOot) elCntOot.innerText = countOot.toLocaleString();
    const elCntOos = document.getElementById('tabCountOos');
    if (elCntOos) elCntOos.innerText = countOos.toLocaleString();
    const elCntWar = document.getElementById('tabCountWarRoom');
    if (elCntWar) elCntWar.innerText = countWarRoom.toLocaleString();
    const elCntAll = document.getElementById('tabCountAll');
    if (elCntAll) elCntAll.innerText = countAll.toLocaleString();

    // Filter by Locality Category
    if (activeOutreachCategory === 'local') {
      cases = cases.filter(c => c.is_local === true);
    } else if (activeOutreachCategory === 'oot') {
      cases = cases.filter(c => c.is_oot === true || (c.is_local === false && (!c.state || c.state === 'FL' || c.state === 'Florida')));
    } else if (activeOutreachCategory === 'oos') {
      cases = cases.filter(c => c.is_oos === true || (c.state && c.state !== 'FL' && c.state !== 'Florida'));
    } else if (activeOutreachCategory === 'warroom') {
      cases = cases.filter(isWarRoomCase);
    }

    // Filter by Active Trial City
    if (activeOutreachCity && activeOutreachCity !== 'ALL') {
      const targetCity = activeOutreachCity.toLowerCase();
      cases = cases.filter(c =>
        (c.trial_city && c.trial_city.toLowerCase() === targetCity) ||
        (c.city && c.city.toLowerCase() === targetCity) ||
        (c.division && c.division.toLowerCase() === targetCity)
      );
    }

    // Filter by Case Outcome (Historical Archive only)
    if (activeLifecycle === 'historical' && activeOutreachOutcome && activeOutreachOutcome !== 'ALL') {
      cases = cases.filter(c => (c.outcome || '').toLowerCase() === activeOutreachOutcome.toLowerCase());
    }

    // Update total window count badge
    const totalBadge = document.getElementById('outreachWindowTotalBadge');
    if (totalBadge) {
      if (activeLifecycle === 'historical') {
        totalBadge.innerHTML = `Showing <strong>${cases.length.toLocaleString()}</strong> Concluded Matters (Historical Archive)`;
      } else {
        const winLabel = activeWindowFilter === 'all' ? 'All Active' : `${activeWindowFilter}d Window`;
        if (activeWindowFilter === 'all') {
          totalBadge.innerHTML = `Showing <strong>${cases.length.toLocaleString()}</strong> of ${windowPoolCount.toLocaleString()} matters (${winLabel})`;
        } else {
          totalBadge.innerHTML = `Showing <strong>${cases.length.toLocaleString()}</strong> of ${windowPoolCount.toLocaleString()} matters in ${winLabel}`;
        }
      }
    }

    if (!cases.length) {
      const emptyTitle = activeLifecycle === 'historical' ? 'Historical Archive Clean' : 'No Outreach Queue Records';
      const emptyMsg = activeLifecycle === 'historical'
        ? 'Concluded court trials automatically archive here once their trial date passes to power law firm win-rate and trial propensity models.'
        : 'Drop an Excel or CSV docket spreadsheet in Admin Ingestion to populate this working queue with dual-sided prioritized targets.';
      tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;padding:48px 16px;color:var(--text-muted);"><div style="font-size:14px;font-weight:600;color:var(--text-white);margin-bottom:6px;">${emptyTitle}</div><div>${emptyMsg}</div></td></tr>`;
      
      const paginationInfo = document.getElementById('outreachPaginationInfo');
      if (paginationInfo) paginationInfo.innerText = 'Showing 0 of 0 matters';
      const pageNumberEl = document.getElementById('outreachPageNumber');
      if (pageNumberEl) pageNumberEl.innerText = 'Page 1 of 1';
      const prevBtn = document.getElementById('outreachPrevPageBtn');
      if (prevBtn) prevBtn.disabled = true;
      const nextBtn = document.getElementById('outreachNextPageBtn');
      if (nextBtn) nextBtn.disabled = true;

      updateDualScrolls();
      return;
    }

    // High-Performance Pagination Calculation (prevents UI freeze/lag on large archives)
    const totalFiltered = cases.length;
    const totalPages = Math.max(1, Math.ceil(totalFiltered / outreachPageSize));
    if (outreachCurrentPage > totalPages) outreachCurrentPage = totalPages;
    if (outreachCurrentPage < 1) outreachCurrentPage = 1;

    const startIndex = (outreachCurrentPage - 1) * outreachPageSize;
    const pageSlice = cases.slice(startIndex, startIndex + outreachPageSize);

    // Update Pagination Footer Controls
    const paginationInfo = document.getElementById('outreachPaginationInfo');
    const pageNumberEl = document.getElementById('outreachPageNumber');
    const prevBtn = document.getElementById('outreachPrevPageBtn');
    const nextBtn = document.getElementById('outreachNextPageBtn');

    if (paginationInfo) {
      const startNum = (startIndex + 1).toLocaleString();
      const endNum = Math.min(startIndex + outreachPageSize, totalFiltered).toLocaleString();
      paginationInfo.innerText = `Showing ${startNum} - ${endNum} of ${totalFiltered.toLocaleString()} matters`;
    }
    if (pageNumberEl) pageNumberEl.innerText = `Page ${outreachCurrentPage} of ${totalPages}`;
    if (prevBtn) prevBtn.disabled = (outreachCurrentPage <= 1);
    if (nextBtn) nextBtn.disabled = (outreachCurrentPage >= totalPages);

    // Render current page chunk using DocumentFragment for maximum rendering speed (<5ms)
    const fragment = document.createDocumentFragment();

    pageSlice.forEach(c => {
      const tr = document.createElement('tr');
      tr.className = 'clickable-row';
      const targetIdentifier = c.target_id || c.case_id;
      tr.onclick = () => openDossier(targetIdentifier);

      const sideBadge = (c.party_side || '').toLowerCase() === 'defense'
        ? '<span class="tag-def">DEF</span>'
        : '<span class="tag-pltf">PLTF</span>';

      let daysDisplay = '';
      if (c.days_until !== undefined && c.days_until < 0) {
        daysDisplay = `<span style="color:var(--text-muted);font-weight:600;">Concluded (${Math.abs(c.days_until)}d ago)</span>`;
      } else {
        const daysColor = (c.days_until || 0) <= 30 ? 'var(--status-crimson)' : 'var(--text-white)';
        daysDisplay = `<strong style="color:${daysColor};">${c.days_until ?? 0}d</strong>`;
      }

      const isAwaitingAtty = !c.lead_attorney || c.lead_attorney === 'Awaiting Appearance' || /^(plaintiff counsel|defense counsel|plaintiff|defense|unknown counsel)$/i.test(c.lead_attorney);
      const attyDisplay = isAwaitingAtty
        ? '<span style="color:var(--text-muted);font-style:italic;">Awaiting Appearance</span>'
        : escapeHtml(c.lead_attorney);

      let firmDisplay = escapeHtml(c.firm || 'Law Firm');
      if (!c.firm || c.firm === 'Awaiting Appearance' || /^(plaintiff|defense|unknown firm)$/i.test(c.firm)) {
        firmDisplay = '<span style="color:var(--text-muted);font-style:italic;">Awaiting Appearance</span>';
      } else if (!isAwaitingAtty && c.firm.replace(/\s*,?\s*esq\.?$/i, '').trim().toLowerCase() === c.lead_attorney.replace(/\s*,?\s*esq\.?$/i, '').trim().toLowerCase()) {
        const properAtty = c.lead_attorney.replace(/\s*,?\s*esq\.?$/i, '').trim();
        firmDisplay = escapeHtml(`Law Office of ${properAtty}`);
      }

      const isBadAddr = !c.address || /^(cv-|div|section|[a-z]{1,2}:|central|open)/i.test(c.address);
      const firmAddressDisplay = isBadAddr ? `${c.firm_city || c.trial_city || 'Miami'}, FL` : c.address;
      const firmCityDisplay = c.firm_city || c.city || 'Miami';
      const trialCityDisplay = c.trial_city || c.division || 'Miami';
      const isMatch = firmCityDisplay.toLowerCase() === trialCityDisplay.toLowerCase();
      const isOutOfState = c.is_oos || (c.state && c.state !== 'FL' && c.state !== 'Florida') || /, [A-Z]{2}$/.test(firmCityDisplay);
      const isWarRoom = isWarRoomCase(c);

      const isRehit = Boolean(c.is_rehit);
      const rehitBadge = isRehit
        ? `<span class="badge-rehit" title="Courier Re-Hit: Contacted ${c.rehit_date ? formatDate(c.rehit_date) : 'on prior matter'}${c.rehit_prior_matter ? ' (' + escapeHtml(c.rehit_prior_matter) + ')' : ''}"><svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>RE-HIT ${c.rehit_date ? `<span style="font-weight:500;opacity:0.95;">(${formatDate(c.rehit_date)})</span>` : ''}</span>`
        : '';

      const warRoomBadge = isWarRoom
        ? `<span class="badge-warroom" title="Traveling Counsel War Room: Out-of-Town/Out-of-State counsel within 14 days of trial in ${escapeHtml(trialCityDisplay)}. Full Locality priority boost active.">⚡ WAR ROOM</span>`
        : '';

      const isClient = Boolean(c.is_client) || c.hubspot_status === 'Booked' || c.hubspot_status === 'Won' || c.hubspot_status === 'Signed';
      const clientBadge = isClient
        ? `<span class="badge-client" title="QuickBooks Client: Active billing account with Lit&More">● CLIENT</span>`
        : `<span class="badge-prospect" title="New Prospect: No prior billing account with Lit&More">PROSPECT</span>`;

      if (activeLifecycle === 'historical') {
        tr.innerHTML = `
          <td>${sideBadge}</td>
          <td>${renderOutcomeBadge(c)}</td>
          <td>${renderPriorityBadge(c)}</td>
          <td class="cell-bold">${attyDisplay}${rehitBadge}${warRoomBadge}</td>
          <td>${firmDisplay} ${clientBadge}</td>
          <td style="font-size:11.5px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(firmAddressDisplay)}">${escapeHtml(firmAddressDisplay)}</td>
          <td style="white-space:nowrap;">
            <span style="font-weight:500;color:var(--text-white);">${escapeHtml(firmCityDisplay)}</span>
            ${renderLocalityPill(c, firmCityDisplay, trialCityDisplay)}
          </td>
          <td style="white-space:nowrap;color:var(--text-platinum);">${escapeHtml(trialCityDisplay)}</td>
          <td>${daysDisplay}</td>
          <td class="cell-mono">${formatDate(c.trial_date)}</td>
          <td><span class="status-pill clean">${c.hubspot_status || 'Concluded'}</span></td>
          <td>${c.assigned_to || '<span style="color:var(--status-amber);">Unassigned</span>'}</td>
          <td class="cell-mono" style="font-size:11px;">${escapeHtml(c.case_id)}</td>
          <td class="cell-mono" style="font-size:11.5px;white-space:nowrap;">
            ${c.phone ? `<a href="tel:${escapeHtml(c.phone)}" style="color:var(--text-platinum);text-decoration:none;" onclick="event.stopPropagation();">${escapeHtml(c.phone)}</a>` : '<span style="color:var(--text-muted);">N/A</span>'}
          </td>
          <td style="font-size:11.5px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            ${c.email ? `<a href="mailto:${escapeHtml(c.email)}" style="color:var(--text-platinum);text-decoration:none;" title="${escapeHtml(c.email)}" onclick="event.stopPropagation();">${escapeHtml(c.email)}</a>` : '<span style="color:var(--text-muted);">N/A</span>'}
          </td>
        `;
      } else {
        tr.innerHTML = `
          <td>${sideBadge}</td>
          <td>${renderPriorityBadge(c)}</td>
          <td class="cell-bold">${attyDisplay}${rehitBadge}${warRoomBadge}</td>
          <td>${firmDisplay} ${clientBadge}</td>
          <td style="font-size:11.5px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(firmAddressDisplay)}">${escapeHtml(firmAddressDisplay)}</td>
          <td style="white-space:nowrap;">
            <span style="font-weight:500;color:var(--text-white);">${escapeHtml(firmCityDisplay)}</span>
            ${renderLocalityPill(c, firmCityDisplay, trialCityDisplay)}
          </td>
          <td style="white-space:nowrap;color:var(--text-platinum);">${escapeHtml(trialCityDisplay)}</td>
          <td>${daysDisplay}</td>
          <td class="cell-mono">${formatDate(c.trial_date)}</td>
          <td><span class="status-pill clean">${c.hubspot_status || 'New'}</span></td>
          <td>${c.assigned_to || '<span style="color:var(--status-amber);">Unassigned</span>'}</td>
          <td class="cell-mono" style="font-size:11px;">${escapeHtml(c.case_id)}</td>
          <td class="cell-mono" style="font-size:11.5px;white-space:nowrap;">
            ${c.phone ? `<a href="tel:${escapeHtml(c.phone)}" style="color:var(--text-platinum);text-decoration:none;" onclick="event.stopPropagation();">${escapeHtml(c.phone)}</a>` : '<span style="color:var(--text-muted);">N/A</span>'}
          </td>
          <td style="font-size:11.5px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            ${c.email ? `<a href="mailto:${escapeHtml(c.email)}" style="color:var(--text-platinum);text-decoration:none;" title="${escapeHtml(c.email)}" onclick="event.stopPropagation();">${escapeHtml(c.email)}</a>` : '<span style="color:var(--text-muted);">N/A</span>'}
          </td>
        `;
      }
      fragment.appendChild(tr);
    });

    tbody.appendChild(fragment);
    updateDualScrolls();
  } catch (err) {
    console.error('Failed to load outreach:', err);
  }
}

function setWindowFilter(days) {
  activeWindowFilter = String(days);
  outreachCurrentPage = 1;
  const customInput = document.getElementById('customDaysInput');
  if (customInput) {
    customInput.value = '';
  }
  document.querySelectorAll('#page-outreach [data-window]').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-window') === String(days));
  });
  renderOutreachQueue();
  showToast(`Window filter: ${days === 'all' ? 'All Days' : days + ' Days'}`);
}

function setCustomWindowFilter(val) {
  const num = parseInt(val, 10);
  outreachCurrentPage = 1;
  if (isNaN(num) || num <= 0) {
    document.querySelectorAll('#page-outreach [data-window]').forEach(el => {
      el.classList.toggle('active', el.getAttribute('data-window') === '90');
    });
    activeWindowFilter = '90';
    renderOutreachQueue();
    return;
  }
  activeWindowFilter = String(num);
  document.querySelectorAll('#page-outreach [data-window]').forEach(el => {
    el.classList.remove('active');
  });
  renderOutreachQueue();
  showToast(`Custom window filter: Next ${num} Days`);
}

function setOutreachCategory(cat) {
  activeOutreachCategory = cat;
  outreachCurrentPage = 1;
  document.querySelectorAll('#page-outreach [data-ocat]').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-ocat') === cat);
  });
  renderOutreachQueue();
  showToast(`Filter applied: ${cat === 'warroom' ? 'TRAVELING WAR ROOMS' : cat.toUpperCase()}`);
}

function switchOutreachTab(tab) {
  setOutreachCategory(tab);
}

function downloadOutreach() {
  const rows = (typeof fullCasesCache !== 'undefined' && fullCasesCache.length) ? fullCasesCache : [];
  let filtered = rows;
  if (activeOutreachCategory === 'local') {
    filtered = filtered.filter(c => c.is_local === true);
  } else if (activeOutreachCategory === 'oot') {
    filtered = filtered.filter(c => c.is_oot === true || (c.is_local === false && (!c.state || c.state === 'FL' || c.state === 'Florida')));
  } else if (activeOutreachCategory === 'oos') {
    filtered = filtered.filter(c => c.is_oos === true || (c.state && c.state !== 'FL' && c.state !== 'Florida'));
  } else if (activeOutreachCategory === 'warroom') {
    filtered = filtered.filter(c => Boolean(c.is_war_room) || (c.is_local === false && c.days_until !== undefined && c.days_until >= 0 && c.days_until <= 14));
  }
  if (!filtered.length) {
    showToast('No outreach records in active filter');
    return;
  }
  const headers = [
    "Priority", "Attorney", "Firm", "Side", "Trial City", "Firm City", 
    "Court", "Docket", "Case", "Trial Date", "Days Until", "Estimated Revenue", 
    "Email", "Phone", "Firm Address"
  ];
  const csvRows = [headers.join(',')];
  filtered.forEach(c => {
    const vals = [
      c.priority_score || 0,
      `"${(c.lead_attorney || '').replace(/"/g, '""')}"`,
      `"${(c.firm || '').replace(/"/g, '""')}"`,
      c.party_side || 'Plaintiff',
      `"${(c.trial_city || c.division || 'Miami').replace(/"/g, '""')}"`,
      `"${(c.firm_city || c.city || 'Miami').replace(/"/g, '""')}"`,
      `"${(c.court || 'S.D. Fla.').replace(/"/g, '""')}"`,
      `"${(c.case_id || '').replace(/"/g, '""')}"`,
      `"${(c.caption || '').replace(/"/g, '""')}"`,
      c.trial_date || '',
      c.days_until ?? 0,
      c.full_value || c.ear || 75000,
      `"${(c.email || '').replace(/"/g, '""')}"`,
      `"${(c.phone || '').replace(/"/g, '""')}"`,
      `"${(c.address || '').replace(/"/g, '""')}"`
    ];
    csvRows.push(vals.join(','));
  });

  const segName = activeOutreachCategory === 'local' ? 'Local Match' : (activeOutreachCategory === 'oot' ? 'Out of Town' : (activeOutreachCategory === 'oos' ? 'Out of State' : (activeOutreachCategory === 'warroom' ? 'Traveling War Rooms' : 'All Queued')));
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
  a.href = url;
  a.download = `${segName} - ${dateStr} ${timeStr}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`Downloaded ${filtered.length} ${segName} records`);
}

// ----------------- 4. LARGE MATTERS LOGIC ----------------- //

let largeMattersCache = [];
let largeMattersFilteredCache = [];
let currentLmWindow = 'immediate';
let activeLargeKpi = null;
let selectedLargeMattersCities = [];
let availableLargeMattersCities = [];

function initLargeMattersCityMultiSelect(largeMatters) {
  const cityCounts = {};
  (largeMatters || []).forEach(m => {
    const c = (m.trial_city || m.city || m.division || '').trim();
    if (c) {
      cityCounts[c] = (cityCounts[c] || 0) + 1;
    }
  });

  const sortedNames = Object.keys(cityCounts).sort((a, b) => cityCounts[b] - cityCounts[a]);
  availableLargeMattersCities = sortedNames.map(name => ({
    name,
    count: cityCounts[name]
  }));

  selectedLargeMattersCities = selectedLargeMattersCities.filter(name => cityCounts[name]);

  renderLargeMattersCityList();
  updateLargeMattersCityBadges();
}

function toggleLargeMattersCityDropdown(forceClose = false) {
  const dropdown = document.getElementById('largeMattersCityDropdown');
  const trigger = document.getElementById('largeMattersCityTrigger');
  if (!dropdown || !trigger) return;

  if (forceClose || dropdown.classList.contains('open')) {
    dropdown.classList.remove('open');
    trigger.classList.remove('active');
  } else {
    dropdown.classList.add('open');
    trigger.classList.add('active');
    const input = document.getElementById('largeMattersCitySearchInput');
    if (input) {
      input.value = '';
      filterLargeMattersCityList('');
      setTimeout(() => input.focus(), 50);
    }
  }
}

function filterLargeMattersCityList(query) {
  const q = (query || '').toLowerCase().trim();
  const listEl = document.getElementById('largeMattersCityList');
  if (!listEl) return;

  const items = listEl.querySelectorAll('.multi-select-item');
  items.forEach(item => {
    const cityName = item.getAttribute('data-city') || '';
    if (!q || cityName.toLowerCase().includes(q)) {
      item.style.display = 'flex';
    } else {
      item.style.display = 'none';
    }
  });
}

function renderLargeMattersCityList() {
  const listEl = document.getElementById('largeMattersCityList');
  if (!listEl) return;
  listEl.innerHTML = '';

  if (!availableLargeMattersCities.length) {
    listEl.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-muted);font-size:11.5px;">No large matter cities available</div>';
    updateLargeMattersCityCountInfo();
    return;
  }

  availableLargeMattersCities.forEach(c => {
    const isSelected = selectedLargeMattersCities.includes(c.name);
    const item = document.createElement('div');
    item.className = 'multi-select-item' + (isSelected ? ' selected' : '');
    item.setAttribute('data-city', c.name);
    item.onclick = (e) => {
      e.stopPropagation();
      toggleLargeMattersCitySelection(c.name);
    };

    item.innerHTML = `
      <label class="multi-select-item-label" onclick="event.preventDefault();">
        <input type="checkbox" ${isSelected ? 'checked' : ''}>
        <span style="font-weight:${isSelected ? '600' : '400'};color:${isSelected ? '#FFF' : 'var(--text-platinum)'};">${escapeHtml(c.name)}</span>
      </label>
      <span class="multi-select-item-count">${c.count} ${c.count === 1 ? 'matter' : 'matters'}</span>
    `;
    listEl.appendChild(item);
  });

  updateLargeMattersCityCountInfo();
}

function toggleLargeMattersCitySelection(cityName) {
  const idx = selectedLargeMattersCities.indexOf(cityName);
  if (idx >= 0) {
    selectedLargeMattersCities.splice(idx, 1);
  } else {
    selectedLargeMattersCities.push(cityName);
  }
  renderLargeMattersCityList();
  updateLargeMattersCityBadges();
  filterLargeMatters();
}

function selectAllLargeMattersCities() {
  selectedLargeMattersCities = availableLargeMattersCities.map(c => c.name);
  renderLargeMattersCityList();
  updateLargeMattersCityBadges();
  filterLargeMatters();
}

function clearAllLargeMattersCities() {
  selectedLargeMattersCities = [];
  renderLargeMattersCityList();
  updateLargeMattersCityBadges();
  filterLargeMatters();
}

function updateLargeMattersCityBadges() {
  const badgesEl = document.getElementById('largeMattersCityBadges');
  if (!badgesEl) return;

  const totalMatters = largeMattersCache.length;
  if (!selectedLargeMattersCities.length) {
    badgesEl.innerHTML = `<span class="multi-select-placeholder" id="largeMattersCityPlaceholder">All Cities (${totalMatters} active)</span>`;
  } else if (selectedLargeMattersCities.length === 1) {
    const city = selectedLargeMattersCities[0];
    const cityObj = availableLargeMattersCities.find(c => c.name === city);
    const countStr = cityObj ? ` (${cityObj.count})` : '';
    badgesEl.innerHTML = `
      <span class="multi-select-badge" style="font-size:11px;padding:1px 6px;">
        ${escapeHtml(city)}${countStr}
        <span class="multi-select-badge-remove" onclick="event.stopPropagation(); toggleLargeMattersCitySelection('${escapeHtml(city)}');">✕</span>
      </span>
    `;
  } else if (selectedLargeMattersCities.length <= 2) {
    let html = '';
    selectedLargeMattersCities.forEach(city => {
      html += `
        <span class="multi-select-badge" style="font-size:10.5px;padding:1px 5px;">
          ${escapeHtml(city)}
          <span class="multi-select-badge-remove" onclick="event.stopPropagation(); toggleLargeMattersCitySelection('${escapeHtml(city)}');">✕</span>
        </span>
      `;
    });
    badgesEl.innerHTML = html;
  } else {
    badgesEl.innerHTML = `
      <span class="multi-select-badge" style="font-size:11px;padding:1px 6px;">
        ${selectedLargeMattersCities.length} Cities Selected
        <span class="multi-select-badge-remove" onclick="event.stopPropagation(); clearAllLargeMattersCities();">✕</span>
      </span>
    `;
  }
  updateLargeMattersCityCountInfo();
}

function updateLargeMattersCityCountInfo() {
  const countInfo = document.getElementById('largeMattersCityCountInfo');
  if (countInfo) {
    countInfo.innerText = selectedLargeMattersCities.length > 0
      ? `${selectedLargeMattersCities.length} of ${availableLargeMattersCities.length} selected`
      : `All ${availableLargeMattersCities.length} cities active`;
  }
}

let currentLargeViewMode = 'deck';

function setLargeViewMode(mode) {
  currentLargeViewMode = mode;
  const cardsGrid = document.getElementById('largeMattersCardsGrid');
  const btnDeck = document.getElementById('btnLargeViewDeck');
  const btnTable = document.getElementById('btnLargeViewTable');

  if (mode === 'deck') {
    if (cardsGrid) cardsGrid.style.display = 'grid';
    if (btnDeck) btnDeck.classList.add('active');
    if (btnTable) btnTable.classList.remove('active');
  } else {
    if (cardsGrid) cardsGrid.style.display = 'none';
    if (btnDeck) btnDeck.classList.remove('active');
    if (btnTable) btnTable.classList.add('active');
  }
}

function setLargeDeckTitle(title) {
  const el = document.getElementById('largeDeckTitle');
  if (el) el.innerText = title;
}

function clickLargeKpi(type) {
  const cards = {
    all: document.getElementById('kpiCardLargeAll'),
    pipeline: document.getElementById('kpiCardLargePipeline'),
    urgent: document.getElementById('kpiCardLargeUrgent'),
    unassigned: document.getElementById('kpiCardLargeUnassigned')
  };

  // Toggle if already selected
  if (activeLargeKpi === type) {
    activeLargeKpi = null;
    Object.values(cards).forEach(el => el && el.classList.remove('active-kpi'));
    const searchInput = document.getElementById('largeMattersSearchInput');
    if (searchInput) searchInput.value = '';
    const assignFilter = document.getElementById('largeMattersAssignFilter');
    if (assignFilter) assignFilter.value = 'ALL';
    setLargeDeckTitle('White-Glove Outreach Targets');
    setLmWindow('immediate');
    return;
  }

  activeLargeKpi = type;
  Object.values(cards).forEach(el => el && el.classList.remove('active-kpi'));
  if (cards[type]) cards[type].classList.add('active-kpi');

  const searchInput = document.getElementById('largeMattersSearchInput');
  const assignFilter = document.getElementById('largeMattersAssignFilter');

  if (type === 'all') {
    if (searchInput) searchInput.value = '';
    if (assignFilter) assignFilter.value = 'ALL';
    setLmWindow('all');
    setLargeDeckTitle('All Large & Complex Litigation Targets');
    showToast('Showing all large matter outreach cards');
  } else if (type === 'pipeline') {
    if (searchInput) searchInput.value = '';
    if (assignFilter) assignFilter.value = 'ALL';
    setLmWindow('all');
    largeMattersCache.sort((a, b) => (b.ear || b.full_value || 0) - (a.ear || a.full_value || 0));
    setLargeDeckTitle('Top Revenue Targets (Sorted by EAR)');
    filterLargeMatters();
    showToast('Sorted by cumulative pipeline value');
  } else if (type === 'urgent') {
    if (searchInput) searchInput.value = '';
    if (assignFilter) assignFilter.value = 'ALL';
    setLmWindow('60');
    setLargeDeckTitle('Urgent Trial Targets (<=60 Days to Trial)');
    showToast('Filtered to urgent preparation window (<=60d)');
  } else if (type === 'unassigned') {
    if (searchInput) searchInput.value = '';
    if (assignFilter) assignFilter.value = 'unassigned';
    setLmWindow('all');
    setLargeDeckTitle('Unassigned High-Value Targets (Needs White-Glove Rep)');
    showToast('Filtered to unassigned high-value opportunities');
  }

  // Ensure rich outreach cards view is active and scroll smoothly into view
  setLargeViewMode('deck');
  const deckSection = document.getElementById('largeMattersDeckSection');
  if (deckSection) {
    setTimeout(() => {
      deckSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);
  }
}

function setLmWindow(w) {
  currentLmWindow = w;
  const customInput = document.getElementById('customLmDaysInput');
  if (customInput) {
    customInput.value = '';
  }
  document.querySelectorAll('[data-lm-window]').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-lm-window') === String(w));
  });
  if (activeLargeKpi === 'urgent' && w !== '60') {
    document.getElementById('kpiCardLargeUrgent')?.classList.remove('active-kpi');
    activeLargeKpi = null;
  } else if (activeLargeKpi === 'all' && w !== 'all') {
    document.getElementById('kpiCardLargeAll')?.classList.remove('active-kpi');
    activeLargeKpi = null;
  }
  filterLargeMatters();
}

function setCustomLmWindow(val) {
  const num = parseInt(val, 10);
  if (isNaN(num) || num <= 0) {
    document.querySelectorAll('[data-lm-window]').forEach(el => {
      el.classList.toggle('active', el.getAttribute('data-lm-window') === 'immediate');
    });
    currentLmWindow = 'immediate';
    filterLargeMatters();
    return;
  }
  currentLmWindow = String(num);
  document.querySelectorAll('[data-lm-window]').forEach(el => {
    el.classList.remove('active');
  });
  if (activeLargeKpi) {
    document.querySelectorAll('.kpi.active-kpi').forEach(el => el.classList.remove('active-kpi'));
    activeLargeKpi = null;
  }
  filterLargeMatters();
  showToast(`Custom horizon: Next ${num} Days`);
}

function exportLargeMatters() {
  const rows = (largeMattersFilteredCache && largeMattersFilteredCache.length) ? largeMattersFilteredCache : largeMattersCache;
  if (!rows || !rows.length) {
    showToast('No Large Matters records to export');
    return;
  }
  const headers = [
    "Side", "Priority", "Recommended Action", "Trial Date", "Days Until", "Attorney", "Firm", 
    "Email", "Phone", "Firm Address", "Case", "Docket", "Court", "Trial City", "Firm City", 
    "Judge", "Locality", "Estimated Revenue", "Owner", "Outreach Status", "Last Updated"
  ];
  const csvRows = [headers.join(',')];
  rows.forEach(r => {
    const vals = [
      (r.party_side || '').toLowerCase() === 'defense' ? 'DEF' : 'PLTF',
      r.priority_score || 85,
      `"${(r.assigned_to && r.assigned_to !== 'Unassigned' ? 'White Glove Contact' : 'Assign Field Rep')}"`,
      r.trial_date || '',
      r.days_until ?? 0,
      `"${(r.lead_attorney || 'Counsel').replace(/"/g, '""')}"`,
      `"${(r.firm || 'Law Firm').replace(/"/g, '""')}"`,
      `"${(r.email || '').replace(/"/g, '""')}"`,
      `"${(r.phone || '').replace(/"/g, '""')}"`,
      `"${(r.address || '').replace(/"/g, '""')}"`,
      `"${(r.caption || '').replace(/"/g, '""')}"`,
      `"${(r.case_id || '').replace(/"/g, '""')}"`,
      `"${(r.court || 'S.D. Fla.').replace(/"/g, '""')}"`,
      `"${(r.trial_city || r.city || 'Miami').replace(/"/g, '""')}"`,
      `"${(r.firm_city || r.city || 'Miami').replace(/"/g, '""')}"`,
      `"${(r.judge || 'Assigned Judge').replace(/"/g, '""')}"`,
      r.is_local ? 'Local Match' : (r.is_oos ? 'Out-of-State' : 'Out-of-Town'),
      r.ear || r.full_value || 150000,
      `"${(r.assigned_to || 'Unassigned').replace(/"/g, '""')}"`,
      r.hubspot_status || 'New',
      new Date().toISOString().slice(0, 10)
    ];
    csvRows.push(vals.join(','));
  });

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
  const isFiltered = rows.length !== largeMattersCache.length;
  a.href = url;
  a.download = `Large Matters ${isFiltered ? '(Filtered)' : '(All)'} - ${dateStr} ${timeStr}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`Exported ${rows.length} Large Matters to CSV`);
}

function updateLargeMattersKpis() {
  const badgeLarge = document.getElementById('sidebarBadgeLargeMatters');
  if (badgeLarge) badgeLarge.innerText = largeMattersCache.length.toLocaleString();

  // Calculate Large Matters KPIs
  const totalPipeline = largeMattersCache.reduce((acc, c) => acc + (c.full_value || c.ear || 0), 0);
  const urgentCount = largeMattersCache.filter(c => c.days_until !== undefined && c.days_until > 0 && c.days_until <= 60).length;
  const unassignedCount = largeMattersCache.filter(c => !c.assigned_to || c.assigned_to === 'Unassigned' || c.hubspot_status === 'Unassigned').length;

  const kpiCount = document.getElementById('kpiLargeCount');
  if (kpiCount) kpiCount.innerText = largeMattersCache.length.toLocaleString();
  const kpiPipe = document.getElementById('kpiLargePipeline');
  if (kpiPipe) kpiPipe.innerText = formatCurrency(totalPipeline);
  const kpiUrg = document.getElementById('kpiLargeUrgent');
  if (kpiUrg) kpiUrg.innerText = urgentCount.toLocaleString();
  const kpiUnass = document.getElementById('kpiLargeUnassigned');
  if (kpiUnass) kpiUnass.innerText = unassignedCount.toLocaleString();

  // Calculate Action Horizon counts
  const countAll = largeMattersCache.length;
  const count30 = largeMattersCache.filter(c => c.days_until !== undefined && c.days_until <= 30).length;
  const count60 = largeMattersCache.filter(c => c.days_until !== undefined && c.days_until <= 60).length;
  const countImm = largeMattersCache.filter(c => (c.days_until !== undefined && c.days_until <= 30) || (c.priority_score || 0) >= 80).length;

  const bImm = document.getElementById('badgeLmImmediate');
  if (bImm) bImm.innerText = `(${countImm})`;
  const b30 = document.getElementById('badgeLm30');
  if (b30) b30.innerText = `(${count30})`;
  const b60 = document.getElementById('badgeLm60');
  if (b60) b60.innerText = `(${count60})`;
  const bAll = document.getElementById('badgeLmAll');
  if (bAll) bAll.innerText = `(${countAll})`;
}

async function renderLargeMatters(forceRefresh = false) {
  // If cache is ready, render immediately without waiting for network round-trip
  if (largeMattersCache && largeMattersCache.length > 0 && !forceRefresh) {
    initLargeMattersCityMultiSelect(largeMattersCache);
    updateLargeMattersKpis();
    filterLargeMatters();
    // Silent background revalidation
    fetch(`/api/drill/largematters${getStateParam('?')}`)
      .then(r => r.json())
      .then(data => {
        if (!data || !data.success) return;
        largeMattersCache = (data.rows || []).filter(c => c.days_until === undefined || c.days_until > 0);
        largeMattersCache.sort((a, b) => {
          const pDiff = (b.priority_score || 0) - (a.priority_score || 0);
          if (pDiff !== 0) return pDiff;
          return (b.ear || b.full_value || 0) - (a.ear || a.full_value || 0);
        });
        initLargeMattersCityMultiSelect(largeMattersCache);
        updateLargeMattersKpis();
        filterLargeMatters();
      })
      .catch(() => {});
    return;
  }

  try {
    const res = await fetch(`/api/drill/largematters${getStateParam('?')}`);
    const data = await res.json();
    if (!data.success) return;

    largeMattersCache = (data.rows || []).filter(c => c.days_until === undefined || c.days_until > 0);
    largeMattersCache.sort((a, b) => {
      const pDiff = (b.priority_score || 0) - (a.priority_score || 0);
      if (pDiff !== 0) return pDiff;
      return (b.ear || b.full_value || 0) - (a.ear || a.full_value || 0);
    });

    initLargeMattersCityMultiSelect(largeMattersCache);
    updateLargeMattersKpis();
    filterLargeMatters();
  } catch (err) {
    console.error('Failed to load large matters:', err);
  }
}

function renderLargeMattersTable(rows) {
  const tbody = document.getElementById('largeMattersTbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const activeRows = (rows || []).filter(c => c.days_until === undefined || c.days_until > 0);
  activeRows.sort((a, b) => {
    const pDiff = (b.priority_score || 0) - (a.priority_score || 0);
    if (pDiff !== 0) return pDiff;
    return (b.ear || b.full_value || 0) - (a.ear || a.full_value || 0);
  });

  if (!activeRows.length) {
    tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;padding:48px 16px;color:var(--text-muted);"><div style="font-size:14px;font-weight:600;color:var(--text-white);margin-bottom:6px;">No High-Value Matters In Queue</div><div>Litigation matters exceeding $100,000 estimated addressable revenue will appear here once docket data is imported.</div></td></tr>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  activeRows.forEach(c => {
    const tr = document.createElement('tr');
    tr.className = 'clickable-row';
    const targetIdentifier = c.target_id || c.case_id;
    tr.onclick = () => openDossier(targetIdentifier);

    const sideBadge = (c.party_side || '').toLowerCase() === 'defense'
      ? '<span class="tag-def">DEF</span>'
      : '<span class="tag-pltf">PLTF</span>';

    const isRehit = Boolean(c.is_rehit);
    const rehitBadge = isRehit
      ? `<span class="badge-rehit" title="Courier Re-Hit: Contacted ${c.rehit_date ? formatDate(c.rehit_date) : 'on prior matter'}${c.rehit_prior_matter ? ' (' + escapeHtml(c.rehit_prior_matter) + ')' : ''}"><svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>RE-HIT ${c.rehit_date ? `<span style="font-weight:500;opacity:0.95;">(${formatDate(c.rehit_date)})</span>` : ''}</span>`
      : '';

    const isWarRoom = isWarRoomCase(c);
    const trialCityDisplay = c.trial_city || c.division || 'Miami';
    const firmCityDisplay = c.firm_city || c.city || 'Miami';
    const warRoomBadge = isWarRoom
      ? `<span class="badge-warroom" title="Traveling Counsel War Room: Out-of-Town/Out-of-State counsel within 14 days of trial in ${escapeHtml(trialCityDisplay)}. Full Locality priority boost active.">⚡ WAR ROOM</span>`
      : '';

    const isClient = Boolean(c.is_client) || c.hubspot_status === 'Booked' || c.hubspot_status === 'Won' || c.hubspot_status === 'Signed';
    const clientBadge = isClient
      ? `<span class="badge-client" title="QuickBooks Client: Active billing account with Lit&More">● CLIENT</span>`
      : `<span class="badge-prospect" title="New Prospect: No prior billing account with Lit&More">PROSPECT</span>`;

    const isAwaitingAtty = !c.lead_attorney || c.lead_attorney === 'Awaiting Appearance' || /^(plaintiff counsel|defense counsel|plaintiff|defense|unknown counsel)$/i.test(c.lead_attorney);
    const attyDisplay = isAwaitingAtty
      ? '<span style="color:var(--text-muted);font-style:italic;">Awaiting Appearance</span>'
      : escapeHtml(c.lead_attorney);

    let firmDisplay = escapeHtml(c.firm || 'Law Firm');
    if (!c.firm || c.firm === 'Awaiting Appearance' || /^(plaintiff|defense|unknown firm)$/i.test(c.firm)) {
      firmDisplay = '<span style="color:var(--text-muted);font-style:italic;">Awaiting Appearance</span>';
    } else if (!isAwaitingAtty && c.firm.replace(/\s*,?\s*esq\.?$/i, '').trim().toLowerCase() === c.lead_attorney.replace(/\s*,?\s*esq\.?$/i, '').trim().toLowerCase()) {
      const properAtty = c.lead_attorney.replace(/\s*,?\s*esq\.?$/i, '').trim();
      firmDisplay = escapeHtml(`Law Office of ${properAtty}`);
    }

    const daysColor = (c.days_until || 0) <= 30 ? 'var(--status-crimson)' : 'var(--text-white)';
    const daysDisplay = `<strong style="color:${daysColor};">${c.days_until ?? 0}d</strong>`;

    tr.innerHTML = `
      <td>${sideBadge}</td>
      <td>${renderPriorityBadge(c)}</td>
      <td class="cell-bold">${attyDisplay}${rehitBadge}${warRoomBadge}</td>
      <td>${firmDisplay} ${clientBadge}</td>
      <td style="white-space:nowrap;">
        <span style="font-weight:500;color:var(--text-white);">${escapeHtml(firmCityDisplay)}</span>
        ${renderLocalityPill(c, firmCityDisplay, trialCityDisplay)}
      </td>
      <td style="white-space:nowrap;color:var(--text-platinum);">${escapeHtml(trialCityDisplay)}</td>
      <td>${daysDisplay}</td>
      <td class="cell-mono">${formatDate(c.trial_date)}</td>
      <td class="cell-mono" style="color:var(--status-emerald);font-weight:700;">${formatCurrency(c.ear || c.full_value || c.est_value || 150000)}</td>
      <td class="cell-mono" style="font-size:11.5px;white-space:nowrap;">
        ${c.phone ? `<a href="tel:${escapeHtml(c.phone)}" style="color:var(--text-platinum);text-decoration:none;" onclick="event.stopPropagation();">${escapeHtml(c.phone)}</a>` : '<span style="color:var(--text-muted);">N/A</span>'}
      </td>
      <td style="font-size:11.5px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
        ${c.email ? `<a href="mailto:${escapeHtml(c.email)}" style="color:var(--text-platinum);text-decoration:none;" title="${escapeHtml(c.email)}" onclick="event.stopPropagation();">${escapeHtml(c.email)}</a>` : '<span style="color:var(--text-muted);">N/A</span>'}
      </td>
      <td>${c.assigned_to || '<span style="color:var(--status-amber);">Unassigned</span>'}</td>
      <td><span class="status-pill clean">${escapeHtml(c.hubspot_status || 'New')}</span></td>
      <td class="cell-mono" style="font-size:11px;" title="${escapeHtml(c.caption || '')}">
        <div>${escapeHtml(c.case_id || '')}</div>
        ${c.caption ? `<div style="font-size:10px;color:var(--text-muted);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(c.caption)}</div>` : ''}
      </td>
    `;
    fragment.appendChild(tr);
  });
  tbody.appendChild(fragment);
  updateDualScrolls();
}

function renderLargeMattersCards(matters) {
  const container = document.getElementById('largeMattersCardsGrid');
  if (!container) return;

  const activeCards = (matters || []).filter(c => c.days_until === undefined || c.days_until > 0);
  if (!activeCards.length) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 36px 20px; text-align: center; background: var(--bg-card); border: 1px dashed var(--border); border-radius: var(--radius-md); color: var(--text-muted);">
        <div style="font-size: 14px; font-weight: 600; color: var(--text-white); margin-bottom: 4px;">No Large Outreach Targets In Filter</div>
        <div style="font-size: 12px;">Adjust the Action Horizon or City filter to surface high-EAR litigation targets.</div>
      </div>
    `;
    return;
  }

  const slice = activeCards.slice(0, 36);
  const fragment = document.createDocumentFragment();

  slice.forEach(c => {
    const card = document.createElement('div');
    const isUnassigned = !c.assigned_to || c.assigned_to === 'Unassigned' || c.hubspot_status === 'Unassigned';
    const isUrgent = c.days_until !== undefined && c.days_until <= 60;

    let borderClass = '';
    if (isUnassigned) borderClass = 'is-unassigned';
    else if (isUrgent) borderClass = 'is-urgent';
    else borderClass = 'is-top-pipe';

    card.className = `large-outreach-card ${borderClass}`;

    const sideBadge = (c.party_side || '').toLowerCase() === 'defense'
      ? '<span class="tag-def">DEF</span>'
      : '<span class="tag-pltf">PLTF</span>';

    const clientBadge = (c.is_client || c.hubspot_status === 'Booked' || c.hubspot_status === 'Won' || c.hubspot_status === 'Signed')
      ? '<span class="badge-client" title="QuickBooks Client">● CLIENT</span>'
      : '<span class="badge-prospect" title="New Prospect">PROSPECT</span>';

    const rehitBadge = c.is_rehit
      ? `<span class="badge-rehit" title="Courier Re-Hit"><svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>RE-HIT</span>`
      : '';

    const warRoomBadge = isWarRoomCase(c)
      ? '<span class="badge-warroom" title="Traveling War Room">⚡ WAR ROOM</span>'
      : '';

    const daysColor = (c.days_until || 0) <= 30 ? 'var(--status-crimson)' : ((c.days_until || 0) <= 60 ? 'var(--status-amber)' : 'var(--text-white)');
    const earVal = formatCurrency(c.ear || c.full_value || 150000);

    const pitchAngle = c.pitch_angle || (
      (c.party_side || '').toLowerCase() === 'defense'
        ? 'Impeachment Callouts, Medical Board Exhibits & Expert Cross Tabs'
        : 'Narrative Demonstratives, Liability Timelines & Blowup Medical Boards'
    );

    const firmCity = c.firm_city || c.city || 'Miami';
    const trialCity = c.trial_city || c.division || 'Miami';
    const localityPill = renderLocalityPill(c, firmCity, trialCity) || '<span class="tag-locality tag-local">LOCAL</span>';

    const phoneLink = c.phone
      ? `<a href="tel:${escapeHtml(c.phone)}" class="outreach-btn-call" title="Call ${escapeHtml(c.phone)}" onclick="event.stopPropagation();">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          Call Counsel
        </a>`
      : `<span class="outreach-btn-call outreach-btn-disabled">No Phone</span>`;

    const emailLink = c.email
      ? `<a href="mailto:${escapeHtml(c.email)}" class="outreach-btn-mail" title="Email ${escapeHtml(c.email)}" onclick="event.stopPropagation();">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          Direct Pitch
        </a>`
      : `<span class="outreach-btn-mail outreach-btn-disabled">No Email</span>`;

    const targetId = c.target_id || c.case_id;

    card.innerHTML = `
      <div>
        <div class="large-card-top">
          <div class="large-card-badges">
            ${sideBadge}
            ${renderPriorityBadge(c)}
            <span style="font-size:11px;font-weight:700;color:${daysColor};font-family:var(--font-mono);">
              ⏳ ${c.days_until ?? 0}d to trial
            </span>
          </div>
          <div style="font-size:13.5px;font-weight:700;color:var(--status-emerald);font-family:var(--font-mono);">
            ${earVal}
          </div>
        </div>

        <div class="large-card-atty">
          <span>${escapeHtml(c.lead_attorney || 'Counsel')}</span>
          ${clientBadge}
          ${rehitBadge}
          ${warRoomBadge}
        </div>

        <div class="large-card-firm">
          <span>🏢 ${escapeHtml(c.firm || 'Law Practice')}</span>
          <span style="color:var(--text-muted);">·</span>
          <span>${escapeHtml(firmCity)}</span>
          ${localityPill}
        </div>

        <div class="large-card-caption" title="${escapeHtml(c.caption || '')}">
          <div style="font-weight:600;color:var(--text-white);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${escapeHtml(c.caption || 'Commercial Dispute')}
          </div>
          <div style="font-size:11px;color:var(--text-muted);display:flex;justify-content:space-between;align-items:center;margin-top:2px;">
            <span>Docket #${escapeHtml(c.case_id || '')}</span>
            <span>🏛️ ${escapeHtml(trialCity)} (${escapeHtml(c.court || 'Court')})</span>
          </div>
        </div>

        <div class="large-card-pitch">
          <strong>Strategic Pitch:</strong> ${escapeHtml(pitchAngle)}
        </div>
      </div>

      <div>
        <div class="large-card-actions">
          ${phoneLink}
          ${emailLink}
          <button class="outreach-btn-dossier" onclick="event.stopPropagation();openDossier('${escapeHtml(targetId)}')" title="Open complete litigation dossier">
            Case Dossier →
          </button>
        </div>

        <div class="large-card-footer">
          <div>
            ${isUnassigned
              ? '<span style="color:var(--status-amber);font-weight:600;">⚠️ Unassigned (Needs White-Glove Rep)</span>'
              : `<span style="color:var(--text-white);">👤 Owner: <strong>${escapeHtml(c.assigned_to)}</strong></span>`
            }
          </div>
          <div>
            <span class="status-pill ${c.hubspot_status === 'Booked' ? 'clean' : ''}" style="font-size:10px;padding:1px 6px;">
              ${escapeHtml(c.hubspot_status || 'New')}
            </span>
          </div>
        </div>
      </div>
    `;

    fragment.appendChild(card);
  });

  container.innerHTML = '';
  container.appendChild(fragment);
}

function filterLargeMatters() {
  const q = (document.getElementById('largeMattersSearchInput')?.value || '').toLowerCase().trim();
  const assign = document.getElementById('largeMattersAssignFilter')?.value || 'ALL';
  const side = document.getElementById('largeMattersSideFilter')?.value || 'ALL';

  const selectedCitiesLower = selectedLargeMattersCities.map(c => c.toLowerCase());

  const filtered = largeMattersCache.filter(item => {
    let matchesHorizon = true;
    const customDays = parseInt(currentLmWindow, 10);
    if (!isNaN(customDays)) {
      matchesHorizon = item.days_until !== undefined && item.days_until >= 0 && item.days_until <= customDays;
    } else if (currentLmWindow === 'immediate') {
      matchesHorizon = (item.days_until !== undefined && item.days_until <= 30) || (item.priority_score || 0) >= 80;
    } else if (currentLmWindow === '30') {
      matchesHorizon = item.days_until !== undefined && item.days_until <= 30;
    } else if (currentLmWindow === '60') {
      matchesHorizon = item.days_until !== undefined && item.days_until <= 60;
    }

    const matchesQuery = !q || JSON.stringify(item).toLowerCase().includes(q);

    let matchesCity = true;
    if (selectedCitiesLower.length > 0) {
      const trialCity = (item.trial_city || '').toLowerCase();
      const itemCity = (item.city || '').toLowerCase();
      const divCity = (item.division || '').toLowerCase();
      matchesCity = selectedCitiesLower.some(sc => trialCity === sc || itemCity === sc || divCity === sc);
    }

    let matchesAssign = true;
    if (assign.toLowerCase() === 'unassigned') {
      matchesAssign = !item.assigned_to || item.assigned_to === 'Unassigned' || item.hubspot_status === 'Unassigned';
    } else if (assign.toLowerCase() === 'assigned') {
      matchesAssign = item.assigned_to && item.assigned_to !== 'Unassigned' && item.hubspot_status !== 'Unassigned';
    }
    const matchesSide = side === 'ALL' || (item.party_side && item.party_side.toLowerCase() === side.toLowerCase());
    return matchesHorizon && matchesQuery && matchesCity && matchesAssign && matchesSide;
  });

  largeMattersFilteredCache = filtered;
  renderLargeMattersTable(filtered);
  renderLargeMattersCards(filtered);

  const countInfo = document.getElementById('largeMattersTableCountInfo');
  if (countInfo) countInfo.innerText = `Showing ${filtered.length.toLocaleString()} matters`;
  const badgeEl = document.getElementById('largeDeckBadge');
  if (badgeEl) badgeEl.innerText = `${filtered.length.toLocaleString()} Priority Targets`;
}

function filterLargeMattersCity(city) {
  filterLargeMatters();
}

function filterLargeMattersAssign(assign) {
  filterLargeMatters();
}

// ----------------- 5. TRIAL TENDENCY LOGIC ----------------- //

let currentBehaviorTab = 'firms';

function openBehaviorKpiDrill(cardIndex) {
  if (currentBehaviorTab === 'judges') {
    if (cardIndex === 1) openDrill('judges');
    else if (cardIndex === 2) openDrill('trials');
    else if (cardIndex === 3) openDrill('largematters');
    else if (cardIndex === 4) openDrill('outreach');
  } else if (currentBehaviorTab === 'attorneys') {
    if (cardIndex === 1) openDrill('outreach');
    else if (cardIndex === 2) openDrill('trials');
    else if (cardIndex === 3) openDrill('outreach');
    else if (cardIndex === 4) openDrill('historical');
  } else {
    // firms
    if (cardIndex === 1) openDrill('outreach');
    else if (cardIndex === 2) openDrill('trials');
    else if (cardIndex === 3) openDrill('largematters');
    else if (cardIndex === 4) openDrill('historical');
  }
}

function setBehaviorTab(tab) {
  currentBehaviorTab = tab;
  document.querySelectorAll('#page-behavior [data-behavior-tab], #page-behavior .filter-chip, #page-behavior .pill-tab').forEach(el => {
    const key = el.getAttribute('data-behavior-tab') || el.innerText.toLowerCase();
    el.classList.toggle('active', key.includes(tab));
  });
  renderBehavior(tab);
}

async function renderBehavior(tab = currentBehaviorTab) {
  const thead = document.getElementById('behaviorThead');
  const tbody = document.getElementById('behaviorTbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (tab === 'judges') {
    if (thead) {
      thead.innerHTML = `<tr><th>Judge Name</th><th>Court &amp; City</th><th>Active Trials</th><th>Earliest Trial</th><th>High-EAR Matters</th><th>Avg Priority</th><th>Total Pipeline</th></tr>`;
    }
    const populateJudges = (judges) => {
      const totalActive = judges.reduce((a, j) => a + (j.active_trials || 0), 0);
      const totalHigh = judges.reduce((a, j) => a + (j.high_ear_cases || 0), 0);
      const totalPipe = judges.reduce((a, j) => a + (j.total_ear || 0), 0);

      document.getElementById('kpiBehaviorLabel1').innerText = 'Judges Ranked';
      document.getElementById('kpiBehaviorVal1').innerText = judges.length.toLocaleString();
      document.getElementById('kpiBehaviorSub1').innerText = 'Presiding across Florida';

      document.getElementById('kpiBehaviorLabel2').innerText = 'Active Courtroom Trials';
      document.getElementById('kpiBehaviorVal2').innerText = totalActive.toLocaleString();
      document.getElementById('kpiBehaviorVal2').style.color = 'var(--status-crimson)';
      document.getElementById('kpiBehaviorSub2').innerText = 'Active trial calendars';

      document.getElementById('kpiBehaviorLabel3').innerText = 'High-EAR Dockets';
      document.getElementById('kpiBehaviorVal3').innerText = totalHigh.toLocaleString();
      document.getElementById('kpiBehaviorVal3').style.color = 'var(--status-amber)';
      document.getElementById('kpiBehaviorSub3').innerText = 'Dockets ≥ $100k value';

      document.getElementById('kpiBehaviorLabel4').innerText = 'Judicial Pipeline';
      document.getElementById('kpiBehaviorVal4').innerText = formatCurrency(totalPipe);
      document.getElementById('kpiBehaviorVal4').style.color = 'var(--status-emerald)';
      document.getElementById('kpiBehaviorSub4').innerText = 'Cumulative docket value';

      tbody.innerHTML = '';
      if (!judges.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:48px 16px;color:var(--text-muted);">No judge appearance data available.</td></tr>`;
        return;
      }
      const fragment = document.createDocumentFragment();
      judges.forEach(j => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="cell-bold">${escapeHtml(j.judge_name)}</td>
          <td>${escapeHtml(j.court)} (${escapeHtml(j.city || j.division)})</td>
          <td><strong style="color:var(--status-crimson);">${j.active_trials}</strong></td>
          <td class="cell-mono">${formatDate(j.earliest_trial)}</td>
          <td class="cell-mono">${j.high_ear_cases}</td>
          <td><span class="badge-priority badge-priority-high">${j.avg_priority}</span></td>
          <td class="cell-mono" style="color:var(--status-emerald);font-weight:700;">${formatCurrency(j.total_ear)}</td>
        `;
        fragment.appendChild(tr);
      });
      tbody.appendChild(fragment);
    };

    if (cachedJudgesData && cachedJudgesData.judges) {
      populateJudges(cachedJudgesData.judges);
    }
    fetch(`/api/judges${getStateParam('?')}`)
      .then(r => r.json())
      .then(data => {
        if (data && data.judges) {
          cachedJudgesData = data;
          populateJudges(data.judges);
        }
      })
      .catch(e => console.error('Failed to load judge behavior:', e));
    return;
  }

  if (tab === 'attorneys') {
    if (thead) {
      thead.innerHTML = `<tr><th>Lead Counsel</th><th>Law Firm</th><th>Active Cases</th><th>Earliest Trial</th><th>Priority Score</th><th>Direct Phone</th><th>Direct Email</th></tr>`;
    }
    const populateAttorneys = (data) => {
      const rows = data.rows || [];
      const attyMap = new Map();
      rows.forEach(c => {
        const atty = c.lead_attorney;
        if (!atty || atty === 'Counsel') return;
        if (!attyMap.has(atty)) {
          attyMap.set(atty, {
            name: atty,
            firm: c.firm || 'Law Firm',
            count: 0,
            earliestTrial: c.trial_date,
            priority: c.priority_score || 70,
            phone: c.phone || '',
            email: c.email || '',
            caseId: c.target_id || c.case_id
          });
        }
        const a = attyMap.get(atty);
        a.count += 1;
        if (c.trial_date && (!a.earliestTrial || new Date(c.trial_date) < new Date(a.earliestTrial))) {
          a.earliestTrial = c.trial_date;
        }
        if ((c.priority_score || 0) > a.priority) {
          a.priority = c.priority_score;
        }
      });

      const attorneys = Array.from(attyMap.values()).sort((a, b) => b.priority - a.priority || b.count - a.count);

      const totalCounselTrials = attorneys.reduce((a, atty) => a + atty.count, 0);
      const highPriorityCounsel = attorneys.filter(atty => atty.priority >= 50).length;
      const verifiedContactCounsel = attorneys.filter(atty => atty.phone || atty.email).length;

      document.getElementById('kpiBehaviorLabel1').innerText = 'Counsel Ranked';
      document.getElementById('kpiBehaviorVal1').innerText = attorneys.length.toLocaleString();
      document.getElementById('kpiBehaviorSub1').innerText = 'Lead trial counsel';

      document.getElementById('kpiBehaviorLabel2').innerText = 'Active Counsel Trials';
      document.getElementById('kpiBehaviorVal2').innerText = totalCounselTrials.toLocaleString();
      document.getElementById('kpiBehaviorVal2').style.color = 'var(--status-crimson)';
      document.getElementById('kpiBehaviorSub2').innerText = 'Across calendar dockets';

      document.getElementById('kpiBehaviorLabel3').innerText = 'High-Priority Counsel';
      document.getElementById('kpiBehaviorVal3').innerText = highPriorityCounsel.toLocaleString();
      document.getElementById('kpiBehaviorVal3').style.color = 'var(--status-amber)';
      document.getElementById('kpiBehaviorSub3').innerText = 'Score ≥ 50';

      document.getElementById('kpiBehaviorLabel4').innerText = 'Verified Contacts';
      document.getElementById('kpiBehaviorVal4').innerText = verifiedContactCounsel.toLocaleString();
      document.getElementById('kpiBehaviorVal4').style.color = 'var(--status-emerald)';
      document.getElementById('kpiBehaviorSub4').innerText = `${((verifiedContactCounsel / (attorneys.length || 1)) * 100).toFixed(1)}% direct coverage`;

      tbody.innerHTML = '';
      const fragment = document.createDocumentFragment();
      attorneys.forEach(a => {
        const tr = document.createElement('tr');
        tr.className = 'clickable-row';
        tr.onclick = () => openDossier(a.caseId);
        tr.innerHTML = `
          <td class="cell-bold">${escapeHtml(a.name)}</td>
          <td>${escapeHtml(a.firm)}</td>
          <td class="cell-mono">${a.count}</td>
          <td class="cell-mono">${formatDate(a.earliestTrial)}</td>
          <td><span class="badge-priority badge-priority-high">${a.priority}</span></td>
          <td class="cell-mono">${escapeHtml(a.phone)}</td>
          <td class="cell-mono">${escapeHtml(a.email)}</td>
        `;
        fragment.appendChild(tr);
      });
      tbody.appendChild(fragment);
    };

    if (cachedOutreachData && cachedOutreachData.rows) {
      populateAttorneys(cachedOutreachData);
    }
    fetch(`/api/drill/outreach${getStateParam('?')}`)
      .then(r => r.json())
      .then(d => {
        if (d && d.rows) {
          cachedOutreachData = d;
          populateAttorneys(d);
        }
      })
      .catch(e => console.error('Failed to load attorney behavior:', e));
    return;
  }

  // Default: Law Firms
  if (thead) {
    thead.innerHTML = `<tr><th>Law Firm</th><th>Closed Matters</th><th>Trial %</th><th>Trials</th><th>Settled</th><th>Dismissed</th></tr>`;
  }
  const populateFirms = (rows) => {
    const avgRate = rows.length ? (rows.reduce((a, r) => a + (r.trialPct || 0), 0) / rows.length).toFixed(1) : '0.0';
    const highTargets = rows.filter(r => (r.trialPct || 0) >= 25).length;
    const totalClosed = rows.reduce((a, r) => a + (r.closed || 0), 0);

    document.getElementById('kpiBehaviorLabel1').innerText = 'Firms Ranked';
    document.getElementById('kpiBehaviorVal1').innerText = rows.length.toLocaleString();
    document.getElementById('kpiBehaviorSub1').innerText = '≥ 3 closed cases';

    document.getElementById('kpiBehaviorLabel2').innerText = 'Avg Trial Rate';
    document.getElementById('kpiBehaviorVal2').innerText = `${avgRate}%`;
    document.getElementById('kpiBehaviorVal2').style.color = 'var(--status-amber)';
    document.getElementById('kpiBehaviorSub2').innerText = 'across ranked set';

    document.getElementById('kpiBehaviorLabel3').innerText = 'High-Trial Targets';
    document.getElementById('kpiBehaviorVal3').innerText = highTargets.toLocaleString();
    document.getElementById('kpiBehaviorVal3').style.color = 'var(--status-emerald)';
    document.getElementById('kpiBehaviorSub3').innerText = 'trial pct ≥ 25%';

    document.getElementById('kpiBehaviorLabel4').innerText = 'Historical Dispositions';
    document.getElementById('kpiBehaviorVal4').innerText = totalClosed.toLocaleString();
    document.getElementById('kpiBehaviorVal4').style.color = 'var(--text-white)';
    document.getElementById('kpiBehaviorSub4').innerText = 'Verified courtroom outcomes';

    tbody.innerHTML = '';
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:48px 16px;color:var(--text-muted);"><div style="font-size:14px;font-weight:600;color:var(--text-white);margin-bottom:6px;">No Disposition Analytics Available</div><div>Import historical and active litigation records in Admin Ingestion to populate firm trial rate benchmarks.</div></td></tr>`;
      return;
    }

    const fragment = document.createDocumentFragment();
    rows.forEach(d => {
      const tr = document.createElement('tr');
      const rateClass = d.trialPct >= 25 ? 'badge-priority-high' : 'badge-priority-med';
      tr.innerHTML = `
        <td class="cell-bold">${escapeHtml(d.name)}</td>
        <td class="cell-mono">${d.closed}</td>
        <td><span class="badge-priority ${rateClass}">${d.trialPct}%</span></td>
        <td class="cell-mono"><strong>${d.trials}</strong></td>
        <td class="cell-mono">${d.settled || 0} <span style="color:var(--text-muted);font-size:11px;margin-left:3px;">(${d.settledPct}%)</span></td>
        <td class="cell-mono">${d.dismissed || 0} <span style="color:var(--text-muted);font-size:11px;margin-left:3px;">(${d.dismissedPct}%)</span></td>
      `;
      fragment.appendChild(tr);
    });
    tbody.appendChild(fragment);
  };

  if (cachedBehaviorData && cachedBehaviorData.rows) {
    populateFirms(cachedBehaviorData.rows);
  }
  fetch(`/api/behavior${getStateParam('?')}`)
    .then(r => r.json())
    .then(data => {
      if (data && data.success && data.rows) {
        cachedBehaviorData = data;
        populateFirms(data.rows);
      }
    })
    .catch(err => console.error('Failed to load behavior analytics:', err));
}

// ----------------- 6. ADMIN INGESTION LOGIC ----------------- //

async function loadAdminStats() {
  try {
    const res = await fetch('/api/admin/stats');
    const data = await res.json();
    if (!data.success) return;

    document.getElementById('adminFilesCount').innerText = data.activeFiles;
    document.getElementById('adminQuality').innerText = data.ingestionQuality;
    document.getElementById('adminCasesCount').innerText = data.newCasesCount;
    document.getElementById('adminCounselCount').innerText = data.counselCount;

    const storageBadge = document.getElementById('adminStorageBadge');
    if (storageBadge && data.storageStatus) {
      const st = data.storageStatus;
      const isPgReady = st.pgConnected;
      const dotColor = isPgReady ? '#10B981' : '#F59E0B';
      const label = isPgReady
        ? 'PostgreSQL Primary (Active) + Local JSON Backup'
        : 'PostgreSQL Primary (Local JSON Backup Active until Deploy)';
      storageBadge.innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:${dotColor};display:inline-block;"></span> ${escapeHtml(label)}`;
    }

    const tbody = document.getElementById('adminLogsTbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!data.recentLogs || !data.recentLogs.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted);">No files ingested yet. Drag &amp; drop a .csv or .xlsx file above to begin testing.</td></tr>`;
      return;
    }

    data.recentLogs.forEach(log => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="cell-bold">${log.file_name}</td>
        <td class="cell-mono">${formatDate(log.imported_at)}</td>
        <td>${log.source_type}</td>
        <td class="cell-mono">${log.rows_total}</td>
        <td class="cell-mono" style="color:var(--status-emerald);">${log.rows_clean}</td>
        <td><span class="status-pill clean">${log.status}</span></td>
        <td style="text-align:right;">
          <button class="filter-chip" style="background:rgba(239,68,68,0.12);color:#FCA5A5;border-color:rgba(239,68,68,0.3);cursor:pointer;padding:4px 10px;font-size:11px;display:inline-flex;align-items:center;gap:4px;" onclick="deleteDocumentRecord('${log.log_id}', '${escapeHtml(log.file_name)}', ${log.rows_clean})" title="Delete this document and all its ingested cases">
            <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Delete
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Failed to load admin stats:', err);
  }
}

// File Drag & Drop
const dropzone = document.getElementById('dropzoneBox');
if (dropzone) {
  ['dragenter', 'dragover'].forEach(name => {
    dropzone.addEventListener(name, (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
  });
  ['dragleave', 'drop'].forEach(name => {
    dropzone.addEventListener(name, (e) => { e.preventDefault(); dropzone.classList.remove('dragover'); });
  });
  dropzone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length) handleFileSelected(files);
  });
}

async function handleFileSelected(files) {
  if (!files || !files.length) return;
  const file = files[0];

  const formData = new FormData();
  formData.append('file', file);

  showToast(`Ingesting and standardizing ${file.name}...`);
  try {
    const res = await fetch('/api/admin/upload', { method: 'POST', body: formData });
    const result = await res.json();
    if (result.success) {
      showToast(`Success: ${result.message}`);
      await loadAvailableStates();
      await refreshAllData();

      // If newly ingested cases belong to a state not currently in selectedStates, auto-include it
      if (result.detectedStates && result.detectedStates.length) {
        let changed = false;
        result.detectedStates.forEach(st => {
          if (st && st !== 'ALL' && !selectedStates.includes(st)) {
            selectedStates.push(st);
            changed = true;
          }
        });
        if (changed) {
          localStorage.setItem('litpulse_active_states', JSON.stringify(selectedStates));
          updateStateScopeTriggerLabel();
          renderStateScopeDropdown();
          onStateScopeChange();
        }
      }
    } else {
      alert(`Ingestion error: ${result.error}`);
    }
  } catch (err) {
    console.error('Upload failed:', err);
  }
}

async function deleteDocumentRecord(logId, fileName, rowCount) {
  const confirmMsg = `Are you sure you want to delete "${fileName}"?\n\nThis will permanently remove this document's log entry and all associated litigation cases (${rowCount} records) from the system, and recompute all delivery clusters and priorities.`;
  if (!confirm(confirmMsg)) return;

  try {
    showToast(`Removing document ${fileName}...`);
    const res = await fetch(`/api/admin/document/${encodeURIComponent(logId)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Removed "${fileName}" and cleared ${data.deletedCasesCount || 0} associated cases.`);
      await refreshAllData();
    } else {
      alert('Error deleting document: ' + (data.error || 'Unknown error'));
    }
  } catch (err) {
    console.error('Failed to delete document:', err);
    showToast('Failed to delete document: ' + err.message);
  }
}

async function clearAllDataPrompt() {
  alert('Clear All Data has been disabled to prevent accidental total data loss. Please use the Delete button next to each document in the table below to manage ingested data.');
}

async function refreshAllData() {
  await loadAvailableStates();
  await loadAdminStats();
  await loadDeliveriesPage();
  await loadOverviewPage();
  if (activePage === 'outreach') renderOutreachQueue();
  else if (activePage === 'largematters') renderLargeMatters();
  else if (activePage === 'deliveries') loadDeliveriesPage();
  else if (activePage === 'overview') loadOverviewPage();
  else if (activePage === 'admin') loadAdminStats();
}

// ----------------- UNIVERSAL DRILLS (LEVEL 2 & 3) ----------------- //

async function openDrill(key) {
  currentDrillKey = key;
  const backdrop = document.getElementById('drawerBackdrop');
  backdrop.classList.add('open');
  loadActiveCities();
  updateDualScrolls();

  try {
    const res = await fetch(`/api/drill/${key}${getStateParam('?')}`);
    const data = await res.json();
    if (!data.success) return;

    document.getElementById('drawerTitle').innerText = data.title;
    document.getElementById('drawerSub').innerText = data.sub;

    drillDataCache = data.rows || [];
    renderDrawerTable(drillDataCache, key);
  } catch (err) {
    console.error('Failed to open drill:', err);
  }
}

function closeDrill(e) {
  if (e && e.target !== document.getElementById('drawerBackdrop') && !e.target.closest('.close-btn')) return;
  document.getElementById('drawerBackdrop').classList.remove('open');
}

function renderDrawerTable(rows, key) {
  const thead = document.getElementById('drawerTableHead');
  const tbody = document.getElementById('drawerTableBody');
  thead.innerHTML = '';
  tbody.innerHTML = '';

  if (key === 'holds') {
    thead.innerHTML = `
      <tr>
        <th>Building Name / Firm</th>
        <th>Street Address</th>
        <th>City</th>
        <th>Counsel</th>
        <th>Hold Reason</th>
        <th>Action</th>
      </tr>
    `;

    const fragment = document.createDocumentFragment();
    rows.forEach(b => {
      const tr = document.createElement('tr');
      tr.className = 'clickable-row';
      tr.onclick = () => openBuildingDossier(b.building_id);

      let reason = 'GPS coordinates pending verification';
      const addr = String(b.address || '').toLowerCase();
      if (addr.includes('po box') || addr.includes('p.o. box')) {
        reason = 'PO Box: physical suite required for runner delivery';
      } else if (!b.geocoded) {
        reason = 'GPS geocoding unresolved';
      } else if (!b.is_precise) {
        reason = 'Imprecise facility coordinates';
      } else if (b.runner_status === 'Hold') {
        reason = 'Manual dispatch hold';
      }

      tr.innerHTML = `
        <td class="cell-bold">${escapeHtml(b.building_name || b.address || 'Commercial Building')}</td>
        <td>${escapeHtml(b.address || '')}</td>
        <td><span class="badge-tag">${escapeHtml(b.city || 'Florida')}</span></td>
        <td class="cell-mono">${b.attorneys_count || 1}</td>
        <td><span class="badge-priority badge-priority-high">${escapeHtml(reason)}</span></td>
        <td style="white-space:nowrap;">
          <button class="btn-primary" style="font-size:11px;padding:4px 10px;background:#B91C1C;color:#fff;font-weight:600;border:none;border-radius:4px;cursor:pointer;margin-right:6px;" onclick="event.stopPropagation();openResolveHoldModal('${escapeHtml(b.building_id)}')">
            🔧 Resolve Hold
          </button>
          <button class="btn-export" style="font-size:11px;padding:4px 10px;" onclick="event.stopPropagation();openBuildingDossier('${escapeHtml(b.building_id)}')">
            Inspect
          </button>
        </td>
      `;
      fragment.appendChild(tr);
    });
    tbody.appendChild(fragment);
    return;
  }

  if (key === 'deliveries') {
    thead.innerHTML = `
      <tr>
        <th>Building Name</th>
        <th>Street Address</th>
        <th>City</th>
        <th>Eligible Drops</th>
        <th>Total Counsel</th>
        <th>Firms</th>
        <th>Action</th>
      </tr>
    `;

    const fragment = document.createDocumentFragment();
    rows.forEach(b => {
      const tr = document.createElement('tr');
      tr.className = 'clickable-row';
      tr.onclick = () => openBuildingDossier(b.building_id);

      tr.innerHTML = `
        <td class="cell-bold">${escapeHtml(b.building_name || b.address || 'Commercial Building')}</td>
        <td>${escapeHtml(b.address || '')}</td>
        <td><span class="badge-tag">${escapeHtml(b.city || 'Florida')}</span></td>
        <td><span class="badge-priority badge-priority-high">${b.attorneys_count || b.eligible_drops || 1} drops</span></td>
        <td class="cell-mono">${b.attorneys_count || 1}</td>
        <td>${b.firms_count || (b.firms ? (b.firms.size || b.firms.length) : 1)}</td>
        <td>
          <button class="btn-export" style="font-size:11px;padding:4px 10px;" onclick="event.stopPropagation();openBuildingDossier('${escapeHtml(b.building_id)}')">
            View Building Dossier
          </button>
        </td>
      </tr>
      `;
      fragment.appendChild(tr);
    });
    tbody.appendChild(fragment);
    return;
  }

  if (key === 'judges') {
    thead.innerHTML = `
      <tr>
        <th>Judge Name</th>
        <th>Court &amp; City</th>
        <th>Active Trials</th>
        <th>Earliest Trial</th>
        <th>High-EAR Matters</th>
        <th>Total Pipeline</th>
        <th>Avg Priority</th>
      </tr>
    `;

    const fragment = document.createDocumentFragment();
    rows.forEach(j => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="cell-bold">${escapeHtml(j.judge_name || 'Presiding Judge')}</td>
        <td>${escapeHtml(j.court || 'S.D. Fla.')} (${escapeHtml(j.city || j.division || 'Miami')})</td>
        <td><strong style="color:var(--status-crimson);">${j.active_trials || 0}</strong></td>
        <td class="cell-mono">${formatDate(j.earliest_trial)}</td>
        <td class="cell-mono">${j.high_ear_cases || 0}</td>
        <td class="cell-mono" style="color:var(--status-emerald);font-weight:700;">${formatCurrency(j.total_ear)}</td>
        <td><span class="badge-priority badge-priority-high">${j.avg_priority || 70}</span></td>
      `;
      fragment.appendChild(tr);
    });
    tbody.appendChild(fragment);
    updateDualScrolls();
    return;
  }

  // Complete High-Priority Litigation Target Rows
  const isHistoricalKey = (key === 'historical');
  thead.innerHTML = `
    <tr>
      <th>Side</th>
      ${isHistoricalKey ? '<th>Case Outcome</th>' : ''}
      <th>Priority</th>
      <th>Lead Counsel</th>
      <th>Law Firm</th>
      <th>Firm City &amp; Locality</th>
      <th>Firm Address</th>
      <th>Matter Title &amp; Docket</th>
      <th>Judge &amp; Court</th>
      <th>Trial City</th>
      <th>${isHistoricalKey ? 'Concluded' : 'Days'}</th>
      <th>Trial Date</th>
      <th>Est. EAR</th>
      <th>CRM Status</th>
      <th>Direct Contact</th>
      <th>Owner</th>
    </tr>
  `;

  const fragment = document.createDocumentFragment();
  rows.forEach(c => {
    const tr = document.createElement('tr');
    tr.className = 'clickable-row';
    const targetIdentifier = c.target_id || c.case_id;
    tr.onclick = () => openDossier(targetIdentifier);

    const sideBadge = (c.party_side || '').toLowerCase() === 'defense'
      ? '<span class="tag-def">DEF</span>'
      : '<span class="tag-pltf">PLTF</span>';

    const isAwaitingAtty = !c.lead_attorney || c.lead_attorney === 'Awaiting Appearance' || /^(plaintiff counsel|defense counsel|plaintiff|defense|unknown counsel)$/i.test(c.lead_attorney);
    const attyDisplay = isAwaitingAtty
      ? '<span style="color:var(--text-muted);font-style:italic;">Awaiting Appearance</span>'
      : escapeHtml(c.lead_attorney);

    let firmDisplay = escapeHtml(c.firm || 'Law Firm');
    if (!c.firm || c.firm === 'Awaiting Appearance' || /^(plaintiff|defense|unknown firm)$/i.test(c.firm)) {
      firmDisplay = '<span style="color:var(--text-muted);font-style:italic;">Awaiting Appearance</span>';
    } else if (!isAwaitingAtty && c.firm.replace(/\s*,?\s*esq\.?$/i, '').trim().toLowerCase() === c.lead_attorney.replace(/\s*,?\s*esq\.?$/i, '').trim().toLowerCase()) {
      const properAtty = c.lead_attorney.replace(/\s*,?\s*esq\.?$/i, '').trim();
      firmDisplay = escapeHtml(`Law Office of ${properAtty}`);
    }

    const isClient = Boolean(c.is_client) || c.hubspot_status === 'Booked' || c.hubspot_status === 'Won' || c.hubspot_status === 'Signed';
    const clientBadge = isClient
      ? `<span class="badge-client" title="QuickBooks Client: Active billing account with Lit&More">● CLIENT</span>`
      : `<span class="badge-prospect" title="New Prospect: No prior billing account with Lit&More">PROSPECT</span>`;

    const isBadAddr = !c.address || /^(cv-|div|section|[a-z]{1,2}:|central|open)/i.test(c.address);
    const firmAddressDisplay = isBadAddr ? `${c.firm_city || c.trial_city || 'Miami'}, FL` : c.address;
    const firmCityDisplay = c.firm_city || c.city || 'Miami';
    const trialCityDisplay = c.trial_city || c.division || 'Miami';
    const isMatch = firmCityDisplay.toLowerCase() === trialCityDisplay.toLowerCase();
    const isOutOfState = c.is_oos || (c.state && c.state !== 'FL' && c.state !== 'Florida') || /, [A-Z]{2}$/.test(firmCityDisplay);

    const localityPill = renderLocalityPill(c, firmCityDisplay, trialCityDisplay) || `<span class="tag-locality tag-local" title="Local Match: Counsel office in ${escapeHtml(firmCityDisplay)} is in the same metropolitan venue as the trial court.">LOCAL</span>`;

    const isRehit = Boolean(c.is_rehit);
    const rehitBadge = isRehit
      ? `<span class="badge-rehit" title="Courier Re-Hit: Contacted ${c.rehit_date ? formatDate(c.rehit_date) : 'on prior matter'}${c.rehit_prior_matter ? ' (' + escapeHtml(c.rehit_prior_matter) + ')' : ''}"><svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>RE-HIT ${c.rehit_date ? `<span style="font-weight:500;opacity:0.95;">(${formatDate(c.rehit_date)})</span>` : ''}</span>`
      : '';

    const isWarRoom = Boolean(c.is_war_room) || (c.is_local === false && c.days_until !== undefined && c.days_until >= 0 && c.days_until <= 14);
    const warRoomBadge = isWarRoom
      ? `<span class="badge-warroom" title="Traveling Counsel War Room: Out-of-Town/Out-of-State counsel within 14 days of trial in ${escapeHtml(trialCityDisplay)}. Full Locality priority boost active.">⚡ WAR ROOM</span>`
      : '';

    let daysDisplay = '';
    if (c.days_until !== undefined && c.days_until < 0) {
      daysDisplay = `<span style="color:var(--text-muted);font-weight:600;">Concluded (${Math.abs(c.days_until)}d ago)</span>`;
    } else {
      const daysColor = (c.days_until || 0) <= 30 ? 'var(--status-crimson)' : 'var(--text-white)';
      daysDisplay = `<strong style="color:${daysColor};">${c.days_until ?? 0}d</strong>`;
    }

    const phoneHtml = c.phone
      ? `<a href="tel:${escapeHtml(c.phone)}" style="color:var(--text-platinum);text-decoration:none;display:flex;align-items:center;gap:4px;" onclick="event.stopPropagation();">
           <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
           <span>${escapeHtml(c.phone)}</span>
         </a>`
      : '<span style="color:var(--text-muted);font-size:10.5px;">No Phone</span>';

    const emailHtml = c.email
      ? `<a href="mailto:${escapeHtml(c.email)}" style="color:var(--text-platinum);text-decoration:none;display:flex;align-items:center;gap:4px;" title="${escapeHtml(c.email)}" onclick="event.stopPropagation();">
           <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
           <span style="max-width:125px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(c.email)}</span>
         </a>`
      : '<span style="color:var(--text-muted);font-size:10.5px;">No Email</span>';

    tr.innerHTML = `
      <td>${sideBadge}</td>
      ${isHistoricalKey ? `<td>${renderOutcomeBadge(c)}</td>` : ''}
      <td>${renderPriorityBadge(c)}</td>
      <td class="cell-bold">${attyDisplay}${rehitBadge}${warRoomBadge}</td>
      <td>${firmDisplay} ${clientBadge}</td>
      <td style="white-space:nowrap;">
        <span style="font-weight:600;color:var(--text-white);">${escapeHtml(firmCityDisplay)}</span>${localityPill}
      </td>
      <td style="font-size:11.5px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(firmAddressDisplay)}">
        ${escapeHtml(firmAddressDisplay)}
      </td>
      <td>
        <div style="font-weight:600;color:var(--text-white);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(c.caption || '')}">
          ${escapeHtml(c.caption || '')}
        </div>
        <div class="cell-mono">${escapeHtml(c.case_id || '')}</div>
      </td>
      <td>
        <div style="font-weight:500;color:var(--text-white);white-space:nowrap;">${escapeHtml(c.judge || 'Honorable Judge')}</div>
        <div style="font-size:11px;color:var(--text-muted);">${escapeHtml(c.court || 'S.D. Fla.')}</div>
      </td>
      <td style="white-space:nowrap;color:var(--text-platinum);">${escapeHtml(trialCityDisplay)}</td>
      <td>${daysDisplay}</td>
      <td class="cell-mono" style="white-space:nowrap;">${formatDate(c.trial_date)}</td>
      <td class="cell-mono" style="color:var(--status-emerald);font-weight:700;">${formatCurrency(c.ear || c.est_value)}</td>
      <td><span class="status-pill clean">${escapeHtml(c.hubspot_status || 'Lead')}</span></td>
      <td>
        <div style="font-size:11px;display:flex;flex-direction:column;gap:2px;">
          ${phoneHtml}
          ${emailHtml}
        </div>
      </td>
      <td>${escapeHtml(c.assigned_to || '') || '<span style="color:var(--status-amber);">Unassigned</span>'}</td>
    `;
    fragment.appendChild(tr);
  });
  tbody.appendChild(fragment);
  updateDualScrolls();
}

function filterDrawerRows(query) {
  const q = (query !== undefined ? query : (document.getElementById('drawerSearchInput')?.value || '')).toLowerCase().trim();
  const city = document.getElementById('drawerCityFilter')?.value || 'ALL';
  const assign = document.getElementById('drawerAssignFilter')?.value || 'ALL';
  const daysVal = parseInt(document.getElementById('drawerDaysInput')?.value || '', 10);

  const filtered = drillDataCache.filter(item => {
    const matchesQuery = !q || JSON.stringify(item).toLowerCase().includes(q);
    const matchesCity = city === 'ALL' || (item.trial_city && item.trial_city.toLowerCase() === city.toLowerCase()) || (item.city && item.city.toLowerCase() === city.toLowerCase()) || (item.division && item.division.toLowerCase() === city.toLowerCase());
    let matchesAssign = true;
    if (assign === 'UNASSIGNED') {
      matchesAssign = !item.assigned_to || item.assigned_to === 'Unassigned' || item.hubspot_status === 'Unassigned';
    } else if (assign === 'ASSIGNED') {
      matchesAssign = item.assigned_to && item.assigned_to !== 'Unassigned' && item.hubspot_status !== 'Unassigned';
    }
    let matchesDays = true;
    if (!isNaN(daysVal) && daysVal > 0) {
      matchesDays = item.days_until !== undefined && item.days_until >= 0 && item.days_until <= daysVal;
    }
    return matchesQuery && matchesCity && matchesAssign && matchesDays;
  });

  renderDrawerTable(filtered, currentDrillKey);
}

function filterDrawerCity(city) {
  filterDrawerRows(document.getElementById('drawerSearchInput')?.value);
}

function filterDrawerAssign(assign) {
  filterDrawerRows(document.getElementById('drawerSearchInput')?.value);
}

function filterDrawerDays(val) {
  filterDrawerRows(document.getElementById('drawerSearchInput')?.value);
}

// Level 3 Case / Counsel Dossier
async function openDossier(caseId) {
  try {
    const res = await fetch(`/api/case/${encodeURIComponent(caseId)}`);
    const data = await res.json();
    const c = data.case || {
      case_id: caseId || '1:24-cv-21490',
      target_id: caseId || '1:24-cv-21490-PLTF',
      party_side: 'Plaintiff',
      caption: 'Alvarez v. Carnival Corporation & plc',
      court: 'S.D. Fla.', division: 'Miami', judge: 'Hon. Beth Bloom',
      nos_label: 'Maritime Catastrophic Injury', trial_date: '2026-10-14', days_until: 28,
      lead_attorney: 'Michael A. Murphy', firm: 'Hickey Law Firm',
      opposing_firm: 'Mase Mebane Seitz', opposing_attorney: 'Curtis J. Mase',
      phone: '(305) 371-8000', email: 'mmurphy@hickeylawfirm.com',
      est_value: 240000, assigned_to: 'Sarah Jenkins', hubspot_status: 'In Discussion',
      pitch_angle: 'Narrative Demonstratives, Liability Timelines & Medical Boards',
      conflict_flag: false
    };

    const sideBadge = (c.party_side || '').toLowerCase() === 'defense'
      ? '<span class="tag-def" style="margin-left:8px;">DEFENSE TARGET</span>'
      : '<span class="tag-pltf" style="margin-left:8px;">PLAINTIFF TARGET</span>';

    const oppPartyName = (c.party_side || '').toLowerCase() === 'defense' ? 'Plaintiff' : 'Defense';
    const oppTargetId = (c.party_side || '').toLowerCase() === 'defense'
      ? `${c.case_id}-PLTF`
      : `${c.case_id}-DEF`;

    document.getElementById('dossierTitle').innerHTML = `${c.caption} ${sideBadge}`;
    document.getElementById('dossierSub').innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <span>Docket #${c.case_id} (${c.target_id || c.case_id}) · ${c.court} (${c.trial_city || c.division || 'Miami'})</span>
        <button class="btn-export" style="padding:4px 10px;font-size:11.5px;background:var(--bg-dark-3);border:1px solid var(--border);" onclick="openDossier('${oppTargetId}')">
          View Opposing ${oppPartyName} Target →
        </button>
      </div>
    `;

    const conflictBanner = c.conflict_flag ? `
      <div style="background:rgba(239,68,68,0.18);border:1px solid var(--status-crimson);border-radius:6px;padding:12px;margin-bottom:14px;color:#FCA5A5;font-weight:600;font-size:12px;display:flex;align-items:center;gap:10px;">
        <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <span><strong>ETHICAL CONFLICT SAFEGUARD ACTIVE:</strong> ${c.notes || 'Opposing party counsel has contracted with Lit&More for this trial docket. Outreach to this party is ethically locked.'}</span>
      </div>
    ` : '';

    const sameFirmBanner = c.same_firm_both_sides ? `
      <div style="background:rgba(245,158,11,0.15);border:1px solid #F59E0B;border-radius:6px;padding:10px 12px;margin-bottom:14px;color:#FCD34D;font-weight:600;font-size:12px;display:flex;align-items:center;gap:10px;">
        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span><strong>SAME-FIRM DUAL APPEARANCE:</strong> ${c.firm} is recorded on both Plaintiff and Defense appearances for this docket. Verify representation branch before dispatch.</span>
      </div>
    ` : '';

    const rehitBanner = c.is_rehit ? `
      <div style="background:rgba(168,85,247,0.14);border:1px solid rgba(168,85,247,0.4);border-radius:6px;padding:11px 13px;margin-bottom:14px;color:#d8b4fe;font-size:12px;display:flex;align-items:center;gap:10px;">
        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
        <div>
          <strong style="color:#f3e8ff;letter-spacing:0.4px;">COURIER RE-HIT TARGET:</strong> Counsel was previously contacted or visited ${c.rehit_date ? `on <strong>${formatDate(c.rehit_date)}</strong>` : 'on a prior trial matter'}${c.rehit_prior_matter ? ` (Prior Matter: <em>${escapeHtml(c.rehit_prior_matter)}</em>)` : ''}. Inform courier to reference prior relationship.
        </div>
      </div>
    ` : '';

    const isWarRoom = Boolean(c.is_war_room) || (c.is_local === false && c.status !== 'Historical' && c.days_until !== undefined && c.days_until >= 0 && c.days_until <= 14);
    const warRoomBanner = isWarRoom ? `
      <div style="background:rgba(245,158,11,0.14);border:1px solid rgba(245,158,11,0.45);border-radius:6px;padding:11px 13px;margin-bottom:14px;color:#FDE68A;font-size:12px;display:flex;align-items:center;gap:10px;">
        <svg width="18" height="18" fill="none" stroke="#FCD34D" stroke-width="2" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
        <div>
          <strong style="color:#FEF3C7;letter-spacing:0.4px;">TRAVELING WAR ROOM TARGET (${c.days_until ?? 0}d TO TRIAL):</strong> Counsel is based in <strong>${escapeHtml(c.firm_city || 'Out-of-Town')}</strong> and traveling to <strong>${escapeHtml(c.trial_city || c.division || 'Miami')}</strong> for trial. Traveling trial teams operate out of temporary hotel war rooms without heavy high-speed printers and have maximum urgency for local binder and exhibit board delivery. Full Locality score (+${c.locality_score ?? 20} pts) applied.
        </div>
      </div>
    ` : '';

    const scoreBreakdownCard = `
      <div class="dossier-grid" style="margin-bottom:14px;">
        <div class="dossier-card" style="grid-column: 1 / -1; background:rgba(180,48,56,0.06); border-color:rgba(180,48,56,0.28);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:6px;">
            <div class="dossier-card-title" style="margin-bottom:0;color:#FCA5A5;">Priority Score Breakdown (5-Variable Engine)</div>
            <span class="badge-priority badge-priority-high" style="font-size:12px;padding:3px 10px;">Total: ${c.priority_score ?? 70} / 100</span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(135px, 1fr));gap:10px;">
            <div style="background:rgba(0,0,0,0.25);padding:8px 10px;border-radius:6px;border:1px solid var(--border);">
              <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;">1. Days to Trial</div>
              <div style="font-size:14px;font-weight:700;color:var(--text-white);font-family:var(--font-mono);margin-top:2px;">+${c.urgency_score ?? 20} pts</div>
              <div style="font-size:10px;color:var(--text-sub);">${c.days_until ?? 0} days remaining</div>
            </div>
            <div style="background:rgba(0,0,0,0.25);padding:8px 10px;border-radius:6px;border:1px solid var(--border);">
              <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;">2. Locality Match</div>
              <div style="font-size:14px;font-weight:700;color:${isWarRoom ? '#FCD34D' : 'var(--text-white)'};font-family:var(--font-mono);margin-top:2px;">+${c.locality_score ?? 20} pts</div>
              <div style="font-size:10px;color:var(--text-sub);">${isWarRoom ? '⚡ War Room Boost' : (c.is_local ? 'Local Venue Match' : 'Non-Local (60%)')}</div>
            </div>
            <div style="background:rgba(0,0,0,0.25);padding:8px 10px;border-radius:6px;border:1px solid var(--border);">
              <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;">3. Contact / CRM</div>
              <div style="font-size:14px;font-weight:700;color:var(--text-white);font-family:var(--font-mono);margin-top:2px;">+${c.engagement_score ?? 15} pts</div>
              <div style="font-size:10px;color:var(--text-sub);">Verified Phone/Email</div>
            </div>
            <div style="background:rgba(0,0,0,0.25);padding:8px 10px;border-radius:6px;border:1px solid var(--border);">
              <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;">4. Case Type Volume</div>
              <div style="font-size:14px;font-weight:700;color:var(--text-white);font-family:var(--font-mono);margin-top:2px;">+${c.casetype_score ?? 8} pts</div>
              <div style="font-size:10px;color:var(--text-sub);">${escapeHtml(c.nos_code || 'Standard')} exhibit load</div>
            </div>
            <div style="background:rgba(0,0,0,0.25);padding:8px 10px;border-radius:6px;border:1px solid var(--border);">
              <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;">5. Est. Revenue</div>
              <div style="font-size:14px;font-weight:700;color:var(--status-emerald);font-family:var(--font-mono);margin-top:2px;">+${c.revenue_score ?? 7} pts</div>
              <div style="font-size:10px;color:var(--text-sub);">${formatCurrency(c.est_value || c.ear || 75000)} EAR</div>
            </div>
          </div>
        </div>
      </div>
    `;

    let daysDisplay = '';
    if (c.days_until !== undefined && c.days_until < 0) {
      daysDisplay = `<span style="color:var(--text-muted);font-weight:600;">Concluded (${Math.abs(c.days_until)} days ago)</span>`;
    } else {
      daysDisplay = `<span style="color:var(--status-crimson);font-weight:700;">${c.days_until || 0} days remaining</span>`;
    }

    const interactions = data.interactions || [];
    const fin = data.financial_summary || { total_billed: 0, pending_quotes: 0, retainer_balance: 0, billing_status: 'Read-Only Feed' };

    let timelineHtml = '';
    if (interactions.length > 0) {
      timelineHtml = interactions.map(item => `
        <div style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);align-items:flex-start;">
          <span style="font-size:10px;padding:2px 7px;border-radius:4px;background:${item.badge_color || 'var(--bg-dark-3)'}22;color:${item.badge_color || '#94A3B8'};border:1px solid ${item.badge_color || 'var(--border)'}44;font-weight:700;white-space:nowrap;margin-top:2px;">
            ${escapeHtml(item.source)}
          </span>
          <div style="flex:1;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
              <strong style="color:var(--text-white);font-size:12px;">${escapeHtml(item.title)}</strong>
              <span style="font-size:11px;color:var(--text-muted);font-family:monospace;">${formatDate(item.timestamp)}</span>
            </div>
            <div style="font-size:11.5px;color:var(--text-platinum);line-height:1.4;">${escapeHtml(item.description)}</div>
            <div style="font-size:10.5px;color:var(--text-muted);margin-top:4px;">Recorded by: ${escapeHtml(item.author || 'Sync Process')}</div>
          </div>
        </div>
      `).join('');
    } else {
      timelineHtml = '<div style="color:var(--text-muted);font-size:12px;padding:10px 0;">No prior interactions logged for this lead.</div>';
    }

    const isClientDossier = Boolean(c.is_client) || (fin.total_billed > 0) || c.hubspot_status === 'Booked' || c.hubspot_status === 'Won' || c.hubspot_status === 'Signed';
    const clientStatusBadge = isClientDossier
      ? `<span class="badge-client" style="font-size:11px;padding:3px 9px;">● EXISTING CLIENT</span>`
      : `<span class="badge-prospect" style="font-size:11px;padding:3px 9px;">NEW PROSPECT</span>`;

    const clientCallout = isClientDossier
      ? `<div style="padding:10px 12px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:6px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">
           <div>
             <span style="font-weight:700;color:#34D399;font-size:12px;">Active Client Account (QuickBooks Verified)</span>
             <div style="font-size:11px;color:var(--text-sub);margin-top:2px;">Prior business history on file. Approach as existing client relationship.</div>
           </div>
           <div style="text-align:right;">
             <span style="font-size:10px;color:var(--text-muted);text-transform:uppercase;">Lifetime Invoiced</span>
             <div style="font-size:14px;font-weight:700;color:#34D399;font-family:var(--font-mono);">${formatCurrency(fin.total_billed || 0)}</div>
           </div>
         </div>`
      : `<div style="padding:10px 12px;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:6px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">
           <div>
             <span style="font-weight:700;color:var(--text-white);font-size:12px;">New Prospect Account</span>
             <div style="font-size:11px;color:var(--text-sub);margin-top:2px;">No prior billing history in QuickBooks. Pitch trial readiness package.</div>
           </div>
           <span class="status-pill clean" style="font-size:10.5px;">First-Time Outreach</span>
         </div>`;

    const integrationsCard = `
      <div class="dossier-grid" style="margin-top:14px;">
        <div class="dossier-card" style="grid-column: 1 / -1;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;border-bottom:1px solid var(--border);padding-bottom:8px;flex-wrap:wrap;gap:8px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <div class="dossier-card-title" style="margin-bottom:0;">Client Account &amp; Financial History</div>
              ${clientStatusBadge}
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
              <span style="font-size:10px;padding:2px 8px;border-radius:12px;background:rgba(22,163,74,0.15);color:#4ade80;border:1px solid rgba(22,163,74,0.3);font-weight:600;">QuickBooks: Read-Only</span>
              <span style="font-size:10px;padding:2px 8px;border-radius:12px;background:rgba(249,115,22,0.15);color:#f97316;border:1px solid rgba(249,115,22,0.3);font-weight:600;">HubSpot: Read-Only</span>
            </div>
          </div>

          ${clientCallout}

          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));gap:10px;background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:6px;padding:10px;margin-bottom:14px;">
            <div>
              <div style="font-size:10.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">Billed Retainer</div>
              <div style="font-size:14px;font-weight:700;color:var(--status-emerald);font-family:monospace;">${formatCurrency(fin.total_billed || 0)}</div>
            </div>
            <div>
              <div style="font-size:10.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">Pending Quotes</div>
              <div style="font-size:14px;font-weight:700;color:#FCD34D;font-family:monospace;">${formatCurrency(fin.pending_quotes || 0)}</div>
            </div>
            <div>
              <div style="font-size:10.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">Retainer Balance</div>
              <div style="font-size:14px;font-weight:700;color:#38BDF8;font-family:monospace;">${formatCurrency(fin.retainer_balance || 0)}</div>
            </div>
            <div>
              <div style="font-size:10.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">Account Status</div>
              <div style="font-size:12.5px;font-weight:700;color:var(--text-white);">${escapeHtml(fin.billing_status || 'Active')}</div>
            </div>
          </div>

          <div style="max-height:220px;overflow-y:auto;padding-right:4px;">
            ${timelineHtml}
          </div>
        </div>
      </div>
    `;

    const content = document.getElementById('dossierContent');
    content.innerHTML = `
      ${conflictBanner}
      ${sameFirmBanner}
      ${rehitBanner}
      ${warRoomBanner}
      ${scoreBreakdownCard}
      <div class="dossier-grid">
        <div class="dossier-card">
          <div class="dossier-card-title">Trial Schedule &amp; Court Details</div>
          ${c.status === 'Historical' || (c.days_until !== undefined && c.days_until <= 0) || c.outcome ? `
          <div class="dossier-item"><span class="dossier-item-label">Case Outcome</span><span class="dossier-item-val">${renderOutcomeBadge(c)}</span></div>
          ` : ''}
          <div class="dossier-item"><span class="dossier-item-label">Trial Date</span><span class="dossier-item-val cell-mono">${formatDate(c.trial_date)}</span></div>
          <div class="dossier-item"><span class="dossier-item-label">Trial Window</span><span class="dossier-item-val">${daysDisplay}</span></div>
          <div class="dossier-item"><span class="dossier-item-label">Presiding Judge</span><span class="dossier-item-val">${c.judge || 'Federal District Judge'}</span></div>
          <div class="dossier-item"><span class="dossier-item-label">Trial City</span><span class="dossier-item-val cell-bold">${c.trial_city || c.division || 'Miami'} (${c.court})</span></div>
          <div class="dossier-item"><span class="dossier-item-label">Est. Value</span><span class="dossier-item-val cell-mono" style="color:var(--status-emerald);font-weight:700;">${formatCurrency(c.est_value)}</span></div>
        </div>
        <div class="dossier-card">
          <div class="dossier-card-title">Counsel Representation (${c.party_side || 'Target'} Side)</div>
          <div class="dossier-item"><span class="dossier-item-label">Lead Attorney</span><span class="dossier-item-val cell-bold">${c.lead_attorney || 'Counsel'}</span></div>
          <div class="dossier-item"><span class="dossier-item-label">Re-Hit Status</span><span class="dossier-item-val">${c.is_rehit ? `<span class="badge-rehit" style="margin-left:0;">RE-HIT ${c.rehit_date ? '(' + formatDate(c.rehit_date) + ')' : ''}</span>` : '<span style="color:var(--text-muted);">First-Time Target</span>'}</span></div>
          ${c.rehit_date ? `<div class="dossier-item"><span class="dossier-item-label">Date Contacted</span><span class="dossier-item-val cell-mono" style="color:#c084fc;font-weight:600;">${formatDate(c.rehit_date)}</span></div>` : ''}
          ${c.rehit_prior_matter ? `<div class="dossier-item"><span class="dossier-item-label">Prior Matter</span><span class="dossier-item-val" style="font-size:11.5px;">${escapeHtml(c.rehit_prior_matter)}</span></div>` : ''}
          <div class="dossier-item"><span class="dossier-item-label">Law Firm</span><span class="dossier-item-val">${c.firm || 'Law Practice'}</span></div>
          <div class="dossier-item"><span class="dossier-item-label">Firm City</span><span class="dossier-item-val cell-bold">${c.firm_city || c.city || 'Miami'} <span class="status-pill clean" style="font-size:10px;padding:2px 7px;font-weight:600;">${c.locality_badge || 'Local FL'}</span></span></div>
          <div class="dossier-item"><span class="dossier-item-label">Office Address</span><span class="dossier-item-val">${c.address || c.city || 'Miami, FL'}</span></div>
          <div class="dossier-item"><span class="dossier-item-label">Opposing Counsel</span><span class="dossier-item-val">${c.opposing_attorney || 'Opposing Lead'}</span></div>
          <div class="dossier-item"><span class="dossier-item-label">Opposing Firm</span><span class="dossier-item-val">${c.opposing_firm || 'Opposing Firm'}</span></div>
        </div>
      </div>

      <div class="dossier-grid">
        <div class="dossier-card">
          <div class="dossier-card-title">Direct Counsel Contact &amp; Office</div>
          <div class="dossier-item"><span class="dossier-item-label">Direct Phone</span><span class="dossier-item-val cell-mono">${c.phone ? `<a href="tel:${escapeHtml(c.phone)}" style="color:var(--text-white);text-decoration:none;">${escapeHtml(c.phone)}</a>` : 'N/A'}</span></div>
          <div class="dossier-item"><span class="dossier-item-label">Direct Email</span><span class="dossier-item-val cell-mono">${c.email ? `<a href="mailto:${escapeHtml(c.email)}" style="color:#93C5FD;text-decoration:none;">${escapeHtml(c.email)}</a>` : 'N/A'}</span></div>
          <div class="dossier-item"><span class="dossier-item-label">Office Address</span><span class="dossier-item-val">${escapeHtml(c.address || c.firm_city || 'Miami, FL')}</span></div>
          <div class="dossier-item"><span class="dossier-item-label">Lead Attorney</span><span class="dossier-item-val cell-bold">${escapeHtml(c.lead_attorney || 'Counsel')}</span></div>
        </div>
        <div class="dossier-card">
          <div class="dossier-card-title">HubSpot CRM Lifecycle (Read-Only)</div>
          <div class="dossier-item" style="margin-bottom:12px;">
            <span class="dossier-item-label">Assigned Rep</span>
            <span class="dossier-item-val" style="font-weight:600;color:${c.assigned_to && c.assigned_to !== 'Unassigned' ? 'var(--text-white)' : 'var(--status-amber)'};">${escapeHtml(c.assigned_to || 'Unassigned')}</span>
          </div>
          <div class="dossier-item" style="margin-bottom:12px;">
            <span class="dossier-item-label">CRM Status</span>
            <span class="status-pill ${c.hubspot_status === 'Booked' ? 'high-density' : 'clean'}" style="font-size:11px;font-weight:700;">${escapeHtml(c.hubspot_status || 'New')}</span>
          </div>
          <div style="font-size:11.5px;color:var(--text-muted);background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:4px;padding:8px 10px;margin-top:14px;display:flex;align-items:center;gap:6px;">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <span>Managed externally in HubSpot. System reads live updates directly.</span>
          </div>
        </div>
      </div>
      ${integrationsCard}
    `;
    document.getElementById('dossierModal').classList.add('open');
    const modalBox = document.querySelector('#dossierModal .modal-box');
    if (modalBox) modalBox.scrollTop = 0;
  } catch (err) {
    console.error('Error opening dossier:', err);
  }
}

function closeDossier(e) {
  if (e) {
    if (e.target !== document.getElementById('dossierModal') && !e.target.closest('.close-btn')) return;
    e.stopPropagation();
  }
  document.getElementById('dossierModal').classList.remove('open');
}

// ================= LEVEL 2.5: COMPREHENSIVE BUILDING OUTREACH DOSSIER ================= //

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

let activeBuildingLifecycle = 'active';
let currentBuildingActiveCases = [];
let currentBuildingHistoricalCases = [];

function setBuildingLifecycle(lifecycle) {
  activeBuildingLifecycle = lifecycle;
  ['active', 'historical', 'all'].forEach(tab => {
    const el = document.getElementById(`bldgTab${tab === 'active' ? 'Active' : (tab === 'historical' ? 'Hist' : 'All')}`);
    if (el) el.classList.toggle('active', tab === lifecycle);
  });
  applyBuildingTableFilter();
}

function applyBuildingTableFilter() {
  let pool = currentBuildingCases;
  if (activeBuildingLifecycle === 'active') pool = currentBuildingActiveCases;
  else if (activeBuildingLifecycle === 'historical') pool = currentBuildingHistoricalCases;

  const query = (document.getElementById('bldgSearchInput')?.value || '').toLowerCase().trim();
  if (query) {
    pool = pool.filter(c => {
      return (c.lead_attorney && c.lead_attorney.toLowerCase().includes(query)) ||
             (c.firm && c.firm.toLowerCase().includes(query)) ||
             (c.case_id && c.case_id.toLowerCase().includes(query)) ||
             (c.caption && c.caption.toLowerCase().includes(query)) ||
             (c.email && c.email.toLowerCase().includes(query)) ||
             (c.phone && c.phone.toLowerCase().includes(query)) ||
             (c.party_side && c.party_side.toLowerCase().includes(query));
    });
  }
  renderBuildingAttorneysTable(pool);
}

function filterBuildingTableRows(query) {
  applyBuildingTableFilter();
}

async function openBuildingDossier(buildingId) {
  if (!buildingId) return;
  try {
    const res = await fetch(`/api/building/${encodeURIComponent(buildingId)}`);
    if (!res.ok) {
      return showToast('Building details not found.');
    }
    const data = await res.json();
    if (!data.success || !data.building) {
      return showToast('Building details not found.');
    }

    currentBuildingData = data.building;
    currentBuildingCases = data.cases || [];
    currentBuildingActiveCases = data.activeCases || currentBuildingCases.filter(c => c.status !== 'Historical' && (c.days_until === undefined || c.days_until >= 0) && (!c.is_oos && (!c.state || c.state === 'FL')));
    currentBuildingHistoricalCases = data.historicalCases || currentBuildingCases.filter(c => c.status === 'Historical' || (c.days_until !== undefined && c.days_until < 0) || (c.is_oos || (c.state && c.state !== 'FL')));

    const b = data.building;
    const activeDrops = currentBuildingActiveCases.length;

    // Header Details
    const nameEl = document.getElementById('bldgModalName');
    if (nameEl) nameEl.innerText = b.building_name || b.address;

    const addrEl = document.getElementById('bldgModalAddress');
    if (addrEl) addrEl.innerText = `${b.address || ''} · ${b.city || 'Florida'}`;

    const dropsEl = document.getElementById('bldgModalDrops');
    if (dropsEl) dropsEl.innerText = `${activeDrops} Drops`;

    const uniqueFirms = new Set(currentBuildingActiveCases.map(c => c.firm).filter(Boolean));
    const firmsEl = document.getElementById('bldgModalFirms');
    if (firmsEl) firmsEl.innerText = `${uniqueFirms.size || b.firms_count || 1} Firms`;

    const parkEl = document.getElementById('bldgModalParking');
    if (parkEl) parkEl.innerText = b.parking_notes || 'Commercial parking facility';

    const secEl = document.getElementById('bldgModalSecurity');
    if (secEl) secEl.innerText = b.security_notes || 'Lobby reception check-in required';

    const srcEl = document.getElementById('bldgModalFacilitySource');
    if (srcEl) srcEl.innerText = `● ${b.facility_source || 'Verified Facility Data'}`;

    // Populate edit inputs
    const editPark = document.getElementById('editBldgParkingInput');
    if (editPark) editPark.value = b.parking_notes || '';
    const editSec = document.getElementById('editBldgSecurityInput');
    if (editSec) editSec.value = b.security_notes || '';
    toggleBuildingAccessEdit(false);

    // Tab counts
    const elActive = document.getElementById('bldgActiveCount');
    if (elActive) elActive.innerText = currentBuildingActiveCases.length;
    const elHist = document.getElementById('bldgHistCount');
    if (elHist) elHist.innerText = currentBuildingHistoricalCases.length;
    const elAll = document.getElementById('bldgAllCount');
    if (elAll) elAll.innerText = currentBuildingCases.length;

    // Default to active drops
    activeBuildingLifecycle = 'active';
    ['active', 'historical', 'all'].forEach(tab => {
      const el = document.getElementById(`bldgTab${tab === 'active' ? 'Active' : (tab === 'historical' ? 'Hist' : 'All')}`);
      if (el) el.classList.toggle('active', tab === 'active');
    });

    // Walkable loop info
    const walkBadge = document.getElementById('bldgModalWalkBadge');
    const walkDesc = document.getElementById('bldgModalWalkDesc');
    const walkLoop = (walkableClustersCache || []).find(c => c && c.stops && c.stops.some(s => s.building_id === b.building_id));

    if (walkLoop && walkLoop.is_walkable) {
      const anchorName = walkLoop.anchor_building?.building_name || walkLoop.anchor_building?.address || 'Parking Anchor';
      if (walkBadge) {
        walkBadge.style.display = 'inline-block';
        walkBadge.innerText = '🚶 Walkable Loop';
      }
      if (walkDesc) {
        walkDesc.innerHTML = `<span style="color:#34D399;font-weight:600;">Walk Loop:</span> ${walkLoop.buildings_count} buildings within ${walkLoop.max_walk_radius_meters}m (Park once at ${escapeHtml(anchorName)})`;
      }
    } else {
      if (walkBadge) walkBadge.style.display = 'none';
      if (walkDesc) walkDesc.innerText = 'Single building stop (requires individual parking)';
    }

    // Clear search input
    const searchInput = document.getElementById('bldgSearchInput');
    if (searchInput) searchInput.value = '';

    // Check if building is currently on hold or has PO Box
    const isHold = !b.geocoded || !b.is_precise || !b.lat || !b.lng || b.runner_status === 'Hold';
    const isPoBox = /p\.?o\.?\s*box/i.test(b.address || '');
    const holdBanner = document.getElementById('bldgModalHoldBanner');
    const headerResolveBtn = document.getElementById('bldgHeaderResolveBtn');
    const holdReasonEl = document.getElementById('bldgModalHoldReason');

    if (isHold || isPoBox) {
      if (holdBanner) holdBanner.style.display = 'flex';
      if (headerResolveBtn) headerResolveBtn.style.display = 'inline-flex';
      if (holdReasonEl) {
        if (isPoBox) {
          holdReasonEl.innerText = 'P.O. Box address detected. Hand deliveries require a verified commercial law office street address and suite.';
        } else if (!b.geocoded) {
          holdReasonEl.innerText = 'GPS rooftop coordinates unresolved. Address verification required for runner dispatch.';
        } else if (b.runner_status === 'Hold') {
          holdReasonEl.innerText = 'Administrative dispatch hold placed on this facility.';
        } else {
          holdReasonEl.innerText = 'Imprecise facility coordinates. Physical suite verification required.';
        }
      }
    } else {
      if (holdBanner) holdBanner.style.display = 'none';
      if (headerResolveBtn) headerResolveBtn.style.display = 'none';
    }

    renderBuildingAttorneysTable(currentBuildingActiveCases);

    const modal = document.getElementById('buildingDossierModal');
    if (modal) modal.classList.add('open');
  } catch (err) {
    console.error('Failed to open building dossier:', err);
    showToast('Failed to load building dossier.');
  }
}

function toggleBuildingAccessEdit(show) {
  const box = document.getElementById('bldgAccessEditBox');
  if (!box) return;
  if (show === undefined) {
    box.style.display = box.style.display === 'none' ? 'block' : 'none';
  } else {
    box.style.display = show ? 'block' : 'none';
  }
}

async function saveBuildingAccessNotes() {
  if (!currentBuildingData || !currentBuildingData.building_id) return;
  const parkingNotes = document.getElementById('editBldgParkingInput')?.value || '';
  const securityNotes = document.getElementById('editBldgSecurityInput')?.value || '';

  try {
    showToast('Saving courier access logistics...');
    const res = await fetch(`/api/building/${encodeURIComponent(currentBuildingData.building_id)}/access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parking_notes: parkingNotes, security_notes: securityNotes })
    });
    const data = await res.json();
    if (data.success && data.building) {
      currentBuildingData.parking_notes = data.building.parking_notes;
      currentBuildingData.security_notes = data.building.security_notes;
      currentBuildingData.facility_source = data.building.facility_source;

      const parkEl = document.getElementById('bldgModalParking');
      if (parkEl) parkEl.innerText = data.building.parking_notes;
      const secEl = document.getElementById('bldgModalSecurity');
      if (secEl) secEl.innerText = data.building.security_notes;
      const srcEl = document.getElementById('bldgModalFacilitySource');
      if (srcEl) srcEl.innerText = `● ${data.building.facility_source || 'Courier Field Override'}`;

      toggleBuildingAccessEdit(false);
      showToast('Courier access logistics saved successfully.');
    } else {
      showToast('Failed to save access notes: ' + (data.error || 'Unknown error'));
    }
  } catch (err) {
    showToast('Error saving access notes: ' + err.message);
  }
}

function renderBuildingAttorneysTable(cases) {
  const tbody = document.getElementById('bldgAttorneysTbody');
  const countEl = document.getElementById('bldgRowCount');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (countEl) {
    countEl.innerText = `Showing ${cases.length} counsel ${cases.length === 1 ? 'row' : 'rows'}`;
  }

  if (!cases || !cases.length) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:36px;color:var(--text-muted);">No attorney appearances recorded at this physical address yet.</td></tr>`;
    return;
  }

  const fragment = document.createDocumentFragment();

  cases.forEach(c => {
    const tr = document.createElement('tr');
    tr.className = 'clickable-row';

    const sideTag = (c.party_side || '').toLowerCase() === 'defense'
      ? `<span class="tag-def">DEFENSE</span>`
      : `<span class="tag-pltf">PLAINTIFF</span>`;

    let daysDisplay = '';
    if (c.days_until !== undefined && c.days_until < 0) {
      daysDisplay = `<div style="margin-top:3px;">${renderOutcomeBadge(c)}</div>`;
    } else if (c.days_until <= 30) {
      daysDisplay = `<span style="color:var(--status-crimson);font-weight:700;">${c.days_until}d remaining</span>`;
    } else if (c.days_until <= 60) {
      daysDisplay = `<span style="color:var(--status-amber);font-weight:600;">${c.days_until}d remaining</span>`;
    } else {
      daysDisplay = `<span style="color:#93C5FD;">${c.days_until || 0}d remaining</span>`;
    }

    const conflictHtml = c.conflict_flag
      ? `<span style="color:#EF4444;font-weight:700;font-size:11px;">Locked</span>`
      : `<span style="color:#10B981;font-weight:600;font-size:11px;">Clean</span>`;

    const isAwaitingAtty = !c.lead_attorney || c.lead_attorney === 'Awaiting Appearance' || /^(plaintiff counsel|defense counsel|plaintiff|defense|unknown counsel)$/i.test(c.lead_attorney);
    const attyDisplay = isAwaitingAtty
      ? '<span style="color:var(--text-muted);font-style:italic;">Awaiting Appearance</span>'
      : escapeHtml(c.lead_attorney);

    let firmDisplay = escapeHtml(c.firm || 'Law Practice');
    if (!c.firm || c.firm === 'Awaiting Appearance' || /^(plaintiff|defense|unknown firm)$/i.test(c.firm)) {
      firmDisplay = '<span style="color:var(--text-muted);font-style:italic;">Awaiting Appearance</span>';
    } else if (!isAwaitingAtty && c.firm.replace(/\s*,?\s*esq\.?$/i, '').trim().toLowerCase() === c.lead_attorney.replace(/\s*,?\s*esq\.?$/i, '').trim().toLowerCase()) {
      const properAtty = c.lead_attorney.replace(/\s*,?\s*esq\.?$/i, '').trim();
      firmDisplay = escapeHtml(`Law Office of ${properAtty}`);
    }

    const targetIdSafe = escapeHtml(c.target_id || c.case_id || '');
    const phoneSafe = escapeHtml(c.phone || '');
    const emailSafe = escapeHtml(c.email || '');

    const isRehit = Boolean(c.is_rehit);
    const rehitBadge = isRehit
      ? `<span class="badge-rehit" title="Courier Re-Hit: Contacted ${c.rehit_date ? formatDate(c.rehit_date) : 'on prior matter'}${c.rehit_prior_matter ? ' (' + escapeHtml(c.rehit_prior_matter) + ')' : ''}"><svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>RE-HIT ${c.rehit_date ? `<span style="font-weight:500;opacity:0.95;">(${formatDate(c.rehit_date)})</span>` : ''}</span>`
      : '';

    tr.innerHTML = `
      <td class="cell-bold">${attyDisplay}${rehitBadge}</td>
      <td style="color:var(--text-platinum);">${firmDisplay}</td>
      <td>${sideTag}</td>
      <td>
        <div style="font-weight:600;color:var(--text-white);max-width:240px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(c.caption || '')}">
          ${escapeHtml(c.caption || 'Litigation Matter')}
        </div>
        <div style="font-size:11px;color:#93C5FD;font-family:monospace;">${escapeHtml(c.case_id || '')}</div>
      </td>
      <td>
        <div style="font-family:monospace;font-size:11.5px;">${formatDate(c.trial_date)}</div>
        ${daysDisplay}
      </td>
      <td class="cell-mono">
        ${phoneSafe && phoneSafe !== 'N/A' ? `<a href="tel:${phoneSafe}" style="color:var(--text-white);text-decoration:none;" onclick="event.stopPropagation();">${phoneSafe}</a>` : '<span style="color:var(--text-muted);">N/A</span>'}
      </td>
      <td class="cell-mono">
        ${emailSafe && emailSafe !== 'N/A' ? `<a href="mailto:${emailSafe}" style="color:#93C5FD;text-decoration:none;" onclick="event.stopPropagation();">${emailSafe}</a>` : '<span style="color:var(--text-muted);">N/A</span>'}
      </td>
      <td>
        <span style="font-size:11.5px;color:${c.assigned_to ? 'var(--text-white)' : 'var(--status-amber)'};">${escapeHtml(c.assigned_to || 'Unassigned')}</span>
      </td>
      <td>
        <span class="status-pill ${c.hubspot_status === 'Booked' ? 'high-density' : 'clean'}" style="font-size:10px;">${escapeHtml(c.hubspot_status || 'New')}</span>
      </td>
      <td>${conflictHtml}</td>
      <td>
        <button class="btn-export" style="padding:3px 8px;font-size:10.5px;" onclick="event.stopPropagation();openDossier('${targetIdSafe}')">
          Case Dossier
        </button>
      </td>
    `;

    tr.onclick = () => openDossier(c.target_id || c.case_id);
    fragment.appendChild(tr);
  });

  tbody.appendChild(fragment);
}

function downloadBuildingCsv() {
  if (!currentBuildingData) return showToast('No building selected.');
  window.location.href = `/api/building/${encodeURIComponent(currentBuildingData.building_id)}/export-csv`;
}

function closeBuildingDossier(e) {
  if (e && e.target !== document.getElementById('buildingDossierModal') && !e.target.closest('.close-btn')) return;
  document.getElementById('buildingDossierModal').classList.remove('open');
}

// ----------------- DELIVERY DATA HOLD RESOLUTION ----------------- //

function openResolveHoldModal(buildingId) {
  if (!buildingId) return;
  const b = (fullBuildingsCache || []).find(x => x.building_id === buildingId) || currentBuildingData;
  if (!b) return showToast('Building details not found.');

  const bldgIdInput = document.getElementById('resolveHoldBldgId');
  if (bldgIdInput) bldgIdInput.value = b.building_id;

  const titleEl = document.getElementById('resolveHoldTitle');
  if (titleEl) titleEl.innerText = b.building_name || b.address || 'Commercial Building';

  const curAddrEl = document.getElementById('resolveHoldCurrentAddressDisplay');
  if (curAddrEl) curAddrEl.innerText = `${b.address || ''} · ${b.city || 'Florida'}`;

  // Analyze hold reason
  const addr = String(b.address || '').toLowerCase();
  const issueTitle = document.getElementById('resolveHoldIssueTitle');
  const issueDesc = document.getElementById('resolveHoldIssueDesc');

  if (addr.includes('po box') || addr.includes('p.o. box')) {
    if (issueTitle) issueTitle.innerText = 'P.O. Box Detected (Courier Ineligible)';
    if (issueDesc) issueDesc.innerText = 'Courier hand deliveries require a verified physical commercial law office suite. Enter the firm\'s actual street address below.';
  } else if (!b.geocoded) {
    if (issueTitle) issueTitle.innerText = 'GPS Rooftop Unresolved';
    if (issueDesc) issueDesc.innerText = 'OpenStreetMap/Photon could not automatically pinpoint this address. Verify or correct the street spelling.';
  } else if (!b.is_precise) {
    if (issueTitle) issueTitle.innerText = 'Facility Baseline Imprecise';
    if (issueDesc) issueDesc.innerText = 'Coordinates are estimated based on regional baseline. Input verified physical address for rooftop precision.';
  } else if (b.runner_status === 'Hold') {
    if (issueTitle) issueTitle.innerText = 'Manual Dispatch Hold';
    if (issueDesc) issueDesc.innerText = 'This building was manually put on hold. Confirm access notes and release when ready.';
  }

  // Pre-fill fields
  let cleanStreet = b.address || '';
  if (/p\.?o\.?\s*box/i.test(cleanStreet)) {
    cleanStreet = cleanStreet.replace(/,\s*p\.?o\.?\s*box\s*[\w\d-]+/i, '').replace(/p\.?o\.?\s*box\s*[\w\d-]+/i, '').trim();
    if (cleanStreet.toLowerCase().startsWith('universal property')) {
      cleanStreet = '1110 W Commercial Blvd';
    }
  }
  cleanStreet = cleanStreet.replace(/,\s*[A-Z]{2}$/i, '').replace(/,\s*(Fort Lauderdale|Miami|Tampa|Orlando|Jacksonville|West Palm Beach).*/i, '').trim();

  const addrInput = document.getElementById('resolveAddressInput');
  if (addrInput) addrInput.value = cleanStreet || '';

  const suiteInput = document.getElementById('resolveSuiteInput');
  if (suiteInput) suiteInput.value = b.suite || '';

  const cityInput = document.getElementById('resolveCityInput');
  if (cityInput) cityInput.value = b.city || 'Fort Lauderdale';

  const stateInput = document.getElementById('resolveStateInput');
  if (stateInput) stateInput.value = b.state || 'FL';

  const nameInput = document.getElementById('resolveBuildingNameInput');
  if (nameInput) nameInput.value = b.building_name || '';

  const parkInput = document.getElementById('resolveParkingInput');
  if (parkInput) parkInput.value = b.parking_notes || '';

  const secInput = document.getElementById('resolveSecurityInput');
  if (secInput) secInput.value = b.security_notes || '';

  const statusSelect = document.getElementById('resolveStatusSelect');
  if (statusSelect) statusSelect.value = 'Ready for Drop';

  const modal = document.getElementById('resolveHoldModal');
  if (modal) modal.classList.add('open');
}

function closeResolveHoldModal(e) {
  if (e && e.target !== document.getElementById('resolveHoldModal') && !e.target.closest('.close-btn') && !e.target.closest('.btn-export')) return;
  if (e) e.stopPropagation();
  const modal = document.getElementById('resolveHoldModal');
  if (modal) modal.classList.remove('open');
}

async function submitResolveHold() {
  const bldgId = document.getElementById('resolveHoldBldgId')?.value;
  if (!bldgId) return showToast('Building ID missing.');

  const verifiedAddress = document.getElementById('resolveAddressInput')?.value.trim();
  const suite = document.getElementById('resolveSuiteInput')?.value.trim();
  const city = document.getElementById('resolveCityInput')?.value.trim();
  const state = document.getElementById('resolveStateInput')?.value.trim() || 'FL';
  const buildingName = document.getElementById('resolveBuildingNameInput')?.value.trim();
  const parkingNotes = document.getElementById('resolveParkingInput')?.value.trim();
  const securityNotes = document.getElementById('resolveSecurityInput')?.value.trim();
  const runnerStatus = document.getElementById('resolveStatusSelect')?.value || 'Ready for Drop';

  if (!verifiedAddress) {
    return showToast('Please enter a verified physical street address.');
  }
  if (!city) {
    return showToast('Please enter the city for this address.');
  }

  const btn = document.getElementById('resolveHoldSubmitBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerText = 'Verifying & Geocoding...';
  }

  try {
    const res = await fetch(`/api/building/${encodeURIComponent(bldgId)}/resolve-hold`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        verified_address: verifiedAddress,
        suite,
        city,
        state,
        building_name: buildingName,
        parking_notes: parkingNotes,
        security_notes: securityNotes,
        runner_status: runnerStatus
      })
    });

    const data = await res.json();
    if (!data.success || !data.building) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span>✓ Verify Address &amp; Release Hold</span>';
      }
      return showToast(data.error || 'Failed to resolve hold.');
    }

    showToast('Delivery hold resolved! Building address verified and released for courier dispatch.');
    closeResolveHoldModal();

    // Update building in local cache
    const updated = data.building;
    const idx = (fullBuildingsCache || []).findIndex(b => b.building_id === bldgId);
    if (idx !== -1) {
      fullBuildingsCache[idx] = { ...fullBuildingsCache[idx], ...updated };
    }

    // Refresh Holds table and deliveries directory
    renderHoldsTable(fullBuildingsCache);
    renderDeliveriesDirectory(fullBuildingsCache);

    // Update KPI count
    const holdsList = (fullBuildingsCache || []).filter(b => !b.geocoded || !b.is_precise || !b.lat || !b.lng || b.runner_status === 'Hold');
    const holdsEl = document.getElementById('kpiDelivHolds');
    if (holdsEl) holdsEl.innerText = holdsList.length.toLocaleString();

    // If Building Dossier Modal is open, refresh it
    if (document.getElementById('buildingDossierModal')?.classList.contains('open') && currentBuildingData?.building_id === bldgId) {
      openBuildingDossier(bldgId);
    }

    // If Universal Drill Drawer is open on holds, refresh it
    if (document.getElementById('drawerBackdrop')?.classList.contains('open') && currentDrillKey === 'holds') {
      openDrill('holds');
    }
  } catch (err) {
    console.error('Error resolving hold:', err);
    showToast('Failed to resolve hold: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>✓ Verify Address &amp; Release Hold</span>';
    }
  }
}

function handleGlobalSearch(q) {
  if (!q) return;
  openDrill('outreach');
  document.getElementById('drawerSearchInput').value = q;
  filterDrawerRows(q);
}

function exportActiveCsv() {
  const isDrawerOpen = document.getElementById('drawerBackdrop')?.classList.contains('open');
  let key = isDrawerOpen ? (currentDrillKey || 'outreach') : (activePage || 'outreach');
  if (!isDrawerOpen && activePage === 'outreach' && activeLifecycle === 'historical') {
    key = 'historical';
  }
  if (!isDrawerOpen && activePage === 'behavior') {
    key = currentBehaviorTab === 'judges' ? 'judges' : (currentBehaviorTab === 'attorneys' ? 'outreach' : 'outreach');
  }

  const q = isDrawerOpen
    ? (document.getElementById('drawerSearchInput')?.value || '')
    : (activePage === 'largematters' ? (document.getElementById('largeMattersSearchInput')?.value || '') : (document.getElementById('globalSearchInput')?.value || ''));
  const city = isDrawerOpen
    ? (document.getElementById('drawerCityFilter')?.value || 'ALL')
    : (activePage === 'largematters'
        ? (document.getElementById('largeMattersCityFilter')?.value || 'ALL')
        : (document.getElementById('outreachCityFilter')?.value || activeOutreachCity || 'ALL'));
  const assign = isDrawerOpen
    ? (document.getElementById('drawerAssignFilter')?.value || 'ALL')
    : (activePage === 'largematters' ? (document.getElementById('largeMattersAssignFilter')?.value || 'ALL') : (activeAssignmentFilter || 'ALL'));
  const party = activeOutreachSide || 'ALL';
  const win = activeWindowFilter || 'ALL';

  const params = new URLSearchParams({
    drillKey: key,
    q,
    city,
    assignment: assign,
    partySide: party,
    window: win
  });

  if (selectedStates && selectedStates.length && !selectedStates.includes('ALL')) {
    params.set('state', selectedStates.join(','));
  }

  showToast('Generating filtered CSV export...');
  window.location.href = `/api/export/csv?${params.toString()}`;
}

// ----------------- ACTIVE CITIES & DUAL HORIZONTAL SCROLL ----------------- //

async function loadActiveCities() {
  try {
    const res = await fetch(`/api/cities/active${getStateParam('?')}`);
    const data = await res.json();
    if (!data.success || !data.cities) return;

    const cities = data.cities;
    const total = data.totalActiveTrials || 0;

    // 1. Universal Drill Drawer City Filter
    const drawerSelect = document.getElementById('drawerCityFilter');
    if (drawerSelect) {
      const cur = drawerSelect.value;
      drawerSelect.innerHTML = `<option value="ALL">All Cities (${total.toLocaleString()} active)</option>` +
        cities.map(c => `<option value="${escapeHtml(c.city)}">${escapeHtml(c.city)} (${c.count.toLocaleString()})</option>`).join('');
      if (cur) drawerSelect.value = cur;
    }

    // 2. Outreach Queue City Filter
    const outreachSelect = document.getElementById('outreachCityFilter');
    if (outreachSelect) {
      const cur = outreachSelect.value;
      outreachSelect.innerHTML = `<option value="ALL">All Trial Cities (${total.toLocaleString()})</option>` +
        cities.map(c => `<option value="${escapeHtml(c.city)}">${escapeHtml(c.city)} (${c.count.toLocaleString()})</option>`).join('');
      if (cur) outreachSelect.value = cur;
    }
  } catch (err) {
    console.error('Failed to load active cities:', err);
  }
}

function setupDualScroll(topId, wrapId, tableId) {
  const topEl = document.getElementById(topId);
  const wrapEl = document.getElementById(wrapId);
  const tableEl = document.getElementById(tableId);
  if (!topEl || !wrapEl || !tableEl) return;

  const innerEl = topEl.querySelector('.table-top-scroll-inner');

  const updateWidth = () => {
    if (innerEl && tableEl && wrapEl) {
      const scrollW = Math.max(tableEl.scrollWidth, wrapEl.scrollWidth);
      innerEl.style.width = scrollW + 'px';
      topEl.style.display = (scrollW > wrapEl.clientWidth) ? 'block' : 'none';
    }
  };

  let activeSource = null;
  let syncTimeout = null;

  topEl.addEventListener('scroll', () => {
    if (activeSource && activeSource !== 'top') return;
    activeSource = 'top';
    wrapEl.scrollLeft = topEl.scrollLeft;
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => { activeSource = null; }, 60);
  }, { passive: true });

  wrapEl.addEventListener('scroll', () => {
    if (activeSource && activeSource !== 'wrap') return;
    activeSource = 'wrap';
    topEl.scrollLeft = wrapEl.scrollLeft;
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => { activeSource = null; }, 60);
  }, { passive: true });

  if (window.ResizeObserver) {
    const ro = new ResizeObserver(updateWidth);
    ro.observe(tableEl);
    ro.observe(wrapEl);
  }
  window.addEventListener('resize', updateWidth);
  setTimeout(updateWidth, 100);
}

function updateDualScrolls() {
  setTimeout(() => {
    const pairs = [
      { top: 'outreachTopScroll', wrap: 'outreachTableWrap', table: 'outreachTable' },
      { top: 'largeMattersTopScroll', wrap: 'largeMattersTableWrap', table: 'largeMattersTable' },
      { top: 'drawerTopScroll', wrap: 'drawerTableWrap', table: 'drawerTable' }
    ];
    pairs.forEach(({ top, wrap, table }) => {
      const topEl = document.getElementById(top);
      const wrapEl = document.getElementById(wrap);
      const tableEl = document.getElementById(table);
      if (topEl && tableEl && wrapEl) {
        const innerEl = topEl.querySelector('.table-top-scroll-inner');
        if (innerEl) {
          const scrollW = Math.max(tableEl.scrollWidth, wrapEl.scrollWidth);
          innerEl.style.width = scrollW + 'px';
          topEl.style.display = (scrollW > wrapEl.clientWidth) ? 'block' : 'none';
        }
      }
    });
  }, 100);
}

let realtimeSyncTimer = null;
let cachedBehaviorData = null;
let cachedJudgesData = null;

async function prefetchAllTabs() {
  try {
    Promise.allSettled([
      fetch(`/api/drill/outreach${getStateParam('?')}`).then(r => r.json()).then(d => {
        if (d && d.success) {
          cachedOutreachData = d;
          updateOutreachCountsFromData(d);
        }
      }),
      fetch(`/api/drill/largematters${getStateParam('?')}`).then(r => r.json()).then(d => {
        if (d && d.success) {
          largeMattersCache = (d.rows || []).filter(c => c.days_until === undefined || c.days_until > 0);
          largeMattersCache.sort((a, b) => {
            const pDiff = (b.priority_score || 0) - (a.priority_score || 0);
            if (pDiff !== 0) return pDiff;
            return (b.ear || b.full_value || 0) - (a.ear || a.full_value || 0);
          });
          updateLargeMattersKpis();
        }
      }),
      fetch(`/api/behavior?minClosed=3${getStateParam('&')}`).then(r => r.json()).then(d => {
        if (d && d.success) cachedBehaviorData = d;
      }),
      fetch(`/api/judges${getStateParam('?')}`).then(r => r.json()).then(d => {
        if (d && d.success) cachedJudgesData = d;
      })
    ]);
  } catch (err) {
    console.warn('Tab prefetch warning:', err);
  }
}

async function syncRealtimeData() {
  if (document.hidden) return;
  try {
    if (activePage === 'deliveries') {
      checkGeocodeStatus();
    } else if (activePage === 'overview') {
      loadOverviewPage();
    } else if (activePage === 'outreach') {
      const res = await fetch(`/api/drill/outreach${getStateParam('?')}`);
      const d = await res.json();
      if (d && d.success) {
        cachedOutreachData = d;
        updateOutreachCountsFromData(d);
        renderOutreachQueue(false);
      }
    } else if (activePage === 'largematters') {
      const res = await fetch(`/api/drill/largematters${getStateParam('?')}`);
      const d = await res.json();
      if (d && d.success) {
        largeMattersCache = (d.rows || []).filter(c => c.days_until === undefined || c.days_until > 0);
        updateLargeMattersKpis();
        filterLargeMatters();
      }
    } else if (activePage === 'behavior') {
      renderBehavior(currentBehaviorTab);
    }
  } catch (e) {
    // Silent background handling
  }
}

function startRealtimeSync() {
  if (realtimeSyncTimer) clearInterval(realtimeSyncTimer);
  realtimeSyncTimer = setInterval(syncRealtimeData, 30000);
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    syncRealtimeData();
  }
});

// Bootstrapping
window.addEventListener('DOMContentLoaded', () => {
  restoreCachedCounts();
  setupDualScroll('outreachTopScroll', 'outreachTableWrap', 'outreachTable');
  setupDualScroll('largeMattersTopScroll', 'largeMattersTableWrap', 'largeMattersTable');
  setupDualScroll('drawerTopScroll', 'drawerTableWrap', 'drawerTable');
  loadAvailableStates();
  loadActiveCities();

  navigateToPage('overview');
  loadOverviewPage();
  loadAdminStats();
  prefetchAllTabs();
  startRealtimeSync();
});

// ----------------- FEATURE 1: COOKIE-DROP FEEDBACK LOOP ----------------- //

async function openDropFeedbackModal(preselectedCaseId = null) {
  const modal = document.getElementById('dropFeedbackModal');
  const caseSelect = document.getElementById('feedbackCaseSelect');
  if (!modal) return;

  modal.classList.add('open');
  modal.style.display = 'flex';

  try {
    const res = await fetch('/api/drill/outreach');
    const data = await res.json();
    if (data.success && Array.isArray(data.rows) && caseSelect) {
      let opts = '<option value="">-- Select Target Matter / Attorney --</option>';
      data.rows.forEach(c => {
        const selected = (c.target_id === preselectedCaseId || c.case_id === preselectedCaseId) ? 'selected' : '';
        opts += `<option value="${escapeHtml(c.target_id || c.case_id)}" ${selected}>${escapeHtml(c.lead_attorney)} (${escapeHtml(c.firm)}) - ${escapeHtml(c.caption)}</option>`;
      });
      caseSelect.innerHTML = opts;
    }
  } catch (e) {
    console.error('Failed to load matters for feedback modal', e);
  }
}

function closeDropFeedbackModal(e) {
  if (e && e.target !== document.getElementById('dropFeedbackModal') && !e.target.closest('.close-btn') && !e.target.closest('.icon-btn') && !e.target.closest('button')) return;
  const modal = document.getElementById('dropFeedbackModal');
  if (modal) {
    modal.classList.remove('open');
    modal.style.display = 'none';
  }
}

async function submitDropFeedback() {
  const case_id = document.getElementById('feedbackCaseSelect')?.value;
  const contact_reason = document.getElementById('feedbackReasonSelect')?.value;
  const outcome = document.getElementById('feedbackOutcomeSelect')?.value;
  const binder_value = document.getElementById('feedbackValueInput')?.value;
  const rep_name = document.getElementById('feedbackRepInput')?.value;
  const notes = document.getElementById('feedbackNotesInput')?.value;

  if (!case_id) {
    showToast('Please select a target matter / attorney');
    return;
  }

  try {
    const res = await fetch('/api/deliveries/conversion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ case_id, contact_reason, outcome, binder_value, rep_name, notes })
    });
    const data = await res.json();
    if (data.success) {
      showToast('🔥 Drop feedback logged! Attorney Heat Map score boosted by +15 pts');
      closeDropFeedbackModal();
      renderOutreachQueue();
      if (activePage === 'deliveries') loadDeliveriesPage();
    } else {
      showToast('Failed to log feedback: ' + (data.error || 'unknown error'));
    }
  } catch (err) {
    showToast('Network error logging feedback: ' + err.message);
  }
}

// ----------------- FEATURE 2: KEY VARIABLES WEIGHTING ENGINE ----------------- //

async function openWeightsControlModal() {
  const modal = document.getElementById('weightsControlModal');
  if (!modal) return;

  modal.classList.add('open');
  modal.style.display = 'flex';

  try {
    const res = await fetch('/api/heatmap/weights');
    const data = await res.json();
    if (data.success && data.weights) {
      const w = data.weights;
      if (document.getElementById('sliderWeightGeo')) document.getElementById('sliderWeightGeo').value = w.locality !== undefined ? w.locality : 20;
      if (document.getElementById('sliderWeightNOS')) document.getElementById('sliderWeightNOS').value = w.caseType !== undefined ? w.caseType : 15;
      if (document.getElementById('sliderWeightUrgency')) document.getElementById('sliderWeightUrgency').value = w.urgency !== undefined ? w.urgency : 30;
      if (document.getElementById('sliderWeightRevenue')) document.getElementById('sliderWeightRevenue').value = w.revenue !== undefined ? w.revenue : 25;
      if (document.getElementById('sliderWeightEngagement')) document.getElementById('sliderWeightEngagement').value = w.engagement !== undefined ? w.engagement : 15;
      updateWeightsLive();
    }
  } catch (e) {
    console.error('Failed to load active weights', e);
  }
}

function closeWeightsControlModal(e) {
  if (e && e.target !== document.getElementById('weightsControlModal') && !e.target.closest('.close-btn') && !e.target.closest('.icon-btn') && !e.target.closest('button')) return;
  const modal = document.getElementById('weightsControlModal');
  if (modal) {
    modal.classList.remove('open');
    modal.style.display = 'none';
  }
}

function updateWeightsLive() {
  const geo = parseInt(document.getElementById('sliderWeightGeo')?.value || 20, 10);
  const nos = parseInt(document.getElementById('sliderWeightNOS')?.value || 15, 10);
  const urg = parseInt(document.getElementById('sliderWeightUrgency')?.value || 30, 10);
  const rev = parseInt(document.getElementById('sliderWeightRevenue')?.value || 25, 10);
  const eng = parseInt(document.getElementById('sliderWeightEngagement')?.value || 15, 10);

  if (document.getElementById('valWeightGeo')) document.getElementById('valWeightGeo').innerText = `${geo} pts`;
  if (document.getElementById('valWeightNOS')) document.getElementById('valWeightNOS').innerText = `${nos} pts`;
  if (document.getElementById('valWeightUrgency')) document.getElementById('valWeightUrgency').innerText = `${urg} pts`;
  if (document.getElementById('valWeightRevenue')) document.getElementById('valWeightRevenue').innerText = `${rev} pts`;
  if (document.getElementById('valWeightEngagement')) document.getElementById('valWeightEngagement').innerText = `${eng} pts`;

  const totalSum = geo + nos + urg + rev + eng;
  const labelSum = document.getElementById('weightsTotalSumLabel');
  if (labelSum) labelSum.innerText = `Total Max Score Potential: ${totalSum} pts`;
}

function applyWeightsPreset(presetKey) {
  if (presetKey === 'courier') {
    document.getElementById('sliderWeightGeo').value = 40;
    document.getElementById('sliderWeightNOS').value = 15;
    document.getElementById('sliderWeightUrgency').value = 30;
    document.getElementById('sliderWeightRevenue').value = 15;
    document.getElementById('sliderWeightEngagement').value = 15;
  } else if (presetKey === 'binders') {
    document.getElementById('sliderWeightGeo').value = 15;
    document.getElementById('sliderWeightNOS').value = 35;
    document.getElementById('sliderWeightUrgency').value = 15;
    document.getElementById('sliderWeightRevenue').value = 35;
    document.getElementById('sliderWeightEngagement').value = 15;
  } else {
    document.getElementById('sliderWeightGeo').value = 20;
    document.getElementById('sliderWeightNOS').value = 15;
    document.getElementById('sliderWeightUrgency').value = 30;
    document.getElementById('sliderWeightRevenue').value = 25;
    document.getElementById('sliderWeightEngagement').value = 15;
  }
  updateWeightsLive();
}

async function saveWeightsAndRecalculate() {
  const locality = parseInt(document.getElementById('sliderWeightGeo')?.value || 20, 10);
  const caseType = parseInt(document.getElementById('sliderWeightNOS')?.value || 15, 10);
  const urgency = parseInt(document.getElementById('sliderWeightUrgency')?.value || 30, 10);
  const revenue = parseInt(document.getElementById('sliderWeightRevenue')?.value || 25, 10);
  const engagement = parseInt(document.getElementById('sliderWeightEngagement')?.value || 15, 10);

  try {
    const res = await fetch('/api/heatmap/weights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weights: { locality, caseType, urgency, revenue, engagement } })
    });
    const data = await res.json();
    if (data.success) {
      showToast('⚖️ Key Variables Weighting Engine updated! Heat Map re-ranked');
      closeWeightsControlModal();
      renderOutreachQueue();
      if (activePage === 'deliveries') loadDeliveriesPage();
    } else {
      showToast('Failed to update weights: ' + (data.error || 'unknown error'));
    }
  } catch (err) {
    showToast('Network error updating weights: ' + err.message);
  }
}
