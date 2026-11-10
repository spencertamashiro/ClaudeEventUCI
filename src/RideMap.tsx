import { useEffect, useMemo, useRef, useState } from 'react';
import { LngLatBounds, Map, Marker, NavigationControl } from 'maplibre-gl';
import type { GeoJSONSource, MapMouseEvent, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection, Geometry, Position } from 'geojson';
import type { Access, DatasetMode, RideFeatureCollection } from './domain.ts';

interface RideMapProps {
  mode: DatasetMode;
  features: RideFeatureCollection;
  states: Readonly<Record<string, Access>>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const sourceId = 'ride-features';
const syntheticStyle: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'paper', type: 'background', paint: { 'background-color': '#eaf0ea' } }],
};

function addLayers(map: Map) {
  map.addSource(sourceId, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });
  map.addLayer({
    id: 'ride-zones',
    type: 'fill',
    source: sourceId,
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: {
      'fill-color': ['match', ['get', 'kind'], 'dismount', '#dc9d2d', 'closure', '#bd344c', '#7262a5'],
      'fill-opacity': ['case', ['get', 'selected'], 0.32, 0.16],
    },
  });
  map.addLayer({
    id: 'ride-zone-outlines',
    type: 'line',
    source: sourceId,
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: {
      'line-color': ['match', ['get', 'kind'], 'dismount', '#a9580b', 'closure', '#bd344c', '#7262a5'],
      'line-width': 2,
      'line-dasharray': [2, 2],
    },
  });
  map.addLayer({
    id: 'ride-casing',
    type: 'line',
    source: sourceId,
    filter: ['==', ['geometry-type'], 'LineString'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['case', ['get', 'selected'], '#122c2c', '#fff'],
      'line-width': ['case', ['get', 'selected'], 12, 8],
    },
  });
  map.addLayer({
    id: 'ride-stroke',
    type: 'line',
    source: sourceId,
    filter: ['==', ['geometry-type'], 'LineString'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': [
        'match', ['get', 'access'],
        'allowed', '#087f67',
        'walk-device', '#a9580b',
        'prohibited', '#bd344c',
        '#57677b',
      ],
      'line-width': ['case', ['get', 'selected'], 7, 5],
    },
  });
  map.addLayer({
    id: 'ride-hit-area',
    type: 'line',
    source: sourceId,
    filter: ['==', ['geometry-type'], 'LineString'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-width': 30, 'line-opacity': 0 },
  });
}

function extendBounds(bounds: LngLatBounds, geometry: Geometry) {
  const extend = ([longitude, latitude]: Position) => bounds.extend([longitude, latitude]);
  switch (geometry.type) {
    case 'Point': extend(geometry.coordinates); break;
    case 'MultiPoint':
    case 'LineString': geometry.coordinates.forEach(extend); break;
    case 'MultiLineString':
    case 'Polygon': geometry.coordinates.forEach((line) => line.forEach(extend)); break;
    case 'MultiPolygon': geometry.coordinates.forEach((polygon) => polygon.forEach((line) => line.forEach(extend))); break;
    case 'GeometryCollection': geometry.geometries.forEach((part) => extendBounds(bounds, part)); break;
  }
}

