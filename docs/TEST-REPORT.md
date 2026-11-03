# Verification report

## Build status

Course Files for Moodle 0.1.0 is implemented for local Chrome use, not a store-published release. The normal callback connection and actual Windows folder-picker path have now been exercised in the user's real Chrome profile: automatic token capture, enrolled courses, course/file selection, folder permission and a PDF saved to Downloads. This used the existing signed-in Moodle/SSO session, not fresh password entry or MFA. No DevTools or token paste was needed.

Latest successful automated live run: 2026-11-03T05:37:05.884Z (UTC). The native Downloads report was created at 2026-11-03T05:31:16.614Z (UTC).

## Executed checks

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

## Independent review

Independent reviews identified stale connection cleanup, file/directory prefix collisions and metadata-only root inference defects. All were fixed with regression coverage. The compact UI was independently implemented and browser-checked. The final bounded independent review passed with no security concerns, logic errors or suggestions; all four launcher regressions passed.

## Remaining release checks

- Fresh password entry and MFA were not exercised; normal connection used the existing signed-in browser session.
- Exercise an actual nested Folder resource and a multi-course download manually. Existing live evidence covers one selected course and one saved File resource.
- Confirm behavior on another school's Moodle before claiming broad compatibility.
- Supply publisher identity and a hosted privacy policy, complete store disclosures, and obtain store review. Nothing has been uploaded or published.

## Reproduce

```sh
npm test
npm run check
npm run test:browser
MOODLE_CONFIG='C:/path/to/authorized/config.json' TEST_OUTPUT='C:/private/test-results' node tests/live-browser.mjs --live
```

The live command requires explicit opt-in. It reads credentials from the specified existing configuration, never command arguments. Use only an account you are authorized to access. Real profiles, course content, configuration, tokens and private screenshots stay outside the distributed package.
