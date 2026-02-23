'use strict';

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

const base = 'rentio/v1/' + cfg.tenant + '/' + cfg.building + '/gw/' + cfg.gateway;
const outbox = [];
const seenCmd = new Set();
let flushHandle = null;

function mkEnvelope(data, extra) {
  const env = {
    v: '1',
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    src: 'edge-agent',
    tenant: cfg.tenant,
    building: cfg.building,
    gateway: cfg.gateway,
    data: data || {}
  };

  if (extra && typeof extra === 'object') {
    for (const key of Object.keys(extra)) env[key] = extra[key];
  }

  return env;
}

function loadOutbox() {
  try {
    const txt = fs.readFileSync(cfg.queueFile, 'utf8');
    const lines = txt.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      outbox.push(JSON.parse(line));
    }
  } catch (err) {
    // queue file may not exist on first run
  }
}

function saveOutbox() {
  fs.mkdirSync(path.dirname(cfg.queueFile), { recursive: true });
  const txt = outbox.map((x) => JSON.stringify(x)).join('\n');
  fs.writeFileSync(cfg.queueFile, txt);
}

function enqueue(msg) {
  outbox.push(msg);
  while (outbox.length > cfg.maxQueue) outbox.shift();
  saveOutbox();
}

function mkQueued(topic, payloadObj, options) {
  return {
    topic: topic,
    payload: JSON.stringify(payloadObj),
    options: options || { qos: 1, retain: false }
  };
}

function publishOrQueue(client, msg) {
  if (!client.connected) {
    enqueue(msg);
    return;
  }

  client.publish(msg.topic, msg.payload, msg.options, function onPublished(err) {
    if (err) enqueue(msg);
  });
}

function startFlush(client) {
  if (flushHandle) return;

  flushHandle = setInterval(function flush() {
    if (!client.connected || outbox.length === 0) return;

    const msg = outbox[0];
    client.publish(msg.topic, msg.payload, msg.options, function onFlush(err) {
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
  reconnectPeriod: 2000,
  keepalive: 30,
  will: {
    topic: base + '/sys/status',
    payload: willPayload,
    qos: 1,
    retain: true
  }
});

client.on('connect', function onConnect() {
  publishOrQueue(client, mkQueued(base + '/sys/status', mkEnvelope({ status: 'online' }), { qos: 1, retain: true }));

  if (cfg.provisioningToken) {
    publishOrQueue(
      client,
      mkQueued(base + '/evt/system/hello', mkEnvelope({ token: cfg.provisioningToken, version: '0.2.0' }), { qos: 1, retain: false })
    );
  }

  client.subscribe(base + '/cmd/#', { qos: 1 });
  startFlush(client);
});

client.on('message', function onMessage(topic, payloadBuf) {
  const prefix = base + '/cmd/';
  if (!topic.startsWith(prefix)) return;

  const route = topic.slice(prefix.length);
  let cmd = null;
  try {
    cmd = JSON.parse(payloadBuf.toString('utf8'));
  } catch (err) {
    cmd = null;
  }

  const cmdId = cmd && cmd.id ? cmd.id : null;
  const ackTopic = base + '/ack/' + route;
  const evtTopic = base + '/evt/' + route;

  if (cmdId && seenCmd.has(cmdId)) {
    publishOrQueue(client, mkQueued(ackTopic, mkEnvelope({ status: 'duplicate' }, { corr: cmdId }), { qos: 1, retain: false }));
    return;
  }

  if (cmdId) seenCmd.add(cmdId);

  publishOrQueue(client, mkQueued(ackTopic, mkEnvelope({ status: 'ok' }, { corr: cmdId }), { qos: 1, retain: false }));
  publishOrQueue(client, mkQueued(evtTopic, mkEnvelope({ executed: true, route: route }), { qos: 1, retain: false }));
});

setInterval(function heartbeat() {
  publishOrQueue(client, mkQueued(base + '/sys/status', mkEnvelope({ status: 'online', heartbeat: true }), { qos: 1, retain: true }));
}, cfg.heartbeatSeconds * 1000);

process.on('SIGTERM', function onSigterm() {
  client.end(true, function onEnd() {
    process.exit(0);
  });
});

process.on('SIGINT', function onSigint() {
  client.end(true, function onEnd() {
    process.exit(0);
  });
});
