/**
 * YT-Summarizer Model Handler
 * 
 * Manages the WebLLM integration for client-side summarization
 */

// ModelHandler class for managing the AI model
class ModelHandler {
  constructor() {
    this.modelLoaded = false;
    this.modelLoading = false;
    this.worker = null;
    this.modelConfig = {
      maxTokens: 512,
      temperature: 0.7
    };
    this.progress = {
      status: "idle",
      progress: 0,
      total: 100,
      detail: ""
    };
    this.pendingRequests = new Map();
    this.requestId = 0;
  }

  /**
   * Initialize the model handler
   * @returns {Promise<void>}
   */
  async initialize() {
    if (!this.worker && !this.modelLoading) {
      this.modelLoading = true;
      this.updateProgress("loading", 0, 100, "Setting up AI summarization...");
      
      try {
        // Create a Web Worker for the AI processing
        this.worker = new Worker(chrome.runtime.getURL('lib/webllm-worker.js'));
        
        // Set up message handler for worker
        this.worker.onmessage = (event) => {
          const { id, type, data } = event.data;
          
          // Handle progress updates
          if (type === 'progress') {
            this.updateProgress(
              data.status,
              data.progress,
              data.total,
              data.detail
            );
          }
          
          // Handle request completion
          if (type === 'complete') {
            const resolver = this.pendingRequests.get(id);
            if (resolver) {
              resolver.resolve(data);
              this.pendingRequests.delete(id);
            }
          }
          
          // Handle errors
          if (type === 'error') {
            const resolver = this.pendingRequests.get(id);
            if (resolver) {
              resolver.reject(new Error(data.message));
              this.pendingRequests.delete(id);
            }
            this.updateProgress("error", 0, 100, `Error: ${data.message}`);
          }
        };
        
        // Initialize the worker
        const initResult = await this.sendWorkerRequest('initialize', {});
        
        this.modelLoaded = true;
        this.modelLoading = false;
        this.updateProgress("ready", 100, 100, "AI summarization ready");
        console.log("[YT-Summarizer] AI summarization system initialized successfully");
      } catch (error) {
        this.modelLoading = false;
        this.updateProgress("error", 0, 100, `Error loading model: ${error.message}`);
        console.error("[YT-Summarizer] Error loading AI model:", error);
        throw error;
      }
    }
    
    return this;
  }

  /**
   * Send a request to the worker and get a promise for the response
   * @param {string} action - The action to perform
   * @param {Object} params - The parameters for the action
   * @returns {Promise<any>} - The result of the action
   */
  sendWorkerRequest(action, params) {
    return new Promise((resolve, reject) => {
      const id = `req_${this.requestId++}`;
      
      // Store the resolvers
      this.pendingRequests.set(id, { resolve, reject });
      
      // Send the request to the worker
      this.worker.postMessage({
        action,
        id,
        params
      });
    });
  }

  /**
   * Update progress information
   * @param {string} status - Status string
   * @param {number} progress - Current progress
   * @param {number} total - Total progress
   * @param {string} detail - Detailed information
   */
  updateProgress(status, progress, total, detail) {
    this.progress = { status, progress, total, detail };
    // Dispatch event for UI updates
    window.dispatchEvent(new CustomEvent('model-progress', { 
      detail: this.progress 
    }));
  }

  /**
   * Generate a summary using the AI model
   * @param {Array} transcript - Transcript segments
   * @param {Object} videoInfo - Video information
   * @returns {Promise<Object>} - Generated summary object
   */
  async generateSummary(transcript, videoInfo) {
    if (!this.modelLoaded) {
      await this.initialize();
    }

    // Convert transcript to text
    const transcriptText = transcript.map(segment => segment.text).join(' ');
    
    // Create a prompt for the model
    const prompt = this.createSummarizationPrompt(transcriptText, videoInfo);
    
    try {
      this.updateProgress("generating", 0, 100, "Generating summary...");
      
      // Generate the summary
      const result = await this.sendWorkerRequest('generate', {
        message: prompt,
        maxTokens: this.modelConfig.maxTokens,
        temperature: this.modelConfig.temperature
      });
      
      this.updateProgress("complete", 100, 100, "Summary generated");
      
      // Process the response into a formatted summary object
      return this.formatSummaryResponse(result.response, transcript);
    } catch (error) {
      this.updateProgress("error", 0, 100, `Error generating summary: ${error.message}`);
      console.error("[YT-Summarizer] Error generating summary:", error);
      throw error;
    }
  }

