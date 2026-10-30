/**
 * Payroll-admin map of one worker's day. Big numbered markers with short
 * always-visible labels, a Street/Satellite toggle, full screen, "Zoom to"
 * chips, and a tappable Stops list. Lazy-loaded so Leaflet stays out of the
 * main bundle. Read-only.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { Circle, MapContainer, Marker, Polyline, Popup, TileLayer } from 'react-leaflet';
import { Loader2, Maximize2, Minimize2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Job } from '@/lib/data';
import {
  KIND_COLOR,
  KIND_NAME,
  boundsOf,
  buildJobPins,
  buildPlaces,
  buildShops,
  buildStops,
  shortClock,
  type DayMapPlace,
  type DayMapSegmentInput,
  type DayMapShopInput,
} from '@/lib/payroll/dayMap';

// Vite hashes asset URLs, so point Leaflet's default icon at the bundled files.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow });

interface Props {
  workDate: string;
  segments: Array<{ id: string; kind: DayMapSegmentInput['kind']; job_id: number | string | null; job_name: string | null; started_at: string; ended_at: string | null }>;
  jobs: Job[];
}

type Base = 'street' | 'satellite';

// Labels hang to the right of each numbered marker, so leave more room there.
const FIT: L.FitBoundsOptions = { paddingTopLeft: [50, 60], paddingBottomRight: [190, 50], maxZoom: 16 };

function esc(text: string): string {
  return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/** Big numbered circle plus a white label pill that is always visible. */
function placeIcon(place: DayMapPlace): L.DivIcon {
  const color = KIND_COLOR[place.kind];
  return L.divIcon({
    className: '',
    html:
      `<div style="display:flex;align-items:center;gap:4px;transform:translate(-18px,-18px);pointer-events:auto">` +
      `<div style="flex:none;background:${color};color:#fff;width:36px;height:36px;border-radius:9999px;border:3px solid #fff;box-shadow:0 0 0 2px #0f172a,0 2px 6px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;font:800 17px/1 system-ui,sans-serif">${place.number}</div>` +
      `<div style="background:#fff;color:#0f172a;border:2px solid #0f172a;border-radius:8px;padding:3px 7px;font:700 13px/1.2 system-ui,sans-serif;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.35)">${esc(place.label)}</div>` +
      `</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -20],
  });
}

/** Job pin: red dot on the spot, name tag hanging below it (so it never hides a stop number). */
function jobIcon(name: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html:
      `<div style="position:relative;width:0;height:0">` +
      `<div style="position:absolute;left:-8px;top:-8px;width:16px;height:16px;border-radius:9999px;background:#dc2626;border:3px solid #fff;box-shadow:0 0 0 1px #7f1d1d"></div>` +
      `<div style="position:absolute;left:0;top:12px;transform:translateX(-50%);background:#dc2626;color:#fff;padding:2px 6px;border-radius:6px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5);font:800 12px/1.2 system-ui,sans-serif;white-space:nowrap">JOB · ${esc(name)}</div>` +
      `</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -10],
  });
}

