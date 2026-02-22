import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

const API = (window as any).__CORE_API_URL__ || import.meta.env.VITE_CORE_API_URL || process.env.CORE_API_URL || 'http://localhost:3001';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [gateways, setGateways] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [filters, setFilters] = useState({ gateway: '', channel: '' });

  const login = async (e: any) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const res = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: form.get('email'), password: form.get('password') }) });
    const json = await res.json();
    setToken(json.token); localStorage.setItem('token', json.token);
  };
  const load = async () => {
    const hdr = { Authorization: `Bearer ${token}` };
    setGateways(await (await fetch(`${API}/gateways`, { headers: hdr })).json());
    const qs = new URLSearchParams(filters as any).toString();
    setEvents(await (await fetch(`${API}/events?${qs}`, { headers: hdr })).json());
  };
  const createToken = async () => {
    const tenantId = prompt('tenant id'); const buildingId = prompt('building id');
    if (!tenantId || !buildingId) return;
    const res = await fetch(`${API}/tenants/${tenantId}/buildings/${buildingId}/provisioning-token`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    await navigator.clipboard.writeText(json.token);
    alert(`Token copied. Expires ${json.expiresAt}`);
  };

  if (!token) return <form onSubmit={login}><h2>Rentio Login</h2><input name='email' placeholder='email' /><input type='password' name='password' placeholder='password' /><button>Login</button></form>;
  return <div style={{ fontFamily: 'sans-serif', padding: 16 }}>
    <h2>Rentio Admin</h2>
    <button onClick={load}>Refresh</button> <button onClick={createToken}>Create Provisioning Token</button>
    <h3>Gateways</h3>
    <input placeholder='gateway filter' value={filters.gateway} onChange={(e) => setFilters({ ...filters, gateway: e.target.value })} />
    <table border={1}><thead><tr><th>Tenant</th><th>Building</th><th>Gateway</th><th>Status</th><th>Last Seen</th></tr></thead><tbody>{gateways.filter(g=>!filters.gateway||g.gatewayId.includes(filters.gateway)).map((g)=><tr key={g.id}><td>{g.tenant.slug}</td><td>{g.building.slug}</td><td>{g.gatewayId}</td><td>{g.status}</td><td>{g.lastSeenAt}</td></tr>)}</tbody></table>
    <h3>Events</h3>
    <input placeholder='channel filter' value={filters.channel} onChange={(e) => setFilters({ ...filters, channel: e.target.value })} />
    {events.filter(e=>!filters.channel||e.channel===filters.channel).map((ev)=><details key={ev.id}><summary>{ev.channel} {ev.type} {ev.ts}</summary><pre>{JSON.stringify(ev.payload,null,2)}</pre></details>)}
  </div>;
}

createRoot(document.getElementById('root')!).render(<App />);
