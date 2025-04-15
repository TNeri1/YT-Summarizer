/**
 * Transcript Parser Utilities
 * 
 * Handles transcript retrieval, parsing, and summary generation
 */

// Define TranscriptParser namespace on window object
window.TranscriptParser = {};

// Cache for storing transcript summaries
const transcriptCache = {};

/**
 * Get transcript for a YouTube video
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<Array>} - Transcript segments
 */
window.TranscriptParser.getTranscript = function(videoId) {
  return new Promise((resolve, reject) => {
    console.log('[YT-Summarizer] Requesting transcript for', videoId);
    
    if (!videoId) {
      reject(new Error('Video ID is required'));
      return;
    }
    
    // Check cache first
    if (transcriptCache[videoId] && transcriptCache[videoId].transcript) {
      console.log('[YT-Summarizer] Using cached transcript');
      resolve(transcriptCache[videoId].transcript);
      return;
    }
    
    // Try to get transcript from content script
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (!tabs || tabs.length === 0) {
        reject(new Error('No active tab found'));
        return;
      }
      
      const currentTab = tabs[0];
      
      console.log('[YT-Summarizer] Sending transcript request to tab', currentTab.id);
      
      chrome.tabs.sendMessage(currentTab.id, {
        action: 'getTranscript',
        videoId: videoId
      }, function(response) {
        // Handle communication errors
        if (chrome.runtime.lastError) {
          console.error('[YT-Summarizer] Error getting transcript:', chrome.runtime.lastError);
          reject(new Error('Failed to get transcript: Could not establish connection. Receiving end does not exist.'));
          return;
        }
        
        // Handle transcript response
        if (response && response.transcript) {
          // Cache the transcript
          if (!transcriptCache[videoId]) {
            transcriptCache[videoId] = {};
          }
          
          transcriptCache[videoId].transcript = response.transcript;
          resolve(response.transcript);
        } else if (response && response.error) {
          reject(new Error(response.error));
        } else {
          reject(new Error('Unknown error getting transcript'));
        }
      });
    });
  });
};

/**
 * Create summary from transcript segments
 * @param {Array} transcript - Transcript segments
 * @param {string} videoId - Video ID for reference
 * @returns {Object} - Summary object
 */
window.TranscriptParser.createSummary = function(transcript, videoId) {
  console.log('[YT-Summarizer] Creating summary from transcript segments:', transcript.length);
  
  if (!transcript || transcript.length === 0) {
    throw new Error('Empty transcript');
  }
  
  // Sort transcript by timestamp
  const sortedTranscript = [...transcript].sort((a, b) => a.seconds - b.seconds);
  
  // Get segments from beginning, middle, and end
  const totalSegments = sortedTranscript.length;
  const segmentsToUse = Math.min(15, Math.floor(totalSegments / 3));
  
  const beginningSegments = sortedTranscript.slice(0, segmentsToUse);
  const middleStart = Math.floor((totalSegments - segmentsToUse) / 2);
  const middleSegments = sortedTranscript.slice(middleStart, middleStart + segmentsToUse);
  const endSegments = sortedTranscript.slice(-segmentsToUse);
  
  // Combine segments
  const summarySegments = [
    ...beginningSegments,
    ...middleSegments,
    ...endSegments
  ].sort((a, b) => a.seconds - b.seconds);
  
  // Merge consecutive segments into paragraphs
  const paragraphs = [];
  let currentParagraph = {
    text: '',
    timestamp: '',
    seconds: 0
  };
  
  summarySegments.forEach((segment, index) => {
    if (index > 0 && index % 5 === 0) {
      // Start a new paragraph every 5 segments
      if (currentParagraph.text.trim()) {
        paragraphs.push({ ...currentParagraph });
      }
      currentParagraph = {
        text: segment.text,
        timestamp: segment.timestamp,
        seconds: segment.seconds
      };
    } else {
      // Add to current paragraph
      currentParagraph.text += ' ' + segment.text;
    }
    
    // Add the last paragraph
    if (index === summarySegments.length - 1 && currentParagraph.text.trim()) {
      paragraphs.push({ ...currentParagraph });
    }
  });
  
  // Create summary object
  const summary = {
    title: 'Video Summary',
    videoId: videoId,
    sections: [
      {
        title: 'Introduction',
        paragraphs: paragraphs.slice(0, Math.ceil(paragraphs.length / 3))
      },
      {
        title: 'Main Points',
        paragraphs: paragraphs.slice(Math.ceil(paragraphs.length / 3), Math.ceil(paragraphs.length * 2 / 3))
      },
      {
        title: 'Conclusion',
        paragraphs: paragraphs.slice(Math.ceil(paragraphs.length * 2 / 3))
      }
    ],
    timestamp: new Date().toISOString()
  };
  
  // Cache the summary
  if (!transcriptCache[videoId]) {
    transcriptCache[videoId] = {};
  }
  
  transcriptCache[videoId].summary = summary;
  
  return summary;
};

/**
 * Get cached summary for a video
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<Object>} - Cached summary if available
 */
window.TranscriptParser.getCachedSummary = function(videoId) {
  return new Promise((resolve) => {
    if (transcriptCache[videoId] && transcriptCache[videoId].summary) {
      resolve(transcriptCache[videoId].summary);
    } else {
      // Also check Chrome storage for persistent cache
      chrome.storage.local.get(['summaryCache'], function(result) {
        if (result.summaryCache && result.summaryCache[videoId]) {
          // Update in-memory cache
          if (!transcriptCache[videoId]) {
            transcriptCache[videoId] = {};
          }
          transcriptCache[videoId].summary = result.summaryCache[videoId];
          
          resolve(result.summaryCache[videoId]);
        } else {
          resolve(null);
        }
      });
    }
  });
};

/**
 * Save summary to cache
 * @param {string} videoId - YouTube video ID
 * @param {Object} summary - Summary object
 */
window.TranscriptParser.saveToCache = function(videoId, summary) {
  if (!videoId || !summary) return;
  
  // Save to in-memory cache
  if (!transcriptCache[videoId]) {
    transcriptCache[videoId] = {};
  }
  
  transcriptCache[videoId].summary = summary;
  
  // Save to Chrome storage for persistence
  chrome.storage.local.get(['summaryCache'], function(result) {
    const cache = result.summaryCache || {};
    cache[videoId] = summary;
    
    chrome.storage.local.set({summaryCache: cache}, function() {
      console.log('[YT-Summarizer] Summary saved to cache');
    });
  });
};

// Log that the transcript parser utilities are loaded
console.log('[YT-Summarizer] Transcript parser utilities loaded');
