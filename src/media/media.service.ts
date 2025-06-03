import axios from 'axios';
import pdfParse from 'pdf-parse';
import * as mammoth from 'mammoth';
import { fromBuffer as extractText } from 'textract';
import { convert } from 'html-to-text';
import { Injectable, Logger } from '@nestjs/common';
import { OpenAiService } from 'src/openai/openai.service';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly openAiService: OpenAiService
  ) {}

  async extractTextFromMedia(
    url: string,
    mimetype: string,
    apiKey?: string
  ): Promise<string> {
    this.logger.log('About to extract text from media...');

    let response;
    if (!apiKey) {
      response = await axios.get(url, { 
        responseType: 'arraybuffer'
      });
    } else {
      response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 60000,
        headers: {
          'x-api-key': apiKey
        }
      });
    }
    const buffer = Buffer.from(response.data);
    this.logger.log('Got a resulting buffer');

    switch (mimetype) {
      case 'application/pdf': {
        this.logger.log('About to parse PDF...');
        const pdfData = await pdfParse(buffer);
        // this.logger.log(`Got a result: ${pdfData}`);
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
          extractText(buffer, { typeOverride: mimetype }, (err, text) => {
            if (err) return reject(err);
            resolve(text);
          });
        });
      }

      case 'image/jpeg':
      case 'image/png':
      case 'image/tiff': {
        if (apiKey) {
          const base64Image = buffer.toString('base64');
          const dataUrl = `data:${mimetype};base64,${base64Image}`;
          return this.openAiService.extractTextFromScannedDocument(dataUrl);
        } else {
          return this.openAiService.extractTextFromScannedDocument(url);
        }
      }

      default: {
        // Check for audio files first
        if (mimetype.startsWith('audio/')) {
          this.logger.log(`Processing audio file with mimetype: ${mimetype}`);
          
          if (apiKey) {
            // WhatsApp case - use buffer approach
            return this.openAiService.transcribeAudioFromBuffer(
              buffer, 
              mimetype
            );
          } else {
            // Direct URL case
            return this.openAiService.transcribeAudioFromUrl(
              url
            );
          }
        }

        // Then check for video files
        if (mimetype.startsWith('video/')) {
          this.logger.log(`Processing video file with mimetype: ${mimetype}`);
          
          if (apiKey) {
            // WhatsApp case - use buffer approach
            // Extract audio from video buffer and transcribe
            return this.openAiService.transcribeVideoContentFromBuffer(
              buffer, 
              mimetype,
              {
                extractFrames: false
              }
            );
          } else {
            // Direct URL case - extract audio from video URL and transcribe
            return this.openAiService.transcribeVideoContentFromUrl(
              url,
              {
                extractFrames: false
              }
            );
          }
        }

        throw new Error(`Unsupported document mimetype: ${mimetype}`);
      }
    }
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
    this.logger.log(`Attempting generic website content extraction from: ${url}`);

    let browser = null;
    const GENERIC_TIMEOUT = 120000; // 120 seconds total timeout for the operation

    try {
      const puppeteer = await import('puppeteer');

      browser = await puppeteer.launch({
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
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
          '--window-size=1920,1080'
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
      } catch (bodyError) {
          this.logger.warn('Body element not found quickly, proceeding anyway.');
      }

      // **CORRECTION:** Use standard JS timeout instead of page.waitForTimeout
      const dynamicWaitMs = 5000; // Wait 5 seconds
      this.logger.log(`Waiting for ${dynamicWaitMs}ms for potential dynamic content...`);
      await new Promise(resolve => setTimeout(resolve, dynamicWaitMs));

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

      this.logger.log(`Generic extraction successful. Length: ${text.length} characters`);
      return text;

    } catch (error) {
      this.logger.error(`Generic Puppeteer extraction failed: ${error.message}`);
      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          this.logger.error(`Failed to close browser after error: ${closeError.message}`);
        }
      }
      throw new Error(`Could not extract text from website: ${error.message}`);
    }
  }
}