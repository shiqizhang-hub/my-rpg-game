import { createRequire } from 'node:module';

import {
  DEFAULT_SIMULATOR_INTERVAL_MS,
  DEFAULT_TELEMETRY_TOPIC,
  DEMO_DEVICE_ID,
  DEMO_ROUTE
} from '../demoRoute.js';

const require = createRequire(import.meta.url);
const solace = require('solclientjs');

function showUsage() {
  process.stdout.write(
    [
      'Usage:',
      '  npm run demo:publish:solace -- --url=wss://host:443 --vpn=test-service --username=solace-cloud-client --password=YOUR_PASSWORD',
      '',
      'Or set PowerShell environment variables in the same terminal before running:',
      '  $env:SOLACE_URL="wss://host:443"',
      '  $env:SOLACE_VPN="test-service"',
      '  $env:SOLACE_USERNAME="solace-cloud-client"',
      '  $env:SOLACE_PASSWORD="YOUR_PASSWORD"',
      '  $env:SOLACE_TOPIC="hospital/demo/location/device/demo-tag-001"',
      '  npm run demo:publish:solace',
      '',
      'Optional:',
      '  --topic=... or $env:SOLACE_TOPIC=...',
      '  --device-id=... or $env:DEMO_DEVICE_ID=...',
      '  --interval=500 or $env:DEMO_INTERVAL_MS=500'
    ].join('\n') + '\n'
  );
}

function readArgs(argv) {
  return argv.reduce((accumulator, item) => {
    if (!item.startsWith('--')) {
      return accumulator;
    }

    const [key, rawValue] = item.slice(2).split('=');
    accumulator[key] = rawValue ?? 'true';
    return accumulator;
  }, {});
}

function requiredConfig(name, value) {
  if (!value) {
    const envNameByConfig = {
      url: 'SOLACE_URL',
      vpnName: 'SOLACE_VPN',
      userName: 'SOLACE_USERNAME',
      password: 'SOLACE_PASSWORD'
    };

    const envName = envNameByConfig[name] ?? name;
    throw new Error(
      `Missing required config: ${name}. Set --${name} or ${envName} before running.\n\n` +
      'Run with --help to see examples.'
    );
  }

  return value;
}

const args = readArgs(process.argv.slice(2));

if (args.help || args.h) {
  showUsage();
  process.exit(0);
}

const config = {
  url: requiredConfig('url', args.url ?? process.env.SOLACE_URL),
  vpnName: requiredConfig('vpnName', args.vpn ?? process.env.SOLACE_VPN),
  userName: requiredConfig('userName', args.username ?? process.env.SOLACE_USERNAME),
  password: requiredConfig('password', args.password ?? process.env.SOLACE_PASSWORD),
  topic: args.topic ?? process.env.SOLACE_TOPIC ?? DEFAULT_TELEMETRY_TOPIC,
  deviceId: args['device-id'] ?? process.env.DEMO_DEVICE_ID ?? DEMO_DEVICE_ID,
  intervalMs: Math.max(250, Number.parseInt(args.interval ?? process.env.DEMO_INTERVAL_MS ?? DEFAULT_SIMULATOR_INTERVAL_MS, 10) || DEFAULT_SIMULATOR_INTERVAL_MS)
};

const factoryProps = new solace.SolclientFactoryProperties();
factoryProps.profile = solace.SolclientFactoryProfiles.version10;
solace.SolclientFactory.init(factoryProps);

const session = solace.SolclientFactory.createSession(new solace.SessionProperties({
  url: config.url,
  vpnName: config.vpnName,
  userName: config.userName,
  password: config.password,
  connectTimeoutInMsecs: 10000,
  reconnectRetries: 3,
  reconnectRetryWaitInMsecs: 3000
}));

let routeIndex = 0;
let publishTimer = 0;
let cycleNumber = 1;

function createResetPayload() {
  const cycleId = `route-cycle-${cycleNumber}`;
  return {
    deviceId: config.deviceId,
    floor: 1,
    x: 0,
    z: 14.2,
    status: 'idle',
    zone: 'Main Lobby',
    label: 'Route reset',
    action: 'reset',
    targetId: '',
    cycleId,
    stepIndex: 0,
    waitMs: 900,
    commandId: `${cycleId}-reset`,
    timestamp: new Date().toISOString()
  };
}

function sendPayload(payload) {
  const message = solace.SolclientFactory.createMessage();
  message.setDestination(solace.SolclientFactory.createTopicDestination(config.topic));
  message.setBinaryAttachment(JSON.stringify(payload));
  message.setDeliveryMode(solace.MessageDeliveryModeType.DIRECT);
  session.send(message);
}

function publishWaypoint() {
  if (routeIndex === 0) {
    const resetPayload = createResetPayload();
    sendPayload(resetPayload);
    process.stdout.write(
      `published ${resetPayload.deviceId} floor=${resetPayload.floor} x=${resetPayload.x} z=${resetPayload.z} action=${resetPayload.action} target=- wait=${resetPayload.waitMs}ms cycle=${resetPayload.cycleId}\n`
    );
    routeIndex = 1;
    return { waitMs: resetPayload.waitMs, cycleId: resetPayload.cycleId, resetOnly: true };
  }

  const routeStepIndex = routeIndex - 1;
  const waypoint = DEMO_ROUTE[routeStepIndex];
  const timestamp = new Date().toISOString();
  const cycleId = `route-cycle-${cycleNumber}`;

  const payload = {
    ...waypoint,
    deviceId: config.deviceId,
    cycleId,
    stepIndex: routeStepIndex + 1,
    commandId: `${cycleId}-step-${routeStepIndex + 1}`,
    timestamp
  };

  sendPayload(payload);
  process.stdout.write(
    `published ${payload.deviceId} floor=${payload.floor} x=${payload.x} z=${payload.z} action=${payload.action ?? 'move'} target=${payload.targetId ?? '-'} wait=${payload.waitMs ?? config.intervalMs}ms cycle=${cycleId} step=${routeStepIndex + 1}\n`
  );
  routeIndex += 1;
  if (routeIndex > DEMO_ROUTE.length) {
    routeIndex = 0;
    cycleNumber += 1;
  }
  return waypoint;
}

function scheduleNextPublish() {
  const waypoint = publishWaypoint();
  const delayMs = Math.max(250, Number.parseInt(waypoint.waitMs ?? config.intervalMs, 10) || config.intervalMs);
  publishTimer = setTimeout(scheduleNextPublish, delayMs);
}

function shutdown(code = 0) {
  if (publishTimer) {
    clearTimeout(publishTimer);
    publishTimer = 0;
  }

  try {
    session.disconnect();
  } catch {
    // Ignore shutdown races.
  }

  process.exit(code);
}

session.on(solace.SessionEventCode.UP_NOTICE, () => {
  process.stdout.write(`connected to ${config.url}, publishing to ${config.topic}\n`);
  scheduleNextPublish();
});

session.on(solace.SessionEventCode.CONNECT_FAILED_ERROR, (error) => {
  process.stderr.write(`connect failed: ${error.message || String(error)}\n`);
  shutdown(1);
});

session.on(solace.SessionEventCode.DOWN_ERROR, (error) => {
  process.stderr.write(`connection lost: ${error.message || String(error)}\n`);
  shutdown(1);
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

try {
  session.connect();
} catch (error) {
  process.stderr.write(`${error.message || String(error)}\n\n`);
  showUsage();
  process.exit(1);
}