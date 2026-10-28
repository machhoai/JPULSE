param([Parameter(Mandatory = $true)][string]$Image)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$projectId = "jw-system-f2104"
$region = "asia-southeast1"
$service = "fe-wms-preview"
$origin = "https://jpulse.joyworldcityfuns.vn"
if ($Image -notmatch '^asia-southeast1-docker\.pkg\.dev/jw-system-f2104/cloud-run-source-deploy/fe-wms-preview:[a-zA-Z0-9_.-]+$' -or $Image.EndsWith(":latest")) {
    throw "Expected an explicitly tagged production frontend image."
}
$releaseTag = "release-$(Get-Date -Format 'yyyyMMddHHmmss')"
# Preserve IAM, runtime identity, env, resources and previous traffic tags.
& gcloud run deploy $service --project=$projectId --region=$region --image=$Image `
    --no-traffic "--tag=$releaseTag" --quiet
if ($LASTEXITCODE -ne 0) { throw "Frontend deployment failed; production traffic was not changed." }
$serviceJson = & gcloud run services describe $service --project=$projectId --region=$region --format=json --quiet
if ($LASTEXITCODE -ne 0) { throw "Cannot inspect the deployed frontend." }
$deployed = $serviceJson | ConvertFrom-Json
$candidate = @($deployed.status.traffic | Where-Object { $_.PSObject.Properties['tag'] -and $_.tag -eq $releaseTag })
if ($candidate.Count -ne 1) { throw "Cannot identify the candidate revision." }
$revision = $candidate[0].revisionName
$candidateUrl = $candidate[0].url
foreach ($route in @("/login", "/attendance", "/firebase-messaging-sw.js")) {
    $response = Invoke-WebRequest -Uri "$candidateUrl$route" -TimeoutSec 60
    if ($response.StatusCode -ne 200) { throw "Candidate smoke check failed: $route" }
}
& gcloud run services update-traffic $service --project=$projectId --region=$region `
    "--to-revisions=$revision=100" --quiet
if ($LASTEXITCODE -ne 0) { throw "Failed to promote the frontend candidate." }
foreach ($route in @("/login", "/attendance")) {
    if ((Invoke-WebRequest -Uri "$origin$route" -TimeoutSec 60).StatusCode -ne 200) {
        throw "Production smoke check failed: $route. Inspect and roll back to the prior revision if needed."
    }
}
[pscustomobject]@{ service = $service; revision = $revision; image = $Image; origin = $origin; tag = $releaseTag } | ConvertTo-Json
