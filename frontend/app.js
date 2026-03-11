const BASE = '';
const FRONT_CONTRACT_VERSION = '1.4.0';

const api = {
  async request(path, opts = {}) {
    const started = performance.now();
    const response = await fetch(BASE + path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
    const elapsed = Math.round(performance.now() - started);
    if (!response.ok) {
      let detail = response.statusText;
      try {
        const data = await response.json();
        detail = data.detail || detail;
      } catch {}
      const err = new Error(detail);
      err.status = response.status;
      err.elapsedMs = elapsed;
      throw err;
    }
    return { data: await response.json(), elapsedMs: elapsed };
  },
  get(path) {
    return this.request(path);
  },
  post(path, body) {
    return this.request(path, { method: 'POST', body: JSON.stringify(body) });
  },
  listUnits() {
    return this.get('/units');
  },
  createUnit(payload) {
    return this.post('/unit', payload);
  },
  createUnitV1(payload) {
    return this.post('/api/v1/units', payload);
  },
  patchUnitV1(unitId, payload) {
    return this.request(`/api/v1/units/${unitId}`, { method: 'PATCH', body: JSON.stringify(payload) });
  },
  deleteUnitV1(unitId) {
    return this.request(`/api/v1/units/${unitId}`, { method: 'DELETE' });
  },
  createUnitDraft(payload) {
    return this.post('/api/v1/units/draft', payload);
  },
  createTrackingIngestDraft(payload) {
    return this.post('/api/v1/tracking/ingest/draft', payload);
  },
  reverseGeocode(payload) {
    return this.post('/api/v1/geocoding/reverse', payload);
  },
  forwardGeocode(payload) {
    return this.post('/api/v1/geocoding/search', payload);
  },
  ingestPosition(payload) {
    return this.post('/position', payload);
  },
  getPositions(unitId) {
    return this.get(`/positions/${unitId}`);
  },
  getGeoFeatures(zoom, bbox, layer = 'orbat') {
    return this.get(`/api/v1/geo/features?zoom=${zoom}&layer=${layer}&bbox=${encodeURIComponent(bbox)}`);
  },
  getGeoEvents(zoom, bbox) {
    return this.get(`/api/v1/geo/events?zoom=${zoom}&bbox=${encodeURIComponent(bbox)}&limit=300`);
  },
};

const st = {
  units: {},
  selectedId: null,
  geoFeatures: [],
  selectedTrail: [],
  selectedPosition: null,
  freshnessByUnit: {},
  events: [],
  apiOnline: false,
  uiMode: 'desktop',
  lastGeoLatencyMs: null,
  lastRenderLatencyMs: null,
  pickCoordsMode: false,
  pickTarget: 'add-unit',
  geoEvents: [],
  unitDraftId: null,
  ingestDraftId: null,
  geotoolsInitialized: false,
  geotools: {
    panelOpen: false,
    activeTool: null,
    mode: 'none',
    cursor: { lat: 40.4168, lon: -3.7038 },
    selection: {
      anchor: null,
      points: [],
      sourceType: null,
      sourceIds: [],
    },
    params: {
      rings: { radiiM: [100, 250, 500] },
      bearing: { units: 'm' },
      sector: { radiusM: 250, bearingDeg: 0, spreadDeg: 60 },
      proximity: { radiusM: 250, dataset: 'units' },
      dispersion: { dataset: 'visible-units' },
      export: { includeOperationalRefs: true },
    },
    derived: {
      features: [],
      resultSummary: null,
      converter: null,
    },
    pinnedCursor: null,
  },
};

let map;
const drawState = {
  mode: 'none',
  activePoints: [],
  items: [],
  noteMarkers: [],
};

window.st = st;
window.drawState = drawState;

function isoClock() {
  return new Date().toISOString().substring(11, 19) + 'Z';
}

function getFreshnessClass(value) {
  if (value === 'fresh') return 'tsd-fresh';
  if (value === 'stale') return 'tsd-stale';
  if (value === 'lost') return 'tsd-lost';
  return 'tsd-none';
}

const OPERATOR_PHOTOS_BY_ID = {
  'OP-001': 'assets/agents/torres.png',
  'OP-002': 'assets/agents/sanz.png',
};

function getOperatorPhoto(unit) {
  return OPERATOR_PHOTOS_BY_ID[unit.id] || null;
}

function notify(message, level = '') {
  const root = document.getElementById('notifs');
  const item = document.createElement('div');
  item.className = `notif ${level}`;
  item.textContent = message;
  root.appendChild(item);
  setTimeout(() => item.remove(), 3000);
}

function logEvent(type, message, level = '') {
  st.events.unshift({ type, message, ts: isoClock(), level });
  st.events = st.events.slice(0, 40);
  const container = document.getElementById('event-log');
  container.innerHTML = st.events
    .map((event) => `
      <div class="ev">
        <span class="ev-ts">${event.ts}</span>
        <span class="ev-type ${event.level ? `ev-${event.level}` : ''}">${event.type}</span>
        <span class="ev-msg">${event.message}</span>
      </div>
    `)
    .join('');
  document.getElementById('ev-count').textContent = String(st.events.length);
}

function updateApiStatus(online, text) {
  st.apiOnline = online;
  const dot = document.getElementById('api-dot');
  const label = document.getElementById('api-txt');
  if (online) {
    dot.className = 'status-dot';
    label.textContent = text || 'ONLINE';
    return;
  }
  dot.className = 'status-dot offline';
  label.textContent = text ? text.substring(0, 20) : 'OFFLINE';
}

function applyResponsiveMode() {
  const width = window.innerWidth;
  const appEl = document.getElementById('app');
  const prevMode = st.uiMode;
  appEl.classList.remove('mode-desktop', 'mode-tablet', 'mode-mobile');
  if (width <= 767) {
    st.uiMode = 'mobile';
    appEl.classList.add('mode-mobile');
    // Mobile: left panel hidden by default unless already open
    if (prevMode === 'desktop') appEl.classList.remove('show-left');
  } else if (width <= 1279) {
    st.uiMode = 'tablet';
    appEl.classList.add('mode-tablet');
    // Entering tablet from desktop: open left panel by default
    if (prevMode === 'desktop') appEl.classList.add('show-left');
  } else {
    st.uiMode = 'desktop';
    appEl.classList.add('mode-desktop');
  }
}

function currentBBox() {
  const bounds = map.getBounds();
  return `${bounds.getWest().toFixed(6)},${bounds.getSouth().toFixed(6)},${bounds.getEast().toFixed(6)},${bounds.getNorth().toFixed(6)}`;
}

function distanceMeters(a, b) {
  const toRad = (v) => (v * Math.PI) / 180;
  const r = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function formatMeters(v) {
  if (v >= 1000) return `${(v / 1000).toFixed(2)} km`;
  return `${Math.round(v)} m`;
}

function projectToMeters(origin, point) {
  const cosLat = Math.max(0.2, Math.cos((origin.lat * Math.PI) / 180));
  return {
    x: (point.lon - origin.lon) * 111320 * cosLat,
    y: (point.lat - origin.lat) * 110540,
  };
}

function unprojectFromMeters(origin, point) {
  const cosLat = Math.max(0.2, Math.cos((origin.lat * Math.PI) / 180));
  return {
    lon: origin.lon + (point.x / (111320 * cosLat)),
    lat: origin.lat + (point.y / 110540),
  };
}

function lineLengthMeters(points) {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += distanceMeters(points[i - 1], points[i]);
  return total;
}

function polygonAreaMeters(points) {
  if (points.length < 3) return 0;
  const origin = points[0];
  const projected = points.map((point) => projectToMeters(origin, point));
  let area = 0;
  for (let i = 0; i < projected.length; i += 1) {
    const j = (i + 1) % projected.length;
    area += projected[i].x * projected[j].y - projected[j].x * projected[i].y;
  }
  return Math.abs(area) / 2;
}

// Note popup state
let notePendingLngLat = null;
let notePendingColor = 'amber';

const MapWidgets = {
  initZoomButtons() {
    document.getElementById('zoom-in-btn').addEventListener('click', () => map.easeTo({ zoom: map.getZoom() + 1, duration: 250 }));
    document.getElementById('zoom-out-btn').addEventListener('click', () => map.easeTo({ zoom: map.getZoom() - 1, duration: 250 }));
  },

  clearNotes() {
    drawState.noteMarkers.forEach((m) => m.remove());
    drawState.noteMarkers = [];
  },

  createNoteMarker(lngLat, text, color = 'amber') {
    const el = document.createElement('div');
    el.className = `map-note-marker c-${color}`;
    el.innerHTML = `
      <div class="map-note-marker-hdr">
        <span class="map-note-marker-lbl">▪ NOTE</span>
        <button class="map-note-marker-del" title="Delete note">✕</button>
      </div>
      <div class="map-note-marker-text">${text}</div>
    `;
    const marker = new maplibregl.Marker({ element: el, draggable: true })
      .setLngLat([lngLat.lng, lngLat.lat])
      .addTo(map);
    el.querySelector('.map-note-marker-del').addEventListener('click', (e) => {
      e.stopPropagation();
      marker.remove();
      drawState.noteMarkers = drawState.noteMarkers.filter((m) => m !== marker);
    });
    drawState.noteMarkers.push(marker);
  },

  showNotePopup(lngLat) {
    notePendingLngLat = lngLat;
    notePendingColor = 'amber';
    const popup = document.getElementById('note-popup');
    popup.className = 'note-popup c-amber';
    popup.style.display = 'block';
    // Position relative to map container
    const px = map.project([lngLat.lng, lngLat.lat]);
    const mapEl = document.getElementById('map');
    let x = px.x + 14;
    let y = px.y - 12;
    if (x + 214 > mapEl.offsetWidth)  x = px.x - 218;
    if (y + 175 > mapEl.offsetHeight) y = px.y - 175;
    if (y < 4) y = 4;
    popup.style.left = `${Math.max(4, x)}px`;
    popup.style.top  = `${y}px`;
    document.getElementById('note-popup-text').value = '';
    document.getElementById('note-popup-text').focus();
    document.querySelectorAll('.note-color-dot').forEach((d) => d.classList.remove('active'));
    document.querySelector('.note-color-dot[data-color="amber"]').classList.add('active');
  },

  initNotePopup() {
    document.getElementById('note-popup-close').addEventListener('click', () => {
      document.getElementById('note-popup').style.display = 'none';
      notePendingLngLat = null;
    });
    document.getElementById('note-popup-save').addEventListener('click', () => {
      const text = document.getElementById('note-popup-text').value.trim();
      if (text && notePendingLngLat) {
        this.createNoteMarker(notePendingLngLat, text, notePendingColor);
      }
      document.getElementById('note-popup').style.display = 'none';
      notePendingLngLat = null;
    });
    document.getElementById('note-popup-text').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        document.getElementById('note-popup-save').click();
      }
    });
    document.querySelectorAll('.note-color-dot').forEach((dot) => {
      dot.addEventListener('click', () => {
        notePendingColor = dot.dataset.color;
        document.querySelectorAll('.note-color-dot').forEach((d) => d.classList.remove('active'));
        dot.classList.add('active');
        const popup = document.getElementById('note-popup');
        popup.className = `note-popup c-${notePendingColor}`;
      });
    });
  },

  initToolbarTooltip() {
    const tooltip = document.getElementById('mtb-tooltip');
    document.querySelectorAll('.mtb-btn').forEach((btn) => {
      btn.addEventListener('mouseenter', () => {
        const tip = btn.getAttribute('data-tip');
        if (!tip) return;
        const bRect = btn.getBoundingClientRect();
        const tbRect = document.getElementById('map-toolbar').getBoundingClientRect();
        tooltip.textContent = tip;
        tooltip.style.top = `${bRect.top - tbRect.top + btn.offsetHeight / 2}px`;
        tooltip.classList.add('show');
      });
      btn.addEventListener('mouseleave', () => tooltip.classList.remove('show'));
    });
  },

  buildBufferPolygon(points, radiusM) {
    if (!points.length) return [];
    if (points.length === 1) {
      const ring = [];
      for (let i = 0; i < 24; i += 1) {
        const angle = (2 * Math.PI * i) / 24;
        const dx = Math.cos(angle) * radiusM;
        const dy = Math.sin(angle) * radiusM;
        ring.push(unprojectFromMeters(points[0], { x: dx, y: dy }));
      }
      ring.push(ring[0]);
      return ring;
    }

    const origin = points[0];
    const xy = points.map((point) => projectToMeters(origin, point));
    const normals = [];
    for (let i = 1; i < xy.length; i += 1) {
      const dx = xy[i].x - xy[i - 1].x;
      const dy = xy[i].y - xy[i - 1].y;
      const len = Math.hypot(dx, dy) || 1;
      normals.push({ x: -dy / len, y: dx / len });
    }

    const left = [];
    const right = [];
    for (let i = 0; i < xy.length; i += 1) {
      let nx;
      let ny;
      if (i === 0) {
        nx = normals[0].x;
        ny = normals[0].y;
      } else if (i === xy.length - 1) {
        nx = normals[normals.length - 1].x;
        ny = normals[normals.length - 1].y;
      } else {
        nx = normals[i - 1].x + normals[i].x;
        ny = normals[i - 1].y + normals[i].y;
        const nlen = Math.hypot(nx, ny) || 1;
        nx /= nlen;
        ny /= nlen;
      }
      left.push({ x: xy[i].x + nx * radiusM, y: xy[i].y + ny * radiusM });
      right.push({ x: xy[i].x - nx * radiusM, y: xy[i].y - ny * radiusM });
    }

    const ringMeters = [...left, ...right.reverse()];
    ringMeters.push(ringMeters[0]);
    return ringMeters.map((point) => unprojectFromMeters(origin, point));
  },

  labelMidpoint(a, b) {
    return { lon: (a.lon + b.lon) / 2, lat: (a.lat + b.lat) / 2 };
  },

  buildMeasureFeatures() {
    const features = [];

    drawState.items.forEach((item) => {
      if (item.type === 'line') {
        const coords = item.points.map((p) => [p.lon, p.lat]);
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: { layer: 'measure-line' },
        });

        // Segment labels (only when > 2 points)
        if (item.points.length > 2) {
          for (let i = 1; i < item.points.length; i += 1) {
            const d = distanceMeters(item.points[i - 1], item.points[i]);
            const mid = this.labelMidpoint(item.points[i - 1], item.points[i]);
            features.push({
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [mid.lon, mid.lat] },
              properties: { layer: 'measure-label-seg', text: formatMeters(d) },
            });
          }
        }

        // Total at midpoint of whole line
        const total = lineLengthMeters(item.points);
        const mid = this.labelMidpoint(item.points[0], item.points[item.points.length - 1]);
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [mid.lon, mid.lat] },
          properties: { layer: 'measure-label', text: `↔ ${formatMeters(total)}` },
        });
        return;
      }

      if (item.type === 'polygon') {
        const ring = [...item.points, item.points[0]];
        features.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [ring.map((p) => [p.lon, p.lat])] },
          properties: { layer: 'measure-polygon' },
        });

        // Edge length labels
        for (let i = 1; i < ring.length; i += 1) {
          const d = distanceMeters(ring[i - 1], ring[i]);
          const mid = this.labelMidpoint(ring[i - 1], ring[i]);
          features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [mid.lon, mid.lat] },
            properties: { layer: 'measure-label-seg', text: formatMeters(d) },
          });
        }

        // Area at centroid
        const area = polygonAreaMeters(item.points);
        const c = item.points.reduce((acc, p) => ({ lon: acc.lon + p.lon, lat: acc.lat + p.lat }), { lon: 0, lat: 0 });
        const centroid = { lon: c.lon / item.points.length, lat: c.lat / item.points.length };
        const areaStr = area >= 1e6
          ? `${(area / 1e6).toFixed(3)} km²`
          : `${Math.round(area).toLocaleString()} m²`;
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [centroid.lon, centroid.lat] },
          properties: { layer: 'measure-label', text: `⬡ ${areaStr}` },
        });
        return;
      }

      if (item.type === 'buffer') {
        const ring = this.buildBufferPolygon(item.points, item.radiusM);
        if (ring.length < 4) return;
        features.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [ring.map((p) => [p.lon, p.lat])] },
          properties: { layer: 'measure-buffer' },
        });

        // Path length label
        if (item.points.length >= 2) {
          const pathLen = lineLengthMeters(item.points);
          const pathMid = this.labelMidpoint(item.points[0], item.points[item.points.length - 1]);
          features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [pathMid.lon, pathMid.lat] },
            properties: { layer: 'measure-label-seg', text: `path ${formatMeters(pathLen)}` },
          });
        }

        // Area + radius at approximate centroid
        const area = polygonAreaMeters(ring.slice(0, -1));
        const areaStr = area >= 1e6
          ? `${(area / 1e6).toFixed(3)} km²`
          : `${Math.round(area).toLocaleString()} m²`;
        const cx = ring.slice(0, -1).reduce((s, p) => s + p.lon, 0) / (ring.length - 1);
        const cy = ring.slice(0, -1).reduce((s, p) => s + p.lat, 0) / (ring.length - 1);
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [cx, cy] },
          properties: { layer: 'measure-label', text: `◎ R:${item.radiusM}m  ${areaStr}` },
        });
      }
    });

    // In-progress drawing preview
    if (drawState.activePoints.length >= 2) {
      const coords = drawState.activePoints.map((p) => [p.lon, p.lat]);
      if (drawState.mode === 'line' || drawState.mode === 'buffer') {
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: { layer: 'measure-line' },
        });
        const total = lineLengthMeters(drawState.activePoints);
        const last = drawState.activePoints[drawState.activePoints.length - 1];
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [last.lon, last.lat] },
          properties: { layer: 'measure-label-seg', text: `↔ ${formatMeters(total)}` },
        });
      }
      if (drawState.mode === 'polygon') {
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: { layer: 'measure-line' },
        });
      }
    }

    return features;
  },

  refreshMeasureLayers() {
    const src = map.getSource('measure-features');
    if (!src) return;
    src.setData({ type: 'FeatureCollection', features: this.buildMeasureFeatures() });
  },

  setMode(mode) {
    if (typeof mode === 'string' && mode.startsWith('gt-')) {
      drawState.mode = 'none';
      drawState.activePoints = [];
      const statusEl = document.getElementById('draw-status');
      if (statusEl) statusEl.className = 'draw-status hidden';
      const canvas = map.getCanvas();
      canvas.classList.remove('drawing-cursor', 'erase-cursor');
      ['measure-line-btn', 'measure-polygon-btn', 'measure-buffer-btn', 'measure-note-btn', 'erase-btn'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
      });
      this.refreshMeasureLayers();
      if (window.GeoTools) window.GeoTools.activate(mode);
      return;
    }

    if (window.GeoTools && window.GeoTools.isActive()) {
      window.GeoTools.deactivate();
      window.GeoTools.clear();
    }

    drawState.mode = mode;
    drawState.activePoints = [];

    // Toolbar active state
    ['measure-line-btn', 'measure-polygon-btn', 'measure-buffer-btn', 'measure-note-btn', 'erase-btn'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('active', id.includes(mode) || (id === 'erase-btn' && mode === 'erase'));
    });

    // Draw status bar
    const statusEl = document.getElementById('draw-status');
    if (mode === 'none') {
      statusEl.className = 'draw-status hidden';
    } else {
      const icons = { line: '╱', polygon: '⬡', buffer: '◎', note: '✎', erase: '⊗' };
      const msgs  = {
        line:    'LINE — Click points, dbl-click to finish',
        polygon: 'POLYGON — Click vertices, dbl-click to close',
        buffer:  'BUFFER — Click path, set radius, dbl-click to finish',
        note:    'NOTE — Click anywhere on map',
        erase:   'ERASE — Click a unit or shape to delete it',
      };
      statusEl.className = `draw-status mode-${mode}`;
      document.getElementById('draw-status-icon').textContent = icons[mode] || '';
      document.getElementById('draw-status-msg').textContent  = msgs[mode]  || '';
      document.getElementById('draw-status-pts').textContent  = mode === 'erase' ? '' : '0 PTS';
      document.getElementById('draw-status-live').textContent = '--';
    }

    // Cursor
    const canvas = map.getCanvas();
    canvas.classList.toggle('drawing-cursor', mode !== 'none');
    canvas.classList.toggle('erase-cursor', mode === 'erase');

    // Close note popup when changing mode
    document.getElementById('note-popup').style.display = 'none';
    notePendingLngLat = null;

    this.refreshMeasureLayers();
  },

  finishMeasure() {
    if (!drawState.activePoints.length) return;
    const radius = Number(document.getElementById('buffer-radius').value || '80');
    if (drawState.mode === 'line' && drawState.activePoints.length >= 2) {
      drawState.items.push({ type: 'line', points: [...drawState.activePoints] });
    }
    if (drawState.mode === 'polygon' && drawState.activePoints.length >= 3) {
      drawState.items.push({ type: 'polygon', points: [...drawState.activePoints] });
    }
    if (drawState.mode === 'buffer' && drawState.activePoints.length >= 2) {
      drawState.items.push({ type: 'buffer', points: [...drawState.activePoints], radiusM: Math.max(1, radius) });
    }
    drawState.activePoints = [];
    const ptsEl = document.getElementById('draw-status-pts');
    if (ptsEl) ptsEl.textContent = '0 PTS';
    const liveEl = document.getElementById('draw-status-live');
    if (liveEl) liveEl.textContent = '--';
    this.refreshMeasureLayers();
  },

  initMeasure() {
    const toggle = (mode) => this.setMode(drawState.mode === mode ? 'none' : mode);
    document.getElementById('measure-line-btn').addEventListener('click', () => toggle('line'));
    document.getElementById('measure-polygon-btn').addEventListener('click', () => toggle('polygon'));
    document.getElementById('measure-buffer-btn').addEventListener('click', () => toggle('buffer'));
    document.getElementById('measure-note-btn').addEventListener('click', () => toggle('note'));
    document.getElementById('measure-finish-btn').addEventListener('click', () => this.finishMeasure());
    document.getElementById('measure-cancel-btn').addEventListener('click', () => {
      drawState.activePoints = [];
      this.refreshMeasureLayers();
      document.getElementById('draw-status-pts').textContent = '0 PTS';
      document.getElementById('draw-status-live').textContent = '--';
    });
    document.getElementById('measure-clear-btn').addEventListener('click', () => {
      drawState.items = [];
      drawState.activePoints = [];
      this.clearNotes();
      this.setMode('none');
      this.refreshMeasureLayers();
    });

    // ESC key: cancel active draw or exit mode
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.getElementById('note-popup').style.display = 'none';
        notePendingLngLat = null;
        if (drawState.activePoints.length > 0) {
          drawState.activePoints = [];
          this.refreshMeasureLayers();
          document.getElementById('draw-status-pts').textContent = '0 PTS';
          document.getElementById('draw-status-live').textContent = '--';
        } else if (drawState.mode !== 'none') {
          this.setMode('none');
        }
      }
    });

    // Single click: add point (also handles Favorites pick mode and erase mode)
    map.on('click', async (event) => {
      if (await Favorites.handleMapClick(event)) return;
      if (st.pickCoordsMode) return;
      if (drawState.mode === 'erase') {
        // Try to hit a unit feature first
        const feats = map.queryRenderedFeatures(event.point, { layers: ['units-point'] });
        if (feats.length) {
          const unitId = feats[0].properties?.unit_id;
          if (unitId) {
            const unit = st.units[unitId];
            const hasKids = Object.values(st.units).some((u) => u.parent_id === unitId);
            if (hasKids) {
              showTreeDelMenu({ target: { getBoundingClientRect: () => ({ bottom: event.point.y + 48, left: event.point.x }) } }, unitId, unit?.name || unitId);
            } else {
              await app.quickDeleteUnit(unitId, unit?.name || unitId);
            }
          }
          return;
        }
        // Try to erase a note marker (nearest within 20px)
        for (const nm of [...drawState.noteMarkers]) {
          const nPos = nm.getLngLat();
          const nPx = map.project(nPos);
          const dx = nPx.x - event.point.x, dy = nPx.y - event.point.y;
          if (Math.sqrt(dx * dx + dy * dy) < 20) {
            nm.remove();
            drawState.noteMarkers = drawState.noteMarkers.filter((m) => m !== nm);
            notify('Note removed');
            return;
          }
        }
        // Try to erase a draw shape
        if (drawState.items.length) {
          // Remove last item for now (proximity check would need geometry library)
          drawState.items.pop();
          this.refreshMeasureLayers();
          notify('Shape removed');
        }
        return;
      }
      if (drawState.mode === 'none') return;
      if (drawState.mode === 'note') {
        this.showNotePopup(event.lngLat);
        return;
      }
      const point = { lat: event.lngLat.lat, lon: event.lngLat.lng };
      drawState.activePoints.push(point);
      const ptsEl = document.getElementById('draw-status-pts');
      if (ptsEl) ptsEl.textContent = `${drawState.activePoints.length} PTS`;
      this.refreshMeasureLayers();
    });

    // Double-click: finish shape
    map.on('dblclick', (event) => {
      if (drawState.mode === 'none' || drawState.mode === 'note') return;
      event.preventDefault();
      this.finishMeasure();
    });

    this.initNotePopup();
  },

  toggleErase() {
    this.setMode(drawState.mode === 'erase' ? 'none' : 'erase');
    this.initToolbarTooltip();
  },
};

