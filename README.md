# node-red-homematic

Node-RED nodes for integrating with a [HomeMatic](https://www.homematic.com/) CCU (Central Control Unit). Supports both traditional **BidCos-RF** (Homematic) and **Hm-IP** (Homematic IP) devices simultaneously.

## Nodes

### CCU (Configuration Node)

Manages the connection to your HomeMatic CCU. Add one per CCU and reference it from your Value and Set-Value nodes.

| Setting | Default | Description |
|---|---|---|
| CCU Hostname | `homematic-ccu` | IP address or hostname of the CCU |
| Listen Address | `localhost` | Local IP that the CCU will call back to |
| BidCos-RF Listen Port | `2048` | Port for BidCos-RF callbacks |
| Hm-IP Listen Port | `2049` | Port for Hm-IP callbacks |

The CCU node starts an XML-RPC server on the configured ports so the CCU can push events to Node-RED. It also periodically fetches the full device/channel list from the CCU via a Rega script (every 60 seconds) so that channel dropdowns in the editor stay up to date.

> **Note:** Your CCU must be able to reach Node-RED at the configured `Listen Address` and ports. Make sure any firewall allows inbound connections on the two listen ports.

### Value Node (Input)

Outputs a message whenever a HomeMatic datapoint changes. Supports wildcard matching — leave Channel or Value Name blank to receive events from all channels or all datapoints respectively.

**Output message:**

```json
{
  "payload": 0.5,
  "topic": "BidCos-RF/LEQ123456:1/Living Room Lamp:1/LEVEL",
  "iface": "BidCos-RF",
  "channel": "LEQ123456:1",
  "namedChannel": "Living Room Lamp:1",
  "valueName": "LEVEL"
}
```

### Set-Value Node (Output)

Sends a value to a HomeMatic datapoint when it receives a message. The target channel and value name are configured in the node editor but can be overridden per-message via `msg.iface`, `msg.channel`, and `msg.valueName`.

**Input message:**

```json
{
  "payload": 0.5,
  "channel": "LEQ123456:1",
  "valueName": "LEVEL"
}
```

## Requirements

- Node-RED 4.x
- A HomeMatic CCU2 or CCU3 (or compatible device like RaspberryMatic / debmatic)
- Node.js 25+
- The CCU must be able to reach the machine running Node-RED on the configured listen ports

## Installation

Install via the Node-RED palette manager or from the command line in your Node-RED user directory:

```bash
npm install https://github.com/cgittner/node-red-homematic
```

After installation, restart Node-RED. The **ccu**, **value**, and **set-value** nodes will appear in the **homematic** category of the palette.

## Development

Clone the repository and install dependencies:

```bash
git clone https://github.com/cgittner/node-red-homematic.git
cd node-red-homematic
npm install
```

Build the TypeScript sources:

```bash
npm run build
```

Compiled output is written to `build/`. Link the package into your local Node-RED installation for testing:

```bash
npm link
cd ~/.node-red
npm link node-red-homematic
```

## How It Works

1. The **CCU node** registers Node-RED as an XML-RPC event receiver with the CCU on startup.
2. When a HomeMatic device reports a change (e.g. a motion sensor triggers), the CCU calls the Node-RED XML-RPC endpoint.
3. **Value nodes** filter incoming events by interface, channel, and datapoint name, then forward matching events as Node-RED messages.
4. **Set-Value nodes** accept messages and call the CCU's `setValue` XML-RPC method to control devices.
5. A heartbeat runs every 10 seconds; if no data is received for 60 seconds the connection is automatically re-established.

## License

ISC
