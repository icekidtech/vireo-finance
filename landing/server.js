// Serves the built landing page (dist/) for hosts that run the site as a Node app.
// No dependencies. Start with `npm start` after `npm run build`.
import { createServer } from 'node:http'
import { createReadStream, statSync } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('./dist', import.meta.url)))
const PORT = Number.parseInt(process.env.PORT ?? '3000', 10)

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
}

function fileFor(urlPath) {
  let decoded
  try {
    decoded = decodeURIComponent(urlPath)
  } catch {
    return { status: 400 }
  }
  if (decoded.includes('\0')) return { status: 400 }
  // Resolve inside dist only: anything that climbs out of it is refused.
  const target = normalize(join(ROOT, decoded))
  if (target !== ROOT && !target.startsWith(ROOT + sep)) return { status: 403 }

  try {
    const stat = statSync(target)
    if (stat.isFile()) return { status: 200, file: target }
    if (stat.isDirectory()) {
      const index = join(target, 'index.html')
      if (statSync(index).isFile()) return { status: 200, file: index }
    }
  } catch {
    // fall through to the single-page-app fallback below
  }
  // Paths without a file extension are app routes: serve the app. A missing asset is a real 404.
  if (extname(decoded) === '') return { status: 200, file: join(ROOT, 'index.html') }
  return { status: 404 }
}

const server = createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD', ...SECURITY_HEADERS })
    return res.end()
  }
  const { pathname } = new URL(req.url ?? '/', 'http://localhost')
  const found = fileFor(pathname)
  if (found.status !== 200) {
    res.writeHead(found.status, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS })
    return res.end(found.status === 404 ? 'Not found' : 'Bad request')
  }

  const type = TYPES[extname(found.file)] ?? 'application/octet-stream'
  const immutable = found.file.startsWith(join(ROOT, 'assets') + sep)
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    ...SECURITY_HEADERS,
  })
  if (req.method === 'HEAD') return res.end()
  createReadStream(found.file).on('error', () => res.destroy()).pipe(res)
})

server.listen(PORT, () => {
  console.log(`Vireo landing is serving dist/ on port ${PORT}`)
})
