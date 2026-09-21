/**
 * Writes the showcase to disk. Run: node showcase/write.mjs [outdir]
 *
 * Every page is a real file with its own <title>, description and canonical.
 * Nothing is rendered by JavaScript, so it indexes, it works on a bad
 * connection, and it is readable by an answer engine quoting a passage.
 */
import { mkdir, writeFile, copyFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { SITE, BRAND } from './build.mjs'
import { home, pricing, compliance } from './pages.mjs'
import { index, pipeline, assess, scorecards, rtr, placements } from './demo.mjs'
import { agreements, agreement, documents, outreach } from './demo2.mjs'

const OUT = process.argv[2] ?? 'showcase/dist'

const FILES = {
  'index.html': home,
  'pricing.html': pricing,
  'compliance.html': compliance,
  'demo/index.html': index,
  'demo/pipeline.html': pipeline,
  'demo/scorecards.html': scorecards,
  'demo/assess.html': assess,
  'demo/right-to-represent.html': rtr,
  'demo/placements.html': placements,
  'demo/agreements.html': agreements,
  'demo/agreement.html': agreement,
  'demo/documents.html': documents,
  'demo/outreach.html': outreach,
}

const today = new Date().toISOString().slice(0, 10)

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${Object.keys(FILES)
  .map(
    (p) =>
      `  <url><loc>${SITE}/${p}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>${
        p === 'index.html' ? '1.0' : p.startsWith('demo/') ? '0.6' : '0.8'
      }</priority></url>`,
  )
  .join('\n')}
</urlset>
`

const robots = `User-agent: *
Allow: /
${SITE ? `Sitemap: ${SITE}/sitemap.xml` : ''}
`

async function put(path, contents) {
  const full = join(OUT, path)
  await mkdir(dirname(full), { recursive: true })
  await writeFile(full, contents, 'utf8')
}

async function main() {
  await mkdir(OUT, { recursive: true })

  for (const [path, html] of Object.entries(FILES)) {
    await put(path, html)
  }

  await copyFile('showcase/styles.css', join(OUT, 'styles.css'))
  await put('sitemap.xml', sitemap)
  await put('robots.txt', robots)
  // Without this, Pages hands the whole directory to Jekyll, which ignores
  // anything beginning with an underscore and tries to build the rest.
  await put('.nojekyll', '')

  console.log(
    `${Object.keys(FILES).length + 4} files written to ${OUT}` +
      (SITE ? ` for ${SITE}` : ' (no SITE_URL: canonicals omitted)'),
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
