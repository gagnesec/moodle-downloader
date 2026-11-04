# Verification report

## Current verification: November 4, 2026

The saved real-school report was created at `2026-11-04T19:02:47.347Z` (UTC). This request-safety check used production code and genuine Moodle responses, with no response interception or fake Moodle server.

| Check | Observed result |
| --- | --- |
| Offline regressions | **52 passed, 0 failed** on Node.js 26.12.1. Includes the policy, adapter, cache, cancellation and earlier regressions. |
| Static checks | JavaScript syntax, manifest scope, assets and prohibited dynamic-code checks passed. |
| Actual extension browser check | Loaded in isolated Chromium; privacy, token masking, toolbar relocation/no duplicate tab, narrow layout and refresh control passed. No page errors, school requests or unexpected HTTP requests. |
| Cross-context request lock | The actual extension page held its production lease while the actual service worker queued on the same Web Lock, acquiring it only after release. No HTTP request or fake server was involved. |
| Real API/file request budget | **7**: 2 account/course-list APIs, 2 filtered File/Folder scan APIs, 2 explicit refresh APIs and 1 download. The separately opened school homepage and its ordinary assets are excluded. |
| Real request concurrency | Maximum **1** outstanding API/file request. |
| Real start pacing | Minimum observed request-event gap **1,995 ms**. The gate reserves starts at least 2,000 ms apart; browser event timestamps are delivered asynchronously. |
| Repeated ordinary scan | Reused its fresh in-memory listing, **0 extra requests**. |
| Explicit refresh | Exactly **2** additional filtered listing requests. |
| Real file | **231,154-byte PDF** saved, expected size and PDF header matched, SHA-256 calculated from saved bytes. Report: 1 completed, 0 failed, 0 not started. |
| Controls | PDFs, Slides, All files, None, individual selection, 390px connected layout, picker cancellation and disconnect passed. |
| Credential hygiene | Configured credential values and common credential/private-key markers checked against prospective Git files and reachable Git blobs without displaying values. No matches found. This bounded scan is not proof every possible secret type is absent. |

The live check used an existing authorized service token and Chrome's real origin-private filesystem directory handle. It did not re-exercise normal SSO or native OS picker confirmation. No load test, quiz attempt, external-tool launch, submission or activity-view/completion request was made.

Focused offline failure checks exercise actual policy/adapter logic with controlled inputs, not a fake Moodle server. They prove a 429 stops a three-file batch after its first request, cancels the unread body, leaves the other files not started and blocks another outgoing request during cooldown. They also cover Retry-After seconds/dates, conservative fallbacks, permission/server pauses, persisted-state reuse, lease/queue/pacing cancellation, cache expiry/refresh/identity invalidation and validated partial results without caching an incomplete scan. These failures were not induced on a school; no actual rate limit/account restriction was deliberately triggered. Offline failure behavior is not school-compatibility evidence.

A separate regression rejects the first cooldown-storage write after HTTP429,401,403,500 or599. Each case still makes only one request, cancels the unread body, leaves two files not started, releases the request lease and exposes no underlying storage-error details. Failed persistence is flagged and the user receives a safe manual-retry deadline rather than a false claim the cooldown was saved. This failure hardening was verified offline after the ordinary live path; no extra school requests were needed.

The GitHub workflow runs offline regressions, static checks and the isolated browser check using Node.js 26. It receives no school credentials and never runs the opt-in live test. Actual remote status is shown in GitHub Actions; local success or a workflow definition alone does not establish a remote CI pass.

## Earlier real-profile evidence: November 3, 2026

Course Files for Moodle 0.1.0 is implemented for local Chrome use, not a store-published release. The normal callback connection and actual Windows folder-picker path have now been exercised in the user's real Chrome profile: automatic token capture, enrolled courses, course/file selection, folder permission and a PDF saved to Downloads. This used the existing signed-in Moodle/SSO session, not fresh password entry or MFA. No DevTools or token paste was needed.

Earlier automated live run: 2026-11-03T05:37:05.884Z (UTC). The native Downloads report was created at 2026-11-03T05:31:16.614Z (UTC).

## Historical build checks: November 3, 2026

