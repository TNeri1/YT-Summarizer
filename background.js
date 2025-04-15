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
  
  // Handle other message types as needed
  return false;
});
