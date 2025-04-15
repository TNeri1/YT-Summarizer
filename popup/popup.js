/**
 * YT-Summarizer Popup Script
 * 
 * Handles popup UI interactions, video URL processing, and summary display
 */

// Global state
let currentVideoId = null;
let isProcessing = false;

/**
 * Initialize the popup when DOM is loaded
 */
function initializePopup() {
  console.log('[YT-Summarizer] Initializing popup');
  
  // Get DOM elements
  const urlInput = document.getElementById('video-url');
  const summarizeButton = document.getElementById('summarize-button');
  const summaryContainer = document.getElementById('summary-container');
  const loadingIndicator = document.getElementById('loading-indicator');
  const errorContainer = document.getElementById('error-container');
  const modelInfo = document.getElementById('model-info');
  const modelStatusText = document.getElementById('model-status-text');
  const modelProgressValue = document.getElementById('model-progress-value');
  
  // Initialize model progress event listener
  window.addEventListener('model-progress', (event) => {
    const progress = event.detail;
    modelInfo.style.display = 'block';
    modelStatusText.textContent = progress.detail;
    
    // Update progress bar
    const percentage = Math.round((progress.progress / progress.total) * 100);
    modelProgressValue.style.width = `${percentage}%`;
    
    if (progress.status === 'ready' || progress.status === 'complete') {
      // Hide after a delay when complete
      setTimeout(() => {
        modelInfo.style.display = 'none';
      }, 3000);
    }
  });
  
  // Set up event listeners
  summarizeButton.addEventListener('click', handleSummarizeClick);
  urlInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      handleSummarizeClick();
    }
  });
  
  // Check URL parameters for direct video ID
  const urlParams = new URLSearchParams(window.location.search);
  const videoIdParam = urlParams.get('videoId');
  
  if (videoIdParam) {
    console.log('[YT-Summarizer] Found video ID in URL params:', videoIdParam);
    urlInput.value = `https://www.youtube.com/watch?v=${videoIdParam}`;
    
    // Auto-summarize if video ID provided
    setTimeout(() => {
      handleSummarizeClick();
    }, 300);
  } else {
    // Try to get current active tab
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs && tabs.length > 0) {
        const currentTab = tabs[0];
        
        // Check if current tab is a YouTube video
        if (currentTab.url && currentTab.url.includes('youtube.com/watch')) {
          urlInput.value = currentTab.url;
          console.log('[YT-Summarizer] Found YouTube URL in active tab:', currentTab.url);
        }
      }
    });
  }
  
  // Preload model in background for faster summarization
  if (window.ModelHandler) {
    setTimeout(() => {
      try {
        // Start loading model in background
        window.ModelHandler.initialize().catch(err => {
          console.log('[YT-Summarizer] Background model loading error:', err);
          // Non-critical error, don't show to user
        });
      } catch (e) {
        console.log('[YT-Summarizer] Error preloading model:', e);
      }
    }, 1000);
  }
}

/**
 * Handle summarize button click
 */
async function handleSummarizeClick() {
  // Get DOM elements
  const urlInput = document.getElementById('video-url');
  const summaryContainer = document.getElementById('summary-container');
  const loadingIndicator = document.getElementById('loading-indicator');
  const errorContainer = document.getElementById('error-container');
  
  // Prevent multiple requests
  if (isProcessing) {
    console.log('[YT-Summarizer] Already processing, please wait');
    return;
  }
  
  // Reset UI
  summaryContainer.style.display = 'none';
  errorContainer.style.display = 'none';
  loadingIndicator.style.display = 'block';
  loadingIndicator.textContent = 'Extracting video information...';
  isProcessing = true;
  
  try {
    // Get URL from input
    const url = urlInput.value.trim();
    if (!url) {
      throw new Error('Please enter a YouTube URL');
    }
    
    // Validate and extract video ID
    const videoId = await extractVideoId(url);
    if (!videoId) {
      throw new Error('Invalid YouTube URL. Please enter a valid YouTube video URL.');
    }
    
    currentVideoId = videoId;
    console.log('[YT-Summarizer] Processing video ID:', videoId);
    
    // Check if we already have this summary in cache
    const cachedSummary = await checkCache(videoId);
    if (cachedSummary) {
      console.log('[YT-Summarizer] Found cached summary');
      displaySummary(cachedSummary);
      return;
    }
    
    // Extract transcript
    loadingIndicator.textContent = 'Extracting transcript...';
    
    const transcript = await getTranscript(videoId);
    if (!transcript || transcript.length === 0) {
      throw new Error('Could not retrieve transcript. This video might not have captions available.');
    }
    
    // Create summary using AI
    loadingIndicator.textContent = 'Generating AI summary...';
    const summary = await createSummary(transcript, videoId);
    
    // Display summary
    displaySummary(summary);
    
    // Cache the summary
    await cacheResults(videoId, summary);
    
  } catch (error) {
    console.error('[YT-Summarizer] Error:', error);
    displayError(error.message || 'An unknown error occurred');
  } finally {
    isProcessing = false;
    loadingIndicator.style.display = 'none';
  }
}

