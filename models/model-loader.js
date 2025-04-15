/**
 * YT-Summarizer Model Handler
 * 
 * Manages the WebLLM integration and Llama model for client-side summarization
 */

// ModelHandler class for managing the Llama model
class ModelHandler {
  constructor() {
    this.modelLoaded = false;
    this.modelLoading = false;
    this.llm = null;
    this.modelConfig = {
      modelId: "mlc-ai/llama-2-7b-chat-q4f16_1",
      wasmUrl: "https://mlc.ai/mlc-llm/web-static/",
      cacheUrl: "cache",
      maxTokens: 512,
      temperature: 0.7
    };
    this.progress = {
      status: "idle",
      progress: 0,
      total: 100,
      detail: ""
    };
  }

  /**
   * Initialize the model handler
   * @returns {Promise<void>}
   */
  async initialize() {
    if (!this.llm && !this.modelLoading) {
      this.modelLoading = true;
      this.updateProgress("loading", 0, 100, "Loading WebLLM...");
      
      try {
        // Use a more secure approach for WebLLM loading
        // Instead of dynamically loading external script, include it in the package
        // For now we'll simulate the API as a fallback for development
        
        // Show simulated loading progress
        for (let i = 1; i <= 5; i++) {
          await new Promise(resolve => setTimeout(resolve, 500));
          this.updateProgress(
            "loading", 
            i * 20, 
            100, 
            `Loading AI model (simulated) (${i * 20}%)`
          );
        }
        
        // Create mock LLM instance for development
        this.llm = {
          chat: async ({ message }) => {
            console.log("[YT-Summarizer] Simulating AI chat with message:", message);
            // Wait to simulate processing
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // Extract video title if available
            const titleMatch = message.match(/VIDEO TITLE:\s*([^\n]+)/);
            const videoTitle = titleMatch ? titleMatch[1] : "YouTube Video";
            
            // Generate a simulated response based on the transcript length
            return this.generateSimulatedResponse(message, videoTitle);
          }
        };
        
        this.modelLoaded = true;
        this.modelLoading = false;
        this.updateProgress("ready", 100, 100, "Model loaded successfully");
        console.log("[YT-Summarizer] Model simulation initialized successfully");
      } catch (error) {
        this.modelLoading = false;
        this.updateProgress("error", 0, 100, `Error loading model: ${error.message}`);
        console.error("[YT-Summarizer] Error loading model:", error);
        throw error;
      }
    }
    
    return this;
  }

  /**
   * Load an external script
   * @param {string} src - Script URL
   * @returns {Promise<void>}
   */
  loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(script);
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
   * Generate a summary using the Llama model
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
      const response = await this.llm.chat({
        message: prompt,
        max_gen_len: this.modelConfig.maxTokens,
        temperature: this.modelConfig.temperature
      });
      
      this.updateProgress("complete", 100, 100, "Summary generated");
      
      // Process the response into a formatted summary object
      return this.formatSummaryResponse(response, transcript);
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
    // Trim transcript if too long (Llama has context limitations)
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

  /**
   * Generate a simulated AI response for development
   * @param {string} prompt - The prompt with transcript
   * @param {string} videoTitle - The video title
   * @returns {string} - Simulated AI response
   */
  generateSimulatedResponse(prompt, videoTitle) {
    // Extract some text from the transcript to use in the response
    const transcriptMatch = prompt.match(/TRANSCRIPT:\s*([^]*?)(?=Please provide|$)/s);
    const transcript = transcriptMatch ? transcriptMatch[1] : "";
    
    // Take a few fragments from different parts of the transcript
    const words = transcript.split(/\s+/);
    const fragments = [];
    
    if (words.length > 20) {
      // Get beginning, middle and end fragments
      fragments.push(words.slice(0, 15).join(" "));
      fragments.push(words.slice(Math.floor(words.length / 2), Math.floor(words.length / 2) + 15).join(" "));
      fragments.push(words.slice(words.length - 15).join(" "));
    } else {
      fragments.push(transcript);
    }
    
    // Generate a simulated response
    return `
Main Topic: ${videoTitle} summarizes ${fragments[0].slice(0, 50)}...

Key Points:
• ${fragments[0].slice(0, 80)}...
• ${fragments.length > 1 ? fragments[1].slice(0, 80) : "The video discusses important concepts and ideas."}...
• ${fragments.length > 2 ? fragments[2].slice(0, 80) : "The speaker concludes with insightful remarks."}...

Conclusion: The video effectively explains ${videoTitle} and provides valuable insights for viewers interested in this topic.
`;
  }
}

// Create and export a singleton instance
window.ModelHandler = new ModelHandler();
console.log("[YT-Summarizer] Model handler initialized");
