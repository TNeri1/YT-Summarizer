# YT-Summarizer

A Chrome extension that automatically generates concise summaries of YouTube videos based on their transcripts.

## Features

- 🎬 Processes YouTube URLs in various formats (standard, shortened, embedded)
- 📝 Extracts transcripts directly from YouTube videos
- 📋 Generates structured summaries with introduction, main points, and conclusion
- ⏱️ Includes clickable timestamps to navigate to specific parts of the video
- 💾 Caches summaries to avoid redundant processing
- 🔄 Supports right-click context menu for YouTube links

## Installation

### From Source

1. Clone this repository:
   ```
   git clone https://github.com/yourusername/YT-Summarizer.git
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" (toggle in the top right)

4. Click "Load unpacked" and select the YT-Summarizer directory

5. The extension icon should appear in your Chrome toolbar

## Usage

There are two ways to use YT-Summarizer:

### Method 1: Browser Action

1. Navigate to any page
2. Click the YT-Summarizer icon in the toolbar
3. Enter a YouTube URL in the input field
4. Click "Summarize"
5. View the structured summary with clickable timestamps

### Method 2: Context Menu

1. Right-click on any YouTube link on a webpage
2. Select "Summarize YouTube Video" from the context menu
3. A popup will open with the summary of the video

## Development

### Project Structure

```
youtube-summarizer/
├── manifest.json       # Extension manifest
├── background.js       # Background script for extension events
├── popup/             
│   ├── popup.html     # Popup UI HTML
│   ├── popup.css      # Popup styling
│   └── popup.js       # Popup functionality
├── content/
│   └── content.js     # Content script for YouTube page interaction
├── utils/
│   ├── youtube-api.js  # YouTube API utilities
│   └── transcript-parser.js # Transcript processing utilities
├── models/             # For Phase 2 - AI model integration
│   └── model-loader.js # WebLLM model loader (Phase 2)
├── options/            # Extension options page (future)
└── assets/
    └── icons/          # Extension icons
```

### Development Roadmap

#### Phase 1 (Current): Basic Transcript Processing
- ✅ Extract transcripts from YouTube videos
- ✅ Process transcript data into structured summaries
- ✅ Implement caching and error handling
- ✅ Create a user-friendly interface

#### Phase 2: Client-side AI Model Integration
- Integrate WebLLM for local AI processing
- Use Llama model for improved summarization
- Implement client-side processing to ensure privacy
- Add advanced context understanding

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
