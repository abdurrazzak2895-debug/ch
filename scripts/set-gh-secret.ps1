# set-gh-secret.ps1
# ----------------------------------------------------------------------------
# Read a secret value from a local file and set it as a GitHub repo secret
# without ever printing the value in chat or terminal scrollback.
#
# Usage:
#   pwsh scripts/set-gh-secret.ps1 `
#     -Name SUPABASE_ACCESS_TOKEN `
#     -ValueFile .\.secrets\supabase-access-token.txt
#
# Why this exists:
#   `gh secret set` prompts for stdin. If you paste the value into chat, it
#   ends up in transcript logs. This wrapper reads from a file so the value
#   never leaves your disk.
#
# Notes:
#   - The file should contain ONLY the secret value.
#   - Requires `gh auth status` to be logged in.
#   - Targets the current repo (run from inside a checked-out clone).
# ----------------------------------------------------------------------------

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string] $Name,
    [Parameter(Mandatory = $true)] [string] $ValueFile
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

# Verify gh is authenticated.
$authStatus = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "gh is not authenticated. Run 'gh auth login' first."
    exit 1
}

# Pipe value to `gh secret set`. The literal value never appears on a command
# line, so it stays out of shell history.
Get-Content -Path $ValueFile | gh secret set $Name *> $null 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "gh secret set failed (exit $LASTEXITCODE)"
    exit $LASTEXITCODE
}

Write-Host "OK: $Name set on current repo (length: $($value.Length) chars)"
exit 0
