# Secret-management helpers

These scripts let you push secrets to Vercel / GitHub **without ever pasting
the value into chat or terminal scrollback**. The value is read from a local
file, which you keep on disk (and out of git) yourself.

## Layout

```
scripts/
  set-vercel-env.ps1   # Push a value-file -> Vercel project env var
  set-gh-secret.ps1    # Push a value-file -> GitHub repo secret
```

## Recommended local layout (untracked)

```
.secrets/                # gitignored
  supabase-publishable.txt
  supabase-secret.txt
  supabase-access-token.txt
  ...
```

The script will only read the file path you pass — the *value* never appears
on a command line.

## Examples

### Set a Vercel env var (frontend)

```pwsh
pwsh scripts/set-vercel-env.ps1 `
  -Name VITE_SUPABASE_PUBLISHABLE_KEY `
  -ValueFile .\.secrets\supabase-publishable.txt `
  -Environment production
```

Optional `-Sensitive:$false` for non-sensitive values. For `VITE_*` vars
the wrapper prints a heads-up but still proceeds.

### Set a GitHub repo secret

```pwsh
pwsh scripts/set-gh-secret.ps1 `
  -Name SUPABASE_ACCESS_TOKEN `
  -ValueFile .\.secrets\supabase-access-token.txt
```

## Why this exists

`vercel env add` and `gh secret set` both read from stdin. Pasting the value
into chat or a terminal captures it in transcript logs that are hard to
purge. The wrapper avoids this by reading the value from a file the model
never sees.

## Optional: prereqs for `set-vercel-env.ps1 -Sensitive`

The Sensitive type is set via the Vercel REST API. The wrapper will look
for `$env:VERCEL_TOKEN` (a personal token from
<https://vercel.com/account/tokens>). Without it, the value is still set
but the type may default to Plain — you'll get a warning in that case.
