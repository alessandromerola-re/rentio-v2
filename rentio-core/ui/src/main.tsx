import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

type Gateway = {
  id: string;
  gatewayId: string;
  status: string;
  lastSeenAt: string | null;
  tenant: { slug: string };
  building: { slug: string };
};

type EventRow = {
  id: string;
  ts: string;
  channel: string;
  type: string;
  payload: unknown;
};

const API = import.meta.env.VITE_CORE_API_URL || 'http://localhost:3001';

function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [error, setError] = useState('');

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const res = await fetch(`${API}/auth/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: form.get('email'), password: form.get('password') })
        });

        if (!res.ok) {
          setError('Login fallito');
          return;
        }

        const json = await res.json();
        localStorage.setItem('token', json.token);
        onLogin(json.token);
      }}
      style={{ maxWidth: 360, margin: '48px auto', display: 'grid', gap: 8, fontFamily: 'sans-serif' }}
    >
      <h2>Rentio Login</h2>
      <input required name="email" placeholder="email" />
      <input required type="password" name="password" placeholder="password" />
      <button type="submit">Login</button>
      {error ? <small style={{ color: 'crimson' }}>{error}</small> : null}
    </form>
  );
}

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [view, setView] = useState<'gateways' | 'events' | 'provisioning'>('gateways');
  const [gf, setGf] = useState({ tenant: '', building: '', gateway: '', status: '' });
  const [ef, setEf] = useState({ tenant: '', building: '', gateway: '', channel: '', type: '', from: '', to: '' });

  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const loadGateways = async () => {
    const qs = new URLSearchParams(Object.entries(gf).filter(([, v]) => v) as [string, string][]).toString();
    const res = await fetch(`${API}/gateways?${qs}`, { headers: authHeaders });
    if (res.ok) setGateways(await res.json());
  };

  const loadEvents = async () => {
    const qs = new URLSearchParams(Object.entries(ef).filter(([, v]) => v) as [string, string][]).toString();
    const res = await fetch(`${API}/events?${qs}`, { headers: authHeaders });
    if (res.ok) setEvents(await res.json());
  };

  const createProvisioningToken = async () => {
    const tenantId = prompt('tenant id');
    const buildingId = prompt('building id');
    if (!tenantId || !buildingId) return;

    const res = await fetch(`${API}/tenants/${tenantId}/buildings/${buildingId}/provisioning-token`, {
      method: 'POST',
      headers: authHeaders
    });

    if (!res.ok) {
      alert('Impossibile creare token');
      return;
    }

    const json = await res.json();
    await navigator.clipboard.writeText(json.token);
    alert(`Token copiato. Scadenza: ${json.expiresAt}`);
  };

  if (!token) return <Login onLogin={setToken} />;

  return (
    <div style={{ fontFamily: 'sans-serif', padding: 16 }}>
      <h2>Rentio Admin Console</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setView('gateways')}>Gateways</button>
        <button onClick={() => setView('events')}>Events</button>
        <button onClick={() => setView('provisioning')}>Provisioning</button>
        <button
          onClick={() => {
            localStorage.removeItem('token');
            setToken('');
          }}
        >
          Logout
        </button>
      </div>

      {view === 'gateways' ? (
        <section>
          <h3>Gateways</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input placeholder="tenant" value={gf.tenant} onChange={(e) => setGf({ ...gf, tenant: e.target.value })} />
            <input placeholder="building" value={gf.building} onChange={(e) => setGf({ ...gf, building: e.target.value })} />
            <input placeholder="gateway" value={gf.gateway} onChange={(e) => setGf({ ...gf, gateway: e.target.value })} />
            <input placeholder="status" value={gf.status} onChange={(e) => setGf({ ...gf, status: e.target.value })} />
            <button onClick={loadGateways}>Cerca</button>
          </div>
          <table border={1} cellPadding={6} style={{ marginTop: 12, width: '100%' }}>
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Building</th>
                <th>Gateway</th>
                <th>Status</th>
                <th>Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {gateways.map((g) => (
                <tr key={g.id}>
                  <td>{g.tenant.slug}</td>
                  <td>{g.building.slug}</td>
                  <td>{g.gatewayId}</td>
                  <td>{g.status}</td>
                  <td>{g.lastSeenAt || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {view === 'events' ? (
        <section>
          <h3>Events</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input placeholder="tenant" value={ef.tenant} onChange={(e) => setEf({ ...ef, tenant: e.target.value })} />
            <input placeholder="building" value={ef.building} onChange={(e) => setEf({ ...ef, building: e.target.value })} />
            <input placeholder="gateway" value={ef.gateway} onChange={(e) => setEf({ ...ef, gateway: e.target.value })} />
            <input placeholder="channel" value={ef.channel} onChange={(e) => setEf({ ...ef, channel: e.target.value })} />
            <input placeholder="type" value={ef.type} onChange={(e) => setEf({ ...ef, type: e.target.value })} />
            <input type="datetime-local" value={ef.from} onChange={(e) => setEf({ ...ef, from: e.target.value })} />
            <input type="datetime-local" value={ef.to} onChange={(e) => setEf({ ...ef, to: e.target.value })} />
            <button onClick={loadEvents}>Cerca</button>
          </div>
          <div style={{ marginTop: 12 }}>
            {events.map((ev) => (
              <details key={ev.id}>
                <summary>
                  {ev.ts} - [{ev.channel}] {ev.type}
                </summary>
                <pre>{JSON.stringify(ev.payload, null, 2)}</pre>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      {view === 'provisioning' ? (
        <section>
          <h3>Provisioning</h3>
          <p>Crea token di provisioning e copia negli appunti.</p>
          <button onClick={createProvisioningToken}>Crea token</button>
        </section>
      ) : null}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
