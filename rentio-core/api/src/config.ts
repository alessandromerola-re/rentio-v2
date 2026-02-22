export const config = {
  port: Number(process.env.PORT || 3001),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@rentio.local',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin12345',
  mqttUrl: process.env.MQTT_URL || 'mqtt://localhost:1883'
};
