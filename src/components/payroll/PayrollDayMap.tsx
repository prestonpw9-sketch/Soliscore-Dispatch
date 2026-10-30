/**
 * Owner-only map of one worker's day: shop(s), numbered segment start/end
 * points in time order, the jobs visited or scheduled that day with their
 * arrival circles, and a faint line joining stops in order. Lazy-loaded so
 * Leaflet stays out of the main bundle. Read-only.
 */
import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { Circle, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Job } from '@/lib/data';
import { formatPhoenixClock } from '@/lib/payroll/data';
import {
  KIND_COLOR,
  KIND_NAME,
  boundsOf,
  buildJobPins,
  buildShops,
  buildStops,
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

function numberIcon(n: number, color: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="background:${color};color:#fff;width:24px;height:24px;border-radius:9999px;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;font:700 11px/1 system-ui,sans-serif">${n}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
}

function squareIcon(label: string, color: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="background:${color};color:#fff;padding:2px 5px;border-radius:4px;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.45);font:800 10px/1.2 system-ui,sans-serif;white-space:nowrap">${label}</div>`,
    iconAnchor: [12, 10],
    popupAnchor: [0, -10],
  });
}

function FitBounds({ bounds }: { bounds: [[number, number], [number, number]] }) {
  const map = useMap();
  useEffect(() => {
    const fit = () => map.fitBounds(bounds, { padding: [28, 28], maxZoom: 16 });
    fit();
    // The panel may still be sizing (or the WebView rotating); refit once it settles.
    const t = window.setTimeout(() => { map.invalidateSize(); fit(); }, 300);
    return () => window.clearTimeout(t);
  }, [map, bounds]);
  return null;
}

function duration(minutes: number | null): string {
  if (minutes == null) return 'still open';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export default function PayrollDayMap({ workDate, segments, jobs }: Props) {
  const [coords, setCoords] = useState<Record<string, Partial<DayMapSegmentInput>>>({});
  const [shopRows, setShopRows] = useState<DayMapShopInput[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  const bounds = useMemo(
    () => boundsOf([...stops, ...pins, ...(stops.length || pins.length ? [] : shops)]) ?? boundsOf(shops),
    [stops, pins, shops],
  );

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-xs text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading map…
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {error && <p role="alert" className="text-xs text-rose-700 dark:text-rose-300">{error}</p>}
      {stops.length === 0 && (
        <p className="text-xs text-slate-500">
          No GPS points were recorded for this day{pins.length ? '; showing the day’s job pins only.' : '.'}
        </p>
      )}
      {bounds ? (
        <div className="h-72 w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 sm:h-96">
          <MapContainer bounds={bounds} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
              maxZoom={19}
            />
            <FitBounds bounds={bounds} />
            {shops.map(shop => (
              <Circle key={`shop-c-${shop.id}`} center={[shop.lat, shop.lng]} radius={shop.radiusM}
                pathOptions={{ color: KIND_COLOR.shop, weight: 1, fillOpacity: 0.08, dashArray: '4 4' }} />
            ))}
            {shops.map(shop => (
              <Marker key={`shop-${shop.id}`} position={[shop.lat, shop.lng]} icon={squareIcon('SHOP', '#1e3a8a')}>
                <Popup><strong>{shop.name}</strong><br />Shop · {shop.radiusM} m radius</Popup>
              </Marker>
            ))}
            {pins.map(pin => (
              <Circle key={`job-c-${pin.id}`} center={[pin.lat, pin.lng]} radius={pin.radiusM}
                pathOptions={{ color: '#dc2626', weight: 1, fillOpacity: 0.08 }} />
            ))}
            {pins.map(pin => (
              <Marker key={`job-${pin.id}`} position={[pin.lat, pin.lng]}>
                <Popup>
                  <strong>{pin.name}</strong>
                  {pin.address && <><br />{pin.address}</>}
                  <br />{[pin.visited ? 'Visited' : null, pin.scheduled ? 'Scheduled today' : null].filter(Boolean).join(' · ')}
                  <br />Arrival circle {pin.radiusM} m
                </Popup>
              </Marker>
            ))}
            {stops.length > 1 && (
              <Polyline positions={stops.map(s => [s.lat, s.lng] as [number, number])}
                pathOptions={{ color: '#475569', weight: 2, opacity: 0.45, dashArray: '6 6' }} />
            )}
            {stops.map(stop => (
              <Marker key={`stop-${stop.number}`} position={[stop.lat, stop.lng]} icon={numberIcon(stop.number, KIND_COLOR[stop.kind])}
                zIndexOffset={1000 + stop.number}>
                <Popup>
                  <strong>#{stop.number} · {KIND_NAME[stop.kind]}{stop.kind === 'job' && stop.jobName ? ` · ${stop.jobName}` : ''}</strong>
                  <br />{stop.edge === 'start' ? 'Start' : 'End'} point of this segment
                  <br />{formatPhoenixClock(stop.startedAt)} – {stop.endedAt ? formatPhoenixClock(stop.endedAt) : 'open'} (MST)
                  <br />{duration(stop.minutes)}
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      ) : (
        <p className="text-xs text-slate-500">Nothing to map: no GPS points, pinned jobs, or shop location for this day.</p>
      )}
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600 dark:text-slate-300">
        {(Object.keys(KIND_COLOR) as Array<keyof typeof KIND_COLOR>).map(kind => (
          <li key={kind} className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: KIND_COLOR[kind] }} /> {KIND_NAME[kind]}
          </li>
        ))}
        <li>Blue pins: jobs (red circle = arrival area)</li>
        <li>Dashed line: stop order, not the actual route driven</li>
      </ul>
    </div>
  );
}
