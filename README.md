# 📥 Social Bookmarks Exporter

A free, open-source Chrome extension to export your saved posts and bookmarks from LinkedIn, Twitter/X, and LinkedMash — to Excel, CSV, or JSON.

**No paid tools. No subscriptions. No data sent anywhere. 100% local.**

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green?logo=googlechrome)
![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-1.1.0-purple)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔵 **LinkedIn Saved Posts** | Export your saved posts from LinkedIn |
| 🟢 **LinkedMash Export** | Export ALL saved posts via [linkedmash.com](https://linkedmash.com) (bypasses LinkedIn's ~1600 post limit) |
| 🔵 **Twitter/X Bookmarks** | Export your bookmarked tweets |
| 🟣 **Profile Posts** | Go to anyone's LinkedIn or Twitter profile → export all their posts |

### For each feature:
- 📊 Export as **Excel (.xlsx)**, **CSV**, or **JSON**
- ⏹️ **Stop & Export** — grab whatever's been collected so far
- 🔄 **Auto-backup** — saves progress every 100-200 posts to localStorage
- 🔄 **Recover** — retrieve data from last auto-save if anything goes wrong
- ⏸️ **Tab-switch safe** — pauses when you switch tabs, resumes when you return
- 🚫 **No post limit** — scrolls until there's nothing left

---

## 🛠️ Installation

Since this isn't on the Chrome Web Store, load it as an unpacked extension:

1. **Download** — Clone or download this repo:
   ```bash
   git clone https://github.com/Sagar2366/social-bookmarks-exporter.git
   ```
2. Open Chrome → go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right corner)
4. Click **"Load unpacked"**
5. Select the `social-bookmarks-exporter` folder
6. The extension icon appears in your toolbar! 🎉

---

## 📖 Usage

### LinkedIn Saved Posts
1. Go to [linkedin.com/my-items/saved-posts](https://www.linkedin.com/my-items/saved-posts/)
2. Click extension icon → choose format → **Export LinkedIn Saved Posts**

### LinkedMash (Recommended for large collections)
> LinkedIn limits scrolling to ~1600 posts. Use LinkedMash to get ALL of them.

1. Log in to [linkedmash.com/explore](https://www.linkedmash.com/explore)
2. Click extension icon → choose format → **Export from LinkedMash**

### Twitter/X Bookmarks
1. Go to [x.com/i/bookmarks](https://x.com/i/bookmarks)
2. Click extension icon → choose format → **Export Twitter Bookmarks**

### Profile Posts (any user)
1. Go to any LinkedIn profile (e.g. `linkedin.com/in/someone`) or Twitter profile (e.g. `x.com/someone`)
2. Click extension icon → choose format → **Export Profile Posts**
3. Auto-detects which platform you're on

---

## ⏱️ Expected Times

| Posts Count | Estimated Time |
|-------------|---------------|
| 100         | ~2 minutes    |
| 500         | ~8 minutes    |
| 1,000       | ~15 minutes   |
| 5,000       | ~45 minutes   |
| 7,500+      | ~60-90 minutes |

> **Tip:** You can switch to other tabs while it runs — it pauses and resumes automatically. Just don't close the tab being scraped.

---

## 🔒 Privacy & Data

- **100% local** — all processing happens in your browser
- **No external servers** — nothing is sent anywhere
- **No analytics** — no tracking, no telemetry
- **No storage beyond localStorage** — auto-backup is stored in your browser's localStorage for crash recovery only
- **Open source** — inspect every line of code yourself

---

## 🏗️ Project Structure

```
social-bookmarks-exporter/
├── manifest.json              # Extension configuration
├── popup/
│   ├── popup.html            # Extension popup UI
│   └── popup.js              # Popup controller + injection logic
├── content/
│   ├── linkedin.js           # LinkedIn saved posts scraper
│   ├── twitter.js            # Twitter/X bookmarks scraper
│   ├── linkedinmash.js       # LinkedMash scraper
│   ├── profile-linkedin.js   # LinkedIn profile posts scraper
│   └── profile-twitter.js    # Twitter profile posts scraper
├── background/
│   └── service-worker.js     # Background message relay
├── libs/
│   └── xlsx.mini.min.js      # SheetJS library (Excel export)
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── LICENSE                    # MIT License
├── CONTRIBUTING.md            # Contribution guidelines
├── CHANGELOG.md               # Version history
└── README.md
```

---

## ⚠️ Known Limitations

- **LinkedIn limits saved posts to ~1600** when scrolling natively. Use LinkedMash integration to get all posts.
- **Sites change their DOM frequently** — if the extension stops extracting content correctly, selectors may need updating. PRs welcome!
- **Rate limiting** — LinkedIn and Twitter may slow down loading if you scroll too fast. The extension has built-in delays to avoid this.
- **"See more" expansion** — the extension clicks "see more" buttons to get full post text, but some may be missed on very fast scrolls.

---

## 🔧 Troubleshooting

| Issue | Fix |
|-------|-----|
| "No posts found" | Make sure you're on the correct page and posts are visible |
| Export stops early | Site may have rate-limited. Wait 5 minutes and retry |
| Extension not showing | Check `chrome://extensions` — make sure it's enabled |
| Wrong content/author | Sites changed their DOM. Open an issue with a screenshot |
| Tab switch kills it | Pull latest version — this is fixed with pause/resume |

---

## 🤝 Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Common contributions:
- Fixing selectors when LinkedIn/Twitter changes their DOM
- Adding support for new platforms
- Improving content extraction accuracy

---

## 📝 License

[MIT](LICENSE) — Do whatever you want with it.

---

## 🙏 Acknowledgments

- [SheetJS](https://sheetjs.com/) — Excel file generation
- [LinkedMash](https://linkedmash.com) — Access to full LinkedIn saved posts collection
