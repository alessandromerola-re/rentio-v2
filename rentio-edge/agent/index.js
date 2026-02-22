const mqtt = require('mqtt');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const cfg = {
  mqttUrl: process.env.MQTT_URL || 'mqtt://localhost:1883',
  username: process.env.MQTT_USERNAME || undefined,
  password: process.env.MQTT_PASSWORD || undefined,
  tenant: process.env.RENTIO_TENANT || 'windome',
  building: process.env.RENTIO_BUILDING || 'casagiove-01',
  gateway: process.env.RENTIO_GATEWAY || 'gw-0001',
  heartbeatSeconds: Number(process.env.HEARTBEAT_SECONDS || 20),
  queueFile: process.env.EDGE_QUEUE_FILE || '/data/outbox.jsonl',
  maxQueue: Number(process.env.EDGE_MAX_QUEUE || 1000),
  provisioningToken: process.env.PROVISIONING_TOKEN || ''
};

const base = `rentio/v1/${cfg.tenant}/${cfg.building}/gw/${cfg.gateway}`;
const queue = [];

function loadQueue() {
  try {
    const lines = fs.readFileSync(cfg.queueFile, 'utf8').trim().split('\n').filter(Boolean);
    lines.forEach((line) => queue.push(JSON.parse(line)));
  } catch {}
}
function saveQueue() {
  fs.mkdirSync(path.dirname(cfg.queueFile), { recursive: true });
  fs.writeFileSync(cfg.queueFile, queue.map((m) => JSON.stringify(m)).join('\n'));
}
function enqueue(msg) {
  queue.push(msg);
  while (queue.length > cfg.maxQueue) queue.shift();
  saveQueue();
}
function makeEnvelope(data, extra = {}) {
  return {
    v: '1',
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    src: 'edge-agent',
    tenant: cfg.tenant,
    building: cfg.building,
    gateway: cfg.gateway,
    data,
    ...extra
  };
}

function publishMessage(client, topic, payload, opts = { qos: 1, retain: false }) {
  const msg = { topic, payload, opts };
  const doPublish = () => new Promise((resolve, reject) => client.publish(topic, payload, opts, (e) => (e ? reject(e) : resolve())));
  if (!client.connected) return enqueue(msg);
  doPublish().catch(() => enqueue(msg));
}

async function flushQueue(client) {
  while (client.connected && queue.length) {
    const msg = queue[0];
    try {
      await new Promise((res, rej) => client.publish(msg.topic, msg.payload, msg.opts, (e) => (e ? rej(e) : res())));
      queue.shift();
      saveQueue();
    } catch {
      break;
    }
  }
}

loadQueue();
const client = mqtt.connect(cfg.mqttUrl, {
  username: cfg.username,
  password: cfg.password,
  reconnectPeriod: 2000,
  keepalive: 30,
  will: { topic: `${base}/sys/status`, payload: 'offline', qos: 1, retain: true }
});

client.on('connect', () => {
  publishMessage(client, `${base}/sys/status`, 'online', { qos: 1, retain: true });
  publishMessage(client, `${base}/sys/ping`, JSON.stringify(makeEnvelope({ alive: true })), { qos: 1, retain: false });
  if (cfg.provisioningToken) {
    const hello = makeEnvelope({ token: cfg.provisioningToken, version: '0.2.0' });
    publishMessage(client, `${base}/evt/system/hello`, JSON.stringify(hello), { qos: 1, retain: false });
  }
  client.subscribe(`${base}/cmd/#`, { qos: 1 });
  flushQueue(client);
});

client.on('message', (topic, buff) => {
  const prefix = `${base}/cmd/`;
  if (!topic.startsWith(prefix)) return;
  const route = topic.slice(prefix.length);
  let incoming = {};
  try { incoming = JSON.parse(buff.toString('utf8')); } catch {}
  const ack = makeEnvelope({ route, result: 'accepted' }, { corr: incoming.id || null });
  publishMessage(client, `${base}/ack/${route}`, JSON.stringify(ack), { qos: 1, retain: false });
  const evt = makeEnvelope({ route, simulated: true });
  publishMessage(client, `${base}/evt/${route}/done`, JSON.stringify(evt), { qos: 1, retain: false });
});

setInterval(() => {
  const hb = makeEnvelope({ uptime: process.uptime() });
  publishMessage(client, `${base}/evt/system/heartbeat`, JSON.stringify(hb), { qos: 1, retain: false });
}, cfg.heartbeatSeconds * 1000);

process.on('SIGTERM', () => client.end(true, () => process.exit(0)));
