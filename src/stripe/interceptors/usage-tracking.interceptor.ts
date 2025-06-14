import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { StripeService } from '../stripe.service';
import { USAGE_TRACKING_KEY } from '../decorators/usage-tracking.decorator';

@Injectable()
export class UsageTrackingInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private stripeService: StripeService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const requestType = this.reflector.getAllAndOverride<string>(
      USAGE_TRACKING_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requestType) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const workspaceId = request.user?.workspaceId || request.body?.workspaceId;

    return next.handle().pipe(
      tap(async () => {
        if (workspaceId) {
          try {
            await this.stripeService.recordUsage(workspaceId, requestType);
          } catch (error) {
            console.error('Failed to record usage:', error);
          }
        }
      }),
    );
  }
}