'use strict';

const mqtt = require('mqtt');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { resolveConfig, validateConfig, buildBaseTopic, topicFor } = require('./lib');

const cfg = resolveConfig(process.env);
const cfgErrors = validateConfig(cfg);
if (cfgErrors.length > 0) {
  console.error(`[edge-agent] configuration error: missing ${cfgErrors.join(', ')}`);
  process.exit(1);
}

const baseTopic = buildBaseTopic(cfg);
const statusTopic = topicFor(baseTopic, 'sys/status');
const cmdSubscriptionTopic = topicFor(baseTopic, 'cmd/#');
const outbox = [];
let flushing = false;
let shuttingDown = false;

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
    Object.assign(env, extra);
  }

  return env;
}

function log(msg, details) {
  const scope = `${cfg.tenant}/${cfg.building}/${cfg.gateway}`;
  if (details) {
    console.log(`[edge-agent][${scope}] ${msg}`, details);
    return;
  }
  console.log(`[edge-agent][${scope}] ${msg}`);
}

function markAlive() {
  try {
    fs.mkdirSync(path.dirname(cfg.aliveFile), { recursive: true });
    fs.writeFileSync(cfg.aliveFile, `${Date.now()}\n`, 'utf8');
  } catch (err) {
    console.error('[edge-agent] failed to update alive file', err.message);
  }
}

function loadOutbox() {
  try {
    const txt = fs.readFileSync(cfg.queueFile, 'utf8');
    for (const line of txt.split('\n')) {
      if (!line.trim()) continue;
      outbox.push(JSON.parse(line));
    }
    log(`loaded queue entries: ${outbox.length}`);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('[edge-agent] failed to load queue', err);
    }
  }
}

function persistOutbox() {
  try {
    fs.mkdirSync(path.dirname(cfg.queueFile), { recursive: true });
    fs.writeFileSync(cfg.queueFile, outbox.map((entry) => JSON.stringify(entry)).join('\n'), 'utf8');
  } catch (err) {
    console.error('[edge-agent] failed to persist queue', err);
  }
}

function enqueue(message, reason) {
  outbox.push(message);
  if (outbox.length > cfg.maxQueue) {
    const dropped = outbox.length - cfg.maxQueue;
    outbox.splice(0, dropped);
    log(`queue full, dropped ${dropped} oldest message(s)`);
  }
  persistOutbox();
  log(`queued message (${reason}) topic=${message.topic} queued=${outbox.length}`);
}

function makeQueued(topic, envelope, options = { qos: 1, retain: false }) {
  return {
    topic,
    payload: JSON.stringify(envelope),
    options
  };
}

function publishAsync(client, message) {
  return new Promise((resolve, reject) => {
    client.publish(message.topic, message.payload, message.options, (err) => {
      if (err) return reject(err);
      log(`published topic=${message.topic} qos=${message.options.qos} retain=${message.options.retain}`);
      return resolve();
    });
  });
}

async function publishOrQueue(client, message) {
  if (!client.connected) {
    enqueue(message, 'client offline');
    return;
  }
  try {
    await publishAsync(client, message);
  } catch (err) {
    enqueue(message, `publish failed: ${err.message}`);
  }
}

async function flushOutbox(client) {
  if (flushing || !client.connected || outbox.length === 0) return;
  flushing = true;

  try {
    while (client.connected && outbox.length > 0) {
      const message = outbox[0];
      try {
        await publishAsync(client, message);
        outbox.shift();
        persistOutbox();
      } catch (err) {
        log(`flush paused topic=${message.topic}: ${err.message}`);
        break;
      }
    }
  } finally {
    flushing = false;
  }
}

function parseCmdTopic(topic) {
  const prefix = `${baseTopic}/cmd/`;
  if (!topic.startsWith(prefix)) return null;
  return topic.slice(prefix.length);
}

function ackTopicFor(cmdSuffix) {
  return `${baseTopic}/ack/${cmdSuffix}`;
}

