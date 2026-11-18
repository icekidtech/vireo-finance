# Vireo Finance Backend - Deployment Guide

## Overview

This guide covers deploying the Vireo Finance backend to various platforms using the CI/CD pipelines.

## 📦 Deployment Options

### 1. **Railway** (Recommended for MVP)
- Zero-config PostgreSQL and Redis
- Automatic HTTPS
- Built-in monitoring
- $5/month starter plan

### 2. **Render**
- Free tier available
- Managed PostgreSQL
- Auto-scaling
- Simple configuration

### 3. **Fly.io**
- Global deployment
- PostgreSQL included
- Docker-based
- Free tier available

### 4. **Docker Compose** (Self-hosted)
- Full control
- Any VPS provider
- DigitalOcean, Linode, AWS, etc.

---

## 🚀 Quick Start: Railway

### Initial Setup

1. **Install Railway CLI**
   ```bash
   npm install -g @railway/cli
   railway login
   ```

2. **Create New Project**
   ```bash
   cd backend
   railway init
   ```

3. **Add PostgreSQL**
   ```bash
   railway add --plugin postgresql
   ```

4. **Add Redis**
   ```bash
   railway add --plugin redis
   ```

5. **Set Environment Variables**
   ```bash
   # Required secrets
   railway variables set JWT_SECRET=$(openssl rand -base64 32)
   railway variables set PIN_PEPPER=$(openssl rand -base64 32)
   railway variables set BIOMETRIC_ENCRYPTION_KEY=$(openssl rand -base64 32)
   railway variables set KYC_ENCRYPTION_KEY=$(openssl rand -base64 32)
   railway variables set DOCUMENT_ENCRYPTION_KEY=$(openssl rand -base64 32)
   
   # Paga credentials
   railway variables set PAGA_API_KEY="your-key"
   railway variables set PAGA_API_SECRET="your-secret"
   railway variables set PAGA_HASH_KEY="your-hash-key"
   
   # Didit credentials
   railway variables set DIDIT_API_KEY="your-didit-key"
   railway variables set DIDIT_KEY_TYPE="live"
   
   # OpenAI
   railway variables set OPENAI_API_KEY="your-openai-key"
   
   # Backblaze B2
   railway variables set B2_KEY_ID="your-b2-key-id"
   railway variables set B2_APPLICATION_KEY="your-b2-app-key"
   railway variables set B2_BUCKET_ID="your-bucket-id"
   railway variables set B2_BUCKET_NAME="your-bucket-name"
   ```

6. **Deploy**
   ```bash
   railway up
   ```

7. **Run Migrations**
   ```bash
   railway run npm run migration:run
   ```

8. **Get URL**
   ```bash
   railway domain
   ```

---

## 🔄 GitHub Actions CI/CD

### Setup

1. **Add Repository Secrets**

   Go to: `Settings` → `Secrets and variables` → `Actions`

   **Required Secrets:**
   - `RAILWAY_TOKEN_STAGING` - Railway API token for staging
   - `RAILWAY_TOKEN_PRODUCTION` - Railway API token for production
   - `DATABASE_URL_STAGING` - Staging database connection string
   - `DATABASE_URL_PRODUCTION` - Production database connection string
   - `SLACK_WEBHOOK_URL` - (Optional) For deployment notifications

2. **Generate Railway Tokens**
   ```bash
   railway login
   railway tokens create
   ```

### Workflows

#### **Continuous Integration** (`backend-ci.yml`)
- Runs on: Every push to `main`/`develop`, every PR
- Actions:
  - Lint code
  - Type check
  - Run tests with coverage
  - Build application
- Services: PostgreSQL, Redis (ephemeral for testing)

#### **Continuous Deployment** (`backend-deploy.yml`)
- **Staging**: Auto-deploys on push to `main`
- **Production**: Manual trigger via GitHub Actions UI
- Actions:
  - Build application
  - Deploy to Railway/Render/VPS
  - Run database migrations
  - Health check
  - Slack notification

#### **Docker Build** (`backend-docker.yml`)
- Runs on: Push to `main`, tags
- Builds multi-arch Docker images
- Pushes to GitHub Container Registry
- Cache optimization

### Deploy to Production

1. Go to GitHub Actions
2. Select "Backend Deploy" workflow
3. Click "Run workflow"
4. Choose "production" environment
5. Confirm deployment

---

## 🐳 Docker Deployment

### Local Development

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f backend

# Run migrations
docker-compose exec backend npm run migration:run

# Stop services
docker-compose down
```

### Production (VPS/EC2)

```bash
# Clone repository
git clone git@github.com:icekidtech/vireo-finance.git
cd vireo-finance

# Copy and configure environment
cp backend/.env.example backend/.env
# Edit backend/.env with production values

# Start services
docker-compose -f docker-compose.yml up -d

# Setup SSL with Let's Encrypt
docker-compose exec nginx certbot --nginx -d api.vireofinance.com

# View logs
docker-compose logs -f

