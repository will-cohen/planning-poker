# ADR 001: Infrastructure Hosting Strategy

## Status
Proposed

## Context
The Planning Poker application requires deployment of three distinct components:

1. **WebRTC Signaling Server** - Lightweight Node.js server that facilitates WebRTC peer connection establishment for participants in planning sessions
2. **Message Queue** - Redis instance needed to coordinate signaling state and maintain session data across server instances
3. **Client Application** - Static HTML, CSS, and JavaScript bundles (built by Vite and hosted by 11ty) plus static content

We need a scalable, cost-effective infrastructure strategy suitable for the MVP phase and initial growth. The team has no existing cloud infrastructure contracts.

## Decision
We will deploy using a multi-provider approach:

### 1. Server Compute: Fly.io
- Deploy the WebRTC signaling server (Node.js application in `server/` directory)
- Rationale:
  - Excellent for WebRTC applications with global availability
  - Competitive pricing with generous free tier for MVP
  - Simple deployment via `fly deploy`
  - Easy scaling for future growth
  - Good geographic distribution for low-latency WebRTC connections

### 2. Message Queue: Upstash Redis
- Deploy managed Redis instance for session coordination and message queuing
- Rationale:
  - Serverless Redis offering with generous free tier (up to 10k commands/day)
  - Zero management overhead; no infrastructure to maintain
  - REST and native Redis API support
  - Automatic backups included
  - Perfect for MVP where message volume is predictable
  - Scales gracefully as sessions grow

### 3. Client Bundle: Netlify
- Host static site (11ty output) and React SPA (Vite bundle)
- Rationale:
  - Excellent free tier suitable for MVP (100 GB bandwidth/month)
  - Automatic building from Git (no manual deployment steps)
  - Built-in CDN for fast global distribution
  - Native support for static site generators (11ty)
  - Environment variable management for signaling server URL
  - Rollback and preview deployments included

## Deployment Architecture

```
┌─────────────────┐
│   Netlify CDN   │
│  (Client App)   │
└────────┬────────┘
         │ HTTPS
         │ Loads signaling URL from env
         │
    ┌────v─────────────┐
    │   Fly.io         │
    │ Signaling Server │
    │   (Node.js)      │
    └────┬─────────────┘
         │
    ┌────v──────────────────┐
    │  Upstash Redis        │
    │ (Message Queue)       │
    └───────────────────────┘

Peer connections: WebRTC (P2P, encrypted)
```

## Configuration

### Environment Variables
- **Client (`netlify.toml` / build env)**:
  ```
  VITE_SIGNALING_SERVER=wss://planning-poker-signaling.fly.dev
  ```

- **Server (Fly.io secrets)**:
  ```
  REDIS_URL=<upstash-connection-string>
  PORT=3000
  ```

### Secrets Management

**GitHub Secrets** (for CI/CD workflows):
- `FLY_API_TOKEN` - Fly.io authentication (from `flyctl auth token`)
- `NETLIFY_AUTH_TOKEN` - Netlify authentication
- `NETLIFY_SITE_ID` - Planning Poker site ID on Netlify
- `UPSTASH_REDIS_URL` - Redis connection string (passed to Fly.io)

**Fly.io Secrets** (managed via `fly secrets set`):
- `REDIS_URL` - Upstash Redis connection string
- `SIGNALING_PORT` - WebSocket port (3000)

**Netlify Variables** (configured in UI or via `netlify.toml`):
- `VITE_SIGNALING_SERVER` - Signaling server WebSocket URL
- `NODE_ENV` - Set to `production`

**Upstash**:
- Create database in console
- Connection string stored as `UPSTASH_REDIS_URL` in GitHub Secrets
- No additional secrets needed (connection string includes auth)

### Deployment Process

1. **Client**: Push to main branch → GitHub Actions deploys to Netlify
2. **Server**: Push to main branch → GitHub Actions deploys to Fly.io
3. **Redis**: Created once via Upstash console; managed as service

## Consequences

### Positive
- ✅ **Zero upfront infrastructure costs** - all providers have free/generous tiers
- ✅ **No DevOps overhead** - managed services require minimal operations
- ✅ **Quick time-to-market** - simple deployment workflows
- ✅ **Global scalability** - all providers have multi-region support
- ✅ **Single sign-on not needed** - can focus on product features
- ✅ **Cost predictability** - clear pricing tiers as we scale

### Negative / Risks
- ⚠️ **Multi-provider dependency** - need separate accounts and monitoring dashboards
- ⚠️ **Fly.io WebRTC limitations** - may need fallback signaling if certain networks block P2P
- ⚠️ **Cold starts on Fly.io** - signaling server may have slight latency on first request (mitigated by keep-alives)
- ⚠️ **Upstash free tier limits** - may need upgrade if message volume exceeds 10k commands/day

## CI/CD Pipeline (GitHub Actions)

### Workflow: Deploy Client to Netlify

**File**: `.github/workflows/deploy-client.yml`