function initMap() {
  map = new maplibregl.Map({
    container: 'map',
    style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    center: [-3.7038, 40.4168],
    zoom: 12,
    attributionControl: false,
  });
  window.map = map;

  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

  map.on('load', () => {
    map.addSource('geo-features', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    map.addSource('geo-events', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    map.addSource('measure-features', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    map.addSource('geotools-features', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    // Link layers — one layer per echelon for distinct color + dash pattern
    // Company → amber, long dash
    map.addLayer({
      id: 'orbat-link-company',
      type: 'line',
      source: 'geo-features',
      filter: ['all', ['==', ['get', 'layer'], 'orbat-link'],
                      ['==', ['get', 'child_echelon'], 'company']],
      paint: {
        'line-color':       '#ffaa33',
        'line-width':       2.5,
        'line-opacity':     0.90,
        'line-dasharray':   [8, 4],
      },
    });
    // Platoon → cyan, medium dash
    map.addLayer({
      id: 'orbat-link-platoon',
      type: 'line',
      source: 'geo-features',
      filter: ['all', ['==', ['get', 'layer'], 'orbat-link'],
                      ['==', ['get', 'child_echelon'], 'platoon']],
      paint: {
        'line-color':       '#00d4e8',
        'line-width':       2,
        'line-opacity':     0.85,
        'line-dasharray':   [5, 3],
      },
    });
    // Squad → green, short dash
    map.addLayer({
      id: 'orbat-link-squad',
      type: 'line',
      source: 'geo-features',
      filter: ['all', ['==', ['get', 'layer'], 'orbat-link'],
                      ['==', ['get', 'child_echelon'], 'squad']],
      paint: {
        'line-color':       '#00e87a',
        'line-width':       1.5,
        'line-opacity':     0.80,
        'line-dasharray':   [3, 3],
      },
    });
    // Operator → violet, dot-dash
    map.addLayer({
      id: 'orbat-link-operator',
      type: 'line',
      source: 'geo-features',
      filter: ['all', ['==', ['get', 'layer'], 'orbat-link'],
                      ['==', ['get', 'child_echelon'], 'operator']],
      paint: {
        'line-color':       '#8866ff',
        'line-width':       1.2,
        'line-opacity':     0.70,
        'line-dasharray':   [2, 4],
      },
    });
    // Command → white, long dash wide — highest authority
    map.addLayer({
      id: 'orbat-link-command',
      type: 'line',
      source: 'geo-features',
      filter: ['all', ['==', ['get', 'layer'], 'orbat-link'],
                      ['==', ['get', 'child_echelon'], 'command']],
      paint: {
        'line-color':       '#e4f2ff',
        'line-width':       2,
        'line-opacity':     0.85,
        'line-dasharray':   [5, 3],
      },
    });
    // Default catch-all (team, section, division, etc.)
    map.addLayer({
      id: 'orbat-link-default',
      type: 'line',
      source: 'geo-features',
      filter: ['all',
        ['==', ['get', 'layer'], 'orbat-link'],
        ['!', ['in', ['get', 'child_echelon'],
          ['literal', ['company', 'platoon', 'squad', 'operator', 'command']]]],
      ],
      paint: {
        'line-color':       '#5a88a8',
        'line-width':       1.5,
        'line-opacity':     0.65,
        'line-dasharray':   [4, 4],
      },
    });

    // Units — zoom-range visibility by echelon
    map.addLayer({
      id: 'units-point',
      type: 'circle',
      source: 'geo-features',
      filter: ['all',
        ['==', ['get', 'layer'], 'units-point'],
        ['any',
          ['!', ['in', ['get', 'echelon'], ['literal', ['operator', 'squad', 'platoon']]]],
          ['all', ['==', ['get', 'echelon'], 'platoon'],  ['>=', ['zoom'], 9]],
          ['all', ['==', ['get', 'echelon'], 'squad'],    ['>=', ['zoom'], 11]],
          ['all', ['==', ['get', 'echelon'], 'operator'], ['>=', ['zoom'], 13]],
        ],
      ],
      paint: {
        'circle-radius': [
          'match', ['get', 'echelon'],
          'company',  8,
          'platoon',  6,
          'squad',    5,
          'operator', 4,
          6,
        ],
        'circle-color': [
          'match', ['get', 'freshness'],
          'fresh', 'rgba(0,232,122,0.34)',
          'stale', 'rgba(255,170,51,0.34)',
          'lost',  'rgba(255,59,82,0.34)',
          'rgba(156,189,216,0.30)',
        ],
        'circle-stroke-color': [
          'match', ['get', 'freshness'],
          'fresh', '#00e87a',
          'stale', '#ffaa33',
          'lost',  '#ff3b52',
          '#9abdd8',
        ],
        'circle-stroke-width': 1.5,
      },
    });

    map.addLayer({
      id: 'events-point',
      type: 'circle',
      source: 'geo-events',
      paint: {
        'circle-radius': 4,
        'circle-color': [
          'match', ['get', 'severity'],
          'critical', '#ff3b52',
          'high', '#ff6b33',
          'medium', '#ffaa33',
          'low', '#3cb8e8',
          '#9abdd8',
        ],
        'circle-stroke-color': '#020408',
        'circle-stroke-width': 1,
      },
    });

    map.addLayer({
      id: 'units-label',
      type: 'symbol',
      source: 'geo-features',
      filter: ['all',
        ['==', ['get', 'layer'], 'units-point'],
        ['any',
          ['!', ['in', ['get', 'echelon'], ['literal', ['operator', 'squad', 'platoon']]]],
          ['all', ['==', ['get', 'echelon'], 'platoon'],  ['>=', ['zoom'], 10]],
          ['all', ['==', ['get', 'echelon'], 'squad'],    ['>=', ['zoom'], 12]],
          ['all', ['==', ['get', 'echelon'], 'operator'], ['>=', ['zoom'], 14]],
        ],
      ],
      layout: {
        'text-field': ['get', 'unit_name'],
        'text-size': ['match', ['get', 'echelon'], 'company', 12, 'platoon', 11, 10],
        'text-offset': [0, 1.3],
        'text-anchor': 'top',
      },
      paint: {
        'text-color': '#9abdd8',
        'text-halo-color': 'rgba(2,4,10,0.95)',
        'text-halo-width': 2,
      },
    });

    map.addLayer({
      id: 'measure-line',
      type: 'line',
      source: 'measure-features',
      filter: ['==', ['get', 'layer'], 'measure-line'],
      paint: {
        'line-color': '#00e87a',
        'line-width': 2,
        'line-dasharray': [2, 2],
      },
    });
    map.addLayer({
      id: 'measure-polygon-fill',
      type: 'fill',
      source: 'measure-features',
      filter: ['==', ['get', 'layer'], 'measure-polygon'],
      paint: {
        'fill-color': 'rgba(60,184,232,0.20)',
        'fill-outline-color': '#3cb8e8',
      },
    });
    map.addLayer({
      id: 'measure-buffer-fill',
      type: 'fill',
      source: 'measure-features',
      filter: ['==', ['get', 'layer'], 'measure-buffer'],
      paint: {
        'fill-color': 'rgba(255,170,51,0.20)',
        'fill-outline-color': '#ffaa33',
      },
    });
    // Main label (total distance, area, buffer summary)
    map.addLayer({
      id: 'measure-label',
      type: 'symbol',
      source: 'measure-features',
      filter: ['==', ['get', 'layer'], 'measure-label'],
      layout: {
        'text-field': ['get', 'text'],
        'text-size': 13,
        'text-offset': [0, 0],
        'text-anchor': 'center',
      },
      paint: {
        'text-color': '#e4f2ff',
        'text-halo-color': 'rgba(2,4,10,0.97)',
        'text-halo-width': 2.5,
      },
    });

    // Segment label (per-edge distances, smaller and dimmer)
    map.addLayer({
      id: 'measure-label-seg',
      type: 'symbol',
      source: 'measure-features',
      filter: ['==', ['get', 'layer'], 'measure-label-seg'],
      layout: {
        'text-field': ['get', 'text'],
        'text-size': 10,
        'text-offset': [0, -1.1],
        'text-anchor': 'bottom',
      },
      paint: {
        'text-color': '#9abdd8',
        'text-halo-color': 'rgba(2,4,10,0.95)',
        'text-halo-width': 2,
      },
    });

    map.addLayer({
      id: 'gt-rings-line',
      type: 'line',
      source: 'geotools-features',
      filter: ['==', ['get', 'layer'], 'gt-rings-line'],
      paint: {
        'line-color': '#ffaa33',
        'line-width': 2,
        'line-dasharray': [3, 2],
      },
    });
    map.addLayer({
      id: 'gt-bearing-line',
      type: 'line',
      source: 'geotools-features',
      filter: ['==', ['get', 'layer'], 'gt-bearing-line'],
      paint: {
        'line-color': '#00d4e8',
        'line-width': 3,
        'line-opacity': 0.9,
      },
    });
    map.addLayer({
      id: 'gt-sector-fill',
      type: 'fill',
      source: 'geotools-features',
      filter: ['==', ['get', 'layer'], 'gt-sector-fill'],
      paint: {
        'fill-color': 'rgba(255,59,82,0.18)',
        'fill-outline-color': '#ff3b52',
      },
    });
    map.addLayer({
      id: 'gt-sector-line',
      type: 'line',
      source: 'geotools-features',
      filter: ['==', ['get', 'layer'], 'gt-sector-line'],
      paint: {
        'line-color': '#ff3b52',
        'line-width': 2,
      },
    });
    map.addLayer({
      id: 'gt-anchor-point',
      type: 'circle',
      source: 'geotools-features',
      filter: ['==', ['get', 'layer'], 'gt-anchor-point'],
      paint: {
        'circle-radius': 5,
        'circle-color': '#020408',
        'circle-stroke-color': '#00e87a',
        'circle-stroke-width': 2,
      },
    });
    map.addLayer({
      id: 'gt-proximity-hit',
      type: 'circle',
      source: 'geotools-features',
      filter: ['==', ['get', 'layer'], 'gt-proximity-hit'],
      paint: {
        'circle-radius': 5,
        'circle-color': '#ffaa33',
        'circle-stroke-color': '#020408',
        'circle-stroke-width': 1.5,
      },
    });
    map.addLayer({
      id: 'gt-dispersion-fill',
      type: 'fill',
      source: 'geotools-features',
      filter: ['==', ['get', 'layer'], 'gt-dispersion-fill'],
      paint: {
        'fill-color': 'rgba(0,232,122,0.12)',
        'fill-outline-color': '#00e87a',
      },
    });
    map.addLayer({
      id: 'gt-dispersion-outline',
      type: 'line',
      source: 'geotools-features',
      filter: ['==', ['get', 'layer'], 'gt-dispersion-outline'],
      paint: {
        'line-color': '#00e87a',
        'line-width': 2,
        'line-dasharray': [2, 2],
      },
    });
    map.addLayer({
      id: 'gt-bearing-label',
      type: 'symbol',
      source: 'geotools-features',
      filter: ['==', ['get', 'layer'], 'gt-bearing-label'],
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 11,
        'text-offset': [0, -1],
        'text-anchor': 'bottom',
      },
      paint: {
        'text-color': '#e4f2ff',
        'text-halo-color': 'rgba(2,4,10,0.97)',
        'text-halo-width': 2,
      },
    });
    map.addLayer({
      id: 'gt-label',
      type: 'symbol',
      source: 'geotools-features',
      filter: ['==', ['get', 'layer'], 'gt-label'],
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 10,
        'text-offset': [0.8, -0.8],
        'text-anchor': 'left',
      },
      paint: {
        'text-color': '#ffaa33',
        'text-halo-color': 'rgba(2,4,10,0.97)',
        'text-halo-width': 2,
      },
    });

    map.on('click', 'units-point', async (event) => {
      const unitId = event.features?.[0]?.properties?.unit_id;
      if (unitId) await app.selectUnit(unitId);
    });

    map.on('click', async (event) => {
      if (!st.pickCoordsMode) return;
      st.pickCoordsMode = false;
      const lat = Number(event.lngLat.lat.toFixed(6));
      const lon = Number(event.lngLat.lng.toFixed(6));
      // Fill coordinates and immediately reopen modal — geocoding runs in background
      if (st.pickTarget === 'ingest') {
        document.getElementById('ip-lat').value = String(lat);
        document.getElementById('ip-lon').value = String(lon);
      } else {
        document.getElementById('au-lat').value = String(lat);
        document.getElementById('au-lon').value = String(lon);
      }
      app.openModal(st.pickTarget === 'ingest' ? 'ingest' : 'add-unit');
      try {
        const { data } = await api.reverseGeocode({ lat, lon, locale: 'es' });
        const confidence = Number(data.confidence ?? 0);
        if (st.pickTarget === 'ingest') {
          document.getElementById('ip-address').value = data.address_text || '';
          const unitId = document.getElementById('ip-uid').value.trim() || st.selectedId || null;
          const { data: ingestDraft } = await api.createTrackingIngestDraft({
            unit_id: unitId,
            lat,
            lon,
            address_text: data.address_text || null,
            geocode_confidence: confidence,
            provider_status: data.address_text ? 'ok' : 'unavailable',
          });
          st.ingestDraftId = ingestDraft.id;
        } else {
          const draftName = document.getElementById('au-name').value.trim() || 'map-pick-draft';
          const parentUnitId = document.getElementById('au-parent').value.trim() || null;
          document.getElementById('au-address').value = data.address_text || '';
          document.getElementById('au-geoc').value = String(confidence);
          const { data: unitDraft } = await api.createUnitDraft({
            name: draftName,
            parent_unit_id: parentUnitId,
            lat,
            lon,
            address_text: data.address_text || null,
            geocode_confidence: confidence,
          });
          st.unitDraftId = unitDraft.id;
        }
        notify(data.address_text ? 'Address suggested from map click' : 'Coordinates captured (no address)', data.address_text ? '' : 'warn');
        logEvent('GEO', `Reverse geocode ${lat},${lon} conf=${confidence}`, data.address_text ? 'ok' : 'warn');
      } catch (err) {
        notify(`Geocode: ${err.message}`, 'warn');
        logEvent('ERR', `Reverse geocode failed: ${err.message}`, 'warn');
      }
    });

    map.on('click', 'events-point', (e) => {
      const props = e.features?.[0]?.properties || {};

      const sevColors = { critical: '#ff3b52', high: '#ff6b33', medium: '#ffaa33', low: '#3cb8e8' };
      const sevColor = sevColors[props.severity] || '#9abdd8';

      const ts = props.occurred_at
        ? new Date(props.occurred_at).toISOString().replace('T', ' ').substring(0, 19) + 'Z'
        : '--';

      let unitRefs = '';
      try {
        const refs = typeof props.unit_refs === 'string' ? JSON.parse(props.unit_refs) : props.unit_refs;
        if (Array.isArray(refs) && refs.length) unitRefs = refs.join(', ');
      } catch {}

      let entityRefs = '';
      try {
        const ents = typeof props.entity_refs === 'string' ? JSON.parse(props.entity_refs) : props.entity_refs;
        if (Array.isArray(ents) && ents.length) entityRefs = ents.map((x) => `${x.entity_type}:${x.entity_id}`).join(', ');
      } catch {}

      let payloadRows = '';
      try {
        const pl = typeof props.payload === 'string' ? JSON.parse(props.payload) : props.payload;
        if (pl) {
          if (pl.kind) payloadRows += `<div class="ev-popup-row"><span class="ev-popup-key">KIND</span><span class="ev-popup-val">${pl.kind}</span></div>`;
          Object.entries(pl.attributes || {}).forEach(([k, v]) => {
            payloadRows += `<div class="ev-popup-row"><span class="ev-popup-key">${k.replace(/_/g, ' ')}</span><span class="ev-popup-val">${v}</span></div>`;
          });
          if (pl.confidence != null) payloadRows += `<div class="ev-popup-row"><span class="ev-popup-key">CONF</span><span class="ev-popup-val">${(pl.confidence * 100).toFixed(0)}%</span></div>`;
        }
      } catch {}

      const shortId = props.event_id ? props.event_id.substring(0, 8) + '…' : '--';

      const html = `
        <div class="ev-popup">
          <div class="ev-popup-hdr" style="border-left:3px solid ${sevColor}">
            <span class="ev-popup-type">${props.event_type || 'EVENT'}</span>
            <span class="ev-popup-sev" style="color:${sevColor};border-color:${sevColor}">${(props.severity || 'info').toUpperCase()}</span>
          </div>
          <div class="ev-popup-body">
            <div class="ev-popup-row"><span class="ev-popup-key">ID</span><span class="ev-popup-val ev-popup-id">${shortId}</span></div>
            <div class="ev-popup-row"><span class="ev-popup-key">TIME</span><span class="ev-popup-val">${ts}</span></div>
            ${props.source_system ? `<div class="ev-popup-row"><span class="ev-popup-key">SOURCE</span><span class="ev-popup-val">${props.source_system}</span></div>` : ''}
            ${props.operation_id ? `<div class="ev-popup-row"><span class="ev-popup-key">OP</span><span class="ev-popup-val">${props.operation_id}</span></div>` : ''}
            ${unitRefs ? `<div class="ev-popup-row"><span class="ev-popup-key">UNITS</span><span class="ev-popup-val">${unitRefs}</span></div>` : ''}
            ${entityRefs ? `<div class="ev-popup-row"><span class="ev-popup-key">ENTITY</span><span class="ev-popup-val">${entityRefs}</span></div>` : ''}
            ${payloadRows}
            <div class="ev-popup-row ev-popup-coords">
              <span class="ev-popup-key">POS</span>
              <span class="ev-popup-val">${e.lngLat.lat.toFixed(5)}, ${e.lngLat.lng.toFixed(5)}</span>
            </div>
          </div>
        </div>`;

      new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: '290px' })
        .setLngLat(e.lngLat)
        .setHTML(html)
        .addTo(map);
    });

    map.on('mouseenter', 'units-point', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'units-point', () => { map.getCanvas().style.cursor = ''; });
    map.on('mouseenter', 'events-point', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'events-point', () => { map.getCanvas().style.cursor = ''; });

    map.on('moveend', () => app.refreshGeo());
    map.on('zoomend', () => app.refreshGeo());


    MapWidgets.initZoomButtons();
    MapWidgets.initMeasure();
    MapWidgets.refreshMeasureLayers();
    Favorites.init();
    MarkerSidebar.init();
    OgcServices.init();
    window.GeoTools?.init();
    app.refresh();
    LocalEvents.render();
  });

  map.on('mousemove', (e) => {
    document.getElementById('h-coords').textContent = `LAT ${e.lngLat.lat.toFixed(4)}  LON ${e.lngLat.lng.toFixed(4)}`;
    // Live distance while drawing
    if (drawState.activePoints.length > 0 && drawState.mode !== 'none' && drawState.mode !== 'note') {
      const cursor = { lat: e.lngLat.lat, lon: e.lngLat.lng };
      const last = drawState.activePoints[drawState.activePoints.length - 1];
      const d = distanceMeters(last, cursor);
      const liveEl = document.getElementById('draw-status-live');
      if (liveEl) liveEl.textContent = formatMeters(d);
    }
  });
}

