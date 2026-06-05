# 📥 Social Bookmarks Exporter

A free Chrome extension to export your LinkedIn saved posts and Twitter/X bookmarks to Excel, CSV, or JSON. 

**No paid tools. No subscriptions. Your data stays on your machine.**

---

## ✨ Features

- 🔗 **LinkedIn Saved Posts** — exports author, content, URL, date, reactions, comments
- 🐦 **Twitter/X Bookmarks** — exports author, handle, content, URL, date, replies, retweets, likes, views, media type
- 📊 Export formats: **Excel (.xlsx)**, **CSV**, **JSON**
- 🚀 Handles **7500+ posts** with patient auto-scrolling
- 🛡️ Rate-limit aware — random delays + breathing pauses
- 🔑 Deduplication — no double-counting posts
- 💻 100% local — no data sent anywhere

---

## 🛠️ Installation (Developer Mode)

Since this isn't on the Chrome Web Store, load it as an unpacked extension:

1. Open Chrome and go to: `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **"Load unpacked"**
4. Select the `social-bookmarks-exporter` folder
5. The extension icon appears in your toolbar! 🎉

---

## 📖 How to Use

### LinkedIn Saved Posts

1. Go to [LinkedIn Saved Posts](https://www.linkedin.com/my-items/saved-posts/)
2. Click the extension icon in your toolbar
3. Choose your export format (Excel/CSV/JSON)
4. Click **"Export LinkedIn Saved Posts"**
5. Wait while it scrolls through all your posts (7500+ takes ~20-30 minutes)
6. File downloads automatically when done!

### Twitter/X Bookmarks

1. Go to [Twitter Bookmarks](https://x.com/i/bookmarks)
2. Click the extension icon in your toolbar
3. Choose your export format
4. Click **"Export Twitter Bookmarks"**
5. Wait for the scroll + collection
6. File downloads automatically!

---

## ⏱️ Expected Times for Large Collections

| Posts Count | Estimated Time |
|-------------|---------------|
| 100         | ~2 minutes    |
| 500         | ~8 minutes    |
| 1000        | ~15 minutes   |
| 5000        | ~45 minutes   |
| 7500+       | ~60-90 minutes |

> **Tip:** Don't close the tab or switch away while it's running. You can minimize the browser window though.

---

## ⚠️ Important Notes

- **You must be logged in** to LinkedIn/Twitter for this to work
- **Keep the tab active** during export — the extension scrolls the page
- **LinkedIn may show "ghost" posts** — if they were deleted by the author, they'll appear with minimal info
- **Twitter may rate-limit** — the extension pauses automatically, but very large collections might need a retry
- If export seems stuck, refresh the page and try again

---

## 🔧 Troubleshooting

| Issue | Fix |
|-------|-----|
| "No posts found" | Make sure you're on the correct page and posts are visible |
| Export stops early | LinkedIn/Twitter may have rate-limited. Wait 5 minutes and retry |
| Extension not showing | Check chrome://extensions — make sure it's enabled |
| Content script errors | Refresh the target page, then try the export again |

---

## 🏗️ Project Structure

```
social-bookmarks-exporter/
├── manifest.json          # Extension config
├── popup/
│   ├── popup.html        # Extension popup UI
│   └── popup.js          # Popup controller
├── content/
│   ├── linkedin.js       # LinkedIn scraper + exporter
│   └── twitter.js        # Twitter scraper + exporter
├── background/
│   └── service-worker.js # Background worker
├── libs/
│   └── xlsx.mini.min.js  # SheetJS for Excel export
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

---

## 📝 License

MIT — Do whatever you want with it. Built with ❤️ to avoid paying for simple export tools.