```yaml
name: Deploy Client to Netlify

on:
  push:
    branches: [main]
    paths:
      - 'src/**'
      - '11ty/**'
      - 'package.json'
      - 'vite.config.js'
      - 'tailwind.config.js'
      - '.github/workflows/deploy-client.yml'

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Type check
        run: npm run type-check
      
      - name: Build
        run: npm run build
        env:
          VITE_SIGNALING_SERVER: wss://planning-poker-signaling.fly.dev
      
      - name: Deploy to Netlify
        uses: netlify/actions/cli@master
        with:
          args: deploy --prod --dir=dist
        env:
          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
          NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}
```

### Workflow: Deploy Server to Fly.io

**File**: `.github/workflows/deploy-server.yml`

```yaml
name: Deploy Server to Fly.io

on:
  push:
    branches: [main]
    paths:
      - 'server/**'
      - '.github/workflows/deploy-server.yml'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: superfly/flyctl-actions/setup-flyctl@master
      
      - name: Deploy server to Fly.io
        run: flyctl deploy --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

### Workflow: Tests (Optional but Recommended)

**File**: `.github/workflows/test.yml`

```yaml
name: Run Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Type check
        run: npm run type-check
      
      - name: Lint
        run: npm run lint
      
      - name: Build client
        run: npm run build
        env:
          VITE_SIGNALING_SERVER: wss://planning-poker-signaling.fly.dev
```

### GitHub Secrets Setup

Set these secrets in GitHub repo settings (`Settings → Secrets and variables → Actions`):

| Secret | Source | Notes |
|--------|--------|-------|
| `FLY_API_TOKEN` | Run `flyctl auth token` locally | Auth token for Fly.io |
| `NETLIFY_AUTH_TOKEN` | Netlify UI → Settings → Auth | Personal access token |
| `NETLIFY_SITE_ID` | Netlify UI → Settings → API ID | Site ID for GitHub deployments |
| `UPSTASH_REDIS_URL` | Upstash console → Database details | Connection string (includes auth) |

### Fly.io Secrets Setup

Secrets stored in Fly.io (not GitHub), accessed by server at runtime:

```bash
# Set REDIS_URL in Fly.io
flyctl secrets set REDIS_URL="redis://default:PASSWORD@HOSTNAME:PORT"

# View current secrets
flyctl secrets list

# Update a secret
flyctl secrets set REDIS_URL="new-connection-string"
```

### Deployment Process

1. Developer pushes to `main` branch
2. GitHub Actions triggers appropriate workflow(s)
3. **Client workflow**:
   - Runs tests and type-check
   - Builds with `VITE_SIGNALING_SERVER` injected
   - Deploys to Netlify
4. **Server workflow**:
   - Builds Docker image (defined in `server/Dockerfile`)
   - Deploys to Fly.io (reads `REDIS_URL` from Fly.io secrets)
5. Workflows complete independently (no blocking between client/server)

### Configuration Matrix

| Component | Secret Storage | How Accessed | Updated Via |
|-----------|---|---|---|
| **Client** | GitHub Secrets (build-time env) | Build process → embedded in bundle | Redeploy to Netlify |
| **Server** | Fly.io Secrets (runtime env) | App reads at startup | `flyctl secrets set` |
| **Redis** | Upstash console | Connection string in Fly.io secrets | Fly.io env update |

### Manual Deployment (if needed)

```bash
# Deploy client manually
netlify deploy --prod --dir=dist

# Deploy server manually
cd server
flyctl deploy
```

## Alternatives Considered

### Alternative 1: AWS (EC2 + ElastiCache + S3 + CloudFront)
- **Rejected**: Steeper learning curve, more complex networking, free tier is time-limited (12 months)

### Alternative 2: Heroku (server) + Heroku Postgres (state)
- **Rejected**: Heroku discontinued free tier; pricing no longer competitive

### Alternative 3: Vercel (client) + Railway (server) + Redis Cloud (Redis)
- **Rejected**: Railway lacks geographic distribution for WebRTC; slightly higher costs than chosen stack

### Alternative 4: Self-hosted on Linode / DigitalOcean
- **Rejected**: Requires DevOps effort and ongoing maintenance; not suitable for MVP

## Migration Path

If infrastructure requirements change:
- **Client → Vercel/S3**: Straightforward (same static files)
- **Server → Railway/Render**: Requires minimal code changes (same Node.js app)
- **Redis → Redis Cloud/AWS ElastiCache**: Requires updating connection string only

## Next Steps

1. **Phase 1**: Set up Upstash Redis instance and get connection string
2. **Phase 2**: Deploy signaling server to Fly.io and configure WebSocket endpoint
3. **Phase 3**: Configure Netlify to build and deploy client with signaling server URL
4. **Phase 4**: Set up GitHub Actions CI/CD workflows and configure secrets
5. **Phase 5**: Test end-to-end session flow across all infrastructure
6. **Phase 6**: Set up monitoring and error tracking (Sentry, Grafana Cloud)

## References

- [Fly.io Documentation](https://fly.io/docs/)
- [Upstash Redis Documentation](https://upstash.com/docs)
- [Netlify Build & Deploy](https://docs.netlify.com/configure-builds/overview/)
- [y-webrtc Provider](https://docs.yjs.dev/ecosystem/connection-provider/y-webrtc)
