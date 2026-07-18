import { useEffect } from 'react';
import { useApi } from '../useApi.js';

interface SafetyEvent {
  id: string;
  tripId: string;
  kind: 'route_deviation' | 'sos';
  detail: string | null;
  lat: number | null;
  lng: number | null;
  createdAt: string;
  ride: { id: string; originLabel: string; destLabel: string; driverName: string };
}

export default function Safety() {
  const { data, error, loading, reload } = useApi<SafetyEvent[]>('/admin/safety-events');

  // Poll: a safety feed that needs a manual refresh is not a safety feed.
  // Deliberately not a socket — the admin is not a trip participant, and
  // 15s is well inside the window that matters for an operations desk.
  useEffect(() => {
    const t = setInterval(reload, 15_000);
    return () => clearInterval(t);
  }, [reload]);

  return (
    <>
      <h1 className="page-title">Safety Events</h1>
      <p className="page-sub">
        Raised automatically when a vehicle leaves its planned route, or by a passenger pressing SOS.
      </p>

      {error && <div className="alert error">{error}</div>}

      <div className="card">
        <div className="card-head">
          <span className="card-title">{data ? `${data.length} events` : 'Events'}</span>
          <span className="muted">Auto-refreshing</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th><th>Type</th><th>Trip</th><th>Driver</th><th>Detail</th><th>Location</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data && <tr><td colSpan={6} className="empty">Loading…</td></tr>}
              {data?.length === 0 && (
                <tr><td colSpan={6} className="empty">No safety events. That is the good outcome.</td></tr>
              )}
              {data?.map((e) => (
                <tr key={e.id}>
                  <td className="muted">{new Date(e.createdAt).toLocaleString('en-IN')}</td>
                  <td>
                    <span className={`badge ${e.kind === 'sos' ? 'red' : 'amber'}`}>
                      {e.kind === 'sos' ? '⚠ SOS' : '⚠ Route deviation'}
                    </span>
                  </td>
                  <td>{e.ride.originLabel} → {e.ride.destLabel}</td>
                  <td>{e.ride.driverName}</td>
                  <td>{e.detail ?? '—'}</td>
                  <td className="muted">
                    {e.lat != null && e.lng != null ? (
                      <a
                        href={`https://www.openstreetmap.org/?mlat=${e.lat}&mlon=${e.lng}#map=16/${e.lat}/${e.lng}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {e.lat.toFixed(4)}, {e.lng.toFixed(4)}
                      </a>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