function updateMapFeatures() {
  const source = map?.getSource('geo-features');
  if (!source) return;
  source.setData({ type: 'FeatureCollection', features: st.geoFeatures });

  document.getElementById('hud-zoom').textContent = `ZOOM: ${map.getZoom().toFixed(1)}`;
  document.getElementById('zoom-pill').textContent = `ZOOM: ${map.getZoom().toFixed(1)}`;
  document.getElementById('hud-feats').textContent = `FEATURES: ${st.geoFeatures.length}`;
  document.getElementById('hud-events').textContent = `EVENTS: ${st.geoEvents.length}`;

  let fresh = 0;
  let stale = 0;
  let lost = 0;
  for (const feature of st.geoFeatures) {
    const props = feature.properties || {};
    if (props.layer !== 'units-point') continue;
    if (props.freshness === 'fresh') fresh += 1;
    if (props.freshness === 'stale') stale += 1;
    if (props.freshness === 'lost') lost += 1;
    if (props.unit_id) st.freshnessByUnit[props.unit_id] = props.freshness;
  }

  document.getElementById('s-total').textContent = String(Object.keys(st.units).length);
  document.getElementById('s-fresh').textContent = String(fresh);
  document.getElementById('s-stale').textContent = String(stale);
  document.getElementById('s-lost').textContent = String(lost);
  document.getElementById('s-render').textContent = st.lastRenderLatencyMs != null ? `${st.lastRenderLatencyMs}ms` : '--';
  window.GeoTools?.render();
}

