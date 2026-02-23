const mqtt = require('mqtt');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const cfg = {
  mqttUrl: process.env.MQTT_URL || 'mqtt://localhost:1883',
  username: process.env.MQTT_USERNAME || undefined,
  password: process.env.MQTT_PASSWORD || undefined,
  tenant: process.env.EDGE_RENTIO_TENANT || 'windome',
  building: process.env.EDGE_RENTIO_BUILDING || 'casagiove-01',
  gateway: process.env.EDGE_RENTIO_GATEWAY || 'gw-0001',
  heartbeatSeconds: Number(process.env.HEARTBEAT_SECONDS || 20),
  queueFile: process.env.EDGE_QUEUE_FILE || '/data/queue.jsonl',
  maxQueue: Number(process.env.EDGE_MAX_QUEUE || 1000),
  provisioningToken: process.env.PROVISIONING_TOKEN || ''
};

const base = `rentio/v1/${cfg.tenant}/${cfg.building}/gw/${cfg.gateway}`;
const outbox = [];
const seenCmd = new Set();
let flushInterval = null;

function mkEnvelope(data, extra) {
  return {
    v: '1',
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    src: 'edge-agent',
    tenant: cfg.tenant,
    building: cfg.building,
    gateway: cfg.gateway,
    data: data || {},
    ...(extra || {})
  };
}

function loadOutbox() {
  try {
    const content = fs.readFileSync(cfg.queueFile, 'utf8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      outbox.push(JSON.parse(line));
    }
  } catch {
    // first run, queue file can be absent
  }
}

function saveOutbox() {
  fs.mkdirSync(path.dirname(cfg.queueFile), { recursive: true });
  fs.writeFileSync(cfg.queueFile, outbox.map((m) => JSON.stringify(m)).join('\n'));
}

function pushOutbox(msg) {
  outbox.push(msg);
  while (outbox.length > cfg.maxQueue) outbox.shift();
  saveOutbox();
}

function queuePublish(topic, payloadObj, options) {
  return {
    topic,
    payload: JSON.stringify(payloadObj),
    options: options || { qos: 1, retain: false }
  };
}

function publishOrBuffer(client, msg) {
  if (!client.connected) {
    pushOutbox(msg);
    return;
  }

  client.publish(msg.topic, msg.payload, msg.options, (err) => {
    if (err) pushOutbox(msg);
  });
}

function startFlusher(client) {
  if (flushInterval) return;
  flushInterval = setInterval(() => {
    if (!client.connected || outbox.length === 0) return;
    const msg = outbox[0];
    client.publish(msg.topic, msg.payload, msg.options, (err) => {
      if (err) return;
      outbox.shift();
      saveOutbox();
    });
  }, 1000);
}

loadOutbox();

const willPayload = JSON.stringify(mkEnvelope({ status: 'offline' }));
const client = mqtt.connect(cfg.mqttUrl, {
  username: cfg.username,
  password: cfg.password,
  keepalive: 30,
  reconnectPeriod: 2000,
  will: {
    topic: `${base}/sys/status`,
    payload: willPayload,
    qos: 1,
    retain: true
  }
});

client.on('connect', () => {
  publishOrBuffer(client, queuePublish(`${base}/sys/status`, mkEnvelope({ status: 'online' }), { qos: 1, retain: true }));

  if (cfg.provisioningToken) {
    const hello = mkEnvelope({ token: cfg.provisioningToken, version: '0.2.0' });
    publishOrBuffer(client, queuePublish(`${base}/evt/system/hello`, hello, { qos: 1, retain: false }));
  }

  client.subscribe(`${base}/cmd/#`, { qos: 1 });
  startFlusher(client);
});

client.on('message', (topic, payloadBuf) => {
  const prefix = `${base}/cmd/`;
  if (!topic.startsWith(prefix)) return;

  const route = topic.slice(prefix.length);
  let cmd = null;
  try {
    cmd = JSON.parse(payloadBuf.toString('utf8'));
  } catch {
    cmd = null;
  }

  const cmdId = cmd && cmd.id ? cmd.id : null;
  const ackTopic = `${base}/ack/${route}`;
  const evtTopic = `${base}/evt/${route}`;

  if (cmdId && seenCmd.has(cmdId)) {
    const duplicateAck = mkEnvelope({ status: 'duplicate' }, { corr: cmdId });
    publishOrBuffer(client, queuePublish(ackTopic, duplicateAck, { qos: 1, retain: false }));
    return;
  }

  if (cmdId) seenCmd.add(cmdId);

  const ack = mkEnvelope({ status: 'ok' }, { corr: cmdId });
  const evt = mkEnvelope({ executed: true, route });
  publishOrBuffer(client, queuePublish(ackTopic, ack, { qos: 1, retain: false }));
  publishOrBuffer(client, queuePublish(evtTopic, evt, { qos: 1, retain: false }));
});

setInterval(() => {
  const hb = mkEnvelope({ status: 'online', heartbeat: true });
  publishOrBuffer(client, queuePublish(`${base}/sys/status`, hb, { qos: 1, retain: true }));
}, cfg.heartbeatSeconds * 1000);

process.on('SIGTERM', () => client.end(true, () => process.exit(0)));
process.on('SIGINT', () => client.end(true, () => process.exit(0)));
