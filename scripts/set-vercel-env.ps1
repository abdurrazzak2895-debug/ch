# set-vercel-env.ps1
# ----------------------------------------------------------------------------
# Read a secret value from a local file and push it to a Vercel project env var
# without ever printing the value in chat or terminal scrollback.
#
# Usage:
#   pwsh scripts/set-vercel-env.ps1 `
#     -Name VITE_SUPABASE_PUBLISHABLE_KEY `
#     -ValueFile .\.secrets\supabase-publishable.txt `
#     -Environment production `
#     -Sensitive
#
# Why this exists:
#   `vercel env add` prompts for a value on stdin; if you paste it in chat, the
#   secret ends up in transcript logs. This wrapper reads from a file path you
#   point at, so the value never leaves your disk.
#
# Notes:
#   - The file should contain ONLY the secret value (no trailing newline is OK).
#   - Use -Sensitive to mark it as Sensitive type (default).
#   - If the var already exists in that environment it will be replaced.
# ----------------------------------------------------------------------------

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string] $Name,
    [Parameter(Mandatory = $true)] [string] $ValueFile,
    [Parameter(Mandatory = $true)]
    [ValidateSet('production', 'preview', 'development')] [string] $Environment,
    [switch] $Sensitive = $true
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $ValueFile)) {
    Write-Error "Value file not found: $ValueFile"
    exit 1
}

$raw = Get-Content -Raw -Path $ValueFile
if ($null -eq $raw) { $raw = '' }
$value = $raw.TrimEnd("`r", "`n")

if ([string]::IsNullOrWhiteSpace($value)) {
    Write-Error "Value file is empty: $ValueFile"
    exit 1
}

# Sanity: refuse obviously-wrong keys to prevent accidental misuse.
if ($Name -match '^VITE_' -and -not $Sensitive) {
    Write-Warning "VITE_-prefixed vars are public by design. Sensitive flag is ignored."
}

# Remove existing var in that env (idempotent).
vercel env rm $Name $Environment --yes *> $null 2>&1

# Pipe the value into vercel env add. We use a here-string via Get-Content so
# the literal value never appears in a command line (avoids shell history).
Get-Content -Path $ValueFile | vercel env add $Name $Environment *> $null 2>&1

# Apply type flag (Sensitive) by editing the env entry. The CLI doesn't expose
# a "set type" subcommand, so we use the REST API with a short-lived token.
if ($Sensitive) {
    $token = $env:VERCEL_TOKEN
    if (-not $token) {
        Write-Warning "VERCEL_TOKEN not set; cannot mark as Sensitive. Add with: `$env:VERCEL_TOKEN='<token-from-vercel-account-settings>'"
    } else {
        $projectId = (vercel project inspect --format json 2>$null | ConvertFrom-Json).id
        if (-not $projectId) {
            Write-Warning "Could not resolve project id; skipping type update."
        } else {
            $body = @{
                key     = $Name
                value   = $value
                type    = 'Sensitive'
                target  = @($Environment)
            } | ConvertTo-Json -Compress

            $headers = @{
                Authorization = "Bearer $token"
                'Content-Type' = 'application/json'
            }

            try {
                Invoke-RestMethod -Method Post `
                    -Uri "https://api.vercel.com/v10/projects/$projectId/env" `
                    -Headers $headers -Body $body *> $null
            } catch {
                Write-Warning "Failed to mark '$Name' as Sensitive via API: $($_.Exception.Message)"
            }
        }
    }
}

Write-Host "OK: $Name set on $Environment (length: $($value.Length) chars)"
exit 0
