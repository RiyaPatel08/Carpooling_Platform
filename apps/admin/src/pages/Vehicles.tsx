import { useState } from 'react';
import { api, ApiError } from '../api.js';
import { useApi } from '../useApi.js';

interface Vehicle {
  id: string;
  ownerName?: string;
  model: string;
  registrationNo: string;
  seatingCapacity: number;
  mileageKmpl: number | null;
  color: string | null;
  status: 'pending' | 'approved' | 'inactive';
}

const BADGE: Record<Vehicle['status'], string> = {
  approved: 'green',
  pending: 'amber',
  inactive: 'grey',
};

export default function Vehicles() {
  const { data, error, loading, reload } = useApi<Vehicle[]>('/admin/vehicles');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function setStatus(v: Vehicle, status: Vehicle['status']) {
    setBusyId(v.id);
    setActionError(null);
    try {
      await api(`/admin/vehicles/${v.id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      reload();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Could not update vehicle');
    } finally {
      setBusyId(null);
    }
  }

  const pending = data?.filter((v) => v.status === 'pending').length ?? 0;

  return (
    <>
      <h1 className="page-title">Vehicles</h1>
      <p className="page-sub">
        Vehicles registered by employees. A vehicle must be approved before it can carry rides.
      </p>

      {error && <div className="alert error">{error}</div>}
      {actionError && <div className="alert error">{actionError}</div>}
      {pending > 0 && (
        <div className="alert" style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)' }}>
          {pending} vehicle{pending > 1 ? 's are' : ' is'} awaiting your approval.
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <span className="card-title">{data ? `${data.length} registered vehicles` : 'Vehicles'}</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Registration</th>
                <th>Model</th>
                <th>Seats</th>
                <th>Mileage</th>
                <th>Driver</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="empty">Loading…</td></tr>}
              {!loading && data?.length === 0 && (
                <tr><td colSpan={7} className="empty">No vehicles registered yet.</td></tr>
              )}
              {data?.map((v) => (
                <tr key={v.id}>
                  <td><strong>{v.registrationNo}</strong></td>
                  <td>
                    {v.model}
                    {v.color && <span className="muted"> · {v.color}</span>}
                  </td>
                  <td>{v.seatingCapacity}</td>
                  <td>{v.mileageKmpl ? `${v.mileageKmpl} km/l` : '—'}</td>
                  <td>{v.ownerName ?? '—'}</td>
                  <td><span className={`badge ${BADGE[v.status]}`}>{label(v.status)}</span></td>
                  <td>
                    {v.status === 'pending' && (
                      <button className="btn small" disabled={busyId === v.id} onClick={() => setStatus(v, 'approved')}>
                        Approve
                      </button>
                    )}
                    {v.status === 'approved' && (
                      <button className="btn small secondary" disabled={busyId === v.id} onClick={() => setStatus(v, 'inactive')}>
                        Deactivate
                      </button>
                    )}
                    {v.status === 'inactive' && (
                      <button className="btn small secondary" disabled={busyId === v.id} onClick={() => setStatus(v, 'approved')}>
                        Reactivate
                      </button>
                    )}
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

function label(s: Vehicle['status']) {
  return s === 'approved' ? 'Active' : s === 'pending' ? 'Pending approval' : 'Inactive';
}
