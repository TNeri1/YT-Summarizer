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
        // Import WebLLM dynamically
        if (typeof webllm === "undefined") {
          await this.loadScript("https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm/dist/webllm.js");
        }
        
        // Create the LLM instance
        this.llm = new webllm.ChatModule();
        
        // Set up progress callback
        this.llm.setInitProgressCallback((report) => {
          this.updateProgress(
            "loading", 
            report.progress, 
            report.total, 
            `${report.text} (${Math.round(report.progress / report.total * 100)}%)`
          );
        });
        
        // Initialize the model
        await this.llm.reload(this.modelConfig.modelId, {
          model_list: [
            {
              "model_url": `${this.modelConfig.wasmUrl}${this.modelConfig.modelId}`,
              "local_id": this.modelConfig.modelId
            }
          ]
        });
        
        this.modelLoaded = true;
        this.modelLoading = false;
        this.updateProgress("ready", 100, 100, "Model loaded successfully");
        console.log("Llama model loaded successfully");
      } catch (error) {
        this.modelLoading = false;
        this.updateProgress("error", 0, 100, `Error loading model: ${error.message}`);
        console.error("Error loading Llama model:", error);
        throw error;
      }
    }
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
   * @returns {Promise<string>} - Generated summary
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
      
      // Process the response into a nicely formatted HTML summary
      return this.formatSummaryResponse(response, videoInfo, transcript);
    } catch (error) {
      this.updateProgress("error", 0, 100, `Error generating summary: ${error.message}`);
      console.error("Error generating summary:", error);
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
VIDEO URL: ${videoInfo.url || ""}

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
   * Format the model's response into HTML
   * @param {string} response - Model response
   * @param {Object} videoInfo - Video information
   * @param {Array} transcript - Original transcript with timestamps
   * @returns {string} - Formatted HTML
   */
  formatSummaryResponse(response, videoInfo, transcript) {
    // Extract the parts of the response
    const mainTopicMatch = response.match(/(?:Main Topic:?|1\.)(.*?)(?=Key Points|2\.)/is);
    const keyPointsMatch = response.match(/(?:Key Points:?|2\.)(.*?)(?=Conclusion|3\.)/is);
    const conclusionMatch = response.match(/(?:Conclusion:?|3\.)(.*)/is);
    
    const mainTopic = mainTopicMatch ? mainTopicMatch[1].trim() : "Summary of the video";
    let keyPoints = keyPointsMatch ? keyPointsMatch[1].trim() : "";
    const conclusion = conclusionMatch ? conclusionMatch[1].trim() : "";
    
    // Extract bullet points
    const bulletPoints = keyPoints.split(/•|\-|\*/).map(p => p.trim()).filter(p => p);
    
    // Try to match key points with timestamps from the transcript
    const pointsWithTimestamps = bulletPoints.map(point => {
      // Look for related segments in the transcript
      const relatedSegment = this.findRelatedSegment(point, transcript);
      if (relatedSegment) {
        return {
          text: point,
          timestamp: relatedSegment.timestamp,
          seconds: relatedSegment.seconds
        };
      }
      return { text: point, timestamp: "", seconds: 0 };
    });
    
    // Format as HTML
    let html = `<h3>Summary of "${videoInfo.title || 'YouTube Video'}"</h3>`;
    
    if (videoInfo.channel) {
      html += `<p><small>Channel: ${videoInfo.channel}</small></p>`;
    }
    
    if (videoInfo.duration) {
      html += `<p><small>Duration: ${this.formatDuration(videoInfo.duration)}</small></p>`;
    }
    
    html += `<p>${mainTopic}</p>`;
    
    html += `<h4>Key Points</h4><ul>`;
    pointsWithTimestamps.forEach(point => {
      const timestampHtml = point.timestamp 
        ? `<span class="timestamp" data-seconds="${point.seconds}">[${point.timestamp}]</span> ` 
        : '';
      html += `<li>${timestampHtml}${point.text}</li>`;
    });
    html += `</ul>`;
    
    if (conclusion) {
      html += `<h4>Conclusion</h4><p>${conclusion}</p>`;
    }
    
    return html;
  }

  /**
   * Find a transcript segment related to a key point
   * @param {string} point - Key point text
   * @param {Array} transcript - Transcript segments
   * @returns {Object|null} - Related segment or null
   */
  findRelatedSegment(point, transcript) {
    // Simple word matching to find most relevant segment
    const words = point.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    let bestMatch = null;
    let bestScore = 0;
    
    transcript.forEach(segment => {
      const segmentText = segment.text.toLowerCase();
      let score = 0;
      
      words.forEach(word => {
        if (segmentText.includes(word)) {
          score++;
        }
      });
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = segment;
      }
    });
    
    // Return if we have a reasonable match
    if (bestScore >= Math.min(2, words.length * 0.3)) {
      return bestMatch;
    }
    
    return null;
  }

  /**
   * Format duration in seconds as HH:MM:SS
   * @param {number} seconds - Duration in seconds
   * @returns {string} - Formatted duration
   */
  formatDuration(seconds) {
    if (!seconds) return 'Unknown';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
  }
}

// Create and export a singleton instance
const modelHandler = new ModelHandler();
