# Chrome Extension Development: Lessons Learned & Best Practices

**Date:** November 19, 2025
**Project:** Visual Adapter (Low Vision Accessibility)

## 1. Architecture & Design Patterns

### The "Side Panel Reader" Pattern
**Lesson:** Modifying the DOM of arbitrary webpages is fraught with edge cases (CSP headers, complex layouts, shadow DOMs).
**Best Practice:** Instead of fighting the page's CSS, **extract the content** and render it in your own controlled environment (Side Panel).
*   **Pros:** Complete control over styling, no style leakage, works on almost any page.
*   **Cons:** Requires robust content extraction logic.

### The "Self-Healing" Connection
**Problem:** `content.js` often disconnects or isn't injected if the extension reloads but the page doesn't.
**Solution:** Implement a "lazy injection" pattern in your UI script (Side Panel / Popup).
```javascript
try {
    sendMessageToTab();
} catch (error) {
    if (error.message.includes("Receiving end does not exist")) {
        // Inject script programmatically
        await chrome.scripting.executeScript({ files: ['content.js'] });
        retryMessage();
    }
}
```
**Generalization:** Never assume your content script is alive. Always handle the "disconnected" state gracefully.

## 2. Debugging & Visibility

### The "On-Screen" Console
**Lesson:** `console.log` in extensions is scattered across 3 different DevTools windows (Background, Side Panel, Content Script). It's easy to miss errors.
**Best Practice:** Build a simple, visual **Debug Console** directly into your extension's UI (e.g., a `<div id="debug">` at the bottom of the panel).
*   **Why:** Users can screenshot it for you. You see the exact sequence of events immediately.

## 3. Testing Strategy (Minimizing Manual Effort)

### Automated "Skeleton" Testing
**Challenge:** Testing LLM prompts on real websites is slow and expensive.
**Strategy:**
1.  **Download Samples:** Save `.mhtml` or `.html` versions of 5-10 representative pages (News, E-commerce, Blog).
2.  **Offline Extraction:** Write a Node.js script that runs your `extractContent()` logic against these files locally.
3.  **Verify Output:** Check if the extracted HTML is clean *before* sending it to the LLM.

### The "Mock" Environment
**Challenge:** Testing UI logic (Side Panel) requires reloading the extension constantly.
**Strategy:** Create a `mock_chrome.js` file that simulates `chrome.tabs`, `chrome.runtime`, and `chrome.storage`.
*   **Usage:** Load your `sidepanel.html` in a regular browser tab with the mock script.
*   **Benefit:** iterate on UI/CSS changes instantly without reloading the extension.

## 4. CSS & Theming

### Specificity & Isolation
**Lesson:** Even in a Side Panel, browser defaults or inherited styles can interfere.
**Best Practice:**
*   Use **CSS Variables** for all theme colors (`--bg-color`, `--text-color`).
*   Use `!important` on your "Reader View" container to force user preferences over any injected HTML styles.
*   **Structure:** Define themes as classes on `<body>` (`body.theme-sepia`) to easily switch global variables.

## 5. Deployment & Versioning

### "Stable Backup" Workflow
**Lesson:** Rapid iteration often breaks working features.
**Best Practice:** Before a major refactor (e.g., changing from CSS Injection to Reader Mode), create a named backup folder (e.g., `v1_stable_backup`).
*   **Include:** A `README.md` in the backup explaining exactly what works in that version.
