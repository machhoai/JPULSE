# iOS attendance Shortcut

## Availability

The mobile topbar on `/attendance` contains a Shortcut button. First use opens
the shared template. After adding it in iOS, the employee returns to the same
dialog and taps **Kết nối Shortcut**. An existing connection opens the template
in connection mode with a fresh one-time code. **Cài / Cài lại Shortcut** remains
available if the employee has changed phones, deleted or renamed the shortcut.

Websites cannot reliably inspect an iOS Shortcut installation. The API's
`connected` flag means a code has been exchanged, not that installation has been
detected. Do not use timeout-based installation detection or treat localStorage
as proof. iOS may require another tap on the connection link after an app switch.

The signed/shared template is an external release dependency. The user supplied
a template on 2026-10-28; its latest static review passed and is recorded below.
Real iPhone verification is still required. Until the backend
template URL is configured, the button explains that the template is unavailable
and pairing is disabled.

Set the **backend** environment variable (restart the backend after changing it):

```dotenv
ATTENDANCE_SHORTCUT_ICLOUD_URL=https://www.icloud.com/shortcuts/edf2d5fda37e40ad8e817c69f2731237
ATTENDANCE_SHORTCUT_NAME=Chấm công JPULSE
```

The installed shortcut name must exactly match `ATTENDANCE_SHORTCUT_NAME`.
The backend defaults to **BDuck Chấm công** for existing templates when this
variable is absent. Keep it a shared generic template with no employee
credentials embedded.

## Template authoring contract

Create one shortcut with two branches. Configure only trusted application API
origins in the template; reject input with any other `api_base`. Never accept a
configurable check-in or exchange URL from arbitrary input. Do not share the
populated configuration file with the template.

### Connection mode

The web opens:

```text
shortcuts://run-shortcut?name=Ch%E1%BA%A5m%20c%C3%B4ng%20JPULSE&input=text&text=<URL-encoded JSON>
```

Decoded input example:

```json
{
  "version": 1,
  "mode": "connect",
  "code": "<one-time code>",
  "api_base": "https://your-api.example"
}
```

1. Read Shortcut Input as a dictionary. Require `version = 1`, `mode = connect`,
   and an allowlisted HTTPS `api_base`. Ignore other input modes with an error.
2. Use **Get Contents of URL**, POST to
   `<api_base>/api/attendance/shortcut/exchange`, JSON body `{ "code": code }`.
3. Check `success`. On failure show `messages.vi` and stop without changing the
   saved configuration.
4. On success save `data.token`, `data.expires_at`, and the trusted API origin
   into a fixed configuration file such as `Shortcuts/BDuck/attendance.json`.
   Disable “Ask Where to Save” and allow replacing the existing file. Use the
   same file path when reading configuration in check-in mode. Prefer a local
   folder when available; an iCloud Drive folder can sync credentials to other
   devices and is not a hardware-bound credential store.
5. Show “Đã cập nhật kết nối chấm công”. Stop here: pairing must not check in.

If the response or file save fails after exchange, generate another pairing
code on the web and retry. Codes are single-use; do not retry the same code
indefinitely. The prior token is revoked at successful exchange on the server.

### Check-in mode (run with no input)

1. Read the saved configuration. If absent, tell the employee to open
   `/attendance` and tap the Shortcut button.
2. Use **Get Contents of URL**, POST to the saved trusted API origin plus
   `/api/attendance/shortcut/check-in`, headers:
   `Authorization: Bearer <token>`, `Content-Type: application/json`.
3. Send `{}` for IP-based verification. For GPS, use **Get Current Location**
   with **Best** accuracy, then extract its latitude and longitude using
   **Get Details of Locations**. Immediately format **Current Date** as ISO 8601
   with a UTC timezone for `captured_at` (the time the Shortcut obtained the
   location, not a verified sensor-fix timestamp). Send the nested `location`
   object below; coordinates must be JSON numbers. Native Shortcuts can omit
   `accuracy_m`: requested accuracy such as Best/10 m is not measured error.
   Only include `accuracy_m` when a capture client reports actual measured
   horizontal accuracy. Do not substitute altitude or a fixed value.