function duration(minutes: number | null): string {
  if (minutes == null) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export default function PayrollDayMap({ workDate, segments, jobs }: Props) {
  const [coords, setCoords] = useState<Record<string, Partial<DayMapSegmentInput>>>({});
  const [shopRows, setShopRows] = useState<DayMapShopInput[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [base, setBase] = useState<Base>('street');
  const [full, setFull] = useState(false);
  const [map, setMap] = useState<L.Map | null>(null);

  const ids = useMemo(() => segments.map(s => s.id).sort().join(','), [segments]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const segmentIds = ids ? ids.split(',') : [];
      const [segReply, shopReply] = await Promise.all([
        segmentIds.length
          ? supabase.from('time_segments').select('id, start_latitude, start_longitude, end_latitude, end_longitude').in('id', segmentIds)
          : Promise.resolve({ data: [], error: null }),
        supabase.from('shop_locations').select('id, name, latitude, longitude, radius_m, active'),
      ]);
      if (cancelled) return;
      const next: Record<string, Partial<DayMapSegmentInput>> = {};
      for (const row of (segReply.data ?? []) as Array<Partial<DayMapSegmentInput> & { id: string }>) next[row.id] = row;
      setCoords(next);
      setShopRows((shopReply.data ?? []) as DayMapShopInput[]);
      const problems = [segReply.error?.message, shopReply.error?.message].filter(Boolean);
      setError(problems.length ? `Could not read locations: ${problems.join('; ')}` : null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [ids]);

  const withCoords: DayMapSegmentInput[] = useMemo(
    () => segments.map(s => ({ ...s, ...coords[s.id], id: s.id, kind: s.kind })),
    [segments, coords],
  );
  const stops = useMemo(() => buildStops(withCoords), [withCoords]);
  const pins = useMemo(() => buildJobPins(jobs, withCoords, workDate), [jobs, withCoords, workDate]);
  const shops = useMemo(() => buildShops(shopRows), [shopRows]);
  const places = useMemo(() => buildPlaces(stops, pins, shops), [stops, pins, shops]);
  const bounds = useMemo(
    () => boundsOf([...places, ...pins, ...(places.length || pins.length ? [] : shops)]) ?? boundsOf(shops),
    [places, pins, shops],
  );

  const fitAll = useCallback(() => {
    if (map && bounds) map.fitBounds(bounds, FIT);
  }, [map, bounds]);
  const zoomTo = useCallback((lat: number, lng: number, zoom = 17) => {
    map?.flyTo([lat, lng], zoom, { duration: 0.6 });
  }, [map]);

  // Fit once the map exists, and again whenever its box changes size
  // (full screen, rotation, the panel opening).
  useEffect(() => {
    if (!map) return;
    fitAll();
    const el = map.getContainer();
    const ro = new ResizeObserver(() => { map.invalidateSize(); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [map, fitAll]);
  useEffect(() => {
    if (!map) return;
    const t = window.setTimeout(() => { map.invalidateSize(); fitAll(); }, 120);
    return () => window.clearTimeout(t);
  }, [full, map, fitAll]);

  // Esc leaves full screen; lock page scroll while it is open.
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [full]);

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading map…
      </p>
    );
  }

  const last = places[places.length - 1];
  const chip = 'shrink-0 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 shadow-sm active:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';
  const toggleBtn = (on: boolean) =>
    `px-3 py-1.5 text-sm font-bold ${on ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100'}`;

  // Full screen renders into <body> so no scrolling/overflow ancestor can clip it.
  const mapBlock = (
        <div
          className={full
            ? 'fixed inset-0 z-[2000] flex flex-col bg-white dark:bg-slate-900'
            : 'flex flex-col overflow-hidden rounded-xl border border-slate-300 dark:border-slate-700'}
          style={full ? { paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' } : undefined}
        >
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800/60">
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 dark:border-slate-600" role="group" aria-label="Map style">
              <button type="button" className={toggleBtn(base === 'street')} aria-pressed={base === 'street'} onClick={() => setBase('street')}>Street</button>
              <button type="button" className={toggleBtn(base === 'satellite')} aria-pressed={base === 'satellite'} onClick={() => setBase('satellite')}>Satellite</button>
            </div>
            <button type="button" onClick={fitAll} className={chip}>Show all</button>
            <button
              type="button"
              onClick={() => setFull(f => !f)}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-bold text-white shadow-sm active:bg-blue-700"
            >
              {full ? <Minimize2 className="h-4 w-4" aria-hidden="true" /> : <Maximize2 className="h-4 w-4" aria-hidden="true" />}
              {full ? 'Close full screen' : 'Full screen'}
            </button>
          </div>

          {(shops.length > 0 || pins.length > 0 || last) && (
            <div className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-2 py-2 dark:border-slate-700 dark:bg-slate-900" aria-label="Zoom to">
              <span className="shrink-0 self-center text-xs font-bold uppercase tracking-wide text-slate-500">Zoom to</span>
              {shops.map(shop => (
                <button key={`z-s-${shop.id}`} type="button" className={chip} onClick={() => zoomTo(shop.lat, shop.lng)}>{shop.name}</button>
              ))}
              {pins.map(pin => (
                <button key={`z-j-${pin.id}`} type="button" className={chip} onClick={() => zoomTo(pin.lat, pin.lng)}>{pin.name}</button>
              ))}
              {last && (
                <button type="button" className={chip} onClick={() => zoomTo(last.lat, last.lng)}>Last point ({shortClock(last.lastAt)})</button>
              )}
            </div>
          )}

          <div className={full ? 'min-h-0 flex-1' : ''} style={full ? undefined : { height: '60vh', minHeight: 380 }}>
            <MapContainer bounds={bounds} boundsOptions={FIT} scrollWheelZoom={full} ref={setMap} style={{ height: '100%', width: '100%' }}>
              {base === 'street' ? (
                <TileLayer
                  key="street"
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
                  maxZoom={19}
                />
              ) : (
                <TileLayer
                  key="satellite"
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  attribution='Imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community'
                  maxZoom={19}
                />
              )}
              {shops.map(shop => (
                <Circle key={`shop-c-${shop.id}`} center={[shop.lat, shop.lng]} radius={shop.radiusM}
                  pathOptions={{ color: KIND_COLOR.shop, weight: 2, fillOpacity: 0.12, dashArray: '5 5' }} />
              ))}
              {pins.map(pin => (
                <Circle key={`job-c-${pin.id}`} center={[pin.lat, pin.lng]} radius={pin.radiusM}
                  pathOptions={{ color: '#dc2626', weight: 2, fillOpacity: 0.12 }} />
              ))}
              {pins.map(pin => (
                <Marker key={`job-${pin.id}`} position={[pin.lat, pin.lng]} icon={jobIcon(pin.name)}>
                  <Popup>
                    <strong>{pin.name}</strong>
                    {pin.address && <><br />{pin.address}</>}
                    <br />{[pin.visited ? 'Visited' : null, pin.scheduled ? 'Scheduled this day' : null].filter(Boolean).join(' · ')}
                    <br />Arrival circle {pin.radiusM} m
                  </Popup>
                </Marker>
              ))}
              {places.length > 1 && (
                <Polyline positions={places.map(p => [p.lat, p.lng] as [number, number])}
                  pathOptions={{ color: base === 'satellite' ? '#fde047' : '#1e293b', weight: 3, opacity: 0.7, dashArray: '8 8' }} />
              )}
              {places.map(place => (
                <Marker key={`place-${place.number}`} position={[place.lat, place.lng]} icon={placeIcon(place)} zIndexOffset={1000 + place.number}>
                  <Popup>
                    <strong>#{place.number} · {place.place}</strong>
                    <br />{KIND_NAME[place.kind]} · {shortClock(place.firstAt)}{place.lastAt !== place.firstAt ? ` – ${shortClock(place.lastAt)}` : ''} (MST)
                    {place.minutes != null && <><br />Here {duration(place.minutes)}</>}
                    {place.travelMinutes != null && <><br />After {duration(place.travelMinutes)} of travel</>}
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
          <p className="border-t border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            Dashed line = stop order, not the road actually driven. Red circles = job arrival areas.
          </p>
        </div>
  );

  return (
    <div className="space-y-3">
      {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
      {places.length === 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          No GPS points were recorded for this day{pins.length ? '; showing the day’s job pins only.' : '.'}
        </p>
      )}

      {bounds ? (
        full ? createPortal(mapBlock, document.body) : mapBlock
      ) : (
        <p className="text-sm text-slate-600 dark:text-slate-300">Nothing to map: no GPS points, pinned jobs, or shop location for this day.</p>
      )}

      {places.length > 0 && (
        <div>
          <h5 className="text-xs font-bold uppercase tracking-wide text-slate-500">Stops</h5>
          <ol className="mt-1 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
            {places.map(place => (
              <li key={`list-${place.number}`}>
                <button
                  type="button"
                  onClick={() => zoomTo(place.lat, place.lng)}
                  className="flex w-full items-center gap-3 bg-white px-3 py-2.5 text-left active:bg-slate-100 dark:bg-slate-900 dark:active:bg-slate-800"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-white" style={{ background: KIND_COLOR[place.kind] }}>
                    {place.number}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-900 dark:text-white">{place.place}</span>
                    <span className="block text-xs text-slate-600 dark:text-slate-300">
                      {KIND_NAME[place.kind]} · {shortClock(place.firstAt)}{place.lastAt !== place.firstAt ? `–${shortClock(place.lastAt)}` : ''}
                      {place.minutes != null && place.minutes > 0 ? ` · ${duration(place.minutes)}` : ''}
                      {place.travelMinutes != null ? ` · after ${duration(place.travelMinutes)} travel` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-blue-600 dark:text-blue-400">Zoom</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
