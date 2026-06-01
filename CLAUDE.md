# CLAUDE.md — QA Regression Automation (Portable)

A reusable rule for running regression automation in any test repo.

**How to reuse this file:** copy it into a new repo and edit **only the
`CONFIG` block** below. Everything under "WORKFLOW" is project-agnostic and
should not need changes. If a specific repo needs a tweak, edit that repo's
copy — keep this master generic.

---

## CONFIG  ← edit this section per project

```yaml
# --- Issue / Test tracker -------------------------------------------------
tracker: azure_devops          # azure_devops | jira | testrail
tracker_base_url: "https://dev.azure.com/Cybersoft-Technologies-Inc/PrimeroEdge%20Classic"
# How to pull the test case ID out of a pasted URL.
# Default rule: the ID is the last path segment of the URL.
id_extraction: "last_path_segment"   # last_path_segment | last_numeric | query_param:<name>
api_version: "7.0"             # tracker API version (ADO cloud = 7.0)

# --- Auth env vars (NEVER hardcode secrets) -------------------------------
tracker_pat_env: "AZURE_DEVOPS_PAT"   # name of the token var
pat_source: ".env"                    # where to read it: .env | shell_env
# IMPORTANT: load the PAT from the repo's .env file (parse the file directly),
# NOT from the shell environment. Claude Code's tool shells do not inherit the
# .env automatically, so reading the file is what actually works.
# App-under-test creds are read from the repo's own .env / utils — see below.

# --- Where things live in THIS repo ---------------------------------------
generated_spec_dir: "tests/tickets"   # where new ticket specs are written
site_map_file: "site-map.md"          # the stored site knowledge (auto-managed)

# --- Naming ---------------------------------------------------------------
# Spec files are named after the ticket tag found in the test case title,
# e.g. a title containing "T-116454" -> tests/tickets/T-116454.spec.ts
spec_name_source: "ticket_tag_in_title"   # ticket_tag_in_title | test_case_id
ticket_tag_pattern: "T-\\d+"               # regex for the tag in the title

# --- Run output -----------------------------------------------------------
capture_on_failure: ["screenshot", "trace", "video"]
site_map_update: "auto"        # auto | diff_first
```

---

## WORKFLOW  ← generic, do not edit per project

### The `regression` command

When the user says **`regression`**, run the steps below.

#### Step 0 — Understand the repo FIRST

Before touching anything, survey the project so changes match its existing
conventions. Detect and follow what's already there — do not impose a pattern.

- **Locator strategy:** Is there a central locator/xpath file (e.g.
  "ReusableXpath", a `locators/` or `selectors` module)? Page objects in a
  `pages/` dir? Inline selectors only? → Reuse whatever exists.
- **Login flow:** Find how existing tests authenticate (e.g. `global-setup.ts`,
  `utils/authStorage.ts`, `utils/accountFlow.ts`, a fixtures file) and mirror it.
- **Structure:** spec folder layout, naming, base-URL helper, env handling
  (`.env`, `utils/env.ts`, `utils/baseUrl.ts`).
- **Creds:** read app credentials from the repo's own env/utils — never hardcode
  and never accept secrets pasted in chat.

Use these findings for every later step.

#### Step 1 — Prompt for the URL (only)

Ask for **one input**: the tracker URL of the test case.
Do not ask for anything else — the ID and steps come from that URL.

#### Step 2 — Extract the test case / issue ID

Apply `CONFIG.id_extraction`. Default `last_path_segment`, e.g.
`.../_workitems/edit/117488` → `117488`.

#### Step 3 — Fetch and validate the link FIRST (before asking anything)

**The very first action after receiving a link is to fetch the work item and
check its type — do this automatically, before asking the user any
clarifying/processing questions.** For azure_devops, use the read-only helper:

```
node scripts/ado-workitem.js <workItemId | full ADO URL>
```

It reads `AZURE_DEVOPS_PAT` from `.env`, prints `TYPE` / `TITLE` / `STATE`, and
for a Test Case prints the parsed steps. It only does a GET (no writes), so it is
allowlisted in `.claude/settings.local.json` and runs **without a permission
prompt**. (Title field is `System.Title`; steps are in `Microsoft.VSTS.TCM.Steps`;
type is `System.WorkItemType`.)

