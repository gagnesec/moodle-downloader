# Design and safety boundaries

Course Files is a small Manifest V3 Chrome extension, not a full Moodle backup tool or a hosted service. The runtime uses browser APIs and local HTML/CSS/JavaScript, with no runtime npm dependencies. Development-only Playwright checks load the actual extension.

## Components

| Component | Responsibility |
| --- | --- |
| `launcher.js` | Open or relocate the existing utility tab without duplicate windows or browsing-history permission. |
| `detect.js` | Read the user-clicked tab's Moodle configuration using temporary access. Validate the HTTPS site boundary. |
| `background.js` | Own the pending connection attempt, capture the correlated mobile callback, validate the account and keep the ordinary token in session storage. Cancelled verification aborts its network request. |
| `core.js` | Fixed read-API adapter, native File/Folder discovery, URL/path validation, stable collision-safe names, streamed download and outcome reporting. |
| `request-policy.js` | Coordinate API/file requests with an exclusive per-school Web Lock, pace starts and persist server-requested cooldowns. |
| `course-cache.js` | Reuse complete, recent course listings in tab memory, with explicit refresh and connection-generation invalidation. |
| `app.js` | Course/file selection, folder access, progress, cancellation and reporting. No automatic background sync. |

## Normal data flow

1. The user clicks the toolbar icon on Moodle. Detection reads that page's configuration with a bounded readiness wait; it does not fetch course listings. Connect stays visible if detection fails and can retry only that tab, whose ID is kept in session storage. A failed retry opens manual address help. Slow older inspections cannot replace a newer tab's result.
2. The user grants optional access to that school's HTTPS origin and signs in on the normal school page. The callback must match the pending tab/site/passport and expiry. Its MD5 value is correlation, not a cryptographic signature.
3. Two fixed API requests validate the account and load its enrolled courses. The token is sent in POST bodies, not download URLs, and kept in Chrome session storage.
4. The user selects courses. Each uncached course uses two `core_course_get_contents` requests, filtered separately to `resource` and `folder`.
5. The user selects files and grants a destination folder. Each selected native file is validated again, fetched with redirects rejected and streamed directly to a new organized directory. A JSON report records saved, failed, cancelled and not-started files.

## Why keep two course-list requests?

The Moodle 4.5 implementation filters by one module name before dispatching content-export callbacks. An unfiltered request can invoke callbacks belonging to other installed activity plugins before client-side filtering discards their results. Two filtered requests retain the narrower behavior; caching reduces repeat requests without widening activity access. Even filtered requests still perform common course/module metadata work. This is not a claim of zero server-side interaction with other activity metadata.

Upstream implementation: `moodle/moodle`, branch `MOODLE_405_STABLE`, `course/externallib.php`, `core_course_external::get_course_contents`. Native exporters are in `mod/resource/lib.php` and `mod/folder/lib.php`. School customizations can differ.

## Request coordination

A Web Lock named by the school's HTTPS origin is shared by this extension's same-origin tabs and service worker. The lease stays held while the response is processed and while an errored body/writer is cleaned up. Starts are at least two seconds apart. There is no chunk-level bandwidth throttle and no automatic retry.

Before starting, the gate checks locally persisted cooldown metadata. HTTP 429 stops the batch and honors a usable future `Retry-After` value, including either integer seconds or an HTTP date; the fallback is five minutes. Permission responses and server errors also stop with at least a minute's cooldown and honor a longer requested wait. Cooldowns survive disconnect/browser restart. Expiry permits a manual action; it never schedules a retry.

If cooldown persistence fails, the known server pause still stops the current batch. The error is flagged and shows a safe manual-retry deadline; it does not falsely claim that storage succeeded or reveal the underlying storage exception. Such a pause may not be remembered after the failed write, so the warning must be respected.

Closing a context releases its Web Locks through the browser. Cancellation aborts queued locks, pacing waits and active fetches. If the required coordination/storage APIs are unavailable, the extension does not start a request without the gate.

These controls coordinate this extension installation, not other extensions, browser profiles, devices, normal Moodle browsing or other people behind a shared IP. They do not guarantee an institution will permit automated downloading or never impose restrictions.

## Cache and partial-result boundaries

Only a successful pair of File/Folder responses becomes a complete cache entry. Entries live in tab memory for up to five minutes and are invalidated by connection changes. Explicit refresh bypasses reuse. Cancelled or obsolete-generation results cannot repopulate the cache. If the Folder listing fails after File results arrive, validated partial results can still be shown, but the snapshot is not cached as complete and the scan stops.

After a partial download, successful files are unchecked so a later manual attempt can target only remaining files. Every new attempt creates a separate run directory; this is not persistent job resumption or a cross-run mirror/deduplication system.

## Security scope and limits

- Only three fixed read API function names are permitted. No quiz attempts, submissions, activity-view calls, external-platform launches or privileged discovery.
- File URLs must match the connected HTTPS origin, native webservice endpoint, module context and expected path. Discovery validation and download-time validation are separate safety boundaries.
- Filenames and directory prefixes share case-insensitive reservations. Existing destination files are not overwritten. Files are not automatically opened or executed.
- The ordinary token/course list are session-only. Private callback-token fields are discarded. Persisted request metadata contains timings/status, not credentials or course contents.
- There is no backend, analytics or remote executable code. Optional host permission is requested for the selected school, not mandatory access to every website.
- Browser/tab crashes may leave an unfinished run. Fresh MFA, arbitrary school identity-provider configurations and school-specific plugin behavior are not universally verified. See `TEST-REPORT.md` for executed evidence rather than treating this design as certification.
