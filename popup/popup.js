// Popup controller
document.addEventListener('DOMContentLoaded', () => {
  const btnLinkedIn = document.getElementById('btn-linkedin');
  const btnTwitter = document.getElementById('btn-twitter');
  const btnProfile = document.getElementById('btn-profile');
  const btnMash = document.getElementById('btn-mash');
  const btnStopLi = document.getElementById('btn-stop-linkedin');
  const btnStopTw = document.getElementById('btn-stop-twitter');
  const btnStopPf = document.getElementById('btn-stop-profile');
  const btnStopMash = document.getElementById('btn-stop-mash');
  const btnRecoverLi = document.getElementById('btn-recover-linkedin');
  const btnRecoverTw = document.getElementById('btn-recover-twitter');
  const btnRecoverPf = document.getElementById('btn-recover-profile');
  const btnRecoverMash = document.getElementById('btn-recover-mash');
  const liStatus = document.getElementById('li-status');
  const twStatus = document.getElementById('tw-status');
  const pfStatus = document.getElementById('pf-status');
  const mashStatus = document.getElementById('mash-status');
  const liProgress = document.getElementById('li-progress');
  const twProgress = document.getElementById('tw-progress');
  const pfProgress = document.getElementById('pf-progress');
  const mashProgress = document.getElementById('mash-progress');

  function getFormat(name) {
    return document.querySelector(`input[name="${name}"]:checked`).value;
  }

  function setStatus(el, msg, type = '') {
    if (!el) return;
    el.textContent = msg;
    el.className = `status ${type}`;
  }

  function showStopBtn(platform, show) {
    const btnMap = { li: btnStopLi, tw: btnStopTw, pf: btnStopPf, mash: btnStopMash };
    const btn = btnMap[platform];
    if (btn) btn.style.display = show ? 'flex' : 'none';
  }

  // Helper to inject scripts
  async function injectScripts(tabId, files) {
    try {
      for (const file of files) {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: [file]
        });
      }
      return true;
    } catch (err) {
      console.error('Injection failed:', err);
      return false;
    }
  }

  // --- LinkedIn Saved Posts ---
  btnLinkedIn.addEventListener('click', async () => {
    const format = getFormat('li-format');
    btnLinkedIn.disabled = true;
    liProgress.classList.add('active');
    showStopBtn('li', true);
    setStatus(liStatus, 'Checking if you\'re on LinkedIn...');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab.url || !tab.url.includes('linkedin.com')) {
        setStatus(liStatus, '⚠️ Please navigate to LinkedIn Saved Posts first', 'error');
        chrome.tabs.update(tab.id, { url: 'https://www.linkedin.com/my-items/saved-posts/' });
        btnLinkedIn.disabled = false;
        liProgress.classList.remove('active');
        showStopBtn('li', false);
        return;
      }

      setStatus(liStatus, '💉 Injecting script into page...');

      const injected = await injectScripts(tab.id, ['libs/xlsx.mini.min.js', 'content/linkedin.js']);
      if (!injected) {
        setStatus(liStatus, '❌ Failed to inject script. Try refreshing the page.', 'error');
        btnLinkedIn.disabled = false;
        liProgress.classList.remove('active');
        showStopBtn('li', false);
        return;
      }

      await new Promise(r => setTimeout(r, 800));
      setStatus(liStatus, '📜 Scrolling and collecting posts... please wait');

      chrome.tabs.sendMessage(tab.id, { action: 'exportLinkedIn', format });

    } catch (err) {
      setStatus(liStatus, `❌ Error: ${err.message}`, 'error');
      btnLinkedIn.disabled = false;
      liProgress.classList.remove('active');
      showStopBtn('li', false);
    }
  });

  // --- Twitter Bookmarks ---
  btnTwitter.addEventListener('click', async () => {
    const format = getFormat('tw-format');
    btnTwitter.disabled = true;
    twProgress.classList.add('active');
    showStopBtn('tw', true);
    setStatus(twStatus, 'Checking if you\'re on Twitter bookmarks page...');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab.url || !tab.url.includes('/i/bookmarks')) {
        setStatus(twStatus, '⚠️ Please navigate to X/Twitter Bookmarks first', 'error');
        chrome.tabs.update(tab.id, { url: 'https://x.com/i/bookmarks' });
        btnTwitter.disabled = false;
        twProgress.classList.remove('active');
        showStopBtn('tw', false);
        return;
      }

      setStatus(twStatus, '📜 Scrolling and collecting bookmarks... please wait');
      chrome.tabs.sendMessage(tab.id, { action: 'exportTwitter', format });

    } catch (err) {
      setStatus(twStatus, `❌ Error: ${err.message}`, 'error');
      btnTwitter.disabled = false;
      twProgress.classList.remove('active');
      showStopBtn('tw', false);
    }
  });

  // --- Profile Posts Export ---
  btnProfile.addEventListener('click', async () => {
    const format = getFormat('pf-format');
    btnProfile.disabled = true;
    pfProgress.classList.add('active');
    showStopBtn('pf', true);
    setStatus(pfStatus, 'Detecting platform...');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = tab.url || '';

      // Detect: LinkedIn profile
      if (url.match(/linkedin\.com\/(in|company)\/[^/]+/)) {
        setStatus(pfStatus, '💉 Injecting LinkedIn profile scraper...');

        // Clear any previous injection flag
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => { window.__sbe_profile_li_loaded = false; }
        });

        const injected = await injectScripts(tab.id, ['libs/xlsx.mini.min.js', 'content/profile-linkedin.js']);
        if (!injected) {
          setStatus(pfStatus, '❌ Failed to inject. Try refreshing the page.', 'error');
          btnProfile.disabled = false;
          pfProgress.classList.remove('active');
          showStopBtn('pf', false);
          return;
        }

        await new Promise(r => setTimeout(r, 1500));
        setStatus(pfStatus, '📜 Scrolling profile posts...');

        // Retry message sending in case script isn't ready
        let sent = false;
        for (let i = 0; i < 3; i++) {
          try {
            await chrome.tabs.sendMessage(tab.id, { action: 'exportProfileLinkedIn', format });
            sent = true;
            break;
          } catch (e) {
            await new Promise(r => setTimeout(r, 1000));
          }
        }

        if (!sent) {
          setStatus(pfStatus, '❌ Could not start. Refresh the page and try again.', 'error');
          btnProfile.disabled = false;
          pfProgress.classList.remove('active');
          showStopBtn('pf', false);
        }

      // Detect: Twitter/X profile
      } else if (url.match(/(?:twitter\.com|x\.com)\/[^/]+\/?$/) &&
                 !url.includes('/i/') && !url.includes('/home') &&
                 !url.includes('/search') && !url.includes('/explore')) {
        setStatus(pfStatus, '💉 Injecting Twitter profile scraper...');

        const injected = await injectScripts(tab.id, ['libs/xlsx.mini.min.js', 'content/profile-twitter.js']);
        if (!injected) {
          setStatus(pfStatus, '❌ Failed to inject. Try refreshing the page.', 'error');
          btnProfile.disabled = false;
          pfProgress.classList.remove('active');
          showStopBtn('pf', false);
          return;
        }

        await new Promise(r => setTimeout(r, 800));
        setStatus(pfStatus, '📜 Scrolling profile tweets...');
        chrome.tabs.sendMessage(tab.id, { action: 'exportProfileTwitter', format });

      } else {
        setStatus(pfStatus, '⚠️ Not on a profile page. Go to a LinkedIn or Twitter profile first.', 'error');
        btnProfile.disabled = false;
        pfProgress.classList.remove('active');
        showStopBtn('pf', false);
      }

    } catch (err) {
      setStatus(pfStatus, `❌ Error: ${err.message}`, 'error');
      btnProfile.disabled = false;
      pfProgress.classList.remove('active');
      showStopBtn('pf', false);
    }
  });

  // --- LinkedMash Export ---
  btnMash.addEventListener('click', async () => {
    const format = getFormat('mash-format');
    btnMash.disabled = true;
    mashProgress.classList.add('active');
    showStopBtn('mash', true);
    setStatus(mashStatus, 'Checking if you\'re on LinkedMash...');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab.url || !tab.url.includes('linkedmash.com')) {
        setStatus(mashStatus, '⚠️ Please navigate to linkedmash.com/explore first', 'error');
        chrome.tabs.update(tab.id, { url: 'https://www.linkedmash.com/explore' });
        btnMash.disabled = false;
        mashProgress.classList.remove('active');
        showStopBtn('mash', false);
        return;
      }

      setStatus(mashStatus, '💉 Injecting scraper...');

      const injected = await injectScripts(tab.id, ['libs/xlsx.mini.min.js', 'content/linkedinmash.js']);
      if (!injected) {
        setStatus(mashStatus, '❌ Failed to inject. Try refreshing the page.', 'error');
        btnMash.disabled = false;
        mashProgress.classList.remove('active');
        showStopBtn('mash', false);
        return;
      }

      await new Promise(r => setTimeout(r, 800));
      setStatus(mashStatus, '📜 Scrolling and collecting all 7863 posts...');
      chrome.tabs.sendMessage(tab.id, { action: 'exportLinkedInMash', format });

    } catch (err) {
      setStatus(mashStatus, `❌ Error: ${err.message}`, 'error');
      btnMash.disabled = false;
      mashProgress.classList.remove('active');
      showStopBtn('mash', false);
    }
  });

  // --- Stop buttons ---
  if (btnStopLi) {
    btnStopLi.addEventListener('click', async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      chrome.tabs.sendMessage(tab.id, { action: 'stopLinkedIn' });
      setStatus(liStatus, '🛑 Stopping... will export what we have so far');
    });
  }

  if (btnStopTw) {
    btnStopTw.addEventListener('click', async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      chrome.tabs.sendMessage(tab.id, { action: 'stopTwitter' });
      setStatus(twStatus, '🛑 Stopping... will export what we have so far');
    });
  }

  if (btnStopPf) {
    btnStopPf.addEventListener('click', async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = tab.url || '';
      if (url.includes('linkedin.com')) {
        chrome.tabs.sendMessage(tab.id, { action: 'stopProfileLinkedIn' });
      } else {
        chrome.tabs.sendMessage(tab.id, { action: 'stopProfileTwitter' });
      }
      setStatus(pfStatus, '🛑 Stopping... will export what we have so far');
    });
  }

  if (btnStopMash) {
    btnStopMash.addEventListener('click', async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      chrome.tabs.sendMessage(tab.id, { action: 'stopLinkedInMash' });
      setStatus(mashStatus, '🛑 Stopping... will export what we have so far');
    });
  }

  // --- Recover buttons ---
  if (btnRecoverLi) {
    btnRecoverLi.addEventListener('click', async () => {
      const format = getFormat('li-format');
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await injectScripts(tab.id, ['libs/xlsx.mini.min.js', 'content/linkedin.js']);
      await new Promise(r => setTimeout(r, 500));
      chrome.tabs.sendMessage(tab.id, { action: 'recoverLinkedIn', format });
      setStatus(liStatus, '🔄 Attempting recovery from last backup...');
    });
  }

  if (btnRecoverTw) {
    btnRecoverTw.addEventListener('click', async () => {
      const format = getFormat('tw-format');
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      chrome.tabs.sendMessage(tab.id, { action: 'recoverTwitter', format });
      setStatus(twStatus, '🔄 Attempting recovery from last backup...');
    });
  }

  if (btnRecoverPf) {
    btnRecoverPf.addEventListener('click', async () => {
      const format = getFormat('pf-format');
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = tab.url || '';
      if (url.includes('linkedin.com')) {
        await injectScripts(tab.id, ['libs/xlsx.mini.min.js', 'content/profile-linkedin.js']);
        await new Promise(r => setTimeout(r, 500));
        chrome.tabs.sendMessage(tab.id, { action: 'recoverProfileLinkedIn', format });
      } else {
        await injectScripts(tab.id, ['libs/xlsx.mini.min.js', 'content/profile-twitter.js']);
        await new Promise(r => setTimeout(r, 500));
        chrome.tabs.sendMessage(tab.id, { action: 'recoverProfileTwitter', format });
      }
      setStatus(pfStatus, '🔄 Attempting recovery from last backup...');
    });
  }

  if (btnRecoverMash) {
    btnRecoverMash.addEventListener('click', async () => {
      const format = getFormat('mash-format');
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await injectScripts(tab.id, ['libs/xlsx.mini.min.js', 'content/linkedinmash.js']);
      await new Promise(r => setTimeout(r, 500));
      chrome.tabs.sendMessage(tab.id, { action: 'recoverLinkedInMash', format });
      setStatus(mashStatus, '🔄 Attempting recovery from last backup...');
    });
  }

  // --- Listen for messages from content scripts ---
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.source === 'linkedin') {
      if (msg.type === 'progress') setStatus(liStatus, msg.text);
      else if (msg.type === 'done') {
        setStatus(liStatus, `✅ Exported ${msg.count} posts successfully!`, 'success');
        btnLinkedIn.disabled = false;
        liProgress.classList.remove('active');
        showStopBtn('li', false);
      } else if (msg.type === 'error') {
        setStatus(liStatus, `❌ ${msg.text}`, 'error');
        btnLinkedIn.disabled = false;
        liProgress.classList.remove('active');
        showStopBtn('li', false);
      }
    } else if (msg.source === 'twitter') {
      if (msg.type === 'progress') setStatus(twStatus, msg.text);
      else if (msg.type === 'done') {
        setStatus(twStatus, `✅ Exported ${msg.count} bookmarks successfully!`, 'success');
        btnTwitter.disabled = false;
        twProgress.classList.remove('active');
        showStopBtn('tw', false);
      } else if (msg.type === 'error') {
        setStatus(twStatus, `❌ ${msg.text}`, 'error');
        btnTwitter.disabled = false;
        twProgress.classList.remove('active');
        showStopBtn('tw', false);
      }
    } else if (msg.source === 'profile-linkedin' || msg.source === 'profile-twitter') {
      if (msg.type === 'progress') setStatus(pfStatus, msg.text);
      else if (msg.type === 'done') {
        setStatus(pfStatus, `✅ Exported ${msg.count} posts successfully!`, 'success');
        btnProfile.disabled = false;
        pfProgress.classList.remove('active');
        showStopBtn('pf', false);
      } else if (msg.type === 'error') {
        setStatus(pfStatus, `❌ ${msg.text}`, 'error');
        btnProfile.disabled = false;
        pfProgress.classList.remove('active');
        showStopBtn('pf', false);
      }
    } else if (msg.source === 'linkedinmash') {
      if (msg.type === 'progress') setStatus(mashStatus, msg.text);
      else if (msg.type === 'done') {
        setStatus(mashStatus, `✅ Exported ${msg.count} posts successfully!`, 'success');
        btnMash.disabled = false;
        mashProgress.classList.remove('active');
        showStopBtn('mash', false);
      } else if (msg.type === 'error') {
        setStatus(mashStatus, `❌ ${msg.text}`, 'error');
        btnMash.disabled = false;
        mashProgress.classList.remove('active');
        showStopBtn('mash', false);
      }
    }
  });
});
