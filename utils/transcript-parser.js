/**
 * Transcript Parser Utilities
 * Handles transcript retrieval and processing
 */

// Create a namespace for the transcript parser utilities
window.TranscriptParser = {};

// Get transcript from YouTube page via content script
window.TranscriptParser.getTranscript = async function(videoId) {
  console.log('Getting transcript for video:', videoId);
  
  return new Promise((resolve, reject) => {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'getTranscript',
        videoId: videoId
      }, function(response) {
        if (chrome.runtime.lastError) {
          console.error('Error getting transcript:', chrome.runtime.lastError);
          reject(new Error(`Failed to get transcript: ${chrome.runtime.lastError.message}`));
          return;
        }
        
        if (!response) {
          console.error('No response from content script');
          reject(new Error('Failed to get transcript: No response from content script'));
          return;
        }
        
        if (response.error) {
          console.error('Transcript error:', response.error);
          reject(new Error(`Failed to get transcript: ${response.error}`));
          return;
        }
        
        if (!response.transcript || !Array.isArray(response.transcript)) {
          console.error('Invalid transcript format:', response);
          reject(new Error('Failed to get transcript: Invalid format'));
          return;
        }
        
        console.log(`Received transcript with ${response.transcript.length} segments`);
        resolve(response.transcript);
      });
    });
  });
};

// Create a basic summary from transcript segments
window.TranscriptParser.createBasicSummary = function(transcript, videoInfo) {
  console.log('Creating basic summary');
  
  if (!transcript || !Array.isArray(transcript) || transcript.length === 0) {
    throw new Error('Invalid transcript data');
  }
  
  // Get beginning, middle, and end segments
  const beginning = transcript.slice(0, Math.min(3, transcript.length));
  const middleStart = Math.floor(transcript.length / 2) - 1;
  const middle = transcript.slice(
    Math.max(0, middleStart),
    Math.min(middleStart + 3, transcript.length)
  );
  const end = transcript.slice(
    Math.max(0, transcript.length - 3),
    transcript.length
  );
  
  console.log(`Got: ${beginning.length} beginning, ${middle.length} middle, ${end.length} end segments`);
  
  // Format HTML
  let html = `<h3>Summary of "${videoInfo.title || 'YouTube Video'}"</h3>`;
  
  if (videoInfo.channel) {
    html += `<p><small>Channel: ${videoInfo.channel}</small></p>`;
  }
  
  if (videoInfo.duration) {
    html += `<p><small>Duration: ${window.YouTubeAPI.formatDuration(videoInfo.duration)}</small></p>`;
  }
  
  html += `<div class="summary-section">
    <h4>Introduction</h4>
    <ul>`;
  
  beginning.forEach(segment => {
    html += `<li><span class="timestamp" data-seconds="${segment.seconds}">[${segment.timestamp}]</span> ${segment.text}</li>`;
  });
  
  html += `</ul>
    <h4>Main Points</h4>
    <ul>`;
  
  middle.forEach(segment => {
    html += `<li><span class="timestamp" data-seconds="${segment.seconds}">[${segment.timestamp}]</span> ${segment.text}</li>`;
  });
  
  html += `</ul>
    <h4>Conclusion</h4>
    <ul>`;
  
  end.forEach(segment => {
    html += `<li><span class="timestamp" data-seconds="${segment.seconds}">[${segment.timestamp}]</span> ${segment.text}</li>`;
  });
  
  html += `</ul></div>`;
  
  console.log('Summary HTML created');
  return html;
};

// Cache management for summaries
window.TranscriptParser.getCachedSummary = async function(videoId) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['summaryCache'], function(result) {
      const cache = result.summaryCache || {};
      if (cache[videoId]) {
        resolve(cache[videoId]);
      } else {
        resolve(null);
      }
    });
  });
};

window.TranscriptParser.saveToCache = function(videoId, videoInfo, summary) {
  // Update cache
  chrome.storage.local.get(['summaryCache'], function(result) {
    const cache = result.summaryCache || {};
    
    // Add to cache with expiration (7 days)
    cache[videoId] = {
      videoInfo: videoInfo,
      summary: summary,
      timestamp: Date.now(),
      expiration: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
    };
    
    // Clean up expired items
    Object.keys(cache).forEach(key => {
      if (cache[key].expiration < Date.now()) {
        delete cache[key];
      }
    });
    
    chrome.storage.local.set({'summaryCache': cache});
  });
};
