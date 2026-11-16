// Serves dist/ the way Cloudflare Pages does: gzip for text, the SPA fallback for unknown paths.
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { gzipSync } from 'node:zlib'

const root = join(process.cwd(), 'dist')
const port = Number(process.argv[2] ?? 4173)
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
}

createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname))
  let file = join(root, path)
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile())
    file = join(root, 'index.html')
  const ext = extname(file)
  let body = readFileSync(file)
  const headers = { 'content-type': types[ext] ?? 'application/octet-stream' }
  if (/\.(html|js|css|svg|json)$/.test(ext)) {
    body = gzipSync(body)
    headers['content-encoding'] = 'gzip'
  }
  if (file.includes('assets')) headers['cache-control'] = 'public, max-age=31536000, immutable'
  res.writeHead(200, headers).end(body)
}).listen(port, '127.0.0.1')
