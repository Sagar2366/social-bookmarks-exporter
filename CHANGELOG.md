# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2026-06-06

### Added
- **Profile Posts Exporter** — export all posts from any LinkedIn or Twitter profile
- **LinkedMash Integration** — export all saved posts via linkedmash.com (bypasses LinkedIn's ~1600 post limit)
- Tab pause/resume — scraping pauses when you switch tabs, resumes when you return
- Auto-save to localStorage every 100-200 posts (crash recovery)
- Stop & Export Now button — export whatever's been collected so far
- Recover Last Backup button — retrieve data from last auto-save

### Fixed
- LinkedIn scroll detection (uses programmatic injection for SPA)
- "Status is offline" appearing as author name
- Posts being merged into single row (post boundary detection)
- Content extraction grabbing profile info instead of post text

## [1.0.0] - 2026-06-05

### Added
- LinkedIn Saved Posts export (Excel/CSV/JSON)
- Twitter/X Bookmarks export (Excel/CSV/JSON)
- Auto-scrolling with rate-limit awareness
- Deduplication by post ID/URL
- Dark-themed popup UI
