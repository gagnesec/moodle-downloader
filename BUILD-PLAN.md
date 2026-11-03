# Course Files — build plan (downloader MVP)

## User outcome
Share a Chrome Web Store link. A student installs the extension, connects to their Moodle through normal browser login, selects courses, scans files, and chooses a local folder. The extension saves a structured copy of native files published in Moodle File and Folder activities. No Python, native installer, AI, backend, notes application, or developer setup in the intended published user flow.

This is an independent browser-native implementation. No existing personal integration is modified. A local unpacked developer build is not the same as a published friend-installable store listing; store publication/review remains separate.

## Scope and limits
- One Moodle account/site per browser session; no background crawling or scheduled synchronization.
- Discover own enrolled courses, then File and Folder resources through two narrowly filtered course-content calls per selected course. No stealth-module option is enabled.
- Download available native file records only. Exclude inaccessible modules, external repository aliases, foreign hosts, unknown endpoints, LTI/URL activities, page-embedded files, submissions, and quiz/lesson/SCORM attempt content.
- The product says exactly what was included; it does not claim an exhaustive account backup or universal school compatibility.
- File permission can change after discovery: keep per-file success/failure and do not label partial work complete.

## Decisions supported by research
1. Chrome MV3, plain HTML/CSS/JavaScript ES modules. No runtime dependencies or build service.
2. Detect Moodle when the user clicks the extension on a Moodle page. Use temporary `activeTab` plus `scripting` access to read that page's canonical Moodle address, not continuous browsing inspection. Runtime optional permission is requested for only the chosen HTTPS Moodle origin; `storage` and `webRequest` support connection. No cookie-reading, broad tabs, or native-messaging permission. Manual URL entry is a fallback.
3. Explicit normal login-tab flow to Moodle's mobile launch endpoint. Capture only the pending main-frame response from the exact origin/path/passport; validate canonical-site+passport MD5 correlation, expiration and replay before accepting the ordinary service token. Discard any private token.
4. Normal MV3 cannot guarantee cancellation of a custom-protocol launch. Close the connection tab promptly after a valid response, but do not claim race-free prevention of an app prompt. A school-forced scheme may need manual cancellation or may be unsupported. Existing-token import is an explicit advanced fallback, not normal onboarding.
5. Session-only token storage, inaccessible to content scripts and cleared on disconnect/browser restart. Site URL alone may be retained for convenience. No credentials in logs, reports, download URLs, exports or remote services.
6. Metadata uses only `core_webservice_get_site_info`, `core_enrol_get_users_courses`, and `core_course_get_contents`. Use POST body `wstoken`, finite timeout, no automatic retries and sequential calls.
7. File transport uses form POST `token` to a validated installation-specific `webservice/pluginfile.php` URL, with `credentials: omit` and `redirect: error`. Strip token query fields and reject unknown/duplicate parameters. Match module context/component/content area and original path/name. No arbitrary URL tool.
8. Use the browser File System Access API to choose a folder once and stream one file at a time into a new run directory. This avoids multi-gigabyte ZIP/Blob buffering, token-bearing browser history, and unsafe native-download redirects. If this API is unavailable, explain the Chrome requirement rather than silently switching transport.
9. Preserve hierarchy, use course/module IDs where useful to avoid ambiguity, sanitize Windows-sensitive names, resolve collisions deterministically, never overwrite user files, and write a credential-free download report.
10. Keep the tab open while saving. Cancel aborts the active transfer; failures clean up only this new run's own incomplete file. Browser/school errors remain visible. No local file is executed or opened automatically.

