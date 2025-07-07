import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);
  private readonly tmpFolder: string;
  private readonly uploadsFolder: string;

  constructor(private readonly configService: ConfigService) {
    this.tmpFolder =
      this.configService.get<string>('TMP_FOLDER') ||
      path.resolve(__dirname, '..', '..', 'tmp');
    this.uploadsFolder =
      this.configService.get<string>('UPLOADS_FOLDER') ||
      path.resolve(__dirname, '..', '..', 'uploads');

    this.ensureFoldersExist(); // 👈 initialize folders
  }

  private async ensureFoldersExist() {
    await fs.mkdir(this.tmpFolder, { recursive: true });
    await fs.mkdir(this.uploadsFolder, { recursive: true });
    this.logger.log(
      `Folders ensured: ${this.tmpFolder}, ${this.uploadsFolder}`
    );
  }

  async saveFile(file: string): Promise<string> {
    const sourcePath = path.resolve(this.tmpFolder, file);
    const destinationPath = path.resolve(this.uploadsFolder, file);

    try {
      await fs.rename(sourcePath, destinationPath);
      this.logger.log(`File moved: ${file}`);
      return file;
    } catch (error) {
      this.logger.error(`Failed to save file: ${file}`, error.stack);
      throw error;
    }
  }

  async deleteFile(file: string): Promise<void> {
    const filePath = path.resolve(this.uploadsFolder, file);

    try {
      await fs.stat(filePath);
      await fs.unlink(filePath);
      this.logger.log(`File deleted: ${file}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.logger.error(`Failed to delete file: ${file}`, error.stack);
        throw error;
      }
      this.logger.warn(`File not found (delete skipped): ${file}`);
    }
  }
}
