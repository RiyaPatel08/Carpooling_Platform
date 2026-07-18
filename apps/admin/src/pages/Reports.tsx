import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';
import { useApi } from '../useApi.js';

/**
 * Chart colors are the validated categorical slots (blue, green), not the
 * brand green — brand green stays on UI chrome so a series never impersonates
 * a button. Worst adjacent normal-vision dE 29.0, CVD-clean on white.
 */
const SERIES_1 = '#2a78d6';
const SERIES_2 = '#008300';
const GRID = '#e1e0d9';
const AXIS = '#898781';

interface Summary {
  totalTrips: number;
  totalDistanceKm: number;
  totalFuelCost: number;
  costPerKm: number;
  utilizationRate: number;
  totalPassengerKm: number;
  co2SavedKg: number;
  activeEmployees: number;
  registeredVehicles: number;
}

interface VehicleRow {
  vehicleId: string;
  model: string;
  registrationNo: string;
  ownerName: string;
  trips: number;
  distanceKm: number;
  fuelCost: number;
  costPerKm: number;
}

interface MonthRow {
  month: string;
  trips: number;
  revenue: number;
  fuelCost: number;
  netProfit: number;
  co2SavedKg: number;
}

const rupee = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export default function Reports() {
  const summary = useApi<Summary>('/reports/summary');
  const vehicles = useApi<VehicleRow[]>('/reports/vehicles');
  const monthly = useApi<MonthRow[]>('/reports/monthly');

  const s = summary.data;

  return (
    <>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-sub">Travel activity, transport cost and emissions avoided.</p>

      {summary.error && <div className="alert error">{summary.error}</div>}

      <div className="stats">
        <Stat label="Total Employees" value={s ? String(s.activeEmployees) : '—'} />
        <Stat label="Registered Vehicles" value={s ? String(s.registeredVehicles) : '—'} />
        <Stat label="Completed Trips" value={s ? String(s.totalTrips) : '—'} />
        <Stat label="Distance Travelled" value={s ? `${s.totalDistanceKm.toLocaleString('en-IN')} km` : '—'} />
        <Stat label="Total Fuel Cost" value={s ? rupee(s.totalFuelCost) : '—'} />
        <Stat label="Cost / km" value={s ? `₹${s.costPerKm.toFixed(2)}` : '—'} />
        <Stat label="Seat Utilization" value={s ? `${s.utilizationRate.toFixed(0)}%` : '—'} />
        {/* The number an enterprise actually buys this product for. */}
        <Stat label="CO₂ Avoided" value={s ? `${s.co2SavedKg.toFixed(1)} kg` : '—'} accent />
      </div>

      {/* Two measures, one rupee scale — grouped, never a second y-axis. */}
      <div className="card">
        <div className="card-head">
          <span className="card-title">Revenue vs fuel cost by month</span>
        </div>
        <div className="card-body">
          {monthly.data && monthly.data.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthly.data} margin={{ top: 8, right: 8, bottom: 4, left: 8 }} barGap={2}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="month" stroke={AXIS} tickLine={false} axisLine={{ stroke: GRID }} fontSize={12} />
                <YAxis stroke={AXIS} tickLine={false} axisLine={false} fontSize={12} tickFormatter={(v) => `₹${v}`} />
                <Tooltip
                  formatter={(v: number, name) => [rupee(v), name]}
                  contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
                  cursor={{ fill: 'rgba(18,33,29,0.04)' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 13 }} />
                <Bar dataKey="revenue" name="Fares collected" fill={SERIES_1} radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="fuelCost" name="Fuel cost" fill={SERIES_2} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty">
              {monthly.loading ? 'Loading…' : 'No completed trips yet — complete a trip to populate reports.'}
            </div>
          )}
        </div>
      </div>

      {/* One series, so the title carries identity and no legend box is needed. */}
      <div className="card">
        <div className="card-head">
          <span className="card-title">Fuel cost by vehicle</span>
        </div>
        <div className="card-body">
          {vehicles.data && vehicles.data.some((v) => v.trips > 0) ? (
            <ResponsiveContainer width="100%" height={Math.max(180, (vehicles.data.length ?? 0) * 52)}>
              <BarChart
                data={vehicles.data.filter((v) => v.trips > 0)}
                layout="vertical"
                margin={{ top: 8, right: 24, bottom: 4, left: 8 }}
              >
                <CartesianGrid stroke={GRID} horizontal={false} />
                <XAxis type="number" stroke={AXIS} tickLine={false} axisLine={false} fontSize={12} tickFormatter={(v) => `₹${v}`} />
                <YAxis type="category" dataKey="registrationNo" stroke={AXIS} tickLine={false} axisLine={{ stroke: GRID }} fontSize={12} width={92} />
                <Tooltip
                  formatter={(v: number) => [rupee(v), 'Fuel cost']}
                  contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
                  cursor={{ fill: 'rgba(18,33,29,0.04)' }}
                />
                <Bar dataKey="fuelCost" fill={SERIES_1} radius={[0, 4, 4, 0]} maxBarSize={24}>
                  {vehicles.data.filter((v) => v.trips > 0).map((v) => (
                    <Cell key={v.vehicleId} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty">{vehicles.loading ? 'Loading…' : 'No vehicle activity yet.'}</div>
          )}
        </div>
      </div>

      {/* Mockup's Financial Summary table. Doubles as the chart's table view. */}
      <div className="card">
        <div className="card-head"><span className="card-title">Financial summary by month</span></div>
        <div className="table-wrap">
          <table style={{ fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr>
                <th>Month</th><th>Trips</th><th>Fares</th><th>Fuel Cost</th><th>Net</th><th>CO₂ Avoided</th>
              </tr>
            </thead>
            <tbody>
              {monthly.data?.length === 0 && (
                <tr><td colSpan={6} className="empty">No completed trips yet.</td></tr>
              )}
              {monthly.data?.map((m) => (
                <tr key={m.month}>
                  <td>{m.month}</td>
                  <td>{m.trips}</td>
                  <td>{rupee(m.revenue)}</td>
                  <td>{rupee(m.fuelCost)}</td>
                  <td style={{ color: m.netProfit >= 0 ? '#006300' : 'var(--danger)' }}>
                    {rupee(m.netProfit)}
                  </td>
                  <td>{m.co2SavedKg.toFixed(1)} kg</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><span className="card-title">Vehicle-wise cost analysis</span></div>
        <div className="table-wrap">
          <table style={{ fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr>
                <th>Registration</th><th>Model</th><th>Driver</th><th>Trips</th><th>Distance</th><th>Fuel Cost</th><th>Cost / km</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.data?.length === 0 && (
                <tr><td colSpan={7} className="empty">No vehicles yet.</td></tr>
              )}
              {vehicles.data?.map((v) => (
                <tr key={v.vehicleId}>
                  <td><strong>{v.registrationNo}</strong></td>
                  <td>{v.model}</td>
                  <td>{v.ownerName}</td>
                  <td>{v.trips}</td>
                  <td>{v.distanceKm.toFixed(1)} km</td>
                  <td>{rupee(v.fuelCost)}</td>
                  <td>{v.costPerKm > 0 ? `₹${v.costPerKm.toFixed(2)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value${accent ? ' accent' : ''}`}>{value}</div>
    </div>
  );
}