4. The response is a complete HTML document, including on 4xx/5xx check-in errors.
   Display it as HTML, not as plain text. A template can convert the response to
   a file named `attendance-result.html` and display that file with **Quick Look**;
   test HTML rendering and non-2xx body handling on the target iPhone. Do not
   simply open the POST endpoint as a URL (that would issue GET without a token).
   If Quick Look does not render the HTML on the target iOS release, verify a
   web-preview action before publishing the template; Rich Text conversion can
   lose CSS styling.
5. For network/transport failures with no response body, show an explicit
   connection error. Never show a success message based solely on completing
   the HTTP action.

```json
{
  "location": {
    "latitude": 10.0,
    "longitude": 106.0,
    "captured_at": "2026-10-29T01:00:00.000Z"
  }
}
```

## API and lifecycle

Missing location is not evidence of denied iOS permission. The published template
sends `{}` and has no location-capture action. With `IP_OR_GPS`, an unrecognized
network therefore requires GPS that this template does not send, even if iOS
Precise Location is enabled. Use an approved company network or web attendance
until GPS capture is added to the installed template using the steps above.
The Shortcut endpoint accepts omitted `accuracy_m` and persists it as explicit
`null` (unknown), without fabricating a measurement. This exception is set by
the authenticated Shortcut route, not by request fields. The web endpoint still
requires measured accuracy. Supplied measurements still obey the configured
accuracy limit. Location freshness, geofences, approved remote arrangements and
the workplace's IP/GPS strategy continue to apply to both routes. Unknown
accuracy means location quality cannot be verified against the accuracy limit.
A successful token exchange
followed by `LOCATION_REQUIRED` confirms authentication passed for that request.
Pairing links are single-use and separate from the 90-day attendance token.

| Method | Path under `/api/attendance/shortcut` | Authentication                                              | Output                                 |
| ------ | ------------------------------------- | ----------------------------------------------------------- | -------------------------------------- |
| GET    | `/connection`                         | Existing web login + check-in permission                    | Connection state and template URL      |
| POST   | `/pairing`                            | Existing web login + check-in permission                    | One-time code, valid 5 minutes         |
| POST   | `/exchange`                           | One-time code + current actor/permission validation         | Token, valid 90 days                   |
| POST   | `/check-in`                           | Shortcut bearer token + current actor/permission validation | HTML result                            |
| DELETE | `/connection`                         | Existing web login                                          | Revoke own connection and pending code |

Each account has one active connection. A new pairing leaves the working token
intact; a successful exchange atomically replaces it. Starting another pairing
invalidates previous unused pairing codes. Revocation also cancels pending
pairing. Token expiry is absolute and is never extended by check-in calls.

The 90 days start when `/exchange` succeeds, not when the template is installed.
Normal web logout/session expiry and backend deployments do not invalidate the
Shortcut token. Daily use does not require a web login or a new pairing. Below
seven days the result shows a reminder but the token still works until expiry.
Earlier reconnection is necessary if the saved configuration is lost or the
connection is explicitly revoked/replaced (including pairing the same account
on another device). Current account status, employment and check-in permissions
are still enforced on every request; a valid token alone does not guarantee an
attendance entry.

Credentials contain 256 random bits. Only SHA-256 hashes are stored in server-only
Firestore collections `attendance_shortcut_connections`,
`attendance_shortcut_pairings`, and `attendance_shortcut_sessions`. These are
covered by the existing default-deny client rules and must remain server-only.
Expired records are rejected at use time; expiry does not depend on cleanup.

Tokens are accepted only on the check-in integration route. They cannot be used
as Firebase web sessions or read administrative attendance data. Each request
reloads current authorization and uses the existing scoped check-in service.
The server chooses the action time; the payload cannot override user, IP or time.
IP verification uses Express's configured trusted proxy chain. Ensure
`BE_WMS_TRUST_PROXY_HOPS` matches deployment topology.

Results use Vietnamese local time (`Asia/Ho_Chi_Minh`), escape dynamic text, show
a green check or red cross, and include a reminder when the authenticated token
has **strictly less than 7 days remaining**. Expired/revoked tokens show a failure
asking the employee to reconnect from `/attendance`.