/**
 * Extract video ID from URL
 * @param {string} url - YouTube URL
 * @returns {Promise<string>} - YouTube video ID
 */
async function extractVideoId(url) {
  return new Promise((resolve, reject) => {
    try {
      if (!url) {
        reject(new Error('URL is empty'));
        return;
      }
      
      // Use YouTubeAPI utility on window object if available
      if (window.YouTubeAPI && typeof window.YouTubeAPI.extractVideoId === 'function') {
        const id = window.YouTubeAPI.extractVideoId(url);
        resolve(id);
        return;
      }
      
      // Fallback implementation
      console.log('[YT-Summarizer] YouTubeAPI not available, using fallback');
      
      // Handle standard YouTube watch URLs
      const watchRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
      const watchMatch = url.match(watchRegex);
      if (watchMatch) {
        resolve(watchMatch[1]);
        return;
      }
      
      // Handle YouTube short URLs
      const shortRegex = /youtube\.com\/shorts\/([^"&?\/\s]{11})/i;
      const shortMatch = url.match(shortRegex);
      if (shortMatch) {
        resolve(shortMatch[1]);
        return;
      }
      
      reject(new Error('Invalid YouTube URL format'));
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Get the transcript for a video
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<Array>} - Transcript segments
 */
async function getTranscript(videoId) {
  return new Promise((resolve, reject) => {
    console.log('[YT-Summarizer] Requesting transcript for video:', videoId);
    
    // First try - check if we're on YouTube already
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (!tabs || tabs.length === 0) {
        // Handle case where no active tab was found (shouldn't happen normally)
        console.error('[YT-Summarizer] No active tab found');
        reject(new Error('No active tab found'));
        return;
      }
      
      const currentTab = tabs[0];
      const isYouTube = currentTab.url && currentTab.url.includes('youtube.com/watch');
      
      if (isYouTube) {
        // We're already on a YouTube page, try to extract directly
        console.log('[YT-Summarizer] Already on YouTube, extracting directly');
        
        chrome.tabs.sendMessage(currentTab.id, {
          action: 'getTranscript',
          videoId: videoId
        }, function(response) {
          if (chrome.runtime.lastError) {
            console.error('[YT-Summarizer] Error sending message:', chrome.runtime.lastError);
            
            // Ask the background script to inject the content script and try again
            retryWithBackgroundHelp(videoId, reject, resolve);
            return;
          }
          
          if (response && response.transcript) {
            resolve(response.transcript);
          } else if (response && response.error) {
            reject(new Error(response.error));
          } else {
            reject(new Error('Failed to get transcript response'));
          }
        });
      } else {
        // Not on YouTube, ask the background script to help
        retryWithBackgroundHelp(videoId, reject, resolve);
      }
    });
  });
}

/**
 * Ask the background script to help with transcript retrieval
 * @param {string} videoId - YouTube video ID
 * @param {Function} reject - Promise rejection function
 * @param {Function} resolve - Promise resolution function
 */
function retryWithBackgroundHelp(videoId, reject, resolve) {
  console.log('[YT-Summarizer] Requesting background script help for transcript');
  
  // Try alternative approach - open YouTube in background tab
  chrome.runtime.sendMessage({
    action: 'summarizeDirectly',
    videoId: videoId
  }, function(response) {
    if (chrome.runtime.lastError) {
      console.error('[YT-Summarizer] Background script error:', chrome.runtime.lastError);
      reject(new Error('Failed to retrieve transcript: Could not establish connection. Receiving end does not exist.'));
      return;
    }
    
    if (response && response.error) {
      reject(new Error(response.error));
      return;
    }
    
    // If we get a success response from background, show a message to the user to try again
    reject(new Error('Please try again in a moment. We need to initialize the YouTube page first.'));
  });
}

/**
 * Create a summary from transcript segments
 * @param {Array} transcript - Transcript segments
 * @param {string} videoId - Video ID for reference
 * @returns {Object} - Summary object
 */
async function createSummary(transcript, videoId) {
  try {
    console.log('[YT-Summarizer] Creating summary from transcript with', transcript.length, 'segments');
    
    if (!transcript || transcript.length === 0) {
      throw new Error('Empty transcript, cannot create summary');
    }
    
    const loadingIndicator = document.getElementById('loading-indicator');
    
    // Use AI summarization with ModelHandler from Phase 2
    try {
      // First get video info for better summarization
      loadingIndicator.textContent = 'Getting video information...';
      const videoInfo = await window.YouTubeAPI.getVideoInfo(videoId);
      
      // Initialize the model (will show progress in UI)
      loadingIndicator.textContent = 'Loading AI model...';
      const modelHandler = window.ModelHandler;
      
      // Listen for model progress updates to show in UI
      window.addEventListener('model-progress', (event) => {
        const progress = event.detail;
        loadingIndicator.textContent = progress.detail;
      }, { once: false });
      
      // Wait for model to load
      if (!modelHandler.modelLoaded) {
        await modelHandler.initialize();
      }
      
      // Generate summary with AI
      loadingIndicator.textContent = 'Generating AI summary...';
      const aiSummary = await modelHandler.generateSummary(transcript, videoInfo);
      
      // Parse the structured summary returned from AI
      return {
        title: videoInfo.title || 'Video Summary',
        videoId: videoId,
        sections: aiSummary.sections,
        useAI: true,
        timestamp: new Date().toISOString()
      };
    } catch (aiError) {
      console.error('[YT-Summarizer] AI summarization failed:', aiError);
      loadingIndicator.textContent = 'AI summarization failed, using fallback method...';
      
      // Fallback to TranscriptParser if AI fails
      if (window.TranscriptParser && typeof window.TranscriptParser.createSummary === 'function') {
        return window.TranscriptParser.createSummary(transcript, videoId);
      }
      
      // If all else fails, use very basic summary approach
      throw new Error('AI summarization failed and no fallback available');
    }
  } catch (error) {
    console.error('[YT-Summarizer] Error creating summary:', error);
    throw error;
  }
}

/**
 * Display a summary in the popup
 * @param {Object} summary - Summary object
 */
function displaySummary(summary) {
  console.log('[YT-Summarizer] Displaying summary:', summary);
  
  const summaryContainer = document.getElementById('summary-container');
  const loadingIndicator = document.getElementById('loading-indicator');
  
  // Hide loading indicator
  loadingIndicator.style.display = 'none';
  
  // Clear any previous content
  summaryContainer.innerHTML = '';
  
  // Create summary header
  const header = document.createElement('div');
  header.className = 'summary-header';
  
  // Add AI badge if summary was generated with AI
  if (summary.useAI) {
    header.innerHTML = `<h2>${summary.title || 'Video Summary'} <span class="ai-badge">AI</span></h2>`;
  } else {
    header.innerHTML = `<h2>${summary.title || 'Video Summary'}</h2>`;
  }
  
  summaryContainer.appendChild(header);
  
  // Create summary content
  const content = document.createElement('div');
  content.className = 'summary-content';
  
  // Add each section
  summary.sections.forEach(section => {
    const sectionElement = document.createElement('div');
    sectionElement.className = 'summary-section';
    
    // Add section title
    const sectionTitle = document.createElement('h3');
    sectionTitle.textContent = section.title;
    sectionElement.appendChild(sectionTitle);
    
    // Add paragraphs
    section.paragraphs.forEach(paragraph => {
      const p = document.createElement('p');
      
      // Add timestamp as clickable link if available
      if (paragraph.timestamp && paragraph.seconds) {
        const timestampLink = document.createElement('a');
        timestampLink.href = '#';
        timestampLink.className = 'timestamp-link';
        timestampLink.textContent = `[${paragraph.timestamp}] `;
        timestampLink.dataset.seconds = paragraph.seconds;
        timestampLink.addEventListener('click', function(e) {
          e.preventDefault();
          navigateToTimestamp(paragraph.seconds);
        });
        
        p.appendChild(timestampLink);
      }
      
      // Add paragraph text
      p.appendChild(document.createTextNode(paragraph.text));
      sectionElement.appendChild(p);
    });
    
    content.appendChild(sectionElement);
  });
  
  summaryContainer.appendChild(content);
  
  // Add copy button
  const copyButton = document.createElement('button');
  copyButton.className = 'copy-button';
  copyButton.textContent = 'Copy Summary';
  copyButton.addEventListener('click', function() {
    copySummaryToClipboard(summary);
  });
  
  summaryContainer.appendChild(copyButton);
  
  // Show the summary container
  summaryContainer.style.display = 'block';
}

/**
 * Display an error message
 * @param {string} message - Error message
 */
function displayError(message) {
  console.error('[YT-Summarizer] Error:', message);
  
  const errorContainer = document.getElementById('error-container');
  const loadingIndicator = document.getElementById('loading-indicator');
  
  // Hide loading indicator
  loadingIndicator.style.display = 'none';
  
  // Set error message
  errorContainer.textContent = message;
  
  // Show error container
  errorContainer.style.display = 'block';
}

/**
 * Navigate to a specific timestamp in the video
 * @param {number} seconds - Timestamp in seconds
 */
function navigateToTimestamp(seconds) {
  console.log('[YT-Summarizer] Navigating to timestamp:', seconds);
  
  if (!currentVideoId) {
    console.error('[YT-Summarizer] No current video ID');
    return;
  }
  
  // First try to use message passing to the content script if we're on YouTube
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (!tabs || tabs.length === 0) {
      // Open YouTube with the timestamp if no active tab
      openYouTubeWithTimestamp(currentVideoId, seconds);
      return;
    }
    
    const currentTab = tabs[0];
    const isYouTube = currentTab.url && currentTab.url.includes('youtube.com/watch');
    
    if (isYouTube) {
      // We're on YouTube, try to control the video player directly
      chrome.tabs.sendMessage(currentTab.id, {
        action: 'seekTo',
        seconds: seconds
      }, function(response) {
        if (chrome.runtime.lastError || !response || !response.success) {
          // If content script communication fails, open in a new tab
          openYouTubeWithTimestamp(currentVideoId, seconds);
        }
      });
    } else {
      // Not on YouTube, open in a new tab
      openYouTubeWithTimestamp(currentVideoId, seconds);
    }
  });
}

/**
 * Open YouTube with a video at a specific timestamp
 * @param {string} videoId - YouTube video ID
 * @param {number} seconds - Timestamp in seconds
 */
function openYouTubeWithTimestamp(videoId, seconds) {
  chrome.runtime.sendMessage({
    action: 'openYouTubeVideo',
    videoId: videoId,
    timestamp: seconds
  });
}

/**
 * Copy summary to clipboard
 * @param {Object} summary - Summary object
 */
function copySummaryToClipboard(summary) {
  console.log('[YT-Summarizer] Copying summary to clipboard');
  
  let text = '';
  
  // Add title
  text += summary.title + '\n\n';
  
  // Add each section
  summary.sections.forEach(section => {
    text += section.title + '\n\n';
    
    // Add paragraphs
    section.paragraphs.forEach(paragraph => {
      // Add timestamp if available
      if (paragraph.timestamp) {
        text += '[' + paragraph.timestamp + '] ';
      }
      
      // Add paragraph text
      text += paragraph.text + '\n\n';
    });
  });
  
  // Copy to clipboard
  navigator.clipboard.writeText(text)
    .then(() => {
      const copyButton = document.querySelector('.copy-button');
      if (copyButton) {
        const originalText = copyButton.textContent;
        copyButton.textContent = 'Copied!';
        
        // Reset button text after 2 seconds
        setTimeout(() => {
          copyButton.textContent = originalText;
        }, 2000);
      }
    })
    .catch(err => {
      console.error('[YT-Summarizer] Failed to copy:', err);
    });
}

/**
 * Check if a summary exists in cache
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<Object>} - Cached summary if exists
 */
async function checkCache(videoId) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['summaryCache'], function(result) {
      if (result.summaryCache && result.summaryCache[videoId]) {
        resolve(result.summaryCache[videoId]);
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Cache a summary result
 * @param {string} videoId - YouTube video ID
 * @param {Object} summary - Summary object
 */
async function cacheResults(videoId, summary) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['summaryCache'], function(result) {
      const cache = result.summaryCache || {};
      cache[videoId] = summary;
      
      chrome.storage.local.set({summaryCache: cache}, function() {
        resolve();
      });
    });
  });
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', initializePopup);
