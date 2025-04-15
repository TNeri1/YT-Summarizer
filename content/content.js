/**
 * YT-Summarizer Content Script
 * 
 * Handles interactions with YouTube pages to extract video information and transcripts
 */

// Global state for caching
let transcriptCache = {};

// Initialize when content script loads
console.log('[YT-Summarizer] Content script loaded');

// Listen for messages from popup or background script
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('[YT-Summarizer] Received message:', request.action);
  
  // Handle transcript retrieval
  if (request.action === 'getTranscript') {
    extractTranscript(request.videoId)
      .then(transcript => {
        console.log('[YT-Summarizer] Transcript extracted, segments:', transcript ? transcript.length : 0);
        sendResponse({transcript: transcript});
      })
      .catch(error => {
        console.error('[YT-Summarizer] Error extracting transcript:', error);
        sendResponse({error: error.message});
      });
    return true; // Required for async sendResponse
  }
  
  // Handle video info retrieval
  if (request.action === 'getVideoInfo') {
    extractVideoInfo()
      .then(info => {
        console.log('[YT-Summarizer] Video info extracted:', info);
        sendResponse(info);
      })
      .catch(error => {
        console.error('[YT-Summarizer] Error extracting video info:', error);
        sendResponse({error: error.message});
      });
    return true;
  }
  
  // Handle video seeking to timestamp
  if (request.action === 'seekTo') {
    const seconds = request.seconds;
    if (typeof seconds === 'number') {
      const videoElement = document.querySelector('video');
      if (videoElement) {
        videoElement.currentTime = seconds;
        videoElement.play();
        sendResponse({success: true});
      } else {
        sendResponse({error: 'Video element not found'});
      }
    } else {
      sendResponse({error: 'Invalid seconds value'});
    }
    return true;
  }
});

/**
 * Extracts transcript from YouTube page
 * @param {string} videoId - Video ID requested
 * @returns {Promise<Array>} - Array of transcript segments
 */
async function extractTranscript(videoId) {
  try {
    console.log('[YT-Summarizer] Extracting transcript for video ID:', videoId);
    
    // Check cache first
    if (transcriptCache[videoId]) {
      console.log('[YT-Summarizer] Returning cached transcript');
      return transcriptCache[videoId];
    }
    
    // First, check if we're on a YouTube video page
    if (!window.location.href.includes('youtube.com/watch')) {
      throw new Error('Not on a YouTube video page');
    }
    
    // Try to extract transcript directly from page
    console.log('[YT-Summarizer] Attempting to extract transcript from page');
    
    // Look for transcript button and click it if not already open
    let transcriptPanel = document.querySelector('ytd-transcript-renderer');
    
    if (!transcriptPanel) {
      // Find and click transcript button
      const transcriptButton = await findTranscriptButton();
      if (!transcriptButton) {
        throw new Error('No transcript button found');
      }
      
      console.log('[YT-Summarizer] Clicking transcript button');
      transcriptButton.click();
      
      // Wait for panel to appear
      await new Promise(resolve => setTimeout(resolve, 2000));
      transcriptPanel = document.querySelector('ytd-transcript-renderer');
      
      if (!transcriptPanel) {
        throw new Error('Transcript panel did not open');
      }
    }
    
    // Extract transcript segments
    const segments = [];
    const transcriptItems = transcriptPanel.querySelectorAll('ytd-transcript-segment-renderer');
    
    if (!transcriptItems || transcriptItems.length === 0) {
      throw new Error('No transcript segments found');
    }
    
    console.log('[YT-Summarizer] Found transcript items:', transcriptItems.length);
    
    // Process each segment
    transcriptItems.forEach((item, index) => {
      const timeElement = item.querySelector('.segment-timestamp');
      const textElement = item.querySelector('.segment-text');
      
      if (timeElement && textElement) {
        const timeText = timeElement.textContent.trim();
        const text = textElement.textContent.trim();
        
        // Calculate seconds from timestamp (MM:SS)
        let seconds = 0;
        const timeParts = timeText.split(':');
        if (timeParts.length === 2) {
          seconds = parseInt(timeParts[0]) * 60 + parseInt(timeParts[1]);
        } else if (timeParts.length === 3) {
          seconds = parseInt(timeParts[0]) * 3600 + parseInt(timeParts[1]) * 60 + parseInt(timeParts[2]);
        }
        
        segments.push({
          text: text,
          timestamp: timeText,
          seconds: seconds,
          index: index
        });
      }
    });
    
    if (segments.length === 0) {
      throw new Error('Failed to extract transcript segments');
    }
    
    console.log('[YT-Summarizer] Extracted transcript segments:', segments.length);
    
    // Cache the result
    transcriptCache[videoId] = segments;
    return segments;
    
  } catch (error) {
    console.error('[YT-Summarizer] Transcript extraction error:', error);
    throw error;
  }
}

