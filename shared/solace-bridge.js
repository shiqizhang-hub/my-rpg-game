/**
 * Shared Solace PubSub+ connection bridge.
 * Wraps solclientjs with connect / publish / subscribe / disconnect helpers.
 */
import solace from 'solclientjs/lib-browser/solclient';

let initialized = false;

function ensureInit() {
    if (initialized) return;
    const props = new solace.SolclientFactoryProperties();
    props.profile = solace.SolclientFactoryProfiles.version10;
    solace.SolclientFactory.init(props);
    initialized = true;
}

/**
 * @typedef {Object} BridgeConfig
 * @property {string} url      WebSocket URL  e.g. wss://…:443
 * @property {string} vpn      Message VPN name
 * @property {string} username
 * @property {string} password
 */

/**
 * Create a Solace session wrapper.
 * @param {BridgeConfig} config
 * @param {{ onConnect?:()=>void, onDisconnect?:(e:any)=>void, onError?:(e:any)=>void }} callbacks
 * @returns {{ publish, subscribe, unsubscribe, disconnect, isConnected }}
 */
export function createSolaceBridge(config, callbacks = {}) {
    ensureInit();

    let session = null;
    let connected = false;
    /** @type {Map<string, (topic:string, payload:any)=>void>} */
    const subscribers = new Map();

    function decodePayload(msg) {
        try {
            const raw = msg.getBinaryAttachment();
            const text = raw instanceof ArrayBuffer
                ? new TextDecoder().decode(new Uint8Array(raw))
                : ArrayBuffer.isView(raw)
                    ? new TextDecoder().decode(raw)
                    : typeof raw === 'string' ? raw : String(raw ?? '');
            return JSON.parse(text);
        } catch {
            return null;
        }
    }

    const sessionProps = new solace.SessionProperties();
    sessionProps.url = config.url;
    sessionProps.vpnName = config.vpn;
    sessionProps.userName = config.username;
    sessionProps.password = config.password;
    sessionProps.connectTimeoutInMsecs = 8000;
    sessionProps.reconnectRetries = 3;

    session = solace.SolclientFactory.createSession(sessionProps);

    session.on(solace.SessionEventCode.UP_NOTICE, () => {
        connected = true;
        callbacks.onConnect?.();
    });

    session.on(solace.SessionEventCode.DISCONNECTED, (e) => {
        connected = false;
        callbacks.onDisconnect?.(e);
    });

    session.on(solace.SessionEventCode.CONNECT_FAILED_ERROR, (e) => {
        connected = false;
        callbacks.onError?.(e);
    });

    session.on(solace.SessionEventCode.MESSAGE, (msg) => {
        const topic = msg.getDestination().getName();
        const payload = decodePayload(msg);
        if (payload === null) return;
        // deliver to matching subscribers (prefix wildcard '>')
        subscribers.forEach((handler, pattern) => {
            if (topicMatches(pattern, topic)) {
                handler(topic, payload);
            }
        });
    });

    session.connect();

    /** Simple Solace wildcard: '>' at end matches remaining levels */
    function topicMatches(pattern, topic) {
        if (!pattern.endsWith('>')) return pattern === topic;
        const prefix = pattern.slice(0, -1);
        return topic.startsWith(prefix);
    }

    return {
        isConnected() { return connected; },

        /**
         * Publish a JSON payload to a topic.
         * @param {string} topic
         * @param {object} payload
         */
        publish(topic, payload) {
            if (!connected || !session) return;
            const msg = solace.SolclientFactory.createMessage();
            msg.setDestination(solace.SolclientFactory.createTopicDestination(topic));
            msg.setBinaryAttachment(JSON.stringify(payload));
            msg.setDeliveryMode(solace.MessageDeliveryModeType.DIRECT);
            session.send(msg);
        },

        /**
         * Subscribe to a topic (supports '>' wildcard).
         * @param {string} topic
         * @param {(topic:string, payload:object)=>void} handler
         */
        subscribe(topic, handler) {
            subscribers.set(topic, handler);
            if (!connected || !session) return;
            try {
                session.subscribe(
                    solace.SolclientFactory.createTopicDestination(topic),
                    true, topic, 5000
                );
            } catch (e) {
                console.warn('[solace-bridge] subscribe error', e);
            }
        },

        /**
         * Re-subscribe all pending subscriptions (call after connect).
         */
        resubscribeAll() {
            if (!connected || !session) return;
            subscribers.forEach((_, topic) => {
                try {
                    session.subscribe(
                        solace.SolclientFactory.createTopicDestination(topic),
                        true, topic, 5000
                    );
                } catch { /* ignore */ }
            });
        },

        unsubscribe(topic) {
            subscribers.delete(topic);
            if (!connected || !session) return;
            try {
                session.unsubscribe(
                    solace.SolclientFactory.createTopicDestination(topic),
                    true, topic, 5000
                );
            } catch { /* ignore */ }
        },

        disconnect() {
            if (!session) return;
            try { session.disconnect(); } catch { /* ignore */ }
            session = null;
            connected = false;
        }
    };
}

/** TOPIC CONSTANTS shared between user and admin */
export const TOPICS = {
    /** User publishes position: replace {userId} manually */
    userPosition: (userId) => `hospital/tracking/position/${userId}`,
    /** Admin subscribes to all user positions */
    allPositions: 'hospital/tracking/position/>',
    /** Admin publishes zone config updates */
    zonesUpdate: 'hospital/admin/zones/update',
    /** Admin publishes broadcast messages */
    broadcast: 'hospital/admin/broadcast',
    /** Admin publishes targeted alert to a user */
    alertToUser: (userId) => `hospital/admin/alert/${userId}`,
    /** User publishes zone breach event */
    userAlert: (userId) => `hospital/tracking/alert/${userId}`,
    /** Admin subscribes to all user alerts */
    allAlerts: 'hospital/tracking/alert/>',
};
