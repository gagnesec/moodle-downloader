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

This is a local beta, **not a published Chrome Web Store listing**. Developer-mode installation is for testing; it is not the intended process for friends.

1. Extract the downloaded ZIP into a folder you keep.
2. Open `chrome://extensions` in desktop Chrome and turn on **Developer mode**.
3. Click **Load unpacked** and select the folder containing `manifest.json`. In the beta bundle, this is the `extension` subfolder.
4. Open your Moodle course or dashboard, then click the extension's toolbar icon.

The intended friend distribution is a reviewed Chrome Web Store installation link. The upload archive is prepared, but publishing requires the owner's developer account, store information/privacy URL, and Google's review. No public publication has been performed.

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

## Verification

See `docs/TEST-REPORT.md` for exactly what was tested. The actual-profile check captured the normal callback token automatically, loaded courses and saved a real PDF through the Windows folder picker into Downloads. Disk bytes and the download report were verified. Separate automated browser checks cover the compact UI, cross-window toolbar handling, filters, picker cancellation and real Moodle downloading. No fake Moodle network responses were used for the live checks.

## Development

Runtime: plain HTML/CSS/JavaScript, no bundled libraries, remote code, build service or native helper.

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
