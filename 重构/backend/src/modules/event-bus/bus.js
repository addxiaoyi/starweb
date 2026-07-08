import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { Events } from './events.js'

export class EventBus {
  constructor(logger = console) {
    this.logger = logger
    this.emitter = new EventEmitter()
  }

  subscribe(event, handler) {
    const wrapped = async (payload) => {
      try {
        await handler(payload)
      } catch (error) {
        this.logger.error(`event-bus: handler for ${event} failed: ${error.message}`, error)
        this.emitter.emit(Events.EVENT_HANDLER_FAILED, { event, error, payload })
      }
    }
    this.emitter.on(event, wrapped)
    return () => this.emitter.off(event, wrapped)
  }

  publish(event, payload) {
    this.emitter.emit(event, payload)
  }

  once(event, handler) {
    const wrapped = async (payload) => {
      try {
        await handler(payload)
      } catch (error) {
        this.logger.error(`event-bus: handler for ${event} failed: ${error.message}`, error)
        this.emitter.emit(Events.EVENT_HANDLER_FAILED, { event, error, payload })
      }
    }
    this.emitter.once(event, wrapped)
    return () => this.emitter.off(event, wrapped)
  }

  publishAndWait(event, payload, { timeoutMs = 15000 } = {}) {
    const requestId = randomUUID()
    const replyEvent = `vla:command:reply:${requestId}`

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.emitter.off(replyEvent, onReply)
        reject(new Error(`event-bus: no reply for ${event} within ${timeoutMs}ms`))
      }, timeoutMs)

      const onReply = (result) => {
        clearTimeout(timer)
        resolve(result)
      }

      this.emitter.once(replyEvent, onReply)
      try {
        this.publish(event, { ...payload, _replyTo: requestId })
      } catch (err) {
        clearTimeout(timer)
        this.emitter.off(replyEvent, onReply)
        reject(err)
      }
    })
  }

  hasSubscribers(event) {
    return this.emitter.listenerCount(event) > 0
  }
}
