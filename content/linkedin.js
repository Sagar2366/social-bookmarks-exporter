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
    // Try multiple known containers — they change these periodically
    const candidates = [
      document.querySelector('.scaffold-layout__main'),
      document.querySelector('.scaffold-layout__content'),
      document.querySelector('.scaffold-finite-scroll__content'),
      document.querySelector('main.scaffold-layout__main'),
      document.querySelector('[role="main"]'),
      document.querySelector('.application-outlet'),
      document.querySelector('.authentication-outlet'),
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

    // Ultimate fallback — just use document.documentElement
    return document.documentElement;
  }

  async function autoScroll() {
    // For 7500+ posts, we need very patient scrolling
    const posts = new Map(); // Use Map to deduplicate by unique key
    let noNewContentCount = 0;
    const MAX_RETRIES = 8; // Be extra patient - LinkedIn can be slow
    let lastHeight = 0;
    let scrollAttempt = 0;

    // Find LinkedIn's actual scroll container
    const scrollEl = findScrollContainer();
    notify('progress', `🔄 Found scroll container (${scrollEl.className.slice(0, 30) || scrollEl.tagName}). Starting collection...`);

    while (noNewContentCount < MAX_RETRIES) {
      // Check if user requested stop — export what we have so far
      if (stopRequested) {
        notify('progress', `🛑 Stop requested. Exporting ${posts.size} posts collected so far...`);
        break;
      }

      // Scroll the ACTUAL container, not window
      scrollEl.scrollTop = scrollEl.scrollHeight;
      // Also try window scroll as backup
      window.scrollTo(0, document.body.scrollHeight);
      scrollAttempt++;

      // Wait for content to load - longer waits for reliability at scale
      await sleep(2000 + Math.random() * 1000); // 2-3s random delay to look human

      // Every 10 scrolls, take a longer breather to avoid rate limits
      if (scrollAttempt % 10 === 0) {
        notify('progress', `⏳ Breathing... (${posts.size} posts collected so far)`);
        await sleep(3000 + Math.random() * 2000);
      }

      // Collect visible posts
      const postElements = document.querySelectorAll(
        '.reusable-search__result-container, ' +
        '.entity-result, ' +
        '[data-chameleon-result-urn], ' +
        '.scaffold-finite-scroll__content > div > div, ' +
        '.artdeco-list__item'
      );

      const prevSize = posts.size;

      postElements.forEach(el => {
        const postData = extractLinkedInPost(el);
        if (postData && postData.id) {
          posts.set(postData.id, postData);
        }
      });

      // Auto-save to localStorage every 100 posts for crash recovery
      if (posts.size > 0 && posts.size % 100 < 5) {
        try {
          localStorage.setItem('__sbe_linkedin_backup', JSON.stringify(Array.from(posts.values())));
          localStorage.setItem('__sbe_linkedin_backup_time', new Date().toISOString());
        } catch (e) { /* storage full, skip */ }
      }

      // Check if we got new content
      const currentHeight = scrollEl.scrollHeight;
      if (posts.size === prevSize && currentHeight === lastHeight) {
        noNewContentCount++;
        // Try clicking "Show more results" or similar buttons
        const showMoreBtn = document.querySelector(
          'button.scaffold-finite-scroll__load-button, ' +
          'button[aria-label*="more"], ' +
          '.artdeco-loader'
        );
        if (showMoreBtn && showMoreBtn.tagName === 'BUTTON') {
          showMoreBtn.click();
          await sleep(3000);
          noNewContentCount = Math.max(0, noNewContentCount - 2); // Give it more chances
        }
        notify('progress', `⏳ Waiting for more content... (attempt ${noNewContentCount}/${MAX_RETRIES}, ${posts.size} posts so far)`);
        await sleep(3000);
      } else {
        noNewContentCount = 0;
        lastHeight = currentHeight;
      }

      // Progress update every 50 posts
      if (posts.size % 50 < 5 && posts.size > 0) {
        notify('progress', `📊 Collected ${posts.size} posts so far... still scrolling`);
      }
    }

    notify('progress', `✅ Scroll complete! Collected ${posts.size} posts. Preparing export...`);
    return Array.from(posts.values());
  }

  function extractLinkedInPost(element) {
    try {
      // --- CONTENT: Be very aggressive about getting the post text ---
      let text = '';

      // Try known selectors first
      const textSelectors = [
        '.feed-shared-update-v2__description',
        '.update-components-text',
        '.feed-shared-text',
        '.feed-shared-inline-show-more-text',
        '.break-words',
        '[dir="ltr"] span.break-words',
        'span[dir="ltr"]',
        '.feed-shared-text__text-view',
      ];

      for (const sel of textSelectors) {
        const el = element.querySelector(sel);
        if (el && el.innerText.trim().length > 20) {
          text = el.innerText.trim();
          break;
        }
      }

      // Fallback: grab the largest text block in this element
      if (!text) {
        const allSpans = element.querySelectorAll('span, p, div');
        let longest = '';
        allSpans.forEach(el => {
          const t = el.innerText.trim();
          // Skip very short items (buttons/labels) and very long ones (whole container)
          if (t.length > longest.length && t.length > 20 && t.length < 10000) {
            longest = t;
          }
        });
        text = longest;
      }

      // --- AUTHOR ---
      const authorEl = element.querySelector(
        '.update-components-actor__name span, ' +
        '.feed-shared-actor__name span, ' +
        '.entity-result__title-text a span, ' +
        'span.feed-shared-actor__title span, ' +
        'a[data-tracking-control-name*="actor"] span'
      );

      // Fallback author: first strong or bold link text
      let author = authorEl ? authorEl.innerText.trim() : '';
      if (!author) {
        const firstLink = element.querySelector('a span.visually-hidden, a strong, a[href*="/in/"] span');
        if (firstLink) author = firstLink.innerText.trim();
      }

      const linkEl = element.querySelector(
        'a[href*="/feed/update/"], ' +
        'a[href*="/posts/"], ' +
        'a[data-tracking-control-name]'
      );

      const timeEl = element.querySelector(
        'time, ' +
        '.feed-shared-actor__sub-description span, ' +
        'span.update-components-actor__sub-description'
      );

      const reactionsEl = element.querySelector(
        '.social-details-social-counts__reactions-count, ' +
        'span.reactions-count'
      );

      const commentsEl = element.querySelector(
        'button[aria-label*="comment"], ' +
        '.social-details-social-counts__comments'
      );

      // Generate a unique ID from the content or link
      const postUrl = linkEl ? linkEl.href : '';
      const id = postUrl || text.substring(0, 100); // Deduplicate key

      if (!text && !postUrl) return null;

      return {
        id: id,
        author: author || 'Unknown',
        content: text.substring(0, 5000), // Cap individual post content
        url: postUrl,
        date: timeEl ? timeEl.innerText.trim() : '',
        reactions: reactionsEl ? reactionsEl.innerText.trim() : '',
        comments: commentsEl ? commentsEl.innerText.trim().replace(/[^0-9]/g, '') : '',
      };
    } catch (e) {
      return null;
    }
  }

  async function exportLinkedInPosts(format) {
    try {
      const posts = await autoScroll();

      if (posts.length === 0) {
        notify('error', 'No posts found. Make sure you\'re on the Saved Posts page and posts are visible.');
        isRunning = false;
        return;
      }

      notify('progress', `📦 Preparing ${posts.length} posts for export as ${format.toUpperCase()}...`);

      // Clean up the data for export (remove the dedup ID)
      const exportData = posts.map((p, i) => ({
        '#': i + 1,
        'Author': p.author,
        'Content': p.content,
        'URL': p.url,
        'Date': p.date,
        'Reactions': p.reactions,
        'Comments': p.comments,
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
        'Reactions': p.reactions,
        'Comments': p.comments,
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

    // Set column widths for readability
    ws['!cols'] = [
      { wch: 5 },   // #
      { wch: 25 },  // Author
      { wch: 80 },  // Content
      { wch: 50 },  // URL
      { wch: 15 },  // Date
      { wch: 10 },  // Reactions
      { wch: 10 },  // Comments
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Saved Posts');

    // For 7500+ posts, we might need multiple sheets (Excel limit is ~1M rows, so we're fine)
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