function updateMapEvents() {
  const source = map?.getSource('geo-events');
  if (!source) return;
  source.setData({ type: 'FeatureCollection', features: st.geoEvents });
  document.getElementById('hud-events').textContent = `EVENTS: ${st.geoEvents.length}`;
}

const TREE_EXP_KEY = 'orbat_tree_expanded_v2'; // localStorage → persists across sessions
let treeSearchQuery = '';
let orbatLayersVisible = true;

function treeLoadExp() {
  try { return new Set(JSON.parse(localStorage.getItem(TREE_EXP_KEY) || '[]')); }
  catch { return new Set(); }
}
function treeSaveExp(s) {
  localStorage.setItem(TREE_EXP_KEY, JSON.stringify([...s]));
}

function treeCollapseAll() {
  treeSaveExp(new Set());
  renderTree();
}
function treeExpandAll() {
  treeSaveExp(new Set(Object.keys(st.units)));
  renderTree();
}

function treeSetSearch(q) {
  treeSearchQuery = q;
  renderTree();
}

function toggleOrbatLayers() {
  orbatLayersVisible = !orbatLayersVisible;
  const vis = orbatLayersVisible ? 'visible' : 'none';
  ['orbat-link-company', 'orbat-link-platoon', 'orbat-link-squad', 'orbat-link-operator', 'orbat-link-command', 'orbat-link-default', 'units-point', 'units-label'].forEach((id) => {
    if (map?.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis);
  });
  const btn = document.getElementById('orbat-vis-btn');
  if (btn) {
    btn.innerHTML = orbatLayersVisible ? '◉' : '◎';
    btn.title = orbatLayersVisible ? 'Hide ORBAT on map' : 'Show ORBAT on map';
    btn.classList.toggle('active', !orbatLayersVisible);
  }
}

function toggleLeftPanel() {
  const lp = document.getElementById('left-panel');
  const collapsed = lp.classList.toggle('panel-collapsed');
  const btn = document.getElementById('panel-collapse-btn');
  if (btn) btn.textContent = collapsed ? '▶' : '◀';
  const saved = localStorage.getItem('leftPanelWidth') || '272';
  document.documentElement.style.setProperty('--left-w', collapsed ? '28px' : saved + 'px');
}

function initPanelResize() {
  // Restore saved widths on load
  const lw = localStorage.getItem('leftPanelWidth');
  const rw = localStorage.getItem('rightPanelWidth');
  if (lw) document.documentElement.style.setProperty('--left-w', lw + 'px');
  if (rw) document.documentElement.style.setProperty('--right-w', rw + 'px');

  function makeDrag(handleEl, panelEl, cssVar, storageKey, side) {
    if (!handleEl) return;
    let startX, startW;
    handleEl.addEventListener('pointerdown', (e) => {
      // Only drag on desktop (skip if panel is in collapsed/overlay mode)
      if (window.innerWidth < 1280) return;
      e.preventDefault();
      startX = e.clientX;
      startW = panelEl.getBoundingClientRect().width;
      handleEl.setPointerCapture(e.pointerId);
      handleEl.classList.add('dragging');
    });
    handleEl.addEventListener('pointermove', (e) => {
      if (!handleEl.hasPointerCapture(e.pointerId)) return;
      const delta = side === 'right' ? startX - e.clientX : e.clientX - startX;
      const newW = Math.max(180, Math.min(520, startW + delta));
      document.documentElement.style.setProperty(cssVar, newW + 'px');
      localStorage.setItem(storageKey, String(Math.round(newW)));
    });
    handleEl.addEventListener('pointerup', () => {
      handleEl.classList.remove('dragging');
    });
  }

  makeDrag(
    document.getElementById('left-resize-handle'),
    document.getElementById('left-panel'),
    '--left-w', 'leftPanelWidth', 'left'
  );
  makeDrag(
    document.getElementById('right-resize-handle'),
    document.getElementById('right-panel'),
    '--right-w', 'rightPanelWidth', 'right'
  );
}

function countDescendants(unitId) {
  let n = 0;
  function walk(id) {
    Object.values(st.units).filter((u) => u.parent_id === id).forEach((u) => { n++; walk(u.id); });
  }
  walk(unitId);
  return n;
}

function showTreeDelMenu(e, unitId, unitName) {
  document.getElementById('tree-del-menu')?.remove();
  const total = countDescendants(unitId) + 1;
  const menu = document.createElement('div');
  menu.id = 'tree-del-menu';
  menu.className = 'tree-del-menu';
  const label = unitName.length > 22 ? unitName.slice(0, 22) + '…' : unitName;
  menu.innerHTML = `
    <div class="tdm-title">DELETE "${label}"</div>
    <button class="tdm-btn" id="tdm-unit">UNIT ONLY</button>
    <button class="tdm-btn tdm-danger" id="tdm-branch">BRANCH (${total} units)</button>
  `;
  document.body.appendChild(menu);
  const r = e.target.getBoundingClientRect();
  menu.style.top  = `${Math.min(r.bottom + 4, window.innerHeight - 120)}px`;
  menu.style.left = `${Math.min(r.left, window.innerWidth - 180)}px`;

  menu.querySelector('#tdm-unit').addEventListener('click', () => {
    menu.remove();
    app.quickDeleteUnit(unitId, unitName);
  });
  menu.querySelector('#tdm-branch').addEventListener('click', () => {
    menu.remove();
    app.deleteBranch(unitId, unitName);
  });

  const closeOutside = (ev) => {
    if (!menu.contains(ev.target)) {
      menu.remove();
      document.removeEventListener('click', closeOutside, true);
    }
  };
  setTimeout(() => document.addEventListener('click', closeOutside, true), 0);
}

