export const taskPath = (groupId: string, number: number | string) => `/g/${groupId}/t/${number}`

/** "#12" in chat and logs. Digits only, not part of a longer word or a URL fragment like a#b. */
const REF = /(^|[^\w/#&])#(\d{1,6})\b/g

/** Splits text around task references, so each "#12" can be a link. Exposed for tests. */
export function splitTaskRefs(text: string): (string | { number: number })[] {
  const out: (string | { number: number })[] = []
  let last = 0
  for (const m of text.matchAll(REF)) {
    const start = m.index + m[1].length
    if (start > last) out.push(text.slice(last, start))
    out.push({ number: Number(m[2]) })
    last = start + m[2].length + 1
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** Text with every "#12" turned into a link that opens that task on the board. */