function evtTopicFor(cmdSuffix) {
  return `${baseTopic}/evt/${cmdSuffix}`;
}

loadOutbox();
markAlive();

const willPayload = JSON.stringify(mkEnvelope({ status: 'offline' }));
const client = mqtt.connect(cfg.mqttUrl, {
  clientId: `edge-${cfg.gateway}-${crypto.randomUUID().slice(0, 8)}`,
  username: cfg.username,
  password: cfg.password,
  reconnectPeriod: 2000,
  keepalive: 30,
  will: {
    topic: statusTopic,
    payload: willPayload,
    qos: 1,
    retain: true
  }
});

log(`starting edge-agent mqtt=${cfg.mqttUrl} heartbeat=${cfg.heartbeatSeconds}s`);

client.on('connect', async () => {
  log('connected to broker');

  await publishOrQueue(client, makeQueued(statusTopic, mkEnvelope({ status: 'online' }), { qos: 1, retain: true }));

  if (cfg.provisioningToken) {
    await publishOrQueue(
      client,
      makeQueued(topicFor(baseTopic, 'evt/system/hello'), mkEnvelope({ token: cfg.provisioningToken, version: '0.3.0' }))
    );
  }

  client.subscribe(cmdSubscriptionTopic, { qos: 1 }, (err) => {
    if (err) {
      console.error('[edge-agent] subscribe failed', err);
      return;
    }
    log(`subscribed topic=${cmdSubscriptionTopic}`);
  });

  await flushOutbox(client);
});

client.on('reconnect', () => log('reconnecting to broker...'));
client.on('offline', () => log('mqtt client offline'));
client.on('close', () => log('mqtt connection closed'));
client.on('error', (err) => console.error('[edge-agent] mqtt error', err));

client.on('message', async (topic, payloadBuf) => {
  const cmdSuffix = parseCmdTopic(topic);
  if (!cmdSuffix) return;

  let cmd;
  try {
    cmd = JSON.parse(payloadBuf.toString('utf8'));
  } catch (err) {
    console.error('[edge-agent] invalid command payload', { topic, err: err.message });
    await publishOrQueue(
      client,
      makeQueued(ackTopicFor(cmdSuffix), mkEnvelope({ status: 'error', reason: 'invalid-json' }))
    );
    return;
  }

  const corr = cmd && cmd.id ? cmd.id : undefined;
  log(`received command topic=${topic} id=${corr || 'n/a'}`);

  await publishOrQueue(
    client,
    makeQueued(ackTopicFor(cmdSuffix), mkEnvelope({ status: 'ok', route: cmdSuffix }, corr ? { corr } : undefined))
  );

  await publishOrQueue(
    client,
    makeQueued(evtTopicFor(cmdSuffix), mkEnvelope({ action: 'command-executed', route: cmdSuffix }, corr ? { corr } : undefined))
  );

  await flushOutbox(client);
});

setInterval(async () => {
  markAlive();
  await publishOrQueue(
    client,
    makeQueued(statusTopic, mkEnvelope({ status: 'online', heartbeat: true }), { qos: 1, retain: true })
  );
  await publishOrQueue(client, makeQueued(topicFor(baseTopic, 'evt/heartbeat'), mkEnvelope({ heartbeat: true })));
  await flushOutbox(client);
}, cfg.heartbeatSeconds * 1000);

setInterval(async () => {
  await flushOutbox(client);
}, 3000);

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`received ${signal}, shutting down gracefully`);

  try {
    if (client.connected) {
      await publishAsync(client, makeQueued(statusTopic, mkEnvelope({ status: 'offline', reason: signal }), { qos: 1, retain: true }));
    }
  } catch (err) {
    console.error('[edge-agent] failed to publish offline status during shutdown', err.message);
  }

  client.end(false, () => {
    log('mqtt client ended');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('[edge-agent] forced shutdown timeout reached');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  shutdown('SIGINT');
});