function renderTree() {
  const container = document.getElementById('tree-scroll');
  const units = Object.values(st.units);
  const q = treeSearchQuery.trim().toLowerCase();

  document.getElementById('unit-count-badge').textContent = `${units.length} UNITS`;
  if (!units.length) {
    container.innerHTML = `<div class="tree-empty"><span class="tree-empty-icon">⬡</span>NO UNITS LOADED<br><span style="font-size:10px;opacity:0.6">Seed demo or add a unit</span></div>`;
    return;
  }

  const childrenMap = {};
  for (const unit of units) {
    const parent = unit.parent_id || '__root__';
    if (!childrenMap[parent]) childrenMap[parent] = [];
    childrenMap[parent].push(unit);
  }

  // Search: compute visible set (matches + all ancestors)
  let visibleIds = null;
  if (q) {
    visibleIds = new Set();
    units.forEach((u) => {
      const match = u.name.toLowerCase().includes(q) ||
                    u.id.toLowerCase().includes(q) ||
                    (u.type || '').toLowerCase().includes(q) ||
                    (u.echelon || '').toLowerCase().includes(q);
      if (match) {
        visibleIds.add(u.id);
        let pid = u.parent_id;
        while (pid) { visibleIds.add(pid); pid = st.units[pid]?.parent_id; }
      }
    });
  }

  const expanded = treeLoadExp();
  // First-ever load: expand root-level units only (not entire tree)
  const firstLoad = expanded.size === 0 && !q;

  const echelonIcons = { company: '▣', platoon: '▤', squad: '▥', operator: '◌' };

  function highlight(text) {
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q);
    if (idx < 0) return text;
    return text.slice(0, idx) +
      `<mark class="tree-match">${text.slice(idx, idx + q.length)}</mark>` +
      text.slice(idx + q.length);
  }

  function buildNode(unit, depth) {
    if (visibleIds && !visibleIds.has(unit.id)) return null;

    const hasChildren = !!(childrenMap[unit.id]?.length);
    const freshness   = st.freshnessByUnit[unit.id] || 'none';
    // In search mode: always expand visible nodes; otherwise use stored state
    const isExpanded  = q
      ? (childrenMap[unit.id] || []).some((c) => visibleIds?.has(c.id))
      : (firstLoad ? depth === 0 : expanded.has(unit.id));
    const isSelected  = st.selectedId === unit.id;
    const icon        = echelonIcons[unit.echelon] || '◇';

    const node = document.createElement('div');
    node.className = `tree-node ec-${unit.echelon || 'squad'}${isSelected ? ' selected' : ''}`;
    node.dataset.unitId = unit.id;

    const indent = document.createElement('span');
    indent.className = 'tree-indent';
    indent.style.width = `${depth * 14}px`;

    const chevron = document.createElement('span');
    chevron.className = `tree-chevron${hasChildren ? (isExpanded ? ' open' : '') : ' hidden'}`;
    chevron.textContent = '▶';

    const iconEl = document.createElement('span');
    iconEl.className = 'tree-icon';
    iconEl.textContent = icon;

    const lbl = document.createElement('span');
    lbl.className = 'tree-lbl';
    lbl.innerHTML = highlight(unit.name);

    const dot = document.createElement('span');
    dot.className = `tree-status-dot ${getFreshnessClass(freshness)}`;

    const delBtn = document.createElement('button');
    delBtn.className = 'tree-del-btn';
    delBtn.title = hasChildren ? 'Delete unit / branch' : 'Delete unit';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (hasChildren) {
        showTreeDelMenu(e, unit.id, unit.name);
      } else {
        app.quickDeleteUnit(unit.id, unit.name);
      }
    });

    node.appendChild(indent);
    node.appendChild(chevron);
    node.appendChild(iconEl);
    node.appendChild(lbl);
    node.appendChild(dot);
    node.appendChild(delBtn);

    node.addEventListener('click', (e) => {
      if (!e.target.classList.contains('tree-chevron') &&
          !e.target.classList.contains('tree-del-btn')) app.selectUnit(unit.id);
    });

    const frag = document.createDocumentFragment();
    frag.appendChild(node);

    if (hasChildren) {
      const childWrap = document.createElement('div');
      childWrap.className = 'tree-child-group';
      if (!isExpanded) childWrap.style.display = 'none';
      (childrenMap[unit.id] || [])
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((child) => {
          const childFrag = buildNode(child, depth + 1);
          if (childFrag) childWrap.appendChild(childFrag);
        });
      frag.appendChild(childWrap);

      chevron.style.cursor = 'pointer';
      chevron.addEventListener('click', (e) => {
        e.stopPropagation();
        const cur = treeLoadExp();
        const opening = childWrap.style.display === 'none';
        childWrap.style.display = opening ? '' : 'none';
        chevron.classList.toggle('open', opening);
        if (opening) cur.add(unit.id); else cur.delete(unit.id);
        treeSaveExp(cur);
      });
    }

    return frag;
  }

  // Save root-level expanded on first load
  if (firstLoad) {
    const rootUnits = childrenMap['__root__'] || [];
    const initExp = new Set(rootUnits.map((u) => u.id));
    treeSaveExp(initExp);
  }

  const frag = document.createDocumentFragment();
  (childrenMap['__root__'] || [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((unit) => {
      const n = buildNode(unit, 0);
      if (n) frag.appendChild(n);
    });

  container.innerHTML = '';
  container.appendChild(frag);

  // Search match count
  const matchCnt = document.getElementById('tree-search-count');
  if (matchCnt) matchCnt.textContent = q ? `${visibleIds?.size ?? 0} MATCH` : '';
}

function renderDetail() {
  const container = document.getElementById('detail-scroll');
  const badge = document.getElementById('fresh-badge');
  if (!st.selectedId || !st.units[st.selectedId]) {
    container.innerHTML = `
      <div class="detail-empty">
        <div class="detail-empty-icon">◎</div>
        <div>SELECT A UNIT</div>
      </div>
    `;
    badge.textContent = '--';
    return;
  }

  const unit = st.units[st.selectedId];
  const pos = st.selectedPosition;
  const freshness = pos?.state?.freshness || st.freshnessByUnit[unit.id] || 'unknown';
  badge.textContent = freshness.toUpperCase();

  const freshnessValClass = freshness === 'fresh' ? 'd-val-fresh' : freshness === 'stale' ? 'd-val-stale' : freshness === 'lost' ? 'd-val-lost' : '';
  const badgeClass = freshness === 'fresh' ? 'fresh' : freshness === 'stale' ? 'stale' : freshness === 'lost' ? 'lost' : 'unknown';
  const isOperator = unit.echelon === 'operator';
  const operatorPhoto = isOperator ? getOperatorPhoto(unit) : null;
  const operatorAvatarBody = operatorPhoto
    ? `<img class="op-avatar-img" src="${operatorPhoto}" alt="Operator photo">`
    : '<div class="op-avatar-silhouette"></div>';
  const operatorAvatarLabel = operatorPhoto ? 'PHOTO LOADED' : 'NO PHOTO';

  const identityCard = isOperator ? `
    <div class="d-card op-card">
      <div class="op-header">
        <div class="op-avatar-wrap">
          <div class="op-avatar ${operatorPhoto ? 'has-photo' : ''}" title="${operatorPhoto ? 'Operator photo available' : 'No photo available'}">
            ${operatorAvatarBody}
          </div>
          <div class="op-avatar-lbl">${operatorAvatarLabel}</div>
        </div>
        <div class="op-header-info">
          <div class="op-callsign">${unit.name}</div>
          <div class="op-id-row">
            <span class="op-uid">${unit.id}</span>
            <span class="op-status-badge ${badgeClass}">${freshness.toUpperCase()}</span>
          </div>
          <div class="op-meta-grid">
            <div class="op-meta-item">TYPE<span>${unit.type || '--'}</span></div>
            <div class="op-meta-item">STATUS<span>${unit.status || 'active'}</span></div>
            ${unit.parent_id ? `<div class="op-meta-item" style="grid-column:1/-1">UNIT<span>${unit.parent_id}</span></div>` : ''}
          </div>
        </div>
      </div>
      <div class="op-divider"></div>
      <div class="d-rows">
        <div class="d-row"><span class="d-key">Echelon</span><span class="d-val">OPERATOR</span></div>
        <div class="d-row"><span class="d-key">Freshness</span><span class="d-val ${freshnessValClass}">${freshness}</span></div>
      </div>
    </div>
  ` : `
    <div class="d-card">
      <div class="d-card-hdr">Identity</div>
      <div class="d-rows">
        <div class="d-row"><span class="d-key">ID</span><span class="d-val d-val-hi">${unit.id}</span></div>
        <div class="d-row"><span class="d-key">Name</span><span class="d-val">${unit.name}</span></div>
        <div class="d-row"><span class="d-key">Echelon</span><span class="d-val">${unit.echelon}</span></div>
        <div class="d-row"><span class="d-key">Type</span><span class="d-val">${unit.type}</span></div>
        <div class="d-row"><span class="d-key">Status</span><span class="d-val">${unit.status || 'active'}</span></div>
        <div class="d-row"><span class="d-key">Freshness</span><span class="d-val ${freshnessValClass}">${freshness}</span></div>
      </div>
    </div>
  `;

  container.innerHTML = `
    ${identityCard}
    <div class="d-card">
      <div class="d-card-hdr">Actions</div>
      <div class="d-rows">
        <div class="d-row">
          <button class="btn" style="width:100%" onclick="app.openEditUnit()">EDIT UNIT</button>
        </div>
        <div class="d-row">
          <button class="btn" style="width:100%" onclick="window.open('orbat_unit_info.html?id=${unit.id}','_blank')">UNIT INFO ↗</button>
        </div>
        <div class="d-row">
          <button class="btn btn-amber" style="width:100%" onclick="app.deleteSelectedUnit()">DELETE UNIT</button>
        </div>
      </div>
    </div>
    ${pos?.latest ? `
      <div class="d-card">
        <div class="d-card-hdr">Latest Position</div>
        <div class="d-rows">
          <div class="d-row"><span class="d-key">Lat</span><span class="d-val">${pos.latest.lat.toFixed(5)}</span></div>
          <div class="d-row"><span class="d-key">Lon</span><span class="d-val">${pos.latest.lon.toFixed(5)}</span></div>
          <div class="d-row"><span class="d-key">Source</span><span class="d-val">${pos.latest.source}</span></div>
          <div class="d-row"><span class="d-key">Lag</span><span class="d-val">${pos.state?.lag_ms ?? '--'}ms</span></div>
        </div>
      </div>
    ` : ''}
  `;
}

function updateClock() {
  document.getElementById('h-time').textContent = isoClock();
}

/* ══════════════════════════════════════════════════════════════════════════
   LOCAL EVENTS — severity-coloured pin markers persisted in localStorage
══════════════════════════════════════════════════════════════════════════ */
const LocalEvents = (() => {
  const LS_KEY = 'orbat_local_events';
  const _markers = {};

  function _load() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
    catch { return []; }
  }

  function _save(evts) { localStorage.setItem(LS_KEY, JSON.stringify(evts)); }

  function _makeEl(evt) {
    const el = document.createElement('div');
    el.className = `ev-marker ev-sev-${evt.severity}`;
    const sevLabel = evt.severity.toUpperCase();
    el.title = `[${sevLabel}] ${evt.label}${evt.notes ? '\n' + evt.notes : ''}\n${evt.lat.toFixed(5)}, ${evt.lon.toFixed(5)}`;
    el.addEventListener('click', () => {
      const level = evt.severity === 'critical' || evt.severity === 'high' ? 'warn' : 'ok';
      logEvent(sevLabel, `${evt.label} — ${evt.lat.toFixed(4)}, ${evt.lon.toFixed(4)}${evt.notes ? ' | ' + evt.notes : ''}`, level);
    });
    return el;
  }

  function render() {
    if (!map) return;
    Object.values(_markers).forEach((m) => m.remove());
    Object.keys(_markers).forEach((k) => delete _markers[k]);
    const evts = _load();
    evts.forEach((evt) => {
      const el = _makeEl(evt);
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([evt.lon, evt.lat])
        .addTo(map);
      _markers[evt.id] = marker;
    });
    const badge = document.getElementById('ev-count');
    if (badge) badge.textContent = String(evts.length);
  }

  function enableMapPick() {
    if (!map) return;
    app.closeModal('add-event');
    notify('Click on map to set event location', '');
    map.getCanvas().style.cursor = 'crosshair';
    map.once('click', (e) => {
      map.getCanvas().style.cursor = '';
      document.getElementById('ae-lat').value = e.lngLat.lat.toFixed(6);
      document.getElementById('ae-lon').value = e.lngLat.lng.toFixed(6);
      app.openModal('add-event');
    });
  }

  function submitAdd() {
    const label = (document.getElementById('ae-label').value || '').trim();
    const lat = parseFloat(document.getElementById('ae-lat').value);
    const lon = parseFloat(document.getElementById('ae-lon').value);
    const severity = document.getElementById('ae-severity').value;
    const notes = (document.getElementById('ae-notes').value || '').trim();

    if (!label) { notify('Label is required', 'err'); return; }
    if (isNaN(lat) || isNaN(lon)) { notify('Valid lat/lon required', 'err'); return; }

    const evts = _load();
    evts.push({ id: `ev-${Date.now()}`, label, lat, lon, severity, notes, ts: Date.now() });
    _save(evts);
    render();
    app.closeModal('add-event');
    document.getElementById('ae-label').value = '';
    document.getElementById('ae-notes').value = '';
    const level = severity === 'critical' || severity === 'high' ? 'warn' : 'ok';
    logEvent('EVENT', `${label} (${severity.toUpperCase()}) added`, level);
    notify(`Event "${label}" added`, 'ok');
  }

  function importCsv(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const lines = e.target.result.split(/\r?\n/).filter((l) => l.trim());
      const evts = _load();
      let added = 0;
      lines.forEach((line, i) => {
        if (i === 0 && /label/i.test(line.split(',')[0])) return; // skip header
        const parts = line.split(',').map((s) => s.trim());
        const [label, latStr, lonStr, severity = 'medium', notes = ''] = parts;
        const lat = parseFloat(latStr), lon = parseFloat(lonStr);
        if (!label || isNaN(lat) || isNaN(lon)) return;
        evts.push({ id: `ev-${Date.now()}-${i}`, label, lat, lon, severity: severity || 'medium', notes, ts: Date.now() });
        added++;
      });
      _save(evts);
      render();
      notify(`${added} event(s) imported`, 'ok');
      logEvent('EVENT', `CSV import: ${added} events`, 'ok');
      input.value = '';
    };
    reader.readAsText(file);
  }

  return { render, enableMapPick, submitAdd, importCsv };
})();

