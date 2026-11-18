# CI/CD Quick Start Guide

## 🎯 What's Been Set Up

Your Vireo Finance backend now has a complete CI/CD pipeline with:

✅ **Automated Testing** - Runs on every commit  
✅ **Automated Builds** - Docker images built automatically  
✅ **Automated Deployments** - Push to staging, manual to production  
✅ **Multiple Platform Support** - Railway, Render, Fly.io, Docker  
✅ **Health Checks** - Automated verification after deployment  
✅ **Slack Notifications** - Get notified of deployments  

---

## 🚀 Quick Deploy to Railway (Recommended)

### 1. Initial Setup (One-time)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Create project
cd backend
railway init

# Add databases
railway add --plugin postgresql
railway add --plugin redis

# Generate and set secrets
./scripts/generate-secrets.sh

# Copy output and set each variable:
railway variables set JWT_SECRET="<generated-value>"
railway variables set PIN_PEPPER="<generated-value>"
railway variables set BIOMETRIC_ENCRYPTION_KEY="<generated-value>"
# ... etc

# Set Paga credentials
railway variables set PAGA_API_KEY="766e89c8-5b7a-4b39-8ddc-1d9cbac09052"
railway variables set PAGA_API_SECRET="bbuyO8LumANJ6U1L4DkAkFuRjmpG3pEY"
railway variables set PAGA_HASH_KEY="a5ede7a350f5447b8f7df6c03442601ca73d8e7493fc4189a6de73345d93277ca84b755ab5ce4ddcb82ef5021c1c53b75565b6e43cba40e2b2d700208acd8aa9"

# Set Didit credentials
railway variables set DIDIT_API_KEY="sk_live_acqQIVRln3cE72T9ssz-GHDrvKJwudD0hcD8ihcQTaQ"
railway variables set DIDIT_KEY_TYPE="live"

# Set other services
railway variables set OPENAI_API_KEY="<your-key>"
railway variables set B2_KEY_ID="<your-key>"
railway variables set B2_APPLICATION_KEY="<your-key>"
railway variables set B2_BUCKET_ID="<your-id>"
railway variables set B2_BUCKET_NAME="vireo-finance"
```

### 2. Deploy

```bash
# Deploy application
railway up

# Run migrations
railway run npm run migration:run

# Get your URL
railway domain

# Test it
curl https://your-app.up.railway.app/health
```

### 3. Configure GitHub Actions

1. Get Railway token:
   ```bash
   railway tokens create
   ```

2. Add to GitHub Secrets:
   - Go to: `Settings` → `Secrets and variables` → `Actions`
   - Add `RAILWAY_TOKEN_STAGING` with the token

3. Push to main branch - deployment happens automatically!

---

## 🔄 GitHub Actions Workflows

### Workflow #1: Continuous Integration (`backend-ci.yml`)

**Triggers:** Every push to `main`/`develop`, every PR

**What it does:**
1. ✅ Runs ESLint
2. ✅ Type checks TypeScript
3. ✅ Runs all tests with PostgreSQL & Redis
4. ✅ Generates coverage report
5. ✅ Builds the application
6. ✅ Uploads artifacts

**Status:** Check the green checkmark on commits

### Workflow #2: Continuous Deployment (`backend-deploy.yml`)

**Staging:**
- **Trigger:** Auto-deploys on push to `main`
- **Steps:**
  1. Build application
  2. Deploy to Railway/Render
  3. Run database migrations
  4. Send Slack notification

**Production:**
- **Trigger:** Manual via GitHub Actions UI
- **Steps:** Same as staging + health check

**How to deploy to production:**
1. Go to: `Actions` → `Backend Deploy`
2. Click `Run workflow`
3. Select `production` environment
4. Click `Run workflow`
5. Approve deployment (if required)

### Workflow #3: Docker Build (`backend-docker.yml`)

**Triggers:** Push to `main`, Git tags

**What it does:**
1. Builds multi-platform Docker image (AMD64 + ARM64)
2. Pushes to GitHub Container Registry
3. Tags with branch name and `latest`

**Access images:**
```bash
docker pull ghcr.io/icekidtech/vireo-finance/backend:latest
```

---

## 🐳 Local Docker Development

```bash
# Start all services (backend + postgres + redis)
docker-compose up -d

# View logs
docker-compose logs -f backend

# Run migrations
docker-compose exec backend npm run migration:run

# Stop everything
docker-compose down

