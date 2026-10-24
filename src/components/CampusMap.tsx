import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { C } from '../lib/palette';

/* ─────────────────────────────────────────────────────────────
   Campus map — MapLibre GL + OpenFreeMap tiles, rendered in a WebView.
   No API key, no Google/Apple map services, works in Expo Go and
   on Android in China. Locked to the NJUPT campus area.
   ───────────────────────────────────────────────────────────── */

export type MapPin = {
  id: string;
  kind: 'game' | 'court';
  lat: number;
  lng: number;
  label: string;      // fallback text (used when no sport icon)
  sport?: string;     // football | padel | basketball | badminton | billiards
  count?: number;     // small badge (e.g. upcoming games)
  color: string;      // pin background
  title?: string;     // popup title
  selected?: boolean;
};

export type CampusMapHandle = {
  reset: () => void;
  flyTo: (lat: number, lng: number, zoom?: number) => void;
};

type Props = {
  pins: MapPin[];
  onSelect?: (pin: { id: string; kind: MapPin['kind'] }) => void;
  initialZoom?: number;
  showControls?: boolean;
};

export const NJUPT_CENTER = { lat: 32.11949, lng: 118.927126 };
export const CAMPUS_BOUNDS = { south: 32.1120, west: 118.9200, north: 32.1265, east: 118.9365 };

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const LIB = 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist';

function html(zoom: number, controls: boolean) {
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<link rel="stylesheet" href="${LIB}/maplibre-gl.css"/>
<script src="${LIB}/maplibre-gl.js"></script>
<style>
  html,body,#map{margin:0;padding:0;height:100%;width:100%;background:#eef0e6}
  .mk{width:40px;height:52px;cursor:pointer}                       /* MapLibre moves this box — never animate it */
  .mk .in{position:relative;width:40px;height:52px;transform-origin:50% 100%;
      animation:drop .55s cubic-bezier(.2,1.4,.4,1) both}
  .mk svg.body{position:absolute;left:0;top:0;width:40px;height:52px;filter:drop-shadow(0 3px 4px rgba(0,22,69,.35));
      transition:transform .2s ease;transform-origin:50% 100%}
  .mk .ic{position:absolute;left:10px;top:9px;width:20px;height:20px}
  .mk .ic svg{width:20px;height:20px}
  .mk .txt{position:absolute;left:0;top:11px;width:40px;text-align:center;font:800 13px -apple-system,Segoe UI,Roboto,sans-serif;color:#fff}
  .mk .badge{position:absolute;right:-4px;top:-4px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:#afd43a;
      color:#001645;font:900 10px -apple-system,Segoe UI,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;
      border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.25)}
  .mk .ring{position:absolute;left:50%;bottom:-3px;width:16px;height:6px;margin-left:-8px;border-radius:50%;background:rgba(0,22,69,.25)}
  .mk.game .ring::after{content:"";position:absolute;left:50%;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;
      border:2px solid var(--c);animation:pulse 1.8s ease-out infinite}
  .mk.court svg.body{transform:scale(.86)}
  .mk.sel{z-index:10}
  .mk.sel svg.body{transform:scale(1.18)}
  .mk.sel .in{animation:drop .55s cubic-bezier(.2,1.4,.4,1) both, bob 1.2s ease-in-out .55s infinite}
  .mk:active svg.body{transform:scale(.92)}
  @keyframes drop{0%{opacity:0;transform:translateY(-26px) scale(.6)}60%{opacity:1}100%{opacity:1;transform:none}}
  @keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
  @keyframes pulse{0%{transform:scale(.4);opacity:.9}100%{transform:scale(3.2);opacity:0}}
  @media (prefers-reduced-motion:reduce){.mk .in,.mk.sel .in,.mk.game .ring::after{animation:none}}
  .maplibregl-ctrl-attrib{font-size:9px}
</style></head><body><div id="map"></div>
<script>
  const send = (m) => window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(m));
  const B = ${JSON.stringify(CAMPUS_BOUNDS)};
  const pad = 0.004;
  const map = new maplibregl.Map({
    container: 'map', style: '${STYLE_URL}',
    center: [${NJUPT_CENTER.lng}, ${NJUPT_CENTER.lat}], zoom: ${zoom},
    minZoom: 14, maxZoom: 18.5,
    maxBounds: [[B.west - pad, B.south - pad], [B.east + pad, B.north + pad]],
    attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false,
  });
  map.touchZoomRotate.disableRotation();
  ${controls ? "map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');" : ''}
  const W = 'fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  const ICONS = {
    football:   '<svg viewBox="0 0 24 24" '+W+'><circle cx="12" cy="12" r="9"/><path d="m12 7 4 3-1.5 4.5h-5L8 10z"/><path d="M12 3v4M21 10l-5 0M3 10h5M7 20l2.5-5.5M17 20l-2.5-5.5"/></svg>',
    padel:      '<svg viewBox="0 0 24 24" '+W+'><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6c3.4 3.4 3.4 9.4 0 12.8M18.4 5.6c-3.4 3.4-3.4 9.4 0 12.8"/></svg>',
    basketball: '<svg viewBox="0 0 24 24" '+W+'><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M5.6 5.6c3.5 3.5 3.5 9.3 0 12.8M18.4 5.6c-3.5 3.5-3.5 9.3 0 12.8"/></svg>',
    badminton:  '<svg viewBox="0 0 24 24" '+W+'><path d="M12 14 6 4l6 2 6-2z"/><path d="M9 5.2 12 14M15 5.2 12 14"/><circle cx="12" cy="17.5" r="3"/></svg>',
    billiards:  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="#fff" stroke-width="2"/><circle cx="13" cy="11" r="4.4" fill="#fff"/><text x="13" y="13.4" font-size="6.5" font-weight="900" text-anchor="middle" fill="#111" font-family="Arial">8</text></svg>',
    court:      '<svg viewBox="0 0 24 24" '+W+'><rect x="4" y="6" width="16" height="12" rx="2"/><path d="M12 6v12"/><circle cx="12" cy="12" r="2.5"/></svg>',
  };
  const body = (c) =>
    '<svg class="body" viewBox="0 0 40 52"><path d="M20 1C9.5 1 1.5 9 1.5 19.3c0 12.6 15.6 28.6 17.2 30.2a1.8 1.8 0 0 0 2.6 0c1.6-1.6 17.2-17.6 17.2-30.2C38.5 9 30.5 1 20 1Z" fill="'+c+'" stroke="#fff" stroke-width="2.5"/></svg>';

  let markers = [];
  function draw(pins) {
    markers.forEach((m) => m.remove()); markers = [];
    pins.forEach((p, i) => {
      const el = document.createElement('div');
      el.className = 'mk ' + p.kind + (p.selected ? ' sel' : '');
      el.style.setProperty('--c', p.color);
      const icon = ICONS[p.sport] || (p.kind === 'court' ? ICONS.court : null);
      el.innerHTML = '<div class="in" style="animation-delay:' + Math.min(i * 45, 600) + 'ms">'
        + body(p.color)
        + (icon ? '<div class="ic">' + icon + '</div>' : '<div class="txt">' + (p.label || '') + '</div>')
        + (p.count ? '<div class="badge">' + p.count + '</div>' : '')
        + '<div class="ring"></div>'
        + '</div>';
      el.title = p.title || '';
      el.addEventListener('click', (e) => { e.stopPropagation(); send({ type: 'select', id: p.id, kind: p.kind }); });
      markers.push(new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([p.lng, p.lat]).addTo(map));
    });
  }
  function handle(raw) {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (m.type === 'pins') draw(m.pins);
    if (m.type === 'reset') map.flyTo({ center: [${NJUPT_CENTER.lng}, ${NJUPT_CENTER.lat}], zoom: ${zoom}, speed: 1.4 });
    if (m.type === 'flyTo') map.flyTo({ center: [m.lng, m.lat], zoom: m.zoom || 17, speed: 1.4 });
  }
  document.addEventListener('message', (e) => handle(e.data));   // Android
  window.addEventListener('message', (e) => handle(e.data));     // iOS
  map.on('load', () => send({ type: 'ready' }));
  map.on('error', (e) => send({ type: 'error', message: String(e && e.error && e.error.message || 'map error') }));