# Update deployment
git pull
docker-compose build backend
docker-compose up -d backend
```

---

## 🔧 Platform-Specific Guides

### Render

1. **Create Web Service**
   - Connect GitHub repo
   - Select `backend` directory
   - Use `render.yaml` for configuration

2. **Add Database**
   - PostgreSQL instance
   - Copy connection string to environment

3. **Set Environment Variables**
   All variables from `.env.example`

4. **Deploy**
   - Auto-deploys on push to `main`

### Fly.io

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Login
flyctl auth login

# Launch app
cd backend
flyctl launch --config fly.toml

# Add PostgreSQL
flyctl postgres create

# Set secrets
flyctl secrets set JWT_SECRET=$(openssl rand -base64 32)
flyctl secrets set PIN_PEPPER=$(openssl rand -base64 32)
# ... add all other secrets

# Deploy
flyctl deploy

# Run migrations
flyctl ssh console
npm run migration:run
```

---

## 🔐 Security Checklist

### Before Production

- [ ] All secrets use strong random values
- [ ] `NODE_ENV=production`
- [ ] `DIDIT_KEY_TYPE=live` (not sandbox)
- [ ] `OTP_LOG_CODE=false` or removed
- [ ] `LOG_HTTP_BODIES=false`
- [ ] `LOG_LLM_PAYLOADS=false`
- [ ] SSL/TLS enabled
- [ ] Database backups configured
- [ ] Rate limiting enabled
- [ ] CORS configured properly
- [ ] Monitoring/alerts set up

### Generate Secure Keys

```bash
# JWT Secret
openssl rand -base64 32

# PIN Pepper
openssl rand -base64 48

# Biometric Encryption Key
openssl rand -base64 32

# KYC Encryption Key
openssl rand -base64 32

# Document Encryption Key
openssl rand -base64 32
```

**⚠️ CRITICAL:** Back up all encryption keys! Losing them means:
- Users cannot decrypt stored biometric data (must re-enroll)
- BVNs become unreadable (must re-verify)
- Documents become unreadable (must re-upload)

---

## 📊 Monitoring & Health Checks

### Health Endpoint

```bash
curl https://api.vireofinance.com/health
```

Response:
```json
{
  "status": "ok",
  "database": "connected",
  "redis": "connected",
  "uptime": 12345
}
```

### Log Aggregation

**Railway**: Built-in logs viewer
**Render**: Integrated logs
**Docker**: Use `docker-compose logs`
**Production**: Consider Datadog, New Relic, or Grafana

### Database Monitoring

```bash
# Railway
railway run psql

# Docker
docker-compose exec postgres psql -U postgres vireo

# Check connections
SELECT count(*) FROM pg_stat_activity;

# Check database size
SELECT pg_size_pretty(pg_database_size('vireo'));
```

---

## 🔄 Migration Strategy

### Zero-Downtime Deployments

1. **Before Deploy**
   - Create backward-compatible migrations
   - Test migrations on staging
   - Backup production database

2. **Deploy**
   - Run migrations first
   - Then deploy new code
   - Monitor health checks

3. **Rollback Plan**
   - Keep previous Docker image
   - Have migration revert script ready
   - Test rollback on staging

### Manual Migration

```bash
# Generate migration
npm run migration:generate -- src/database/migrations/AddNewFeature

# Run migrations
npm run migration:run

# Revert last migration
npm run migration:revert
```

---

## 🐛 Troubleshooting

### Build Failures

```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Check TypeScript
npm run typecheck

# Check linting
npm run lint
```

### Database Connection Issues

```bash
# Check DATABASE_URL format
postgresql://user:password@host:port/database?sslmode=require

# Test connection
npm run migration:run
```

### Memory Issues

- Increase container memory limit
- Check for memory leaks in logs
- Optimize Bull queue concurrency

---

## 📝 Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | `production`, `staging`, or `development` |
| `PORT` | Yes | API port (default: 3050) |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_HOST` | Yes | Redis host |
| `JWT_SECRET` | Yes | Session token signing key |
| `PIN_PEPPER` | Yes | Transaction PIN hashing key |
| `PAGA_API_KEY` | Yes | Paga Business API key |
| `PAGA_API_SECRET` | Yes | Paga Business API secret |
| `BIOMETRIC_ENCRYPTION_KEY` | Phase 3 | Face template encryption |
| `DIDIT_API_KEY` | Phase 3 | Didit biometric verification |
| `KYC_ENCRYPTION_KEY` | KYC | BVN encryption key |
| `OPENAI_API_KEY` | Agent | OpenAI API for agent chat |

See `.env.example` for complete list.

---

## 🎯 Production Checklist

### Pre-Launch

- [ ] Load testing completed
- [ ] Security audit done
- [ ] Backup strategy implemented
- [ ] Monitoring configured
- [ ] Error tracking (Sentry) set up
- [ ] Rate limiting configured
- [ ] DDoS protection enabled
- [ ] SSL certificates valid
- [ ] Domain DNS configured
- [ ] Team access configured

### Launch Day

- [ ] Deploy to production
- [ ] Run smoke tests
- [ ] Monitor error rates
- [ ] Check database performance
- [ ] Verify external integrations (Paga, Didit)
- [ ] Test mobile app connectivity

### Post-Launch

- [ ] Monitor metrics daily
- [ ] Review logs for errors
- [ ] Check database growth
- [ ] Optimize slow queries
- [ ] Scale if needed

---

## 📞 Support

- **GitHub Issues**: Report bugs
- **Documentation**: Check wiki
- **Team Chat**: Slack #backend-deployment

---

## 🔗 Useful Links

- [NestJS Deployment](https://docs.nestjs.com/deployment)
- [Railway Docs](https://docs.railway.app)
- [Render Docs](https://render.com/docs)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [PostgreSQL Performance](https://wiki.postgresql.org/wiki/Performance_Optimization)
