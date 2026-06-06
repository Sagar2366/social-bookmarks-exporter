# Contributing to Social Bookmarks Exporter

Thanks for your interest in contributing! This project is open to everyone.

## How to Contribute

### Reporting Bugs

1. Open an [Issue](../../issues) with:
   - What you expected to happen
   - What actually happened
   - Screenshot of the page (helps a lot since sites change their DOM frequently)
   - Browser version

### Fixing DOM Selectors

LinkedIn and Twitter/X change their HTML structure frequently. If the extension stops working:

1. Open DevTools on the page (Right-click → Inspect)
2. Find the correct selector for the broken element
3. Update the relevant content script in `content/`
4. Submit a PR with before/after screenshots

### Adding New Platforms

Want to add support for another platform? Follow the existing pattern:

1. Create `content/your-platform.js` (copy `content/linkedinmash.js` as a template)
2. Add the host permission to `manifest.json`
3. Add a card to `popup/popup.html`
4. Add the injection + messaging logic to `popup/popup.js`

### Code Style

- Plain JavaScript (no TypeScript, no build step)
- IIFEs for content scripts to avoid global pollution
- Graceful error handling (try/catch, `.catch(() => {})`)
- Patient scrolling with random delays

## Development Setup

1. Clone the repo
2. Go to `chrome://extensions/`
3. Enable Developer mode
4. Click "Load unpacked" → select this folder
5. Make changes → click the refresh icon on the extension card

No build tools, no npm, no bundler. Just edit and reload.

## Pull Request Process

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/new-platform`)
3. Make your changes
4. Test with the extension loaded in Chrome
5. Submit a PR describing what you changed and why
