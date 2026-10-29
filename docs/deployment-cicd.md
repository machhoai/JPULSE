# JPULSE production CI/CD — GCloud

Verified on 2026-10-28 through Cloud Run domain mappings and live HTTP responses.
This guide supersedes historical Vercel and frontend preview instructions.

| Component                    | Production target                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| Google project / region      | `jw-system-f2104` / `asia-southeast1`                                                   |
| Frontend                     | Cloud Run `fe-wms-preview`, despite its historical name                                 |
| Frontend domain              | `https://jpulse.joyworldcityfuns.vn` → Google → `fe-wms-preview`                        |
| Backend                      | Cloud Run `be-wms`                                                                      |
| API domain / browser API URL | `https://api-erp.joyworldcityfuns.vn`                                                   |
| Frontend image repository    | `asia-southeast1-docker.pkg.dev/jw-system-f2104/cloud-run-source-deploy/fe-wms-preview` |
| Frontend runtime identity    | `jpulse-frontend@jw-system-f2104.iam.gserviceaccount.com`                               |
| Firebase                     | Production Auth, Firestore and Storage in `jw-system-f2104`                             |

Vercel is not the production serving target. Automatic Vercel Git deployments
for this frontend are disabled in `apps/fe-wms/vercel.json`. No other project or
team is changed. Firebase Hosting site `jpulse-cloud-preview` is historical;
releasing the custom domain does not require a Hosting deployment.

## CI and release ownership

- `.github/workflows/deploy-prod.yml` runs dependency installation, employee
  contract lint, workspace typechecks and attendance Shortcut API checks on
  `main` and published releases. It no longer publishes unused GHCR images.
- Existing GCloud GitHub trigger
  `rmgpgab-be-wms-asia-southeast1-machhoai-bduck-system--mapuc` builds
  `Dockerfile.be-wms`, pushes a commit image to Artifact Registry and updates
  `be-wms` on pushes to `main`, preserving runtime environment variables.
- Frontend release is an explicit operator action using the production scripts
  below. A Git push alone does **not** release the GCloud frontend. GitHub CI and
  the backend trigger are independent; verify CI before an operator release.

## Build frontend

Commit the intended application source first. The script archives tracked source
from `HEAD`, excluding local credentials, `outputs/` and caches, and refuses
uncommitted application source. Only public browser settings enter build args.

```powershell
./infra/gcp/build-frontend-production.ps1 -EnvironmentFile .env.local
```

Firebase Web App config is read from the intended Google project. The local
environment file must explicitly provide the three existing feature flags,
Mapbox public token and Firebase VAPID public key. The production wrapper fixes
the API origin to `https://api-erp.joyworldcityfuns.vn`. It returns `buildId`,
`image`, source commit and a status-file path. The image tag contains the source
commit and timestamp. Build-only config: `cloudbuild.frontend.yaml`.

```powershell
gcloud builds describe BUILD_ID --project=jw-system-f2104 --format='value(status)'
```

Continue only after `SUCCESS`. `NEXT_PUBLIC_*` values are baked into the Next.js
bundle; changing Cloud Run runtime env does not replace a frontend rebuild.

## Release frontend

```powershell
./infra/gcp/deploy-frontend-production.ps1 -Image 'IMAGE_RETURNED_BY_BUILD'
```

The script deploys the explicitly tagged image to `fe-wms-preview` with no traffic
and a unique candidate tag, preserving runtime identity, IAM, env, resources and
historical tags. It checks candidate `/login`, `/attendance` and the messaging
service worker, then assigns 100% traffic to that specific revision and checks
the production domain. It does not update DNS, domain mappings, Firebase Hosting,
the backend, queues or schedulers. The legacy preview deployment script is retired
because that historical service now affects production.

Record the old revision before release. Roll back by restoring its traffic:

```powershell
gcloud run services update-traffic fe-wms-preview --project=jw-system-f2104 --region=asia-southeast1 --to-revisions=PREVIOUS_REVISION=100
```

After promotion, verify authenticated navigation, the mobile Shortcut button,
static assets, API origin/CORS and Cloud Run error logs. iOS installation, file
permissions and Quick Look rendering require a real iPhone.

## Attendance Shortcut settings

Set these on backend `be-wms`, not frontend/Vercel:

```dotenv
ATTENDANCE_SHORTCUT_ICLOUD_URL=https://www.icloud.com/shortcuts/357a4891100e4199b808baf9f52b5478
ATTENDANCE_SHORTCUT_NAME=Chấm công JPULSE
```

Keep the API origin in the frontend bundle equal to the origin checked by the
shared Shortcut. Production API pairing, single-use exchange, rotation, expiry
reminder and revocation have been verified without recording attendance. See
[the Shortcut contract](attendance-shortcuts.md).

Generated reports remain under ignored `outputs/`; private release state and
source archives remain under ignored `.codex-tmp/`. Neither belongs in Git or
deployment source archives.

## Latest verified frontend release — 2026-10-28

- Source commit: `805dcc705beb330771713ea6a1e5f36cded3d90c`.
- Cloud Build: `2dbdda26-2c82-45a3-ae2d-f2c5dc1b2217` (`SUCCESS`).
- Image: `fe-wms-preview:805dcc705beb-20261028130145` in the repository above.
- Revision: `fe-wms-preview-00008-tew`, serving 100% of frontend traffic.
- Prior revision for rollback: `fe-wms-preview-00006-yon`.
- Candidate and custom-domain page checks passed. Authenticated browser checks
  confirmed the mobile Shortcut button is visible, hidden at desktop width, and
  its configuration endpoint returns the correct name/link without browser errors.
- GitHub Production CI passed. No attendance was recorded during verification.
