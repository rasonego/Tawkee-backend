import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { resolve } from 'path';
import { FileService } from './file.service';
import { FileController } from './file.controller';

@Module({
  imports: [
    ConfigModule,
    ServeStaticModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const uploadsFolder =
          configService.get<string>('UPLOADS_FOLDER') || './uploads';
        return [
          {
            rootPath: resolve(uploadsFolder),
            serveRoot: '/files',
          },
        ];
      },
    }),
  ],
  controllers: [FileController],
  providers: [FileService],
  exports: [FileService],
})
export class FileModule {}
