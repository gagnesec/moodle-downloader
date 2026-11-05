# Verification report

## Version 0.1.2: November 5, 2026

| Check | Result |
| --- | --- |
| Offline regressions | **76 passed, 0 failed**, using Node.js 26.12.1. |
| Static checks | JavaScript syntax, manifest permissions, runtime assets and dynamic-code checks passed. |
| First-run UI | Connect remains visible without a detected site. Clicking it retries detection, then provides focused manual-address help if needed. No school requests or page errors. |
| Detection boundaries | Covered late Moodle configuration, nested/dotted installation roots, activity view/index pages, foreign roots, token links and obsolete asynchronous results. |
| Native formats | Offline discovery includes uploaded MP4, MP3 and ZIP files, not just documents. |
| Actual Chrome behavior | Toolbar window relocation, no duplicate utility tab, privacy dialog, token masking and 390px layout passed. The extension page and worker shared the real request lock. |
| Real-school flow | Connect retry detected the real Moodle page without manual address entry. Account/course loading, file selection, refresh, picker cancellation, one file download and disconnect passed. |
| Actual file | **231,154-byte PDF** saved; expected size, PDF header and SHA-256 matched. Report: **1 saved, 0 failed, 0 not started**. |
| Request budget | **7 API/file requests**, maximum concurrency **1**, minimum observed start gap **1,998 ms**. Cached rescan: **0** extra requests. Explicit refresh: **2**. |
| Runtime ZIP | **14 files**, each matched its runtime source bytes. Extracted package passed all 76 regressions, static checks and the actual Chromium UI check. No YuJa/HLS runtime code or libraries. |
| Clean install | Pinned development dependencies installed successfully from the lockfile in a new directory. |
| Independent review | Source-selection and address-reset defects were fixed with regressions. Final corrective review passed without security concerns or logic errors. |
| Credential checks | The configured token was absent from prospective source files and runtime ZIP entries. This bounded scan is not a security certification. |

The live run used genuine Moodle responses, with no fake server or response interception. Homepage assets are separate from the seven API/file requests. The request gate admits starts at least 2,000 ms apart; browser request-event timestamps can vary slightly. No quiz, submission, external-tool launch or activity-view/completion call was made.

### What the live check does not prove

- It used an existing authorized token, test-only pre-granted school-host permission and Chrome's real origin-private filesystem. It did not repeat fresh SSO/MFA or the Windows folder-picker confirmation.
- For the retry check, the test supplied the ID of the real Moodle tab. The production Connect handler, worker and page inspector then ran normally. No address or detection result was supplied to that handler.
- A previous real-profile check on November 3 verified toolbar permission, automatic callback capture using an existing signed-in session, and a PDF saved through the Windows folder picker. That is earlier evidence, not a fresh-login test for every school.
- Nested Folder path handling has offline coverage. The live saved-file check covered one selected course and one File resource, not a multi-course run or an actual nested Folder download.
- Only one school's live data path has been verified. No compatibility percentage is established. Disabled mobile services, custom identity providers and separate-storage redirects can remain blockers.

### Failure handling and reproduction

Offline tests cover cancellation, stale connection cleanup, safe paths, response cleanup, cache expiry and partial results, cooldowns and Retry-After handling. A failed cooldown write still stops the batch after its first rejected request. These failures were not deliberately induced on a school.

Use Node.js 26+:

```sh
npm ci
npm test
npm run check
npm run test:browser
```

The opt-in live command and credential precautions are in `README.md`. Do not repeatedly rerun a failed live check or use a new profile to evade a saved cooldown. CI receives no school credentials and runs no live-school test. Local results do not by themselves establish a GitHub Actions pass.

This remains an unofficial developer beta, not a Chrome Web Store release. No pacing policy guarantees school approval or prevents every account/IP restriction.
