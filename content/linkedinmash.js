// LinkedMash Saved Posts Exporter
// Scrapes all saved posts from linkedmash.com/explore
// Handles large collections (thousands of posts) with patient scrolling

(function() {
  'use strict';

  let isRunning = false;
  let stopRequested = false;

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'exportLinkedInMash' && !isRunning) {
      isRunning = true;
      stopRequested = false;
      exportMashPosts(msg.format);
    } else if (msg.action === 'stopLinkedInMash') {
      stopRequested = true;
    } else if (msg.action === 'recoverLinkedInMash') {
      recoverAndExport(msg.format);
    }
  });

  function notify(type, text, count) {
    try {
      chrome.runtime.sendMessage({ source: 'linkedinmash', type, text, count }).catch(() => {});
    } catch (e) { /* popup closed, keep running */ }
  }

  function sleep(ms) {
    // Use a promise that won't be killed by tab throttling
    return new Promise(resolve => {
      const start = Date.now();
      const check = () => {
        if (Date.now() - start >= ms) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      setTimeout(check, ms);
    });
  }

  function isTabActive() {
    return !document.hidden;
  }

  async function clickAllSeeMore() {
    // Click "see more" links to expand truncated posts
    const seeMoreLinks = document.querySelectorAll('a, span, button');
    for (const el of seeMoreLinks) {
      if (el.innerText && el.innerText.trim().toLowerCase() === 'see more') {
        try {
          el.click();
          await sleep(50);
        } catch (e) {}
      }
    }
  }

  async function autoScroll() {
    const posts = new Map();
    let noNewContentCount = 0;
    const MAX_RETRIES = 10; // Extra patient for large collections
    let lastHeight = 0;
    let scrollAttempt = 0;

    notify('progress', `🔄 Starting to scroll linkedmash.com/explore...`);

    while (noNewContentCount < MAX_RETRIES) {
      if (stopRequested) {
        notify('progress', `🛑 Stop requested. Exporting ${posts.size} posts collected so far...`);
        break;
      }

      // If tab is in background, wait until it's active again
      // Chrome throttles background tabs and scrollTo doesn't work
      if (!isTabActive()) {
        notify('progress', `⏸️ Tab inactive — waiting... (${posts.size} posts safe). Switch back to resume.`);
        // Wait until tab becomes visible again
        await new Promise(resolve => {
          const handler = () => {
            if (!document.hidden) {
              document.removeEventListener('visibilitychange', handler);
              resolve();
            }
          };
          document.addEventListener('visibilitychange', handler);
          // Safety fallback: check every 2s in case event doesn't fire
          const interval = setInterval(() => {
            if (!document.hidden) {
              clearInterval(interval);
              document.removeEventListener('visibilitychange', handler);
              resolve();
            }
          }, 2000);
        });
        notify('progress', `▶️ Tab active again! Resuming scroll... (${posts.size} posts so far)`);
        // Reset retry counter since we weren't actually failing
        noNewContentCount = 0;
        await sleep(1000);
      }

      // LinkedMash uses window scroll (standard page)
      window.scrollTo(0, document.body.scrollHeight);
      scrollAttempt++;

      await sleep(1500 + Math.random() * 800); // Slightly faster — it's a third-party app

      // Breather every 20 scrolls
      if (scrollAttempt % 20 === 0) {
        await clickAllSeeMore();
        notify('progress', `⏳ Breathing... (${posts.size} posts collected so far)`);
        await sleep(2000 + Math.random() * 1000);
      }

      // Expand posts every 5 scrolls
      if (scrollAttempt % 5 === 0) {
        await clickAllSeeMore();
      }

      // Find and extract posts
      const postElements = findPostElements();
      const prevSize = posts.size;

      postElements.forEach(el => {
        const postData = extractPost(el);
        if (postData && postData.id) {
          posts.set(postData.id, postData);
        }
      });

      // Auto-save every 200 posts
      if (posts.size > 0 && posts.size % 200 < 10) {
        try {
          localStorage.setItem('__sbe_mash_backup', JSON.stringify(Array.from(posts.values())));
          localStorage.setItem('__sbe_mash_backup_time', new Date().toISOString());
        } catch (e) {
          // localStorage might be full — trim content
          try {
            const trimmed = Array.from(posts.values()).map(p => ({
              ...p, content: p.content.substring(0, 300)
            }));
            localStorage.setItem('__sbe_mash_backup', JSON.stringify(trimmed));
            localStorage.setItem('__sbe_mash_backup_time', new Date().toISOString());
          } catch (e2) {}
        }
      }

      const currentHeight = document.body.scrollHeight;
      if (posts.size === prevSize && currentHeight === lastHeight) {
        noNewContentCount++;
        notify('progress', `⏳ Waiting for more... (attempt ${noNewContentCount}/${MAX_RETRIES}, ${posts.size} posts)`);
        await sleep(3000);
      } else {
        noNewContentCount = 0;
        lastHeight = currentHeight;
      }

      // Progress updates
      if (posts.size % 100 < 10 && posts.size > 0) {
        notify('progress', `📊 Collected ${posts.size} posts so far... still scrolling`);
      }
    }

    // Final save
    try {
      localStorage.setItem('__sbe_mash_backup', JSON.stringify(Array.from(posts.values())));
      localStorage.setItem('__sbe_mash_backup_time', new Date().toISOString());
    } catch (e) {}

    notify('progress', `✅ Done! Collected ${posts.size} posts. Preparing export...`);
    return Array.from(posts.values());
  }

  function findPostElements() {
    // From the screenshot, each post is a card with:
    // - Avatar image + Author name + follower count + date
    // - Action icons (tag, archive, delete, linkedin)
    // - Post content text
    // - "see more" link
    // - Blue checkmark

    // Strategy 1: Find cards by their structure — each has those action icon buttons
    // The icons look like they're in a row (tag/heart, archive, trash, linkedin logo)
    let items = document.querySelectorAll(
      'article, ' +
      '[class*="post"], ' +
      '[class*="card"], ' +
      '[class*="bookmark"], ' +
      '[class*="item"]'
    );

    // Filter to actual post cards (have author + content + reasonable size)
    const validItems = Array.from(items).filter(el => {
      return el.offsetHeight > 80 &&
             el.offsetHeight < 1500 &&
             el.innerText.length > 30 &&
             el.innerText.length < 8000 &&
             !el.querySelector('nav') &&
             !el.innerText.includes('CURATION') &&
             !el.innerText.includes('CONSUMPTION');
    });

    if (validItems.length > 2) return validItems;

    // Strategy 2: Find by avatar images — each post has a circular profile pic
    const avatars = document.querySelectorAll('img[class*="avatar"], img[class*="profile"], img[src*="licdn"]');
    const containers = [];

    avatars.forEach(img => {
      // Walk up to find the post container
      let el = img.parentElement;
      for (let i = 0; i < 6; i++) {
        if (!el || !el.parentElement) break;
        el = el.parentElement;
        if (el.offsetHeight > 100 && el.offsetHeight < 1500 &&
            el.offsetWidth > 300 &&
            el.innerText.length > 30 && el.innerText.length < 8000) {
          containers.push(el);
          break;
        }
      }
    });

    // Deduplicate
    const unique = [];
    for (const el of containers) {
      let dominated = false;
      for (let i = unique.length - 1; i >= 0; i--) {
        if (unique[i].contains(el)) { dominated = true; break; }
        if (el.contains(unique[i])) { unique.splice(i, 1); }
      }
      if (!dominated) unique.push(el);
    }

    if (unique.length > 2) return unique;

    // Strategy 3: Look for repeating sibling divs in the main content area
    // The explore page has a main feed area with posts stacked
    const mainArea = document.querySelector('main, [class*="feed"], [class*="explore"], [class*="content"]') || document.body;
    const children = mainArea.querySelectorAll(':scope > div > div, :scope > div');
    const posts = Array.from(children).filter(el => {
      return el.offsetHeight > 80 && el.offsetHeight < 1500 &&
             el.offsetWidth > 350 &&
             el.innerText.length > 30 &&
             !el.innerText.includes('CURATION') &&
             !el.innerText.includes('AUTOMATIONS');
    });

    return posts;
  }

  function extractPost(element) {
    try {
      const innerText = element.innerText || '';
      if (innerText.length < 20) return null;

      // Skip navigation/sidebar elements
      if (innerText.includes('CURATION') || innerText.includes('CONSUMPTION') ||
          innerText.includes('Upgrade to Pro') || innerText.includes('AUTOMATIONS')) {
        return null;
      }

      const lines = innerText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length < 2) return null;

      // --- AUTHOR ---
      // From screenshot: "The Linux Foundation" is bold, followed by "404K followers.. • Jun 5 2026"
      let author = '';
      let date = '';
      let followerInfo = '';

      // First meaningful line is usually the author name
      for (let i = 0; i < Math.min(lines.length, 3); i++) {
        const line = lines[i];
        // Check if this line has followers + date pattern
        if (line.match(/followers?.*\d{4}/i) || line.match(/\d+[KkMm]?\s*followers/i)) {
          followerInfo = line;
          // Extract date from this line (format: "Jun 5 2026" or "• Jun 5 2026")
          const dateMatch = line.match(/(?:•\s*)?([A-Z][a-z]{2}\s+\d{1,2}\s+\d{4})/);
          if (dateMatch) date = dateMatch[1];
          // Author is the line before this
          if (i > 0 && !author) author = lines[i - 1];
          break;
        }
        // If it looks like a name (not too long, no special patterns)
        if (!author && line.length > 2 && line.length < 80 &&
            !line.match(/^\d/) && !line.match(/followers/i) &&
            !line.includes('see more') && !line.includes('...')) {
          author = line;
        }
      }

      // --- CONTENT ---
      // Content starts after the author + follower/date line
      let contentStartIdx = 0;
      for (let i = 0; i < Math.min(lines.length, 5); i++) {
        if (lines[i] === author || lines[i] === followerInfo ||
            lines[i].match(/followers?/i) || lines[i].match(/^[A-Z][a-z]{2}\s+\d{1,2}\s+\d{4}$/)) {
          contentStartIdx = i + 1;
        }
      }

      // Collect content lines, stop at "see more" or end
      const contentLines = [];
      for (let i = contentStartIdx; i < lines.length; i++) {
        const line = lines[i];
        // Stop at known footer elements
        if (line === 'see more' || line === '...') continue; // skip these but keep going
        if (line.match(/^(Like|Comment|Share|Save)$/i)) break;
        contentLines.push(line);
      }

      let content = contentLines.join('\n').trim();

      // Remove trailing "..."
      content = content.replace(/\.\.\.\s*$/, '').replace(/…\s*$/, '').trim();

      // --- URL ---
      // Look for LinkedIn URL in the post's links
      let url = '';
      const linkEl = element.querySelector(
        'a[href*="linkedin.com/feed/update"], ' +
        'a[href*="linkedin.com/posts/"], ' +
        'a[href*="linkedin.com"]'
      );
      if (linkEl) url = linkEl.href;

      // --- ID ---
      const id = url || (author + '::' + content.substring(0, 80));

      if (!content || content.length < 10) return null;

      return {
        id: id,
        author: author || 'Unknown',
        content: content.substring(0, 5000),
        url: url,
        date: date,
      };
    } catch (e) {
      return null;
    }
  }

  async function exportMashPosts(format) {
    try {
      notify('progress', '🔄 Starting export from LinkedMash...');

      // Expand visible "see more" first
      await clickAllSeeMore();
      await sleep(1000);

      const posts = await autoScroll();

      if (posts.length === 0) {
        notify('error', 'No posts found. Make sure you\'re on linkedmash.com/explore with posts visible.');
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

      const filename = 'linkedmash-saved-posts';

      if (format === 'json') {
        downloadJSON(exportData, filename);
      } else if (format === 'csv') {
        downloadCSV(exportData, filename);
      } else {
        downloadExcel(exportData, filename);
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
      const backup = localStorage.getItem('__sbe_mash_backup');
      const backupTime = localStorage.getItem('__sbe_mash_backup_time');
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

      const filename = 'linkedmash-saved-posts-recovered';

      if (format === 'json') {
        downloadJSON(exportData, filename);
      } else if (format === 'csv') {
        downloadCSV(exportData, filename);
      } else {
        downloadExcel(exportData, filename);
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
      { wch: 35 },  // Author
      { wch: 100 }, // Content
      { wch: 60 },  // URL
      { wch: 15 },  // Date
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'LinkedMash Posts');
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
