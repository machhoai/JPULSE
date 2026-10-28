param(
    [string]$ProjectId = "jw-system-f2104",
    [string]$SiteId = "jpulse-cloud-preview",
    [string]$EnvironmentFile = ".env.local",
    [string]$ApiOrigin = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
Push-Location $repoRoot
try {
    if ([string]::IsNullOrWhiteSpace($ApiOrigin)) { $ApiOrigin = "https://$SiteId.web.app" }
    if ($ApiOrigin -notmatch '^https://[a-z0-9.-]+$') { throw "Expected an HTTPS API origin without a path." }
    # Only explicit public browser configuration is read from this local file.
    # Private values and the file itself never enter the build context.
    $localValues = @{}
    foreach ($line in Get-Content -LiteralPath $EnvironmentFile) {
        if ($line -match '^\s*(NEXT_PUBLIC_[A-Z0-9_]+)\s*=\s*(.*)$') {
            $publicValue = $Matches[2].Trim()
            if ($publicValue.Length -ge 2 -and (
                ($publicValue.StartsWith('"') -and $publicValue.EndsWith('"')) -or
                ($publicValue.StartsWith("'") -and $publicValue.EndsWith("'"))
            )) { $publicValue = $publicValue.Substring(1, $publicValue.Length - 2) }
            $localValues[$Matches[1]] = $publicValue
        }
    }
    foreach ($key in @("NEXT_PUBLIC_MAPBOX_TOKEN", "NEXT_PUBLIC_FIREBASE_VAPID_KEY")) {
        if (-not $localValues.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($localValues[$key])) {
            throw "Missing public frontend setting: $key"
        }
    }
    foreach ($key in @("NEXT_PUBLIC_LEAVE_FEATURE_ENABLED", "NEXT_PUBLIC_EMPLOYEE_CONTRACTS_FEATURE_ENABLED", "NEXT_PUBLIC_MARKETING_VOUCHERS_FEATURE_ENABLED")) {
        if (-not $localValues.ContainsKey($key) -or $localValues[$key] -notmatch '^(true|false)$') {
            throw "Set an explicit true/false for $key in the local environment file."
        }
    }

    $token = (& gcloud auth print-access-token).Trim()
    if ($LASTEXITCODE -ne 0) { throw "Google authentication failed." }
    $headers = @{ Authorization = "Bearer $token"; "x-goog-user-project" = $ProjectId }
    $apps = Invoke-RestMethod -Uri "https://firebase.googleapis.com/v1beta1/projects/$ProjectId/webApps" -Headers $headers
    if (@($apps.apps).Count -ne 1) { throw "Expected exactly one Firebase Web App; choose the app explicitly before building." }
    $appName = $apps.apps[0].name
    $firebase = Invoke-RestMethod -Uri "https://firebase.googleapis.com/v1beta1/$appName/config" -Headers $headers
    if ($firebase.projectId -ne $ProjectId) { throw "Firebase project mismatch." }
    $commit = (& git rev-parse --short=12 HEAD).Trim()
    if ($LASTEXITCODE -ne 0) { throw "Cannot identify source commit." }
    $buildNumber = "$commit-$(Get-Date -Format 'yyyyMMddHHmmss')"
    $image = "asia-southeast1-docker.pkg.dev/$ProjectId/cloud-run-source-deploy/fe-wms-preview:$buildNumber"

    # Archive tracked source rather than uploading the workspace (which contains
    # local credentials, documents, logs, node_modules and unrelated outputs).
    $work = Join-Path $repoRoot ".codex-tmp/frontend-preview/$buildNumber"
    $source = Join-Path $work "source"
    New-Item -ItemType Directory -Path $source -Force | Out-Null
    $archive = Join-Path $work "source.tar"
    & git archive --format=tar --output=$archive HEAD package.json pnpm-lock.yaml pnpm-workspace.yaml .dockerignore apps/fe-wms packages
    if ($LASTEXITCODE -ne 0) { throw "Could not archive tracked source." }
    & tar -xf $archive -C $source
    if ($LASTEXITCODE -ne 0) { throw "Could not extract build source." }
    Copy-Item -LiteralPath "apps/fe-wms/Dockerfile" -Destination (Join-Path $source "apps/fe-wms/Dockerfile")
    Copy-Item -LiteralPath "cloudbuild.frontend.yaml" -Destination (Join-Path $source "cloudbuild.frontend.yaml")
    # git archive above intentionally uses HEAD. Refuse to silently omit edits
    # to application code; the only allowed tracked edit is the Dockerfile.
    $changed = @(& git diff HEAD --name-only -- apps/fe-wms packages package.json pnpm-lock.yaml pnpm-workspace.yaml .dockerignore)
    if ($LASTEXITCODE -ne 0) { throw "Could not check source changes." }
    if (@($changed | Where-Object { $_ -ne "apps/fe-wms/Dockerfile" }).Count -gt 0) {
        throw "Application source differs from HEAD. Review and stage the intended build source explicitly."
    }
    $substitutions = @{
        _IMAGE = $image
        _BUILD_NUMBER = $buildNumber
        _FRONTEND_ORIGIN = $ApiOrigin
        _FIREBASE_API_KEY = $firebase.apiKey
        _FIREBASE_AUTH_DOMAIN = $firebase.authDomain
        _FIREBASE_STORAGE_BUCKET = $firebase.storageBucket
        _FIREBASE_MESSAGING_SENDER_ID = $firebase.messagingSenderId
        _FIREBASE_APP_ID = $firebase.appId
        _MAPBOX_TOKEN = $localValues["NEXT_PUBLIC_MAPBOX_TOKEN"]
        _FIREBASE_VAPID_KEY = $localValues["NEXT_PUBLIC_FIREBASE_VAPID_KEY"]
        _LEAVE_ENABLED = $localValues["NEXT_PUBLIC_LEAVE_FEATURE_ENABLED"]
        _CONTRACTS_ENABLED = $localValues["NEXT_PUBLIC_EMPLOYEE_CONTRACTS_FEATURE_ENABLED"]
        _VOUCHERS_ENABLED = $localValues["NEXT_PUBLIC_MARKETING_VOUCHERS_FEATURE_ENABLED"]
    }
    # All substitutions are intentionally public frontend settings, not secrets.
    # Escape gcloud's delimiter; fail rather than corrupt a value containing it.
    if (@($substitutions.Values | Where-Object { "$($_)".Contains("|") }).Count) {
        throw "Public build setting contains the substitutions delimiter."
    }
    $substitutionArg = "^|^" + (($substitutions.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join "|")
    $resultPath = Join-Path $work "build.json"
    & gcloud builds submit $source --project=$ProjectId --config=cloudbuild.frontend.yaml --substitutions=$substitutionArg --async --format=json | Set-Content -LiteralPath $resultPath -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw "Cloud Build submission failed." }
    $build = Get-Content -LiteralPath $resultPath -Raw | ConvertFrom-Json
    [pscustomobject]@{ buildId = $build.id; image = $image; sourceCommit = $commit; buildNumber = $buildNumber; apiOrigin = $ApiOrigin; statusFile = $resultPath } | ConvertTo-Json
}
finally { Pop-Location }
