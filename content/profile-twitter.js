// Twitter/X Profile Posts Exporter
// Scrapes all tweets from a user's profile page

(function() {
  'use strict';

  let isRunning = false;
  let stopRequested = false;

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'exportProfileTwitter' && !isRunning) {
      isRunning = true;
      stopRequested = false;
      exportProfileTweets(msg.format);
    } else if (msg.action === 'stopProfileTwitter') {
      stopRequested = true;
    } else if (msg.action === 'recoverProfileTwitter') {
      recoverAndExport(msg.format);
    }
  });

  function notify(type, text, count) {
    try {
      chrome.runtime.sendMessage({ source: 'profile-twitter', type, text, count }).catch(() => {});
    } catch (e) { /* popup closed, keep running */ }
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function getProfileName() {
    // Get the profile name from the page
    const nameEl = document.querySelector(
      '[data-testid="UserName"] span, ' +
      'div[data-testid="UserName"] div[dir="ltr"] span'
    );
    return nameEl ? nameEl.innerText.trim() : 'Unknown';
  }

  function getProfileHandle() {
    const url = window.location.href;
    const match = url.match(/(?:twitter\.com|x\.com)\/([^/?#]+)/);
    return match ? '@' + match[1] : '';
  }

  async function autoScroll() {
    const tweets = new Map();
    let noNewContentCount = 0;
    const MAX_RETRIES = 8;
    let lastHeight = 0;
    let scrollAttempt = 0;

    const profileName = getProfileName();
    const handle = getProfileHandle();
    notify('progress', `🔄 Scrolling ${profileName} (${handle})'s tweets...`);

    while (noNewContentCount < MAX_RETRIES) {
      if (stopRequested) {
        notify('progress', `🛑 Stop requested. Exporting ${tweets.size} tweets collected so far...`);
        break;
      }

      window.scrollTo(0, document.body.scrollHeight);
      scrollAttempt++;

      // Twitter rate-limits aggressively
      await sleep(2500 + Math.random() * 1500);

      // Breather every 8 scrolls
      if (scrollAttempt % 8 === 0) {
        notify('progress', `⏳ Pausing to avoid rate limit... (${tweets.size} tweets from ${handle} so far)`);
        await sleep(4000 + Math.random() * 3000);
      }

      // Find tweets
      const tweetElements = document.querySelectorAll(
        'article[data-testid="tweet"], ' +
        '[data-testid="cellInnerDiv"] article'
      );

      const prevSize = tweets.size;

      tweetElements.forEach(el => {
        const tweetData = extractTweet(el, profileName, handle);
        if (tweetData && tweetData.id) {
          // Only include tweets FROM this profile (skip retweets from others unless quoted)
          if (tweetData.isOwnTweet) {
            tweets.set(tweetData.id, tweetData);
          }
        }
      });

      // Auto-save every 100 tweets
      if (tweets.size > 0 && tweets.size % 100 < 5) {
        try {
          localStorage.setItem('__sbe_profile_tw_backup', JSON.stringify(Array.from(tweets.values())));
          localStorage.setItem('__sbe_profile_tw_backup_time', new Date().toISOString());
          localStorage.setItem('__sbe_profile_tw_backup_handle', handle);
        } catch (e) {}
      }

      const currentHeight = document.body.scrollHeight;
      if (tweets.size === prevSize && currentHeight === lastHeight) {
        noNewContentCount++;
        notify('progress', `⏳ Waiting for more... (attempt ${noNewContentCount}/${MAX_RETRIES}, ${tweets.size} tweets)`);
        await sleep(4000);
      } else {
        noNewContentCount = 0;
        lastHeight = currentHeight;
      }

      if (tweets.size % 50 < 5 && tweets.size > 0) {
        notify('progress', `📊 Collected ${tweets.size} tweets from ${handle}... still scrolling`);
      }
    }

    // Final save
    try {
      localStorage.setItem('__sbe_profile_tw_backup', JSON.stringify(Array.from(tweets.values())));
      localStorage.setItem('__sbe_profile_tw_backup_time', new Date().toISOString());
      localStorage.setItem('__sbe_profile_tw_backup_handle', handle);
    } catch (e) {}

    notify('progress', `✅ Done! Collected ${tweets.size} tweets from ${handle}. Preparing export...`);
    return Array.from(tweets.values());
  }

  function extractTweet(element, profileName, profileHandle) {
    try {
      // Check if this tweet is from the profile owner
      const handleEl = element.querySelector('[data-testid="User-Name"] a[href^="/"]');
      const tweetHandle = handleEl ? '@' + handleEl.href.split('/').pop() : '';
      const isOwnTweet = !profileHandle || tweetHandle.toLowerCase() === profileHandle.toLowerCase();

      // Author info
      const authorNameEl = element.querySelector(
        '[data-testid="User-Name"] a span, ' +
        'a[role="link"] div[dir="ltr"] span'
      );

      // Tweet text
      const textEl = element.querySelector('[data-testid="tweetText"]');
      let text = '';
      if (textEl) {
        text = textEl.innerText.trim();
      } else {
        const langEls = element.querySelectorAll('[lang]');
        for (const el of langEls) {
          const t = el.innerText.trim();
          if (t.length > 20) {
            text = t;
            break;
          }
        }
      }

      if (!text) {
        const tweetBody = element.querySelector('div[lang]');
        if (tweetBody) text = tweetBody.innerText.trim();
      }

      // Tweet link
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

      // URL and ID
      const tweetUrl = tweetLinkEl ? tweetLinkEl.href : '';
      const tweetId = tweetUrl.match(/\/status\/(\d+)/)?.[1] || '';

      if (!tweetId && !text) return null;

      return {
        id: tweetId || text.substring(0, 100),
        isOwnTweet: isOwnTweet,
        author: authorNameEl ? authorNameEl.innerText.trim() : profileName,
        handle: tweetHandle || profileHandle,
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

  async function exportProfileTweets(format) {
    try {
      const profileName = getProfileName();
      const handle = getProfileHandle();

      const tweets = await autoScroll();

      if (tweets.length === 0) {
        notify('error', 'No tweets found. Make sure you\'re on a Twitter/X profile page with visible tweets.');
        isRunning = false;
        return;
      }

      notify('progress', `📦 Preparing ${tweets.length} tweets for export as ${format.toUpperCase()}...`);

      const safeHandle = handle.replace('@', '').substring(0, 30);

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

      const filename = `twitter-profile-${safeHandle}`;

      if (format === 'json') {
        downloadJSON(exportData, filename);
      } else if (format === 'csv') {
        downloadCSV(exportData, filename);
      } else {
        downloadExcel(exportData, filename);
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
      const backup = localStorage.getItem('__sbe_profile_tw_backup');
      const backupTime = localStorage.getItem('__sbe_profile_tw_backup_time');
      const backupHandle = localStorage.getItem('__sbe_profile_tw_backup_handle') || 'unknown';
      if (!backup) {
        notify('error', 'No backup found. Run the export first.');
        return;
      }
      const tweets = JSON.parse(backup);
      notify('progress', `🔄 Recovered ${tweets.length} tweets from ${backupHandle} (saved ${backupTime}). Exporting...`);

      const safeHandle = backupHandle.replace('@', '').substring(0, 30);

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

      const filename = `twitter-profile-${safeHandle}-recovered`;

      if (format === 'json') {
        downloadJSON(exportData, filename);
      } else if (format === 'csv') {
        downloadCSV(exportData, filename);
      } else {
        downloadExcel(exportData, filename);
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
      { wch: 100 }, // Content
      { wch: 50 },  // URL
      { wch: 20 },  // Date
      { wch: 8 },   // Replies
      { wch: 8 },   // Retweets
      { wch: 8 },   // Likes
      { wch: 10 },  // Views
      { wch: 8 },   // Media Type
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Profile Tweets');
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
