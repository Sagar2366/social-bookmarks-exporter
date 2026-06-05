// Popup controller
document.addEventListener('DOMContentLoaded', () => {
  const btnLinkedIn = document.getElementById('btn-linkedin');
  const btnTwitter = document.getElementById('btn-twitter');
  const btnStopLi = document.getElementById('btn-stop-linkedin');
  const btnStopTw = document.getElementById('btn-stop-twitter');
  const btnRecoverLi = document.getElementById('btn-recover-linkedin');
  const btnRecoverTw = document.getElementById('btn-recover-twitter');
  const liStatus = document.getElementById('li-status');
  const twStatus = document.getElementById('tw-status');
  const liProgress = document.getElementById('li-progress');
  const twProgress = document.getElementById('tw-progress');

  function getFormat(name) {
    return document.querySelector(`input[name="${name}"]:checked`).value;
  }

  function setStatus(el, msg, type = '') {
    el.textContent = msg;
    el.className = `status ${type}`;
  }

  function showStopBtn(platform, show) {
    const btn = platform === 'li' ? btnStopLi : btnStopTw;
    btn.style.display = show ? 'flex' : 'none';
  }

  btnLinkedIn.addEventListener('click', async () => {
    const format = getFormat('li-format');
    btnLinkedIn.disabled = true;
    liProgress.classList.add('active');
    showStopBtn('li', true);
    setStatus(liStatus, 'Checking if you\'re on LinkedIn saved posts page...');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab.url.includes('linkedin.com/my-items/saved-posts')) {
        setStatus(liStatus, '⚠️ Please navigate to LinkedIn → My Items → Saved Posts first', 'error');
        chrome.tabs.update(tab.id, { url: 'https://www.linkedin.com/my-items/saved-posts/' });
        btnLinkedIn.disabled = false;
        liProgress.classList.remove('active');
        showStopBtn('li', false);
        return;
      }

      setStatus(liStatus, '📜 Scrolling and collecting posts... please wait');

      chrome.tabs.sendMessage(tab.id, {
        action: 'exportLinkedIn',
        format: format
      });

    } catch (err) {
      setStatus(liStatus, `❌ Error: ${err.message}`, 'error');
      btnLinkedIn.disabled = false;
      liProgress.classList.remove('active');
      showStopBtn('li', false);
    }
  });

  btnTwitter.addEventListener('click', async () => {
    const format = getFormat('tw-format');
    btnTwitter.disabled = true;
    twProgress.classList.add('active');
    showStopBtn('tw', true);
    setStatus(twStatus, 'Checking if you\'re on Twitter bookmarks page...');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab.url.includes('/i/bookmarks')) {
        setStatus(twStatus, '⚠️ Please navigate to X/Twitter Bookmarks first', 'error');
        chrome.tabs.update(tab.id, { url: 'https://x.com/i/bookmarks' });
        btnTwitter.disabled = false;
        twProgress.classList.remove('active');
        showStopBtn('tw', false);
        return;
      }

      setStatus(twStatus, '📜 Scrolling and collecting bookmarks... please wait');

      chrome.tabs.sendMessage(tab.id, {
        action: 'exportTwitter',
        format: format
      });

    } catch (err) {
      setStatus(twStatus, `❌ Error: ${err.message}`, 'error');
      btnTwitter.disabled = false;
      twProgress.classList.remove('active');
      showStopBtn('tw', false);
    }
  });

  // Stop buttons
  btnStopLi.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { action: 'stopLinkedIn' });
    setStatus(liStatus, '🛑 Stopping... will export what we have so far');
  });

  btnStopTw.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { action: 'stopTwitter' });
    setStatus(twStatus, '🛑 Stopping... will export what we have so far');
  });

  // Recover buttons
  btnRecoverLi.addEventListener('click', async () => {
    const format = getFormat('li-format');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { action: 'recoverLinkedIn', format });
    setStatus(liStatus, '🔄 Attempting recovery from last backup...');
  });

  btnRecoverTw.addEventListener('click', async () => {
    const format = getFormat('tw-format');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { action: 'recoverTwitter', format });
    setStatus(twStatus, '🔄 Attempting recovery from last backup...');
  });

  // Listen for messages from content scripts
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.source === 'linkedin') {
      if (msg.type === 'progress') {
        setStatus(liStatus, msg.text);
      } else if (msg.type === 'done') {
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
      if (msg.type === 'progress') {
        setStatus(twStatus, msg.text);
      } else if (msg.type === 'done') {
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
    }
  });
});
