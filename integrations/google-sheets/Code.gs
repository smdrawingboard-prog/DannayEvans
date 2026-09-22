/**
 * Hireframe reporting for Google Sheets.
 *
 * Paste this into Extensions > Apps Script in a new spreadsheet, fill in the
 * three values below, then use the "Hireframe" menu that appears after a
 * reload.
 *
 * What this can and cannot do, so nobody is surprised:
 *   - It reads. It never writes back. The database stays the source of truth,
 *     and every rule it enforces still holds, because nothing here can
 *     bypass them.
 *   - The report token is scoped to named reports and expires. It is not a
 *     database key and it cannot read anything but the reports it was minted
 *     for.
 *   - Anyone with edit access to this spreadsheet can read the token in the
 *     script. Share it accordingly, and revoke the token in Settings if the
 *     sheet goes somewhere it should not have.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Your Supabase project URL, e.g. https://abcdefgh.supabase.co */
const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co'

/** The publishable (anon) key from Supabase > Project Settings > API keys. */
const SUPABASE_ANON_KEY = 'YOUR-ANON-KEY'

/**
 * The report token from Hireframe > Settings > Reporting. Starts with hfr_.
 *
 * Shown once when it is created. If you lose it, revoke it and mint another
 * rather than hunting for it — it is stored only as a hash and cannot be
 * recovered.
 */
const REPORT_TOKEN = 'hfr_YOUR-REPORT-TOKEN'

/** Which reports to pull, and what to call each tab. */
const REPORTS = [
  { report: 'pipeline',   sheet: 'Pipeline' },
  { report: 'shortlist',  sheet: 'Shortlist' },
  { report: 'placements', sheet: 'Placements' },
  { report: 'candidates', sheet: 'Candidates' },
  { report: 'clients',    sheet: 'Clients' },
  { report: 'billing',    sheet: 'Billing' },
]

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Hireframe')
    .addItem('Refresh all reports', 'refreshAll')
    .addSeparator()
    .addItem('Refresh pipeline', 'refreshPipeline')
    .addItem('Refresh shortlist', 'refreshShortlist')
    .addItem('Refresh placements', 'refreshPlacements')
    .addItem('Refresh candidates', 'refreshCandidates')
    .addSeparator()
    .addItem('Refresh every morning', 'installDailyTrigger')
    .addItem('Stop refreshing automatically', 'removeTriggers')
    .addToUi()
}

function refreshPipeline()   { refreshOne('pipeline', 'Pipeline') }
function refreshShortlist()  { refreshOne('shortlist', 'Shortlist') }
function refreshPlacements() { refreshOne('placements', 'Placements') }
function refreshCandidates() { refreshOne('candidates', 'Candidates') }

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

/**
 * Call the one function a report token can reach.
 *
 * Errors come back as a readable sentence from the database — an expired
 * token says so, a token without the right scope says so. They are worth
 * showing verbatim rather than replacing with "something went wrong".
 */
function fetchReport(report, params) {
  if (REPORT_TOKEN.indexOf('YOUR-') === 0) {
    throw new Error('Fill in REPORT_TOKEN at the top of the script first.')
  }

  const response = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/rpc/report_rows', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
    },
    payload: JSON.stringify({
      p_token: REPORT_TOKEN,
      p_report: report,
      p_params: params || {},
    }),
    muteHttpExceptions: true,
  })

  const code = response.getResponseCode()
  const text = response.getContentText()

  if (code !== 200) {
    let message = text
    try {
      const parsed = JSON.parse(text)
      message = parsed.message || parsed.error || text
    } catch (e) {
      // Not JSON. Show what came back.
    }
    throw new Error(report + ': ' + message)
  }

  return JSON.parse(text)
}

// ---------------------------------------------------------------------------
// Writing to the sheet
// ---------------------------------------------------------------------------

/**
 * Replace a tab's contents with the rows given.
 *
 * Columns are taken from the union of the keys across all rows, in first-seen
 * order, so a row missing an optional field does not shift everything right.
 */
function writeSheet(name, rows) {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name)

  sheet.clear()

  if (!rows.length) {
    sheet.getRange(1, 1).setValue('No rows.')
    sheet.getRange(2, 1).setValue('Pulled ' + new Date().toLocaleString())
    return 0
  }

  const columns = []
  rows.forEach(function (row) {
    Object.keys(row).forEach(function (key) {
      if (columns.indexOf(key) === -1) columns.push(key)
    })
  })

  const header = columns.map(function (c) {
    return c.replace(/_/g, ' ').replace(/^./, function (m) { return m.toUpperCase() })
  })

  const body = rows.map(function (row) {
    return columns.map(function (c) {
      const v = row[c]
      if (v === null || v === undefined) return ''
      // Booleans read better as words in a sheet someone is scanning.
      if (v === true) return 'Yes'
      if (v === false) return 'No'
      return v
    })
  })

  sheet.getRange(1, 1, 1, columns.length).setValues([header])
    .setFontWeight('bold')
    .setBackground('#efede8')
  sheet.getRange(2, 1, body.length, columns.length).setValues(body)

  sheet.setFrozenRows(1)
  sheet.autoResizeColumns(1, columns.length)

  // A stamp below the data, so nobody presents a month-old sheet believing
  // it is this morning's.
  sheet.getRange(body.length + 3, 1)
    .setValue('Pulled ' + new Date().toLocaleString() + ' — read-only export from Hireframe')
    .setFontColor('#9a9590')

  return body.length
}

function refreshOne(report, sheetName) {
  const rows = fetchReport(report)
  const count = writeSheet(sheetName, rows)
  SpreadsheetApp.getActiveSpreadsheet().toast(
    count + ' rows', 'Refreshed ' + sheetName, 5)
}

/**
 * Refresh everything the token is allowed to read.
 *
 * A token scoped to two reports should not fail the whole run because it
 * cannot read the other four, so a refusal on one report is collected and
 * reported at the end rather than thrown.
 */
function refreshAll() {
  const skipped = []
  let total = 0

  REPORTS.forEach(function (r) {
    try {
      total += writeSheet(r.sheet, fetchReport(r.report))
    } catch (e) {
      skipped.push(r.report + ' (' + e.message.split(':').pop().trim() + ')')
    }
  })

  const ui = SpreadsheetApp.getUi()
  if (skipped.length) {
    ui.alert(
      'Refreshed ' + total + ' rows.\n\nNot pulled:\n' + skipped.join('\n') +
      '\n\nA report is skipped when this token is not scoped for it. Mint a ' +
      'token with the scopes you need in Hireframe > Settings > Reporting.')
  } else {
    SpreadsheetApp.getActiveSpreadsheet().toast(total + ' rows', 'Refreshed', 5)
  }
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

function installDailyTrigger() {
  removeTriggers()
  ScriptApp.newTrigger('refreshAll')
    .timeBased()
    .atHour(6)
    .everyDays(1)
    .inTimezone(Session.getScriptTimeZone())
    .create()
  SpreadsheetApp.getUi().alert(
    'This sheet will refresh every morning at about 6am, in the ' +
    'spreadsheet’s own timezone.')
}

function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    ScriptApp.deleteTrigger(t)
  })
}
