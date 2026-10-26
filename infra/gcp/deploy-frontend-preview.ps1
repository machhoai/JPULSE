param(
    [Parameter(Mandatory = $true)][string]$Image,
    [string]$ProjectId = "jw-system-f2104"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$service = "fe-wms-preview"
$region = "asia-southeast1"
$site = "jpulse-cloud-preview"
if ($Image -notlike "asia-southeast1-docker.pkg.dev/$ProjectId/cloud-run-source-deploy/fe-wms-preview:*") {
    throw "Expected an explicitly tagged frontend preview image in the intended project."
}
Push-Location $repoRoot
try {
    $hosting = Get-Content "firebase.frontend-preview.json" -Raw | ConvertFrom-Json
    if ($hosting.hosting.site -ne $site) { throw "Unexpected Firebase Hosting site." }
    # No domain commands, backend deployments, scheduler changes or Vercel calls.
    & gcloud run deploy $service --project=$ProjectId --region=$region --image=$Image `
        --service-account="jpulse-frontend@$ProjectId.iam.gserviceaccount.com" `
        --port=3000 --cpu=1 --memory=512Mi --concurrency=80 --timeout=60 `
        --min-instances=0 --max-instances=2 --cpu-throttling --ingress=all `
        --allow-unauthenticated --set-env-vars=NODE_ENV=production `
        '--labels=application=jpulse,environment=migration-preview' --quiet
    if ($LASTEXITCODE -ne 0) { throw "Cloud Run frontend deployment failed; Hosting was not released." }
    # Firebase CLI 15.11 can race when two pinTag rewrites target the same
    # untagged revision. Pre-tag once, preserving tags used by older releases.
    $revision = (& gcloud run services describe $service --project=$ProjectId --region=$region --format='value(status.latestReadyRevisionName)').Trim()
    if ($LASTEXITCODE -ne 0 -or -not $revision) { throw "Cannot identify the ready frontend revision." }
    $releaseTag = "preview-" + $revision.Substring($service.Length + 1)
    if ($releaseTag -notmatch '^[a-z][a-z0-9-]*$' -or ($releaseTag.Length + $service.Length) -gt 46) {
        throw "Revision cannot form a safe Cloud Run traffic tag."
    }
    & gcloud run services update-traffic $service --project=$ProjectId --region=$region "--update-tags=$releaseTag=$revision" --quiet
    if ($LASTEXITCODE -ne 0) { throw "Could not pin the frontend revision; Hosting was not released." }
    & firebase deploy --project $ProjectId --config firebase.frontend-preview.json --only hosting --non-interactive
    if ($LASTEXITCODE -ne 0) { throw "Preview Hosting release failed. Production domains remain on Vercel." }
    Write-Output "Preview: https://$site.web.app"
}
finally { Pop-Location }
