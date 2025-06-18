import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class StripeWebhookMiddleware implements NestMiddleware {
  private readonly logger = new Logger(StripeWebhookMiddleware.name);

  use(req: Request, res: Response, next: NextFunction) {
    if (req.originalUrl === '/stripe/webhooks') {
      let body = '';

      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        body += chunk;
      });

      req.on('end', () => {
        (req as any).rawBody = Buffer.from(body, 'utf8');
        next();
      });
    } else {
      next();
    }
  }
}