/**
 * Extracts video info directly from the YouTube page
 * @returns {Promise<Object>} - Video information
 */
async function extractVideoInfo() {
  try {
    if (!window.location.href.includes('youtube.com/watch')) {
      throw new Error('Not a YouTube video page');
    }
    
    // Get video ID
    const url = window.location.href;
    const videoId = extractVideoIdFromUrl(url);
    if (!videoId) {
      throw new Error('Could not extract video ID');
    }
    
    // Extract title from page
    const titleElement = document.querySelector('h1.title');
    const title = titleElement ? titleElement.textContent.trim() : 'Unknown Title';
    
    // Extract channel name
    const channelElement = document.querySelector('div#owner-name a');
    const channel = channelElement ? channelElement.textContent.trim() : 'Unknown Channel';
    
    // Extract duration (from video element)
    const videoElement = document.querySelector('video');
    const duration = videoElement ? Math.round(videoElement.duration) : 0;
    
    return {
      id: videoId,
      title: title,
      channel: channel,
      duration: duration,
      url: window.location.href
    };
  } catch (error) {
    console.error('[YT-Summarizer] Failed to extract video info:', error);
    throw error;
  }
}

/**
 * Extract video ID from YouTube URL
 * @param {string} url - YouTube URL
 * @returns {string|null} - Video ID or null
 */
function extractVideoIdFromUrl(url) {
  if (!url) return null;
  
  // Handle standard YouTube watch URLs
  const watchRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
  const watchMatch = url.match(watchRegex);
  if (watchMatch) return watchMatch[1];
  
  // Handle YouTube short URLs
  const shortRegex = /youtube\.com\/shorts\/([^"&?\/\s]{11})/i;
  const shortMatch = url.match(shortRegex);
  if (shortMatch) return shortMatch[1];
  
  return null;
}

/**
 * Find the transcript button in YouTube's UI
 * @returns {Promise<Element|null>} - Transcript button element or null
 */
async function findTranscriptButton() {
  // Method 1: Directly find transcript button in newer UI
  const directButton = document.querySelector('button[aria-label="Show transcript"]');
  if (directButton) {
    console.log('[YT-Summarizer] Found direct transcript button');
    return directButton;
  }
  
  // Method 2: Find in more options menu (3 dots below video)
  const moreActionsButton = document.querySelector('button.ytp-button[aria-label="More actions"]');
  if (moreActionsButton) {
    console.log('[YT-Summarizer] Found more actions button, clicking...');
    moreActionsButton.click();
    
    // Wait for menu to appear
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Look for transcript item
    const menuItems = Array.from(document.querySelectorAll('.ytp-menuitem'));
    const transcriptItem = menuItems.find(item => {
      const text = item.textContent.toLowerCase();
      return text.includes('transcript') || text.includes('caption');
    });
    
    if (transcriptItem) {
      console.log('[YT-Summarizer] Found transcript in menu');
      return transcriptItem;
    }
    
    // Close menu by clicking elsewhere
    document.querySelector('.html5-video-container')?.click();
  }
  
  // Method 3: Find in options menu
  const optionsButton = document.querySelector('button#button[aria-label="More actions"]');
  if (optionsButton) {
    console.log('[YT-Summarizer] Found options button, clicking...');
    optionsButton.click();
    
    // Wait for menu to appear
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Look for transcript item
    const menuItems = Array.from(document.querySelectorAll('tp-yt-paper-listbox#items tp-yt-paper-item'));
    const transcriptItem = menuItems.find(item => {
      const text = item.textContent.trim().toLowerCase();
      return text.includes('transcript') || text.includes('caption');
    });
    
    if (transcriptItem) {
      console.log('[YT-Summarizer] Found transcript in options');
      return transcriptItem;
    }
    
    // Close menu
    document.body.click();
  }
  
  console.log('[YT-Summarizer] No transcript button found');
  return null;
}
