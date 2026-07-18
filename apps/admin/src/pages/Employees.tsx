import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api.js';
import { useApi } from '../useApi.js';

interface Employee {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  department: string | null;
  manager: string | null;
  location: string | null;
  isActive: boolean;
  vehicleCount: number;
  ridesOffered: number;
  ridesTaken: number;
}

export default function Employees() {
  const { data, error, loading, reload } = useApi<Employee[]>('/admin/employees');
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  /** The mockup's Platform Access: Granted / Revoked toggle. */
  async function toggleAccess(emp: Employee) {
    setBusyId(emp.id);
    setActionError(null);
    try {
      await api(`/admin/employees/${emp.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !emp.isActive }),
      });
      reload();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Could not update access');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <h1 className="page-title">Employees</h1>
      <p className="page-sub">Everyone registered under your organization.</p>

      {error && <div className="alert error">{error}</div>}
      {actionError && <div className="alert error">{actionError}</div>}

      <div className="card">
        <div className="card-head">
          <span className="card-title">
            {data ? `${data.length} employees` : 'Employees'}
          </span>
          <button className="btn small" onClick={() => setAdding((v) => !v)}>
            {adding ? 'Cancel' : '+ Add Employee'}
          </button>
        </div>

        {adding && (
          <div className="card-body" style={{ borderBottom: '1px solid var(--border)' }}>
            <AddEmployee
              onDone={() => {
                setAdding(false);
                reload();
              }}
            />
          </div>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Department</th>
                <th>Manager</th>
                <th>Location</th>
                <th>Activity</th>
                <th>Platform Access</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="empty">Loading…</td></tr>
              )}
              {!loading && data?.length === 0 && (
                <tr><td colSpan={7} className="empty">No employees yet.</td></tr>
              )}
              {data?.map((e) => (
                <tr key={e.id}>
                  <td>
                    <strong>{e.name}</strong>
                    {e.role === 'admin' && <span className="badge grey" style={{ marginLeft: 8 }}>Admin</span>}
                  </td>
                  <td>{e.email}</td>
                  <td>{e.department ?? '—'}</td>
                  <td>{e.manager ?? '—'}</td>
                  <td>{e.location ?? '—'}</td>
                  <td className="muted">
                    {e.ridesOffered} offered · {e.ridesTaken} taken
                  </td>
                  <td>
                    <button
                      className={`badge ${e.isActive ? 'green' : 'red'}`}
                      style={{ border: 'none', cursor: 'pointer' }}
                      disabled={busyId === e.id}
                      onClick={() => toggleAccess(e)}
                      title="Click to toggle platform access"
                    >
                      {busyId === e.id ? '…' : e.isActive ? 'Granted' : 'Revoked'}
                    </button>
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

function AddEmployee({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({
    name: '', email: '', phone: '', password: '', department: '', manager: '', location: '',
  });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      // Drop empty optionals rather than sending "" — the schema rejects
      // blank strings for fields that are meant to be absent.
      const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''));
      await api('/admin/employees', { method: 'POST', body: JSON.stringify(payload) });
      onDone();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields ?? {});
      } else setError('Could not add employee');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {error && <div className="alert error">{error}</div>}
      <div className="grid-2">
        <Field label="Name" value={form.name} onChange={set('name')} err={fields.name} required />
        <Field label="Email" type="email" value={form.email} onChange={set('email')} err={fields.email} required />
        <Field label="Mobile" value={form.phone} onChange={set('phone')} err={fields.phone} required placeholder="9876500000" />
        <Field label="Temporary password" type="password" value={form.password} onChange={set('password')} err={fields.password} required />
        <Field label="Department" value={form.department} onChange={set('department')} err={fields.department} />
        <Field label="Manager" value={form.manager} onChange={set('manager')} err={fields.manager} />
        <Field label="Location" value={form.location} onChange={set('location')} err={fields.location} />
      </div>
      <button className="btn" disabled={busy}>{busy ? 'Adding…' : 'Add employee'}</button>
    </form>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  err?: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="field">
      <label>{props.label}{props.required && ' *'}</label>
      <input
        type={props.type ?? 'text'}
        value={props.value}
        onChange={props.onChange}
        required={props.required}
        placeholder={props.placeholder}
      />
      {props.err && <div className="err">{props.err}</div>}
    </div>
  );
}
