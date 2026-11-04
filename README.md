# Course Files for Moodle

A small browser-native Chrome extension for downloading the native files published in your selected Moodle courses. No Python, desktop installer, AI service, or hosted backend.

## What it does

1. Open your Moodle course or dashboard and click the extension icon. It detects the Moodle address from that page, then offers Connect.
2. Select courses and click **Find files**.
3. Click **Choose folder & download** and choose a destination.
4. Keep the tab open while files stream into a new organized folder. A report records saved, failed, and not-started files.

All found files are selected by default. The visible file checklist lets you choose individual files, or use All files, PDFs, Slides and None. Existing files are not overwritten. Files are never executed or automatically opened.

### Scope

This release handles native files in Moodle **File** and **Folder** activities. It is not an exhaustive course backup. External platforms/repository aliases, page-embedded files, submissions, restricted activities, quiz/lesson content and history are not included. It uses only three fixed Moodle read-function names and the native file endpoint. Download permissions are rechecked by Moodle.

## Try the developer build

This is a developer beta, **not a published Chrome Web Store listing**. You can install the source locally. Broad compatibility across schools is not yet verified.

1. Download the repository ZIP using GitHub's **Code > Download ZIP**, then extract it into a folder you keep. Alternatively, clone the repository.
2. Open `chrome://extensions` in desktop Chrome and turn on **Developer mode**.
3. Click **Load unpacked** and select the repository's **`extension`** subfolder, which contains `manifest.json`. Do not select the repository root.
4. Open your Moodle course or dashboard, then click the extension's toolbar icon.

After updating the source, click **Reload** on the extension's card in `chrome://extensions`, then reopen Course Files. Chrome Web Store distribution would require a developer account, listing information, a hosted privacy policy and Google's review. This GitHub repository is public; the extension has not been published to the Chrome Web Store.

## Connect

Open Moodle and click Course Files in the Chrome toolbar. It reads Moodle's own site configuration from that tab and shows the detected address. Grant access to that Moodle host and finish signing in on the school's own page. The extension handles the mobile-service callback and validates the pending connection before accepting the ordinary service token. It does not continuously scan browser tabs or browsing history. Manual address entry is a fallback, not the normal flow.

School settings may disable the mobile API or force their own app's URL scheme. Chrome MV3 cannot guarantee cancelling an external-app prompt; choose **Cancel** if prompted to open another app. Normal callback token capture was verified in the user's actual Chrome using an existing signed-in Moodle/SSO session, without DevTools or token paste. Fresh password entry and MFA were not exercised; do not assume universal school compatibility.

**Already have a token?** The optional existing-token field accepts an ordinary Moodle service token, not a school password. The actual extension has been verified against an authorized real Moodle account using this route.

Tokens are session-only. Reconnect after restarting Chrome. Disconnect clears the connection and attempts to revoke its optional website permission; downloaded files stay in your selected folder.

## Downloading and errors

- Desktop Chrome 120+ with the File System Access API is required. A system folder chooser grants access to your chosen destination.
- The extension does not run while this tab is closed and does not perform scheduled/background synchronization.
- Cancel stops the current transfer and records the outcome. Abrupt browser/tab closure may leave an unfinished run; inspect its report/files before retrying.
- A failed or redirected file is not silently called complete. Files hosted through a school-specific CDN redirect may be unsupported in this first version.
- A changed file size requires rescanning. Disk/path/permission failures are reported, not ignored.
- Each run gets a new folder. This first release does not deduplicate against prior runs or update an existing course mirror.

## Request safety and school limits

- No background polling, prefetching or automatic retries. Opening the utility and choosing courses do not fetch course contents.
- API requests and file transfers share one exclusive, per-school request gate across this extension's tabs and service worker. A transfer keeps the slot until response processing and cleanup finish. Starts are spaced by at least **2 seconds**; file contents themselves are streamed without artificial bandwidth throttling.
- Connecting uses **2 API requests**. A fresh scan uses **2 requests per selected course**, one filtered to File activities and one to Folder activities. This avoids invoking the content-export callbacks of unrelated activity plugins. Each selected file normally needs **1 download request**. Normal school sign-in pages and browser resource loads are separate from these counts.
- Complete course listings are reused in this tab for up to **5 minutes**. **Find files** can reuse them; **Refresh selected courses** explicitly checks again. Caches are cleared on connection changes and are not persisted. Partial or failed scans are not cached as complete.
- HTTP **429** stops the batch and persists a per-school cooldown. A valid `Retry-After` value is honored; without a usable future value, the fallback is **5 minutes**. HTTP **401/403** and **5xx** also stop the batch with at least a **1-minute** pause, honoring a longer server-requested wait. Disconnecting or restarting Chrome does not reset a successfully saved cooldown. If Chrome cannot save it, the batch still stops and warns you not to retry before the displayed deadline; the pause may not be remembered afterward. Expiry permits a manual retry; it never starts one automatically.
- A network failure or unexpected login/error page stops the download batch. Already saved files remain saved, unfinished files are reported, and successful files are unchecked after a partial run so retrying the remaining selection need not redownload them. A retry creates a new run folder; it does not resume writing into the previous one. You can still deliberately select all files again.

These are conservative client safeguards, **not a guarantee against school account/IP restrictions**. Limits may be shared across people behind one network, and school policies vary. Use only where your institution permits it; do not treat the extension as a way around access controls or rate limits. See `docs/ARCHITECTURE.md` for the design boundaries.

## Verification

See `docs/TEST-REPORT.md` for exactly what was tested. The actual-profile check captured the normal callback token automatically, loaded courses and saved a real PDF through the Windows folder picker into Downloads. Disk bytes and the download report were verified. Separate automated browser checks cover the compact UI, cross-window toolbar handling, filters, picker cancellation and real Moodle downloading. No fake Moodle network responses were used for the live checks.

## Development

Runtime: plain HTML/CSS/JavaScript, no bundled libraries, remote code, build service or native helper.

Development uses **Node.js 26+**, including its native Web Locks implementation for request-coordination tests. Node and Playwright are not needed to use the extension. CI runs only offline tests and the isolated extension browser check, never a school account.

```sh
npm ci
npx playwright install chromium
npm test
npm run check
npm run test:browser
```

The unit checks cover local validation/error boundaries; they are not evidence of server compatibility. The optional live test contacts a real authorized Moodle server, so it is separate from normal tests:

```sh
MOODLE_CONFIG='C:/path/to/authorized/config.json' TEST_OUTPUT='C:/private/test-results' node tests/live-browser.mjs --live
```

Never put a token in a command argument, source file or issue report. The live test reads credentials only from the explicitly chosen existing configuration and does not publish them. Test browser profiles, screenshots and actual course content belong outside the distributable project/package.

## Independence

This is an unofficial independent implementation of the public Moodle API/file contracts; Moodle-DL/Python code and dependencies are not bundled. The Moodle name identifies compatibility, not affiliation or endorsement. Runtime assets/icons are local. Playwright is a development-only test dependency and is not included in the extension archive.
