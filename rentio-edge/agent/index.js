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
const queue = [];
const processedCmdIds = new Set();
let flushTimer = null;

function envelope(data = {}, extra = {}) {
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

function readQueue() {
  try {
    const content = fs.readFileSync(cfg.queueFile, 'utf8');
    for (const line of content.split('\n').filter(Boolean)) queue.push(JSON.parse(line));
  } catch {}
}

function writeQueue() {
  fs.mkdirSync(path.dirname(cfg.queueFile), { recursive: true });
  fs.writeFileSync(cfg.queueFile, queue.map((x) => JSON.stringify(x)).join('\n'));
}

function enqueue(msg) {
  queue.push(msg);
  while (queue.length > cfg.maxQueue) queue.shift();
  writeQueue();
}

function publishOrQueue(client, msg) {
  if (!client.connected) return enqueue(msg);
  client.publish(msg.topic, msg.payload, msg.options, (err) => {
    if (err) enqueue(msg);
  });
}

function queueMessage(topic, payloadObj, options = { qos: 1, retain: false }) {
  return { topic, payload: JSON.stringify(payloadObj), options };
}

function scheduleFlush(client) {
  if (flushTimer) return;
  let delay = 1000;
  flushTimer = setInterval(() => {
    if (!client.connected || queue.length === 0) return;
    const msg = queue[0];
    client.publish(msg.topic, msg.payload, msg.options, (err) => {
      if (err) {
        delay = Math.min(delay * 2, 10000);
        return;
      }
      delay = 1000;
      queue.shift();
      writeQueue();
    });
  }, delay);
}

readQueue();

const willPayload = JSON.stringify(envelope({ status: 'offline' }));
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
  publishOrQueue(client, queueMessage(`${base}/sys/status`, envelope({ status: 'online' }), { qos: 1, retain: true }));
  if (cfg.provisioningToken) {
    publishOrQueue(client, queueMessage(`${base}/evt/system/hello`, envelope({ token: cfg.provisioningToken, version: '0.2.0' }), { qos: 1, retain: false }));
  }

  client.subscribe(`${base}/cmd/#`, { qos: 1 });
  scheduleFlush(client);
});

client.on('message', (topic, payloadBuf) => {
  const prefix = `${base}/cmd/`;
  if (!topic.startsWith(prefix)) return;

  const route = topic.slice(prefix.length);
  let cmd = null;
  try { cmd = JSON.parse(payloadBuf.toString('utf8')); } catch {}

  const cmdId = cmd?.id || null;
  const ackTopic = `${base}/ack/${route}`;
  const evtTopic = `${base}/evt/${route}`;

  if (cmdId && processedCmdIds.has(cmdId)) {
    publishOrQueue(client, queueMessage(ackTopic, envelope({ status: 'duplicate' }, { corr: cmdId }), { qos: 1, retain: false }));
    return;
  }

  if (cmdId) processedCmdIds.add(cmdId);
  publishOrQueue(client, queueMessage(ackTopic, envelope({ status: 'ok' }, { corr: cmdId }), { qos: 1, retain: false }));
  publishOrQueue(client, queueMessage(evtTopic, envelope({ executed: true, route }), { qos: 1, retain: false }));
});

setInterval(() => {
  publishOrQueue(client, queueMessage(`${base}/sys/status`, envelope({ status: 'online', heartbeat: true }), { qos: 1, retain: true }));
}, cfg.heartbeatSeconds * 1000);

process.on('SIGTERM', () => client.end(true, () => process.exit(0)));
process.on('SIGINT', () => client.end(true, () => process.exit(0)));
