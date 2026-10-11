import { registerSkinRefreshSubscriber } from './subscribers/skinRefreshSubscriber.js'
import { Events } from './events.js'

/**
 * registerEventBusSubscribers
 *
 * Wires up event-bus subscribers from a single place.  This used to live
 * inline in server.js; the function body was lost during a refactor and the
 * Wires side effects that must follow authenticated plugin events.
 */

/**
 * @param {import('./bus.js').EventBus} eventBus
 * @param {Record<string, Function>} deps service dependencies for subscribers
 */
export function registerEventBusSubscribers(eventBus, deps = {}) {
  if (!eventBus || typeof eventBus.subscribe !== 'function') return
  registerSkinRefreshSubscriber(eventBus, deps)
  if (typeof eventBus.logger?.info === 'function') {
    eventBus.logger.info('event-bus subscribers ready')
  }
  void Events
}

export default registerEventBusSubscribers
