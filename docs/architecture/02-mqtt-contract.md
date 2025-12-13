# Rentio v2 - MQTT Contract (v1)

Base topic:
rentio/v1/{tenant}/{building}/gw/{gateway}/...

Channels:
- cmd   (Core -> Gateway)   QoS1, not retained
- ack   (Gateway -> Core)   QoS1, not retained
- evt   (Gateway -> Core)   QoS1, not retained
- state (Gateway -> Core)   QoS1, retained
- tele  (Gateway -> Core)   QoS0/1, not retained
- sys   (Gateway presence)  retained + LWT

Examples:
cmd:   rentio/v1/windome/casagiove-01/gw/gw-0001/cmd/access/open
ack:   rentio/v1/windome/casagiove-01/gw/gw-0001/ack/access/open
evt:   rentio/v1/windome/casagiove-01/gw/gw-0001/evt/access/opened
state: rentio/v1/windome/casagiove-01/gw/gw-0001/state/device/relay-luce-1
tele:  rentio/v1/windome/casagiove-01/gw/gw-0001/tele/sensor/sensor-temp-01
sys:   rentio/v1/windome/casagiove-01/gw/gw-0001/sys/status

Envelope JSON fields (recommended):
- v, id, ts, src
- tenant, building, gateway
- data (payload)
- corr (for ack)
