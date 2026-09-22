# Hireframe reporting in Google Sheets

A read-only export. Pick the reports you want, paste a script into a
spreadsheet, and pull them on demand or every morning.

The database stays the source of truth. Nothing here writes back, so every
rule the platform enforces — consent gates, the dual-submission guard, the
audit trail — still holds, because a spreadsheet cannot reach around them.

## Setting it up

**1. Mint a token.** In Hireframe, go to Settings → Reporting → Create a
token. Name it after the sheet it is for, tick only the reports that sheet
needs, and set how long it should last.

Scope it narrowly. A sheet showing the weekly numbers has no reason to be
able to pull the candidate list.

The token is shown **once**. Only a hash of it is stored, so it cannot be
looked up again — if you lose it, revoke it and mint another.

**2. Make a spreadsheet** and open Extensions → Apps Script.

**3. Paste in `Code.gs`** from this folder, replacing whatever is there.

**4. Fill in the three values at the top:**

| Value | Where it comes from |
|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → Data API → Project URL |
| `SUPABASE_ANON_KEY` | Supabase → Project Settings → API keys → the publishable (anon) key |
| `REPORT_TOKEN` | The `hfr_…` token from step 1 |

The anon key is designed to be public — it is in the browser on every page of
the app. It grants nothing on its own. The report token is what actually
authorises the read.

**Never put the service-role key here.** It bypasses row-level security
entirely, and anyone with edit access to the spreadsheet can read it.

**5. Save, reload the spreadsheet.** A **Hireframe** menu appears. Use
*Refresh all reports*. Google will ask for permission the first time.

**6. Optional:** *Refresh every morning* sets a 6am daily pull.

## The reports

| Report | What a row is |
|---|---|
| `pipeline` | One stage: how many candidates, median days, how many past target |
| `shortlist` | One submitted assessment, ranked, with the score and recommendation |
| `placements` | One placement: fee, guarantee, time to fill, outstanding check-ins |
| `candidates` | One candidate |
| `clients` | One client: commercials, open roles, whether terms are signed |
| `billing` | One month and event type: envelopes sent |

## What the candidate export deliberately leaves out

No identity or passport numbers. No date of birth. Nothing from the special
personal information categories — no criminal record checks, no medical
disclosures, no banking details. Candidates who have asked to be erased, or
who have been anonymised, are not in it at all.

A spreadsheet is a file that gets forwarded. POPIA section 19 asks the
security of the processing to suit the sensitivity of the data, and a
shareable file is not the right container for a criminal record check.

## Sharing this spreadsheet

Anyone with **edit** access can open Apps Script and read the token. Anyone
with **view** access sees only the data.

So: share it for viewing, keep editing to people who should hold the token,
and if the sheet ends up somewhere it should not have, revoke the token in
Settings → Reporting. Revocation takes effect on the next pull.

Every pull is logged — which report, how many rows, when — on that same
settings page. A sheet quietly pulling the candidate list every hour is
something you can see.

## When something does not work

The error is passed through from the database as a readable sentence.

| Message | What to do |
|---|---|
| `unknown report token` | The token is wrong or was mistyped. Mint another. |
| `this report token has been revoked` | Someone revoked it. Mint another. |
| `this report token expired on …` | Mint another, or set a longer life next time. |
| `this token cannot read the … report` | Its scopes do not include that report. Mint one that does. |
| `Fill in REPORT_TOKEN …` | The placeholder is still at the top of the script. |

*Refresh all reports* skips reports the token cannot read rather than failing
the whole run, and tells you which it skipped.
