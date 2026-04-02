import solace from 'solclientjs/lib-browser/solclient';

import {
    DEFAULT_SIMULATOR_INTERVAL_MS,
    DEFAULT_TELEMETRY_TOPIC,
    DEMO_DEVICE_ID,
    DEMO_ROUTE
} from './demoRoute.js';

const STORAGE_KEY = 'hospital-telemetry-config';

export const DEFAULT_TELEMETRY_CONFIG = {
    source: 'simulator',
    wsUrl: '',
    vpnName: '',
    userName: '',
    password: '',
    destinationName: DEFAULT_TELEMETRY_TOPIC,
    deviceId: DEMO_DEVICE_ID,
    simulatorIntervalMs: DEFAULT_SIMULATOR_INTERVAL_MS
};

let solaceInitialized = false;

const TELEMETRY_ACTIONS = new Set(['move', 'door', 'objective', 'npc', 'stairs', 'reset']);

function ensureSolaceInitialized() {
    if (solaceInitialized) {
        return;
    }

    const factoryProps = new solace.SolclientFactoryProperties();
    factoryProps.profile = solace.SolclientFactoryProfiles.version10;
    solace.SolclientFactory.init(factoryProps);
    solaceInitialized = true;
}

function decodeBinaryAttachment(attachment) {
    if (typeof attachment === 'string') {
        return attachment;
    }

    if (!attachment) {
        return '';
    }

    if (attachment instanceof ArrayBuffer) {
        return new TextDecoder().decode(new Uint8Array(attachment));
    }

    if (ArrayBuffer.isView(attachment)) {
        return new TextDecoder().decode(attachment);
    }

    return String(attachment);
}

function sanitizeConfig(config = {}) {
    return {
        ...DEFAULT_TELEMETRY_CONFIG,
        ...config,
        source: ['simulator', 'solace-topic', 'solace-queue'].includes(config.source)
            ? config.source
            : DEFAULT_TELEMETRY_CONFIG.source,
        simulatorIntervalMs: Math.max(
            250,
            Number.parseInt(config.simulatorIntervalMs ?? DEFAULT_SIMULATOR_INTERVAL_MS, 10) || DEFAULT_SIMULATOR_INTERVAL_MS
        )
    };
}

function loadStoredConfig() {
    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        return stored ? sanitizeConfig(JSON.parse(stored)) : { ...DEFAULT_TELEMETRY_CONFIG };
    } catch {
        return { ...DEFAULT_TELEMETRY_CONFIG };
    }
}

function persistConfig(config) {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {
        // Ignore localStorage failures in restricted browser modes.
    }
}

function normalizeAction(action) {
    if (typeof action !== 'string') {
        return 'move';
    }

    const normalized = action.trim().toLowerCase();
    return TELEMETRY_ACTIONS.has(normalized) ? normalized : 'move';
}

function normalizeTelemetryPayload(payload, fallbackDeviceId) {
    if (!payload || typeof payload !== 'object') {
        throw new Error('Telemetry payload must be a JSON object.');
    }

    const floor = Number.parseInt(payload.floor, 10);
    const x = Number.parseFloat(payload.x);
    const z = Number.parseFloat(payload.z);

    if (!Number.isFinite(floor) || !Number.isFinite(x) || !Number.isFinite(z)) {
        throw new Error('Telemetry payload must contain numeric floor, x, and z values.');
    }

    const timestamp = payload.timestamp || new Date().toISOString();
    const action = normalizeAction(payload.action);
    const targetId = typeof payload.targetId === 'string' ? payload.targetId.trim() : '';

    return {
        deviceId: payload.deviceId || fallbackDeviceId || DEMO_DEVICE_ID,
        floor: Math.min(3, Math.max(1, floor)),
        x,
        z,
        status: payload.status || 'moving',
        zone: payload.zone || '',
        label: payload.label || '',
        action,
        targetId,
        cycleId: payload.cycleId || '',
        stepIndex: Number.parseInt(payload.stepIndex ?? -1, 10),
        waitMs: Math.max(250, Number.parseInt(payload.waitMs ?? DEFAULT_SIMULATOR_INTERVAL_MS, 10) || DEFAULT_SIMULATOR_INTERVAL_MS),
        commandId: payload.commandId || `${timestamp}:${action}:${targetId}:${floor}:${x}:${z}`,
        timestamp
    };
}

function createResetPayload(deviceId, cycleId, commandId) {
    return {
        deviceId,
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
        commandId,
        timestamp: new Date().toISOString()
    };
}

