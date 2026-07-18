import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api.js';
import { useApi } from '../useApi.js';

interface OrgSettings {
  id: string;
  name: string;
  code: string;
  city: string;
  registeredAddress: string | null;
  industry: string | null;
  adminContact: string | null;
  fuelCostPerLitre: number;
  defaultMileageKmpl: number;
  costPerKm: number;
}

export default function Settings() {
  const { data, error, loading, reload } = useApi<OrgSettings>('/admin/settings');
  const [form, setForm] = useState<Partial<OrgSettings>>({});
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const set = (k: keyof OrgSettings) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [k]: e.target.value });
    setSaved(false);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSaveError(null);
    setFields({});
    try {
      await api('/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({
          name: form.name,
          registeredAddress: form.registeredAddress,
          industry: form.industry,
          adminContact: form.adminContact,
          fuelCostPerLitre: form.fuelCostPerLitre,
          defaultMileageKmpl: form.defaultMileageKmpl,
          costPerKm: form.costPerKm,
        }),
      });
      setSaved(true);
      reload();
    } catch (err) {
      if (err instanceof ApiError) {
        setSaveError(err.message);
        setFields(err.fields ?? {});
      } else setSaveError('Could not save settings');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="empty">Loading…</div>;
  if (error) return <div className="alert error">{error}</div>;

  return (
    <>
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Organization details and the cost figures used to price rides.</p>

      {saveError && <div className="alert error">{saveError}</div>}
      {saved && <div className="alert success">Settings saved.</div>}

      <form onSubmit={submit}>
        <div className="card">
          <div className="card-head"><span className="card-title">Company Details</span></div>
          <div className="card-body">
            <div className="grid-2">
              <Field label="Company Name" value={form.name ?? ''} onChange={set('name')} err={fields.name} />
              <Field label="Industry" value={form.industry ?? ''} onChange={set('industry')} err={fields.industry} />
              <Field label="Registered Address" value={form.registeredAddress ?? ''} onChange={set('registeredAddress')} err={fields.registeredAddress} />
              <Field label="Admin Contact" type="email" value={form.adminContact ?? ''} onChange={set('adminContact')} err={fields.adminContact} />
            </div>
            <div className="muted">
              Company code <strong>{data?.code}</strong> — employees enter this when they register.
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><span className="card-title">Carpooling Configuration</span></div>
          <div className="card-body">
            <div className="grid-2">
              <Field label="Fuel Cost / Litre (Rs)" type="number" step="0.01" value={String(form.fuelCostPerLitre ?? '')} onChange={set('fuelCostPerLitre')} err={fields.fuelCostPerLitre} />
              <Field label="Default Mileage (km/l)" type="number" step="0.1" value={String(form.defaultMileageKmpl ?? '')} onChange={set('defaultMileageKmpl')} err={fields.defaultMileageKmpl} />
              <Field label="Travel Cost / km (Rs)" type="number" step="0.01" value={String(form.costPerKm ?? '')} onChange={set('costPerKm')} err={fields.costPerKm} />
            </div>
            <div className="muted">
              These drive the suggested fare on Offer Ride: fuel cost is
              (distance ÷ mileage) × fuel price, split across the passengers plus the driver.
              Default mileage applies only to vehicles whose owner did not enter one.
            </div>
          </div>
        </div>

        <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save Settings'}</button>
      </form>
    </>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  err?: string;
  type?: string;
  step?: string;
}) {
  return (
    <div className="field">
      <label>{props.label}</label>
      <input type={props.type ?? 'text'} step={props.step} value={props.value} onChange={props.onChange} />
      {props.err && <div className="err">{props.err}</div>}
    </div>
  );
}
