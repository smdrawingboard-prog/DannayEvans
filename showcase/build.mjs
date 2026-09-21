/**
 * Builds the static showcase published to GitHub Pages.
 *
 * Pages serves files, not a server, so the application itself cannot run
 * here: it uses server components, server actions, a service-role key and a
 * signature webhook, none of which exist without a Node process. What this
 * produces instead is the marketing site plus a walkthrough of every screen
 * with representative data — enough to show a client, and enough to review
 * the interface without a deploy.
 *
 * Every page is real HTML with its own title, description and canonical, so
 * it is indexable and quotable by an answer engine. No client-side routing.
 */

import { mkdir, writeFile, copyFile, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const OUT = process.argv[2] ?? 'dist'
const SITE = process.env.SITE_URL?.replace(/\/$/, '') ?? ''

const BRAND = {
  platform: 'Hireframe',
  engine: 'Sealed',
  vendor: 'Fate Collab',
  tagline: 'Hiring software for small teams, with signatures built in.',
}

/** Escape anything that could be read as markup. */
const e = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const SITE_NAV = [
  ['index.html', 'Overview'],
  ['pricing.html', 'Pricing'],
  ['compliance.html', 'Compliance'],
  ['demo/index.html', 'See the screens'],
]

const APP_NAV = [
  ['index.html', 'Overview'],
  ['pipeline.html', 'Pipeline'],
  ['scorecards.html', 'Scorecards'],
  ['assess.html', 'Assessment'],
  ['right-to-represent.html', 'Right to represent'],
  ['placements.html', 'Placements'],
  ['agreements.html', 'Agreements'],
  ['agreement.html', 'Agreement detail'],
  ['documents.html', 'Documents'],
  ['outreach.html', 'Outreach and consent'],
]

/** One page of the site. `depth` is how many directories deep it sits. */
function layout({ path, title, description, body, depth = 0, jsonLd }) {
  const up = '../'.repeat(depth)
  const canonical = SITE ? `${SITE}/${path}` : ''
  return `<!DOCTYPE html>
<html lang="en-ZA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title)}</title>
<meta name="description" content="${e(description)}">
${canonical ? `<link rel="canonical" href="${e(canonical)}">` : ''}
<meta property="og:title" content="${e(title)}">
<meta property="og:description" content="${e(description)}">
<meta property="og:type" content="website">
${canonical ? `<meta property="og:url" content="${e(canonical)}">` : ''}
<meta name="twitter:card" content="summary">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Lato:wght@300;400;700&family=Courier+Prime&display=swap">
<link rel="stylesheet" href="${up}styles.css">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ''}
</head>
<body>
<header class="topbar">
  <div class="wrap">
    <a class="brand" href="${up}index.html">${BRAND.platform}<span>by ${BRAND.vendor}</span></a>
    <nav class="topnav" aria-label="Site">
      ${SITE_NAV.map(([href, label]) =>
        `<a href="${up}${href}"${href === path ? ' aria-current="page"' : ''}>${e(label)}</a>`,
      ).join('\n      ')}
    </nav>
  </div>
</header>
<main>
${body}
</main>
<footer class="site">
  <div class="wrap">
    <p><strong>${BRAND.platform}</strong> is the recruitment vertical.
    <strong>${BRAND.engine}</strong> is the document and signature engine underneath it.
    Built by ${BRAND.vendor}.</p>
    <p class="small">This is a static preview. The screens below carry sample data and
    are not connected to a live database — the application needs a server, which
    GitHub Pages does not provide.</p>
  </div>
</footer>
</body>
</html>
`
}

/** The demo shell: site chrome outside, application chrome inside. */
function appPage({ file, title, description, heading, lede, body, jsonLd }) {
  const inner = `
<div class="wrap" style="padding-top:28px">
  <p class="small muted" style="margin-bottom:12px">
    <a href="../index.html">${BRAND.platform}</a> &rsaquo; ${e(title)} &mdash; sample data, not a live workspace
  </p>
  <div class="app">
    <nav aria-label="Application">
      <ul>
        ${APP_NAV.map(([href, label]) =>
          `<li><a href="${href}"${href === file ? ' aria-current="page"' : ''}>${e(label)}</a></li>`,
        ).join('\n        ')}
      </ul>
    </nav>
    <main>
      <h1 style="font-size:1.55rem">${e(heading)}</h1>
      <p class="soft" style="margin-top:-.2em">${lede}</p>
      <div class="stack" style="margin-top:20px">
${body}
      </div>
    </main>
  </div>
</div>`
  return layout({
    path: `demo/${file}`,
    title: `${title} — ${BRAND.platform}`,
    description,
    body: inner,
    depth: 1,
    jsonLd,
  })
}

const stat = (k, v, h) =>
  `<div class="stat"><div class="k">${e(k)}</div><div class="v">${e(v)}</div>${
    h ? `<div class="h">${e(h)}</div>` : ''
  }</div>`

const table = (headers, rows) => `
<div class="scroll"><table>
  <thead><tr>${headers.map((h) => `<th>${e(h)}</th>`).join('')}</tr></thead>
  <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('\n')}</tbody>
</table></div>`

const panel = (title, body, action = '') => `
<section class="panel">
  ${title ? `<header><h2>${e(title)}</h2>${action}</header>` : ''}
  <div class="body">${body}</div>
</section>`

export { layout, appPage, stat, table, panel, e, BRAND, SITE, OUT, APP_NAV, SITE_NAV }
