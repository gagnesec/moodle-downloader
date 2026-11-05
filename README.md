# Course Files for Moodle

A Chrome extension that downloads native Moodle course files into a folder you choose. No Python, desktop helper, hosted backend or account with us.

## Install

This is a developer beta, not a Chrome Web Store listing. Use desktop Chrome 120 or newer.

1. Download the repository using GitHub's **Code > Download ZIP**, then extract it into a folder you keep. You can also clone it.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select the **`extension`** subfolder, not the repository root.

After an update, click **Reload** on the extension's card and reopen Course Files. Store publication is separate and requires Google's review.

## Use

1. Open your Moodle course or dashboard and click **Course Files** in Chrome's toolbar.
2. Check the school address and click **Connect Moodle**. Allow access to that school and sign in on its own page.
3. Select courses and click **Find files**.
4. Review the checklist. Use individual checkboxes or **All files**, **PDFs**, **Slides** and **None**.
5. Click **Choose folder & download**. Keep the tab open until it finishes.

**Connect Moodle stays visible if detection fails.** It retries the tab where you clicked the toolbar icon. If it finds the address, click Connect again to sign in. Otherwise, it opens the manual address field with instructions. Unrelated tabs and browsing history are not scanned.

Each run creates a new organized folder and a report of saved, failed and not-started files. Existing files are not overwritten. Files are not opened or executed automatically. Cancel stops the current operation. Abruptly closing Chrome or the tab may leave an unfinished run; check its report before retrying.

## Scope and compatibility

Included: native files in Moodle **File** and **Folder** activities, including documents, archives, uploaded video and audio. There is no PDF-only restriction.

Not included: external platforms such as YuJa or Pearson, repository aliases, page-embedded files, submissions, restricted content, quiz/lesson content and revision history. Files that redirect to separate storage may be unsupported. This is not a complete backup or incremental sync tool.

Your school must allow Moodle's mobile service, the required read APIs and file downloads. Disabled mobile access, custom SSO and forced school-app redirects can prevent connection. Only one school's live data path has been verified; no compatibility percentage is established.

Normal callback capture was previously verified with an existing signed-in Moodle session. Fresh password entry, MFA and other schools' identity providers remain unverified. If Chrome asks to open another app during sign-in, choose **Cancel**.

The optional **existing service token** field is for troubleshooting. It accepts a Moodle token, not your school password. Reconnect after restarting Chrome.

## Privacy

Files go directly from Moodle to your chosen folder. There is no developer server, analytics or browser sync. Your password stays on your school's page. Tokens and course lists use session storage and are cleared on disconnect or browser restart.

The school address and request timing/cooldowns are remembered locally. The chosen source tab's ID is session-only. Disconnect attempts to revoke the school's optional permission; downloaded files remain in your folder. See `docs/PRIVACY.md` for details.

## Requests and failures

- No background polling, prefetching or automatic retries.
- One API request or file stream at a time per school, with starts at least **2 seconds** apart.
- Connection uses **2 API requests**. A fresh scan uses **2 per selected course**, filtered separately to File and Folder activities. Each selected file normally uses **1 download request**. Sign-in pages and their assets are separate.
- Complete file lists are cached in this tab for **5 minutes**. **Refresh selected courses** checks again. Connection changes clear the cache; partial scans are not cached as complete.
- HTTP **429** stops the batch and honors `Retry-After`, with a **5-minute** fallback. HTTP **401/403** and **5xx** also stop it, with at least a **1-minute** pause and any longer requested wait. Saved pauses survive disconnect and restart. If saving fails, the batch still stops and displays a retry deadline.
- Network failures and unexpected login/error pages stop downloading. Saved files remain saved. Retry needs your action and creates a new folder; it does not resume partial files.

These safeguards cannot guarantee school approval or prevent account/IP restrictions. Use only where your school permits it. Design details are in `docs/ARCHITECTURE.md`.

## Development and verification

Runtime files are local HTML, CSS and JavaScript, without bundled libraries or remote code. Node and Playwright are development tools, not user requirements.

Use **Node.js 26+**:

```sh
npm ci
npx playwright install chromium
npm test
npm run check
npm run test:browser
```

CI runs offline tests and the isolated Chromium check, never a school account. See `docs/TEST-REPORT.md` for executed evidence and untested cases.

The opt-in live check uses an existing authorized configuration:

```sh
MOODLE_CONFIG='C:/path/to/authorized/config.json' TEST_OUTPUT='C:/private/test-results' node tests/live-browser.mjs --live
```

Never put tokens in command arguments, source files or issues. Keep real configurations, profiles, screenshots and course files outside this repository.

This is an independent implementation of Moodle's public API/file contracts, not affiliated with Moodle or any school. Moodle-DL code and dependencies are not bundled.
