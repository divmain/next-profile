import path from 'path'
import { promises as fsPromises } from 'fs'
// @ts-ignore
import yargs from 'yargs'
// @ts-ignore
import { hideBin } from 'yargs/helpers'

import getMeasurements from './measure'

const { stat, writeFile } = fsPromises


const defineCommandOpts = ({
  demandFile
}: {
  demandFile: boolean
}) => (yargs: any) => {
  yargs.positional('page', {
    describe: 'next.js page to profile',
    type: 'string',
  })
  if (demandFile) {
    yargs.option('file', {
      describe: 'the file that will be automatically edited to trigger an HMR',
      alias: 'f',
      array: true,
      demandOption: true,
      normalize: true,
      type: 'string',
    })
  }
  yargs.option('pageLoadIterations', {
    describe: 'number of times to measure response time when "refreshing the browser"',
    alias: 'p',
    type: 'number',
    demandOption: true,
  })
  yargs.option('hmrIterations', {
    describe: 'number of times to measure HMR speed when a file is changed',
    alias: 'h',
    type: 'number',
    demandOption: true,
  })
  yargs.option('captureTrace', {
    describe: 'capture internal compilation timings (available in next.js >10.0.9)',
    alias: 't',
    type: 'boolean',
  })
  yargs.option('baseUrl', {
    alias: 'b',
    default: 'http://localhost:3000',
    type: 'string'
  })
  yargs.option('outfile', {
    alias: 'o',
    default: path.resolve(process.cwd(), `${Date.now()}.next-profile.json`),
    type: 'string',
    normalize: true,
  })
}

const fileExtensionRe = /.*\.(t|j)sx?$/
const parsePage = (pageStr: string) => {
  if (pageStr.indexOf('pages/') === 0) {
    pageStr = pageStr.slice(5)
  }
  if (fileExtensionRe.test(pageStr)) {
    pageStr = pageStr.replace(fileExtensionRe, "")
  }
  return pageStr
}

const validateFile = async (filePath: string) => {
  try {
    const stats = await stat(filePath)
    return stats.isFile()
  } catch (err) {
    return false
  }
}

const main = async () => {
  const argv: {
    _: string[],
    page: string,
    file?: string,
    pageLoadIterations: number,
    hmrIterations: number,
    captureTrace: boolean,
    baseUrl: string,
    outfile: string,
  } = yargs(hideBin(process.argv))
    .command(
      'auto [page]',
      'Profile a Next.js page with automatic HMRs.',
      defineCommandOpts({
        demandFile: true
      })
    )
    .command(
      'manual [page]',
      'Profile a Next.js page with manual HMRs.',
      defineCommandOpts({
        demandFile: false
      })
    )
    .argv

  const {
    _,
    page,
    file,
    pageLoadIterations,
    hmrIterations,
    captureTrace: shouldCaptureTrace,
    baseUrl,
    outfile,
  } = argv

  if (!_ || !_.length || ['manual', 'auto'].indexOf(_[0]) === -1) {
    console.log('Please provide a command. Run with --help to see options.')
    process.exit(1)
  }


  const pageRelUrl = parsePage(page)
  const fileToChange = file
    ? path.resolve(process.cwd(), file)
    : undefined

  if (fileToChange && !validateFile(fileToChange)) {
    throw new Error(`File '${file}' does not exist or you don't have access.`)
  }

  const measurements = await getMeasurements(
    baseUrl,
    pageRelUrl,
    pageLoadIterations,
    hmrIterations,
    shouldCaptureTrace,
    fileToChange,
  )

  console.log(`writing measurements to file ${outfile}...`)
  const payload = JSON.stringify(measurements)
  await writeFile(outfile, payload, 'utf8')  
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
