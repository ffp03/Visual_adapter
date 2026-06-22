# Frontend Testing Guide

## ✅ Step 1: Backend is Running

The backend is now running and polling Firebase every 5 seconds for new requests.

---

## 📋 Step 2: Load Extension in Chrome

1. **Open Chrome** and navigate to:
   ```
   chrome://extensions/
   ```

2. **Enable Developer Mode**:
   - Toggle the switch in the top-right corner

3. **Load the Extension**:
   - Click "Load unpacked"
   - Navigate to and select:
     ```
     H:\My Drive\Study RL\Program\Visual_adapter
     ```

4. **Verify**:
   - You should see "Visual Adapter for Low Vision" in the extensions list
   - The extension icon should appear in your toolbar

---

## 🧪 Step 3: Test on a Real Webpage

> [!IMPORTANT]
> **Do NOT test on local files** - the backend cannot fetch them due to CORS. Use a live website instead.

### Recommended Test Sites:
- https://www.bbc.com/news (news article)
- https://www.nytimes.com (article)
- https://en.wikipedia.org/wiki/Chrome_extension (Wikipedia)

### Testing Steps:

1. **Navigate to a test site** (e.g., BBC News article)

2. **Open the Side Panel**:
   - Click the Visual Adapter extension icon in the toolbar

3. **Observe the Flow**:
   - **Initial**: You should see content extracted using heuristic fallback
   - **Backend Processing**: Check the backend console (should show "Processing request for...")
   - **Auto-Update**: Within 10-30 seconds, the side panel should refresh with AI-extracted content

4. **Verify Caching**:
   - Refresh the page
   - Open the side panel again
   - Content should appear **instantly** (using cached rule)

---

## 🔍 Verification Checklist

### Backend Console
Look for these messages:
```
✅ Processing request for: [hostname]
✅ API Key Length: 39
✅ Gemini Response: {...}
✅ Generated rule for [hostname]: {...}
```

### Browser Console (F12)
Look for these messages:
```
✅ Background: No rule for [hostname]. Requesting analysis...
✅ Background: Started listening for [hostname]...
✅ Background: Received rule update for [hostname]
```

### Firebase Database
Visit: https://console.firebase.google.com/

Check:
- `requests/[hostname_sanitized]` → status: "completed"
- `rules/[hostname_sanitized]` → contains the rule

---

## ❓ Troubleshooting

**Issue**: Side panel doesn't open
- **Fix**: Refresh the page and try again

**Issue**: Backend not processing
- **Fix**: Check backend console for errors, ensure API key is set

**Issue**: Content doesn't update
- **Fix**: Check browser console for errors, verify Firebase connection

**Issue**: "No content extracted"
- **Fix**: Try a different website (some sites block scraping)

---

## 📝 What to Report Back

After testing, please share:
1. ✅ or ❌ Extension loaded successfully
2. ✅ or ❌ Side panel opened
3. ✅ or ❌ Backend processed request
4. ✅ or ❌ Content updated automatically
5. Any error messages from console
