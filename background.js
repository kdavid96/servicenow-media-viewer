/**
 * ServiceNow Media & Comments Viewer
 * Background service worker
 */

// Listen for extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  // Check if we're on a ServiceNow page
  if (!tab.url || !tab.url.includes('service-now.com')) {
    console.log('SNMV: Not a ServiceNow page');
    return;
  }

  // Send message to content script to open modal
  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'toggleModal' });
  } catch (error) {
    // Content script might not be loaded, inject it
    console.log('SNMV: Injecting content script');
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['styles.css']
    });
  }
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getRecordData') {
    // Could be used for cross-origin requests if needed
    sendResponse({ success: true });
  }
  return true;
});
