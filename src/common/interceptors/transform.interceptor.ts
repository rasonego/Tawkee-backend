import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  data: T;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, any> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        // If the response already has a specific format (e.g., error object), return it as is
        if (data && (data.error || data.success !== undefined)) {
          return data;
        }

        // Check if response is already wrapped in a data property or has meta pagination
        if (data && (data.data !== undefined || data.meta !== undefined)) {
          return data;
        }

        // Wrap the response in a data object
        return { data };
      })
    );
  }
}
