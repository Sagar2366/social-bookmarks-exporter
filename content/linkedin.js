// LinkedIn Saved Posts Content Script
// Designed to handle 7500+ saved posts with patient scrolling

(function() {
  'use strict';

  let isRunning = false;
  let stopRequested = false;

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'exportLinkedIn' && !isRunning) {
      isRunning = true;
      stopRequested = false;
      exportLinkedInPosts(msg.format);
    } else if (msg.action === 'stopLinkedIn') {
      stopRequested = true;
    } else if (msg.action === 'recoverLinkedIn') {
      recoverAndExport(msg.format);
    }
  });

  function notify(type, text, count) {
    try {
      chrome.runtime.sendMessage({ source: 'linkedin', type, text, count }).catch(() => {});
    } catch (e) { /* popup closed, keep running */ }
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function findScrollContainer() {
    // LinkedIn uses a custom scroll container, NOT window scroll
    const candidates = [
      document.querySelector('.scaffold-layout__main'),
      document.querySelector('.scaffold-layout__content'),
      document.querySelector('main.scaffold-layout__main'),
      document.querySelector('[role="main"]'),
      // Fallback: find the tallest scrollable div
      ...Array.from(document.querySelectorAll('div')).filter(el => {
        const style = window.getComputedStyle(el);
        return (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
               el.scrollHeight > el.clientHeight &&
               el.clientHeight > 300;
      }).sort((a, b) => b.scrollHeight - a.scrollHeight)
    ];

    for (const el of candidates) {
      if (el && el.scrollHeight > el.clientHeight) {
        return el;
      }
    }
    return document.documentElement;
  }

  // Click all "see more" buttons to expand truncated posts
  async function expandAllPosts() {
    const seeMoreButtons = document.querySelectorAll(
      'button.see-more, ' +
      'button[aria-label*="see more"], ' +
      'button[aria-label*="See more"], ' +
      '.feed-shared-inline-show-more-text button, ' +
      'button.feed-shared-inline-show-more-text__button'
    );

    // Also find "...see more" spans that are clickable
    const seeMoreSpans = document.querySelectorAll('span.inline-show-more-text__button, span[role="button"]');

    const allButtons = [...seeMoreButtons, ...seeMoreSpans];

    for (const btn of allButtons) {
      if (btn.innerText && btn.innerText.toLowerCase().includes('see more')) {
        try {
          btn.click();
          await sleep(100);
        } catch (e) {}
      }
    }
  }

  async function autoScroll() {
    const posts = new Map();
    let noNewContentCount = 0;
    const MAX_RETRIES = 8;
    let lastHeight = 0;
    let scrollAttempt = 0;

    const scrollEl = findScrollContainer();
    notify('progress', `🔄 Found scroll container. Starting collection...`);

    while (noNewContentCount < MAX_RETRIES) {
      if (stopRequested) {
        notify('progress', `🛑 Stop requested. Exporting ${posts.size} posts collected so far...`);
        break;
      }

      // Scroll down
      scrollEl.scrollTop = scrollEl.scrollHeight;
      window.scrollTo(0, document.body.scrollHeight);
      scrollAttempt++;

      await sleep(2000 + Math.random() * 1000);

      // Every 10 scrolls, expand "see more" and take a breather
      if (scrollAttempt % 10 === 0) {
        await expandAllPosts();
        notify('progress', `⏳ Breathing... (${posts.size} posts collected so far)`);
        await sleep(3000 + Math.random() * 2000);
      }

      // Expand "see more" every few scrolls to get full content
      if (scrollAttempt % 3 === 0) {
        await expandAllPosts();
      }

      // Find all post containers
      // Based on the screenshot: posts are direct children in the feed area
      // Each post card is separated by a horizontal line
      const postElements = findPostElements();

      const prevSize = posts.size;

      postElements.forEach(el => {
        const postData = extractLinkedInPost(el);
        if (postData && postData.id) {
          posts.set(postData.id, postData);
        }
      });

      // Auto-save every 100 posts
      if (posts.size > 0 && posts.size % 100 < 5) {
        try {
          localStorage.setItem('__sbe_linkedin_backup', JSON.stringify(Array.from(posts.values())));
          localStorage.setItem('__sbe_linkedin_backup_time', new Date().toISOString());
        } catch (e) {}
      }

      const currentHeight = scrollEl.scrollHeight;
      if (posts.size === prevSize && currentHeight === lastHeight) {
        noNewContentCount++;
        const showMoreBtn = document.querySelector(
          'button.scaffold-finite-scroll__load-button, ' +
          'button[aria-label*="Show more"]'
        );
        if (showMoreBtn) {
          showMoreBtn.click();
          await sleep(3000);
          noNewContentCount = Math.max(0, noNewContentCount - 2);
        }
        notify('progress', `⏳ Waiting for more... (attempt ${noNewContentCount}/${MAX_RETRIES}, ${posts.size} posts)`);
        await sleep(3000);
      } else {
        noNewContentCount = 0;
        lastHeight = currentHeight;
      }

      if (posts.size % 50 < 5 && posts.size > 0) {
        notify('progress', `📊 Collected ${posts.size} posts so far... still scrolling`);
      }
    }

    // Final save
    try {
      localStorage.setItem('__sbe_linkedin_backup', JSON.stringify(Array.from(posts.values())));
      localStorage.setItem('__sbe_linkedin_backup_time', new Date().toISOString());
    } catch (e) {}

    notify('progress', `✅ Scroll complete! Collected ${posts.size} posts. Preparing export...`);
    return Array.from(posts.values());
  }

  function findPostElements() {
    // Each saved post has a "..." overflow menu button.
    // Find those buttons and walk up to the post container.
    const menuButtons = document.querySelectorAll(
      'button[aria-label*="actions" i], ' +
      'button[aria-label*="menu" i], ' +
      'button[aria-label*="dismiss" i], ' +
      'button[aria-label*="option" i]'
    );

    const postContainers = [];

    menuButtons.forEach(btn => {
      // Walk up to find the post container (usually 2-4 levels up)
      let container = btn.parentElement;
      for (let i = 0; i < 5; i++) {
        if (!container || !container.parentElement) break;
        container = container.parentElement;
        // A good post container is reasonably sized
        if (container.offsetHeight > 100 && container.offsetHeight < 1000 &&
            container.offsetWidth > 300) {
          // Check it has a profile link (author)
          if (container.querySelector('a[href*="/in/"], a[href*="/company/"]')) {
            // Make sure it's not the whole page or sidebar
            const text = container.innerText || '';
            if (text.length < 5000 && !text.includes('My Items')) {
              postContainers.push(container);
              break;
            }
          }
        }
      }
    });

    // Deduplicate — remove containers that contain each other
    const unique = [];
    for (const el of postContainers) {
      let dominated = false;
      for (let i = unique.length - 1; i >= 0; i--) {
        if (unique[i].contains(el)) { dominated = true; break; }
        if (el.contains(unique[i])) { unique.splice(i, 1); }
      }
      if (!dominated) unique.push(el);
    }

    // If that didn't work, try a different approach:
    // Look for elements separated by <hr> or border-bottom in the main feed
    if (unique.length < 2) {
      const main = document.querySelector('main') || document.querySelector('[role="main"]');
      if (main) {
        // Find all direct-ish children that have profile links
        const candidates = main.querySelectorAll('div');
        const bySize = [];
        candidates.forEach(div => {
          if (div.offsetHeight > 120 && div.offsetHeight < 600 &&
              div.offsetWidth > 350 &&
              div.querySelector('a[href*="/in/"], a[href*="/company/"]') &&
              !div.innerText.includes('My Items') &&
              div.innerText.length > 40 && div.innerText.length < 3000) {
            bySize.push(div);
          }
        });

        // Filter to non-overlapping
        const filtered = [];
        for (const el of bySize) {
          let dominated = false;
          for (let i = filtered.length - 1; i >= 0; i--) {
            if (filtered[i].contains(el)) { dominated = true; break; }
            if (el.contains(filtered[i])) { filtered.splice(i, 1); }
          }
          if (!dominated) filtered.push(el);
        }
        if (filtered.length > 2) return filtered;
      }
    }

    return unique;
  }

  function extractLinkedInPost(element) {
    try {
      const innerText = element.innerText || '';

      // Skip if too short or looks like a navigation element
      if (innerText.length < 30) return null;
      if (innerText.includes('My Items') && innerText.includes('Job tracker')) return null;

      // --- AUTHOR ---
      // The author is the first prominent link to a profile or company page
      let author = '';
      const authorLink = element.querySelector(
        'a[href*="/in/"] span, ' +
        'a[href*="/company/"] span'
      );
      if (authorLink) {
        // Get the visible text (not hidden accessibility text)
        const spans = authorLink.closest('a').querySelectorAll('span');
        for (const s of spans) {
          const t = s.innerText.trim();
          // Skip "View profile", connection degree, follower count, presence status
          if (t && t.length > 1 && t.length < 60 &&
              !t.includes('View') && !t.includes('follower') &&
              !t.match(/^\d+(st|nd|rd|th)$/) && !t.includes('degree') &&
              !t.toLowerCase().includes('offline') &&
              !t.toLowerCase().includes('online') &&
              !t.toLowerCase().includes('status is') &&
              !t.toLowerCase().includes('reachable') &&
              !t.toLowerCase().includes('away')) {
            author = t;
            break;
          }
        }
      }

      // If still no author, grab the first bold/strong text or first line
      if (!author) {
        const firstBold = element.querySelector('strong, span[class*="bold"], span[class*="weight--bold"]');
        if (firstBold) author = firstBold.innerText.trim();
      }
      if (!author) {
        // First line of innerText is usually the author
        author = innerText.split('\n')[0].trim();
      }

      // --- CONTENT ---
      // The post content comes AFTER the author block (name + subtitle + time)
      // Strategy: split the innerText and grab everything after the time indicator
      let content = '';

      // Method 1: Look for specific content containers
      const contentEl = element.querySelector(
        '.feed-shared-text, ' +
        '.update-components-text, ' +
        '.feed-shared-update-v2__description, ' +
        'div[class*="feed-shared-text"], ' +
        'span[class*="break-words"]'
      );

      if (contentEl) {
        content = contentEl.innerText.trim();
      }

      // Method 2: Parse from innerText by removing author/meta info
      if (!content || content.length < 20) {
        const lines = innerText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        // Find where the actual post content starts
        // Skip: author name, subtitle (title/company), follower count, time, "Reposted from..."
        let contentStartIdx = 0;
        const skipPatterns = [
          /^\d+[KkMm]?\s*followers?$/i,
          /^\d+(st|nd|rd|th)$/,
          /^\d+[hmdw]$/,         // time like "3h", "1d"
          /^\d+\s*(hr|min|hour|day|week|month)/i,
          /^Reposted from/i,
          /^•$/,
          /^Promoted$/i,
          /^Following$/i,
          /^Status is/i,
          /^offline$/i,
          /^online$/i,
        ];

        for (let i = 0; i < Math.min(lines.length, 8); i++) {
          const line = lines[i];
          // If this line IS the author or matches skip patterns, continue
          if (line === author) { contentStartIdx = i + 1; continue; }
          if (skipPatterns.some(p => p.test(line))) { contentStartIdx = i + 1; continue; }
          // If line is short metadata (title, company name under author)
          if (i < 4 && line.length < 80 && !line.includes('.') && !line.includes('!') && !line.includes('?')) {
            contentStartIdx = i + 1;
            continue;
          }
          // Found content
          break;
        }

        // Everything from contentStartIdx onwards is the post content
        // But stop at common footer patterns
        const footerPatterns = [
          /^Like$/, /^Comment$/, /^Repost$/, /^Send$/, /^Share$/,
          /^\d+\s*likes?$/i, /^\d+\s*comments?$/i, /^\d+\s*reposts?$/i,
          /^Report this/i, /^Save$/i, /^Unsave$/i,
        ];

        const contentLines = [];
        for (let i = contentStartIdx; i < lines.length; i++) {
          if (footerPatterns.some(p => p.test(lines[i]))) break;
          // Skip "...see more" button text
          if (lines[i] === '…see more' || lines[i] === '...see more') continue;
          contentLines.push(lines[i]);
        }

        content = contentLines.join('\n');
      }

      // Clean up content
      content = content.replace(/…see more$/g, '').replace(/\.\.\.see more$/g, '').trim();

      // --- URL ---
      const linkEl = element.querySelector(
        'a[href*="/feed/update/"], ' +
        'a[href*="/posts/"]'
      );
      const postUrl = linkEl ? linkEl.href : '';

      // --- TIME ---
      let date = '';
      const timeEl = element.querySelector('time');
      if (timeEl) {
        date = timeEl.getAttribute('datetime') || timeEl.innerText.trim();
      } else {
        // Find time pattern like "3h", "1d", "2w"
        const timeMatch = innerText.match(/\b(\d+[hmdw])\b/);
        if (timeMatch) date = timeMatch[1];
      }

      // --- ID for deduplication ---
      const id = postUrl || (author + '::' + content.substring(0, 80));

      if (!content && !postUrl) return null;

      return {
        id: id,
        author: author || 'Unknown',
        content: content.substring(0, 5000),
        url: postUrl,
        date: date,
        reactions: '',
        comments: '',
      };
    } catch (e) {
      return null;
    }
  }

  async function exportLinkedInPosts(format) {
    try {
      // First expand all visible "see more" buttons
      notify('progress', '🔄 Expanding truncated posts...');
      await expandAllPosts();
      await sleep(1000);

      const posts = await autoScroll();

      if (posts.length === 0) {
        notify('error', 'No posts found. Make sure you\'re on the Saved Posts page and posts are visible.');
        isRunning = false;
        return;
      }

      notify('progress', `📦 Preparing ${posts.length} posts for export as ${format.toUpperCase()}...`);

      const exportData = posts.map((p, i) => ({
        '#': i + 1,
        'Author': p.author,
        'Content': p.content,
        'URL': p.url,
        'Date': p.date,
      }));

      if (format === 'json') {
        downloadJSON(exportData, 'linkedin-saved-posts');
      } else if (format === 'csv') {
        downloadCSV(exportData, 'linkedin-saved-posts');
      } else {
        downloadExcel(exportData, 'linkedin-saved-posts');
      }

      notify('done', '', posts.length);
    } catch (err) {
      notify('error', `Export failed: ${err.message}`);
    } finally {
      isRunning = false;
    }
  }

  async function recoverAndExport(format) {
    try {
      const backup = localStorage.getItem('__sbe_linkedin_backup');
      const backupTime = localStorage.getItem('__sbe_linkedin_backup_time');
      if (!backup) {
        notify('error', 'No backup found. Run the export first.');
        return;
      }
      const posts = JSON.parse(backup);
      notify('progress', `🔄 Recovered ${posts.length} posts from backup (saved ${backupTime}). Exporting...`);

      const exportData = posts.map((p, i) => ({
        '#': i + 1,
        'Author': p.author,
        'Content': p.content,
        'URL': p.url,
        'Date': p.date,
      }));

      if (format === 'json') {
        downloadJSON(exportData, 'linkedin-saved-posts-recovered');
      } else if (format === 'csv') {
        downloadCSV(exportData, 'linkedin-saved-posts-recovered');
      } else {
        downloadExcel(exportData, 'linkedin-saved-posts-recovered');
      }

      notify('done', '', posts.length);
    } catch (err) {
      notify('error', `Recovery failed: ${err.message}`);
    }
  }

  function downloadExcel(data, filename) {
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 5 },   // #
      { wch: 30 },  // Author
      { wch: 100 }, // Content
      { wch: 60 },  // URL
      { wch: 12 },  // Date
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Saved Posts');
    XLSX.writeFile(wb, `${filename}-${getDateStr()}.xlsx`);
  }

  function downloadCSV(data, filename) {
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `${filename}-${getDateStr()}.csv`);
  }

  function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `${filename}-${getDateStr()}.json`);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function getDateStr() {
    return new Date().toISOString().slice(0, 10);
  }
})();
