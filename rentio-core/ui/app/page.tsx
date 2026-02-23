'use client';

import { useMemo, useState } from 'react';

type Gateway = {
  id: string;
  gatewayId: string;
  status: string;
  lastSeenAt: string | null;
  tenant: { slug: string };
  building: { slug: string };
};

type EventRow = { id: string; ts: string; channel: string; type: string; payload: unknown };

const API = process.env.NEXT_PUBLIC_CORE_API_URL || 'http://localhost:18081';

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
        if (!res.ok) return setError('Credenziali non valide');
        const data = await res.json();
        localStorage.setItem('token', data.token);
        onLogin(data.token);
      }}
      style={{ maxWidth: 360, margin: '40px auto', display: 'grid', gap: 8, fontFamily: 'sans-serif' }}
    >
      <h2>Rentio Login</h2>
      <input required name="email" placeholder="Email" />
      <input required name="password" type="password" placeholder="Password" />
      <button type="submit">Login</button>
      {error && <small style={{ color: 'crimson' }}>{error}</small>}
    </form>
  );
}

export default function Page() {
  const [token, setToken] = useState<string>(() => (typeof window !== 'undefined' ? localStorage.getItem('token') || '' : ''));
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [view, setView] = useState<'gateways' | 'events' | 'provisioning'>('gateways');
  const [gf, setGf] = useState({ tenant: '', building: '', status: '' });
  const [ef, setEf] = useState({ tenant: '', building: '', gateway: '', channel: '', type: '', from: '', to: '' });

  if (!token) return <Login onLogin={setToken} />;

  return (
    <main style={{ padding: 16, fontFamily: 'sans-serif' }}>
      <h2>Rentio Admin Console</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setView('gateways')}>Gateways</button>
        <button onClick={() => setView('events')}>Events</button>
        <button onClick={() => setView('provisioning')}>Provisioning</button>
        <button onClick={() => { localStorage.removeItem('token'); setToken(''); }}>Logout</button>
      </div>

      {view === 'gateways' && (
        <section>
          <h3>Gateways</h3>
          <input placeholder="tenant" value={gf.tenant} onChange={(e) => setGf({ ...gf, tenant: e.target.value })} />
          <input placeholder="building" value={gf.building} onChange={(e) => setGf({ ...gf, building: e.target.value })} />
          <input placeholder="status" value={gf.status} onChange={(e) => setGf({ ...gf, status: e.target.value })} />
          <button onClick={async () => {
            const qs = new URLSearchParams(Object.entries(gf).filter(([,v])=>v) as [string,string][]).toString();
            const res = await fetch(`${API}/gateways?${qs}`, { headers });
            if (res.ok) setGateways(await res.json());
          }}>Search</button>
          <table border={1} cellPadding={6} style={{ marginTop: 12, width: '100%' }}>
            <thead><tr><th>Tenant</th><th>Building</th><th>Gateway</th><th>Status</th><th>Last seen</th></tr></thead>
            <tbody>{gateways.map((g)=><tr key={g.id}><td>{g.tenant.slug}</td><td>{g.building.slug}</td><td>{g.gatewayId}</td><td>{g.status}</td><td>{g.lastSeenAt || '-'}</td></tr>)}</tbody>
          </table>
        </section>
      )}

      {view === 'events' && (
        <section>
          <h3>Events</h3>
          <input placeholder="tenant" value={ef.tenant} onChange={(e) => setEf({ ...ef, tenant: e.target.value })} />
          <input placeholder="building" value={ef.building} onChange={(e) => setEf({ ...ef, building: e.target.value })} />
          <input placeholder="gateway" value={ef.gateway} onChange={(e) => setEf({ ...ef, gateway: e.target.value })} />
          <input placeholder="channel" value={ef.channel} onChange={(e) => setEf({ ...ef, channel: e.target.value })} />
          <input placeholder="type" value={ef.type} onChange={(e) => setEf({ ...ef, type: e.target.value })} />
          <input type="datetime-local" value={ef.from} onChange={(e) => setEf({ ...ef, from: e.target.value })} />
          <input type="datetime-local" value={ef.to} onChange={(e) => setEf({ ...ef, to: e.target.value })} />
          <button onClick={async () => {
            const qs = new URLSearchParams(Object.entries(ef).filter(([,v])=>v) as [string,string][]).toString();
            const res = await fetch(`${API}/events?${qs}`, { headers });
            if (res.ok) setEvents(await res.json());
          }}>Search</button>
          <div>{events.map((e)=><details key={e.id}><summary>{e.ts} [{e.channel}] {e.type}</summary><pre>{JSON.stringify(e.payload,null,2)}</pre></details>)}</div>
        </section>
      )}

      {view === 'provisioning' && (
        <section>
          <h3>Provisioning token</h3>
          <button onClick={async () => {
            const tenantId = prompt('tenant id');
            const buildingId = prompt('building id');
            if (!tenantId || !buildingId) return;
            const res = await fetch(`${API}/tenants/${tenantId}/buildings/${buildingId}/provisioning-token`, { method: 'POST', headers });
            if (!res.ok) return alert('Errore creazione token');
            const json = await res.json();
            await navigator.clipboard.writeText(json.token);
            alert(`Token copiato. Scadenza: ${json.expiresAt}`);
          }}>Create token</button>
        </section>
      )}
    </main>
  );
}