const app = {
  init() {
    applyResponsiveMode();
    window.addEventListener('resize', applyResponsiveMode);
    window.addEventListener('online', () => this.checkApi());
    window.addEventListener('offline', () => updateApiStatus(false, 'Offline mode active'));

    document.getElementById('btn-toc').addEventListener('click', () => this.togglePanel('left'));
    document.getElementById('btn-map').addEventListener('click', () => this.togglePanel('map'));
    document.getElementById('btn-detail').addEventListener('click', () => this.togglePanel('right'));

    initPanelResize();
    initMap();
    updateClock();
    setInterval(updateClock, 1000);
    setInterval(() => this.checkApi(), 8000);
    setInterval(() => this.refreshGeo(), 5000);
  },

  togglePanel(target) {
    const root = document.getElementById('app');
    if (st.uiMode === 'desktop') return;
    root.classList.remove('show-left', 'show-right');
    if (target === 'left') root.classList.toggle('show-left');
    if (target === 'right') root.classList.toggle('show-right');
    if (target === 'map') root.classList.remove('show-left', 'show-right');
  },

  async checkApi() {
    try {
      await api.listUnits();
      updateApiStatus(true, 'ONLINE');
    } catch (err) {
      updateApiStatus(false, `API unavailable (${err.message})`);
    }
  },

  async refresh() {
    try {
      await this.checkApi();
      const { data: units } = await api.listUnits();
      st.units = Object.fromEntries(units.map((u) => [u.id, u]));
      renderTree();
      await this.refreshGeo();
      await this.refreshEvents();
      logEvent('SYS', `Units synced (${units.length})`, 'ok');
    } catch (err) {
      logEvent('ERR', `Refresh failed: ${err.message}`, 'err');
      notify(`Refresh failed: ${err.message}`, 'err');
    }
  },

  async refreshGeo() {
    if (!map || !map.isStyleLoaded()) return;
    const zoom = Math.round(map.getZoom());
    const bbox = currentBBox();
    const started = performance.now();
    try {
      const { data, elapsedMs } = await api.getGeoFeatures(zoom, bbox);
      st.geoFeatures = data.features || [];
      st.lastGeoLatencyMs = elapsedMs;
      updateMapFeatures();
      renderTree();
      st.lastRenderLatencyMs = Math.round(performance.now() - started);
    } catch (err) {
      logEvent('ERR', `Geo fetch failed: ${err.message}`, 'err');
      updateApiStatus(false, `Geo endpoint error (${err.message})`);
    }
  },

  async refreshEvents() {
    if (!map || !map.isStyleLoaded()) return;
    const bbox = currentBBox();
    const zoom = Math.round(map.getZoom());
    try {
      const { data } = await api.getGeoEvents(zoom, bbox);
      st.geoEvents = data.features || [];
      updateMapEvents();
    } catch (err) {
      logEvent('ERR', `Geo events failed: ${err.message}`, 'warn');
    }
  },

  async selectUnit(unitId) {
    st.selectedId = unitId;
    try {
      const { data } = await api.getPositions(unitId);
      st.selectedPosition = data;
      if (data?.latest) {
        map.flyTo({ center: [data.latest.lon, data.latest.lat], zoom: Math.max(14, map.getZoom()), duration: 550 });
      } else {
        logEvent('TRK', `No track for ${unitId}`, 'warn');
      }
      logEvent('SEL', `Unit selected ${unitId}`, 'ok');
    } catch {
      st.selectedPosition = null;
      logEvent('SEL', `Unit selected ${unitId} (no track data)`);
    }
    renderTree();
    renderDetail();
  },

  openModal(name) {
    if (name === 'ingest' && st.selectedId) {
      document.getElementById('ip-uid').value = st.selectedId;
    }
    if (name === 'add-unit') {
      st.pickCoordsMode = false;
    }
    if (name === 'ingest') {
      st.pickCoordsMode = false;
    }
    document.getElementById(`m-${name}`).style.display = 'flex';
  },

  closeModal(name) {
    if (name === 'add-unit') {
      st.pickCoordsMode = false;
    }
    if (name === 'ingest') {
      st.pickCoordsMode = false;
    }
    document.getElementById(`m-${name}`).style.display = 'none';
  },

  enableMapPick(target = 'add-unit') {
    st.pickCoordsMode = true;
    st.pickTarget = target;
    if (target === 'ingest') {
      st.ingestDraftId = null;
    } else {
      st.unitDraftId = null;
    }
    const modalId = target === 'ingest' ? 'm-ingest' : 'm-add-unit';
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'none';
    notify(`Click map to set coordinates for ${target}`);
    logEvent('GEO', `Map click mode enabled for ${target} coordinates`);
  },

  openEditUnit() {
    if (!st.selectedId || !st.units[st.selectedId]) {
      notify('Select a unit first', 'warn');
      return;
    }
    const unit = st.units[st.selectedId];
    document.getElementById('eu-id').value = unit.id;
    document.getElementById('eu-name').value = unit.name || '';
    document.getElementById('eu-type').value = unit.type || '';
    document.getElementById('eu-echelon').value = unit.echelon || '';
    document.getElementById('eu-status').value = unit.status || '';
    document.getElementById('eu-parent').value = unit.parent_id || '';
    this.openModal('edit-unit');
  },

  async submitEditUnit() {
    const unitId = document.getElementById('eu-id').value.trim();
    const payload = {
      name: document.getElementById('eu-name').value.trim() || null,
      type: document.getElementById('eu-type').value.trim() || null,
      echelon: document.getElementById('eu-echelon').value.trim() || null,
      status: document.getElementById('eu-status').value.trim() || null,
      parent_unit_id: document.getElementById('eu-parent').value.trim() || null,
    };
    try {
      await api.patchUnitV1(unitId, payload);
      this.closeModal('edit-unit');
      notify(`Unit ${unitId} updated`);
      logEvent('UNIT', `Updated ${unitId}`, 'ok');
      await this.refresh();
    } catch (err) {
      notify(err.message, 'err');
      logEvent('ERR', `Update unit failed: ${err.message}`, 'err');
    }
  },

  async deleteSelectedUnit() {
    if (!st.selectedId) { notify('Select a unit first', 'warn'); return; }
    const unit = st.units[st.selectedId];
    const hasKids = Object.values(st.units).some((u) => u.parent_id === st.selectedId);
    if (hasKids) {
      showTreeDelMenu({ target: { getBoundingClientRect: () => ({ bottom: window.innerHeight / 2, left: window.innerWidth / 2 }) } }, st.selectedId, unit?.name || st.selectedId);
    } else {
      await this.quickDeleteUnit(st.selectedId, unit?.name || st.selectedId);
    }
  },

  async quickDeleteUnit(unitId, unitName) {
    try {
      await api.deleteUnitV1(unitId);
      delete st.units[unitId];
      if (st.selectedId === unitId) { st.selectedId = null; st.selectedPosition = null; renderDetail(); }
      renderTree();
      await this.refreshGeo();
      notify(`"${unitName || unitId}" deleted`, 'ok');
      logEvent('UNIT', `Deleted ${unitId}`, 'ok');
    } catch (err) {
      notify(err.message, 'err');
      logEvent('ERR', `Delete unit failed: ${err.message}`, 'err');
    }
  },

  async deleteBranch(rootId, rootName) {
    const ids = [];
    function collect(id) {
      Object.values(st.units).filter((u) => u.parent_id === id).forEach((u) => collect(u.id));
      ids.push(id);
    }
    collect(rootId);
    let deleted = 0;
    for (const id of ids) {
      try { await api.deleteUnitV1(id); delete st.units[id]; deleted++; } catch { /* continue */ }
    }
    if (st.selectedId && !st.units[st.selectedId]) { st.selectedId = null; st.selectedPosition = null; renderDetail(); }
    renderTree();
    await this.refreshGeo();
    notify(`Branch "${rootName || rootId}" deleted (${deleted} units)`, 'ok');
    logEvent('UNIT', `Branch deleted: ${rootId} — ${deleted} units`, 'warn');
  },

  confirmClearOrbat() {
    const count = Object.keys(st.units).length;
    if (!count) { notify('No units to delete', 'warn'); return; }
    document.getElementById('clear-orbat-count').textContent = String(count);
    document.getElementById('clear-orbat-input').value = '';
    document.getElementById('clear-orbat-ok').disabled = true;
    this.openModal('clear-orbat');
  },

  async clearOrbat() {
    const ids = Object.keys(st.units);
    let deleted = 0;
    for (const id of ids) {
      try { await api.deleteUnitV1(id); delete st.units[id]; deleted++; } catch { /* continue */ }
    }
    st.selectedId = null; st.selectedPosition = null;
    renderTree(); renderDetail();
    await this.refreshGeo();
    this.closeModal('clear-orbat');
    notify(`ORBAT cleared — ${deleted} unit(s) deleted`, 'ok');
    logEvent('SYS', `ORBAT cleared: ${deleted} units`, 'warn');
  },

  async submitUnit() {
    const id = document.getElementById('au-id').value.trim();
    const name = document.getElementById('au-name').value.trim();
    const echelon = document.getElementById('au-echelon').value;
    const type = document.getElementById('au-type').value;
    const parent = document.getElementById('au-parent').value.trim() || null;
    const lat = Number(document.getElementById('au-lat').value);
    const lon = Number(document.getElementById('au-lon').value);
    const addressText = document.getElementById('au-address').value.trim() || null;
    const geocodeConfidence = Number(document.getElementById('au-geoc').value || '0');
    if (!id || !name) {
      notify('ID and Name are required', 'err');
      return;
    }
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      notify('Coordinates are required (set manually or via map click)', 'err');
      return;
    }
    try {
      let draftId = st.unitDraftId;
      if (!draftId) {
        const { data: draft } = await api.createUnitDraft({
          name,
          parent_unit_id: parent,
          lat,
          lon,
          address_text: addressText,
          geocode_confidence: geocodeConfidence,
        });
        draftId = draft.id;
      }
      await api.createUnitV1({
        id,
        name,
        type,
        echelon,
        status: 'active',
        parent_unit_id: parent,
        draft_id: draftId,
      });
      this.closeModal('add-unit');
      st.unitDraftId = null;
      notify(`Unit ${id} created`);
      logEvent('UNIT', `Created ${id} draft=${draftId}`, 'ok');
      await this.refresh();
    } catch (err) {
      notify(err.message, 'err');
      logEvent('ERR', `Create unit failed: ${err.message}`, 'err');
    }
  },

  async submitIngest() {
    const uid = document.getElementById('ip-uid').value.trim();
    const latRaw = document.getElementById('ip-lat').value.trim();
    const lonRaw = document.getElementById('ip-lon').value.trim();
    const addressHint = document.getElementById('ip-address').value.trim();
    let lat = latRaw === '' ? null : parseFloat(latRaw);
    let lon = lonRaw === '' ? null : parseFloat(lonRaw);
    const accuracy = Number(document.getElementById('ip-acc').value || '5');
    const source = document.getElementById('ip-src').value;

    if (!uid) {
      notify('Unit ID is required', 'err');
      return;
    }

    try {
      if ((lat === null || lon === null) && addressHint) {
        const { data: geocode } = await api.forwardGeocode({ query: addressHint, locale: 'es' });
        if (typeof geocode.lat === 'number' && typeof geocode.lon === 'number') {
          lat = geocode.lat;
          lon = geocode.lon;
          document.getElementById('ip-lat').value = String(lat);
          document.getElementById('ip-lon').value = String(lon);
          logEvent('GEO', `Forward geocode resolved for ingest (${lat.toFixed(5)},${lon.toFixed(5)})`, 'ok');
        }
      }

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        notify('Lat/Lon are required. Use map click or a valid address.', 'err');
        return;
      }

      const started = performance.now();
      const { data } = await api.ingestPosition({
        unit_id: uid,
        ts: new Date().toISOString(),
        lat,
        lon,
        accuracy,
        source,
      });
      await this.refreshGeo();
      const renderMs = Math.round(performance.now() - started);
      st.lastRenderLatencyMs = renderMs;
      document.getElementById('s-render').textContent = `${renderMs}ms`;
      this.closeModal('ingest');
      st.ingestDraftId = null;
      notify(`Position ingested (${data.ingest_to_publish_ms}ms)`);
      logEvent('POS', `${uid} ingested | ingest:${data.ingest_to_publish_ms}ms render:${renderMs}ms`, 'ok');
      if (st.selectedId === uid) await this.selectUnit(uid);
    } catch (err) {
      notify(err.message, 'err');
      logEvent('ERR', `Ingest failed: ${err.message}`, 'err');
    }
  },

  async seedDemo() {
    const units = [
      { id: 'ALPHA-CMD', name: 'Alpha Command', type: 'command', echelon: 'company', status: 'active', parent_id: null },
      { id: 'ALPHA-1', name: 'Alpha Section 1', type: 'security', echelon: 'platoon', status: 'active', parent_id: 'ALPHA-CMD' },
      { id: 'ALPHA-2', name: 'Alpha Section 2', type: 'surveillance', echelon: 'platoon', status: 'active', parent_id: 'ALPHA-CMD' },
      { id: 'OP-001', name: 'Op Torres', type: 'security', echelon: 'operator', status: 'active', parent_id: 'ALPHA-1' },
      { id: 'OP-002', name: 'Op Sanz', type: 'surveillance', echelon: 'operator', status: 'active', parent_id: 'ALPHA-2' },
    ];

    for (const unit of units) {
      try {
        await api.createUnit(unit);
      } catch (err) {
        if (err.status !== 409) throw err;
      }
    }

    const positions = [
      { unit_id: 'ALPHA-CMD', lat: 40.4168, lon: -3.7038, source: 'manual' },
      { unit_id: 'ALPHA-1', lat: 40.4201, lon: -3.7001, source: 'bodycam' },
      { unit_id: 'ALPHA-2', lat: 40.4145, lon: -3.7091, source: 'bodycam' },
      { unit_id: 'OP-001', lat: 40.4212, lon: -3.6991, source: 'bodycam' },
      { unit_id: 'OP-002', lat: 40.4132, lon: -3.7102, source: 'bodycam' },
    ];

    for (const point of positions) {
      await api.ingestPosition({
        unit_id: point.unit_id,
        ts: new Date().toISOString(),
        lat: point.lat,
        lon: point.lon,
        accuracy: 5,
        source: point.source,
      });
    }

    notify('Demo data loaded');
    logEvent('SYS', 'Demo data seeded', 'ok');
    await this.refresh();
  },
};

// ── Bookmark name popup (FNP) ──────────────────────────────────────────────
const FavNamePopup = {
  _resolve: null,
  _lngLat: null,

  _cats() { return MarkerSidebar._loadCats(); },

  _render(defaultRisk) {
    const cats = this._cats();
    const riskEl = document.getElementById('fnp-risk');
    if (riskEl) {
      riskEl.innerHTML = cats.map((c) => `
        <span class="fnp-risk-dot${c.id === defaultRisk ? ' active' : ''}" data-risk="${c.id}" onclick="FavNamePopup._selectRisk('${c.id}')">
          <span class="fnp-dot" style="background:${c.color}"></span>${c.label}
        </span>`).join('');
    }
  },

  _selectRisk(id) {
    document.querySelectorAll('.fnp-risk-dot').forEach((d) => d.classList.toggle('active', d.dataset.risk === id));
  },

  _activeRisk() {
    const active = document.querySelector('.fnp-risk-dot.active');
    return active ? active.dataset.risk : (this._cats()[0]?.id || 'clear');
  },

  // Show at a pixel position inside #map-wrap. Returns Promise<{name,risk}|null>
  show(pixelX, pixelY, defaultName = '') {
    return new Promise((resolve) => {
      this._resolve = resolve;
      const popup = document.getElementById('fnp');
      const mapEl = document.getElementById('map-wrap');
      this._render('clear');
      document.getElementById('fnp-input').value = defaultName;
      popup.style.display = 'block';
      // Position
      let x = pixelX + 12;
      let y = pixelY - 10;
      const W = 220, H = 170;
      if (x + W > mapEl.offsetWidth)  x = pixelX - W - 12;
      if (y + H > mapEl.offsetHeight) y = pixelY - H;
      if (y < 4) y = 4;
      if (x < 4) x = 4;
      popup.style.left = `${x}px`;
      popup.style.top  = `${y}px`;
      setTimeout(() => document.getElementById('fnp-input').focus(), 40);
    });
  },

  // Show centred in the map (for "save current view")
  showCentered(defaultName = '') {
    const mapEl = document.getElementById('map-wrap');
    const cx = mapEl.offsetWidth / 2;
    const cy = mapEl.offsetHeight / 2;
    return this.show(cx - 110 + 12, cy - 85, defaultName);
  },

  confirm() {
    const name = document.getElementById('fnp-input').value.trim();
    if (!name) { document.getElementById('fnp-input').focus(); return; }
    const risk = this._activeRisk();
    document.getElementById('fnp').style.display = 'none';
    if (this._resolve) { this._resolve({ name, risk }); this._resolve = null; }
  },

  cancel() {
    document.getElementById('fnp').style.display = 'none';
    if (this._resolve) { this._resolve(null); this._resolve = null; }
  },

  init() {
    document.getElementById('fnp-close').addEventListener('click', () => this.cancel());
    document.getElementById('fnp-cancel').addEventListener('click', () => this.cancel());
    document.getElementById('fnp-save').addEventListener('click', () => this.confirm());
    document.getElementById('fnp-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.confirm();
      if (e.key === 'Escape') this.cancel();
    });
  },
};

