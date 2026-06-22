# Visual Adapter - Development Guide

**Version**: 3.0  
**Last Updated**: November 21, 2025

---

## 📋 Table of Contents

1. [Development Setup](#development-setup)
2. [Testing Strategy](#testing-strategy)
3. [Debugging](#debugging)
4. [Best Practices](#best-practices)
5. [Common Issues](#common-issues)
6. [Contributing](#contributing)

---

## Development Setup

### Prerequisites

- **Node.js** 18+ (for backend)
- **Chrome** (latest version)
- **Git** (for version control)
- **Google Gemini API Key** ([Get one here](https://aistudio.google.com))
- **Firebase Project** (optional, has defaults)

### Initial Setup

```bash
# 1. Clone repository
git clone <your-repo-url>
cd Visual_adapter

# 2. Install backend dependencies
cd backend
npm install

# 3. Create .env file
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY

# 4. Start backend
node index.js
```

### Extension Setup

1. Open Chrome → `chrome://extensions`
2. Enable **"Developer mode"** (top right)
3. Click **"Load unpacked"**
4. Select the `Visual_adapter` directory
5. Extension should appear in toolbar

---

## Testing Strategy

### Manual Testing Checklist

**Backend**:
- [ ] Health check responds (`curl http://localhost:7860/health`)
- [ ] Analyze endpoint works (test with sample HTML)
- [ ] Environment variables loaded correctly
- [ ] Logs are structured JSON
- [ ] Graceful shutdown works (Ctrl+C)

**Extension**:
- [ ] Side panel opens on click
- [ ] Content extracts on first visit
- [ ] Cached rules load instantly on repeat visit
- [ ] Theme switching works
- [ ] Font size adjustment works
- [ ] Debug console shows logs

**Integration**:
- [ ] Extension → Backend communication works
- [ ] Backend → Firebase saves rules
- [ ] Extension → Firebase retrieves rules
- [ ] Error handling works (backend offline)
- [ ] Rate limiting prevents overload

### Automated Testing

**Backend Tests** (Future):
```bash
cd backend
npm test
```

**Extension Tests** (Future):
```bash
npm run test:extension
```

### Test Websites

**Good for testing**:
- https://www.bbc.com/news (complex layout)
- https://www.nytimes.com (paywall, ads)
- https://medium.com (dynamic content)
- https://www.wikipedia.org (simple, clean)

**Edge cases**:
- Single-page apps (React/Vue)
- Infinite scroll pages
- Video-heavy pages
- Login-required pages

---

## Debugging

### Backend Debugging

**Enable Verbose Logging**:
```javascript
// In backend/index.js
const DEBUG = true;

if (DEBUG) {
    log('DEBUG', 'Detailed info', { data });
}
```

**Check Logs**:
```bash
# Local
node index.js | jq .  # Pretty-print JSON logs

# Hugging Face Spaces
# Go to Space → Logs tab
```

**Common Log Patterns**:
```json
// Success
{"level":"SUCCESS","message":"Rule generated","hostname":"example.com"}

// Error
{"level":"ERROR","message":"Processing failed","error":"..."}

// Warning
{"level":"WARN","message":"Rate limit reached","queueSize":3}
```

### Extension Debugging

**Console Logs**:
1. Right-click extension icon → **"Inspect"**
2. Opens DevTools for background script
3. Check Console tab for logs

**Content Script Logs**:
1. Open side panel
2. Right-click in panel → **"Inspect"**
3. Check Console tab

**Network Requests**:
1. Open DevTools (F12)
2. Go to Network tab
3. Filter by "analyze" to see backend requests

**Storage Inspection**:
```javascript
// In console
chrome.storage.sync.get(null, (data) => console.log(data));
```

### Firebase Debugging

**View Data**:
```bash
# Get all rules
curl "https://visual-adapter-default-rtdb.firebaseio.com/rules.json?auth=YOUR_SECRET"

# Get specific rule
curl "https://visual-adapter-default-rtdb.firebaseio.com/rules/example-com.json?auth=YOUR_SECRET"
```

**Clear Data**:
```bash
# Delete all rules (careful!)
curl -X DELETE "https://visual-adapter-default-rtdb.firebaseio.com/rules.json?auth=YOUR_SECRET"
```

---

## Best Practices

### Code Style

**JavaScript**:
- Use ES6+ features (arrow functions, async/await)
- Prefer `const` over `let`, never `var`
- Use template literals for strings
- Add JSDoc comments for functions

**Example**:
```javascript
/**
 * Process HTML and generate extraction rule
 * @param {string} hostname - Website hostname
 * @param {string} html - HTML content
 * @returns {Promise<Object>} Generated rule
 */
async function processHTML(hostname, html) {
    // Implementation
}
```

### Error Handling

**Always handle errors**:
```javascript
try {
    const result = await riskyOperation();
} catch (error) {
    log('ERROR', 'Operation failed', { 
        error: error.message,
        stack: error.stack 
    });
    // Provide fallback
}
```

### Logging

**Use structured logging**:
```javascript
// ✅ Good
log('INFO', 'Processing request', { hostname, htmlLength: html.length });

// ❌ Bad
console.log('Processing request for ' + hostname);
```

### Performance

**Optimize HTML processing**:
```javascript
// Truncate HTML before sending to AI
const htmlContext = html.substring(0, 30000);  // 30KB max
```

**Cache aggressively**:
```javascript
// Check cache first
const cached = await getFromCache(key);
if (cached) return cached;

// Only compute if not cached
const result = await expensiveOperation();
await saveToCache(key, result);
```

---

## Common Issues

### Issue: "GEMINI_API_KEY not set"

**Cause**: Environment variable not loaded

**Solution**:
```bash
# Check .env file exists
cat backend/.env

# Verify key is set
echo $env:GEMINI_API_KEY  # Windows PowerShell
echo $GEMINI_API_KEY      # Linux/Mac

# Set manually if needed
$env:GEMINI_API_KEY="your_key_here"
```

### Issue: Extension shows "Disconnected"

**Cause**: Content script not injected

**Solution**:
1. Reload extension (`chrome://extensions`)
2. Refresh the webpage
3. Check console for injection errors

### Issue: "Failed to fetch" from backend

**Cause**: CORS or backend not running

**Solution**:
```bash
# 1. Check backend is running
curl http://localhost:7860/health

# 2. Check CORS headers
curl -H "Origin: chrome-extension://abc123" http://localhost:7860/health

# 3. Verify backend URL in backend-config.js
```

### Issue: Slow AI responses

**Cause**: Large HTML payload or Gemini API latency

**Solution**:
- Reduce HTML context size (currently 30KB)
- Check Gemini API status
- Consider caching more aggressively

### Issue: Rules not applying correctly

**Cause**: CSS selectors don't match page structure

**Solution**:
1. Inspect page HTML structure
2. Test selectors in browser console:
   ```javascript
   document.querySelector('.article-body')
   ```
3. Report bad rule (triggers re-analysis)

---

## Contributing

### Development Workflow

1. **Create feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make changes**:
   - Write code
   - Test thoroughly
   - Add documentation

3. **Commit**:
   ```bash
   git add .
   git commit -m "feat: Add your feature description"
   ```

4. **Push and create PR**:
   ```bash
   git push origin feature/your-feature-name
   ```

### Commit Message Format

```
<type>: <description>

[optional body]
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance tasks

**Examples**:
```
feat: Add rate limiting to backend
fix: Resolve CORS issue with extension
docs: Update deployment guide
refactor: Simplify rule caching logic
```

### Code Review Checklist

- [ ] Code follows style guide
- [ ] All tests pass
- [ ] Documentation updated
- [ ] No console.log (use structured logging)
- [ ] Error handling added
- [ ] Performance considered

---

## Lessons Learned

### Architecture Patterns

**Side Panel Reader Pattern**:
- Use side panel instead of popup for better UX
- Persistent state across page navigation
- More screen real estate

**Self-Healing Connection**:
- Auto-inject content script if disconnected
- Graceful degradation to heuristic extraction
- User-friendly error messages

**Centralized Backend**:
- Share rules across all users
- Easier updates and improvements
- No per-user API key management

### Chrome Extension Best Practices

**Manifest V3**:
- Use service workers (not background pages)
- Declare all permissions upfront
- Use `chrome.scripting` for dynamic injection

**Message Passing**:
- Always return `true` for async handlers
- Use `sendResponse` callback
- Handle disconnection gracefully

**Storage**:
- Use `chrome.storage.sync` for user preferences
- Use Firebase for shared data
- Don't store large data in chrome.storage

### Firebase Tips

**REST API vs SDK**:
- REST API: Simpler, no dependencies
- SDK: More features, better error handling
- We use REST for simplicity

**Security**:
- Never expose secrets in client code (production)
- Use Firebase Authentication for production
- Implement security rules

### AI Prompt Engineering

**Effective Prompts**:
- Be specific about output format (JSON)
- Provide clear rules and constraints
- Include examples of good/bad outputs
- Iterate based on results

**Our Prompt Evolution**:
1. V1: "Extract main content" (too vague)
2. V2: "Find article selector" (better)
3. V3: "Return JSON with main, exclude, name" (best)

---

## Tools & Resources

### Development Tools

- **Chrome DevTools** - Debugging extension
- **Postman** - Testing backend API
- **jq** - Pretty-print JSON logs
- **curl** - Testing HTTP endpoints

### Documentation

- [Chrome Extension Docs](https://developer.chrome.com/docs/extensions/)
- [Firebase REST API](https://firebase.google.com/docs/reference/rest/database)
- [Gemini API Docs](https://ai.google.dev/docs)
- [Node.js Docs](https://nodejs.org/docs)

### Community

- [Chrome Extension Discord](https://discord.gg/chrome-extensions)
- [Firebase Community](https://firebase.google.com/community)
- [Stack Overflow](https://stackoverflow.com/questions/tagged/chrome-extension)

---

## Next Steps

1. ✅ Set up development environment
2. ✅ Run tests locally
3. ✅ Make your first contribution
4. ✅ Deploy to production
5. ✅ Monitor and iterate

---

**Need Help?**
- [Architecture Documentation](ARCHITECTURE.md)
- [Deployment Guide](DEPLOYMENT.md)
- [Backend README](../backend/README.md)

---

**Last Updated**: November 21, 2025  
**Maintained By**: Visual Adapter Team
