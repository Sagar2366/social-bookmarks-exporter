// Service worker - handles background tasks
chrome.runtime.onInstalled.addListener(() => {
  console.log('Social Bookmarks Exporter installed!');
});

// Keep service worker alive during long exports
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Forward messages between content scripts and popup
  if (msg.source === 'linkedin' || msg.source === 'twitter') {
    // Relay to popup
    chrome.runtime.sendMessage(msg).catch(() => {
      // Popup might be closed, that's fine
    });
  }
  return true;
});