// ── Bookmarks / Favorites ─────────────────────────────────────────────────
const Favorites = {
  _KEY: 'orbat_favorites_v1',
  _pickMode: false,
  _markers: {},

  _load() {
    try { return JSON.parse(localStorage.getItem(this._KEY) || '[]'); } catch { return []; }
  },
  _save(list) { localStorage.setItem(this._KEY, JSON.stringify(list)); },

  open() {
    this.renderList();
    document.getElementById('m-favorites').style.display = 'flex';
  },
  close() { document.getElementById('m-favorites').style.display = 'none'; },

  async addCurrentView() {
    const center = map.getCenter();
    const result = await FavNamePopup.showCentered(`Bookmark ${isoClock()}`);
    if (!result) return;
    this._add(result.name, center.lng, center.lat, result.risk);
  },

  enableMapPick() {
    this.close();
    this._pickMode = true;
    map.getCanvas().classList.add('drawing-cursor');
    notify('Click on the map to place a bookmark');
    logEvent('FAV', 'Map click mode for bookmark');
  },

  // Called from the marker sidebar + button
  startPickForSidebar() {
    MarkerSidebar.close();
    this.enableMapPick();
  },

  // Returns true if click was consumed
  async handleMapClick(event) {
    if (!this._pickMode) return false;
    this._pickMode = false;
    map.getCanvas().classList.remove('drawing-cursor');
    const px = map.project(event.lngLat);
    const result = await FavNamePopup.show(px.x, px.y, `Bookmark ${isoClock()}`);
    if (result && result.name) {
      this._add(result.name, event.lngLat.lng, event.lngLat.lat, result.risk);
      MarkerSidebar.render();
    } else if (result === null) {
      notify('Bookmark cancelled', 'warn');
    }
    return true;
  },

  _add(name, lng, lat, risk = 'clear') {
    const list = this._load();
    const fav = { id: `fav_${Date.now()}`, name, lng, lat, risk };
    list.push(fav);
    this._save(list);
    this._addMarker(fav);
    this.renderList();
    MarkerSidebar.render();
    notify(`Bookmark "${name}" saved`, 'ok');
    logEvent('FAV', `Saved: ${name} (${lat.toFixed(4)},${lng.toFixed(4)})`);
  },

  remove(id) {
    let list = this._load();
    const fav = list.find((f) => f.id === id);
    this._save(list.filter((f) => f.id !== id));
    this._removeMarker(id);
    this.renderList();
    MarkerSidebar.render();
    if (fav) notify(`Bookmark "${fav.name}" removed`);
  },

  setRisk(id, risk) {
    const list = this._load();
    const fav = list.find((f) => f.id === id);
    if (!fav) return;
    fav.risk = risk;
    this._save(list);
    // Update marker class
    const marker = this._markers[id];
    if (marker) {
      const el = marker.getElement();
      el.className = `fav-marker${risk !== 'clear' ? ` risk-${risk}` : ''}`;
    }
    MarkerSidebar.render();
  },

  _addMarker(fav) {
    const el = document.createElement('div');
    const risk = fav.risk || 'clear';
    el.className = `fav-marker${risk !== 'clear' ? ` risk-${risk}` : ''}`;
    el.innerHTML = '<span>★</span>';
    el.title = fav.name;
    const catColor = MarkerSidebar._loadCats().find((c) => c.id === risk)?.color || null;
    const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 20 })
      .setHTML(`
        <div class="fav-popup">
          <div class="fav-popup-name" style="${catColor ? `color:${catColor}` : ''}">${fav.name}</div>
          <div class="fav-popup-coords">${fav.lat.toFixed(5)}, ${fav.lng.toFixed(5)}</div>
          <button type="button" class="fav-popup-del" onclick="Favorites.remove('${fav.id}')">✕ REMOVE</button>
        </div>`);
    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([fav.lng, fav.lat])
      .setPopup(popup)
      .addTo(map);
    this._markers[fav.id] = marker;
  },

  _removeMarker(id) {
    if (this._markers[id]) { this._markers[id].remove(); delete this._markers[id]; }
  },

  renderList() {
    const container = document.getElementById('fav-list');
    if (!container) return;
    const list = this._load();
    if (!list.length) {
      container.innerHTML = '<div class="fav-empty">No bookmarks saved</div>';
      return;
    }
    const cats = MarkerSidebar._loadCats();
    container.innerHTML = list.map((f) => {
      const cat = cats.find((c) => c.id === (f.risk || 'clear'));
      const dot = cat ? `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${cat.color};margin-right:4px;flex-shrink:0"></span>` : '';
      return `
        <div class="fav-item" onclick="map.flyTo({center:[${f.lng},${f.lat}],zoom:Math.max(14,map.getZoom()),duration:500})">
          <span class="fav-star">★</span>
          <div class="fav-info">
            <div class="fav-name">${dot}${f.name}</div>
            <div class="fav-coords">${f.lat.toFixed(5)}, ${f.lng.toFixed(5)}</div>
          </div>
          <button type="button" class="fav-del" onclick="event.stopPropagation();Favorites.remove('${f.id}')">✕</button>
        </div>`;
    }).join('');
  },

  // Import bookmarks from CSV: name,lat,lon,category
  importCsv(csvText) {
    const lines = csvText.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
    const start = lines[0]?.toLowerCase().startsWith('name') ? 1 : 0;
    const validCats = new Set(MarkerSidebar._loadCats().map((c) => c.id));
    let count = 0;
    lines.slice(start).forEach((line) => {
      const [name, lat, lon, category = ''] = line.split(',').map((s) => s.trim());
      if (!name || isNaN(+lat) || isNaN(+lon)) return;
      const cat = category.toLowerCase();
      const risk = validCats.has(cat) ? cat : 'clear';
      const fav = { id: `fav_${Date.now()}_${count}`, name, lng: +lon, lat: +lat, risk };
      const list = this._load();
      list.push(fav);
      this._save(list);
      this._addMarker(fav);
      count++;
    });
    this.renderList();
    MarkerSidebar.render();
    if (count) notify(`${count} bookmark(s) imported`, 'ok');
    else notify('No valid rows found in CSV', 'warn');
  },

  init() {
    this._load().forEach((fav) => this._addMarker(fav));
    FavNamePopup.init();
  },
};
window.Favorites = Favorites;
window.MapWidgets = MapWidgets;
window.notify = notify;
window.logEvent = logEvent;
window.api = api;

// ── Marker Sidebar ────────────────────────────────────────────────────────
const MarkerSidebar = {
  _CATS_KEY: 'orbat_cats_v1',
  _DEFAULT_CATS: [
    { id: 'clear',    label: 'CLEAR',    color: '#8899aa' },
    { id: 'watch',    label: 'WATCH',    color: '#3cb8e8' },
    { id: 'elevated', label: 'ELEVATED', color: '#ffaa33' },
    { id: 'high',     label: 'HIGH',     color: '#ff7733' },
    { id: 'critical', label: 'CRITICAL', color: '#ff3b52' },
  ],

  _loadCats() {
    try {
      const stored = JSON.parse(localStorage.getItem(this._CATS_KEY) || 'null');
      return stored && stored.length ? stored : JSON.parse(JSON.stringify(this._DEFAULT_CATS));
    } catch { return JSON.parse(JSON.stringify(this._DEFAULT_CATS)); }
  },
  _saveCats(cats) { localStorage.setItem(this._CATS_KEY, JSON.stringify(cats)); },

  open() {
    document.getElementById('marker-sidebar').classList.add('open');
    document.getElementById('msb-open-btn')?.classList.add('active');
    this.render();
  },
  close() {
    document.getElementById('marker-sidebar').classList.remove('open');
    document.getElementById('msb-open-btn')?.classList.remove('active');
  },
  toggle() {
    const sb = document.getElementById('marker-sidebar');
    if (sb.classList.contains('open')) this.close(); else this.open();
  },

  showTab(tab) {
    document.getElementById('msb-view-list').classList.toggle('msb-hidden', tab !== 'list');
    document.getElementById('msb-view-cfg').classList.toggle('msb-hidden', tab !== 'cfg');
    document.getElementById('msb-tab-list').classList.toggle('msb-tab-active', tab === 'list');
    document.getElementById('msb-tab-cfg').classList.toggle('msb-tab-active', tab === 'cfg');
    if (tab === 'cfg') this.renderConfig();
    if (tab === 'list') this.render();
  },

  render() {
    const el = document.getElementById('msb-view-list');
    if (!el) return;
    const favs  = Favorites._load();
    const cats  = this._loadCats();
    if (!favs.length) {
      el.innerHTML = '<div class="msb-empty">No bookmarks saved<br><span style="font-size:9px;opacity:0.6">Use + BOOKMARK to add one</span></div>';
      return;
    }
    // Group favs by risk category (preserving category order)
    const html = [];
    cats.forEach((cat) => {
      const group = favs.filter((f) => (f.risk || 'clear') === cat.id);
      if (!group.length) return;
      html.push(`<div class="msb-cat-hdr">
        <span class="msb-cat-dot" style="background:${cat.color}"></span>
        ${cat.label}
        <span class="msb-cat-count">${group.length}</span>
      </div>`);
      group.forEach((f) => {
        html.push(`<div class="msb-fav-item" onclick="map.flyTo({center:[${f.lng},${f.lat}],zoom:Math.max(15,map.getZoom()),duration:500})">
          <span class="msb-fav-risk" style="background:${cat.color}"></span>
          <span class="msb-fav-name" title="${f.name}">${f.name}</span>
          <span class="msb-fav-coords">${f.lat.toFixed(4)},${f.lng.toFixed(4)}</span>
          <button class="msb-fav-del" onclick="event.stopPropagation();Favorites.remove('${f.id}')" title="Remove">✕</button>
        </div>`);
      });
    });
    // Uncategorized (risk not in any cat)
    const knownIds = new Set(cats.map((c) => c.id));
    const other = favs.filter((f) => !knownIds.has(f.risk || 'clear'));
    if (other.length) {
      html.push(`<div class="msb-cat-hdr"><span class="msb-cat-dot" style="background:#555"></span>OTHER<span class="msb-cat-count">${other.length}</span></div>`);
      other.forEach((f) => {
        html.push(`<div class="msb-fav-item" onclick="map.flyTo({center:[${f.lng},${f.lat}],zoom:Math.max(15,map.getZoom()),duration:500})">
          <span class="msb-fav-risk" style="background:#555"></span>
          <span class="msb-fav-name">${f.name}</span>
          <span class="msb-fav-coords">${f.lat.toFixed(4)},${f.lng.toFixed(4)}</span>
          <button class="msb-fav-del" onclick="event.stopPropagation();Favorites.remove('${f.id}')">✕</button>
        </div>`);
      });
    }
    el.innerHTML = html.join('');
  },

  renderConfig() {
    const el = document.getElementById('msb-view-cfg');
    if (!el) return;
    const cats = this._loadCats();
    const rows = cats.map((c, i) => `
      <div class="msb-cfg-row" data-idx="${i}">
        <input type="color" class="msb-cfg-color" value="${c.color}"
          oninput="MarkerSidebar._updateCatColor(${i}, this.value)">
        <input type="text" class="msb-cfg-name" value="${c.label}" maxlength="16"
          oninput="MarkerSidebar._updateCatLabel(${i}, this.value)">
        <button class="msb-cfg-del" onclick="MarkerSidebar._deleteCat(${i})" title="Delete">✕</button>
      </div>`).join('');
    el.innerHTML = rows + `<button class="msb-cfg-add" onclick="MarkerSidebar._addCat()">+ ADD CATEGORY</button>`;
  },

  _updateCatColor(idx, color) {
    const cats = this._loadCats();
    if (cats[idx]) { cats[idx].color = color; this._saveCats(cats); this.render(); }
  },
  _updateCatLabel(idx, label) {
    const cats = this._loadCats();
    if (cats[idx]) { cats[idx].label = label.toUpperCase(); this._saveCats(cats); }
  },
  _deleteCat(idx) {
    const cats = this._loadCats();
    cats.splice(idx, 1);
    this._saveCats(cats);
    this.renderConfig();
    this.render();
  },
  _addCat() {
    const cats = this._loadCats();
    const id = `cat_${Date.now()}`;
    cats.push({ id, label: 'NEW', color: '#aaaaaa' });
    this._saveCats(cats);
    this.renderConfig();
  },

  init() { /* nothing needed at init time */ },
};
window.MarkerSidebar = MarkerSidebar;

