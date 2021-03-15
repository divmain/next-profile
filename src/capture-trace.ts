import http, { IncomingMessage, ServerResponse } from 'http'


const PORT = 9411
const HOST = '0.0.0.0'

const onRequest = (traces: Object[]) => async (
  req: IncomingMessage,
  res: ServerResponse,
) => {
  if (
    req.method !== 'POST' ||
    req.url !== '/api/v2/spans' ||
    (req.headers && req.headers['content-type']) !== 'application/json'
  ) {
    res.writeHead(200)
    return res.end()
  }

  try {
    const body = JSON.parse(await getBody(req))
    for (const traceEvent of body) {
      traces.push(traceEvent)
    }
    res.writeHead(200)
  } catch (err) {
    console.warn(err)
    res.writeHead(500)
  }

  res.end()
}

const getBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
    })
    req.on('end', () => {
      if (!req.complete) {
        return reject('Connection terminated before body was received.')
      }
      resolve(data)
    })
    req.on('aborted', () => reject('Connection aborted.'))
    req.on('error', () => reject('Connection error.'))
  })

const captureTrace = async (): Promise<() => Promise<Object[] | void>> => {
  const traces: Object[] = []

  const server = http.createServer(onRequest(traces))

  const tearDown = (): Promise<Object[] | void> => new Promise((resolve, reject) => {
    server.close(err => err ? reject(err) : resolve(traces))
  })

  return new Promise(resolve => {
    server.listen(PORT, HOST, () => {
      console.log(`>>> next.js collector listening on http://${HOST}:${PORT}`)
      resolve(tearDown)
    })
  })
}

export default captureTrace
