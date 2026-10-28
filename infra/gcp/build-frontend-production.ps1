param([string]$EnvironmentFile = ".env.local")

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
# Reuse the source archive and public-only config loader. The service/repository
# retains its historical preview name, but this API origin is production.
& (Join-Path $PSScriptRoot "build-frontend-preview.ps1") `
    -ProjectId "jw-system-f2104" -EnvironmentFile $EnvironmentFile `
    -ApiOrigin "https://api-erp.joyworldcityfuns.vn"