// ── OGC Services ─────────────────────────────────────────────────────────
const OgcServices = {
  _KEY: 'orbat_ogc_v1',

  _load() {
    try { return JSON.parse(localStorage.getItem(this._KEY) || '[]'); } catch { return []; }
  },
  _save(list) { localStorage.setItem(this._KEY, JSON.stringify(list)); },

  open() {
    // Reset caps state each time modal opens
    const statusEl = document.getElementById('ogc-caps-status');
    if (statusEl) { statusEl.style.display = 'none'; statusEl.textContent = ''; }
    const sel = document.getElementById('ogc-layer-select');
    if (sel) { sel.style.display = 'none'; sel.innerHTML = ''; }
    const inp = document.getElementById('ogc-layers');
    if (inp) inp.style.display = '';
    const capsBtn = document.getElementById('ogc-caps-btn');
    if (capsBtn) { capsBtn.disabled = false; capsBtn.textContent = '⬇ GET CAPABILITIES'; }
    this.renderList();
    document.getElementById('m-ogc').style.display = 'flex';
  },
  close() { document.getElementById('m-ogc').style.display = 'none'; },

  onTypeChange() {
    const type = document.getElementById('ogc-type').value;
    const lbl = document.getElementById('ogc-layers-lbl');
    const layerBlock = document.getElementById('ogc-layer-block');
    const layerInp = document.getElementById('ogc-layers');
    const capsBtn = document.getElementById('ogc-caps-btn');
    const statusEl = document.getElementById('ogc-caps-status');

    if (type === 'xyz') {
      // XYZ: full tile URL in the Service URL field — no layer name or GetCaps
      capsBtn.style.display = 'none';
      layerBlock.querySelector('.form-group').style.display = 'none'; // hide layer name row
    } else {
      capsBtn.style.display = '';
      layerBlock.querySelector('.form-group').style.display = '';
      lbl.textContent = type === 'wmts' ? 'Layer Identifier' : 'Layer name(s)';
    }

    // Reset caps state on type change
    statusEl.style.display = 'none';
    document.getElementById('ogc-layer-select').style.display = 'none';
    layerInp.style.display = '';
  },

  async getCapabilities() {
    const type = document.getElementById('ogc-type').value;
    const url  = document.getElementById('ogc-url').value.trim();
    if (!url) { notify('Enter a service URL first', 'err'); return; }
    if (type === 'xyz') { notify('GetCapabilities does not apply to XYZ/TMS', 'warn'); return; }

    const base = url.replace(/\?.*$/, '');
    const capUrl = type === 'wmts'
      ? `${base}?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetCapabilities`
      : `${base}?SERVICE=WMS&REQUEST=GetCapabilities`;

    const btn = document.getElementById('ogc-caps-btn');
    const statusEl = document.getElementById('ogc-caps-status');
    btn.disabled = true;
    btn.textContent = '…';
    statusEl.style.display = '';
    statusEl.className = 'ogc-caps-status loading';
    statusEl.textContent = 'Fetching capabilities…';

    try {
      const resp = await fetch(capUrl);
      if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
      const text = await resp.text();
      const doc = new DOMParser().parseFromString(text, 'application/xml');
      if (doc.querySelector('parsererror')) throw new Error('Invalid XML in response');

      let layers = [];
      if (type === 'wms') {
        doc.querySelectorAll('Layer').forEach((l) => {
          const nameEl = l.querySelector(':scope > Name');
          const titleEl = l.querySelector(':scope > Title');
          if (nameEl && nameEl.textContent.trim()) {
            layers.push({
              name: nameEl.textContent.trim(),
              title: (titleEl?.textContent.trim() || nameEl.textContent.trim()),
            });
          }
        });
      } else {
        // WMTS — Identifier may be prefixed with namespace
        doc.querySelectorAll('Layer').forEach((l) => {
          const idEl = l.querySelector('Identifier') || l.querySelector('*|Identifier');
          const titleEl = l.querySelector('Title') || l.querySelector('*|Title');
          if (idEl && idEl.textContent.trim()) {
            layers.push({
              name: idEl.textContent.trim(),
              title: (titleEl?.textContent.trim() || idEl.textContent.trim()),
            });
          }
        });
      }

      if (!layers.length) throw new Error('No named layers found in capabilities');

      this._populateLayerSelect(layers);
      statusEl.className = 'ogc-caps-status ok';
      statusEl.textContent = `✔ ${layers.length} layer(s) available — select below`;
      logEvent('OGC', `GetCapabilities OK: ${layers.length} layers from ${base}`);
    } catch (err) {
      statusEl.className = 'ogc-caps-status err';
      statusEl.textContent = `✕ ${err.message} — enter layer name manually`;
      // Keep manual input visible as fallback
      document.getElementById('ogc-layer-select').style.display = 'none';
      document.getElementById('ogc-layers').style.display = '';
      logEvent('ERR', `GetCapabilities failed: ${err.message}`, 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = 'GET CAPS';
    }
  },

  _populateLayerSelect(layers) {
    const sel = document.getElementById('ogc-layer-select');
    const inp = document.getElementById('ogc-layers');
    sel.innerHTML = layers.map((l) =>
      `<option value="${l.name}">${l.title}${l.title !== l.name ? ' [' + l.name + ']' : ''}</option>`
    ).join('');
    sel.style.display = '';
    inp.style.display = 'none';
    // Sync initial value
    inp.value = layers[0]?.name || '';
    sel.value = layers[0]?.name || '';
    // Auto-fill display name if blank
    const nameInput = document.getElementById('ogc-name');
    if (!nameInput.value.trim()) nameInput.value = layers[0]?.title || '';
  },

  onLayerSelect() {
    const sel = document.getElementById('ogc-layer-select');
    document.getElementById('ogc-layers').value = sel.value;
    // Auto-fill display name with selected layer title
    const nameInput = document.getElementById('ogc-name');
    const title = sel.options[sel.selectedIndex]?.text.split(' [')[0] || sel.value;
    nameInput.value = title;
  },

  _buildTileUrl(service) {
    const { type, url, layers } = service;
    const base = url.replace(/\?.*$/, '');
    if (type === 'wms') {
      return `${base}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&BBOX={bbox-epsg-3857}`
           + `&WIDTH=256&HEIGHT=256&LAYERS=${encodeURIComponent(layers)}`
           + `&FORMAT=image%2Fpng&TRANSPARENT=true&SRS=EPSG%3A3857`;
    }
    if (type === 'wmts') {
      return `${base}?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile`
           + `&LAYER=${encodeURIComponent(layers)}&STYLE=default`
           + `&FORMAT=image%2Fpng&TILEMATRIXSET=EPSG%3A3857`
           + `&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`;
    }
    return url; // XYZ: user provides full template
  },

  _addToMap(service) {
    if (!map || !map.isStyleLoaded()) return;
    try {
      if (!map.getSource(service.id)) {
        map.addSource(service.id, {
          type: 'raster',
          tiles: [this._buildTileUrl(service)],
          tileSize: 256,
        });
      }
      if (!map.getLayer(service.id)) {
        map.addLayer({
          id: service.id,
          type: 'raster',
          source: service.id,
          paint: { 'raster-opacity': service.opacity ?? 0.85 },
        }, 'orbat-link-glow'); // insert below ORBAT layers
      }
      if (!service.visible) {
        map.setLayoutProperty(service.id, 'visibility', 'none');
      }
    } catch (err) {
      notify(`OGC layer error: ${err.message}`, 'err');
      logEvent('ERR', `OGC layer failed: ${err.message}`, 'err');
    }
  },

  _removeFromMap(id) {
    if (!map || !map.isStyleLoaded()) return;
    try {
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    } catch { /* ignore */ }
  },

  add() {
    const name = document.getElementById('ogc-name').value.trim();
    const type = document.getElementById('ogc-type').value;
    const url  = document.getElementById('ogc-url').value.trim();
    const layers = document.getElementById('ogc-layers').value.trim();
    const opacity = Number(document.getElementById('ogc-opacity').value || '0.85');
    if (!name || !url) { notify('Name and URL are required', 'err'); return; }
    if ((type === 'wms' || type === 'wmts') && !layers) { notify('Layer name is required', 'err'); return; }

    const id = `ogc_${Date.now()}`;
    const service = { id, name, type, url, layers, opacity, visible: true };
    const list = this._load();
    list.push(service);
    this._save(list);
    this._addToMap(service);
    this._syncMapOrder();
    this.renderList();
    this._updateLegend();

    document.getElementById('ogc-name').value = '';
    document.getElementById('ogc-url').value = '';
    document.getElementById('ogc-layers').value = '';
    notify(`OGC layer "${name}" added`, 'ok');
    logEvent('OGC', `Layer added: ${name} (${type})`);
  },

  remove(id) {
    let list = this._load();
    const svc = list.find((s) => s.id === id);
    this._save(list.filter((s) => s.id !== id));
    this._removeFromMap(id);
    if (this._editingId === id) this._editingId = null;
    this.renderList();
    this._updateLegend();
    if (svc) notify(`Layer "${svc.name}" removed`);
  },

  toggle(id) {
    const list = this._load();
    const svc = list.find((s) => s.id === id);
    if (!svc) return;
    svc.visible = !svc.visible;
    this._save(list);
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, 'visibility', svc.visible ? 'visible' : 'none');
    }
    this.renderList();
    this._updateLegend();
  },

  // ── Reorder ────────────────────────────────────────────────────────────

  moveUp(id) {
    const list = this._load();
    const idx = list.findIndex((s) => s.id === id);
    if (idx <= 0) return;
    [list[idx - 1], list[idx]] = [list[idx], list[idx - 1]];
    this._save(list);
    this._syncMapOrder();
    this.renderList();
    this._updateLegend();
  },

  moveDown(id) {
    const list = this._load();
    const idx = list.findIndex((s) => s.id === id);
    if (idx < 0 || idx >= list.length - 1) return;
    [list[idx], list[idx + 1]] = [list[idx + 1], list[idx]];
    this._save(list);
    this._syncMapOrder();
    this.renderList();
    this._updateLegend();
  },

  // Reorder MapLibre layers to match the stored list.
  // list[0] = bottom raster, list[last] = top raster (just below ORBAT layers).
  _syncMapOrder() {
    if (!map || !map.isStyleLoaded()) return;
    const list = this._load();
    // Move each layer just before the one above it; topmost goes before 'orbat-link-glow'
    for (let i = 0; i < list.length; i++) {
      const above = i < list.length - 1 ? list[i + 1].id : 'orbat-link-glow';
      try {
        if (map.getLayer(list[i].id)) map.moveLayer(list[i].id, above);
      } catch { /* layer may not exist yet */ }
    }
  },

  // ── Inline edit ────────────────────────────────────────────────────────

  _editingId: null,

  startEdit(id) {
    this._editingId = id;
    this.renderList();
    // Focus the name input after render
    const inp = document.getElementById(`ogc-edit-name-${id}`);
    if (inp) inp.focus();
  },

  cancelEdit() {
    this._editingId = null;
    this.renderList();
  },

  saveEdit(id) {
    const nameVal    = (document.getElementById(`ogc-edit-name-${id}`)?.value    || '').trim();
    const opacityVal = parseFloat(document.getElementById(`ogc-edit-opacity-${id}`)?.value ?? '0.85');
    if (!nameVal) { notify('Name cannot be empty', 'err'); return; }
    const opacity = Math.min(1, Math.max(0, isNaN(opacityVal) ? 0.85 : opacityVal));

    const list = this._load();
    const svc  = list.find((s) => s.id === id);
    if (!svc) return;
    svc.name    = nameVal;
    svc.opacity = opacity;
    this._save(list);

    // Apply opacity live on map
    if (map && map.getLayer(id)) {
      map.setPaintProperty(id, 'raster-opacity', opacity);
    }

    this._editingId = null;
    this.renderList();
    this._updateLegend();
    notify(`Layer "${nameVal}" updated`, 'ok');
  },

  // ── Render list ────────────────────────────────────────────────────────

  renderList() {
    const container = document.getElementById('ogc-list');
    if (!container) return;
    const list = this._load();
    if (!list.length) {
      container.innerHTML = '<div class="ogc-empty">No layers added</div>';
      return;
    }
    const len = list.length;
    // List displayed top-to-bottom = highest z-order first (list[last] = top)
    const displayList = [...list].reverse();
    container.innerHTML = displayList.map((s, di) => {
      const origIdx = len - 1 - di; // real index in list
      const isFirst = origIdx === len - 1; // top layer (no moveUp)
      const isLast  = origIdx === 0;       // bottom layer (no moveDown)
      const editing = this._editingId === s.id;

      const itemRow = `
        <div class="ogc-item" data-id="${s.id}">
          <span class="ogc-vis ${s.visible ? 'on' : 'off'}" onclick="OgcServices.toggle('${s.id}')" title="Toggle visibility">${s.visible ? '◉' : '◎'}</span>
          <div class="ogc-move-col">
            <button type="button" class="ogc-move" onclick="OgcServices.moveUp('${s.id}')" title="Move up (raise)" ${isFirst ? 'disabled' : ''}>▲</button>
            <button type="button" class="ogc-move" onclick="OgcServices.moveDown('${s.id}')" title="Move down (lower)" ${isLast ? 'disabled' : ''}>▼</button>
          </div>
          <div class="ogc-info">
            <div class="ogc-name">${s.name}</div>
            <div class="ogc-meta">${s.type.toUpperCase()}${s.layers ? ' · ' + s.layers : ''} · opacity ${s.opacity ?? 0.85}</div>
          </div>
          <div class="ogc-actions">
            <button type="button" class="ogc-edit" onclick="OgcServices.startEdit('${s.id}')" title="Edit layer">✎</button>
            <button type="button" class="ogc-del"  onclick="OgcServices.remove('${s.id}')" title="Remove layer">✕</button>
          </div>
        </div>`;

      const editForm = editing ? `
        <div class="ogc-edit-form">
          <div class="ogc-edit-row">
            <span class="ogc-edit-lbl">Name</span>
            <input id="ogc-edit-name-${s.id}" class="ogc-edit-input" type="text" value="${s.name.replace(/"/g, '&quot;')}">
          </div>
          <div class="ogc-edit-row">
            <span class="ogc-edit-lbl">Opacity</span>
            <input id="ogc-edit-opacity-${s.id}" class="ogc-edit-input" type="number" min="0" max="1" step="0.05" value="${s.opacity ?? 0.85}" style="max-width:80px">
          </div>
          <div class="ogc-edit-actions">
            <button type="button" class="ogc-edit-save"   onclick="OgcServices.saveEdit('${s.id}')">✔ SAVE</button>
            <button type="button" class="ogc-edit-cancel" onclick="OgcServices.cancelEdit()">CANCEL</button>
          </div>
        </div>` : '';

      return itemRow + editForm;
    }).join('');
  },

  // ── Legend ─────────────────────────────────────────────────────────────

  _updateLegend() {
    const el = document.getElementById('ogc-legend-rows');
    if (!el) return;
    const list = this._load();
    if (!list.length) { el.innerHTML = ''; return; }
    // Show from top to bottom (last in list = top on map)
    const html = [`<hr class="legend-ogc-sep"><div class="legend-ogc-lbl">OGC Layers</div>`];
    [...list].reverse().forEach((s) => {
      html.push(`<div class="legend-row${s.visible ? '' : ' ogc-hidden'}">
        <span class="swatch ogc-${s.type}"></span>
        <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:110px" title="${s.name}">${s.name}</span>
      </div>`);
    });
    el.innerHTML = html.join('');
  },

  init() {
    this._load().forEach((svc) => this._addToMap(svc));
    this._syncMapOrder();
    this._updateLegend();
  },
};
window.OgcServices = OgcServices;

window.app = app;
window.app.contract_version = FRONT_CONTRACT_VERSION;
window.app.enableMapPick = app.enableMapPick.bind(app);
document.addEventListener('DOMContentLoaded', () => app.init());
