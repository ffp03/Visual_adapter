# Deployment Commands for Hugging Face Spaces

## Step 1: Clone Your Space Repository

```powershell
# Navigate to a temporary directory
cd $env:TEMP

# Clone your Hugging Face Space
git clone https://huggingface.co/spaces/ffpffp/visual-adapter-backend
cd visual-adapter-backend
```

**Note**: You'll be prompted for your Hugging Face credentials:
- Username: `ffpffp`
- Password: Use your Hugging Face **Access Token** (not your password)
  - Get token at: https://huggingface.co/settings/tokens
  - Click "New token" → "Write" access → Copy token

---

## Step 2: Copy Backend Files

```powershell
# Copy all backend files to the Space directory
Copy-Item -Path "h:\My Drive\Study RL\Program\Visual_adapter\backend\*" -Destination . -Recurse -Force

# Rename README for Hugging Face
Move-Item -Path "README_HF.md" -Destination "README.md" -Force
```

---

## Step 3: Verify Files

```powershell
# Check that all required files are present
Get-ChildItem

# You should see:
# - Dockerfile
# - package.json
# - index.js
# - .dockerignore
# - README.md
```

---

## Step 4: Commit and Push

```powershell
# Configure git (if first time)
git config user.name "ffpffp"
git config user.email "your-email@example.com"

# Add all files
git add .

# Commit
git commit -m "Initial deployment - Visual Adapter Backend v3.0"

# Push to Hugging Face
git push
```

**Note**: You'll be prompted for credentials again. Use your Access Token as the password.

---

## Step 5: Verify Deployment

1. Go to https://huggingface.co/spaces/ffpffp/visual-adapter-backend
2. Click **"Logs"** tab
3. Wait for build to complete (2-3 minutes)
4. Look for:
   ```json
   {"level":"INFO","message":"HTTP server started","port":7860}
   {"level":"INFO","message":"Analyze endpoint available"}
   ```

---

## Step 6: Test the Endpoint

```powershell
# Test health check
curl https://ffpffp-visual-adapter-backend.hf.space/health

# Expected response:
# {"status":"running","service":"Visual Adapter Backend","version":"3.0",...}
```

---

## Troubleshooting

### "Authentication failed"
- Make sure you're using your **Access Token**, not your password
- Get token at: https://huggingface.co/settings/tokens

### "GEMINI_API_KEY not set" in logs
- Go to Space Settings → Repository secrets
- Verify `GEMINI_API_KEY` is set correctly

### Build fails
- Check Logs tab for errors
- Verify Dockerfile syntax
- Ensure package.json is valid

---

## Next Steps

After successful deployment:
1. Update `backend-config.js` in extension
2. Change `current: 'production'`
3. Set `production: 'https://ffpffp-visual-adapter-backend.hf.space'`
4. Reload extension and test!

---

**Your Space URL**: https://ffpffp-visual-adapter-backend.hf.space
