import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RawBodyMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    let data = '';
    
    req.on('data', (chunk) => {
      data += chunk;
    });
    
    req.on('end', () => {
      (req as any).rawBody = Buffer.from(data);
      next();
    });
  }
}