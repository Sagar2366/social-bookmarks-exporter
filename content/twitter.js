// Twitter/X Bookmarks Content Script
// Designed to handle thousands of bookmarks with patient scrolling

(function() {
  'use strict';

  let isRunning = false;
  let stopRequested = false;

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'exportTwitter' && !isRunning) {
      isRunning = true;
      stopRequested = false;
      exportTwitterBookmarks(msg.format);
    } else if (msg.action === 'stopTwitter') {
      stopRequested = true;
    } else if (msg.action === 'recoverTwitter') {
      recoverAndExport(msg.format);
    }
  });

  function notify(type, text, count) {
    chrome.runtime.sendMessage({ source: 'twitter', type, text, count });
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function autoScroll() {
    const tweets = new Map(); // Deduplicate by tweet ID/URL
    let noNewContentCount = 0;
    const MAX_RETRIES = 8;
    let lastHeight = 0;
    let scrollAttempt = 0;

    notify('progress', '🔄 Starting to scroll and collect bookmarks...');

    while (noNewContentCount < MAX_RETRIES) {
      // Check if user requested stop
      if (stopRequested) {
        notify('progress', `🛑 Stop requested. Exporting ${tweets.size} bookmarks collected so far...`);
        break;
      }

      window.scrollTo(0, document.body.scrollHeight);
      scrollAttempt++;

      // Twitter rate-limits aggressively, be patient
      await sleep(2500 + Math.random() * 1500); // 2.5-4s random delay

      // Longer breather every 8 scrolls
      if (scrollAttempt % 8 === 0) {
        notify('progress', `⏳ Pausing to avoid rate limit... (${tweets.size} bookmarks so far)`);
        await sleep(4000 + Math.random() * 3000);
      }

      // Collect tweets - Twitter/X uses article elements for tweets
      const tweetElements = document.querySelectorAll(
        'article[data-testid="tweet"], ' +
        '[data-testid="cellInnerDiv"] article'
      );

      const prevSize = tweets.size;

      tweetElements.forEach(el => {
        const tweetData = extractTweet(el);
        if (tweetData && tweetData.id) {
          tweets.set(tweetData.id, tweetData);
        }
      });

      // Auto-save to localStorage every 100 tweets for crash recovery
      if (tweets.size > 0 && tweets.size % 100 < 5) {
        try {
          localStorage.setItem('__sbe_twitter_backup', JSON.stringify(Array.from(tweets.values())));
          localStorage.setItem('__sbe_twitter_backup_time', new Date().toISOString());
        } catch (e) { /* storage full, skip */ }
      }

      const currentHeight = document.body.scrollHeight;
      if (tweets.size === prevSize && currentHeight === lastHeight) {
        noNewContentCount++;
        notify('progress', `⏳ Waiting for more content... (attempt ${noNewContentCount}/${MAX_RETRIES}, ${tweets.size} bookmarks so far)`);
        await sleep(4000);
      } else {
        noNewContentCount = 0;
        lastHeight = currentHeight;
      }

      if (tweets.size % 50 < 5 && tweets.size > 0) {
        notify('progress', `📊 Collected ${tweets.size} bookmarks so far... still scrolling`);
      }
    }

    notify('progress', `✅ Scroll complete! Collected ${tweets.size} bookmarks. Preparing export...`);
    return Array.from(tweets.values());
  }

  function extractTweet(element) {
    try {
      // Author info
      const authorNameEl = element.querySelector(
        '[data-testid="User-Name"] a span, ' +
        'a[role="link"] div[dir="ltr"] span'
      );

      const handleEl = element.querySelector(
        '[data-testid="User-Name"] a[href^="/"]'
      );

      // Tweet text — be aggressive about getting the actual content
      const textEl = element.querySelector('[data-testid="tweetText"]');
      let text = '';
      if (textEl) {
        // Get full text including line breaks — innerText preserves them
        text = textEl.innerText.trim();
      } else {
        // Fallback: find any element with lang attribute that has substantial text
        const langEls = element.querySelectorAll('[lang]');
        for (const el of langEls) {
          const t = el.innerText.trim();
          if (t.length > 20) { // Skip short labels, grab actual content
            text = t;
            break;
          }
        }
      }

      // If still no text, grab everything from the tweet body area
      if (!text) {
        const tweetBody = element.querySelector('[data-testid="tweet"] > div:nth-child(2)') ||
                          element.querySelector('div[lang]');
        if (tweetBody) {
          text = tweetBody.innerText.trim();
        }
      }

      // Tweet link (for unique ID)
      const timeEl = element.querySelector('time');
      const tweetLinkEl = timeEl ? timeEl.closest('a') :
        element.querySelector('a[href*="/status/"]');

      // Metrics
      const replyEl = element.querySelector('[data-testid="reply"] span');
      const retweetEl = element.querySelector('[data-testid="retweet"] span');
      const likeEl = element.querySelector('[data-testid="like"] span');
      const viewsEl = element.querySelector('a[href*="/analytics"] span');

      // Media
      const hasImage = !!element.querySelector('[data-testid="tweetPhoto"], img[src*="pbs.twimg"]');
      const hasVideo = !!element.querySelector('[data-testid="videoPlayer"], video');
      const hasLink = !!element.querySelector('[data-testid="card.wrapper"]');

      // Extract URL and use as dedup key
      const tweetUrl = tweetLinkEl ? tweetLinkEl.href : '';
      const tweetId = tweetUrl.match(/\/status\/(\d+)/)?.[1] || '';

      if (!tweetId && !text) return null;

      return {
        id: tweetId || text.substring(0, 100),
        author: authorNameEl ? authorNameEl.innerText.trim() : 'Unknown',
        handle: handleEl ? '@' + handleEl.href.split('/').pop() : '',
        content: text.substring(0, 5000),
        url: tweetUrl ? tweetUrl.replace('twitter.com', 'x.com') : '',
        date: timeEl ? timeEl.getAttribute('datetime') || timeEl.innerText : '',
        replies: replyEl ? replyEl.innerText.trim() : '0',
        retweets: retweetEl ? retweetEl.innerText.trim() : '0',
        likes: likeEl ? likeEl.innerText.trim() : '0',
        views: viewsEl ? viewsEl.innerText.trim() : '',
        media_type: hasVideo ? 'Video' : hasImage ? 'Image' : hasLink ? 'Link' : 'Text',
      };
    } catch (e) {
      return null;
    }
  }

  async function exportTwitterBookmarks(format) {
    try {
      const tweets = await autoScroll();

      if (tweets.length === 0) {
        notify('error', 'No bookmarks found. Make sure you\'re on the Bookmarks page and tweets are visible.');
        isRunning = false;
        return;
      }

      notify('progress', `📦 Preparing ${tweets.length} bookmarks for export as ${format.toUpperCase()}...`);

      const exportData = tweets.map((t, i) => ({
        '#': i + 1,
        'Author': t.author,
        'Handle': t.handle,
        'Content': t.content,
        'URL': t.url,
        'Date': t.date,
        'Replies': t.replies,
        'Retweets': t.retweets,
        'Likes': t.likes,
        'Views': t.views,
        'Media Type': t.media_type,
      }));

      if (format === 'json') {
        downloadJSON(exportData, 'twitter-bookmarks');
      } else if (format === 'csv') {
        downloadCSV(exportData, 'twitter-bookmarks');
      } else {
        downloadExcel(exportData, 'twitter-bookmarks');
      }

      notify('done', '', tweets.length);
    } catch (err) {
      notify('error', `Export failed: ${err.message}`);
    } finally {
      isRunning = false;
    }
  }

  async function recoverAndExport(format) {
    try {
      const backup = localStorage.getItem('__sbe_twitter_backup');
      const backupTime = localStorage.getItem('__sbe_twitter_backup_time');
      if (!backup) {
        notify('error', 'No backup found. Run the export first.');
        return;
      }
      const tweets = JSON.parse(backup);
      notify('progress', `🔄 Recovered ${tweets.length} bookmarks from backup (saved ${backupTime}). Exporting...`);

      const exportData = tweets.map((t, i) => ({
        '#': i + 1,
        'Author': t.author,
        'Handle': t.handle,
        'Content': t.content,
        'URL': t.url,
        'Date': t.date,
        'Replies': t.replies,
        'Retweets': t.retweets,
        'Likes': t.likes,
        'Views': t.views,
        'Media Type': t.media_type,
      }));

      if (format === 'json') {
        downloadJSON(exportData, 'twitter-bookmarks-recovered');
      } else if (format === 'csv') {
        downloadCSV(exportData, 'twitter-bookmarks-recovered');
      } else {
        downloadExcel(exportData, 'twitter-bookmarks-recovered');
      }

      notify('done', '', tweets.length);
    } catch (err) {
      notify('error', `Recovery failed: ${err.message}`);
    }
  }

  function downloadExcel(data, filename) {
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 5 },   // #
      { wch: 20 },  // Author
      { wch: 18 },  // Handle
      { wch: 80 },  // Content
      { wch: 45 },  // URL
      { wch: 20 },  // Date
      { wch: 8 },   // Replies
      { wch: 8 },   // Retweets
      { wch: 8 },   // Likes
      { wch: 10 },  // Views
      { wch: 8 },   // Media Type
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bookmarks');
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
