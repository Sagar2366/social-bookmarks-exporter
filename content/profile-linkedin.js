// LinkedIn Profile Posts Exporter
// Scrapes all posts from a LinkedIn user's profile/activity page

(function() {
  'use strict';

  let isRunning = false;
  let stopRequested = false;

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'exportProfileLinkedIn' && !isRunning) {
      isRunning = true;
      stopRequested = false;
      exportProfilePosts(msg.format);
    } else if (msg.action === 'stopProfileLinkedIn') {
      stopRequested = true;
    } else if (msg.action === 'recoverProfileLinkedIn') {
      recoverAndExport(msg.format);
    }
  });

  function notify(type, text, count) {
    try {
      chrome.runtime.sendMessage({ source: 'profile-linkedin', type, text, count }).catch(() => {});
    } catch (e) { /* popup closed, keep running */ }
  }

  function sleep(ms) {
    return new Promise(resolve => {
      const start = Date.now();
      const check = () => {
        if (Date.now() - start >= ms) resolve();
        else setTimeout(check, 100);
      };
      setTimeout(check, ms);
    });
  }

  function isTabActive() {
    return !document.hidden;
  }

  function getProfileName() {
    // Try to get the profile owner's name from the page
    const nameEl = document.querySelector(
      'h1.text-heading-xlarge, ' +
      'h1[class*="break-words"], ' +
      '.pv-top-card--list li:first-child, ' +
      'div.ph5 h1'
    );
    return nameEl ? nameEl.innerText.trim() : 'Unknown Profile';
  }

  function findScrollContainer() {
    // On activity/recent-activity pages, the page uses WINDOW scroll
    // Just return document.documentElement — we'll also call window.scrollTo as backup
    return document.documentElement;
  }

  async function navigateToPostsTab() {
    // If we're on the main profile page, try to click "Posts" or navigate to activity
    const currentUrl = window.location.href;

    // Already on activity/posts page
    if (currentUrl.includes('/recent-activity') || currentUrl.includes('/detail/recent-activity')) {
      return true;
    }

    // Try clicking the "Posts" tab/button on the profile
    const postsTab = Array.from(document.querySelectorAll('a, button')).find(el => {
      const text = el.innerText.trim().toLowerCase();
      return text === 'posts' || text === 'show all posts' || text === 'see all posts';
    });

    if (postsTab) {
      postsTab.click();
      await sleep(2000);
      return true;
    }

    // Try navigating to the activity URL directly
    const profileMatch = currentUrl.match(/linkedin\.com\/(in|company)\/([^/?]+)/);
    if (profileMatch) {
      const [, type, username] = profileMatch;
      const activityUrl = type === 'in'
        ? `https://www.linkedin.com/in/${username}/recent-activity/all/`
        : `https://www.linkedin.com/company/${username}/posts/`;
      window.location.href = activityUrl;
      await sleep(3000);
      return true;
    }

    return false;
  }

  async function expandAllPosts() {
    const seeMoreButtons = document.querySelectorAll(
      'button.see-more, ' +
      'button[aria-label*="see more" i], ' +
      'button[aria-label*="See more"], ' +
      '.feed-shared-inline-show-more-text button'
    );

    const seeMoreSpans = document.querySelectorAll('span[role="button"]');
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
    const profileName = getProfileName();
    notify('progress', `🔄 Scrolling ${profileName}'s posts...`);

    while (noNewContentCount < MAX_RETRIES) {
      if (stopRequested) {
        notify('progress', `🛑 Stop requested. Exporting ${posts.size} posts collected so far...`);
        break;
      }

      // Pause when tab is in background
      if (!isTabActive()) {
        await new Promise(resolve => {
          const handler = () => {
            if (!document.hidden) {
              document.removeEventListener('visibilitychange', handler);
              resolve();
            }
          };
          document.addEventListener('visibilitychange', handler);
          const interval = setInterval(() => {
            if (!document.hidden) { clearInterval(interval); document.removeEventListener('visibilitychange', handler); resolve(); }
          }, 2000);
        });
        noNewContentCount = 0;
        await sleep(1000);
      }

      // Scroll down — use multiple methods to ensure it works
      window.scrollTo(0, document.body.scrollHeight);
      window.scrollBy(0, 1000);
      document.documentElement.scrollTop = document.documentElement.scrollHeight;
      scrollAttempt++;

      await sleep(2000 + Math.random() * 1000);

      // Breather every 10 scrolls
      if (scrollAttempt % 10 === 0) {
        await expandAllPosts();
        notify('progress', `⏳ Breathing... (${posts.size} posts from ${profileName} so far)`);
        await sleep(3000 + Math.random() * 2000);
      }

      // Expand "see more" every 3 scrolls
      if (scrollAttempt % 3 === 0) {
        await expandAllPosts();
      }

      // Find post elements
      const postElements = findPostElements();
      const prevSize = posts.size;

      postElements.forEach(el => {
        const postData = extractPost(el, profileName);
        if (postData && postData.id) {
          posts.set(postData.id, postData);
        }
      });

      // Auto-save every 100 posts
      if (posts.size > 0 && posts.size % 100 < 5) {
        try {
          localStorage.setItem('__sbe_profile_li_backup', JSON.stringify(Array.from(posts.values())));
          localStorage.setItem('__sbe_profile_li_backup_time', new Date().toISOString());
          localStorage.setItem('__sbe_profile_li_backup_name', profileName);
        } catch (e) {}
      }

      const currentHeight = scrollEl.scrollHeight;
      if (posts.size === prevSize && currentHeight === lastHeight) {
        noNewContentCount++;
        // Try clicking "Show more" button
        const showMoreBtn = document.querySelector(
          'button.scaffold-finite-scroll__load-button, ' +
          'button[aria-label*="Show more" i], ' +
          'button[aria-label*="Load more" i]'
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
        notify('progress', `📊 Collected ${posts.size} posts from ${profileName}... still scrolling`);
      }
    }

    // Final save
    try {
      localStorage.setItem('__sbe_profile_li_backup', JSON.stringify(Array.from(posts.values())));
      localStorage.setItem('__sbe_profile_li_backup_time', new Date().toISOString());
      localStorage.setItem('__sbe_profile_li_backup_name', profileName);
    } catch (e) {}

    notify('progress', `✅ Done! Collected ${posts.size} posts from ${profileName}. Preparing export...`);
    return Array.from(posts.values());
  }

  function findPostElements() {
    // On a profile's activity/posts page, posts are feed items
    // They have the same structure as feed posts with the "..." menu button

    // Method 1: Find by menu buttons (same as saved posts)
    const menuButtons = document.querySelectorAll(
      'button[aria-label*="actions" i], ' +
      'button[aria-label*="menu" i], ' +
      'button[aria-label*="option" i]'
    );

    const postContainers = [];

    menuButtons.forEach(btn => {
      let container = btn.parentElement;
      for (let i = 0; i < 6; i++) {
        if (!container || !container.parentElement) break;
        container = container.parentElement;
        if (container.offsetHeight > 100 && container.offsetHeight < 1200 &&
            container.offsetWidth > 300) {
          const text = container.innerText || '';
          if (text.length > 30 && text.length < 8000) {
            postContainers.push(container);
            break;
          }
        }
      }
    });

    // Deduplicate overlapping containers
    const unique = [];
    for (const el of postContainers) {
      let dominated = false;
      for (let i = unique.length - 1; i >= 0; i--) {
        if (unique[i].contains(el)) { dominated = true; break; }
        if (el.contains(unique[i])) { unique.splice(i, 1); }
      }
      if (!dominated) unique.push(el);
    }

    // Method 2: Fallback — find feed update divs
    if (unique.length < 2) {
      const feedItems = document.querySelectorAll(
        'div.feed-shared-update-v2, ' +
        'div[data-urn*="activity"], ' +
        'div[class*="occludable-update"]'
      );
      if (feedItems.length > 0) return feedItems;
    }

    return unique;
  }

  function extractPost(element, profileName) {
    try {
      const innerText = element.innerText || '';
      if (innerText.length < 20) return null;

      // --- CONTENT ---
      let content = '';

      // Try specific content selectors
      const contentEl = element.querySelector(
        '.feed-shared-text, ' +
        '.update-components-text, ' +
        'div[class*="feed-shared-text"], ' +
        'span[class*="break-words"]'
      );

      if (contentEl) {
        content = contentEl.innerText.trim();
      }

      // Fallback: parse innerText
      if (!content || content.length < 15) {
        const lines = innerText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        let contentStartIdx = 0;

        const skipPatterns = [
          /^\d+[KkMm]?\s*followers?$/i,
          /^\d+(st|nd|rd|th)$/,
          /^\d+[hmdw]$/,
          /^\d+\s*(hr|min|hour|day|week|month|yr|year)/i,
          /^Reposted/i,
          /^•$/,
          /^Promoted$/i,
          /^Following$/i,
          /^Status is/i,
          /^offline$/i,
          /^online$/i,
          /^Edited$/i,
        ];

        for (let i = 0; i < Math.min(lines.length, 8); i++) {
          const line = lines[i];
          if (line === profileName) { contentStartIdx = i + 1; continue; }
          if (skipPatterns.some(p => p.test(line))) { contentStartIdx = i + 1; continue; }
          if (i < 4 && line.length < 80 && !line.includes('.') && !line.includes('!') && !line.includes('?')) {
            contentStartIdx = i + 1;
            continue;
          }
          break;
        }

        const footerPatterns = [
          /^Like$/, /^Comment$/, /^Repost$/, /^Send$/, /^Share$/,
          /^\d+\s*likes?$/i, /^\d+\s*comments?$/i, /^\d+\s*reposts?$/i,
          /^Report/i, /^Save$/i, /^Unsave$/i, /^Copy link/i,
        ];

        const contentLines = [];
        for (let i = contentStartIdx; i < lines.length; i++) {
          if (footerPatterns.some(p => p.test(lines[i]))) break;
          if (lines[i] === '…see more' || lines[i] === '...see more') continue;
          contentLines.push(lines[i]);
        }

        content = contentLines.join('\n');
      }

      content = content.replace(/…see more$/g, '').replace(/\.\.\.see more$/g, '').trim();

      // --- URL ---
      const linkEl = element.querySelector(
        'a[href*="/feed/update/"], ' +
        'a[href*="/posts/"], ' +
        'a[href*="/pulse/"]'
      );
      const postUrl = linkEl ? linkEl.href : '';

      // --- DATE ---
      let date = '';
      const timeEl = element.querySelector('time');
      if (timeEl) {
        date = timeEl.getAttribute('datetime') || timeEl.innerText.trim();
      } else {
        const timeMatch = innerText.match(/\b(\d+[hmdw]|(\d+)\s*(hr|min|hour|day|week|month|yr|year)s?\s*ago)\b/i);
        if (timeMatch) date = timeMatch[0];
      }

      // --- ENGAGEMENT ---
      let reactions = '';
      let comments = '';
      let reposts = '';

      const reactionsEl = element.querySelector(
        '.social-details-social-counts__reactions-count, ' +
        'span[class*="reactions-count"], ' +
        'button[aria-label*="reaction" i] span'
      );
      if (reactionsEl) reactions = reactionsEl.innerText.trim();

      const commentsEl = element.querySelector(
        'button[aria-label*="comment" i] span, ' +
        '.social-details-social-counts__comments'
      );
      if (commentsEl) comments = commentsEl.innerText.trim().replace(/[^0-9KkMm.]/g, '');

      const repostsEl = element.querySelector(
        'button[aria-label*="repost" i] span'
      );
      if (repostsEl) reposts = repostsEl.innerText.trim().replace(/[^0-9KkMm.]/g, '');

      // --- ID ---
      const id = postUrl || (profileName + '::' + content.substring(0, 80));

      if (!content && !postUrl) return null;

      return {
        id: id,
        author: profileName,
        content: content.substring(0, 5000),
        url: postUrl,
        date: date,
        reactions: reactions,
        comments: comments,
        reposts: reposts,
      };
    } catch (e) {
      return null;
    }
  }

  async function exportProfilePosts(format) {
    try {
      const profileName = getProfileName();
      notify('progress', `🔄 Navigating to ${profileName}'s posts...`);

      // Navigate to posts/activity tab if needed
      await navigateToPostsTab();
      await sleep(2000);

      // Expand visible posts
      notify('progress', '🔄 Expanding truncated posts...');
      await expandAllPosts();
      await sleep(1000);

      const posts = await autoScroll();

      if (posts.length === 0) {
        notify('error', 'No posts found. Make sure you\'re on a LinkedIn profile page with visible posts.');
        isRunning = false;
        return;
      }

      notify('progress', `📦 Preparing ${posts.length} posts for export as ${format.toUpperCase()}...`);

      const safeProfileName = profileName.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '-').substring(0, 30);

      const exportData = posts.map((p, i) => ({
        '#': i + 1,
        'Author': p.author,
        'Content': p.content,
        'URL': p.url,
        'Date': p.date,
        'Reactions': p.reactions,
        'Comments': p.comments,
        'Reposts': p.reposts,
      }));

      const filename = `linkedin-profile-${safeProfileName}`;

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
      const backup = localStorage.getItem('__sbe_profile_li_backup');
      const backupTime = localStorage.getItem('__sbe_profile_li_backup_time');
      const backupName = localStorage.getItem('__sbe_profile_li_backup_name') || 'unknown';
      if (!backup) {
        notify('error', 'No backup found. Run the export first.');
        return;
      }
      const posts = JSON.parse(backup);
      notify('progress', `🔄 Recovered ${posts.length} posts from ${backupName} (saved ${backupTime}). Exporting...`);

      const safeProfileName = backupName.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '-').substring(0, 30);

      const exportData = posts.map((p, i) => ({
        '#': i + 1,
        'Author': p.author,
        'Content': p.content,
        'URL': p.url,
        'Date': p.date,
        'Reactions': p.reactions,
        'Comments': p.comments,
        'Reposts': p.reposts,
      }));

      const filename = `linkedin-profile-${safeProfileName}-recovered`;

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
      { wch: 25 },  // Author
      { wch: 100 }, // Content
      { wch: 60 },  // URL
      { wch: 15 },  // Date
      { wch: 10 },  // Reactions
      { wch: 10 },  // Comments
      { wch: 10 },  // Reposts
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Profile Posts');
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
