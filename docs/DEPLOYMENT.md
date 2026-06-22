# Visual Adapter - Deployment Guide

**Version**: 3.0  
**Last Updated**: November 21, 2025

---

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [Platform Comparison](#platform-comparison)
3. [Hugging Face Spaces Deployment](#hugging-face-spaces-deployment)
4. [Production Configuration](#production-configuration)
5. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Local Development

**Prerequisites**:
- Node.js 18+
- Google Gemini API key
- Firebase project (optional, has defaults)

**Steps**:

```bash
# 1. Navigate to backend
cd "h:\My Drive\Study RL\Program\Visual_adapter\backend"

# 2. Install dependencies
npm install

# 3. Set environment variables
$env:GEMINI_API_KEY="your_gemini_api_key_here"

# 4. Start backend
node index.js
```

**Expected Output**:
```json
{"timestamp":"2025-11-21T...","level":"INFO","message":"HTTP server started","port":7860}
{"timestamp":"2025-11-21T...","level":"INFO","message":"Analyze endpoint available"}
```

**5. Load Extension**:
1. Open Chrome → `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `h:\My Drive\Study RL\Program\Visual_adapter`
5. Extension should load successfully

**6. Test**:
1. Click extension icon to open side panel
2. Visit any website
3. Content should extract within 2-5 seconds

---

## Platform Comparison

### Recommended: Hugging Face Spaces ⭐

**Why Recommended**:
- ✅ **Truly free** - No credit card, no time limits
- ✅ **No cold starts** - Always-on, instant responses
- ✅ **AI-friendly** - Built for ML/AI workloads
- ✅ **Simple deployment** - Git push to deploy
- ✅ **Secrets management** - Secure environment variables

**Specs**:
- Runtime: Docker containers
- CPU: 2 vCPU (free tier)
- RAM: 16GB (free tier)
- Storage: Persistent
- Port: 7860 (default)

---

### Alternative Platforms

| Platform | Free Tier | Cold Starts | Credit Card | Always-On | Best For |
|----------|-----------|-------------|-------------|-----------|----------|
| **Hugging Face** | ✅ Unlimited | ❌ None | ❌ No | ✅ Yes | AI/ML apps |
| **Railway** | $5/month credit | ⚠️ Minimal | ⚠️ Yes | ✅ Yes | Modern apps |
| **Render** | 750 hrs/month | ⚠️ 30s | ❌ No | ❌ No | Hobby projects |
| **Google Cloud Run** | 2M req/month | ⚠️ 2-5s | ⚠️ Yes | ❌ No | Scalable apps |
| **Fly.io** | 3 VMs | ❌ None | ⚠️ Yes | ✅ Yes | Global apps |

---

## Hugging Face Spaces Deployment

### Step 1: Prepare Backend

**Verify Files**:
```
backend/
├── index.js          ✅ Main server file
├── package.json      ✅ Dependencies
├── Dockerfile        ✅ Container config
├── .dockerignore     ✅ Exclude files
└── .env.example      ✅ Environment template
```

**Check Dockerfile**:
```dockerfile
FROM node:18-slim
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY . .
EXPOSE 7860
CMD ["npm", "start"]
```

### Step 2: Create Hugging Face Space

1. Go to https://huggingface.co/spaces
2. Click **"Create new Space"**
3. Configure:
   - **Space name**: `visual-adapter-backend`
   - **License**: MIT
   - **Space SDK**: **Docker** (important!)
   - **Visibility**: Public or Private

4. Click **"Create Space"**

### Step 3: Push Code

```bash
# Clone the Space repository
git clone https://huggingface.co/spaces/YOUR_USERNAME/visual-adapter-backend
cd visual-adapter-backend

# Copy backend files
cp -r "h:\My Drive\Study RL\Program\Visual_adapter\backend\*" .

# Commit and push
git add .
git commit -m "Initial deployment - Visual Adapter Backend v3.0"
git push
```

### Step 4: Set Environment Variables

1. Go to your Space settings
2. Click **"Repository secrets"**
3. Add secrets:

| Name | Value | Required |
|------|-------|----------|
| `GEMINI_API_KEY` | Your Gemini API key | ✅ Yes |
| `FIREBASE_SECRET` | Your Firebase secret | ⚠️ Optional (has default) |
| `FIREBASE_URL` | Your Firebase URL | ⚠️ Optional (has default) |

4. Click **"Save"**

### Step 5: Verify Deployment

**Check Logs**:
1. Go to your Space page
2. Click **"Logs"** tab
3. Look for:
   ```json
   {"level":"INFO","message":"HTTP server started","port":7860}
   {"level":"INFO","message":"Analyze endpoint available"}
   ```

**Test Health Check**:
```bash
curl https://YOUR_USERNAME-visual-adapter-backend.hf.space/health
```

**Expected Response**:
```json
{
  "status": "running",
  "service": "Visual Adapter Backend",
  "version": "3.0",
  "uptime": 42,
  "queueSize": 0
}
```

### Step 6: Update Extension

**Edit `backend-config.js`**:
```javascript
export const BACKEND_CONFIG = {
    local: 'http://localhost:7860',
    production: 'https://YOUR_USERNAME-visual-adapter-backend.hf.space',
    current: 'production'  // ← Change from 'local' to 'production'
};
```

**Reload Extension**:
1. Go to `chrome://extensions`
2. Click reload icon on Visual Adapter
3. Test on any website

---

## Production Configuration

### Backend Environment Variables

**Required**:
```bash
GEMINI_API_KEY=AIzaSy...  # Your Google Gemini API key
```

**Optional** (has defaults):
```bash
FIREBASE_SECRET=pr6IGWkc...  # Firebase database secret
FIREBASE_URL=https://visual-adapter-default-rtdb.firebaseio.com/
PORT=7860  # Server port (Hugging Face default)
```

### Firebase Security Rules

**Current** (Development):
```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

**Recommended** (Production):
```json
{
  "rules": {
    "rules": {
      ".read": true,
      ".write": "auth != null"
    },
    "reports": {
      ".read": "auth != null",
      ".write": "auth != null"
    }
  }
}
```

### CORS Configuration

**Current** (Development):
```javascript
res.setHeader('Access-Control-Allow-Origin', '*');
```

**Recommended** (Production):
```javascript
const ALLOWED_ORIGINS = [
    'chrome-extension://YOUR_EXTENSION_ID'
];
res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0]);
```

---

## Troubleshooting

### Backend Won't Start

**Symptom**: Space shows "Building" forever

**Solutions**:
1. Check Dockerfile syntax
2. Verify `package.json` is valid JSON
3. Check logs for npm install errors
4. Ensure `EXPOSE 7860` is in Dockerfile

### Extension Can't Connect

**Symptom**: "Backend error" in console

**Solutions**:
1. Verify backend URL in `backend-config.js`
2. Check CORS headers in backend
3. Test health endpoint manually
4. Check browser console for CORS errors

### Gemini API Errors

**Symptom**: "GEMINI_API_KEY not set" or 403 errors

**Solutions**:
1. Verify API key is set in Space secrets
2. Check API key is valid (test at https://aistudio.google.com)
3. Ensure API key has Gemini API enabled
4. Check quota limits

### Firebase Connection Issues

**Symptom**: "Firebase PUT failed" errors

**Solutions**:
1. Verify Firebase URL is correct
2. Check Firebase secret is valid
3. Ensure Firebase database exists
4. Check Firebase security rules

### Slow Response Times

**Symptom**: Takes >10 seconds to get rule

**Solutions**:
1. Check Hugging Face Space isn't sleeping
2. Verify Gemini API response time
3. Check network latency
4. Consider upgrading to paid tier for better performance

---

## Monitoring

### Health Checks

**Endpoint**: `GET /health`

**Response**:
```json
{
  "status": "running",
  "uptime": 3600,
  "queueSize": 0,
  "maxConcurrent": 3
}
```

**Monitor**:
- `status` should be "running"
- `uptime` increases over time
- `queueSize` should be 0-2 normally

### Logs

**Hugging Face Spaces**:
1. Go to Space page
2. Click "Logs" tab
3. Monitor for errors

**Log Levels**:
- `INFO` - Normal operation
- `WARN` - Rate limits, timeouts
- `ERROR` - Processing failures
- `SUCCESS` - Rule generated

### Performance Metrics

**Track**:
- Average response time (should be 2-5s)
- Success rate (should be >95%)
- Queue size (should be <3)
- Error rate (should be <5%)

---

## Scaling

### Horizontal Scaling

**Hugging Face Spaces**:
- Free tier: 1 instance
- Paid tier: Multiple instances with load balancing

**Alternative**: Deploy to multiple platforms
- Primary: Hugging Face Spaces
- Fallback: Railway or Render
- Update `backend-config.js` with fallback URLs

### Vertical Scaling

**Upgrade Hugging Face Space**:
- More CPU/RAM for faster processing
- Persistent storage for caching
- Custom domains

---

## Backup & Recovery

### Backup Firebase Data

```bash
# Export rules
curl "https://visual-adapter-default-rtdb.firebaseio.com/rules.json?auth=YOUR_SECRET" > rules_backup.json

# Export reports
curl "https://visual-adapter-default-rtdb.firebaseio.com/reports.json?auth=YOUR_SECRET" > reports_backup.json
```

### Restore Firebase Data

```bash
# Restore rules
curl -X PUT "https://visual-adapter-default-rtdb.firebaseio.com/rules.json?auth=YOUR_SECRET" -d @rules_backup.json
```

### Backend Rollback

```bash
# In Hugging Face Space
git revert HEAD
git push
```

---

## Cost Estimation

### Free Tier (Recommended)

| Service | Cost | Limits |
|---------|------|--------|
| Hugging Face Spaces | $0 | Unlimited |
| Firebase (Spark) | $0 | 1GB storage, 10GB/month transfer |
| Gemini API | $0 | 60 requests/minute |

**Total**: $0/month for moderate usage

### Paid Tier (Optional)

| Service | Cost | Benefits |
|---------|------|----------|
| Hugging Face Pro | $9/month | Better performance, more instances |
| Firebase (Blaze) | Pay-as-you-go | No limits, ~$1-5/month typical |
| Gemini API | Pay-as-you-go | Higher rate limits |

**Total**: ~$10-15/month for heavy usage

---

## Next Steps

1. ✅ Deploy backend to Hugging Face Spaces
2. ✅ Update extension configuration
3. ✅ Test end-to-end
4. ✅ Monitor logs and performance
5. ✅ Set up Firebase security rules (production)
6. ✅ Configure CORS for extension ID (production)

---

**Need Help?**
- [Architecture Documentation](ARCHITECTURE.md)
- [Development Guide](DEVELOPMENT.md)
- [Backend README](../backend/README.md)

---

**Last Updated**: November 21, 2025  
**Status**: Production Ready ✅
