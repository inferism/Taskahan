// Avatar image handling, all in the browser (ARCHITECTURE.md section 8).
// The original file is never uploaded: only the canvas re-encode, which drops EXIF.

export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const AVATAR_SIZE = 384
export const MAX_AVATAR_BYTES = 150 * 1024
/** Start at 0.82 and step down until the file fits. */
export const QUALITIES = [0.82, 0.74, 0.66, 0.58, 0.5, 0.42, 0.34, 0.26]

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']
export const ACCEPT_ATTR = ACCEPTED.join(',')

export type PickProblem = 'type' | 'size' | 'decode'

export const pickMessages: Record<PickProblem, string> = {
  type: 'Pick a JPEG, PNG or WebP photo.',
  size: 'That photo is over 10 MB. Pick a smaller one.',
  decode: 'That photo could not be opened. Pick another one.',
}

/** What the first bytes say the file is, whatever its name or declared type claims. */
async function sniff(file: Blob): Promise<'image/jpeg' | 'image/png' | 'image/webp' | null> {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to))
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v))
    return 'image/png'
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  return null
}

/** Type, size and signature checks. Decoding is checked separately by `loadImage`. */
export async function checkFile(file: File): Promise<PickProblem | null> {
  if (!ACCEPTED.includes(file.type)) return 'type'
  if (file.size > MAX_FILE_BYTES) return 'size'
  if (!(await sniff(file))) return 'type'
  return null
}

/** Decodes the file. Rejects with 'decode' when the browser cannot read it. */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => (img.naturalWidth > 0 ? resolve(img) : reject(new Error('decode')))
    img.onerror = () => reject(new Error('decode'))
    img.src = url
  })
}

export interface Area {
  x: number
  y: number
  width: number
  height: number
}

/** Draws `area` of the image onto a square canvas of `size` pixels. */
export function drawCrop(image: CanvasImageSource, area: Area, size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('encode')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, size, size)
  return canvas
}

/**
 * Encodes at each quality in turn and returns the first WebP under the limit. A browser that
 * cannot encode WebP hands back PNG instead; that is refused, since the bucket takes WebP only.
 */
export async function compress(encode: (quality: number) => Promise<Blob | null>): Promise<Blob> {
  for (const q of QUALITIES) {
    const blob = await encode(q)
    if (!blob || blob.type !== 'image/webp') throw new Error('encode')
    if (blob.size < MAX_AVATAR_BYTES) return blob
  }
  throw new Error('too_big')
}

/** The crop, resized to 384 x 384 and compressed to a WebP under 150 KB. */
export function encodeAvatar(image: CanvasImageSource, area: Area): Promise<Blob> {
  const canvas = drawCrop(image, area, AVATAR_SIZE)
  return compress((q) => new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', q)))
}
