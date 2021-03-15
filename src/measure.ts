import { promises as fsPromises } from 'fs'
import cliProgress from 'cli-progress'
import captureTrace from './capture-trace'
const { readFile, writeFile } = fsPromises

import {
  sleep,
  exec,
  measure,
  fetchUntilConnect,
  randomString,
  eventSource,
  EventSourceHelper,
} from './util'


const PAUSE_DURATION = 50 // milliseconds

const INJECT_PRELUDE = '\n/*** NONCE:'
const INJECT_POSTLUDE = ':NONCE ***/\n'

const prepForHmr = async (sourceFilePath: string) => {
  let content = await readFile(sourceFilePath, 'utf8')

  const toInject = `${INJECT_PRELUDE}${randomString()}${INJECT_POSTLUDE}`
  let injectStart = content.indexOf(INJECT_PRELUDE)
  let injectEnd = content.indexOf(INJECT_POSTLUDE) + INJECT_POSTLUDE.length

  if (injectStart === -1) {
    injectStart = content.length
    injectEnd = content.length
  }

  content = `${
    content.slice(0, injectStart)
  }${
    toInject
  }${
    content.slice(injectEnd)
  }`

  return () => writeFile(sourceFilePath, content)
}

const eventOfType = async (
  eventSource: EventSourceHelper,
  eventType: string,
) => {
  while (true) {
    const { data } = await eventSource.nextEvent()
    if (data[0] === '{') {
      const parsed = JSON.parse(data)
      const { action } = parsed
      if (action === eventType) {
        return parsed
      }
    }
  }
}

const measurePageLoad = async (
  baseUrl: string,
  pageRelUrl: string,
  iterations: number,
) => {
  const pageUrl = `${baseUrl}${pageRelUrl}`
  const pageLoadMeasurements = []

  const progressBar = new cliProgress.SingleBar({
    format: 'Page Load | {bar} | {percentage}% | {eta_formatted}'
  }, cliProgress.Presets.shades_classic);
  progressBar.start(iterations, 0);

  for (let iteration = 1; iteration < iterations; iteration++) {
    progressBar.update(iteration)
    const measurePageLoad = measure()
    const first = await fetchUntilConnect(pageUrl)
    const responseLength = (await first.response.text()).length
    const pageLoad = measurePageLoad()

    pageLoadMeasurements.push({
      iteration,
      pageLoad,
      responseLength
    })

    await sleep(PAUSE_DURATION)
  }

  return pageLoadMeasurements
}

const measureHmr = async (
  baseUrl: string,
  pageRelUrl: string,
  fileToChange: string,
  iterations: number,
) => {
  const hmrUrl = `${baseUrl}/_next/webpack-hmr?page=${pageRelUrl}`

  const hmrSse = await eventSource(hmrUrl)

  const hmrMeasurements = []

  const progressBar = new cliProgress.SingleBar({
    format: 'HMR | {bar} | {percentage}% | {eta_formatted}'
  }, cliProgress.Presets.shades_classic);
  progressBar.start(iterations, 0);

  for (let iteration = 1; iteration < iterations; iteration++) {
    progressBar.update(iteration)
    const triggerHmr = await prepForHmr(fileToChange)

    const measureHmr = measure()
    await triggerHmr()
    await eventOfType(hmrSse, 'building')
    const hmrNotify = measureHmr()
    await eventOfType(hmrSse, 'built')
    const hmrComplete = measureHmr()

    hmrMeasurements.push({
      page: pageRelUrl,
      changedFile: fileToChange,
      iteration,
      hmrNotify,
      hmrComplete,
    })
  }

  progressBar.stop()

  return hmrMeasurements
}

const measureHmrManual = async (
  baseUrl: string,
  pageRelUrl: string,
  iterations: number,
) => {
  const hmrUrl = `${baseUrl}/_next/webpack-hmr?page=${pageRelUrl}`

  const hmrSse = await eventSource(hmrUrl)

  const hmrMeasurements = []

  console.log(
    'The profiler is ready to capture hot-module reload timings. You may now make changes\n' +
    'to files required by the page specified. Please wait for builds to complete before\n' +
    'initiating another HMR.'
  )

  const progressBar = new cliProgress.SingleBar({
    format: `HMR | {bar} | {percentage}% | {value} of ${iterations}`
  }, cliProgress.Presets.shades_classic);
  progressBar.start(iterations, 0);

  for (let iteration = 1; iteration < iterations; iteration++) {
    progressBar.update(iteration)

    await eventOfType(hmrSse, 'building')
    const measureHmr = measure()
    await eventOfType(hmrSse, 'built')
    const hmrComplete = measureHmr()

    hmrMeasurements.push({
      page: pageRelUrl,
      iteration,
      hmrComplete,
    })
  }

  progressBar.stop()

  return hmrMeasurements
}

const getMeasurements = async (
  baseUrl: string,
  pageRelUrl: string,
  pageLoadIterations: number,
  hmrIterations: number,
  shouldCaptureTrace: boolean,
  fileToChange?: string,
) => {
  let endCapture
  let env = { ...process.env }
  if (shouldCaptureTrace) {
    endCapture = await captureTrace()
    // Enable trace emit in Next.js.
    env.TRACE_TARGET = 'ZIPKIN'
  }

  console.log('starting next...')
  const { sigint, onExit } = exec('node ./node_modules/.bin/next', { env })

  const pageLoadMeasurements = await measurePageLoad(
    baseUrl,
    pageRelUrl,
    pageLoadIterations,
  )
  const hmrMeasurements = fileToChange
    ? await measureHmr(
      baseUrl,
      pageRelUrl,
      fileToChange,
      hmrIterations,
    )
    : await measureHmrManual(
      baseUrl,
      pageRelUrl,
      hmrIterations,
    )

  let traces
  if (endCapture) {
    traces = await endCapture()
  }

  console.log('terminating next...')
  const exit = onExit()
  sigint()
  await exit

  return {
    pageLoadMeasurements,
    hmrMeasurements,
    traces,
  }
}

export default getMeasurements
