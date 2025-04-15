/**
 * YT-Summarizer Background Script
 * 
 * Handles browser extension events like installation, context menu creation,
 * and message passing between components
 */

// Initialize the extension when installed or updated
chrome.runtime.onInstalled.addListener(function(details) {
  console.log('YT-Summarizer installed or updated:', details.reason);
  
  // Create context menu for YouTube links
  chrome.contextMenus.create({
    id: 'summarizeYouTubeVideo',
    title: 'Summarize YouTube Video',
    contexts: ['link'],
    targetUrlPatterns: ['*://*.youtube.com/watch?*', '*://*.youtu.be/*']
  });
  
  // Set up default storage values if needed
  chrome.storage.local.get(['summaryCache', 'settings'], function(result) {
    // Initialize cache if not exists
    if (!result.summaryCache) {
      chrome.storage.local.set({summaryCache: {}});
    }
    
    // Initialize settings if not exists
    if (!result.settings) {
      chrome.storage.local.set({
        settings: {
          autoSummarize: false,
          summaryLength: 'medium'
        }
      });
    }
  });
});

// Ensure the content script is injected into YouTube pages if not already
async function ensureContentScriptInjected(tabId, url) {
  // Only for YouTube pages
  if (!url.includes('youtube.com')) return;

  try {
    // Check if content script is already injected by sending a test message
    await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    console.log('Content script already running in tab', tabId);
  } catch (error) {
    console.log('Content script not detected, injecting...', error);
    
    // Inject the content script
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content/content.js']
      });
      console.log('Content script injected successfully');
    } catch (err) {
      console.error('Failed to inject content script:', err);
    }
  }
}

// Listen for tab updates to inject content script when needed
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (changeInfo.status === 'complete' && tab.url) {
    ensureContentScriptInjected(tabId, tab.url);
  }
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(function(info, tab) {
  if (info.menuItemId === 'summarizeYouTubeVideo') {
    const youtubeUrl = info.linkUrl;
    
    // Extract video ID
    let videoId = null;
    const urlMatch = youtubeUrl.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    if (urlMatch && urlMatch[1]) {
      videoId = urlMatch[1];
    }
    
    if (videoId) {
      // Open popup with this video ID
      const popupUrl = chrome.runtime.getURL('popup/popup.html') + '?videoId=' + videoId;
      chrome.windows.create({
        url: popupUrl,
        type: 'popup',
        width: 450,
        height: 600
      });
    }
  }
});

// Listen for messages from other parts of the extension
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('Background script received message:', request.action);
  
  if (request.action === 'openYouTubeVideo') {
    const videoId = request.videoId;
    const timestamp = request.timestamp || 0;
    
    if (videoId) {
      const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}${timestamp ? '&t=' + timestamp + 's' : ''}`;
      chrome.tabs.create({ url: youtubeUrl });
      sendResponse({success: true});
    } else {
      sendResponse({error: 'Invalid video ID'});
    }
    return true;
  }
  
  // Handle direct summarization requests
  if (request.action === 'summarizeDirectly') {
    const videoId = request.videoId;
    if (videoId) {
      // Navigate to YouTube with this video
      chrome.tabs.create({ 
        url: `https://www.youtube.com/watch?v=${videoId}`,
        active: true
      }, function(tab) {
        // Wait for navigation to complete then inject content script
        setTimeout(async () => {
          try {
            await ensureContentScriptInjected(tab.id, tab.url);
            sendResponse({success: true});
          } catch (error) {
            sendResponse({error: 'Failed to prepare for summarization'});
          }
        }, 1500);
      });
      return true;
    }
  }
  
  return false;
});
