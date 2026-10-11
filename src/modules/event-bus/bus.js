import { EventEmitter } from 'node:events'

export class EventBus {
  /** @param {{ info?: Function, warn?: Function, error?: Function }} [logger] */
  constructor(logger = console) {
    this.emitter = new EventEmitter()
    this.emitter.setMaxListeners(50)
    this.logger = logger
  }

  subscribe(event, handler) {
    this.emitter.on(event, async (payload) => {
      try {
        await handler(payload)
      } catch (error) {
        this.emitter.emit('__handler_failed__', { event, error, payload })
        throw error
      }
    })
  }

  once(event, handler) {
    this.emitter.once(event, handler)
  }

  async publish(event, payload) {
    this.emitter.emit(event, payload)
  }

  async publishAndWait(event, payload, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`event timeout: ${event}`)), timeoutMs)
      this.emitter.emit(event, {
        ...payload,
        respond: (result) => {
          clearTimeout(timer)
          resolve(result)
        },
        fail: (error) => {
          clearTimeout(timer)
          reject(error)
        },
      })
    })
  }
}

export { Events } from './events.js'
