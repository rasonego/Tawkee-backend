import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string = 'Internal server error';
    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();
      if (
        typeof exceptionResponse === 'object' &&
        'message' in exceptionResponse
      ) {
        const responseMessage = exceptionResponse['message'];
        if (Array.isArray(responseMessage)) {
          message = responseMessage.join(', ');
        } else if (typeof responseMessage === 'string') {
          message = responseMessage;
        }
      } else if (typeof exception.message === 'string') {
        message = exception.message;
      }
    } else if (exception && typeof exception.message === 'string') {
      message = exception.message;
    }

    // Log the error
    this.logger.error(
      `${request.method} ${request.url} - ${status}`,
      exception.stack
    );

    // Return error in format specified by GPT Maker API
    if (status === HttpStatus.BAD_REQUEST || status === HttpStatus.FORBIDDEN) {
      response.status(status).json({
        error: message,
      });
    } else {
      response.status(status).json({
        statusCode: status,
        timestamp: new Date().toISOString(),
        path: request.url,
        error: message,
      });
    }
  }
}
