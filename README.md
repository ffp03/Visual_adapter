# Visual Adapter

AI-powered Chrome extension that transforms complex web pages into clean, accessible reading experiences for low-vision users.

[![Version](https://img.shields.io/badge/version-3.0-blue.svg)](https://github.com/your-repo)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

---

## ✨ Features

- 🤖 **AI-Powered Extraction** - Google Gemini analyzes page structure
- ⚡ **Instant Loading** - Cached rules load in <0.5s
- 🎨 **High-Contrast Themes** - 6 accessibility-focused themes
- 📝 **Customizable Typography** - Adjust font size and family
- 🌐 **Universal Compatibility** - Works on any website
- 🔄 **Shared Learning** - Rules shared across all users

---

## 🚀 Quick Start

### For Users

1. **Install Extension**:
   - Download from Chrome Web Store (coming soon)
   - Or load unpacked: `chrome://extensions` → Load unpacked → Select folder

2. **Use Extension**:
   - Click extension icon to open side panel
   - Content extracts automatically
   - Adjust theme and font size in settings

### For Developers

```bash
# 1. Start backend
cd backend
npm install
export GEMINI_API_KEY="your_key"
node index.js

# 2. Load extension
# Chrome → chrome://extensions → Load unpacked → Select Visual_adapter folder

# 3. Test
# Visit any website and click extension icon
```

---

## 📚 Documentation

- **[Architecture](docs/ARCHITECTURE.md)** - System design and data flow
- **[Deployment](docs/DEPLOYMENT.md)** - Deploy to Hugging Face Spaces
- **[Development](docs/DEVELOPMENT.md)** - Development setup and testing
- **[Backend README](backend/README.md)** - Backend API documentation

---

## 🏗️ Architecture

```
Chrome Extension → Firebase (check cache) → Backend Server → Gemini AI
                                                    ↓
                                            Save rule to Firebase
```

**V3.0 Highlights**:
- Direct HTTP communication (no polling)
- Centralized backend on Hugging Face Spaces
- Shared rule caching via Firebase
- 50-70% faster than V2.4

---

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| **Frontend** | Chrome Extension (Manifest V3) |
| **Backend** | Node.js 18 |
| **Database** | Firebase Realtime Database |
| **AI Model** | Google Gemini 2.5 Flash |
| **Hosting** | Hugging Face Spaces (free) |

---

## 📊 Performance

| Metric | V2.4 | V3.0 | Improvement |
|--------|------|------|-------------|
| First Visit | 3-8s | 2-5s | 40% faster |
| Repeat Visit | 1-2s | <0.5s | 75% faster |
| Rule Sharing | No | Yes | ∞ |

---

## 🤝 Contributing

We welcome contributions! See [Development Guide](docs/DEVELOPMENT.md) for:
- Development setup
- Code style guidelines
- Testing procedures
- Commit message format

---

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 🔗 Links

- [Chrome Web Store](#) (coming soon)
- [Documentation](docs/)
- [Issue Tracker](#)
- [Changelog](CHANGELOG.md)

---

## 📧 Contact

- **Project Maintainer**: [Your Name]
- **Email**: your.email@example.com
- **Issues**: [GitHub Issues](#)

---

**Version**: 3.0  
**Last Updated**: November 21, 2025  
**Status**: Production Ready ✅
