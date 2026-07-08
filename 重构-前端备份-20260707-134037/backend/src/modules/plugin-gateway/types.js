/**
 * @typedef {object} PluginCallbackPayload
 * @property {string} event
 * @property {string} [username]
 * @property {string} [uuid]
 * @property {string} [mojang_uuid]
 * @property {boolean|string} [verified]
 * @property {string} [reason]
 * @property {string} [error]
 * @property {string} [method]
 * @property {string} [authMethod]
 * @property {string} [fingerprint]
 * @property {string} [deviceFingerprint]
 * @property {string} [external_user_id]
 * @property {string} [source]
 * @property {string} [current_ip]
 * @property {string} [ip]
 * @property {number|string} [ts_ms]
 * @property {string} [location]
 * @property {string} [asn]
 * @property {string} [isp]
 * @property {string} [risk_score]
 * @property {string} [risk_level]
 * @property {string} [device_profile]
 * @property {string} [email]
 * @property {string} [type]
 * @property {string} [newPassword]
 * @property {string} [device]
 * @property {object} [extra]
 */

/**
 * @typedef {object} PluginCallbackMeta
 * @property {boolean} [vlaInbound]
 * @property {string} [remoteAddress]
 * @property {string} [receivedAt]
 */

/**
 * @typedef {object} VLACommandResult
 * @property {number} status
 * @property {object} [json]
 * @property {boolean} [json.ok]
 * @property {string} [json.error]
 * @property {string} [json.message]
 * @property {object} [json.detail]
 */

/**
 * @typedef {object} CircuitBreakerState
 * @property {number} failures
 * @property {boolean} isOpen
 * @property {number} halfOpenAfter
 */

export default {}
