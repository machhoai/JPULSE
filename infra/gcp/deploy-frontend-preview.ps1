param([Parameter(Mandatory = $true)][string]$Image)

# This historical service now serves the production custom domain.
throw "fe-wms-preview is production. Use infra/gcp/deploy-frontend-production.ps1; this legacy script no longer changes production or Firebase Hosting."
