/**
 * YouTube API Utilities
 * 
 * Handles interactions with YouTube including URL validation, video ID extraction,
 * and video information retrieval.
 */

// Define YouTubeAPI namespace on window object
window.YouTubeAPI = {};

/**
 * Extract video ID from YouTube URL
 * @param {string} url - YouTube URL
 * @returns {string|null} - Video ID or null
 */
window.YouTubeAPI.extractVideoId = function(url) {
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
};

/**
 * Validate YouTube URL
 * @param {string} url - URL to validate
 * @returns {boolean} - Whether URL is valid YouTube URL
 */
window.YouTubeAPI.isValidYouTubeUrl = function(url) {
  if (!url) return false;
  
  return (
    url.includes('youtube.com/watch') || 
    url.includes('youtu.be/') || 
    url.includes('youtube.com/shorts/')
  );
};

/**
 * Get video information from active tab
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<Object>} - Video information
 */
window.YouTubeAPI.getVideoInfo = function(videoId) {
  return new Promise((resolve, reject) => {
    console.log('[YT-Summarizer] Getting video info for', videoId);
    
    // Query for active tab
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (!tabs || tabs.length === 0) {
        console.error('[YT-Summarizer] No active tab found');
        // Return basic info without failing
        resolve({
          id: videoId,
          title: `YouTube Video ${videoId}`,
          channel: 'Unknown Channel',
          duration: 0
        });
        return;
      }
      
      const currentTab = tabs[0];
      console.log('[YT-Summarizer] Found active tab:', currentTab.url);
      
      // Check if the current tab is a YouTube page
      const isYouTube = currentTab.url && currentTab.url.includes('youtube.com/watch');
      
      if (isYouTube) {
        // Send message to content script to get video info
        console.log('[YT-Summarizer] Requesting video info from content script');
        
        chrome.tabs.sendMessage(currentTab.id, {
          action: 'getVideoInfo',
          videoId: videoId
        }, function(response) {
          // Handle errors in message passing
          if (chrome.runtime.lastError) {
            console.error('[YT-Summarizer] Error getting video info:', chrome.runtime.lastError);
            // Return basic info on error
            resolve({
              id: videoId,
              title: `YouTube Video (${videoId})`,
              channel: 'Unknown Channel',
              duration: 0
            });
            return;
          }
          
          if (response && response.error) {
            console.error('[YT-Summarizer] Content script error:', response.error);
          }
          
          if (response && !response.error) {
            resolve(response);
          } else {
            // Return basic info if we couldn't get actual info
            resolve({
              id: videoId,
              title: `YouTube Video (${videoId})`,
              channel: 'Unknown Channel',
              duration: 0
            });
          }
        });
      } else {
        // Not on YouTube, return basic info
        console.log('[YT-Summarizer] Not on YouTube, returning basic info');
        resolve({
          id: videoId,
          title: `YouTube Video (${videoId})`,
          channel: 'Unknown Channel',
          duration: 0
        });
      }
    });
  });
};

/**
 * Format video duration in seconds to MM:SS or HH:MM:SS
 * @param {number} seconds - Video duration in seconds
 * @returns {string} - Formatted duration
 */
window.YouTubeAPI.formatDuration = function(seconds) {
  if (!seconds) return 'Unknown';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
};

/**
 * Navigate to a specific timestamp in a YouTube video
 * @param {number} seconds - Timestamp in seconds
 */
window.YouTubeAPI.navigateToTimestamp = function(seconds) {
  if (!seconds && seconds !== 0) {
    console.error('[YT-Summarizer] Invalid timestamp:', seconds);
    return;
  }
  
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (!tabs || tabs.length === 0) {
      console.error('[YT-Summarizer] No active tab found');
      return;
    }
    
    const currentTab = tabs[0];
    const isYouTube = currentTab.url && currentTab.url.includes('youtube.com/watch');
    
    if (isYouTube) {
      // Send message to content script to seek to timestamp
      chrome.tabs.sendMessage(currentTab.id, {
        action: 'seekTo',
        seconds: seconds
      }, function(response) {
        if (chrome.runtime.lastError) {
          console.error('[YT-Summarizer] Error seeking:', chrome.runtime.lastError);
        }
      });
    }
  });
};

// Log that the YouTube API utilities are loaded
console.log('[YT-Summarizer] YouTube API utilities loaded');
