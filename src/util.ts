import { randomBytes } from 'crypto'
import { promisify } from 'util'
import { spawn } from 'child_process'

import EventSource from 'eventsource'
import fetch, { Response, RequestInfo, RequestInit } from 'node-fetch'


export const sleep = promisify(setTimeout)

const NANOSECONDS_IN_MICROSECOND = 1000n
export const FETCH_LOOP_SLEEP = 20 // ms

export const exec = (cmd: string, opts={}) => {
  const childProc = spawn(cmd, {
    ...opts,
    shell: true,
    stdio: [
      0,
      'pipe',
      'pipe'
    ],
  })
  const sigint = () => childProc.kill('SIGINT')
  const onExit = () => new Promise(resolve => childProc.on('exit', resolve))

  return {
    sigint,
    onExit,
  }
}

export const measure = () => {
  const start = process.hrtime.bigint()
  return () => Number((process.hrtime.bigint() - start) / NANOSECONDS_IN_MICROSECOND)
}

const nulledFetch = async (
  url: RequestInfo,
  opts: RequestInit,
): Promise<Response | null> => {
  try {
    return await fetch(url, opts)
  } catch (err) {
    return null
  }
}

export const fetchUntilConnect = async (
  url: RequestInfo,
  opts: RequestInit = {}
): Promise<{ response: Response; retries: number }> => {
  let retries = 0
  while (true) {
    const nFetch = await nulledFetch(url, opts)
    if (!nFetch) {
      retries++
    } else {
      return {
        response: nFetch,
        retries
      }
    }
  }
}

export const randomString = () => randomBytes(32).toString('hex')

export type EventSourceHelper = {
  nextEvent: () => Promise<any>,
  all: () => Promise<any>,
}

export const eventSource = (
  url: string
): Promise<EventSourceHelper> => {
  const es = new EventSource(url)
  const watchedEvents = new Map()

  es.on('message', msg => {
    for (let [listener, remaining] of watchedEvents.entries()) {
      listener(msg)
      if (remaining === 1) {
        watchedEvents.delete(listener)
      }
      watchedEvents.set(listener, remaining - 1)
    }
  })

  const fns = {
    nextEvent: () => new Promise(resolve => {
      watchedEvents.set(resolve, 1)
    }),
    all: () => new Promise(resolve => {
      watchedEvents.set(resolve, 0)
    })
  }

  return new Promise((resolve, reject) => {
    let done = false
    es.on('open', () => {
      if (!done) {
        done = true
        resolve(fns)
      }
    })
    es.on('error', err => {
      if (!done) {
        done = true
        reject(err)
      }
    })
  })
}

export function* range (startOrEnd: number, end?: number) {
  const start = end === undefined ? 0 : startOrEnd
  end = end === undefined ? startOrEnd : end

  for (let i = start; i < end; i++) {
    yield i
  }
}

export const formatMicroseconds = (n: number) => `${(n | 0).toLocaleString()} μs`