</script></body></html>`;
}

const CampusMap = forwardRef<CampusMapHandle, Props>(function CampusMap(
  { pins, onSelect, initialZoom = 15.3, showControls = false }, ref,
) {
  const web = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const source = useMemo(() => ({ html: html(initialZoom, showControls), baseUrl: 'https://localhost/' }), [initialZoom, showControls]);

  const post = (m: object) => web.current?.postMessage(JSON.stringify(m));

  useImperativeHandle(ref, () => ({
    reset: () => post({ type: 'reset' }),
    flyTo: (lat, lng, zoom) => post({ type: 'flyTo', lat, lng, zoom }),
  }));

  // push pins whenever they change (after the map is ready)
  useEffect(() => { if (ready) post({ type: 'pins', pins }); }, [ready, pins]);

  return (
    <View style={styles.wrap}>
      <WebView
        ref={web}
        source={source}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        nestedScrollEnabled
        setSupportMultipleWindows={false}
        overScrollMode="never"
        bounces={false}
        style={styles.web}
        onMessage={(e: { nativeEvent: { data: string } }) => {
          try {
            const m = JSON.parse(e.nativeEvent.data);
            if (m.type === 'ready') setReady(true);
            if (m.type === 'select') onSelect?.({ id: m.id, kind: m.kind });
          } catch {}
        }}
      />
      {!ready && (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator color={C.primary} />
        </View>
      )}
    </View>
  );
});

export default CampusMap;

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  web: { flex: 1, backgroundColor: 'transparent' },
  loading: { ...StyleSheet.absoluteFill, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(238,240,230,0.6)' },
});
