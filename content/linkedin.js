// LinkedIn Saved Posts Content Script
// Designed to handle 7500+ saved posts with patient scrolling

(function() {
  'use strict';

  let isRunning = false;

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'exportLinkedIn' && !isRunning) {
      isRunning = true;
      exportLinkedInPosts(msg.format);
    }
  });

  function notify(type, text, count) {
    chrome.runtime.sendMessage({ source: 'linkedin', type, text, count });
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function autoScroll() {
    // For 7500+ posts, we need very patient scrolling
    const posts = new Map(); // Use Map to deduplicate by unique key
    let noNewContentCount = 0;
    const MAX_RETRIES = 8; // Be extra patient - LinkedIn can be slow
    let lastHeight = 0;
    let scrollAttempt = 0;

    notify('progress', '🔄 Starting to scroll and collect posts...');

    while (noNewContentCount < MAX_RETRIES) {
      // Scroll down
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

      // Check if we got new content
      const currentHeight = document.body.scrollHeight;
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
      // Try multiple selectors since LinkedIn changes their DOM frequently
      const textEl = element.querySelector(
        '.feed-shared-update-v2__description, ' +
        '.update-components-text, ' +
        '.feed-shared-text, ' +
        '.break-words span[dir="ltr"], ' +
        '.feed-shared-inline-show-more-text'
      );

      const authorEl = element.querySelector(
        '.update-components-actor__name span, ' +
        '.feed-shared-actor__name span, ' +
        '.entity-result__title-text a span, ' +
        'span.feed-shared-actor__title span'
      );

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
      const text = textEl ? textEl.innerText.trim() : element.innerText.trim().substring(0, 500);
      const id = postUrl || text.substring(0, 100); // Deduplicate key

      if (!text && !postUrl) return null;

      return {
        id: id,
        author: authorEl ? authorEl.innerText.trim() : 'Unknown',
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
