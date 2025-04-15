/**
 * YT-Summarizer Popup Script
 * Handles the popup UI and summarization process
 */

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', initializePopup);

function initializePopup() {
  console.log('Initializing popup');
  
  // Get DOM elements
  const youtubeUrlInput = document.getElementById('youtube-url');
  const summarizeButton = document.getElementById('summarize-button');
  const loadingContainer = document.getElementById('loading-container');
  const loadingMessage = document.getElementById('loading-message');
  const summaryContainer = document.getElementById('summary-container');
  const videoTitleElement = document.getElementById('video-title');
  const summaryContentElement = document.getElementById('summary-content');
  const errorContainer = document.getElementById('error-container');
  const errorMessage = document.getElementById('error-message');
  
  // Add event listeners
  summarizeButton.addEventListener('click', handleSummarizeClick);
  
  // Add timestamp click handler
  document.addEventListener('click', function(e) {
    if (e.target.classList.contains('timestamp')) {
      const seconds = e.target.dataset.seconds;
      if (seconds) {
        window.YouTubeAPI.navigateToTimestamp(parseInt(seconds));
      }
    }
  });
  
  // Auto-populate URL from current tab
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    // First check for videoId in URL params (from context menu)
    const urlParams = new URLSearchParams(window.location.search);
    const videoIdParam = urlParams.get('videoId');
    
    if (videoIdParam) {
      // If we have a videoId parameter, use it directly
      youtubeUrlInput.value = `https://www.youtube.com/watch?v=${videoIdParam}`;
      // Automatically trigger summarization
      setTimeout(() => summarizeButton.click(), 500);
    } else {
      // Otherwise, try to get from current tab
      const url = tabs[0].url;
      if (window.YouTubeAPI.isValidYouTubeUrl(url)) {
        youtubeUrlInput.value = url;
      }
    }
  });
  
  // UI Helper functions
  function showLoading(message) {
    loadingMessage.textContent = message || 'Processing...';
    loadingContainer.classList.add('visible');
    summaryContainer.classList.remove('visible');
    errorContainer.classList.remove('visible');
  }
  
  function hideLoading() {
    loadingContainer.classList.remove('visible');
  }
  
  function showError(message) {
    errorMessage.textContent = message;
    errorContainer.classList.add('visible');
    loadingContainer.classList.remove('visible');
  }
  
  function displaySummary(summary, videoInfo) {
    videoTitleElement.textContent = videoInfo.title || 'YouTube Video';
    summaryContentElement.innerHTML = summary;
    summaryContainer.classList.add('visible');
    loadingContainer.classList.remove('visible');
    errorContainer.classList.remove('visible');
  }
  
  // Main summarization handler
  async function handleSummarizeClick() {
    console.log('Summarize button clicked');
    
    // Clear previous state
    summaryContainer.classList.remove('visible');
    errorContainer.classList.remove('visible');
    
    // Get and validate URL
    const youtubeUrl = youtubeUrlInput.value.trim();
    if (!window.YouTubeAPI.isValidYouTubeUrl(youtubeUrl)) {
      showError('Please enter a valid YouTube URL');
      return;
    }
    
    const videoId = window.YouTubeAPI.extractVideoId(youtubeUrl);
    if (!videoId) {
      showError('Could not extract video ID from URL');
      return;
    }
    
    console.log('Processing video ID:', videoId);
    
    // Show loading indicator
    showLoading('Fetching video information...');
    
    try {
      // Check cache first
      const cachedSummary = await window.TranscriptParser.getCachedSummary(videoId);
      if (cachedSummary) {
        console.log('Using cached summary');
        displaySummary(cachedSummary.summary, cachedSummary.videoInfo);
        return;
      }
      
      // Get video information
      const videoInfo = await window.YouTubeAPI.getVideoInfo(videoId);
      console.log('Video info retrieved:', videoInfo);
      
      // Update loading message
      showLoading('Retrieving transcript...');
      
      // Get transcript
      try {
        const transcript = await window.TranscriptParser.getTranscript(videoId);
        
        if (!transcript || transcript.length === 0) {
          showError('Could not retrieve transcript for this video. Please ensure the video has captions available.');
          return;
        }
        
        // Show loading message for summary generation
        showLoading('Generating summary...');
        
        // Create a basic summary
        const summary = window.TranscriptParser.createBasicSummary(transcript, videoInfo);
        
        // Display the summary
        displaySummary(summary, videoInfo);
        
        // Save to cache
        window.TranscriptParser.saveToCache(videoId, videoInfo, summary);
        
      } catch (transcriptError) {
        console.error('Transcript error:', transcriptError);
        showError(`Could not retrieve transcript: ${transcriptError.message}`);
      }
    } catch (error) {
      console.error('Error during summarization:', error);
      showError(error.message || 'An error occurred while summarizing the video');
    } finally {
      hideLoading();
    }
  }
}
