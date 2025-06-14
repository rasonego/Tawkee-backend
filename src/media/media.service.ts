import axios from 'axios';
import pdfParse from 'pdf-parse';
import * as mammoth from 'mammoth';
import { fromBuffer as extractText } from 'textract';
import { convert } from 'html-to-text';
import { Injectable, Logger } from '@nestjs/common';
import { OpenAiService } from 'src/openai/openai.service';

import ytdl from '@distube/ytdl-core';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(private readonly openAiService: OpenAiService) {}

  async extractTextFromMedia(
    url: string,
    mimetype?: string,
    apiKey?: string
  ): Promise<string> {
    this.logger.log('About to extract text from media...');

    // Check if it's a video platform URL that needs special handling
    const videoStreamInfo = await this.getVideoStreamInfo(url);
    if (videoStreamInfo) {
      this.logger.log(
        `Detected ${videoStreamInfo.platform} URL, using direct stream: ${videoStreamInfo.streamUrl}`
      );
      return this.processVideoStream(videoStreamInfo, apiKey);
    }

    // Continue with regular processing for non-platform URLs
    let response;
    if (!apiKey) {
      response = await axios.get(url, {
        responseType: 'arraybuffer',
      });
    } else {
      response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 60000,
        headers: {
          'x-api-key': apiKey,
        },
      });
    }
    const buffer = Buffer.from(response.data);
    this.logger.log('Got a resulting buffer');

    // Detect mimetype from buffer if not provided
    let detectedMimetype = mimetype;
    if (!detectedMimetype) {
      detectedMimetype = this.detectMimetypeFromBuffer(buffer);
      this.logger.log(`Detected mimetype: ${detectedMimetype}`);
    }

    switch (detectedMimetype) {
      case 'application/pdf': {
        this.logger.log('About to parse PDF...');
        const pdfData = await pdfParse(buffer);
        return pdfData.text;
      }
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
        // DOCX
        const docxData = await mammoth.extractRawText({ buffer });
        return docxData.value;
      }
      case 'text/plain': {
        return buffer.toString('utf-8');
      }
      case 'text/html': {
        return convert(buffer.toString('utf-8'));
      }
      case 'application/msword': // DOC
      case 'application/vnd.oasis.opendocument.text': // ODT
      case 'application/rtf': {
        // RTF
        return new Promise((resolve, reject) => {
          extractText(
            buffer,
            { typeOverride: detectedMimetype },
            (err, text) => {
              if (err) return reject(err);
              resolve(text);
            }
          );
        });
      }

      case 'image/jpeg':
      case 'image/png':
      case 'image/tiff': {
        if (apiKey) {
          const base64Image = buffer.toString('base64');
          const dataUrl = `data:${detectedMimetype};base64,${base64Image}`;
          return this.openAiService.extractTextFromScannedDocument(dataUrl);
        } else {
          return this.openAiService.extractTextFromScannedDocument(url);
        }
      }

      default: {
        // Check for audio files first
        if (detectedMimetype.startsWith('audio/')) {
          this.logger.log(
            `Processing audio file with mimetype: ${detectedMimetype}`
          );

          if (apiKey) {
            // WhatsApp case - use buffer approach
            return this.openAiService.transcribeAudioFromBuffer(
              buffer,
              detectedMimetype
            );
          } else {
            // Direct URL case
            return this.openAiService.transcribeAudioFromUrl(url);
          }
        }

        // Then check for video files
        if (detectedMimetype.startsWith('video/')) {
          this.logger.log(
            `Processing video file with mimetype: ${detectedMimetype}`
          );

          if (apiKey) {
            // WhatsApp case - use buffer approach
            // Extract audio from video buffer and transcribe
            return this.openAiService.transcribeVideoContentFromBuffer(
              buffer,
              detectedMimetype,
              {
                extractFrames: false,
              }
            );
          } else {
            // Direct URL case - extract audio from video URL and transcribe
            return this.openAiService.transcribeVideoContentFromUrl(url, {
              extractFrames: false,
            });
          }
        }

        throw new Error(`Unsupported document mimetype: ${detectedMimetype}`);
      }
    }
  }

  private async getVideoStreamInfo(url: string): Promise<{
    platform: string;
    streamUrl: string;
    mimetype: string;
  } | null> {
    try {
      // YouTube handling
      if (this.isYouTubeUrl(url)) {
        const streamUrl = await this.getYouTubeDirectUrl(url);
        return {
          platform: 'YouTube',
          streamUrl,
          mimetype: 'audio/mp4',
        };
      }

      // Vimeo handling
      if (this.isVimeoUrl(url)) {
        const streamUrl = await this.getVimeoDirectUrl(url);
        return {
          platform: 'Vimeo',
          streamUrl,
          mimetype: 'video/mp4',
        };
      }

      // Add other platforms as needed
      // Twitter, TikTok, etc.

      return null; // Not a platform URL
    } catch (error) {
      this.logger.warn(
        `Failed to get video stream info for ${url}: ${error.message}`
      );
      return null;
    }
  }

  private async processVideoStream(
    streamInfo: { platform: string; streamUrl: string; mimetype: string },
    apiKey?: string
  ): Promise<string> {
    try {
      // For platform videos, we always want to transcribe the audio
      // We'll use the stream URL directly with OpenAI
      if (apiKey) {
        // If we have an API key, we might need to download the stream first
        const response = await axios.get(streamInfo.streamUrl, {
          responseType: 'arraybuffer',
          timeout: 120000, // 2 minutes timeout for video streams
        });
        const buffer = Buffer.from(response.data);

        return this.openAiService.transcribeAudioFromBuffer(
          buffer,
          streamInfo.mimetype
        );
      } else {
        // Use the stream URL directly
        return this.openAiService.transcribeAudioFromUrl(streamInfo.streamUrl);
      }
    } catch (error) {
      this.logger.error(
        `Failed to process ${streamInfo.platform} stream: ${error.message}`
      );
      throw new Error(
        `Could not process ${streamInfo.platform} video: ${error.message}`
      );
    }
  }

  private isYouTubeUrl(url: string): boolean {
    const youtubeRegex =
      /(?:youtube\.com\/(?:[^]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\s]{11})/;
    return youtubeRegex.test(url);
  }

  private isVimeoUrl(url: string): boolean {
    const vimeoRegex = /(?:vimeo\.com\/)([0-9]+)/;
    return vimeoRegex.test(url);
  }

  private async getYouTubeDirectUrl(url: string): Promise<string> {
    try {
      this.logger.log(`Extracting YouTube stream for: ${url}`);

      const info = await ytdl.getInfo(url);

      this.logger.log(`YouTube info: ${JSON.stringify(info, null, 4)}`);

      // Get the best audio format for transcription (audio-only is preferred)
      const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
      if (audioFormats.length > 0) {
        // Sort by quality and get the best one
        const bestAudio = audioFormats.sort(
          (a, b) => b.audioBitrate || 0 - a.audioBitrate || 0
        )[0];

        this.logger.log(
          `Selected YouTube audio format: ${bestAudio.itag} (${bestAudio.audioBitrate}kbps)`
        );
        return bestAudio.url;
      }

      // Fallback to video with audio (lowest quality to save bandwidth)
      const videoFormats = ytdl.filterFormats(info.formats, 'audioandvideo');
      if (videoFormats.length > 0) {
        // Sort by quality (ascending) to get the lowest quality video
        const lowestVideo = videoFormats.sort(
          (a, b) => a.height || 999999 - b.height || 999999
        )[0];

        this.logger.log(
          `Selected YouTube video format: ${lowestVideo.itag} (${lowestVideo.height}p)`
        );
        return lowestVideo.url;
      }

      throw new Error('No suitable YouTube format found');
    } catch (error) {
      this.logger.error('YouTube stream extraction failed:', error);
      throw new Error(`Failed to extract YouTube stream: ${error.message}`);
    }
  }

  private async getVimeoDirectUrl(url: string): Promise<string> {
    try {
      // Extract video ID from Vimeo URL
      const match = url.match(/vimeo\.com\/([0-9]+)/);
      if (!match) throw new Error('Invalid Vimeo URL');

      const videoId = match[1];

      // Vimeo API approach (requires API key in environment)
      if (process.env.VIMEO_ACCESS_TOKEN) {
        this.logger.log(`Extracting Vimeo stream for video ID: ${videoId}`);

        const response = await axios.get(
          `https://api.vimeo.com/videos/${videoId}`,
          {
            headers: {
              Authorization: `Bearer ${process.env.VIMEO_ACCESS_TOKEN}`,
            },
          }
        );

        if (response.data.files) {
          // Look for audio-only file first
          const audioFile = response.data.files.find(
            (f) => f.quality === 'audio'
          );
          if (audioFile) {
            this.logger.log('Selected Vimeo audio-only format');
            return audioFile.link;
          }

          // Fallback to lowest quality video
          const videoFile = response.data.files.sort(
            (a, b) =>
              parseInt(a.width || '999999') - parseInt(b.width || '999999')
          )[0];
          if (videoFile) {
            this.logger.log(
              `Selected Vimeo video format: ${videoFile.width}x${videoFile.height}`
            );
            return videoFile.link;
          }
        }
      }

      throw new Error(
        'Vimeo direct URL extraction requires VIMEO_ACCESS_TOKEN environment variable'
      );
    } catch (error) {
      this.logger.error('Vimeo stream extraction failed:', error);
      throw new Error(`Failed to extract Vimeo stream: ${error.message}`);
    }
  }

  private detectMimetypeFromBuffer(buffer: Buffer): string {
    // Check magic bytes at the beginning of the file
    const firstBytes = buffer.subarray(0, 16);

    // PDF
    if (firstBytes.subarray(0, 4).toString() === '%PDF') {
      return 'application/pdf';
    }

    // ZIP-based formats (DOCX, ODT)
    if (firstBytes[0] === 0x50 && firstBytes[1] === 0x4b) {
      // It's a ZIP file, need to check internal structure
      const bufferStr = buffer.toString('ascii', 0, 200);
      if (bufferStr.includes('word/')) {
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      }
      if (bufferStr.includes('content.xml') && bufferStr.includes('mimetype')) {
        return 'application/vnd.oasis.opendocument.text';
      }
    }

    // DOC (Microsoft Word 97-2003)
    if (
      firstBytes[0] === 0xd0 &&
      firstBytes[1] === 0xcf &&
      firstBytes[2] === 0x11 &&
      firstBytes[3] === 0xe0
    ) {
      return 'application/msword';
    }

    // RTF
    if (firstBytes.subarray(0, 5).toString() === '{\\rtf') {
      return 'application/rtf';
    }

    // Images
    // JPEG
    if (
      firstBytes[0] === 0xff &&
      firstBytes[1] === 0xd8 &&
      firstBytes[2] === 0xff
    ) {
      return 'image/jpeg';
    }

    // PNG
    if (
      firstBytes[0] === 0x89 &&
      firstBytes[1] === 0x50 &&
      firstBytes[2] === 0x4e &&
      firstBytes[3] === 0x47
    ) {
      return 'image/png';
    }

    // TIFF
    if (
      (firstBytes[0] === 0x49 &&
        firstBytes[1] === 0x49 &&
        firstBytes[2] === 0x2a &&
        firstBytes[3] === 0x00) ||
      (firstBytes[0] === 0x4d &&
        firstBytes[1] === 0x4d &&
        firstBytes[2] === 0x00 &&
        firstBytes[3] === 0x2a)
    ) {
      return 'image/tiff';
    }

    // Audio formats
    // MP3
    if (
      (firstBytes[0] === 0xff && (firstBytes[1] & 0xe0) === 0xe0) || // MPEG audio
      firstBytes.subarray(0, 3).toString() === 'ID3'
    ) {
      // ID3 tag
      return 'audio/mpeg';
    }

    // WAV
    if (
      firstBytes.subarray(0, 4).toString() === 'RIFF' &&
      firstBytes.subarray(8, 12).toString() === 'WAVE'
    ) {
      return 'audio/wav';
    }

    // OGG
    if (firstBytes.subarray(0, 4).toString() === 'OggS') {
      return 'audio/ogg';
    }

    // M4A/AAC
    if (firstBytes.subarray(4, 8).toString() === 'ftyp') {
      const brand = firstBytes.subarray(8, 12).toString();
      if (brand === 'M4A ' || brand === 'mp42') {
        return 'audio/mp4';
      }
    }

    // Video formats
    // MP4
    if (firstBytes.subarray(4, 8).toString() === 'ftyp') {
      const brand = firstBytes.subarray(8, 12).toString();
      if (brand.startsWith('mp4') || brand === 'isom' || brand === 'avc1') {
        return 'video/mp4';
      }
    }

    // AVI
    if (
      firstBytes.subarray(0, 4).toString() === 'RIFF' &&
      firstBytes.subarray(8, 12).toString() === 'AVI '
    ) {
      return 'video/avi';
    }

    // WebM
    if (
      firstBytes[0] === 0x1a &&
      firstBytes[1] === 0x45 &&
      firstBytes[2] === 0xdf &&
      firstBytes[3] === 0xa3
    ) {
      return 'video/webm';
    }

    // MOV/QuickTime
    if (
      firstBytes.subarray(4, 8).toString() === 'ftyp' &&
      firstBytes.subarray(8, 12).toString() === 'qt  '
    ) {
      return 'video/quicktime';
    }

    // Text formats - check if it's valid UTF-8 text
    try {
      const text = buffer.toString('utf-8');
      // Simple heuristic: if we can decode it as UTF-8 and it contains mostly printable characters
      const printableRatio =
        (text.match(/[\x20-\x7E\s]/g) || []).length / text.length;
      if (printableRatio > 0.8) {
        // Check if it looks like HTML
        if (
          text.toLowerCase().includes('<html') ||
          text.toLowerCase().includes('<!doctype')
        ) {
          return 'text/html';
        }
        return 'text/plain';
      }
    } catch {
      // Not valid UTF-8
    }

    // Default fallback
    throw new Error('Could not detect mimetype from buffer');
  }

  async getMimeTypeFromHeaders(url: string): Promise<string> {
    try {
      // this.logger.debug(`Fetching headers to determine MIME type for: ${url}`);

      // Make a HEAD request to get headers without downloading the full image
      const response = await axios.head(url, {
        timeout: 5000, // 5 second timeout
        validateStatus: (status) => status < 400, // Accept redirects
      });

      const contentType = response.headers['content-type'];
      if (contentType && contentType.startsWith('image/')) {
        // this.logger.debug(`Got MIME type from headers: ${contentType}`);
        return contentType.split(';')[0]; // Remove any additional parameters
      }

      // Fallback to URL-based inference
      this.logger.warn(
        `No valid image content-type in headers, falling back to URL inference`
      );
      return this.inferMimeTypeFromUrl(url);
    } catch (error) {
      this.logger.warn(
        `Failed to fetch headers for MIME type: ${error.message}, falling back to URL inference`
      );
      return this.inferMimeTypeFromUrl(url);
    }
  }

  private inferMimeTypeFromUrl(url: string): string {
    try {
      // Extract the file extension from URL
      const urlObj = new URL(url);
      const pathname = urlObj.pathname.toLowerCase();
      const extension = pathname.substring(pathname.lastIndexOf('.') + 1);

      // Map common image extensions to MIME types
      const mimeTypeMap: { [key: string]: string } = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        bmp: 'image/bmp',
        webp: 'image/webp',
        tiff: 'image/tiff',
        tif: 'image/tiff',
        svg: 'image/svg+xml',
        ico: 'image/x-icon',
        heic: 'image/heic',
        heif: 'image/heif',
      };

      const mimeType = mimeTypeMap[extension];
      if (mimeType) {
        this.logger.debug(`Inferred MIME type from URL extension: ${mimeType}`);
        return mimeType;
      }

      // Default to JPEG if extension not recognized
      this.logger.warn(
        `Unknown image extension: ${extension}, defaulting to image/jpeg`
      );
      return 'image/jpeg';
    } catch (error) {
      this.logger.warn(
        `Failed to parse URL for MIME type inference: ${error.message}, defaulting to image/jpeg`
      );
      return 'image/jpeg';
    }
  }

  async extractTextFromWebsite(url: string): Promise<string> {
    this.logger.log(
      `Attempting generic website content extraction from: ${url}`
    );

    let browser = null;
    const GENERIC_TIMEOUT = 120000; // 120 seconds total timeout for the operation

    try {
      const puppeteer = await import('puppeteer');

      browser = await puppeteer.launch({
        executablePath:
          process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
        headless: true,
        protocolTimeout: GENERIC_TIMEOUT, // Use a generous protocol timeout
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--window-size=1920,1080',
        ],
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });
      page.setDefaultNavigationTimeout(GENERIC_TIMEOUT);

      this.logger.log(`Navigating to ${url}...`);
      await page.goto(url, { waitUntil: 'load' });
      this.logger.log(`Initial page load event fired for ${url}.`);

      try {
        await page.waitForSelector('body', { timeout: 10000 });
        this.logger.log('Body element found.');
      } catch {
        this.logger.warn('Body element not found quickly, proceeding anyway.');
      }

      // **CORRECTION:** Use standard JS timeout instead of page.waitForTimeout
      const dynamicWaitMs = 5000; // Wait 5 seconds
      this.logger.log(
        `Waiting for ${dynamicWaitMs}ms for potential dynamic content...`
      );
      await new Promise((resolve) => setTimeout(resolve, dynamicWaitMs));

      this.logger.log('Extracting page content...');
      const html = await page.content();

      await browser.close();
      browser = null;

      this.logger.log('Converting HTML to text...');
      const text = convert(html, {
        wordwrap: null,
        selectors: [
          { selector: 'img', format: 'skip' },
          { selector: 'a', options: { ignoreHref: true } },
          { selector: 'script', format: 'skip' },
          { selector: 'style', format: 'skip' },
          { selector: 'nav', format: 'skip' },
          { selector: 'footer', format: 'skip' },
          { selector: 'header', format: 'skip' },
          { selector: 'aside', format: 'skip' },
        ],
      });

      this.logger.log(
        `Generic extraction successful. Length: ${text.length} characters`
      );
      return text;
    } catch (error) {
      this.logger.error(
        `Generic Puppeteer extraction failed: ${error.message}`
      );
      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          this.logger.error(
            `Failed to close browser after error: ${closeError.message}`
          );
        }
      }
      throw new Error(`Could not extract text from website: ${error.message}`);
    }
  }
}
