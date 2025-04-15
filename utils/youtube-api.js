/**
 * YouTube API Utilities
 * Handles interactions with YouTube's API and page content
 */

// Create a namespace for the YouTube API utilities
window.YouTubeAPI = {};

// Extract video ID from a YouTube URL
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

// Check if a URL is a valid YouTube URL
window.YouTubeAPI.isValidYouTubeUrl = function(url) {
  if (!url) return false;
  
  // Check for watch, embed, and short URLs
  return (
    url.includes('youtube.com/watch') ||
    url.includes('youtu.be/') ||
    url.includes('youtube.com/embed/') ||
    url.includes('youtube.com/shorts/')
  );
};

// Get video information from YouTube
window.YouTubeAPI.getVideoInfo = async function(videoId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'getVideoInfo',
        videoId: videoId
      }, function(response) {
        if (chrome.runtime.lastError) {
          console.error('Error getting video info:', chrome.runtime.lastError);
          // Return basic info on error
          resolve({
            id: videoId,
            title: `YouTube Video (${videoId})`,
            channel: 'Unknown Channel',
            duration: 0,
            url: `https://www.youtube.com/watch?v=${videoId}`
          });
          return;
        }
        
        if (response && response.error) {
          console.warn('Video info error:', response.error);
          // Return basic info if error
          resolve({
            id: videoId,
            title: `YouTube Video (${videoId})`,
            channel: 'Unknown Channel',
            duration: 0,
            url: `https://www.youtube.com/watch?v=${videoId}`
          });
          return;
        }
        
        // Return the video information
        resolve(response || {
          id: videoId,
          title: `YouTube Video (${videoId})`,
          channel: 'Unknown Channel',
          duration: 0,
          url: `https://www.youtube.com/watch?v=${videoId}`
        });
      });
    });
  });
};

// Format video duration in seconds to MM:SS or HH:MM:SS
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

// Navigate to a specific timestamp in the video
window.YouTubeAPI.navigateToTimestamp = function(seconds) {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, {
      action: 'seekTo',
      seconds: parseInt(seconds)
    });
  });
};
