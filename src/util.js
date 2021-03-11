const { randomBytes } = require('crypto')
const { promisify } = require('util')
const { spawn } = require('child_process')
const EventSource = require('eventsource')

const fetch = require('node-fetch')


const sleep = promisify(setTimeout)

const NANOSECONDS_IN_MICROSECOND = 1000n
const FETCH_LOOP_SLEEP = 20 // ms

const exec = cmd => {
  const start = process.hrtime.bigint()

  const childProc = spawn(cmd, {
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

const measure = () => {
  const start = process.hrtime.bigint()
  return () => Number((process.hrtime.bigint() - start) / NANOSECONDS_IN_MICROSECOND)
}

const nulledFetch = async (url, opts) => {
  try {
    return await fetch(url, opts)
  } catch (err) {
    return null
  }
}

const fetchUntilConnect = async (url, opts={}) => {
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

const randomString = () => randomBytes(32).toString('hex')

const eventSource = url => {
  const es = new EventSource(url)
  const messageListeners = new Set()
  const watchedEvents = new Map()

  es.on('message', msg => {
    for ([listener, remaining] of watchedEvents.entries()) {
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

function* range (start, end) {
  if (end === undefined) {
    end = start
    start = 0
  }
  for (let i = start; i < end; i++) {
    yield i
  }
}

const formatMicroseconds = n => `${(n | 0).toLocaleString()} μs`

module.exports = {
  sleep,
  exec,
  measure,
  fetchUntilConnect,
  randomString,
  eventSource,
  range,
  formatMicroseconds,
}