# Rebuild after code changes
docker-compose build backend
docker-compose up -d backend
```

---

## 📊 Monitoring Deployments

### View Railway Logs

```bash
railway logs
```

### Check Health

```bash
# Check local
./backend/scripts/health-check.sh http://localhost:3050

# Check staging
./backend/scripts/health-check.sh https://your-staging.up.railway.app

# Check production
./backend/scripts/health-check.sh https://your-production.up.railway.app
```

### GitHub Actions Status

- Green checkmark ✅ = Success
- Red X ❌ = Failed
- Yellow dot 🟡 = Running

Click on any commit to see detailed logs.

---

## 🔧 Common Tasks

### Deploy to Staging

```bash
git add .
git commit -m "feat: add new feature"
git push origin main
# Automatically deploys to staging!
```

### Deploy to Production

1. **Via GitHub Actions (Recommended):**
   - Go to Actions → Backend Deploy
   - Run workflow → Select "production"

2. **Via CLI:**
   ```bash
   cd backend
   ./scripts/deploy-railway.sh
   # Choose 'production' when prompted
   ```

### Rollback Deployment

**Railway:**
```bash
railway rollback
```

**Docker:**
```bash
# Revert to previous image
docker-compose down
git checkout <previous-commit>
docker-compose build backend
docker-compose up -d backend
```

### Run Database Migrations

**Railway:**
```bash
railway run npm run migration:run
```

**Docker:**
```bash
docker-compose exec backend npm run migration:run
```

**GitHub Actions:**
Migrations run automatically after deployment.

### View Application Logs

**Railway:**
```bash
railway logs --tail
```

**Docker:**
```bash
docker-compose logs -f backend
```

**GitHub Actions:**
Click on workflow → Select job → View logs

---

## 🔐 Managing Secrets

### Add New Secret

**Railway:**
```bash
railway variables set NEW_SECRET="value"
```

**GitHub Actions:**
1. Go to `Settings` → `Secrets and variables` → `Actions`
2. Click `New repository secret`
3. Add name and value

**Docker:**
1. Edit `.env` file (never commit!)
2. Restart: `docker-compose restart backend`

### Rotate Secrets

```bash
# Generate new secret
openssl rand -base64 32

# Update in Railway
railway variables set JWT_SECRET="new-value"

# Restart application
railway restart
```

---

## 🐛 Troubleshooting

### Build Fails

```bash
# Clear cache and rebuild
cd backend
rm -rf node_modules dist
npm install
npm run build
```

### Tests Fail

```bash
# Run tests locally
cd backend
npm test

# Run specific test
npm test -- auth.service.spec.ts

# Check linting
npm run lint
```

### Deployment Fails

1. Check GitHub Actions logs
2. Verify all secrets are set
3. Check Railway logs: `railway logs`
4. Verify database is running: `railway variables get DATABASE_URL`

### Migration Fails

```bash
# Check migration syntax
npm run typecheck

# Test migration locally
npm run migration:run

# Revert last migration
npm run migration:revert
```

### Application Won't Start

```bash
# Check environment variables
railway variables

# View real-time logs
railway logs --tail

# Check health
curl https://your-app.up.railway.app/health
```

---

## 📚 Learn More

- **Backend Deployment Guide:** `backend/DEPLOYMENT.md`
- **Railway Docs:** https://docs.railway.app
- **GitHub Actions Docs:** https://docs.github.com/en/actions
- **NestJS Deployment:** https://docs.nestjs.com/deployment

---

## ✅ Pre-Production Checklist

Before going live, verify:

- [ ] All tests passing
- [ ] All secrets set in production environment
- [ ] `NODE_ENV=production`
- [ ] `DIDIT_KEY_TYPE=live` (not sandbox)
- [ ] `OTP_LOG_CODE=false` or removed
- [ ] SSL/HTTPS enabled
- [ ] Database backups configured
- [ ] Monitoring/alerts set up
- [ ] Domain configured
- [ ] Load testing completed
- [ ] Security audit done

---

## 🆘 Need Help?

- Check logs first: `railway logs` or `docker-compose logs`
- Review `backend/DEPLOYMENT.md` for detailed guides
- GitHub Issues for bugs
- Team Slack #backend-deployment

---

## 🎉 You're Ready!

Your CI/CD pipeline is configured and ready to use. Every push to `main` automatically deploys to staging. Production deployments are manual for safety.

**Next steps:**
1. Generate secrets: `./backend/scripts/generate-secrets.sh`
2. Deploy to Railway: Follow setup above
3. Configure GitHub Actions: Add Railway token
4. Push code → Automatic deployment!

Happy deploying! 🚀
