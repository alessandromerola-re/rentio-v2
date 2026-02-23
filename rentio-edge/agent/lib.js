'use strict';

function firstNonEmpty(values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }
  return '';
}

function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveLocation(env) {
  const tenant = firstNonEmpty([env.RENTIO_TENANT, env.EDGE_RENTIO_TENANT]);
  const building = firstNonEmpty([env.RENTIO_BUILDING, env.EDGE_RENTIO_BUILDING]);
  const gateway = firstNonEmpty([env.RENTIO_GATEWAY, env.EDGE_RENTIO_GATEWAY]);

  return { tenant, building, gateway };
}

function buildBaseTopic(location) {
  return `rentio/v1/${location.tenant}/${location.building}/gw/${location.gateway}`;
}

function topicFor(baseTopic, channel, suffix = '') {
  return suffix ? `${baseTopic}/${channel}/${suffix}` : `${baseTopic}/${channel}`;
}

function resolveConfig(env = process.env) {
  const location = resolveLocation(env);

  return {
    mqttUrl: env.MQTT_URL || 'mqtt://localhost:1883',
    username: env.MQTT_USERNAME || undefined,
    password: env.MQTT_PASSWORD || undefined,
    tenant: location.tenant,
    building: location.building,
    gateway: location.gateway,
    heartbeatSeconds: toPositiveInt(env.HEARTBEAT_SEC || env.HEARTBEAT_SECONDS, 30),
    queueFile: env.EDGE_QUEUE_FILE || '/data/queue.jsonl',
    maxQueue: toPositiveInt(env.MAX_QUEUE || env.EDGE_MAX_QUEUE, 5000),
    provisioningToken: env.PROVISIONING_TOKEN || '',
    aliveFile: env.EDGE_ALIVE_FILE || '/tmp/edge-alive'
  };
}

function validateConfig(cfg) {
  const missing = [];
  if (!cfg.tenant) missing.push('RENTIO_TENANT or EDGE_RENTIO_TENANT');
  if (!cfg.building) missing.push('RENTIO_BUILDING or EDGE_RENTIO_BUILDING');
  if (!cfg.gateway) missing.push('RENTIO_GATEWAY or EDGE_RENTIO_GATEWAY');
  return missing;
}

module.exports = {
  resolveConfig,
  validateConfig,
  resolveLocation,
  buildBaseTopic,
  topicFor
};
