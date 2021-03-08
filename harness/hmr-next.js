const { promises: { readFile, writeFile } } = require('fs')
const {
  mean,
  median,
  sampleStandardDeviation,
} = require('simple-statistics')

const {
  sleep,
  exec,
  measure,
  fetchUntilConnect,
  randomString,
  eventSource,
  range,
  formatMicroseconds,
} = require('./util')


const NEXT_URL = 'http://localhost:3000/'
const NEXT_HMR_URL = 'http://localhost:3000/_next/webpack-hmr?page=/'
const MAX_DEPTH = 4
const ITERATIONS = 500
const PAUSE_DURATION = 50 // milliseconds


const prepForHmr = async (depth = 0) => {
  let componentFilename = 'components/index.tsx'
  if (depth === 1) {
    componentFilename = 'components/Dwikrdoythlgzcubmdblkuq.tsx'
  } else if (depth === 2) {
    componentFilename = 'components/Cadvgqnxutgljwmpjokj.tsx'
  } else if (depth === 3) {
    componentFilename = 'components/Qxpjuwpugdiqrzgfboyh.tsx'
  } else if (depth === 4) {
    componentFilename = 'components/Facekytlkmpcfgojenkmpr.tsx'
  }

  let content = await readFile(componentFilename, 'utf8')

  const boldStart = content.indexOf('<b>')
  const boldEnd = content.indexOf('</b>') + 4

  if (boldStart === -1) {
    const divEnd = content.indexOf('<div>') + 5
    content = `${
      content.slice(0, divEnd)
    }<b>${
      randomString()
    }</b>${
      content.slice(divEnd)
    }`
  } else {
    content = `${
      content.slice(0, boldStart)
    }<b>${
      randomString()
    }</b>${
      content.slice(boldEnd)
    }`
  }

  return () => writeFile(componentFilename, content)
}

const eventOfType = async (eventSource, eventType) => {
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

  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    console.log(`hmr depth ${depth}...`)
    for (let iteration = 1;iteration < ITERATIONS;  iteration++) {
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

const reportStats = (description, numbers = []) => {
  if (!numbers.length) { return }

  console.log(`${description}, mean: ${formatMicroseconds(mean(numbers))}`)
  console.log(`${description}, median: ${formatMicroseconds(median(numbers))}`)
  console.log(`${description}, stddev: ${formatMicroseconds(sampleStandardDeviation(numbers))}`)
}

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

