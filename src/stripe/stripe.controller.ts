// src/stripe/stripe.controller.ts
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Headers,
  RawBodyRequest,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { StripeService } from './stripe.service';
import { CreateSubscriptionDto, CreatePlanDto } from './dto/stripe.dto';
// Assumindo que você tem um guard de autenticação
// import { AuthGuard } from 'src/auth/auth.guard';

@Controller('stripe')
export class StripeController {
  constructor(private readonly stripeService: StripeService) {}

  @Post('webhooks')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string
  ) {
    const payload = req.rawBody;

    if (!payload) {
      throw new Error('Missing request body');
    }

    await this.stripeService.handleWebhook(payload, signature);
    return { received: true };
  }

  // @UseGuards(AuthGuard) // Descomente se tiver guard de auth
  @Post('checkout-session')
  async createCheckoutSession(
    @Body() createSubscriptionDto: CreateSubscriptionDto
  ) {
    const url = await this.stripeService.createCheckoutSession(
      createSubscriptionDto
    );
    return { url };
  }

  // @UseGuards(AuthGuard)
  @Get('plans')
  async getPlans() {
    return this.stripeService.getPlans();
  }

  // @UseGuards(AuthGuard)
  @Get('subscription/:workspaceId')
  async getSubscription(@Param('workspaceId') workspaceId: string) {
    return this.stripeService.getSubscription(workspaceId);
  }

  // @UseGuards(AuthGuard)
  @Post('subscription/:workspaceId/cancel')
  async cancelSubscription(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { cancelAtPeriodEnd?: boolean } = {}
  ) {
    await this.stripeService.cancelSubscription(
      workspaceId,
      body.cancelAtPeriodEnd ?? true
    );
    return { success: true };
  }

  // @UseGuards(AuthGuard)
  @Get('usage/:workspaceId')
  async getUsage(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { startDate?: string; endDate?: string } = {}
  ) {
    const startDate = body.startDate ? new Date(body.startDate) : undefined;
    const endDate = body.endDate ? new Date(body.endDate) : undefined;

    return this.stripeService.getUsage(workspaceId, startDate, endDate);
  }

  // Rota administrativa para criar planos
  // @UseGuards(AdminGuard) // Guard específico para admins
  @Post('plans')
  async createPlan(@Body() createPlanDto: CreatePlanDto) {
    return this.stripeService.createPlan(createPlanDto);
  }
}
