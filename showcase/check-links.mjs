/**
 * Fails the build on a dead internal link.
 *
 * A broken link on a static site is invisible until someone clicks it, and
 * by then it is in front of a client. Cheap to check, so check it.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, resolve, dirname, relative } from 'node:path'

const ROOT = resolve(process.argv[2] ?? 'showcase/dist')

async function walk(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(full)))
    else if (entry.name.endsWith('.html')) out.push(full)
  }
  return out
}

const exists = async (p) => {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

const pages = await walk(ROOT)
const broken = []

for (const page of pages) {
  const html = await readFile(page, 'utf8')
  for (const [, href] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    // External, anchors and protocol-relative links are not ours to verify.
    if (/^(https?:|mailto:|#|\/\/|data:)/.test(href)) continue
    const target = resolve(dirname(page), href.split('#')[0])
    if (!(await exists(target))) {
      broken.push(`${relative(ROOT, page)} -> ${href}`)
    }
  }
}

if (broken.length) {
  console.error(`${broken.length} broken internal link(s):`)
  for (const b of broken) console.error('  ' + b)
  process.exit(1)
}
console.log(`${pages.length} pages checked, every internal link resolves.`)
