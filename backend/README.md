# Visual Adapter Backend

Node.js backend server for Visual Adapter Chrome extension. Processes HTML content using Google Gemini AI to generate CSS extraction rules.

---

## Quick Start

```bash
# Install dependencies
npm install

# Set environment variable
export GEMINI_API_KEY="your_api_key_here"  # Linux/Mac
$env:GEMINI_API_KEY="your_api_key_here"    # Windows PowerShell

# Start server
node index.js
```

Server starts on port **7860** (Hugging Face Spaces default).

---

## API Endpoints

### GET /health
Health check endpoint.

**Response**:
```json
{
  "status": "running",
  "service": "Visual Adapter Backend",
  "version": "3.0",
  "uptime": 42,
  "queueSize": 0,
  "maxConcurrent": 3
}
```

### GET /version
Version information.

**Response**:
```json
{
  "version": "3.0.0",
  "node": "v18.17.0",
  "uptime": 42
}
```

### POST /analyze
Process HTML and generate extraction rule.

**Request**:
```json
{
  "hostname": "example.com",
  "html": "<html>...</html>"
}
```

**Response**:
```json
{
  "success": true,
  "rule": {
    "main": "article",
    "exclude": [".ad", ".sidebar"],
    "name": "Article"
  },
  "source": "generated"
}
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | ✅ Yes | - | Google Gemini API key |
| `FIREBASE_SECRET` | ⚠️ Optional | (has default) | Firebase database secret |
| `FIREBASE_URL` | ⚠️ Optional | (has default) | Firebase database URL |
| `PORT` | ⚠️ Optional | 7860 | Server port |

---

## Features

- ✅ **Direct HTTP API** - No polling, instant responses
- ✅ **Rate Limiting** - Max 3 concurrent requests
- ✅ **CORS Support** - Works with Chrome extensions
- ✅ **Structured Logging** - JSON logs for easy parsing
- ✅ **Graceful Shutdown** - Clean SIGTERM/SIGINT handling
- ✅ **Payload Limits** - 10MB max to prevent abuse

---

## Deployment

### Hugging Face Spaces (Recommended)

1. Create new Space with Docker SDK
2. Push this directory to the Space
3. Set `GEMINI_API_KEY` in Space secrets
4. Space auto-deploys on git push

See [Deployment Guide](../docs/DEPLOYMENT.md) for details.

### Other Platforms

Works on any platform supporting Docker:
- Railway
- Render
- Google Cloud Run
- Fly.io

---

## Development

```bash
# Run with auto-reload (install nodemon first)
npm install -g nodemon
nodemon index.js

# Test endpoints
curl http://localhost:7860/health
curl -X POST http://localhost:7860/analyze \
  -H "Content-Type: application/json" \
  -d '{"hostname":"test.com","html":"<html><body>Test</body></html>"}'
```

---

## Architecture

```
HTTP Request → Server → Gemini AI → Firebase → HTTP Response
                ↓
         Rate Limiting
         Error Handling
         Logging
```

**Flow**:
1. Receive POST /analyze with HTML
2. Check rate limits
3. Process HTML with Gemini AI
4. Save rule to Firebase
5. Return rule to client

---

## Monitoring

**Logs** (JSON format):
```json
{"timestamp":"2025-11-21T...","level":"INFO","message":"HTTP server started"}
{"timestamp":"2025-11-21T...","level":"SUCCESS","message":"Rule generated"}
{"timestamp":"2025-11-21T...","level":"ERROR","message":"Processing failed"}
```

**Metrics to track**:
- Response time (should be 2-5s)
- Success rate (should be >95%)
- Queue size (should be 0-2)
- Error rate (should be <5%)

---

## Troubleshooting

**"GEMINI_API_KEY not set"**:
- Check environment variable is set
- Verify .env file exists (local) or secret is set (Hugging Face)

**"Firebase PUT failed"**:
- Check FIREBASE_URL is correct
- Verify FIREBASE_SECRET is valid

**Slow responses**:
- Check Gemini API status
- Reduce HTML context size
- Verify network latency

---

## Documentation

- [Architecture](../docs/ARCHITECTURE.md)
- [Deployment Guide](../docs/DEPLOYMENT.md)
- [Development Guide](../docs/DEVELOPMENT.md)

---

**Version**: 3.0  
**Last Updated**: November 21, 2025
