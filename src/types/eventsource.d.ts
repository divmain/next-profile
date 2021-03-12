declare module 'eventsource' {
  type OnEventNames = 'open' | 'message' | 'error'

  declare class EventSource {
    static readonly CLOSED: number
    static readonly CONNECTING: number
    static readonly OPEN: number

    constructor(url: string, eventSourceInitDict?: EventSource.EventSourceInitDict)

    readonly CLOSED: number
    readonly CONNECTING: number
    readonly OPEN: number
    readonly url: string
    readonly readyState: number
    readonly withCredentials: boolean
    on: (eventName: OnEventNames, listener: EventListener) => void
    onopen: (listener: EventListener) => any
    onmessage: (listener: EventListener) => any
    onerror: (listener: EventListener) => any
    addEventListener(type: string, listener: EventListener): void
    dispatchEvent(evt: Event): boolean
    removeEventListener(type: string, listener?: EventListener): void
    close(): void
  }

  declare namespace EventSource {
    enum ReadyState { CONNECTING = 0, OPEN = 1, CLOSED = 2 }

    interface EventSourceInitDict {
      withCredentials?: boolean
      headers?: object
      proxy?: string
      https?: object
      rejectUnauthorized?: boolean
    }
  }

  export = EventSource
}
