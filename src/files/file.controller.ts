import {
  Controller,
  Post,
  Delete,
  Body,
  UploadedFile,
  UseInterceptors,
  HttpCode,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { FileService } from './file.service';
import * as crypto from 'crypto';
import * as path from 'path';

@Controller('upload')
export class FileController {
  constructor(private readonly fileService: FileService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: path.resolve(__dirname, '..', '..', 'tmp'),
        filename: (req, file, cb) => {
          const hash = crypto.randomBytes(10).toString('hex');
          const filename = `${hash}-${file.originalname}`;
          cb(null, filename);
        },
      }),
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    // Moves file from tmp to uploads folder
    const filename = await this.fileService.saveFile(file.filename);

    return {
      filename,
      url: `/files/${filename}`,
    };
  }

  @Delete()
  @HttpCode(204)
  async deleteFile(@Body('filename') filename: string) {
    await this.fileService.deleteFile(filename);
  }
}