## Knowledge gaps resolved before production code
- Official Moodle 4.5 `launch.php` restricts URL scheme to a genuine scheme; an arbitrary HTTPS Chrome identity callback cannot simply be supplied.
- In a real isolated Chrome-for-Testing browser, a hidden/manual fetch of the custom-scheme redirect failed with `ERR_UNSAFE_REDIRECT` before the relevant response-header event. That approach was rejected, not hidden behind a success claim.
- The same local fixture, navigated as a normal login tab, emitted the response header and allowed the extension to capture its callback; a strict same-site session cookie was sent.
- Official `webservice/pluginfile.php` accepts form POST token through `required_param`; POST parameters are accepted before GET parameters. A real native browser POST download saved the exact fixture bytes without a token in its URL.
- Initial same-origin URLs do not prevent redirect leakage. A controlled `fetch(..., redirect: error)` test rejected a cross-origin 307 without sending the body to its destination. Production transport must retain this guarantee.
- Chrome extension pages expose the directory picker and origin-private file-system interfaces. Test the actual stream writer using real browser file handles; native folder-picker confirmation and real-school compatibility must not be claimed from a stub.
- Modern branded Chrome/Edge removed command-line extension side-loading flags. Automated tests use a pinned Playwright-supported Chrome for Testing and a fresh isolated profile, not the user's signed-in browser.

## Architecture and files
- `extension/core.js`: URL/callback/MD5/path/file-validation rules, fixed-function Moodle requests, file discovery and streaming writer. Browser-independent rules tested with Node's test runner.
- `extension/background.js`: action button, pending-connection state and narrowly filtered callback capture; no passive token collection outside Connect.
- `extension/app.html`, `app.js`, `app.css`: accessible configure/operate UI, course selection, scan counts, per-file progress/cancel/result.
- `extension/manifest.json`, icons: MV3 application package, strict CSP, no remote code/assets.
- `tests/`: Node contract/security tests, controlled HTTPS Moodle-shaped server, actual extension browser tests and screenshots. All credentials/documents are synthetic fixtures.
- `docs/`: install/developer instructions, privacy and publication text, test report and limitations.

## Implementation order and acceptance gates
1. Test-first normalization, then MD5/callback replay correlation, then file URL/path/discovery validation. Watch each slice fail before implementing it; do not build a large imaginary test suite first.
2. Test-first fixed API request wrappers and streamed writing, including token-in-body, redirect rejection, partial failures, collision safety and cancellation cleanup.
3. Add connection worker, minimal UI and manifest; test the real extension against a controlled local HTTPS site, not the school.
4. Exercise login callback, course selection, nested/colliding files, actual stored byte comparisons, restricted/external skips, cancellation, expired token, redirected files, disconnect and reload. No school/account traffic in test fixtures.
5. Independently review security/logic, run all tests/static checks, inspect screenshots and responsive layout, and create ZIPs from an explicit allowlist of extension files. Scan packages for secrets and verify ZIP integrity.

## Definition of done for this build
Working source and a verified developer-installable extension package; store upload ZIP and honest publication/privacy instructions; actual controlled-browser test results; explicit remaining checks. Not a fabricated store URL, live-school success claim or universal importer promise. No attempt to publish publicly or access the real school account without separate authorization.

## Primary evidence
- https://raw.githubusercontent.com/moodle/moodle/MOODLE_405_STABLE/admin/tool/mobile/launch.php
- https://raw.githubusercontent.com/moodle/moodle/MOODLE_405_STABLE/webservice/pluginfile.php
- https://github.com/moodle/moodle/blob/52c0da7c647bd6ba8c5f61882d88959821a1fb41/course/externallib.php
- https://github.com/moodle/moodle/blob/52c0da7c647bd6ba8c5f61882d88959821a1fb41/mod/resource/lib.php
- https://github.com/moodle/moodle/blob/52c0da7c647bd6ba8c5f61882d88959821a1fb41/mod/folder/lib.php
- https://developer.chrome.com/docs/extensions/reference/api/webRequest
- https://developer.chrome.com/docs/extensions/reference/api/storage
- https://developer.chrome.com/docs/capabilities/web-apis/file-system-access
- https://developer.chrome.com/docs/webstore/publish
- https://playwright.dev/docs/chrome-extensions

Research evidence and the disposable browser-capability fixture are in the Hermes scratch directory. Do not ship their profiles, synthetic tokens, downloaded browser or test harness in the user-facing package.
