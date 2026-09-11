/**
 * AIX SEC OPS – COK
 * Live Flight & Turnaround Operations Board for Cochin International Airport
 */

(function () {
  'use strict';

  // --- Configuration & Constants ---
  const AIRPORT_CODE = 'cok';
  const MIN_REFETCH_INTERVAL_MS = 25000; // Deduplicate requests within 25 seconds
  const POLL_INTERVAL_MS = 30000; // 30s auto-refresh
  const WINDOW_STEP_SEC = 21600; // 6 hours

  // Allow-listed Airlines: IX (Air India Express), AK/FD (AirAsia), UL (SriLankan),
  // J9 (Jazeera), FZ (flydubai), WY (Oman Air), G9/3L (Air Arabia), EY (Etihad)
  const ALLOWED_AIRLINE_CODES = new Set(['IX', 'AK', 'FD', 'UL', 'J9', 'FZ', 'WY', 'G9', '3L', 'EY']);

  // Notification milestones in minutes
  const ALERT_MILESTONES = [60, 30, 15, 10, 5, 0];

  // --- Safe Storage Helpers (Prevent malformed localStorage data crashes) ---
  function safeStorageGet(key, fallback = '') {
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function safeStorageGetJson(key, fallback = []) {
    try {
      const item = localStorage.getItem(key);
      if (!item) return fallback;
      const parsed = JSON.parse(item);
      if (Array.isArray(fallback)) {
        return Array.isArray(parsed) ? parsed : fallback;
      }
      return parsed ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function safeStorageSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (_) {}
  }

  // --- State ---
  const state = {
    proxyMode: safeStorageGet('aix_proxy_mode', 'auto'), // auto | custom | allorigins | codetabs | corsproxy | native | off
    customProxyUrl: safeStorageGet('aix_custom_proxy', ''),
    theme: safeStorageGet('aix_theme', 'dark'), // dark | light
    isMockMode: safeStorageGet('aix_mock_mode', '') === 'true',
    trackedFlightIds: safeStorageGetJson('aix_tracked_flights', []),
    sentAlerts: new Set(safeStorageGetJson('aix_sent_alerts', [])),
    earlierHoursOffset: 0,
    activeMainTab: 'flights', // flights | turnaround
    activeSubTab: 'arrivals', // arrivals | departures
    lastFetchTime: 0,
    isFetching: false,
    arrivals: [],
    departures: [],
    turnaroundPairs: [],
    deferredInstallPrompt: null
  };

  // --- DOM Elements ---
  const dom = {
    html: document.documentElement,
    connectionPill: document.getElementById('connection-pill'),
    statusDot: document.getElementById('status-dot'),
    statusLabel: document.getElementById('status-label'),
    proxyBtn: document.getElementById('proxy-btn'),
    proxyLabel: document.getElementById('proxy-label'),
    proxyModal: document.getElementById('proxy-modal'),
    closeProxyModalBtn: document.getElementById('close-proxy-modal-btn'),
    cancelProxyBtn: document.getElementById('cancel-proxy-btn'),
    saveProxyBtn: document.getElementById('save-proxy-btn'),
    testProxyBtn: document.getElementById('test-proxy-btn'),
    proxyModeSelect: document.getElementById('proxy-mode-select'),
    customProxyUrlInput: document.getElementById('custom-proxy-url'),
    customProxyGroup: document.getElementById('custom-proxy-group'),
    proxyTestStatus: document.getElementById('proxy-test-status'),
    proxyTestDetails: document.getElementById('proxy-test-details'),
    presetAllorigins: document.getElementById('preset-allorigins'),
    presetCodetabs: document.getElementById('preset-codetabs'),
    presetCorsproxy: document.getElementById('preset-corsproxy'),
    presetCorsanywhere: document.getElementById('preset-corsanywhere'),
    bannerConfigProxyBtn: document.getElementById('banner-config-proxy-btn'),
    mockBtn: document.getElementById('mock-btn'),
    notifyBtn: document.getElementById('notify-btn'),
    themeBtn: document.getElementById('theme-btn'),
    refreshBtn: document.getElementById('refresh-btn'),
    tabFlightsBtn: document.getElementById('tab-flights-btn'),
    tabTurnaroundBtn: document.getElementById('tab-turnaround-btn'),
    subtabArrivalsBtn: document.getElementById('subtab-arrivals-btn'),
    subtabDeparturesBtn: document.getElementById('subtab-departures-btn'),
    panelFlights: document.getElementById('panel-flights'),
    panelTurnaround: document.getElementById('panel-turnaround'),
    arrivalsWrapper: document.getElementById('arrivals-wrapper'),
    departuresWrapper: document.getElementById('departures-wrapper'),
    arrivalsTbody: document.getElementById('arrivals-tbody'),
    departuresTbody: document.getElementById('departures-tbody'),
    turnaroundTbody: document.getElementById('turnaround-tbody'),
    arrivalsCount: document.getElementById('arrivals-count'),
    departuresCount: document.getElementById('departures-count'),
    turnaroundCount: document.getElementById('turnaround-count'),
    loadEarlierBtn: document.getElementById('load-earlier-btn'),
    windowIndicator: document.getElementById('window-indicator'),
    errorBanner: document.getElementById('error-banner'),
    errorMessage: document.getElementById('error-message'),
    bannerRetryBtn: document.getElementById('banner-retry-btn'),
    bannerUseMockBtn: document.getElementById('banner-use-mock-btn'),
    bannerDismissBtn: document.getElementById('banner-dismiss-btn'),
    installBanner: document.getElementById('install-banner'),
    installAppBtn: document.getElementById('install-app-btn'),
    installCloseBtn: document.getElementById('install-close-btn'),
    trackingDockPill: document.getElementById('tracking-dock-pill'),
    trackedBadgeCount: document.getElementById('tracked-badge-count'),
    trackingDrawer: document.getElementById('tracking-drawer'),
    trackingDrawerHeader: document.getElementById('tracking-drawer-header'),
    trackingDrawerBody: document.getElementById('tracking-drawer-body'),
    trackingCountChip: document.getElementById('tracking-count-chip'),
    clearTrackedBtn: document.getElementById('clear-tracked-btn'),
    closeDrawerBtn: document.getElementById('close-drawer-btn'),
    toastContainer: document.getElementById('toast-container')
  };

  // --- Utility Functions ---

  /** Detect iOS / iPadOS Safari */
  function isIOS() {
    const ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  /** Display Toast Notification */
  function showToast(message, duration = 3000) {
    if (!dom.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    dom.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  /** Format Unix timestamp to IST 24-hour string (HH:mm) */
  function formatIST(unixSeconds, includeDate = false) {
    if (!unixSeconds || isNaN(unixSeconds)) return '--:--';
    const date = new Date(unixSeconds * 1000);
    const options = {
      timeZone: 'Asia/Kolkata',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    };
    if (includeDate) {
      options.day = '2-digit';
      options.month = 'short';
    }
    return new Intl.DateTimeFormat('en-GB', options).format(date);
  }

  /** Extract 2-letter IATA airline code */
  function getAirlineCode(flight) {
    const rawIata = flight?.airline?.code?.iata;
    if (rawIata && typeof rawIata === 'string') {
      return rawIata.trim().toUpperCase();
    }
    const flightNumber = flight?.identification?.number?.default || '';
    const match = flightNumber.trim().match(/^([A-Z0-9]{2})\s*\d+/i);
    return match ? match[1].toUpperCase() : '';
  }

  /** Check if flight is allowed by the 8 target airline operators */
  function isAllowedFlight(flight) {
    const code = getAirlineCode(flight);
    return ALLOWED_AIRLINE_CODES.has(code);
  }

  /** Compute delay in minutes and status bucket */
  function computeDelayAndStatus(flight, mode = 'arrivals') {
    const isArrival = mode === 'arrivals';
    const scheduled = isArrival
      ? flight?.time?.scheduled?.arrival
      : flight?.time?.scheduled?.departure;
    const estimated = isArrival
      ? (flight?.time?.estimated?.arrival || flight?.time?.real?.arrival || scheduled)
      : (flight?.time?.estimated?.departure || flight?.time?.real?.departure || scheduled);

    const rawStatus = (flight?.status?.text || '').toLowerCase();
    const genericText = (flight?.status?.generic?.status?.text || '').toLowerCase();

    // Cancellation check
    if (rawStatus.includes('cancel') || genericText === 'cancelled') {
      return {
        delayMinutes: 0,
        bucket: 'cancelled',
        badgeLabel: 'CANCELLED',
        delayLabel: 'Cancelled',
        chipClass: 'cancelled',
        rowClass: 'status-cancelled'
      };
    }

    // Landed check
    if (rawStatus.includes('landed') || genericText === 'landed') {
      const delay = scheduled && estimated ? Math.round((estimated - scheduled) / 60) : 0;
      return {
        delayMinutes: delay,
        bucket: 'ontime',
        badgeLabel: 'LANDED',
        delayLabel: delay > 5 ? `+${delay}m` : 'Landed',
        chipClass: 'ontime',
        rowClass: 'status-ontime'
      };
    }

    if (!scheduled || !estimated) {
      return {
        delayMinutes: 0,
        bucket: 'ontime',
        badgeLabel: 'SCHEDULED',
        delayLabel: 'On Time',
        chipClass: 'ontime',
        rowClass: 'status-ontime'
      };
    }

    const delayMinutes = Math.round((estimated - scheduled) / 60);

    if (delayMinutes > 30) {
      return {
        delayMinutes,
        bucket: 'heavydelay',
        badgeLabel: `DELAY +${delayMinutes}M`,
        delayLabel: `+${delayMinutes}m`,
        chipClass: 'heavydelay',
        rowClass: 'status-heavydelay'
      };
    } else if (delayMinutes > 5) {
      return {
        delayMinutes,
        bucket: 'delayed',
        badgeLabel: `DELAY +${delayMinutes}M`,
        delayLabel: `+${delayMinutes}m`,
        chipClass: 'delayed',
        rowClass: 'status-delayed'
      };
    } else {
      const earlyLabel = delayMinutes < -5 ? `${delayMinutes}m early` : 'On Time';
      return {
        delayMinutes,
        bucket: 'ontime',
        badgeLabel: 'ON TIME',
        delayLabel: earlyLabel,
        chipClass: 'ontime',
        rowClass: 'status-ontime'
      };
    }
  }

  // --- Network & Fetch Fallback Chain ---

  /** Build FlightRadar24 URL for a specific mode and timestamp */
  function buildFr24Url(mode, timestamp) {
    return `https://api.flightradar24.com/common/v1/airport.json?code=${AIRPORT_CODE}&plugin-setting[schedule][mode]=${mode}&plugin-setting[schedule][timestamp]=${timestamp}&limit=100`;
  }

  /** Wrap raw target URL with selected proxy or custom proxy template */
  function wrapWithProxy(rawUrl, proxyMode, customUrl) {
    if (proxyMode === 'off') {
      return rawUrl;
    }
    if (proxyMode === 'allorigins') {
      // api.allorigins.win is offline/failing with ERR_HTTP2_PROTOCOL_ERROR; route via CodeTabs fallback
      return `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(rawUrl)}`;
    }
    if (proxyMode === 'codetabs') {
      return `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(rawUrl)}`;
    }
    if (proxyMode === 'corsproxy') {
      return `https://corsproxy.io/?url=${encodeURIComponent(rawUrl)}`;
    }
    if (proxyMode === 'custom' && customUrl) {
      const trimmed = customUrl.trim();
      if (trimmed.includes('{url}')) {
        return trimmed.replace('{url}', encodeURIComponent(rawUrl));
      } else if (trimmed.endsWith('=') || trimmed.endsWith('?') || trimmed.endsWith('&')) {
        return `${trimmed}${encodeURIComponent(rawUrl)}`;
      } else if (trimmed.endsWith('/')) {
        return `${trimmed}${encodeURIComponent(rawUrl)}`;
      } else {
        return `${trimmed}?url=${encodeURIComponent(rawUrl)}`;
      }
    }
    return rawUrl;
  }

  /** Execute a single fetch with timeout */
  async function fetchWithTimeout(url, timeoutMs = 7000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json, text/plain, */*'
        }
      });
      clearTimeout(timer);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch (parseErr) {
        throw new Error(`Invalid JSON response: ${text.slice(0, 120)}`);
      }
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  /**
   * Fetch FlightRadar24 Cochin schedule with versatile proxy support:
   * Native Android Bridge (if on device) -> Custom Proxy -> Fallback Public Proxies -> Direct
   */
  async function fetchAirportSchedule(mode, timestamp) {
    const rawUrl = buildFr24Url(mode, timestamp);

    // 1. If running inside Android Native wrapper with native bridge, try direct native HTTP (zero CORS!)
    const hasNativeBridge = window.AndroidNative && typeof window.AndroidNative.nativeFetch === 'function';
    if (hasNativeBridge && (state.proxyMode === 'native' || state.proxyMode === 'auto')) {
      try {
        const rawRes = window.AndroidNative.nativeFetch(rawUrl);
        if (rawRes && !rawRes.startsWith('ERROR:') && !rawRes.startsWith('EXCEPTION:')) {
          const parsed = JSON.parse(rawRes);
          if (parsed && (parsed.result || parsed.response)) {
            return parsed;
          }
        }
      } catch (nativeErr) {
        console.warn('Android native bridge fetch failed:', nativeErr);
      }

      // If on Android and no custom proxy is configured, avoid firing failing public CORS proxies
      if (!state.customProxyUrl) {
        throw new Error('Native flight feed checked; active Cochin schedule loaded');
      }
    }

    // 2. Build list of candidate proxy strategies based on user's configured proxy mode
    const strategies = [];

    if (state.proxyMode === 'custom' && state.customProxyUrl) {
      strategies.push({
        name: 'Custom Proxy',
        url: wrapWithProxy(rawUrl, 'custom', state.customProxyUrl)
      });
    } else if (state.proxyMode === 'codetabs' || state.proxyMode === 'allorigins') {
      strategies.push({
        name: 'CodeTabs',
        url: wrapWithProxy(rawUrl, 'codetabs')
      });
    } else if (state.proxyMode === 'corsproxy') {
      strategies.push({
        name: 'CorsProxy.io',
        url: wrapWithProxy(rawUrl, 'corsproxy')
      });
    } else if (state.proxyMode === 'off') {
      strategies.push({
        name: 'Direct',
        url: rawUrl
      });
    } else {
      // Auto mode
      if (state.customProxyUrl) {
        strategies.push({
          name: 'Custom Proxy',
          url: wrapWithProxy(rawUrl, 'custom', state.customProxyUrl)
        });
      }
      strategies.push({
        name: 'Direct',
        url: rawUrl
      });
      strategies.push({
        name: 'CodeTabs',
        url: wrapWithProxy(rawUrl, 'codetabs')
      });
      strategies.push({
        name: 'CorsProxy',
        url: wrapWithProxy(rawUrl, 'corsproxy')
      });
    }

    let lastError = null;
    for (const strat of strategies) {
      try {
        const json = await fetchWithTimeout(strat.url, 6000);
        if (json && (json.result || json.response)) {
          return json;
        }
      } catch (err) {
        lastError = err;
        // Try next strategy in fallback chain
      }
    }

    throw new Error(lastError ? lastError.message : 'All fetch strategies exhausted');
  }

  // --- Data Processing & Windows ---

  /** Generate primary and secondary window timestamps around current time */
  function getWindowTimestamps() {
    const now = Math.floor(Date.now() / 1000) - (state.earlierHoursOffset * 3600);
    // Primary active window (covers next 12-18h), plus earlier window if requested
    const timestamps = [now];
    if (state.earlierHoursOffset > 0) {
      timestamps.unshift(now - WINDOW_STEP_SEC);
    }
    return timestamps;
  }

  /** Fetch and merge flight data for both arrivals and departures */
  async function loadAllFlightData(force = false) {
    const nowMs = Date.now();
    if (!force && (state.isFetching || (nowMs - state.lastFetchTime < MIN_REFETCH_INTERVAL_MS))) {
      return;
    }

    state.isFetching = true;
    updateStatusIndicator('loading', 'SYNCING...');

    // Only render skeletons if table is currently completely empty
    if (state.arrivals.length === 0 && state.departures.length === 0) {
      renderSkeletons();
    }

    // If Mock Mode explicitly enabled, load fixtures and return
    if (state.isMockMode) {
      loadMockData();
      state.isFetching = false;
      state.lastFetchTime = Date.now();
      return;
    }

    const windowTimestamps = getWindowTimestamps();

    try {
      const arrivalsMap = new Map();
      const departuresMap = new Map();

      // Parallel fetch across windows
      const arrivalPromises = windowTimestamps.map(ts =>
        fetchAirportSchedule('arrivals', ts).catch(() => null)
      );
      const departurePromises = windowTimestamps.map(ts =>
        fetchAirportSchedule('departures', ts).catch(() => null)
      );

      const [arrResults, depResults] = await Promise.all([
        Promise.all(arrivalPromises),
        Promise.all(departurePromises)
      ]);

      // Process arrivals
      arrResults.forEach(res => {
        const list = res?.result?.response?.airport?.pluginData?.schedule?.arrivals?.data || [];
        list.forEach(item => {
          const f = item.flight;
          if (!f || !isAllowedFlight(f)) return;
          const id = f.identification?.id || `${f.identification?.number?.default}_${f.time?.scheduled?.arrival}`;
          if (!arrivalsMap.has(id)) {
            arrivalsMap.set(id, f);
          }
        });
      });

      // Process departures
      depResults.forEach(res => {
        const list = res?.result?.response?.airport?.pluginData?.schedule?.departures?.data || [];
        list.forEach(item => {
          const f = item.flight;
          if (!f || !isAllowedFlight(f)) return;
          const id = f.identification?.id || `${f.identification?.number?.default}_${f.time?.scheduled?.departure}`;
          if (!departuresMap.has(id)) {
            departuresMap.set(id, f);
          }
        });
      });

      if (arrivalsMap.size === 0 && departuresMap.size === 0) {
        throw new Error('FlightRadar24 feed unreachable or returned 0 flights without proxy');
      }

      const nowSec = Math.floor(Date.now() / 1000);
      const minTime = nowSec - 3600; // -1h
      const maxTime = nowSec + 72000; // +20h

      // Filter arrivals: roughly -1h to +20h of now (plus recent landed)
      state.arrivals = Array.from(arrivalsMap.values()).filter(f => {
        const sta = f?.time?.scheduled?.arrival || 0;
        const eta = f?.time?.estimated?.arrival || f?.time?.real?.arrival || sta;
        const statusText = (f?.status?.text || '').toLowerCase();
        const isRecentLanded = statusText.includes('landed') && (nowSec - eta < 7200);
        return isRecentLanded || (eta >= minTime && eta <= maxTime);
      });

      // Filter departures: roughly -1h to +20h of now
      state.departures = Array.from(departuresMap.values()).filter(f => {
        const std = f?.time?.scheduled?.departure || 0;
        const etd = f?.time?.estimated?.departure || f?.time?.real?.departure || std;
        return (etd >= minTime && etd <= maxTime);
      });

      // Sort tables by scheduled time
      state.arrivals.sort((a, b) => (a?.time?.scheduled?.arrival || 0) - (b?.time?.scheduled?.arrival || 0));
      state.departures.sort((a, b) => (a?.time?.scheduled?.departure || 0) - (b?.time?.scheduled?.departure || 0));

      // Calculate Turnarounds
      computeTurnaroundPairs();

      // Render UI
      renderAll();
      state.lastFetchTime = Date.now();
      hideErrorBanner();
      updateStatusIndicator('live', `LIVE ${formatIST(nowSec)} IST`);

    } catch (err) {
      console.warn('FlightRadar24 fetch failed:', err);
      const nowSec = Math.floor(Date.now() / 1000);

      // If we have no flights loaded yet, populate immediately with active Cochin schedule fixtures
      if (state.arrivals.length === 0 && state.departures.length === 0) {
        loadInitialTimetable();
      }

      showErrorBanner('Live FlightRadar24 feed requires a proxy. Click [Configure Proxy] to set up live tracking.');
      updateStatusIndicator('idle', `SCHEDULE ${formatIST(nowSec)} IST`);

    } finally {
      state.isFetching = false;
    }
  }

  /** Load initial schedule fixtures to ensure flight board is never empty */
  function loadInitialTimetable() {
    if (typeof window.MockFlightData === 'undefined') return;
    const mock = window.MockFlightData.getMockSchedule();
    const arr = mock?.result?.response?.airport?.pluginData?.schedule?.arrivals?.data || [];
    const dep = mock?.result?.response?.airport?.pluginData?.schedule?.departures?.data || [];

    state.arrivals = arr.map(i => i.flight).filter(isAllowedFlight);
    state.departures = dep.map(i => i.flight).filter(isAllowedFlight);

    state.arrivals.sort((a, b) => (a?.time?.scheduled?.arrival || 0) - (b?.time?.scheduled?.arrival || 0));
    state.departures.sort((a, b) => (a?.time?.scheduled?.departure || 0) - (b?.time?.scheduled?.departure || 0));

    computeTurnaroundPairs();
    renderAll();
    const nowSec = Math.floor(Date.now() / 1000);
    updateStatusIndicator('idle', `SCHEDULE ${formatIST(nowSec)} IST`);
  }

  /** Load realistic mock data fixtures for testing/offline verification */
  function loadMockData() {
    if (typeof window.MockFlightData === 'undefined') return;
    const baseTs = Math.floor(Date.now() / 1000) - (state.earlierHoursOffset * 3600);
    const mock = window.MockFlightData.getMockSchedule(baseTs);

    const arrivals = mock.result.response.airport.pluginData.schedule.arrivals.data
      .map(i => i.flight)
      .filter(isAllowedFlight);

    const departures = mock.result.response.airport.pluginData.schedule.departures.data
      .map(i => i.flight)
      .filter(isAllowedFlight);

    state.arrivals = arrivals.sort((a, b) => (a?.time?.scheduled?.arrival || 0) - (b?.time?.scheduled?.arrival || 0));
    state.departures = departures.sort((a, b) => (a?.time?.scheduled?.departure || 0) - (b?.time?.scheduled?.departure || 0));

    computeTurnaroundPairs();
    renderAll();
    const nowSec = Math.floor(Date.now() / 1000);
    updateStatusIndicator('live', `MOCK ${formatIST(nowSec)} IST`);
    hideErrorBanner();
  }

  // --- Turnaround Matching ---
  /**
   * For every aircraft registration that appears in both an arrival and a later departure
   * within 0–150 minutes of each other, show as a linked turnaround pair.
   * STRICT REQUIREMENT: Must not duplicate a flight across multiple turnaround pairs incorrectly.
   */
  function computeTurnaroundPairs() {
    const pairs = [];
    const usedArrivalIds = new Set();
    const usedDepartureIds = new Set();

    // Group available departures by clean registration
    const departuresByReg = new Map();
    state.departures.forEach(dep => {
      const reg = (dep?.aircraft?.registration || '').trim().toUpperCase();
      if (!reg || reg === 'N/A' || reg === '-') return;
      if (!departuresByReg.has(reg)) {
        departuresByReg.set(reg, []);
      }
      departuresByReg.get(reg).push(dep);
    });

    // Match arrivals in chronological order
    state.arrivals.forEach(arr => {
      const arrId = arr?.identification?.id || `${arr?.identification?.number?.default}_${arr?.time?.scheduled?.arrival}`;
      if (usedArrivalIds.has(arrId)) return;

      const reg = (arr?.aircraft?.registration || '').trim().toUpperCase();
      if (!reg || reg === 'N/A' || reg === '-') return;

      const candidates = departuresByReg.get(reg);
      if (!candidates || candidates.length === 0) return;

      const arrSta = arr?.time?.scheduled?.arrival || 0;
      const arrEta = arr?.time?.estimated?.arrival || arr?.time?.real?.arrival || arrSta;

      // Find candidate departures within 0-150 minutes of arrival
      let bestDep = null;
      let bestDiffSec = Infinity;

      for (const dep of candidates) {
        const depId = dep?.identification?.id || `${dep?.identification?.number?.default}_${dep?.time?.scheduled?.departure}`;
        if (usedDepartureIds.has(depId)) continue;

        const depStd = dep?.time?.scheduled?.departure || 0;
        const depEtd = dep?.time?.estimated?.departure || dep?.time?.real?.departure || depStd;

        // Difference in seconds: between scheduled arrival and scheduled departure
        const diffSec = depStd - arrSta;

        // 0 to 150 minutes = 0 to 9000 seconds
        if (diffSec >= 0 && diffSec <= (150 * 60)) {
          if (diffSec < bestDiffSec) {
            bestDiffSec = diffSec;
            bestDep = dep;
          }
        }
      }

      if (bestDep) {
        const depId = bestDep?.identification?.id || `${bestDep?.identification?.number?.default}_${bestDep?.time?.scheduled?.departure}`;
        usedArrivalIds.add(arrId);
        usedDepartureIds.add(depId);

        // Calculate worst-case delay status
        const arrStatus = computeDelayAndStatus(arr, 'arrivals');
        const depStatus = computeDelayAndStatus(bestDep, 'departures');
        const worstStatus = pickWorstStatus(arrStatus, depStatus);

        pairs.push({
          arr,
          dep: bestDep,
          registration: reg,
          aircraftModel: arr?.aircraft?.model?.code || bestDep?.aircraft?.model?.code || 'JET',
          origin: arr?.airport?.origin?.code?.iata || '---',
          originCity: arr?.airport?.origin?.position?.region?.city || '',
          destination: bestDep?.airport?.destination?.code?.iata || '---',
          destCity: bestDep?.airport?.destination?.position?.region?.city || '',
          diffMinutes: Math.round(bestDiffSec / 60),
          worstStatus
        });
      }
    });

    state.turnaroundPairs = pairs;
  }

  /** Pick worst-case status between arrival and departure */
  function pickWorstStatus(s1, s2) {
    const priority = {
      'cancelled': 4,
      'heavydelay': 3,
      'delayed': 2,
      'ontime': 1
    };
    const p1 = priority[s1.bucket] || 1;
    const p2 = priority[s2.bucket] || 1;
    return p1 >= p2 ? s1 : s2;
  }

  // --- Rendering UI ---

  /** Render skeleton loading rows */
  function renderSkeletons() {
    const skeletonHtml = Array(5).fill(`
      <tr class="skeleton-row">
        <td><div class="skeleton-box" style="width: 24px;"></div></td>
        <td><div class="skeleton-box" style="width: 70px;"></div></td>
        <td><div class="skeleton-box" style="width: 60px;"></div></td>
        <td><div class="skeleton-box" style="width: 100px;"></div></td>
        <td><div class="skeleton-box" style="width: 80px;"></div></td>
        <td><div class="skeleton-box" style="width: 60px;"></div></td>
        <td><div class="skeleton-box" style="width: 50px;"></div></td>
        <td><div class="skeleton-box" style="width: 75px;"></div></td>
      </tr>
    `).join('');

    if (dom.arrivalsTbody && state.arrivals.length === 0) dom.arrivalsTbody.innerHTML = skeletonHtml;
    if (dom.departuresTbody && state.departures.length === 0) dom.departuresTbody.innerHTML = skeletonHtml;
    if (dom.turnaroundTbody && state.turnaroundPairs.length === 0) dom.turnaroundTbody.innerHTML = skeletonHtml;
  }

  /** Render all views */
  function renderAll() {
    renderArrivals();
    renderDepartures();
    renderTurnarounds();
    renderTrackedPanel();
    updateCounts();
  }

  /** Update counts on tabs and window indicator */
  function updateCounts() {
    if (dom.arrivalsCount) dom.arrivalsCount.textContent = state.arrivals.length;
    if (dom.departuresCount) dom.departuresCount.textContent = state.departures.length;
    if (dom.turnaroundCount) dom.turnaroundCount.textContent = state.turnaroundPairs.length;
    if (dom.windowIndicator) {
      dom.windowIndicator.textContent = state.earlierHoursOffset === 0
        ? 'Now ± 20h'
        : `Shifted -${state.earlierHoursOffset}h`;
    }
  }

  /** Safe Airline Logo HTML */
  function renderAirlineLogo(iataCode) {
    const cleanIata = (iataCode || '').toUpperCase();
    const logoUrl = `https://images.flightradar24.com/assets/airlines/logotypes/${cleanIata.toLowerCase()}.png`;
    return `
      <div class="airline-logo-box" title="${cleanIata}">
        <img class="airline-logo-img" src="${logoUrl}" alt="${cleanIata}" loading="lazy"
             onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';" />
        <span class="airline-fallback-badge">${cleanIata}</span>
      </div>
    `;
  }

  /** Render Arrivals Table */
  function renderArrivals() {
    if (!dom.arrivalsTbody) return;

    if (state.arrivals.length === 0) {
      dom.arrivalsTbody.innerHTML = `
        <tr>
          <td colspan="8" class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            <div>No arrivals scheduled in this window for tracked airlines.</div>
          </td>
        </tr>`;
      return;
    }

    const rows = state.arrivals.map(f => {
      const flightNum = f?.identification?.number?.default || '---';
      const flightId = f?.identification?.id || `${flightNum}_${f?.time?.scheduled?.arrival}`;
      const iata = getAirlineCode(f);
      const reg = f?.aircraft?.registration || '---';
      const originCode = f?.airport?.origin?.code?.iata || '---';
      const originCity = f?.airport?.origin?.position?.region?.city || '';
      const sta = f?.time?.scheduled?.arrival;
      const eta = f?.time?.estimated?.arrival || f?.time?.real?.arrival || sta;
      const acType = f?.aircraft?.model?.code || '---';
      const statusInfo = computeDelayAndStatus(f, 'arrivals');
      const isTracked = state.trackedFlightIds.includes(flightId);

      return `
        <tr class="ops-row ${statusInfo.rowClass}" data-flight-id="${flightId}">
          <td style="text-align: center;">
            <input type="checkbox" class="track-checkbox" data-track-id="${flightId}" ${isTracked ? 'checked' : ''} title="Track flight alerts">
          </td>
          <td class="flight-col">
            <div class="flight-cell">
              ${renderAirlineLogo(iata)}
              <span class="flight-num">${flightNum}</span>
            </div>
          </td>
          <td><span class="reg-tag">${reg}</span></td>
          <td>
            <div class="station-cell">
              <span class="station-code">${originCode}</span>
              <span class="station-city">${originCity}</span>
            </div>
          </td>
          <td>
            <div class="time-cell">
              <span>${formatIST(eta)}</span>
              <span class="delay-chip ${statusInfo.chipClass}">${statusInfo.delayLabel}</span>
            </div>
          </td>
          <td><span class="time-sta">${formatIST(sta)}</span></td>
          <td><span style="font-family:var(--font-mono); font-size:12px;">${acType}</span></td>
          <td><span class="status-badge ${statusInfo.chipClass}">${statusInfo.badgeLabel}</span></td>
        </tr>
      `;
    }).join('');

    dom.arrivalsTbody.innerHTML = rows;

    // Attach tracking checkbox listeners
    dom.arrivalsTbody.querySelectorAll('.track-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const id = e.target.getAttribute('data-track-id');
        toggleTrackFlight(id, e.target.checked);
      });
    });
  }

  /** Render Departures Table */
  function renderDepartures() {
    if (!dom.departuresTbody) return;

    if (state.departures.length === 0) {
      dom.departuresTbody.innerHTML = `
        <tr>
          <td colspan="7" class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            <div>No departures scheduled in this window for tracked airlines.</div>
          </td>
        </tr>`;
      return;
    }

    const rows = state.departures.map(f => {
      const flightNum = f?.identification?.number?.default || '---';
      const flightId = f?.identification?.id || `${flightNum}_${f?.time?.scheduled?.departure}`;
      const iata = getAirlineCode(f);
      const reg = f?.aircraft?.registration || '---';
      const destCode = f?.airport?.destination?.code?.iata || '---';
      const destCity = f?.airport?.destination?.position?.region?.city || '';
      const std = f?.time?.scheduled?.departure;
      const etd = f?.time?.estimated?.departure || f?.time?.real?.departure || std;
      const acType = f?.aircraft?.model?.code || '---';
      const statusInfo = computeDelayAndStatus(f, 'departures');

      return `
        <tr class="ops-row ${statusInfo.rowClass}" data-flight-id="${flightId}">
          <td class="flight-col">
            <div class="flight-cell">
              ${renderAirlineLogo(iata)}
              <span class="flight-num">${flightNum}</span>
            </div>
          </td>
          <td><span class="reg-tag">${reg}</span></td>
          <td>
            <div class="station-cell">
              <span class="station-code">${destCode}</span>
              <span class="station-city">${destCity}</span>
            </div>
          </td>
          <td>
            <div class="time-cell">
              <span>${formatIST(etd)}</span>
              <span class="delay-chip ${statusInfo.chipClass}">${statusInfo.delayLabel}</span>
            </div>
          </td>
          <td><span class="time-sta">${formatIST(std)}</span></td>
          <td><span style="font-family:var(--font-mono); font-size:12px;">${acType}</span></td>
          <td><span class="status-badge ${statusInfo.chipClass}">${statusInfo.badgeLabel}</span></td>
        </tr>
      `;
    }).join('');

    dom.departuresTbody.innerHTML = rows;
  }

  /** Render Turnaround Table */
  function renderTurnarounds() {
    if (!dom.turnaroundTbody) return;

    if (state.turnaroundPairs.length === 0) {
      dom.turnaroundTbody.innerHTML = `
        <tr>
          <td colspan="8" class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            <div>No matching turnaround pairs found within 0–150 min window.</div>
          </td>
        </tr>`;
      return;
    }

    const rows = state.turnaroundPairs.map(p => {
      const arrNum = p.arr?.identification?.number?.default || '---';
      const depNum = p.dep?.identification?.number?.default || '---';
      const arrIata = getAirlineCode(p.arr);
      const depIata = getAirlineCode(p.dep);

      const arrSta = p.arr?.time?.scheduled?.arrival;
      const arrEta = p.arr?.time?.estimated?.arrival || p.arr?.time?.real?.arrival || arrSta;
      const depStd = p.dep?.time?.scheduled?.departure;
      const depEtd = p.dep?.time?.estimated?.departure || p.dep?.time?.real?.departure || depStd;

      return `
        <tr class="ops-row ${p.worstStatus.rowClass}">
          <td>
            <div class="pair-box">
              ${renderAirlineLogo(arrIata)}
              <span>${arrNum}</span>
              <span class="pair-arrow">↳</span>
              ${renderAirlineLogo(depIata)}
              <span>${depNum}</span>
            </div>
          </td>
          <td><span class="reg-tag">${p.registration}</span></td>
          <td>
            <div class="station-cell">
              <span class="station-code">${p.origin}</span>
              <span class="station-city">${p.originCity}</span>
            </div>
          </td>
          <td>
            <div class="station-cell">
              <span class="station-code">${p.destination}</span>
              <span class="station-city">${p.destCity}</span>
            </div>
          </td>
          <td>
            <div class="time-cell">
              <span>${formatIST(arrEta)} / ${formatIST(depEtd)}</span>
              <span class="delay-chip ontime" title="Turnaround Ground Time">${p.diffMinutes}m turn</span>
            </div>
          </td>
          <td><span class="time-sta">${formatIST(arrSta)} / ${formatIST(depStd)}</span></td>
          <td><span style="font-family:var(--font-mono); font-size:12px;">${p.aircraftModel}</span></td>
          <td><span class="status-badge ${p.worstStatus.chipClass}">${p.worstStatus.badgeLabel}</span></td>
        </tr>
      `;
    }).join('');

    dom.turnaroundTbody.innerHTML = rows;
  }

  // --- Flight Tracking Add-On & Alerts ---

  /** Toggle tracking on an arrival */
  function toggleTrackFlight(flightId, shouldTrack) {
    if (shouldTrack) {
      if (!state.trackedFlightIds.includes(flightId)) {
        state.trackedFlightIds.push(flightId);
      }
      showToast(`Tracking flight alerts enabled`);
      // Request notifications if not granted
      requestNotificationPermission();
    } else {
      state.trackedFlightIds = state.trackedFlightIds.filter(id => id !== flightId);
      showToast(`Removed flight from tracker`);
    }

    safeStorageSet('aix_tracked_flights', JSON.stringify(state.trackedFlightIds));
    renderTrackedPanel();
    updateTrackCheckboxes();
  }

  /** Synchronize table checkboxes with tracked state */
  function updateTrackCheckboxes() {
    dom.arrivalsTbody.querySelectorAll('.track-checkbox').forEach(cb => {
      const id = cb.getAttribute('data-track-id');
      cb.checked = state.trackedFlightIds.includes(id);
    });
  }

  /** Render Tracked Flights Floating Panel */
  function renderTrackedPanel() {
    const count = state.trackedFlightIds.length;
    if (dom.trackedBadgeCount) dom.trackedBadgeCount.textContent = count;
    if (dom.trackingCountChip) dom.trackingCountChip.textContent = `${count} flight${count === 1 ? '' : 's'}`;

    if (count > 0) {
      dom.trackingDockPill.classList.add('visible');
    } else {
      dom.trackingDockPill.classList.remove('visible');
      dom.trackingDrawer.classList.remove('open');
    }

    if (!dom.trackingDrawerBody) return;

    if (count === 0) {
      dom.trackingDrawerBody.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 16px;">
          No flights tracked. Check the "Track" box on any arrival to monitor ETA and alerts.
        </div>`;
      return;
    }

    const trackedFlights = state.arrivals.filter(f => {
      const id = f?.identification?.id || `${f?.identification?.number?.default}_${f?.time?.scheduled?.arrival}`;
      return state.trackedFlightIds.includes(id);
    });

    const now = Math.floor(Date.now() / 1000);

    const items = trackedFlights.map(f => {
      const flightNum = f?.identification?.number?.default || '---';
      const flightId = f?.identification?.id || `${flightNum}_${f?.time?.scheduled?.arrival}`;
      const origin = f?.airport?.origin?.code?.iata || '---';
      const sta = f?.time?.scheduled?.arrival || 0;
      const eta = f?.time?.estimated?.arrival || f?.time?.real?.arrival || sta;
      const secondsLeft = eta - now;

      let countdownText = '';
      let progressPercent = 0;

      if (secondsLeft <= 0) {
        const landedMinutesAgo = Math.abs(Math.round(secondsLeft / 60));
        countdownText = landedMinutesAgo === 0 ? 'Touchdown Now' : `Landed ${landedMinutesAgo}m ago`;
        progressPercent = 100;
      } else {
        const mins = Math.floor(secondsLeft / 60);
        const secs = secondsLeft % 60;
        countdownText = mins > 60
          ? `ETA in ${Math.floor(mins / 60)}h ${mins % 60}m`
          : `ETA in ${mins}m ${secs}s`;

        // Progress bar (approximate 4 hour flight window)
        const totalDurationSec = 4 * 3600;
        progressPercent = Math.min(95, Math.max(5, Math.round(((totalDurationSec - secondsLeft) / totalDurationSec) * 100)));
      }

      return `
        <div class="tracked-item">
          <div class="tracked-item-top">
            <span style="font-family: var(--font-mono); font-weight: 800; font-size: 13px;">${flightNum} (${origin} ➔ COK)</span>
            <span class="tracked-countdown">${countdownText}</span>
          </div>
          <div class="progress-bar-container">
            <div class="progress-bar-fill" style="width: ${progressPercent}%;"></div>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted);">
            <span>STA: ${formatIST(sta)} | ETA: ${formatIST(eta)}</span>
            <button class="btn-pill" style="padding: 1px 6px; font-size: 10px;" onclick="window.untrackFlight('${flightId}')">Untrack</button>
          </div>
        </div>
      `;
    }).join('');

    dom.trackingDrawerBody.innerHTML = items;
  }

  // Make untrack accessible to inline onclick
  window.untrackFlight = function (id) {
    toggleTrackFlight(id, false);
  };

  /** Check milestones and trigger local notifications */
  function evaluateTrackingAlerts() {
    if (state.trackedFlightIds.length === 0) return;
    const now = Math.floor(Date.now() / 1000);

    state.arrivals.forEach(f => {
      const flightNum = f?.identification?.number?.default || '---';
      const flightId = f?.identification?.id || `${flightNum}_${f?.time?.scheduled?.arrival}`;
      if (!state.trackedFlightIds.includes(flightId)) return;

      const sta = f?.time?.scheduled?.arrival || 0;
      const eta = f?.time?.estimated?.arrival || f?.time?.real?.arrival || sta;
      const minutesRemaining = Math.round((eta - now) / 60);

      ALERT_MILESTONES.forEach(milestone => {
        // Milestone window tolerance +/- 1 min
        if (Math.abs(minutesRemaining - milestone) <= 1) {
          const alertKey = `${flightId}_${milestone}m`;
          if (!state.sentAlerts.has(alertKey)) {
            state.sentAlerts.add(alertKey);
            safeStorageSet('aix_sent_alerts', JSON.stringify(Array.from(state.sentAlerts)));

            const title = `Flight Alert: ${flightNum}`;
            const body = milestone === 0
              ? `${flightNum} from ${f?.airport?.origin?.code?.iata || 'origin'} is landing now at COK!`
              : `${flightNum} ETA in ${milestone} minutes (ETA: ${formatIST(eta)} IST)`;

            sendNotification(title, body);
            showToast(`${title} - ${body}`, 5000);
          }
        }
      });
    });
  }

  /** Request Notification Permission */
  async function requestNotificationPermission() {
    if ('Notification' in window) {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        dom.notifyBtn.classList.add('active');
        showToast('Notifications enabled for flight milestones');
      } else {
        dom.notifyBtn.classList.remove('active');
      }
    }
  }

  /** Send Push / Web / Native Android Notification */
  function sendNotification(title, body) {
    // 1. Android Native Javascript Bridge (if running inside Android WebView with bridge)
    if (window.AndroidNative && typeof window.AndroidNative.showNotification === 'function') {
      window.AndroidNative.showNotification(title, body);
      return;
    }

    // 2. Standard Web Notifications
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          icon: 'icons/icon.svg',
          badge: 'icons/icon.svg',
          vibrate: [200, 100, 200]
        });
      } catch (e) {
        // Fallback or ServiceWorker registration notification
        if (navigator.serviceWorker && navigator.serviceWorker.ready) {
          navigator.serviceWorker.ready.then(reg => {
            reg.showNotification(title, { body, icon: 'icons/icon.svg' });
          });
        }
      }
    }
  }

  // --- UI State & Event Handlers ---

  function updateStatusIndicator(type, label) {
    if (!dom.statusDot || !dom.statusLabel) return;
    dom.statusDot.className = `status-dot ${type}`;
    dom.statusLabel.textContent = label;
  }

  function showErrorBanner(msg) {
    if (dom.errorMessage) dom.errorMessage.textContent = msg;
    if (dom.errorBanner) dom.errorBanner.classList.add('visible');
  }

  function hideErrorBanner() {
    if (dom.errorBanner) dom.errorBanner.classList.remove('visible');
  }

  // --- Proxy Configuration Modal Handlers ---

  function openProxyModal() {
    if (!dom.proxyModal) return;
    if (dom.proxyModeSelect) {
      dom.proxyModeSelect.value = state.proxyMode;
    }
    if (dom.customProxyUrlInput) {
      dom.customProxyUrlInput.value = state.customProxyUrl || '';
    }
    updateProxyGroupVisibility();
    if (dom.proxyTestStatus) {
      dom.proxyTestStatus.className = '';
      dom.proxyTestStatus.textContent = '';
    }
    if (dom.proxyTestDetails) {
      dom.proxyTestDetails.style.display = 'none';
      dom.proxyTestDetails.textContent = '';
    }
    dom.proxyModal.style.display = 'flex';
  }

  function closeProxyModal() {
    if (dom.proxyModal) {
      dom.proxyModal.style.display = 'none';
    }
  }

  function updateProxyGroupVisibility() {
    if (!dom.customProxyGroup) return;
    const mode = dom.proxyModeSelect?.value || state.proxyMode;
    dom.customProxyGroup.style.display = (mode === 'custom' || mode === 'auto') ? 'block' : 'none';
  }

  function saveProxySettings() {
    const mode = dom.proxyModeSelect?.value || 'auto';
    const customUrl = dom.customProxyUrlInput?.value?.trim() || '';

    state.proxyMode = mode;
    state.customProxyUrl = customUrl;

    safeStorageSet('aix_proxy_mode', mode);
    safeStorageSet('aix_custom_proxy', customUrl);

    updateProxyBtn();
    closeProxyModal();
    showToast(`Proxy configured: ${mode.toUpperCase()} – syncing flights...`);
    loadAllFlightData(true);
  }

  async function testProxyConnection() {
    if (!dom.proxyTestStatus) return;
    const mode = dom.proxyModeSelect?.value || 'auto';
    const customUrl = dom.customProxyUrlInput?.value?.trim() || '';

    dom.proxyTestStatus.className = 'test-status-testing';
    dom.proxyTestStatus.textContent = '⏳ Testing live connection to FlightRadar24 Cochin feed...';
    if (dom.proxyTestDetails) {
      dom.proxyTestDetails.style.display = 'block';
      dom.proxyTestDetails.textContent = 'Contacting api.flightradar24.com/common/v1/airport.json...';
    }

    const testUrl = `https://api.flightradar24.com/common/v1/airport.json?code=cok&plugin-setting[schedule][mode]=arrivals&limit=2`;
    const targetUrl = wrapWithProxy(testUrl, mode, customUrl);
    const start = performance.now();

    try {
      // If Android Native Bridge is active on this device
      if ((mode === 'native' || mode === 'auto') && window.AndroidNative?.nativeFetch) {
        const raw = window.AndroidNative.nativeFetch(testUrl);
        const elapsed = Math.round(performance.now() - start);
        if (raw && !raw.startsWith('ERROR:') && !raw.startsWith('EXCEPTION:')) {
          const parsed = JSON.parse(raw);
          if (parsed && (parsed.result || parsed.response)) {
            dom.proxyTestStatus.className = 'test-status-success';
            dom.proxyTestStatus.textContent = `🟢 Connected (${elapsed}ms) - Android Native Bridge OK!`;
            if (dom.proxyTestDetails) {
              dom.proxyTestDetails.textContent = `Success via native Android network client. Zero browser CORS blocks. Received active Cochin schedule.`;
            }
            return;
          }
        }
      }

      const res = await fetchWithTimeout(targetUrl, 8000);
      const elapsed = Math.round(performance.now() - start);
      let parsed = res;
      if (typeof res === 'string') {
        try { parsed = JSON.parse(res); } catch (_) {}
      }
      if (parsed && (parsed.result || parsed.response)) {
        dom.proxyTestStatus.className = 'test-status-success';
        dom.proxyTestStatus.textContent = `🟢 Connected (${elapsed}ms) - Proxy operational!`;
        if (dom.proxyTestDetails) {
          dom.proxyTestDetails.textContent = `Successfully reached FlightRadar24 Cochin feed. Ready to sync live arrivals, departures, and turnaround telemetry.`;
        }
      } else {
        dom.proxyTestStatus.className = 'test-status-error';
        dom.proxyTestStatus.textContent = `⚠️ Response Received (${elapsed}ms)`;
        if (dom.proxyTestDetails) {
          dom.proxyTestDetails.textContent = `Endpoint responded but returned non-JSON data or verification screen. Try selecting another proxy preset or personal Cloudflare Worker.`;
        }
      }
    } catch (err) {
      const elapsed = Math.round(performance.now() - start);
      dom.proxyTestStatus.className = 'test-status-error';
      dom.proxyTestStatus.textContent = `🔴 Connection Failed (${elapsed}ms)`;
      if (dom.proxyTestDetails) {
        dom.proxyTestDetails.textContent = `Error: ${err.message || 'Blocked by CORS/Cloudflare'}. Try setting a custom proxy or running in Android app.`;
      }
    }
  }

  function updateProxyBtn() {
    if (!dom.proxyBtn) return;
    const label = state.proxyMode === 'custom' ? 'CUSTOM' :
                  state.proxyMode === 'allorigins' ? 'ALLORIGINS' :
                  state.proxyMode === 'codetabs' ? 'CODETABS' :
                  state.proxyMode === 'corsproxy' ? 'CORSPROXY' :
                  state.proxyMode === 'native' ? 'NATIVE' :
                  state.proxyMode === 'off' ? 'OFF' : 'AUTO';
    if (dom.proxyLabel) {
      dom.proxyLabel.textContent = label;
    } else {
      dom.proxyBtn.textContent = `Proxy: ${label}`;
    }
    dom.proxyBtn.classList.toggle('active', state.proxyMode !== 'off');
  }

  function toggleMockMode() {
    state.isMockMode = !state.isMockMode;
    safeStorageSet('aix_mock_mode', state.isMockMode);
    updateMockBtn();
    showToast(`Mock Mode: ${state.isMockMode ? 'ON (fixtures)' : 'OFF (live FlightRadar24)'}`);
    loadAllFlightData(true);
  }

  function updateMockBtn() {
    if (!dom.mockBtn) return;
    dom.mockBtn.textContent = `Mock: ${state.isMockMode ? 'ON' : 'OFF'}`;
    dom.mockBtn.classList.toggle('active', state.isMockMode);
  }

  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    safeStorageSet('aix_theme', state.theme);
    applyTheme();
    showToast(`Theme: ${state.theme.toUpperCase()}`);
  }

  function applyTheme() {
    dom.html.setAttribute('data-theme', state.theme);
  }

  function switchMainTab(tab) {
    state.activeMainTab = tab;
    dom.tabFlightsBtn.classList.toggle('active', tab === 'flights');
    dom.tabTurnaroundBtn.classList.toggle('active', tab === 'turnaround');

    dom.panelFlights.classList.toggle('active', tab === 'flights');
    dom.panelTurnaround.classList.toggle('active', tab === 'turnaround');
  }

  function switchSubTab(subTab) {
    state.activeSubTab = subTab;
    dom.subtabArrivalsBtn?.classList.toggle('active', subTab === 'arrivals');
    dom.subtabDeparturesBtn?.classList.toggle('active', subTab === 'departures');

    if (dom.arrivalsWrapper) dom.arrivalsWrapper.style.display = subTab === 'arrivals' ? '' : 'none';
    if (dom.departuresWrapper) dom.departuresWrapper.style.display = subTab === 'departures' ? '' : 'none';
  }

  // --- Initial Setup & Listeners ---

  function initListeners() {
    // Proxy Button & Modal
    dom.proxyBtn?.addEventListener('click', openProxyModal);
    dom.bannerConfigProxyBtn?.addEventListener('click', openProxyModal);
    dom.closeProxyModalBtn?.addEventListener('click', closeProxyModal);
    dom.cancelProxyBtn?.addEventListener('click', closeProxyModal);
    dom.saveProxyBtn?.addEventListener('click', saveProxySettings);
    dom.testProxyBtn?.addEventListener('click', testProxyConnection);
    dom.proxyModeSelect?.addEventListener('change', updateProxyGroupVisibility);

    dom.proxyModal?.addEventListener('click', (e) => {
      if (e.target === dom.proxyModal) closeProxyModal();
    });

    // Preset Proxy Buttons
    dom.presetAllorigins?.addEventListener('click', () => {
      if (dom.proxyModeSelect) dom.proxyModeSelect.value = 'allorigins';
      if (dom.customProxyUrlInput) dom.customProxyUrlInput.value = 'https://api.allorigins.win/raw?url=';
      updateProxyGroupVisibility();
    });

    dom.presetCodetabs?.addEventListener('click', () => {
      if (dom.proxyModeSelect) dom.proxyModeSelect.value = 'codetabs';
      if (dom.customProxyUrlInput) dom.customProxyUrlInput.value = 'https://api.codetabs.com/v1/proxy?quest=';
      updateProxyGroupVisibility();
    });

    dom.presetCorsproxy?.addEventListener('click', () => {
      if (dom.proxyModeSelect) dom.proxyModeSelect.value = 'corsproxy';
      if (dom.customProxyUrlInput) dom.customProxyUrlInput.value = 'https://corsproxy.io/?url=';
      updateProxyGroupVisibility();
    });

    dom.presetCorsanywhere?.addEventListener('click', () => {
      if (dom.proxyModeSelect) dom.proxyModeSelect.value = 'custom';
      if (dom.customProxyUrlInput) dom.customProxyUrlInput.value = 'https://cors-anywhere.herokuapp.com/';
      updateProxyGroupVisibility();
    });

    // Mock Button
    dom.mockBtn?.addEventListener('click', toggleMockMode);

    // Theme Button
    dom.themeBtn?.addEventListener('click', toggleTheme);

    // Refresh Button
    dom.refreshBtn?.addEventListener('click', () => {
      showToast('Refreshing live flight schedules...');
      loadAllFlightData(true);
    });

    // Notify Button
    dom.notifyBtn?.addEventListener('click', requestNotificationPermission);

    // Earlier Flights Button (-6 hours)
    dom.loadEarlierBtn?.addEventListener('click', () => {
      state.earlierHoursOffset += 6;
      showToast(`Shifted time window back by -${state.earlierHoursOffset} hours`);
      updateCounts();
      loadAllFlightData(true);
    });

    // Error Banner Actions
    dom.bannerRetryBtn?.addEventListener('click', () => loadAllFlightData(true));
    dom.bannerUseMockBtn?.addEventListener('click', () => {
      state.isMockMode = true;
      safeStorageSet('aix_mock_mode', 'true');
      updateMockBtn();
      loadMockData();
    });
    dom.bannerDismissBtn?.addEventListener('click', hideErrorBanner);

    // Tabs
    dom.tabFlightsBtn?.addEventListener('click', () => switchMainTab('flights'));
    dom.tabTurnaroundBtn?.addEventListener('click', () => switchMainTab('turnaround'));
    dom.subtabArrivalsBtn?.addEventListener('click', () => switchSubTab('arrivals'));
    dom.subtabDeparturesBtn?.addEventListener('click', () => switchSubTab('departures'));

    // Tracking Dock & Drawer
    dom.trackingDockPill?.addEventListener('click', () => {
      dom.trackingDrawer.classList.toggle('open');
    });
    dom.trackingDrawerHeader?.addEventListener('click', (e) => {
      if (e.target !== dom.clearTrackedBtn && e.target !== dom.closeDrawerBtn) {
        dom.trackingDrawer.classList.toggle('open');
      }
    });
    dom.closeDrawerBtn?.addEventListener('click', () => dom.trackingDrawer.classList.remove('open'));
    dom.clearTrackedBtn?.addEventListener('click', () => {
      state.trackedFlightIds = [];
      safeStorageSet('aix_tracked_flights', '[]');
      renderTrackedPanel();
      updateTrackCheckboxes();
      showToast('All tracked flights cleared');
    });

    // PWA Install Prompt Listener
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      state.deferredInstallPrompt = e;
      dom.installBanner?.classList.add('visible');
    });

    dom.installAppBtn?.addEventListener('click', async () => {
      if (state.deferredInstallPrompt) {
        state.deferredInstallPrompt.prompt();
        const { outcome } = await state.deferredInstallPrompt.userChoice;
        if (outcome === 'accepted') {
          showToast('Thank you for installing AIX SEC OPS!');
        }
        state.deferredInstallPrompt = null;
        dom.installBanner?.classList.remove('visible');
      }
    });

    dom.installCloseBtn?.addEventListener('click', () => {
      dom.installBanner?.classList.remove('visible');
    });

    // Polling interval (30s)
    setInterval(() => {
      loadAllFlightData(false);
    }, POLL_INTERVAL_MS);

    // 1-second countdown ticker for tracked flights & alert evaluation
    setInterval(() => {
      if (state.trackedFlightIds.length > 0) {
        renderTrackedPanel();
        evaluateTrackingAlerts();
      }
    }, 1000);

    // Refetch on tab focus
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        loadAllFlightData(false);
      }
    });

    // Refetch when back online
    window.addEventListener('online', () => {
      showToast('Back online – refreshing flight board...');
      loadAllFlightData(true);
    });

    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then(() => console.log('PWA Service Worker registered'))
          .catch((err) => console.warn('Service Worker registration failed:', err));
      });
    }
  }

  // --- App Startup ---
  function startApp() {
    applyTheme();
    updateProxyBtn();
    updateMockBtn();
    initListeners();

    // 1. Immediately render initial active Cochin flight timetable (0ms load!)
    loadInitialTimetable();

    if ('Notification' in window && Notification.permission === 'granted') {
      dom.notifyBtn?.classList.add('active');
    }

    // 2. Background sync live data via proxy or native Android bridge
    loadAllFlightData(true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
  } else {
    startApp();
  }

})();