function formatError(error) {
    if (!error) {
        return 'Unknown Solace error.';
    }

    return error.message || error.infoStr || error.reason || String(error);
}

export function createTelemetryController({ onTelemetry, onStateChange }) {
    const state = {
        config: loadStoredConfig(),
        connectionState: 'idle',
        subscriptionState: 'idle',
        session: null,
        consumer: null,
        simulatorTimer: 0,
        lastMessageAt: 0,
        lastPayload: null,
        lastError: ''
    };

    function emitState(patch = {}) {
        Object.assign(state, patch);
        onStateChange?.({
            config: { ...state.config },
            connectionState: state.connectionState,
            subscriptionState: state.subscriptionState,
            lastMessageAt: state.lastMessageAt,
            lastPayload: state.lastPayload,
            lastError: state.lastError
        });
    }

    function stopSimulator() {
        if (state.simulatorTimer) {
            window.clearInterval(state.simulatorTimer);
            state.simulatorTimer = 0;
        }
    }

    function disposeConsumer() {
        if (!state.consumer) {
            return;
        }

        try {
            state.consumer.disconnect();
        } catch {
            // Ignore disconnect races.
        }

        try {
            state.consumer.dispose();
        } catch {
            // Ignore dispose races.
        }

        state.consumer = null;
    }

    function disposeSession() {
        if (!state.session) {
            return;
        }

        try {
            state.session.disconnect();
        } catch {
            // Ignore disconnect races.
        }

        try {
            state.session.dispose();
        } catch {
            // Ignore dispose races.
        }

        state.session = null;
    }

    function stop(resetConnectionState = true) {
        stopSimulator();
        disposeConsumer();
        disposeSession();

        if (resetConnectionState) {
            emitState({ connectionState: 'idle', subscriptionState: 'idle', lastError: '' });
        }
    }

    function forwardPayload(payload, transport) {
        const normalized = normalizeTelemetryPayload(payload, state.config.deviceId);
        emitState({
            lastPayload: normalized,
            lastMessageAt: Date.now(),
            lastError: '',
            subscriptionState: transport === 'simulator' ? 'simulated' : state.subscriptionState
        });
        onTelemetry?.(normalized, transport);
    }

    function handleSolaceMessage(message, transport) {
        const payloadText = decodeBinaryAttachment(message.getBinaryAttachment?.());
        const payload = normalizeTelemetryPayload(JSON.parse(payloadText), state.config.deviceId);
        forwardPayload(payload, transport);

        if (transport === 'queue' && typeof message.acknowledge === 'function') {
            message.acknowledge();
        }
    }

    function connectQueueConsumer(session) {
        const consumerProps = new solace.MessageConsumerProperties();
        consumerProps.queueDescriptor = new solace.QueueDescriptor({
            name: state.config.destinationName,
            type: solace.QueueType.QUEUE,
            durable: true
        });
        consumerProps.acknowledgeMode = solace.MessageConsumerAcknowledgeMode.AUTO;

        const consumer = session.createMessageConsumer(consumerProps);
        state.consumer = consumer;

        consumer.on(solace.MessageConsumerEventName.UP, () => {
            emitState({ subscriptionState: 'bound', lastError: '' });
        });

        consumer.on(solace.MessageConsumerEventName.CONNECT_FAILED_ERROR, (error) => {
            emitState({ connectionState: 'error', subscriptionState: 'error', lastError: formatError(error) });
        });

        consumer.on(solace.MessageConsumerEventName.DOWN, () => {
            emitState({ subscriptionState: 'down' });
        });

        consumer.on(solace.MessageConsumerEventName.DOWN_ERROR, (error) => {
            emitState({ subscriptionState: 'error', lastError: formatError(error) });
        });

        consumer.on(solace.MessageConsumerEventName.MESSAGE, (message) => {
            try {
                handleSolaceMessage(message, 'queue');
            } catch (error) {
                emitState({ lastError: formatError(error) });
            }
        });

        consumer.connect();
        emitState({ subscriptionState: 'binding' });
    }

    function connectSolace() {
        ensureSolaceInitialized();

        const sessionProperties = new solace.SessionProperties({
            url: state.config.wsUrl,
            vpnName: state.config.vpnName,
            userName: state.config.userName,
            password: state.config.password,
            connectTimeoutInMsecs: 10000,
            reconnectRetries: 3,
            reconnectRetryWaitInMsecs: 3000
        });

        const session = solace.SolclientFactory.createSession(sessionProperties);
        state.session = session;

        session.on(solace.SessionEventCode.UP_NOTICE, () => {
            emitState({ connectionState: 'connected', lastError: '' });

            if (state.config.source === 'solace-topic') {
                session.subscribe(
                    solace.SolclientFactory.createTopicDestination(state.config.destinationName),
                    true,
                    'telemetry-subscribe',
                    10000
                );
                emitState({ subscriptionState: 'subscribing' });
                return;
            }

            connectQueueConsumer(session);
        });

        session.on(solace.SessionEventCode.CONNECT_FAILED_ERROR, (error) => {
            emitState({ connectionState: 'error', subscriptionState: 'error', lastError: formatError(error) });
        });

        session.on(solace.SessionEventCode.DOWN_ERROR, (error) => {
            emitState({ connectionState: 'error', subscriptionState: 'error', lastError: formatError(error) });
        });

        session.on(solace.SessionEventCode.DISCONNECTED, () => {
            emitState({ connectionState: 'disconnected', subscriptionState: 'idle' });
        });

        session.on(solace.SessionEventCode.RECONNECTING_NOTICE, () => {
            emitState({ connectionState: 'reconnecting' });
        });

        session.on(solace.SessionEventCode.RECONNECTED_NOTICE, () => {
            emitState({ connectionState: 'connected' });
        });

        session.on(solace.SessionEventCode.SUBSCRIPTION_OK, () => {
            emitState({ subscriptionState: 'subscribed', lastError: '' });
        });

        session.on(solace.SessionEventCode.SUBSCRIPTION_ERROR, (error) => {
            emitState({ subscriptionState: 'error', lastError: formatError(error) });
        });

        session.on(solace.SessionEventCode.MESSAGE, (message) => {
            try {
                handleSolaceMessage(message, 'topic');
            } catch (error) {
                emitState({ lastError: formatError(error) });
            }
        });

        emitState({ connectionState: 'connecting', subscriptionState: 'idle', lastError: '' });
        session.connect();
    }

    function startSimulator() {
        let routeIndex = -1;
        let cycleNumber = 1;

        const emitNext = () => {
            if (routeIndex === -1) {
                const cycleId = `sim-cycle-${cycleNumber}`;
                const resetPayload = createResetPayload(state.config.deviceId, cycleId, `${cycleId}-reset`);
                forwardPayload(resetPayload, 'simulator');
                routeIndex = 0;
                state.simulatorTimer = window.setTimeout(emitNext, resetPayload.waitMs);
                return;
            }

            const waypoint = DEMO_ROUTE[routeIndex];
            const cycleId = `sim-cycle-${cycleNumber}`;
            const timestamp = new Date().toISOString();
            forwardPayload(
                {
                    ...waypoint,
                    deviceId: state.config.deviceId,
                    cycleId,
                    stepIndex: routeIndex + 1,
                    commandId: `${cycleId}-step-${routeIndex + 1}`,
                    timestamp
                },
                'simulator'
            );

            routeIndex += 1;
            if (routeIndex >= DEMO_ROUTE.length) {
                routeIndex = -1;
                cycleNumber += 1;
            }

            state.simulatorTimer = window.setTimeout(emitNext, waypoint.waitMs ?? state.config.simulatorIntervalMs);
        };

        emitState({ connectionState: 'connected', subscriptionState: 'simulated', lastError: '' });
        emitNext();
    }

    function validateConfig() {
        if (state.config.source === 'simulator') {
            return;
        }

        if (!state.config.wsUrl || !state.config.vpnName || !state.config.userName || !state.config.password || !state.config.destinationName) {
            throw new Error('Solace mode requires WebSocket URL, VPN, username, password, and a topic or queue name.');
        }
    }

    function start(nextConfig = {}) {
        state.config = sanitizeConfig({ ...state.config, ...nextConfig });
        persistConfig(state.config);
        stop(false);

        try {
            validateConfig();
            if (state.config.source === 'simulator') {
                startSimulator();
            } else {
                connectSolace();
            }

            emitState({ config: { ...state.config } });
            return { ok: true };
        } catch (error) {
            emitState({ connectionState: 'error', subscriptionState: 'error', lastError: formatError(error) });
            return { ok: false, error };
        }
    }

    function getConfig() {
        return { ...state.config };
    }

    return {
        getConfig,
        start,
        stop,
        destroy() {
            stop();
        }
    };
}