  /**
   * Create a prompt for summarization
   * @param {string} transcriptText - Full transcript text
   * @param {Object} videoInfo - Video information
   * @returns {string} - Formatted prompt
   */
  createSummarizationPrompt(transcriptText, videoInfo) {
    // Trim transcript if too long (context limitations)
    let trimmedTranscript = transcriptText;
    if (transcriptText.length > 6000) {
      trimmedTranscript = transcriptText.substring(0, 2000) + 
        " [...] " + 
        transcriptText.substring(transcriptText.length - 2000);
    }
    
    return `
You are a helpful assistant that summarizes YouTube video transcripts.

VIDEO TITLE: ${videoInfo.title || "YouTube Video"}
VIDEO URL: ${videoInfo.url || "https://youtube.com/watch?v=" + videoInfo.id}

TRANSCRIPT:
${trimmedTranscript}

Please provide a concise summary (150-300 words) of this video that captures the key points. 
Structure your summary with these sections:
1. Main Topic - One sentence describing what the video is about
2. Key Points - 3-5 bullet points of the most important information
3. Conclusion - A brief takeaway from the video

Your summary should be informative and capture the essence of the video content.
`;
  }

  /**
   * Format the model's response into a structured summary object
   * @param {string} response - Model response
   * @param {Array} transcript - Original transcript with timestamps
   * @returns {Object} - Formatted summary object
   */
  formatSummaryResponse(response, transcript) {
    // Extract the parts of the response
    const mainTopicMatch = response.match(/(?:Main Topic:?|1\.)(.*?)(?=Key Points|2\.)/is);
    const keyPointsMatch = response.match(/(?:Key Points:?|2\.)(.*?)(?=Conclusion|3\.)/is);
    const conclusionMatch = response.match(/(?:Conclusion:?|3\.)(.*)/is);
    
    const mainTopic = mainTopicMatch ? mainTopicMatch[1].trim() : "Summary of the video";
    let keyPoints = keyPointsMatch ? keyPointsMatch[1].trim() : "";
    const conclusion = conclusionMatch ? conclusionMatch[1].trim() : "";
    
    // Extract bullet points
    const bulletPoints = keyPoints.split(/[•\-\*\d+\.\s]/).map(p => p.trim()).filter(p => p);
    
    // Try to match key points with timestamps from the transcript
    const timestampedPoints = this.addTimestampsToPoints(bulletPoints, transcript);
    
    // Find timestamps for introduction and conclusion
    const firstTimestamp = transcript.length > 0 ? transcript[0] : null;
    const lastTimestamp = transcript.length > 0 ? transcript[transcript.length - 1] : null;
    
    // Create sections with paragraphs in the format expected by popup.js
    const sections = [
      {
        title: "Main Topic",
        paragraphs: [{
          text: mainTopic,
          timestamp: firstTimestamp ? firstTimestamp.timestamp : null,
          seconds: firstTimestamp ? firstTimestamp.seconds : 0
        }]
      },
      {
        title: "Key Points",
        paragraphs: timestampedPoints.map(point => ({
          text: point.text,
          timestamp: point.timestamp,
          seconds: point.seconds
        }))
      },
      {
        title: "Conclusion",
        paragraphs: [{
          text: conclusion,
          timestamp: lastTimestamp ? lastTimestamp.timestamp : null,
          seconds: lastTimestamp ? lastTimestamp.seconds : 0
        }]
      }
    ];
    
    return {
      sections: sections
    };
  }
  
  /**
   * Add timestamps to key points by matching content with transcript
   * @param {Array<string>} points - Key points from AI summary
   * @param {Array<Object>} transcript - Original transcript with timestamps
   * @returns {Array<Object>} - Key points with timestamps
   */
  addTimestampsToPoints(points, transcript) {
    const result = [];
    
    // Create a flat text version of the transcript
    const flatTranscript = transcript.map(t => t.text.toLowerCase()).join(' ');
    
    // For each point, try to find where it appears in the transcript
    points.forEach(point => {
      const pointObj = {
        text: point,
        timestamp: null,
        seconds: 0
      };
      
      // Find keywords in the point (words of 5+ chars)
      const keywords = point.toLowerCase()
        .split(/\s+/)
        .filter(word => word.length >= 5)
        .map(word => word.replace(/[.,;!?()]/g, ''));
      
      if (keywords.length > 0) {
        // Look for these keywords in the transcript
        let bestMatchIndex = -1;
        let bestMatchCount = 0;
        
        // Check each transcript segment for keywords
        transcript.forEach((segment, index) => {
          const lowercaseText = segment.text.toLowerCase();
          const matchCount = keywords.filter(keyword => 
            lowercaseText.includes(keyword)).length;
          
          if (matchCount > bestMatchCount) {
            bestMatchCount = matchCount;
            bestMatchIndex = index;
          }
        });
        
        // If we found a good match, use its timestamp
        if (bestMatchIndex >= 0 && bestMatchCount >= Math.min(2, keywords.length)) {
          pointObj.timestamp = transcript[bestMatchIndex].timestamp;
          pointObj.seconds = transcript[bestMatchIndex].seconds;
        }
      }
      
      result.push(pointObj);
    });
    
    return result;
  }
}

// Create and export a singleton instance
window.ModelHandler = new ModelHandler();
console.log("[YT-Summarizer] Model handler initialized");
