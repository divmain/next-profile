import { promises as fsPromises } from 'fs'

import captureTrace from './capture-trace'
import {
  exec,
} from './util'

const { writeFile } = fsPromises


export default async function runTrace (argv: any) {
  const {
    command,
    outfile,
  } = argv

  console.log('starting trace...')
  let endCapture
  let env = {
    // Enable trace emit in Next.js.
    TRACE_TARGET: 'ZIPKIN',
    ...process.env
  }
  endCapture = await captureTrace()

  console.log(`running command: ${command}`)
  const { onExit } = exec(command, { env })

  console.log('waiting for command to complete...')
  await onExit()

  console.log('stopping trace...')
  const traces = await endCapture()

  console.log(`writing measurements to file ${outfile}...`)
  const payload = JSON.stringify(traces, null, 2)
  await writeFile(outfile, payload, 'utf8')  
}

