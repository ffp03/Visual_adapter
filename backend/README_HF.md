---
title: Visual Adapter Backend
emoji: 🔍
colorFrom: blue
colorTo: purple
sdk: docker
pinned: false
---

# Visual Adapter Backend

AI-powered backend server for Visual Adapter Chrome extension. Processes HTML content using Google Gemini AI to generate CSS extraction rules.

## Features

- 🤖 Google Gemini 2.5 Flash AI integration
- ⚡ Direct HTTP API (no polling)
- 🔒 Rate limiting (max 3 concurrent)
- 📊 Structured JSON logging
- 🔄 Graceful shutdown handling

## API Endpoints

- `GET /health` - Health check
- `GET /version` - Version info
- `POST /analyze` - Process HTML and generate rule

## Environment Variables

Required:
- `GEMINI_API_KEY` - Your Google Gemini API key

Optional (has defaults):
- `FIREBASE_SECRET` - Firebase database secret
- `FIREBASE_URL` - Firebase database URL

## Documentation

- [Full Documentation](https://github.com/your-repo/Visual_adapter)
- [Architecture Guide](https://github.com/your-repo/Visual_adapter/docs/ARCHITECTURE.md)
- [Deployment Guide](https://github.com/your-repo/Visual_adapter/docs/DEPLOYMENT.md)

## Version

3.0 - Cloud-based architecture with direct HTTP communication
