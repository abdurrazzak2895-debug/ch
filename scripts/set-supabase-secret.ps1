# set-supabase-secret.ps1
# ----------------------------------------------------------------------------
# Read a secret value from a local file and push it to a Supabase project
# as a named secret, without ever printing the value in chat or terminal
# scrollback.
#
# Usage:
#   pwsh scripts/set-supabase-secret.ps1 `
#     -Name T2HUB_BOOTSTRAP_TOKEN `
#     -ValueFile .\.secrets\t2hub-bootstrap-token.txt `
#     -ProjectRef xklwzkraobxetxdcysun
#
# Why this exists:
#   The supabase CLI does not accept secret values on stdin; `secrets set
#   NAME=VALUE` puts the value on the command line, which ends up in chat
#   history and shell scrollback. This wrapper writes the value to a
#   short-lived .env file, calls the CLI with --env-file, then deletes
#   the file. The literal value is never on a command line and never
#   printed in our own output (the script only echoes byte count).
# ----------------------------------------------------------------------------

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string] $Name,
    [Parameter(Mandatory = $true)] [string] $ValueFile,
    [Parameter(Mandatory = $true)] [string] $ProjectRef
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

# Build a one-shot .env file in the OS temp dir, named to make the
# purpose obvious in case anything is left behind.
$tempEnv = Join-Path $env:TEMP ("supabase-secret-{0}-{1}.env" -f $Name, [guid]::NewGuid().ToString("N"))
try {
    Set-Content -Path $tempEnv -Value ($Name + "=" + $value) -NoNewline -Encoding utf8

    $proc = Start-Process -FilePath "cmd.exe" -ArgumentList @(
        "/c", "supabase", "secrets", "set",
        "--env-file", $tempEnv,
        "--project-ref", $ProjectRef
    ) -NoNewWindow -PassThru -Wait -RedirectStandardOutput "$tempEnv.out" -RedirectStandardError "$tempEnv.err"

    if ($proc.ExitCode -ne 0) {
        $err = Get-Content -Raw -Path "$tempEnv.err" -ErrorAction SilentlyContinue
        Write-Error "supabase secrets set failed (exit $($proc.ExitCode)): $err"
        exit $proc.ExitCode
    }
    $out = Get-Content -Raw -Path "$tempEnv.out" -ErrorAction SilentlyContinue
    Write-Host "OK: $Name set on project $ProjectRef (length: $($value.Length) chars)"
    if ($out) { Write-Host $out.Trim() }
} finally {
    # Best-effort cleanup of the temp env file (the value lives there).
    foreach ($f in @($tempEnv, "$tempEnv.out", "$tempEnv.err")) {
        if (Test-Path $f) {
            # Overwrite the file with random bytes before deleting, so a
            # post-mortem of the disk can't recover the secret.
            try {
                $bytes = New-Object byte[] 4096
                (New-Object Random).NextBytes($bytes)
                [IO.File]::WriteAllBytes($f, $bytes)
                Remove-Item $f -Force
            } catch {
                Remove-Item $f -Force -ErrorAction SilentlyContinue
            }
        }
    }
}
exit 0
