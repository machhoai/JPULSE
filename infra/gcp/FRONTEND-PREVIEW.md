# Frontend Google — instructions superseded

As of 2026-10-28, `jpulse.joyworldcityfuns.vn` is served by Google Cloud Run
`fe-wms-preview`. Its historical name does not indicate a safe preview environment.
Vercel is not the production target.

Use [the current production CI/CD guide](../../docs/deployment-cicd.md):

```powershell
./infra/gcp/build-frontend-production.ps1
# Wait for Cloud Build SUCCESS, then use its returned immutable image:
./infra/gcp/deploy-frontend-production.ps1 -Image 'IMAGE_RETURNED_BY_BUILD'
```

The legacy `deploy-frontend-preview.ps1` is retired and refuses deployment.
`build-frontend-preview.ps1` remains a shared build helper. The production wrapper
selects the production API origin explicitly. Firebase Hosting site
`jpulse-cloud-preview` is historical and is not the production release path.
