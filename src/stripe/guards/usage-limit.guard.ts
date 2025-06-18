import {
  Injectable,
  CanActivate,
  ExecutionContext,
  BadRequestException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StripeService } from '../stripe.service';
import { USAGE_TRACKING_KEY } from '../decorators/usage-tracking.decorator';

@Injectable()
export class UsageLimitGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private stripeService: StripeService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requestType = this.reflector.getAllAndOverride<string>(
      USAGE_TRACKING_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!requestType) {
      return true; // Se não há tracking, permite
    }

    const request = context.switchToHttp().getRequest();
    const workspaceId = request.user?.workspaceId || request.body?.workspaceId;

    if (!workspaceId) {
      throw new BadRequestException('Workspace ID is required');
    }

    // Verificar limites
    const subscription = await this.stripeService.getSubscription(workspaceId);

    if (!subscription) {
      throw new BadRequestException('No active subscription found');
    }

    // Verificar uso atual do mês
    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);

    const usage = await this.stripeService.getUsage(workspaceId, currentMonth);
    const currentUsage = usage[requestType] || 0;

    // Verificar limite do plano
    if (
      subscription.plan.apiRequestLimit &&
      currentUsage >= subscription.plan.apiRequestLimit
    ) {
      throw new BadRequestException(
        `API request limit exceeded. Current usage: ${currentUsage}/${subscription.plan.apiRequestLimit}`
      );
    }

    // Registrar uso após validação
    await this.stripeService.recordUsage(workspaceId, requestType);

    return true;
  }
}
