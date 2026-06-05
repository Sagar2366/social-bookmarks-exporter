// Popup controller
document.addEventListener('DOMContentLoaded', () => {
  const btnLinkedIn = document.getElementById('btn-linkedin');
  const btnTwitter = document.getElementById('btn-twitter');
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

  btnLinkedIn.addEventListener('click', async () => {
    const format = getFormat('li-format');
    btnLinkedIn.disabled = true;
    liProgress.classList.add('active');
    setStatus(liStatus, 'Checking if you\'re on LinkedIn saved posts page...');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab.url.includes('linkedin.com/my-items/saved-posts')) {
        setStatus(liStatus, '⚠️ Please navigate to LinkedIn → My Items → Saved Posts first', 'error');
        // Open the page for them
        chrome.tabs.update(tab.id, { url: 'https://www.linkedin.com/my-items/saved-posts/' });
        btnLinkedIn.disabled = false;
        liProgress.classList.remove('active');
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
    }
  });

  btnTwitter.addEventListener('click', async () => {
    const format = getFormat('tw-format');
    btnTwitter.disabled = true;
    twProgress.classList.add('active');
    setStatus(twStatus, 'Checking if you\'re on Twitter bookmarks page...');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab.url.includes('/i/bookmarks')) {
        setStatus(twStatus, '⚠️ Please navigate to X/Twitter Bookmarks first', 'error');
        chrome.tabs.update(tab.id, { url: 'https://x.com/i/bookmarks' });
        btnTwitter.disabled = false;
        twProgress.classList.remove('active');
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
    }
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
      } else if (msg.type === 'error') {
        setStatus(liStatus, `❌ ${msg.text}`, 'error');
        btnLinkedIn.disabled = false;
        liProgress.classList.remove('active');
      }
    } else if (msg.source === 'twitter') {
      if (msg.type === 'progress') {
        setStatus(twStatus, msg.text);
      } else if (msg.type === 'done') {
        setStatus(twStatus, `✅ Exported ${msg.count} bookmarks successfully!`, 'success');
        btnTwitter.disabled = false;
        twProgress.classList.remove('active');
      } else if (msg.type === 'error') {
        setStatus(twStatus, `❌ ${msg.text}`, 'error');
        btnTwitter.disabled = false;
        twProgress.classList.remove('active');
      }
    }
  });
});
