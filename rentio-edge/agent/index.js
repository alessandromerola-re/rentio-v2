const mqtt = require("mqtt");
const crypto = require("crypto");

const MQTT_URL = process.env.MQTT_URL || "mqtt://localhost:1883";
const MQTT_USERNAME = process.env.MQTT_USERNAME || "";
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || "";

const TENANT = process.env.RENTIO_TENANT || "windome";
const BUILDING = process.env.RENTIO_BUILDING || "casagiove-01";
const GATEWAY = process.env.RENTIO_GATEWAY || "gw-0001";

const base = `rentio/v1/${TENANT}/${BUILDING}/gw/${GATEWAY}`;
const sysStatusTopic = `${base}/sys/status`;

function nowIso() {
  return new Date().toISOString();
}

function envelope(src, data = {}, extra = {}) {
  return {
    v: 1,
    id: crypto.randomUUID(),
    ts: nowIso(),
    src,
    tenant: TENANT,
    building: BUILDING,
    gateway: GATEWAY,
    ...extra,
    data
  };
}

const client = mqtt.connect(MQTT_URL, {
  username: MQTT_USERNAME || undefined,
  password: MQTT_PASSWORD || undefined,
  clean: true,
  keepalive: 30,
  reconnectPeriod: 2000,
  will: {
    topic: sysStatusTopic,
    payload: "offline",
    qos: 1,
    retain: true
  }
});

client.on("connect", () => {
  console.log(`[edge-agent] connected to ${MQTT_URL}`);

  // presence online (retained)
  client.publish(sysStatusTopic, "online", { qos: 1, retain: true });

  // boot event
  const boot = envelope(`gw:${GATEWAY}`, { version: "0.1.0" });
  client.publish(`${base}/evt/system/boot`, JSON.stringify(boot), { qos: 1 });

  // subscribe commands
  client.subscribe(`${base}/cmd/#`, { qos: 1 }, (err) => {
    if (err) console.error("[edge-agent] subscribe error", err);
    else console.log(`[edge-agent] subscribed: ${base}/cmd/#`);
  });
});

client.on("message", (topic, payloadBuf) => {
  const payloadStr = payloadBuf.toString("utf8");
  console.log(`[edge-agent] cmd topic=${topic} payload=${payloadStr}`);

  const cmdPrefix = `${base}/cmd/`;
  if (!topic.startsWith(cmdPrefix)) return;

  const route = topic.substring(cmdPrefix.length); // es: access/open
  let msg;
  try {
    msg = JSON.parse(payloadStr);
  } catch {
    msg = null;
  }

  // helper per ack
  const ackTopic = `${base}/ack/${route}`;
  const corr = msg?.id || null;

  // access/open demo
  if (route === "access/open") {
    const device = msg?.data?.device || "unknown-device";
    const unit = msg?.data?.unit || "unknown-unit";

    const ack = envelope(`gw:${GATEWAY}`, { device, unit }, { corr, status: "ok" });
    client.publish(ackTopic, JSON.stringify(ack), { qos: 1 });

    const evt = envelope(`gw:${GATEWAY}`, { device, unit, by: msg?.data?.requested_by || "unknown" });
    client.publish(`${base}/evt/access/opened`, JSON.stringify(evt), { qos: 1 });

    return;
  }

  // default: unknown command
  const errAck = envelope(`gw:${GATEWAY}`, { error: "Unknown command" }, { corr, status: "error", code: "NOT_IMPLEMENTED" });
  client.publish(ackTopic, JSON.stringify(errAck), { qos: 1 });
});

client.on("reconnect", () => console.log("[edge-agent] reconnecting..."));
client.on("error", (err) => console.error("[edge-agent] error", err));