## Verification

```powershell
pnpm --filter @bduck/be-wms typecheck
pnpm --filter @bduck/fe-wms typecheck
pnpm --filter @bduck/be-wms build
pnpm --filter @bduck/be-wms exec node --experimental-test-module-mocks --test test/attendance-shortcut-api.test.mjs
pnpm --filter @bduck/be-wms exec tsx --test src/services/attendanceShortcutPolicy.test.ts src/services/attendanceAuthorizationPolicy.test.ts src/services/attendanceLocationPolicy.test.ts
firebase emulators:exec --config firebase.payroll-test.json --only firestore --project demo-attendance-shortcut "pnpm --filter @bduck/be-wms exec tsx --test src/repositories/attendanceShortcutStore.emulator.test.ts"
```

Before enabling the template URL, verify on a real iPhone: first installation,
return-and-connect, update existing connection, deleted/renamed shortcut recovery,
expired pairing, token rotation, revocation, denied permission, expired token,
incorrect network, duplicate check-in, HTML success/failure and the under-seven-day
reminder. Verify the topbar button is hidden at desktop widths. Never use a
production account or production Firestore for automated integration tests.

## Reference supplied for visual behavior

The supplied [Nhận tiền Shortcut](https://www.icloud.com/shortcuts/276ad19767324c5f9e932492f4ce3b6a)
was inspected as a reference only. Its workflow ends with **Get Contents of URL →
Quick Look**. It does not implement attendance, token exchange, or configuration
storage. Do not configure that URL as `ATTENDANCE_SHORTCUT_ICLOUD_URL`; publish a
separate **BDuck Chấm công** template implementing the contract above.

## Supplied attendance template review — 2026-10-28

Latest template: [Chấm công JPULSE](https://www.icloud.com/shortcuts/edf2d5fda37e40ad8e817c69f2731237).
Static inspection confirms the requested corrections: exact version, mode and API
origin comparisons; nonempty code and token checks; both requests use POST JSON;
check-in sends `Authorization: Bearer <token>` using the token extracted from the
saved configuration; and the renamed HTML result is passed directly to Quick
Look. The name matches `ATTENDANCE_SHORTCUT_NAME=Chấm công JPULSE`. The example
configuration above now points to this version. Real iPhone testing, including
configuration-file conversion and non-2xx HTML rendering, remains outstanding.
No deployment or live attendance request was performed during this review.

The following notes describe the earlier, superseded template.

Template: [Chấm công JPULSE](https://www.icloud.com/shortcuts/2900619c03ae45fd9ba96558a8981f85).
The public iCloud workflow was downloaded and inspected as a binary plist.
No live check-in or token exchange was performed.

Verified statically:

- Both exchange and check-in use POST and the correct production endpoints.
- Exchange sends the `code` field from Shortcut Input.
- Configuration contains `token`, `expires_at`, and `api_base`, saved to
  `BDuck/attendance.json` with overwrite enabled and no save-location prompt.
- Check-in reads the same path, sends an empty JSON object, and builds
  `Authorization: Bearer <token>` using the extracted token variable.
- No personal token is embedded in the shared workflow.

Corrections required before release:

1. Connection mode currently checks that the parsed dictionary has a value,
   but does not explicitly verify `version = 1`, `mode = connect`, expected
   `api_base`, and nonempty `code`. Add those checks before exchange.
2. Check-in mode must check the loaded `api_base` and nonempty token before
   sending the request. The endpoint itself is already hardcoded to production.
3. The last display action is **Show Result**, with the renamed output inserted
   into a text field. Replace it with **Quick Look**, passing the renamed HTML
   file directly, and verify rendering on iPhone.
4. Verify in the editor that the exchange `success` condition means boolean true,
   and that saving a Dictionary produces valid JSON. Add **Get Text from Input**
   before Save File if necessary.

This template hardcodes the production API. It cannot exchange a pairing code
issued by the local/test backend. For local testing, duplicate it and replace
both endpoints and all origin checks with the test origin, then use its own
name and iCloud URL in the local backend configuration. Production integration
still requires deploying the backend and setting the two environment variables;
editing `.env.example` does not change the deployed service.