If the token cannot be found in `.env`, stop and tell the user to add a line
`AZURE_DEVOPS_PAT=<token>` to their `.env` file.

**MUST be a Test Case.** The helper prints `WRONG_LINK:` when the type is not
`Test Case` (e.g. `Task`, `Bug`, `User Story`, `Feature`). In that case:
- **STOP immediately.** Do not parse steps, write a spec, or run anything.
- Tell the user: *"That link is a `<type>`, not a Test Case — please resend the
  Test Case link."*
- **Never update, tag, or modify a non–Test Case work item** (in particular,
  never write `[Automated]` onto a Task). Only Test Cases are ever updated.

Test Cases carry their steps in `Microsoft.VSTS.TCM.Steps`; Tasks/Bugs do not,
which is the tell-tale sign you were handed the wrong link.

See **TRACKER ADAPTERS** below for raw call details (used by the helper).

#### Step 4 — Determine the spec file name

Per `CONFIG.spec_name_source`:
- `ticket_tag_in_title`: extract the tag matching `CONFIG.ticket_tag_pattern`
  from the title (e.g. `T-116454`) → `{generated_spec_dir}/T-116454.spec.ts`.
- `test_case_id`: use the ID → `{generated_spec_dir}/{ID}.spec.ts`.

#### Step 5 — Load the site map

Read `CONFIG.site_map_file` for the memorized baseline (pages, tabs, key
elements, URLs). This is the known "before" state to verify against. If it
does not exist, it will be created during this run.

#### Step 6 — Run the automation

- Drive the app with Playwright following the parsed steps, using the repo's
  established login + locator conventions (from Step 0).
- Where a step is vague or a locator is unknown, **explore the live page** to
  discover the element rather than failing. Prefer role/text locators; fall
  back to robust CSS/XPath when needed.
- **Reusable locators** (elements likely used by future tests): write them into
  the repo's locator store (central xpath file or the relevant `pages/` object,
  per Step 0). **One-off** elements: use inline, don't persist.

#### Step 7 — Verify

