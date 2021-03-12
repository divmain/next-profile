import { promises as fsPromises } from 'fs'
import { mean, median, sampleStandardDeviation } from 'simple-statistics'
import cliProgress from 'cli-progress'
const { readFile, writeFile } = fsPromises

import {
  sleep,
  exec,
  measure,
  fetchUntilConnect,
  randomString,
  eventSource,
  range,
  formatMicroseconds,
  EventSourceHelper,
} from './util'


// TODO: make configurable
const NEXT_URL = 'http://localhost:3000/'
// TODO: make configurable
const NEXT_HMR_URL = 'http://localhost:3000/_next/webpack-hmr?page=/'
// TODO: remove the "depth" piece and only profile the page and file
//       that is specified explicitly
const MAX_DEPTH = 4
// TODO: make configurable
const ITERATIONS = 500
const PAUSE_DURATION = 50 // milliseconds

const INJECT_PRELUDE = '\n/*** NONCE:'
const INJECT_POSTLUDE = ':NONCE ***/\n'

const prepForHmr = async (sourceFilePath: string) => {
  let content = await readFile(sourceFilePath, 'utf8')

  const toInject = `${INJECT_PRELUDE}${randomString()}${INJECT_POSTLUDE}`
  let injectStart = content.indexOf(INJECT_PRELUDE)
  let injectEnd = content.indexOf(INJECT_POSTLUDE) + INJECT_POSTLUDE.length

  if (injectStart === 1) {
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

const getMeasurements = async () => {
  const { sigint, onExit } = exec('yarn run next-dev')

  console.log('first page load...')
  const measureFirstPageLoad = measure()
  const first = await fetchUntilConnect(NEXT_URL)
  await first.response.text()
  const firstPageLoad = measureFirstPageLoad()

  await sleep(PAUSE_DURATION)

  console.log('second page load...')
  const measureSecondPageLoad = measure()
  const second = await fetchUntilConnect(NEXT_URL)
  await second.response.text()
  const secondPageLoad = measureSecondPageLoad()

  await sleep(PAUSE_DURATION)

  const hmrSse = await eventSource(NEXT_HMR_URL)

  const hmrMeasurements = []

  const progressBar = new cliProgress.SingleBar({
    format: 'HMR Iterations | {bar} | {percentage}% | {eta_formatted}'
  }, cliProgress.Presets.shades_classic);
  progressBar.start(MAX_DEPTH * ITERATIONS, 0);

  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    for (let iteration = 1; iteration < ITERATIONS; iteration++) {
      progressBar.update(depth * ITERATIONS + iteration)
      const triggerHmr = await prepForHmr(depth)

      const measureHmr = measure()
      await triggerHmr()
      await eventOfType(hmrSse, 'building')
      const hmrNotify = measureHmr()
      await eventOfType(hmrSse, 'built')
      const hmrComplete = measureHmr()

      hmrMeasurements.push({
        depth,
        iteration,
        hmrNotify,
        hmrComplete,
      })
    }
  }

  progressBar.stop();

  console.log('terminating next...')
  const exit = onExit()
  sigint()
  await exit

  return {
    firstPageLoad,
    secondPageLoad,
    hmrMeasurements,
  }
}

const reportStats = (
  description: string,
  numbers: number[] = [],
) => {
  if (!numbers.length) { return }

  console.log(`${description}, mean: ${formatMicroseconds(mean(numbers))}`)
  console.log(`${description}, median: ${formatMicroseconds(median(numbers))}`)
  console.log(`${description}, stddev: ${formatMicroseconds(sampleStandardDeviation(numbers))}`)
}

// TODO: abstract away the deleting of `.next`
    // "measure-next-hmr": "rm -fr .next && node harness/hmr-next.js",
const main = async () => {
  const { firstPageLoad, secondPageLoad, hmrMeasurements } = await getMeasurements()

  console.log('---')

  console.log(`cold start time: ${formatMicroseconds(firstPageLoad)}`)
  console.log(`page load (second): ${formatMicroseconds(secondPageLoad)}`)

  reportStats(
    'notify',
    hmrMeasurements.map(({ hmrNotify }) => hmrNotify)
  )
  console.log(`notify (first): ${formatMicroseconds(hmrMeasurements[0].hmrNotify)}`)
  console.log(`notify (second): ${formatMicroseconds(hmrMeasurements[1].hmrNotify)}`)

  for (let _depth of range(4)) {
    reportStats(
      `notify (depth ${_depth})`,
      hmrMeasurements
        .filter(({ depth }) => depth === _depth)
        .map(({ hmrNotify }) => hmrNotify)
    )
  }

  reportStats(
    'complete',
    hmrMeasurements.map(({ hmrComplete }) => hmrComplete)
  )
  console.log(`complete (first): ${formatMicroseconds(hmrMeasurements[0].hmrComplete)}`)
  console.log(`complete (second): ${formatMicroseconds(hmrMeasurements[1].hmrComplete)}`)
  for (let _depth of range(1, 5)) {
    reportStats(
      `complete (depth ${_depth})`,
      hmrMeasurements
        .filter(({ depth }) => depth === _depth)
        .map(({ hmrComplete }) => hmrComplete)
    )
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err)
    process.exit(1)
  })

