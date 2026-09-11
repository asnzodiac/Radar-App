(function() {
  'use strict';

  const AIRPORT_CODE = 'cok';
  const ALLOWED_AIRLINES = ['IX', 'AK', 'FD', 'UL', 'J9', 'FZ', 'WY', 'G9', '3L', 'EY'];
  const ALLOWED_ICAO = ['AXB', 'AXM', 'AIQ', 'ALK', 'JZR', 'FDB', 'OMA', 'ABY', 'ETD'];

  const STORAGE_KEYS = {
    THEME: 'aix_theme',
    PROXY_MODE: 'aix_proxy_mode',
    CUSTOM_PROXY_URL: 'aix_custom_proxy_url',
    TRACKED_FLIGHTS: 'aix_tracked_flights',
    MOCK_MODE: 'aix_mock_mode',
    NOTIFY_ENABLED: 'aix_notify_enabled'
  };

  const state = {
    theme: localStorage.getItem(STORAGE_KEYS.THEME) || 'dark',
    proxyMode: localStorage.getItem(STORAGE_KEYS.PROXY_MODE) || 'auto',
    customProxyUrl: localStorage.getItem(STORAGE_KEYS.CUSTOM_PROXY_URL) || '',
    mockMode: localStorage.getItem(STORAGE_KEYS.MOCK_MODE) === 'true',
    notificationsEnabled: localStorage.getItem(STORAGE_KEYS.NOTIFY_ENABLED) === 'true',
    trackedIds: new Set(JSON.parse(localStorage.getItem(STORAGE_KEYS.TRACKED_FLIGHTS) || '[]')),
    timeOffsetHours: 0,
    rawArrivals: [],
    rawDepartures: [],
    turnaroundPairs: [],
    activeTab: 'panel-flights',
    activeSubtab: 'arrivals',
    isFetching: false,
    lastFetchTimestamp: 0,
    notifiedMilestones: new Map()
  };

  function formatIST(unixSeconds) {
    if (!unixSeconds) return '--:--';
    return new Date(unixSeconds * 1000).toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }

  function showToast(message) {
    if (window.AndroidNative && typeof window.AndroidNative.showToast === 'function') {
      window.AndroidNative.showToast(message);
      return;
    }
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function isAllowedAirline(flight) {
    if (!flight || !flight.airline) return false;
    const iata = (flight.airline.code?.iata || '').toUpperCase();
    const icao = (flight.airline.code?.icao || '').toUpperCase();
    return ALLOWED_AIRLINES.includes(iata) || ALLOWED_ICAO.includes(icao);
  }

  function computeFlightStatus(flight, type) {
    const isArr = type === 'arrival';
    const scheduled = isArr ? flight.time?.scheduled?.arrival : flight.time?.scheduled?.departure;
    const estimated = isArr ? flight.time?.estimated?.arrival : flight.time?.estimated?.departure;
    const real = isArr ? flight.time?.real?.arrival : flight.time?.real?.departure;
    const statusText = (flight.status?.text || '').toUpperCase();

    if (statusText.includes('CANCEL')) {
      return { level: 'cancelled', badgeText: 'CANCELLED', chipText: 'Cancelled', delayMin: 0, targetTime: scheduled };
    }
    if (real) {
      const delayMin = scheduled ? Math.round((real - scheduled) / 60) : 0;
      return {
        level: delayMin > 30 ? 'heavydelay' : (delayMin > 5 ? 'delayed' : 'ontime'),
        badgeText: isArr ? 'LANDED' : 'DEPARTED',
        chipText: delayMin > 0 ? `+${delayMin}m` : (isArr ? 'Landed' : 'Departed'),
        delayMin,
        targetTime: real
      };
    }
    const effective = estimated || scheduled;
    const delayMin = (scheduled && estimated) ? Math.round((estimated - scheduled) / 60) : 0;
    let level = 'ontime';
    let chipText = 'On Time';
    if (delayMin > 30) { level = 'heavydelay'; chipText = `+${delayMin}m`; }
    else if (delayMin > 5) { level = 'delayed'; chipText = `+${delayMin}m`; }

    return {
      level,
      badgeText: statusText || 'SCHEDULED',
      chipText,
      delayMin,
      targetTime: effective
    };
  }

  function computeTurnaroundPairs(arrivals, departures) {
    const pairs = [];
    const usedArr = new Set();
    const usedDep = new Set();

    arrivals.forEach(arr => {
      const reg = arr.flight?.aircraft?.registration;
      if (!reg || reg === 'N/A' || usedArr.has(arr.flight?.identification?.id)) return;
      const arrStatus = computeFlightStatus(arr.flight, 'arrival');

      let bestMatch = null;
      let minGap = Infinity;

      departures.forEach(dep => {
        if (usedDep.has(dep.flight?.identification?.id)) return;
        if (dep.flight?.aircraft?.registration !== reg) return;
        const depStatus = computeFlightStatus(dep.flight, 'departure');

        if (arrStatus.targetTime && depStatus.targetTime) {
          const diff = Math.round((depStatus.targetTime - arrStatus.targetTime) / 60);
          if (diff >= 0 && diff <= 150 && diff < minGap) {
            minGap = diff;
            bestMatch = { dep, diff, depStatus };
          }
        }
      });

      if (bestMatch) {
        usedArr.add(arr.flight.identification.id);
        usedDep.add(bestMatch.dep.flight.identification.id);

        let worst = 'ontime';
        if (arrStatus.level === 'cancelled' || bestMatch.depStatus.level === 'cancelled') worst = 'cancelled';
        else if (arrStatus.level === 'heavydelay' || bestMatch.depStatus.level === 'heavydelay') worst = 'heavydelay';
        else if (arrStatus.level === 'delayed' || bestMatch.depStatus.level === 'delayed') worst = 'delayed';

        pairs.push({
          arrival: arr.flight,
          departure: bestMatch.dep.flight,
          reg,
          turnMinutes: bestMatch.diff,
          arrStatus,
          depStatus: bestMatch.depStatus,
          worstLevel: worst
        });
      }
    });
    return pairs.sort((a, b) => (a.arrStatus.targetTime || 0) - (b.arrStatus.targetTime || 0));
  }

  function getProxyUrls(targetUrl) {
    const enc = encodeURIComponent(targetUrl);
    if (state.proxyMode === 'custom' && state.customProxyUrl) {
      const tmpl = state.customProxyUrl.trim();
      return [tmpl.endsWith('=') || tmpl.endsWith('/') ? tmpl + enc : tmpl + enc];
    }
    if (state.proxyMode === 'codetabs') return [`https://api.codetabs.com/v1/proxy?quest=${enc}`];
    if (state.proxyMode === 'corsproxy') return [`https://corsproxy.io/?url=${enc}`];
    if (state.proxyMode === 'off') return [targetUrl];

    return [
      targetUrl,
      `https://api.codetabs.com/v1/proxy?quest=${enc}`,
      `https://corsproxy.io/?url=${enc}`
    ];
  }

  async function fetchFlightSchedule() {
    if (state.isFetching) return;
    state.isFetching = true;
    updateStatusPill('loading', 'POLLING...');

    if (state.mockMode) {
      setTimeout(() => {
        if (window.MockFlightData) {
          handleScheduleResponse(window.MockFlightData.getMockSchedule());
          updateStatusPill('live', 'MOCK MODE');
          hideError();
        }
        state.isFetching = false;
      }, 250);
      return;
    }

    const apiUrl = `https://api.flightradar24.com/common/v1/airport.json?code=${AIRPORT_CODE}&plugin[]=&plugin-setting[schedule][mode]=&page=1&limit=100`;

    if ((state.proxyMode === 'native' || state.proxyMode === 'auto') &&
        window.AndroidNative && typeof window.AndroidNative.nativeFetch === 'function') {
      try {
        const res = window.AndroidNative.nativeFetch(apiUrl);
        if (res && !res.startsWith('ERROR:') && !res.startsWith('EXCEPTION:')) {
          handleScheduleResponse(JSON.parse(res));
          updateStatusPill('live', 'NATIVE LIVE');
          hideError();
          state.isFetching = false;
          return;
        }
      } catch (e) {
        console.warn('Native bridge fallback:', e);
      }
    }

    let success = false;
    let errDetail = '';
    for (const url of getProxyUrls(apiUrl)) {
      try {
        const c = new AbortController();
        const t = setTimeout(() => c.abort(), 8000);
        const r = await fetch(url, { signal: c.signal });
        clearTimeout(t);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (data && data.result?.response?.airport?.pluginData?.schedule) {
          handleScheduleResponse(data);
          updateStatusPill('live', 'LIVE (IST)');
          hideError();
          success = true;
          break;
        }
      } catch (e) {
        errDetail = e.message;
      }
    }

    state.isFetching = false;
    if (!success) {
      updateStatusPill('error', 'OFFLINE');
      showError(`Feed unreachable: ${errDetail}`);
      if (state.rawArrivals.length === 0 && window.MockFlightData) {
        handleScheduleResponse(window.MockFlightData.getMockSchedule());
      }
    }
  }

  function handleScheduleResponse(json) {
    const sched = json.result?.response?.airport?.pluginData?.schedule;
    if (!sched) return;

    state.rawArrivals = (sched.arrivals?.data || []).filter(isAllowedAirline);
    state.rawDepartures = (sched.departures?.data || []).filter(isAllowedAirline);
    state.turnaroundPairs = computeTurnaroundPairs(state.rawArrivals, state.rawDepartures);
    state.lastFetchTimestamp = Date.now();

    renderArrivals();
    renderDepartures();
    renderTurnarounds();
    updateBadges();
    updateTrackedDrawer();
  }

  function renderArrivals() {
    const tbody = document.getElementById('arrivals-tbody');
    if (!tbody) return;
    tbody.innerHTML = state.rawArrivals.map(item => {
      const f = item.flight;
      const id = f.identification?.id || f.identification?.number?.default;
      const num = f.identification?.number?.default || '–';
      const code = (f.airline?.code?.iata || 'AIR').toUpperCase();
      const reg = f.aircraft?.registration || '–';
      const orig = f.airport?.origin?.code?.iata || '–';
      const city = f.airport?.origin?.position?.region?.city || '';
      const ac = f.aircraft?.model?.code || '–';
      const st = computeFlightStatus(f, 'arrival');
      const isTrk = state.trackedIds.has(id);

      return `
        <tr class="ops-row status-${st.level}">
          <td style="text-align: center;"><input type="checkbox" class="track-checkbox" data-track-id="${id}" ${isTrk ? 'checked' : ''}></td>
          <td class="flight-col">
            <div class="flight-cell">
              <div class="airline-logo-box" title="${code}">
                <img class="airline-logo-img" src="https://images.flightradar24.com/assets/airlines/logotypes/${code.toLowerCase()}.png" alt="${code}" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';" />
                <span class="airline-fallback-badge">${code}</span>
              </div>
              <span class="flight-num">${num}</span>
            </div>
          </td>
          <td><span class="reg-tag">${reg}</span></td>
          <td><div class="station-cell"><span class="station-code">${orig}</span><span class="station-city">${city}</span></div></td>
          <td><div class="time-cell"><span>${formatIST(st.targetTime)}</span><span class="delay-chip ${st.level}">${st.chipText}</span></div></td>
          <td><span class="time-sta">${formatIST(f.time?.scheduled?.arrival)}</span></td>
          <td><span style="font-family:var(--font-mono); font-size:12px;">${ac}</span></td>
          <td><span class="status-badge ${st.level}">${st.badgeText}</span></td>
        </tr>`;
    }).join('');
  }

  function renderDepartures() {
    const tbody = document.getElementById('departures-tbody');
    if (!tbody) return;
    tbody.innerHTML = state.rawDepartures.map(item => {
      const f = item.flight;
      const num = f.identification?.number?.default || '–';
      const code = (f.airline?.code?.iata || 'AIR').toUpperCase();
      const reg = f.aircraft?.registration || '–';
      const dest = f.airport?.destination?.code?.iata || '–';
      const city = f.airport?.destination?.position?.region?.city || '';
      const ac = f.aircraft?.model?.code || '–';
      const st = computeFlightStatus(f, 'departure');

      return `
        <tr class="ops-row status-${st.level}">
          <td class="flight-col">
            <div class="flight-cell">
              <div class="airline-logo-box" title="${code}">
                <img class="airline-logo-img" src="https://images.flightradar24.com/assets/airlines/logotypes/${code.toLowerCase()}.png" alt="${code}" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';" />
                <span class="airline-fallback-badge">${code}</span>
              </div>
              <span class="flight-num">${num}</span>
            </div>
          </td>
          <td><span class="reg-tag">${reg}</span></td>
          <td><div class="station-cell"><span class="station-code">${dest}</span><span class="station-city">${city}</span></div></td>
          <td><div class="time-cell"><span>${formatIST(st.targetTime)}</span><span class="delay-chip ${st.level}">${st.chipText}</span></div></td>
          <td><span class="time-sta">${formatIST(f.time?.scheduled?.departure)}</span></td>
          <td><span style="font-family:var(--font-mono); font-size:12px;">${ac}</span></td>
          <td><span class="status-badge ${st.level}">${st.badgeText}</span></td>
        </tr>`;
    }).join('');
  }

  function renderTurnarounds() {
    const tbody = document.getElementById('turnaround-tbody');
    if (!tbody) return;
    tbody.innerHTML = state.turnaroundPairs.map(p => {
      const inNum = p.arrival.identification?.number?.default || '–';
      const outNum = p.departure.identification?.number?.default || '–';
      const inCode = (p.arrival.airline?.code?.iata || 'AIR').toUpperCase();
      const outCode = (p.departure.airline?.code?.iata || 'AIR').toUpperCase();
      const ac = p.arrival.aircraft?.model?.code || p.departure.aircraft?.model?.code || '–';

      return `
        <tr class="ops-row status-${p.worstLevel}">
          <td>
            <div class="pair-box">
              <div class="airline-logo-box"><span class="airline-fallback-badge" style="display:inline-flex">${inCode}</span></div>
              <span>${inNum}</span>
              <span class="pair-arrow">↳</span>
              <div class="airline-logo-box"><span class="airline-fallback-badge" style="display:inline-flex">${outCode}</span></div>
              <span>${outNum}</span>
            </div>
          </td>
          <td><span class="reg-tag">${p.reg}</span></td>
          <td><span class="station-code">${p.arrival.airport?.origin?.code?.iata || '–'}</span></td>
          <td><span class="station-code">${p.departure.airport?.destination?.code?.iata || '–'}</span></td>
          <td><div class="time-cell"><span>${formatIST(p.arrStatus.targetTime)} / ${formatIST(p.depStatus.targetTime)}</span><span class="delay-chip ontime">${p.turnMinutes}m turn</span></div></td>
          <td><span class="time-sta">${formatIST(p.arrival.time?.scheduled?.arrival)} / ${formatIST(p.departure.time?.scheduled?.departure)}</span></td>
          <td><span style="font-family:var(--font-mono); font-size:12px;">${ac}</span></td>
          <td><span class="status-badge ${p.worstLevel}">${p.worstLevel.toUpperCase()}</span></td>
        </tr>`;
    }).join('');
  }

  function updateBadges() {
    document.getElementById('arrivals-count').textContent = state.rawArrivals.length;
    document.getElementById('departures-count').textContent = state.rawDepartures.length;
    document.getElementById('turnaround-count').textContent = state.turnaroundPairs.length;
    document.getElementById('tracked-badge-count').textContent = state.trackedIds.size;
    document.getElementById('tracking-count-chip').textContent = `${state.trackedIds.size} flights`;
    const pill = document.getElementById('tracking-dock-pill');
    if (pill) pill.classList.toggle('visible', state.trackedIds.size > 0);
  }

  function updateTrackedDrawer() {
    const body = document.getElementById('tracking-drawer-body');
    if (!body) return;
    if (state.trackedIds.size === 0) {
      body.innerHTML = '<div style="text-align:center; padding:12px; color:var(--text-muted);">No tracked flights.</div>';
      return;
    }
    const tracked = state.rawArrivals.filter(i => state.trackedIds.has(i.flight?.identification?.id || i.flight?.identification?.number?.default));
    const now = Math.floor(Date.now() / 1000);
    body.innerHTML = tracked.map(i => {
      const f = i.flight;
      const num = f.identification?.number?.default || 'Flight';
      const orig = f.airport?.origin?.code?.iata || '–';
      const st = computeFlightStatus(f, 'arrival');
      const diff = (st.targetTime || now) - now;
      const mins = Math.max(0, Math.floor(diff / 60));
      return `
        <div class="tracked-item">
          <div class="tracked-item-top">
            <strong>${num} from ${orig}</strong>
            <span class="tracked-countdown">${diff > 0 ? `T-${mins}m` : 'Landed'}</span>
          </div>
          <div class="progress-bar-container"><div class="progress-bar-fill" style="width:${Math.min(100, Math.max(5, 100 - mins))}%;"></div></div>
        </div>`;
    }).join('');
  }

  function updateStatusPill(type, label) {
    const dot = document.getElementById('status-dot');
    const lbl = document.getElementById('status-label');
    if (dot) dot.className = `status-dot ${type}`;
    if (lbl) lbl.textContent = label;
  }

  function showError(msg) {
    const b = document.getElementById('error-banner');
    const m = document.getElementById('error-message');
    if (b && m) { m.textContent = msg; b.classList.add('visible'); }
  }

  function hideError() {
    const b = document.getElementById('error-banner');
    if (b) b.classList.remove('visible');
  }

  function setupEvents() {
    document.getElementById('theme-btn')?.addEventListener('click', () => {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', state.theme);
      localStorage.setItem(STORAGE_KEYS.THEME, state.theme);
    });
    document.documentElement.setAttribute('data-theme', state.theme);

    document.getElementById('refresh-btn')?.addEventListener('click', () => {
      showToast('Refreshing...');
      fetchFlightSchedule();
    });

    document.getElementById('mock-btn')?.addEventListener('click', () => {
      state.mockMode = !state.mockMode;
      localStorage.setItem(STORAGE_KEYS.MOCK_MODE, state.mockMode);
      document.getElementById('mock-btn').textContent = state.mockMode ? 'Mock: On' : 'Mock: Off';
      document.getElementById('mock-btn').classList.toggle('active', state.mockMode);
      fetchFlightSchedule();
    });

    document.getElementById('tab-flights-btn')?.addEventListener('click', () => {
      document.getElementById('tab-flights-btn').classList.add('active');
      document.getElementById('tab-turnaround-btn').classList.remove('active');
      document.getElementById('panel-flights').classList.add('active');
      document.getElementById('panel-turnaround').classList.remove('active');
    });

    document.getElementById('tab-turnaround-btn')?.addEventListener('click', () => {
      document.getElementById('tab-turnaround-btn').classList.add('active');
      document.getElementById('tab-flights-btn').classList.remove('active');
      document.getElementById('panel-turnaround').classList.add('active');
      document.getElementById('panel-flights').classList.remove('active');
    });

    document.getElementById('subtab-arrivals-btn')?.addEventListener('click', () => {
      document.getElementById('subtab-arrivals-btn').classList.add('active');
      document.getElementById('subtab-departures-btn').classList.remove('active');
      document.getElementById('arrivals-wrapper').style.display = 'block';
      document.getElementById('departures-wrapper').style.display = 'none';
    });

    document.getElementById('subtab-departures-btn')?.addEventListener('click', () => {
      document.getElementById('subtab-departures-btn').classList.add('active');
      document.getElementById('subtab-arrivals-btn').classList.remove('active');
      document.getElementById('departures-wrapper').style.display = 'block';
      document.getElementById('arrivals-wrapper').style.display = 'none';
    });

    document.addEventListener('change', (e) => {
      if (e.target.classList.contains('track-checkbox')) {
        const id = e.target.getAttribute('data-track-id');
        if (e.target.checked) state.trackedIds.add(id);
        else state.trackedIds.delete(id);
        localStorage.setItem(STORAGE_KEYS.TRACKED_FLIGHTS, JSON.stringify(Array.from(state.trackedIds)));
        updateBadges();
        updateTrackedDrawer();
      }
    });

    document.getElementById('tracking-dock-pill')?.addEventListener('click', () => {
      document.getElementById('tracking-drawer')?.classList.add('open');
    });
    document.getElementById('close-drawer-btn')?.addEventListener('click', () => {
      document.getElementById('tracking-drawer')?.classList.remove('open');
    });
    document.getElementById('clear-tracked-btn')?.addEventListener('click', () => {
      state.trackedIds.clear();
      localStorage.setItem(STORAGE_KEYS.TRACKED_FLIGHTS, '[]');
      updateBadges();
      updateTrackedDrawer();
      renderArrivals();
    });

    document.getElementById('proxy-btn')?.addEventListener('click', () => {
      document.getElementById('proxy-modal').style.display = 'flex';
    });
    document.getElementById('close-proxy-modal-btn')?.addEventListener('click', () => {
      document.getElementById('proxy-modal').style.display = 'none';
    });
    document.getElementById('cancel-proxy-btn')?.addEventListener('click', () => {
      document.getElementById('proxy-modal').style.display = 'none';
    });
    document.getElementById('save-proxy-btn')?.addEventListener('click', () => {
      state.proxyMode = document.getElementById('proxy-mode-select').value;
      state.customProxyUrl = document.getElementById('custom-proxy-url').value;
      localStorage.setItem(STORAGE_KEYS.PROXY_MODE, state.proxyMode);
      localStorage.setItem(STORAGE_KEYS.CUSTOM_PROXY_URL, state.customProxyUrl);
      document.getElementById('proxy-label').textContent = state.proxyMode;
      document.getElementById('proxy-modal').style.display = 'none';
      fetchFlightSchedule();
    });
  }

  function init() {
    setupEvents();
    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
    fetchFlightSchedule();
    setInterval(fetchFlightSchedule, 30000);
    setInterval(updateTrackedDrawer, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();