- Check actual vs. each step's expected result.
- Cross-check against the site-map baseline (e.g. "home page had 3 tabs, ticket
  adds 2 → expect 5"). Flag mismatches.

#### Step 8 — Capture on failure

On any failure, capture everything in `CONFIG.capture_on_failure`
(screenshots, traces, video) so the cause is visible.

#### Step 9 — Update the site map

Reconcile `CONFIG.site_map_file` with what was observed: add new
pages/tabs/elements, update changed labels/URLs, note removed items.
If `CONFIG.site_map_update` is `auto`, save silently; if `diff_first`, show
the diff and wait for approval.

#### Step 10 — Report

Summarize: steps passed/failed, expected vs. actual for failures, locators
discovered live (and where they were saved), and what changed in the site map.

#### Step 11 — Mark the Test Case as automated (only on a green run)

**Only when the spec was written AND the test passed**, go back to the tracker
work item from Step 1 and append ` [Automated]` to its title, then save.
- e.g. title `T-117468` → `T-117468 [Automated]`.
- **Test Cases only.** This is guaranteed by the Step 3 type-check — never tag a
  `Task`/`Bug`/other work item. If you somehow reach here with a non–Test Case,
  do nothing.
- **Idempotent:** if the title already ends with `[Automated]` (case-insensitive),
  do nothing — never append it twice.
- Skip this step entirely if any step failed; only passing tests get the tag.
- See **TRACKER ADAPTERS** below for the per-tracker update call.

---

### The `fixtests` command

When the user says **`fixtests`**, run the pipeline-failure triage workflow.

#### Step 1 — Prompt for the build URL (only)

Ask for **one input**: the Azure DevOps build results URL, e.g.
`https://dev.azure.com/<org>/<project>/_build/results?buildId=<ID>&view=ms.vss-test-web.build-test-results-tab`
Parse the `buildId` from it.

#### Step 2 — Get the failed tests

Use the Azure DevOps **Test Results REST API** with the token from
`CONFIG.tracker_pat_env` (read from `CONFIG.pat_source`, i.e. `.env`).
Fetch the failed test results for that build and collect each failed test's
**display name** (e.g. "Catering - Menu - Manage Menus create, rename,
toggle, assign items, and delete").

(If the API list is unavailable, fall back to asking the user to paste the
failed test names.)

#### Step 3 — Map each test name to its spec

For each failed test name, search the repo for that exact string inside a
`test('...')` title. The build display name matches the `test()` title, so
this locates the spec file (e.g. `tests/tickets/t-113440.spec.ts`).

#### Step 4 — Fix one at a time

Process failures **one by one** (not batched). For each:
1. Run only that test in isolation, e.g. `npx playwright test -g "<test name>"`.
2. **If it passes now** → mark as passing, move to the next.
3. **If it fails** → diagnose using the trace/screenshot/video and the site
   map, then auto-fix using the same locator-discovery rules as `regression`
   (prefer role/text locators; persist only genuinely reusable ones). Re-run
   that single test until green.

#### Step 5 — Real-bug guard (do not fake a pass)

If a failure looks like an **actual application defect** (not a stale locator
or test issue), do **NOT** modify the test to make it pass. Flag it instead.
Likewise, if the cause can't be determined, flag it as needs-investigation.
Never make a test green by hiding a real problem.

#### Step 6 — Report at the end

After processing all failures, list every test in three buckets:
- **Fixed** — what was wrong and the fix applied.
- **Possible real bug** — flagged for manual check, with the symptom.
- **Couldn't diagnose** — what was tried and where it got stuck.

So the user knows exactly what still needs a human.

> **TODO (parked — remind the user):** After all failures are resolved, send a
> follow-up RingCentral webhook (the same channel that posts the
> "K12Catering Automation completed / Passed / Failed / Total" message),
> e.g. "All N previously-failed tests fixed and re-passing." Wire this up
> after the fix workflow itself is validated.

---

### The `rerun` command

When the user says **`rerun`**, **`rerun failed`**, or **`rerun --failed-tests`**,
ask for **one input only**: the Azure DevOps **build results URL** (the same kind
of link `fixtests` takes), then re-run just that build's failed tests **locally**
and post the updated count to RingCentral. This is a fully local action — it does NOT trigger
or modify the Azure pipeline, and it cannot change the original build's results
page (that page stays frozen at what the pipeline produced — the updated numbers
live in the webhook message text, not in the link).

**Re-run FIXES, then re-runs — don't just re-run as-is.** When a re-run test
still fails because of a **test-side issue** (stale locator, too-strict
assertion, abbreviated-vs-full text, etc.), **fix it and re-run** — using the
same locator-discovery / real-bug-guard rules as `fixtests`. These small,
clearly-correct fixes do **not** need the user's approval — just apply them, re-run
until green, and report what you changed. Only **stop and ask** for big or risky
changes, or when it looks like a **real application defect** (then flag it, never
fake a pass). Don't bounce minor formatting/labeling choices back to the user
either — pick the sensible option and go.

**Failed-tests label (webhooks).** When a webhook lists failed tests, label each
one as `<ticket tag>: <test title>` — e.g. `T-113438: Catering - Districts/Data
Sync …`. The ticket tag comes from the spec file name (`t-113438.spec.ts` →
`T-113438`); the title disambiguates multiple tests living in the same file. The
list is rendered inside a code block so the bullet lines don't collapse in
RingCentral.

**No URL on a repeat.** The helper remembers the last build it re-ran (in the
ledger). If the user just says `rerun` again with no link, run the helper with
**no build argument** — it reuses the last build and re-runs only its remaining
still-failing set. Only ask for the URL when there is no prior re-run on record
(the helper says so) or the user clearly means a different build.

**Always re-run on QA.** Before re-running, the helper checks which env VS Code
is pointed at (`.vscode/settings.json` → `playwright.env.ENV_FILE`: unset = QA,
`.env.release` = Release/UAT). If it is **not** QA, the helper prints a
`NEEDS_ENV_SWITCH:` line and stops. When you see that marker, **ask the user**
(yes/no): *"Tests are set to run against RELEASE, not QA — switch to QA?"* On
**yes**, re-invoke the helper with `--qa` (it switches to QA and continues). On
**no**, stop. Run it in a terminal directly and it just asks y/n itself.

**Builds already re-run.** If the same exact build (same org/project/build id)
has already been re-run before, behavior depends on the prior outcome — the
helper tracks this via a local ledger (`.rerun-history.json`, gitignored) that
records each build's outcome:

- **Prior run was all green** (every previously-failed test passed): **hard-stop.**
  Tell the user we already ran this build and it all passed — nothing to do. We
  don't re-run a build we already know is fully green.
- **Prior run still had failures:** do **not** silently skip and do **not**
  silently re-run. The helper prints a `NEEDS_CONFIRM:` line with the prior
  outcome (how many still failed, how many recovered). When you see that marker,
  **ask the user** (yes/no): *"We already ran this build and it still had N
  failing — run those again?"* Only if they say yes, re-invoke the helper with
  `--force`. If they decline, stop. (Run in a terminal directly and it just
  asks y/n itself instead of printing the marker.)

`--force` always overrides the ledger and re-runs regardless.

Run the helper with the build URL (or build id) — or no argument to reuse the
last build:

```
node scripts/rerun-failed.js [buildId | full build results URL] [--qa] [--force]
```

`--qa` switches the env to QA and continues (the yes answer to the env prompt);
`--force` skips the already-re-run question.

It does everything:
1. Reads the build's **failed test names** and **total test count** straight
   from the build's test results (Azure DevOps Test API, `AZURE_DEVOPS_PAT`
   from `.env` — same source as `fixtests`). **But** if this build was re-run
   before, it instead re-runs only the tests **still failing after the last
   re-run** (read from the ledger), not the build's original failures — so a
   repeat re-run shrinks the set instead of re-running already-passing tests.
2. Posts a RingCentral webhook: *"re-running N previously failed test(s)..."*
   with an `Original run:` link to that build (N reflects the latest set).
3. Re-runs only those failed tests locally, matched by title
   (`playwright test -g`).
4. Merges the local outcome back into the build's counts — **Total stays the
   same**, **Failed** = whatever still fails locally (matched **by name**),
   **Passed** = Total − Failed — and posts an updated RingCentral webhook (e.g.
   `Passed: 122 | Failed: 1 | Total: 123`). The latest still-failing test names
   + baseline total are saved to the ledger for the next re-run.

Notes:
- The webhook URL is read from `.env` as `RINGCENTRAL_WEBHOOK_URL`. Without it
  the script still re-runs and just prints the messages instead of posting.
- No prior local run is needed — the failed set and the baseline total both
  come from the build you pass in (or, on a repeat, from the ledger's latest
  still-failing set).

---

### Scheduled auto-rerun (in the pipeline)

The Azure pipeline (`azure-pipelines.yml`) auto-re-runs failed tests on the
**scheduled (~3am) run only** — so you don't have to manually `rerun` every
morning. It is a separate flow from the local `rerun` command above.

Flow on a scheduled build:
```
Run tests → post "completed" webhook → (if any failed) auto re-run the failed
tests → post an updated webhook
```

- **Stage `Rerun_Failed`** runs after `Notify`, gated by
  `and(eq(variables['Build.Reason'], 'Schedule'), eq(dependencies.Run_Playwright_QA.result, 'Failed'))`
  — i.e. scheduled run **and** tests failed. Push-to-`main` builds never auto-rerun.
- It runs **`node scripts/ci-rerun-failed.js`** (committed, unlike the gitignored
  local `rerun-failed.js`). That helper reads the build's published
  `results.json` (no PAT needed — same results the webhook link points at),
  re-runs only the failed tests by title, then posts the merged result.
- It runs **once** and reports — **no loop**.

**Re-run only — it does NOT fix test code.** There is no Claude in the pipeline,
so a real test-code issue (stale locator, changed label, assertion mismatch)
will just fail again and show up in the next webhook's `Failed Tests:` list.
Flaky / env-blip failures get auto-recovered; genuine fixes still need the local
`rerun` flow with Claude (which fixes then re-runs — see above).

**Webhook format.** Both the pipeline completion message and the re-run messages
use: a bold heading, a fenced code block with `✅ Passed` / `❌ Failed` (with %)
/ `📊 Total` (the completion message also has `⏱ Duration`), and — when there are
failures — a `Failed Tests:` code block listing each as `<ticket tag>: <title>`.
Fenced code blocks are used so lines don't collapse in RingCentral.

---

## SITE MAP

`CONFIG.site_map_file` is Claude's memorized model of the app under test.
**Read first** (Step 5), **update last** (Step 9).

Suggested structure per page:
```
## Page: <name>
- URL: <url>
- Tabs: [tab1, tab2, ...]
- Key elements: <buttons, fields, tooltips, titles>
- Notes: <quirks / recently changed>
```

If it doesn't exist, create it by recording what you observe on the first run.

---

## TRACKER ADAPTERS

How Step 3 fetches the test case for each tracker. Only the one named in
`CONFIG.tracker` is used.

### azure_devops  (implemented)

- Cloud, `api-version = CONFIG.api_version` (7.0).
- Auth: HTTP Basic with empty username and the PAT as password
  (`:{PAT}` base64-encoded).
- **Reads go through `node scripts/ado-workitem.js <id|url>`** (read-only,
  allowlisted, prompt-free) — that is the preferred way to fetch + validate in
  Step 3. The raw endpoint it calls:
  ```
  GET {tracker_base_url}/_apis/wit/workitems/{ID}?$expand=all&api-version={api_version}
  ```
- Steps live in the `Microsoft.VSTS.TCM.Steps` field as XML — parse each
  step's action text and expected result. Title is `System.Title`. The work-item
  type is `System.WorkItemType` (must be `Test Case` — see Step 3).
- **Update title (Step 11):** PATCH the work item with a JSON Patch document.
  Same Basic auth as above; `Content-Type: application/json-patch+json`.
  ```
  PATCH {tracker_base_url}/_apis/wit/workitems/{ID}?api-version={api_version}
  [ { "op": "add", "path": "/fields/System.Title", "value": "{new_title}" } ]
  ```
  Read the current `System.Title` first; only if the type is `Test Case` and the
  title does not already end with `[Automated]`, set `{new_title}` to
  `"{current_title} [Automated]"`.

### jira  (stub — fill in when first needed)

- Auth: Basic with `email:API_TOKEN` (token from `CONFIG.tracker_pat_env`).
- Endpoint: `GET {tracker_base_url}/rest/api/3/issue/{ID}` (or Xray/Zephyr
  test-step endpoint if test steps are managed by an add-on).
- Map: summary→title, description→description, test steps→from the add-on.

### testrail  (stub — fill in when first needed)

- Auth: Basic with `email:API_KEY` (key from `CONFIG.tracker_pat_env`).
- Endpoint: `GET {tracker_base_url}/index.php?/api/v2/get_case/{ID}`.
- Map: title→title, custom steps field→steps + expected results.

---

## CONVENTIONS

- Always follow the repo's existing patterns discovered in Step 0 over any
  assumption here.
- Prefer complete, copy-pasteable files over partial diffs when sharing code.
- Never commit secrets; read them from env. Never accept secrets in chat.
- Keep locator stores clean: persist only genuinely reusable selectors.

---

## NOTES / TODO

- [x] Pipeline-failure triage workflow → see the `fixtests` command above.
- [x] Scheduled auto-rerun → see "Scheduled auto-rerun (in the pipeline)" above
      (`Rerun_Failed` stage + `scripts/ci-rerun-failed.js`). Re-runs failed tests
      on the nightly run and posts an updated webhook (re-run only, no auto-fix).
- [x] Richer webhook format (emoji, %, Duration, `Failed Tests:` list).
- [ ] RingCentral webhook follow-up: after `fixtests` resolves all failures,
      post a "all N failed tests fixed and re-passing" message to the same
      RingCentral channel as the build-completion webhook. Wire up after the
      fix workflow is validated.
