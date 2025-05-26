import axios from 'axios';
import pdfParse from 'pdf-parse';
import * as mammoth from 'mammoth';
import { fromBuffer as extractText } from 'textract';
import { convert } from 'html-to-text';
import { Injectable, Logger } from '@nestjs/common';
import { OpenAiService } from 'src/openai/openai.service';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(private readonly openAiService: OpenAiService) {}

  async extractTextFromDocument(
    url: string,
    mimetype: string
  ): Promise<string> {
    this.logger.log('About to fetch PDF content through HTTP request...');
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);
    this.logger.log('Got a resulting buffer');

    switch (mimetype) {
      case 'application/pdf': {
        this.logger.log('About to parse PDF...');
        const pdfData = await pdfParse(buffer);
        this.logger.log(`Got a result: ${pdfData}`);
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
        return this.openAiService.extractTextFromScannedDocument(url);
      }

      default: {
        throw new Error(`Unsupported document mimetype: ${mimetype}`);
      }
    }
  }

  async getMimeTypeFromHeaders(url: string): Promise<string> {
    try {
      this.logger.debug(`Fetching headers to determine MIME type for: ${url}`);

      // Make a HEAD request to get headers without downloading the full image
      const response = await axios.head(url, {
        timeout: 5000, // 5 second timeout
        validateStatus: (status) => status < 400, // Accept redirects
      });

      const contentType = response.headers['content-type'];
      if (contentType && contentType.startsWith('image/')) {
        this.logger.debug(`Got MIME type from headers: ${contentType}`);
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

  /**
   * New method: Extract text content from a website (HTML)
   */
  /**
   * Extract text content from a website (HTML), with Puppeteer fallback.
   */
  async extractTextFromWebsite(url: string): Promise<string> {
    this.logger.log(`About to fetch website content from: ${url}`);

    try {
      const response = await axios.get(url, {
        responseType: 'text',
        headers: {
          'User-Agent': 'DocumentsServiceBot/1.0',
        },
      });

      this.logger.log(
        `Fetched website content with Axios, about to convert HTML to text...`
      );

      const text = convert(response.data, {
        wordwrap: 130,
        selectors: [
          { selector: 'img', format: 'skip' },
          { selector: 'a', options: { ignoreHref: true } },
        ],
      });

      this.logger.log(
        `Successfully converted website content to text. Length: ${text.length} characters`
      );
      return text;
    } catch (axiosError) {
      this.logger.warn(
        `Axios failed to fetch website content: ${axiosError.message}. Attempting with Puppeteer...`
      );

      try {
        const puppeteer = await import('puppeteer');

        const browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });

        const html = await page.content();

        await browser.close();

        this.logger.log(
          `Fetched website content with Puppeteer, about to convert HTML to text...`
        );

        const text = convert(html, {
          wordwrap: 130,
          selectors: [
            { selector: 'img', format: 'skip' },
            { selector: 'a', options: { ignoreHref: true } },
          ],
        });

        this.logger.log(
          `Successfully converted website content to text via Puppeteer. Length: ${text.length} characters`
        );
        return text;
      } catch (puppeteerError) {
        this.logger.error(`Puppeteer also failed: ${puppeteerError.message}`);
        throw new Error(
          `Could not extract text from website: ${puppeteerError.message}`
        );
      }
    }
  }
}
