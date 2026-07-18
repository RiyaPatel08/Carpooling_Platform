import { useState } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { getAuth, logout, type StoredAuth } from './api.js';
import Login from './pages/Login.js';
import Employees from './pages/Employees.js';
import Vehicles from './pages/Vehicles.js';
import Settings from './pages/Settings.js';
import Reports from './pages/Reports.js';
import Safety from './pages/Safety.js';

export default function App() {
  const [auth, setAuthState] = useState<StoredAuth | null>(getAuth());
  const navigate = useNavigate();

  if (!auth) return <Login onSignedIn={setAuthState} />;

  const signOut = () => {
    logout();
    setAuthState(null);
    navigate('/');
  };

  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="brand">
          SyncRoute
          <small>Company Administration</small>
        </div>

        <NavLink to="/reports" className={navClass}>Dashboard</NavLink>
        <NavLink to="/employees" className={navClass}>Employees</NavLink>
        <NavLink to="/vehicles" className={navClass}>Vehicles</NavLink>
        <NavLink to="/safety" className={navClass}>Safety Events</NavLink>
        <NavLink to="/settings" className={navClass}>Settings</NavLink>

        <div style={{ marginTop: 'auto', paddingTop: 20 }}>
          <div className="muted" style={{ padding: '0 12px 10px' }}>
            {auth.user.name}
            <br />
            {auth.user.email}
          </div>
          <button className="btn secondary small" onClick={signOut}>Sign out</button>
        </div>
      </nav>

      <main className="main">
        <Routes>
          <Route path="/reports" element={<Reports />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/vehicles" element={<Vehicles />} />
          <Route path="/safety" element={<Safety />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/reports" replace />} />
        </Routes>
      </main>
    </div>
  );
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? 'nav-item active' : 'nav-item';
