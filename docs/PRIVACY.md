# Privacy policy draft

Course Files for Moodle is an unofficial browser extension for downloading files from courses you can access. This draft describes the implemented local beta. Publisher identity, contact information and a hosted policy address must be supplied before a store submission.

## Data and processing

The extension connects directly to the Moodle website you choose. It reads your own account details, enrolled course list and selected course file listings. Selected files stream directly from Moodle into the folder you choose on your computer. There is no developer-operated backend, analytics, advertising, AI service or browser sync of this information.

When you click the extension icon, it may inspect that tab's Moodle configuration to detect the school's website address. It remembers only that tab's ID in session storage so Connect can retry detection. It does not save the page URL or inspect unrelated tabs or browsing history. Browser restart clears this tab reference.

Normal sign-in occurs on your school's own pages. Those pages may redirect to the school's identity provider and follow that institution's privacy policy. The extension does not ask for or collect your school password. Its optional existing-token input is a troubleshooting fallback, not a password field.

The ordinary Moodle service token and course list are stored in Chrome session storage, unavailable to content scripts. They are cleared on disconnect or browser restart. Any private token received in the Moodle callback is discarded. The Moodle website address is remembered locally for reconnection. Request start times, cooldown expiry and the relevant HTTP status are also stored locally per school origin so a restart or disconnect does not bypass a pause. This timing metadata contains no service token, course contents or downloaded file data and is not synced.

Successful course file listings may be cached in the utility tab's memory for up to five minutes. They are not persisted, and connection changes invalidate them. Explicit refresh checks for new files; no background refresh occurs.

The extension does not sell or transfer your account data or downloaded files to its developer or other third parties.

## Permissions

- `activeTab`: temporary access to the page where you explicitly click the extension.
- `scripting`: read that page's canonical Moodle site address for automatic setup. No school-page content is modified.
- `storage`: hold the session connection and remember the site's address and request timing/cooldown metadata locally.
- `webRequest`: observe the specific pending Moodle connection callback. The callback must match the expected tab, site, request correlation and expiry.
- Optional HTTPS website access: requested for the particular Moodle host you choose, not automatically for every website.
- Folder access: granted separately through Chrome's folder chooser. Existing files are not overwritten.

## Deletion and control

Disconnect clears the connection and attempts to revoke optional permission for that Moodle host. Cooldown metadata is deliberately retained across disconnect. Uninstalling removes extension-local state. Files and download reports you saved remain in your chosen folder until you delete them. Uninstalling or disconnecting does not revoke the service token at the school's server; manage school-issued tokens through the school's account controls if needed.

## Limits

This is independent of Moodle and your institution. Access is enforced by Moodle and may be restricted by the school. The extension does not bypass access restrictions or include external platforms, submissions, quiz attempts or hidden materials.