| Check | Actual result |
| --- | --- |
| `npm test` | 23 passed, 0 failed. Covers API allowlist, origin/path validation, callback correlation, cancelled-connection races, naming collisions, site inference, toolbar handling and cancellation boundaries. |
| `npm run check` | JavaScript syntax, manifest scope, bundled assets and dynamic-code checks passed. |
| `npm run test:browser` | Actual unpacked extension loaded in Chromium. Privacy dialog worked, token field was masked, 390px initial layout had no horizontal overflow, no page errors and no unexpected HTTP requests. |
| Opt-in real browser test | Actual production extension read site/account data, listed enrolled courses, scanned one selected course and streamed one real PDF to an actual Chrome filesystem directory handle. No mocked server or intercepted responses. |
| Automatic site detection | Production detector recognized the real Moodle homepage. Separately, the actual toolbar icon and first-run host permission were exercised in the user's Chrome before normal callback connection. |
| Toolbar handling | Actual Chrome API test verified moving the existing utility into the clicked window, activating it and avoiding duplicate tabs. Opening no longer waits for page inspection or queries browsing history. |
| Picker state | Pending folder selection freezes controls. Cancelling the picker restores controls without disconnecting. Verified using a controlled picker promise in the real-browser test, not a simulated Moodle response. |
| Compact selection UI | Desktop course sidebar and file checklist, selection count/size, visible main actions, progress and completion. Narrow layouts have no horizontal overflow. |
| File selection | PDFs, Slides, All files, None and an individual checkbox exercised on the real course list. |
| Connected narrow layout | Course/file selection at 390px had no horizontal overflow. |
| Saved file | 231154 bytes, expected size matched, PDF header checked, SHA-256 calculated from saved bytes. One completed, zero failed, zero not started. |
| Disconnect | Session token absent after disconnect. |
| Source whitespace | `git diff --check` passed. Windows line-ending notices are not errors. |
| Packaged runtime | Archive entries checked against the original runtime bytes, actual credential value excluded, extracted ZIP loaded in Chromium and the extension UI smoke check passed. |

The live data path is restricted to three read API function names, with separate File/Folder listings, and selected-file downloads. The auto-detection check also opens the school's normal homepage, with ordinary browser resource loads. It does not launch quizzes, external tools, submissions or viewed/completion calls.

The automated test uses Chrome's actual filesystem implementation with an origin-private handle. A separate actual-profile check used the real Windows folder picker and Chrome file-edit permission, saved a PDF to Downloads and verified the disk bytes and report. SHA-256: `a4e47370219e9a4358dbbc7419e8a30236b8dde0bad16983193ebd3e1676a5ad`. The native report records one completed, zero failed and zero not started. No school content, tokens or private profiles are packaged.

A first detection check ran before the school's document finished rendering and failed. After waiting for the real page to present its Moodle configuration, the production detector passed. No fabricated response was substituted.

## Request-safety independent review

The bounded pre-push review found one fail-open edge case: a failed cooldown-storage write could mask a known rate-limit error and allow another file request. The correction preserves the classified pause, stops the batch, cancels the unread body and releases the lease even when storage fails. Its regression covers five response statuses and a failed write. A separate final re-review passed with no security concerns, logic errors or suggestions in that corrective delta. These reviews are bounded evidence, not security certification or a guarantee of school acceptance.

## Earlier independent review

Independent reviews identified stale connection cleanup, file/directory prefix collisions and metadata-only root inference defects. All were fixed with regression coverage. The compact UI was independently implemented and browser-checked. The final bounded independent review passed with no security concerns, logic errors or suggestions; all four launcher regressions passed.

## Remaining release checks

- Fresh password entry and MFA were not exercised; normal connection used the existing signed-in browser session.
- Exercise an actual nested Folder resource and a multi-course download manually. Existing live evidence covers one selected course and one saved File resource.
- Confirm behavior on another school's Moodle before claiming broad compatibility.
- Supply publisher identity and a hosted privacy policy, complete store disclosures, and obtain Chrome Web Store review. The GitHub source repository is already public and MIT-licensed; there is no Chrome Web Store publication.
- Conservative pacing cannot guarantee school acceptance, avoid every shared-IP limit or prevent all account/IP restrictions. Use only where permitted.

## Reproduce

Development requires Node.js 26+. Node and Playwright are not runtime requirements for extension users. Do not repeatedly rerun a failed live check or bypass a recorded cooldown by using a fresh profile.

```sh
npm test
npm run check
npm run test:browser
MOODLE_CONFIG='C:/path/to/authorized/config.json' TEST_OUTPUT='C:/private/test-results' node tests/live-browser.mjs --live
```

The live command requires explicit opt-in. It reads credentials from the specified existing configuration, never command arguments. Use only an account you are authorized to access. Real profiles, course content, configuration, tokens and private screenshots stay outside the distributed package.
