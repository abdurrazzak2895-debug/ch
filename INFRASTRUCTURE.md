# Infrastructure Architecture

## Request Flow

```
Client (Browser)
    ↓
api.choice-pc-sv.xyz (Vercel)
    ↓
Cloudflare / Nginx Proxy
    ↓
xklwzkraobxetxdcysun.supabase.co (Supabase Edge Functions)
    ↓
Supabase Database / External APIs (SVP, Takamol)
```

## Components

### 1. Frontend (Vercel)
- **Domain**: `api.choice-pc-sv.xyz`
- **Framework**: Vite + React
- **Build**: `frontend/dist`
- **Env Variables**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`

### 2. Cloudflare / Nginx Proxy
- **Purpose**: SSL termination, caching, DDoS protection
- **Forwards**: All requests to Supabase

### 3. Supabase Edge Functions
- **Project ID**: `xklwzkraobxetxdcysun`
- **URL**: `https://xklwzkraobxetxdcysun.supabase.co/functions/v1/`

#### Available Functions:
| Function | Path | Purpose |
|----------|------|---------|
| `svp-proxy` | `/functions/v1/svp-proxy/*` | SVP booking API proxy |
| `svp-auth` | `/functions/v1/svp-auth/*` | Authentication |
| `takamol-proxy` | `/functions/v1/takamol-proxy/*` | Takamol API proxy |
| `access-admin` | `/functions/v1/access-admin/*` | Admin dashboard |
| `access-agency` | `/functions/v1/access-agency/*` | Agency management |
| `access-wallet` | `/functions/v1/access-wallet/*` | Wallet & billing |
| `test-center-owner` | `/functions/v1/test-center-owner/*` | Test center management |

### 4. External APIs
- **SVP (Takamol)**: `https://t2hub.app/takamol/api`
- **Database**: Supabase PostgreSQL

## API Routes

### SVP Proxy Routes
```
GET/POST /functions/v1/svp-proxy/exam-reservations
GET/POST /functions/v1/svp-proxy/payments
POST /functions/v1/svp-proxy/auto-verify-reservations
```

### Auth Routes
```
POST /functions/v1/svp-auth/login
POST /functions/v1/svp-auth/logout
GET /functions/v1/svp-auth/status
```

### Admin Routes
```
GET /functions/v1/access-admin/dashboard
GET/PUT /functions/v1/access-admin/billing-settings
POST /functions/v1/access-admin/accounts
```

## Environment Variables

### Supabase Secrets (Edge Functions)
```
TAKAMOL_LIVE_API_URL=https://t2hub.app/takamol/api
TAKAMOL_ENCRYPTION_KEY_B64=<base64-encoded-key>
TAKAMOL_SESSION_COOKIE=<session-cookie>
TAKAMOL_XSRF_TOKEN=<xsrf-token>
T2HUB_SESSION_KEY=<encryption-key>
T2HUB_SESSION_COOKIE=<cookie-string>
T2HUB_SESSION_CSRF=<csrf-token>
```

### Vercel Environment Variables
```
VITE_SUPABASE_URL=https://xklwzkraobxetxdcysun.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_SUPABASE_PROJECT_ID=xklwzkraobxetxdcysun
```

## Request Examples

### Check Auth Status
```powershell
Invoke-WebRequest -Uri "https://xklwzkraobxetxdcysun.supabase.co/functions/v1/takamol-proxy/api/auth/status"
```

### Get Dashboard Data
```powershell
Invoke-WebRequest -Uri "https://xklwzkraobxetxdcysun.supabase.co/functions/v1/access-admin/dashboard" `
  -Headers @{ "Authorization" = "Bearer <jwt-token>" }
```

### Refresh T2Hub Session
```bash
node scripts/refresh-t2hub-session.mjs
node scripts/sync-t2hub-session.mjs --write
```

## Auto-Refresh Features

### Dashboard Auto-Refresh
- **Interval**: 30 seconds
- **Toggle**: Live/Paused button
- **Manual**: Refresh button

### Session Auto-Refresh
- **GitHub Actions**: Every 6 hours
- **Local**: `npm run auto-refresh-t2hub`

### Wallet Auto-Refund
- **Triggers**: On every GET request to `/exam-reservations`
- **Orphan cleanup**: Debits older than 1 hour with no reservation
- **Status detection**: cancel, expired, failed, error, void, etc.
