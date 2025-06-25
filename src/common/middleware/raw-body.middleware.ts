// raw-body.middleware.ts
import { Request, Response, NextFunction } from 'express';
import getRawBody from 'raw-body';

export function rawBodyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (req.headers['stripe-signature']) {
    getRawBody(
      req,
      {
        length: req.headers['content-length'],
        limit: '2mb',
        encoding: 'utf-8',
      },
      (err, stringBuffer) => {
        if (err) return next(err);
        (req as any).rawBody = stringBuffer;
        next();
      }
    );
  } else {
    next();
  }
}
