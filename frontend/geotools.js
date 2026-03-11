(() => {
  const WGS84_A = 6378137.0;
  const WGS84_ECC_SQUARED = 0.00669438;
  const K0 = 0.9996;

  function pad(value, size) {
    return String(value).padStart(size, '0');
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function normalizePoint(point) {
    if (!point) return null;
    const lat = Number(point.lat);
    const lon = Number(point.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return {
      lat: clamp(lat, -90, 90),
      lon: clamp(lon, -180, 180),
    };
  }

  function toRadians(value) {
    return (value * Math.PI) / 180;
  }

  function toDegrees(value) {
    return (value * 180) / Math.PI;
  }

  function distanceMeters(a, b) {
    const p1 = normalizePoint(a);
    const p2 = normalizePoint(b);
    if (!p1 || !p2) return 0;
    const dLat = toRadians(p2.lat - p1.lat);
    const dLon = toRadians(p2.lon - p1.lon);
    const lat1 = toRadians(p1.lat);
    const lat2 = toRadians(p2.lat);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371000 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  function bearingDegrees(a, b) {
    const p1 = normalizePoint(a);
    const p2 = normalizePoint(b);
    if (!p1 || !p2) return 0;
    const lat1 = toRadians(p1.lat);
    const lat2 = toRadians(p2.lat);
    const dLon = toRadians(p2.lon - p1.lon);
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return (toDegrees(Math.atan2(y, x)) + 360) % 360;
  }

  function destinationPoint(origin, bearingDeg, distanceM) {
    const start = normalizePoint(origin);
    if (!start) return null;
    const angularDistance = distanceM / 6371000;
    const bearingRad = toRadians(bearingDeg);
    const lat1 = toRadians(start.lat);
    const lon1 = toRadians(start.lon);
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(angularDistance)
      + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearingRad),
    );
    const lon2 = lon1 + Math.atan2(
      Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
    );
    return normalizePoint({
      lat: toDegrees(lat2),
      lon: ((toDegrees(lon2) + 540) % 360) - 180,
    });
  }

  function decimalToDms(value, positiveHemisphere, negativeHemisphere) {
    const abs = Math.abs(value);
    const degrees = Math.floor(abs);
    const minutesFloat = (abs - degrees) * 60;
    const minutes = Math.floor(minutesFloat);
    const seconds = (minutesFloat - minutes) * 60;
    const hemisphere = value >= 0 ? positiveHemisphere : negativeHemisphere;
    return `${degrees}deg ${minutes}' ${seconds.toFixed(2)}" ${hemisphere}`;
  }

  function latitudeBand(lat) {
    const bands = 'CDEFGHJKLMNPQRSTUVWX';
    if (lat >= 84) return 'X';
    if (lat <= -80) return 'C';
    const idx = Math.floor((lat + 80) / 8);
    return bands[idx] || 'Z';
  }

  function latLonToUTM(point) {
    const p = normalizePoint(point);
    if (!p) return null;
    const latRad = toRadians(p.lat);
    const lonRad = toRadians(p.lon);
    const zoneNumber = Math.floor((p.lon + 180) / 6) + 1;
    const lonOrigin = (zoneNumber - 1) * 6 - 180 + 3;
    const lonOriginRad = toRadians(lonOrigin);
    const eccPrimeSquared = WGS84_ECC_SQUARED / (1 - WGS84_ECC_SQUARED);
    const n = WGS84_A / Math.sqrt(1 - WGS84_ECC_SQUARED * Math.sin(latRad) ** 2);
    const t = Math.tan(latRad) ** 2;
    const c = eccPrimeSquared * Math.cos(latRad) ** 2;
    const a = Math.cos(latRad) * (lonRad - lonOriginRad);
    const m = WGS84_A * (
      (1 - WGS84_ECC_SQUARED / 4 - (3 * WGS84_ECC_SQUARED ** 2) / 64 - (5 * WGS84_ECC_SQUARED ** 3) / 256) * latRad
      - ((3 * WGS84_ECC_SQUARED) / 8 + (3 * WGS84_ECC_SQUARED ** 2) / 32 + (45 * WGS84_ECC_SQUARED ** 3) / 1024) * Math.sin(2 * latRad)
      + ((15 * WGS84_ECC_SQUARED ** 2) / 256 + (45 * WGS84_ECC_SQUARED ** 3) / 1024) * Math.sin(4 * latRad)
      - ((35 * WGS84_ECC_SQUARED ** 3) / 3072) * Math.sin(6 * latRad)
    );

    let easting = K0 * n * (
      a
      + (1 - t + c) * (a ** 3) / 6
      + (5 - 18 * t + t ** 2 + 72 * c - 58 * eccPrimeSquared) * (a ** 5) / 120
    ) + 500000.0;

    let northing = K0 * (
      m + n * Math.tan(latRad) * (
        (a ** 2) / 2
        + (5 - t + 9 * c + 4 * (c ** 2)) * (a ** 4) / 24
        + (61 - 58 * t + t ** 2 + 600 * c - 330 * eccPrimeSquared) * (a ** 6) / 720
      )
    );

    const hemisphere = p.lat >= 0 ? 'N' : 'S';
    if (p.lat < 0) northing += 10000000.0;
    easting = Math.round(easting);
    northing = Math.round(northing);

    return {
      zoneNumber,
      zoneLetter: latitudeBand(p.lat),
      hemisphere,
      easting,
      northing,
    };
  }

  function utmToMgrs(utm) {
    if (!utm) return null;
    const columnSets = ['ABCDEFGH', 'JKLMNPQR', 'STUVWXYZ'];
    const rowLetters = 'ABCDEFGHJKLMNPQRSTUV';
    const colSet = columnSets[(utm.zoneNumber - 1) % 3];
    const colIndex = Math.max(0, Math.floor(utm.easting / 100000) - 1) % colSet.length;
    const rowOffset = utm.zoneNumber % 2 === 0 ? 5 : 0;
    const rowIndex = (Math.floor(utm.northing / 100000) + rowOffset) % rowLetters.length;
    const eastingRemainder = utm.easting % 100000;
    const northingRemainder = utm.northing % 100000;
    return `${utm.zoneNumber}${utm.zoneLetter} ${colSet[colIndex]}${rowLetters[rowIndex]} ${pad(eastingRemainder, 5)} ${pad(northingRemainder, 5)}`;
  }

  function formatDd(point) {
    return `${point.lat.toFixed(6)}, ${point.lon.toFixed(6)}`;
  }

  function formatDms(point) {
    return `${decimalToDms(point.lat, 'N', 'S')} | ${decimalToDms(point.lon, 'E', 'W')}`;
  }

  function convertCoordinate(point) {
    const p = normalizePoint(point);
    if (!p) return null;
    const utm = latLonToUTM(p);
    return {
      point: p,
      dd: formatDd(p),
      dms: formatDms(p),
      utm: utm ? `${utm.zoneNumber}${utm.zoneLetter} ${utm.easting}E ${utm.northing}N` : '--',
      mgrs: utmToMgrs(utm) || '--',
    };
  }

  function buildCircleRing(anchor, radiusM, segments = 64) {
    const safeAnchor = normalizePoint(anchor);
    if (!safeAnchor || radiusM <= 0) return [];
    const ring = [];
    for (let i = 0; i <= segments; i += 1) {
      const bearing = (360 / segments) * i;
      const point = destinationPoint(safeAnchor, bearing, radiusM);
      ring.push([point.lon, point.lat]);
    }
    return ring;
  }

  function buildRangeRingFeatures(anchor, radiiM) {
    const safeAnchor = normalizePoint(anchor);
    if (!safeAnchor) return [];
    const features = [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [safeAnchor.lon, safeAnchor.lat] },
        properties: {
          id: `gt-anchor-${Date.now()}`,
          ns: 'geotools',
          tool: 'gt-rings',
          layer: 'gt-anchor-point',
          ephemeral: true,
          label: 'ANCHOR',
        },
      },
    ];
    radiiM.forEach((radiusM, index) => {
      const labelPoint = destinationPoint(safeAnchor, 45, radiusM);
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: buildCircleRing(safeAnchor, radiusM) },
        properties: {
          id: `gt-ring-${index}-${radiusM}`,
          ns: 'geotools',
          tool: 'gt-rings',
          layer: 'gt-rings-line',
          ephemeral: true,
          metric_value: radiusM,
          metric_unit: 'm',
          label: `${radiusM} m`,
        },
      });
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [labelPoint.lon, labelPoint.lat] },
        properties: {
          id: `gt-ring-label-${index}-${radiusM}`,
          ns: 'geotools',
          tool: 'gt-rings',
          layer: 'gt-label',
          ephemeral: true,
          label: `${radiusM} m`,
          metric_value: radiusM,
          metric_unit: 'm',
        },
      });
    });
    return features;
  }

  function buildBearingFeatures(start, end) {
    const from = normalizePoint(start);
    const to = normalizePoint(end);
    if (!from || !to) return { features: [], summary: null };
    const distanceM = Math.round(distanceMeters(from, to));
    const bearingDeg = bearingDegrees(from, to);
    const midpoint = {
      lat: (from.lat + to.lat) / 2,
      lon: (from.lon + to.lon) / 2,
    };
    return {
      summary: {
        start: from,
        end: to,
        distanceM,
        bearingDeg,
        label: `${bearingDeg.toFixed(1)}deg / ${distanceM} m`,
      },
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [from.lon, from.lat] },
          properties: {
            id: 'gt-bearing-start',
            ns: 'geotools',
            tool: 'gt-bearing',
            layer: 'gt-anchor-point',
            ephemeral: true,
            label: 'A',
          },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [to.lon, to.lat] },
          properties: {
            id: 'gt-bearing-end',
            ns: 'geotools',
            tool: 'gt-bearing',
            layer: 'gt-anchor-point',
            ephemeral: true,
            label: 'B',
          },
        },
        {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[from.lon, from.lat], [to.lon, to.lat]] },
          properties: {
            id: 'gt-bearing-line',
            ns: 'geotools',
            tool: 'gt-bearing',
            layer: 'gt-bearing-line',
            ephemeral: true,
            metric_value: distanceM,
            metric_unit: 'm',
          },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [midpoint.lon, midpoint.lat] },
          properties: {
            id: 'gt-bearing-label',
            ns: 'geotools',
            tool: 'gt-bearing',
            layer: 'gt-bearing-label',
            ephemeral: true,
            label: `${bearingDeg.toFixed(1)}deg | ${distanceM} m`,
            metric_value: distanceM,
            metric_unit: 'm',
          },
        },
      ],
    };
  }

  function buildSectorFeatures(anchor, bearingDeg, spreadDeg, radiusM) {
    const safeAnchor = normalizePoint(anchor);
    if (!safeAnchor) return { features: [], summary: null };
    const safeSpread = clamp(Number(spreadDeg) || 0, 1, 180);
    const safeBearing = ((Number(bearingDeg) || 0) + 360) % 360;
    const safeRadius = Math.max(1, Number(radiusM) || 1);
    const startBearing = safeBearing - safeSpread / 2;
    const endBearing = safeBearing + safeSpread / 2;
    const arc = [[safeAnchor.lon, safeAnchor.lat]];
    for (let i = 0; i <= 36; i += 1) {
      const bearing = startBearing + ((endBearing - startBearing) * i) / 36;
      const point = destinationPoint(safeAnchor, bearing, safeRadius);
      arc.push([point.lon, point.lat]);
    }
    arc.push([safeAnchor.lon, safeAnchor.lat]);
    return {
      summary: `Sector ${safeBearing.toFixed(0)}deg / ${safeSpread.toFixed(0)}deg / ${safeRadius} m`,
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [safeAnchor.lon, safeAnchor.lat] },
          properties: {
            id: 'gt-sector-anchor',
            ns: 'geotools',
            tool: 'gt-sector',
            layer: 'gt-anchor-point',
            ephemeral: true,
            label: 'ANCHOR',
          },
        },
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [arc] },
          properties: {
            id: 'gt-sector-fill',
            ns: 'geotools',
            tool: 'gt-sector',
            layer: 'gt-sector-fill',
            ephemeral: true,
            metric_value: safeRadius,
            metric_unit: 'm',
          },
        },
        {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: arc },
          properties: {
            id: 'gt-sector-line',
            ns: 'geotools',
            tool: 'gt-sector',
            layer: 'gt-sector-line',
            ephemeral: true,
            label: `${safeBearing.toFixed(0)}deg`,
          },
        },
      ],
    };
  }

  function featurePoint(feature) {
    if (!feature?.geometry) return null;
    if (feature.geometry.type === 'Point') {
      const [lon, lat] = feature.geometry.coordinates || [];
      return normalizePoint({ lat, lon });
    }
    if (feature.geometry.type === 'LineString') {
      const coords = feature.geometry.coordinates || [];
      if (!coords.length) return null;
      const midpoint = coords[Math.floor(coords.length / 2)];
      return normalizePoint({ lat: midpoint[1], lon: midpoint[0] });
    }
    if (feature.geometry.type === 'Polygon') {
      const ring = feature.geometry.coordinates?.[0] || [];
      if (!ring.length) return null;
      const sum = ring.reduce((acc, item) => ({ lon: acc.lon + item[0], lat: acc.lat + item[1] }), { lon: 0, lat: 0 });
      return normalizePoint({ lat: sum.lat / ring.length, lon: sum.lon / ring.length });
    }
    return null;
  }

  function buildProximityFeatures(anchor, candidates, radiusM, dataset) {
    const safeAnchor = normalizePoint(anchor);
    if (!safeAnchor) return { features: [], sourceIds: [], summary: null };
    const hits = [];
    const sourceIds = [];
    candidates.forEach((item) => {
      const point = normalizePoint(item.point);
      if (!point) return;
      const distanceM = distanceMeters(safeAnchor, point);
      if (distanceM > radiusM) return;
      sourceIds.push(item.id);
      hits.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [point.lon, point.lat] },
        properties: {
          id: `gt-proximity-${dataset}-${item.id}`,
          ns: 'geotools',
          tool: 'gt-proximity',
          layer: 'gt-proximity-hit',
          ephemeral: true,
          label: `${item.label} (${Math.round(distanceM)} m)`,
          metric_value: Math.round(distanceM),
          metric_unit: 'm',
          source_refs: [item.id],
        },
      });
    });
    const features = buildRangeRingFeatures(safeAnchor, [radiusM]).concat(hits);
    features.forEach((feature) => {
      if (feature.properties.tool === 'gt-rings') feature.properties.tool = 'gt-proximity';
    });
    return {
      features,
      sourceIds,
      summary: `Proximity ${dataset}: ${hits.length} hits within ${radiusM} m`,
    };
  }

  function buildDispersionFeatures(points, labelPrefix = 'dispersion') {
    if (!points.length) return { features: [], sourceIds: [], summary: 'Dispersion: no points' };
    const centroid = {
      lat: points.reduce((sum, point) => sum + point.point.lat, 0) / points.length,
      lon: points.reduce((sum, point) => sum + point.point.lon, 0) / points.length,
    };
    let maxRadius = 0;
    points.forEach((item) => {
      maxRadius = Math.max(maxRadius, distanceMeters(centroid, item.point));
    });
    const radiusM = Math.max(1, Math.round(maxRadius));
    const ring = buildCircleRing(centroid, radiusM, 64);
    return {
      sourceIds: points.map((item) => item.id),
      summary: `Dispersion ${labelPrefix}: ${points.length} units / radius ${radiusM} m`,
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [centroid.lon, centroid.lat] },
          properties: {
            id: 'gt-dispersion-anchor',
            ns: 'geotools',
            tool: 'gt-dispersion',
            layer: 'gt-anchor-point',
            ephemeral: true,
            label: 'CENTER',
          },
        },
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [ring] },
          properties: {
            id: 'gt-dispersion-fill',
            ns: 'geotools',
            tool: 'gt-dispersion',
            layer: 'gt-dispersion-fill',
            ephemeral: true,
            metric_value: radiusM,
            metric_unit: 'm',
            source_refs: points.map((item) => item.id),
          },
        },
        {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: ring },
          properties: {
            id: 'gt-dispersion-outline',
            ns: 'geotools',
            tool: 'gt-dispersion',
            layer: 'gt-dispersion-outline',
            ephemeral: true,
            label: `${radiusM} m`,
          },
        },
      ],
    };
  }

  const GeoMath = {
    normalizePoint,
    distanceMeters,
    bearingDegrees,
    destinationPoint,
    convertCoordinate,
    buildCircleRing,
    buildRangeRingFeatures,
    buildBearingFeatures,
    buildSectorFeatures,
    buildProximityFeatures,
    buildDispersionFeatures,
  };

  const GeoTools = {
    init() {
      const st = window.st;
      if (!st || st.geotoolsInitialized) return;
      st.geotoolsInitialized = true;

      const openBtn = document.getElementById('geotools-open-btn');
      const closeBtn = document.getElementById('gt-close-btn');
      const fromCursorBtn = document.getElementById('gt-convert-cursor-btn');
      const fromInputBtn = document.getElementById('gt-convert-input-btn');
      const exportBtn = document.getElementById('gt-export-btn');
      const clearBtn = document.getElementById('gt-clear-btn');
      const pinCursorBtn = document.getElementById('gt-pin-cursor-btn');
      const unpinCursorBtn = document.getElementById('gt-unpin-cursor-btn');
      const runDispersionBtn = document.getElementById('gt-run-dispersion-btn');

      if (openBtn) openBtn.addEventListener('click', () => this.togglePanel());
      if (closeBtn) closeBtn.addEventListener('click', () => this.togglePanel(false));
      if (fromCursorBtn) fromCursorBtn.addEventListener('click', () => this.applyConverter(st.geotools.cursor));
      if (fromInputBtn) {
        fromInputBtn.addEventListener('click', () => {
          this.applyConverter({
            lat: Number(document.getElementById('gt-lat-input').value),
            lon: Number(document.getElementById('gt-lon-input').value),
          });
        });
      }
      if (exportBtn) exportBtn.addEventListener('click', () => this.exportGeoJSON());
      if (clearBtn) clearBtn.addEventListener('click', () => this.clear());
      if (pinCursorBtn) pinCursorBtn.addEventListener('click', () => this.pinCursor());
      if (unpinCursorBtn) unpinCursorBtn.addEventListener('click', () => this.unpinCursor());
      if (runDispersionBtn) runDispersionBtn.addEventListener('click', () => this.runDispersion());

      ['gt-tool-converter', 'gt-tool-rings', 'gt-tool-bearing', 'gt-tool-sector', 'gt-tool-proximity', 'gt-tool-dispersion'].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('click', () => {
          const mode = el.dataset.mode;
          if (window.MapWidgets) window.MapWidgets.setMode(mode);
        });
      });

      this.applyConverter(st.geotools.cursor || { lat: 40.4168, lon: -3.7038 });

      const map = window.map;
      if (!map) return;

      map.on('click', (event) => {
        if (!this.isActive()) return;
        if (window.Favorites && window.Favorites._pickMode) return;
        if (st.pickCoordsMode) return;
        this.handleMapClick(event.lngLat);
      });

      map.on('mousemove', (event) => {
        const point = { lat: event.lngLat.lat, lon: event.lngLat.lng };
        st.geotools.cursor = point;
        this.renderCursor(point);
        if (st.geotools.activeTool === 'gt-converter') {
          this.applyConverter(point, true);
        }
      });

      map.on('dblclick', (event) => {
        if (st.geotools.activeTool !== 'gt-bearing') return;
        event.preventDefault();
      });

      this.refreshSource();
      this.render();
    },

    isActive() {
      return Boolean(window.st?.geotools?.activeTool);
    },

    togglePanel(force) {
      const panel = document.getElementById('geotools-panel');
      if (!panel) return;
      const nextOpen = typeof force === 'boolean' ? force : !window.st.geotools.panelOpen;
      window.st.geotools.panelOpen = nextOpen;
      panel.classList.toggle('open', nextOpen);
      const openBtn = document.getElementById('geotools-open-btn');
      if (openBtn) openBtn.classList.toggle('active', nextOpen || this.isActive());
    },

    activate(mode) {
      const st = window.st;
      st.geotools.panelOpen = true;
      st.geotools.activeTool = mode;
      st.geotools.mode = mode;
      st.geotools.selection.points = [];
      this.showPopup(mode);
      this.togglePanel(true);
      if (window.notify) window.notify(`GeoTools mode ${mode} active`);
      if (window.logEvent) window.logEvent('GTOOL', `Mode ${mode} active`, 'ok');
      if (mode === 'gt-dispersion') this.runDispersion();
      this.render();
    },

    deactivate() {
      const st = window.st;
      st.geotools.activeTool = null;
      st.geotools.mode = 'none';
      st.geotools.selection.points = [];
      this.showPopup(null);
      this.render();
    },

    clear() {
      const st = window.st;
      st.geotools.selection = { anchor: null, points: [], sourceType: null, sourceIds: [] };
      st.geotools.derived.features = [];
      st.geotools.derived.resultSummary = null;
      this.refreshSource();
      this.showPopup(null);
      this.render();
    },

    pinCursor() {
      const point = window.st.geotools.cursor;
      window.st.geotools.pinnedCursor = point ? { ...point } : null;
      this.render();
    },

    unpinCursor() {
      window.st.geotools.pinnedCursor = null;
      this.render();
    },

    applyConverter(point, silent = false) {
      const result = GeoMath.convertCoordinate(point);
      if (!result) return;
      const st = window.st;
      st.geotools.derived.converter = result;
      document.getElementById('gt-lat-input').value = result.point.lat.toFixed(6);
      document.getElementById('gt-lon-input').value = result.point.lon.toFixed(6);
      document.getElementById('gt-dd-output').textContent = result.dd;
      document.getElementById('gt-dms-output').textContent = result.dms;
      document.getElementById('gt-utm-output').textContent = result.utm;
      document.getElementById('gt-mgrs-output').textContent = result.mgrs;
      if (!silent) document.getElementById('gt-summary').textContent = `Converter updated ${result.dd}`;
    },

    parseRingsInput() {
      const raw = document.getElementById('gt-rings-input').value || '';
      const radii = raw
        .split(',')
        .map((item) => Number(item.trim()))
        .filter((value) => Number.isFinite(value) && value > 0)
        .map((value) => Math.round(value));
      return radii.length ? radii : [100, 250, 500];
    },

    showPopup(mode) {
      const popupByMode = {
        'gt-sector': 'gt-sector-popup',
        'gt-proximity': 'gt-proximity-popup',
        'gt-dispersion': 'gt-dispersion-popup',
      };
      ['gt-sector-popup', 'gt-proximity-popup', 'gt-dispersion-popup'].forEach((id) => {
        const popup = document.getElementById(id);
        if (popup) popup.classList.toggle('open', popupByMode[mode] === id);
      });
    },

    buildCandidateSnapshots(dataset) {
      const st = window.st;
      if (dataset === 'events') {
        return (st.geoEvents || []).map((feature, index) => ({
          id: feature.properties?.event_id || feature.properties?.id || `event-${index}`,
          label: feature.properties?.summary || feature.properties?.event_type || 'event',
          point: featurePoint(feature),
        }));
      }
      if (dataset === 'shapes') {
        return (window.drawState?.items || []).map((item, index) => ({
          id: `shape-${index}`,
          label: item.type || 'shape',
          point: item.points?.length ? item.points[Math.floor(item.points.length / 2)] : null,
        }));
      }
      return (st.geoFeatures || [])
        .filter((feature) => feature.properties?.layer === 'units-point')
        .map((feature, index) => ({
          id: feature.properties?.unit_id || feature.properties?.id || `unit-${index}`,
          label: feature.properties?.unit_name || feature.properties?.unit_id || 'unit',
          point: featurePoint(feature),
        }));
    },

    runDispersion() {
      const dataset = document.getElementById('gt-dispersion-dataset-input').value;
      const selectedId = window.st.selectedId;
      let candidates = this.buildCandidateSnapshots('units');
      if (dataset === 'selected-unit-family' && selectedId) {
        const units = window.st.units || {};
        const selected = units[selectedId];
        const related = new Set([selectedId]);
        Object.values(units).forEach((unit) => {
          if (unit.parent_id === selectedId || unit.id === selected?.parent_id || unit.parent_id === selected?.parent_id) {
            related.add(unit.id);
          }
        });
        candidates = candidates.filter((item) => related.has(item.id));
      }
      const normalized = candidates.filter((item) => item.point);
      const result = GeoMath.buildDispersionFeatures(normalized, dataset);
      window.st.geotools.selection.sourceType = dataset;
      window.st.geotools.selection.sourceIds = result.sourceIds;
      window.st.geotools.derived.features = result.features;
      window.st.geotools.derived.resultSummary = result.summary;
      this.refreshSource();
      this.render();
    },

    handleMapClick(lngLat) {
      const st = window.st;
      const point = { lat: lngLat.lat, lon: lngLat.lng };

      if (st.geotools.activeTool === 'gt-converter') {
        this.applyConverter(point);
        return;
      }

      if (st.geotools.activeTool === 'gt-rings') {
        const radii = this.parseRingsInput();
        st.geotools.selection.anchor = point;
        st.geotools.params.rings.radiiM = radii;
        st.geotools.derived.features = GeoMath.buildRangeRingFeatures(point, radii);
        st.geotools.derived.resultSummary = `Range rings at ${point.lat.toFixed(5)}, ${point.lon.toFixed(5)} with ${radii.join(', ')} m`;
        this.refreshSource();
        this.render();
        return;
      }

      if (st.geotools.activeTool === 'gt-bearing') {
        st.geotools.selection.points.push(point);
        st.geotools.selection.points = st.geotools.selection.points.slice(-2);
        if (st.geotools.selection.points.length < 2) {
          st.geotools.derived.resultSummary = 'Bearing start point captured. Select end point.';
          this.render();
          return;
        }
        const result = GeoMath.buildBearingFeatures(st.geotools.selection.points[0], st.geotools.selection.points[1]);
        st.geotools.derived.features = result.features;
        st.geotools.derived.resultSummary = result.summary?.label || null;
        st.geotools.params.bearing.units = 'm';
        this.refreshSource();
        this.render();
        return;
      }

      if (st.geotools.activeTool === 'gt-sector') {
        const result = GeoMath.buildSectorFeatures(
          point,
          Number(document.getElementById('gt-sector-bearing-input').value),
          Number(document.getElementById('gt-sector-spread-input').value),
          Number(document.getElementById('gt-sector-radius-input').value),
        );
        st.geotools.selection.anchor = point;
        st.geotools.selection.sourceType = null;
        st.geotools.selection.sourceIds = [];
        st.geotools.derived.features = result.features;
        st.geotools.derived.resultSummary = result.summary;
        this.refreshSource();
        this.render();
        return;
      }

      if (st.geotools.activeTool === 'gt-proximity') {
        const radiusM = Math.max(1, Number(document.getElementById('gt-proximity-radius-input').value) || 250);
        const dataset = document.getElementById('gt-proximity-dataset-input').value;
        const result = GeoMath.buildProximityFeatures(point, this.buildCandidateSnapshots(dataset), radiusM, dataset);
        st.geotools.selection.anchor = point;
        st.geotools.selection.sourceType = dataset;
        st.geotools.selection.sourceIds = result.sourceIds;
        st.geotools.params.proximity = { radiusM, dataset };
        st.geotools.derived.features = result.features;
        st.geotools.derived.resultSummary = result.summary;
        this.refreshSource();
        this.render();
      }
    },

    refreshSource() {
      const source = window.map?.getSource('geotools-features');
      if (!source) return;
      source.setData({
        type: 'FeatureCollection',
        features: window.st.geotools.derived.features || [],
      });
    },

    renderCursor(point) {
      const result = GeoMath.convertCoordinate(point);
      if (!result) return;
      document.getElementById('gt-cursor-dd').textContent = result.dd;
      document.getElementById('gt-cursor-mgrs').textContent = result.mgrs;
    },

    render() {
      const st = window.st;
      const activeTool = st.geotools.activeTool;
      ['gt-tool-converter', 'gt-tool-rings', 'gt-tool-bearing', 'gt-tool-sector', 'gt-tool-proximity', 'gt-tool-dispersion'].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.toggle('active', el.dataset.mode === activeTool);
      });
      document.getElementById('gt-summary').textContent = st.geotools.derived.resultSummary || 'Ready';
      document.getElementById('gt-dataset-output').textContent = st.geotools.selection.sourceType || 'units';
      document.getElementById('gt-source-refs-output').textContent = String((st.geotools.selection.sourceIds || []).length);
      document.getElementById('gt-cursor-pinned').textContent = st.geotools.pinnedCursor
        ? `${st.geotools.pinnedCursor.lat.toFixed(5)}, ${st.geotools.pinnedCursor.lon.toFixed(5)}`
        : '--';
      const openBtn = document.getElementById('geotools-open-btn');
      if (openBtn) openBtn.classList.toggle('active', st.geotools.panelOpen || Boolean(activeTool));
    },

    exportGeoJSON() {
      const features = window.st.geotools.derived.features || [];
      if (!features.length) {
        if (window.notify) window.notify('GeoTools export skipped: no features', 'warn');
        return;
      }
      const payload = {
        type: 'FeatureCollection',
        meta: {
          tool: window.st.geotools.activeTool || 'manual',
          created_at: new Date().toISOString(),
          source_refs: document.getElementById('gt-export-refs-input').checked
            ? (window.st.geotools.selection.sourceIds || [])
            : [],
        },
        features,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/geo+json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `geotools-${Date.now()}.geojson`;
      link.click();
      URL.revokeObjectURL(link.href);
      document.getElementById('gt-summary').textContent = `Exported ${features.length} features`;
      if (window.logEvent) window.logEvent('GTOOL', `GeoJSON export ${features.length} features`, 'ok');
    },
  };

  window.GeoMath = GeoMath;
  window.GeoTools = GeoTools;
})();