export default function RideMap({ mode, features, states, selectedId, onSelect }: RideMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const activeMap = useRef<Map | null>(null);
  const selection = useRef(onSelect);
  const [loadedMap, setLoadedMap] = useState<Map | null>(null);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const displayFeatures = useMemo<FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: features.features.map(({ geometry, properties }) => ({
      type: 'Feature',
      geometry,
      properties: {
        id: properties.id,
        kind: properties.kind,
        access: states[properties.id] ?? 'unverified',
        selected: selectedId === properties.id,
      },
    })),
  }), [features, states, selectedId]);

  useEffect(() => { selection.current = onSelect; }, [onSelect]);

  useEffect(() => {
    if (!container.current) return;
    setLoadedMap(null);
    setError(null);
    let map: Map;
    try {
      map = new Map({
        container: container.current,
        style: mode === 'demo' ? syntheticStyle : 'https://tiles.openfreemap.org/styles/liberty',
        center: mode === 'demo' ? [0, 0] : [-117.842488, 33.645813],
        zoom: mode === 'demo' ? 15 : 14.2,
        maxPitch: 0,
        dragRotate: false,
        pitchWithRotate: false,
        attributionControl: false,
        renderWorldCopies: false,
      });
    } catch {
      setError('The interactive map could not start. You can still use the feature list.');
      return;
    }

    activeMap.current = map;
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(container.current);
    map.touchZoomRotate.disableRotation();
    map.getCanvas().setAttribute('aria-label', mode === 'demo' ? 'Fictional practice map' : 'UC Irvine and surrounding area');
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    const timeout = window.setTimeout(() => {
      setError('The map is taking longer than expected to load.');
    }, 15000);
    map.on('error', () => {
      setError('Some map content could not load. You can still use the feature list.');
    });
    map.once('load', () => {
      window.clearTimeout(timeout);
      addLayers(map);
      setLoadedMap(map);
    });
    map.once('idle', () => {
      if (map.areTilesLoaded()) setError(null);
    });

    const hitLayers = ['ride-stroke', 'ride-hit-area', 'ride-zones'];
    function featureAt(event: MapMouseEvent) {
      for (const layer of hitLayers) {
        if (!map.getLayer(layer)) continue;
        const [feature] = map.queryRenderedFeatures(event.point, { layers: [layer] });
        if (typeof feature?.properties.id === 'string') return feature.properties.id;
      }
      return null;
    }
    map.on('click', (event) => {
      const id = featureAt(event);
      if (id) selection.current(id);
    });
    map.on('mousemove', (event) => {
      map.getCanvas().style.cursor = featureAt(event) ? 'pointer' : '';
    });
    return () => {
      window.clearTimeout(timeout);
      resizeObserver.disconnect();
      activeMap.current = null;
      map.remove();
    };
  }, [mode, retry]);

  useEffect(() => {
    if (loadedMap === activeMap.current) loadedMap?.getSource<GeoJSONSource>(sourceId)?.setData(displayFeatures);
  }, [loadedMap, displayFeatures]);

  useEffect(() => {
    if (!loadedMap || loadedMap !== activeMap.current || mode !== 'demo') return;
    const bounds = new LngLatBounds();
    for (const feature of features.features) extendBounds(bounds, feature.geometry);
    if (!bounds.isEmpty()) loadedMap.fitBounds(bounds, { padding: 54, maxZoom: 16, duration: 0 });
  }, [loadedMap, mode, features]);

  useEffect(() => {
    if (!loadedMap || loadedMap !== activeMap.current || !selectedId) return;
    const feature = features.features.find(({ properties }) => properties.id === selectedId);
    if (!feature) return;
    const bounds = new LngLatBounds();
    extendBounds(bounds, feature.geometry);
    if (!bounds.isEmpty() && !loadedMap.getBounds().contains(bounds.getCenter())) {
      loadedMap.fitBounds(bounds, { padding: 48, maxZoom: 16, duration: 0 });
    }
  }, [loadedMap, features, selectedId]);

  useEffect(() => {
    if (!loadedMap || loadedMap !== activeMap.current) return;
    const markers: Marker[] = [];
    for (const { geometry, properties } of features.features) {
      if (geometry.type !== 'Point') continue;
      const [longitude, latitude] = geometry.coordinates;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ride-map__marker';
      button.setAttribute('aria-label', properties.name);
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        selection.current(properties.id);
      });
      const icon = document.createElement('span');
      icon.className = 'ride-map__marker-icon';
      icon.textContent = properties.kind === 'parking' ? 'P' : '◆';
      icon.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.className = 'ride-map__marker-label';
      label.textContent = properties.name;
      button.append(icon, label);
      markers.push(new Marker({ element: button }).setLngLat([longitude, latitude]).addTo(loadedMap));
    }
    return () => { markers.forEach((marker) => marker.remove()); };
  }, [loadedMap, features]);

  return (
    <div className="ride-map">
      <div ref={container} className="ride-map__canvas" />
      <div className="ride-map__badge">
        {mode === 'demo' ? 'Fictional practice map' : 'Irvine basemap · context only'}
      </div>
      {error && (
        <div className="ride-map__notice ride-map__notice--error" role="alert">
          {error} <button type="button" onClick={() => setRetry((attempt) => attempt + 1)}>Retry map</button>
        </div>
      )}
      {!loadedMap && !error && <div className="ride-map__notice" role="status">Loading map…</div>}
      <div className="ride-map__attribution">
        {mode === 'irvine' ? (
          <>
            <a href="https://openfreemap.org/" target="_blank" rel="noreferrer">OpenFreeMap</a>
            {' · '}<a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">© OpenMapTiles</a>
            {' · '}<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
          </>
        ) : 'Synthetic geometry · No real-world geography'}
      </div>
    </div>
  );
}
