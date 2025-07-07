import {
  Body,
  Controller,
  Post,
  Req,
  Res,
  Headers,
  HttpException,
  HttpStatus,
  Get,
  UnauthorizedException,
  Param,
  Query,
} from '@nestjs/common';
import { StripeService } from './stripe.service';
import { Request, Response } from 'express';
import Stripe from 'stripe';
import { CreatePlanFromStripeDto } from './dto/create-plan-from-stripe.dto';
import { ConfigService } from '@nestjs/config';
import { UpdatePlanFromFormDto } from './dto/update-plan-from-form.dto';
import { UpdateSubscriptionOverridesDto } from './dto/update-subscription-overrides.dto';
import { ApiOperation } from '@nestjs/swagger';
import { WorkspacePaymentBalanceItem } from './dto/workspace-payment-balance-item';
import { differenceInDays, isValid, parseISO } from 'date-fns';

@Controller('stripe')
export class StripeController {
  constructor(
    private readonly stripeService: StripeService,
    private readonly configService: ConfigService
  ) {}

  @Post('checkout')
  async createCheckout(
    @Body() body: { workspaceId: string; priceId: string }
  ): Promise<{ url: string }> {
    const url = await this.stripeService.createCheckoutSession(
      body.workspaceId,
      body.priceId
    );
    return { url };
  }

  @Post('purchase-credits')
  async createOneTimeCreditPurchaseSession(
    @Body() body: { workspaceId: string; credits: number }
  ): Promise<{ url: string }> {
    const url = await this.stripeService.createOneTimeCreditPurchaseSession(
      body.workspaceId,
      body.credits
    );
    return { url };
  }

  @Post('webhook')
  async handleStripeWebhook(
    @Req() req: Request,
    @Res() res: Response,
    @Headers('stripe-signature') signature: string
  ): Promise<void> {
    console.log('Got stripe webook event!');
    const rawBody = (req as any).rawBody;

    if (!rawBody || !signature) {
      throw new HttpException(
        'Invalid Stripe webhook payload',
        HttpStatus.BAD_REQUEST
      );
    }

    try {
      const event = this.stripeService.constructWebhookEvent(
        rawBody,
        signature
      );
      await this.stripeService.handleWebhook(event);
      res.status(200).send({ received: true });
    } catch (err) {
      console.error('Stripe Webhook Error:', err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }

  @Get('products')
  async getProducts(): Promise<
    {
      product: Stripe.Product;
      prices: Stripe.Price[];
      planDetails?: any;
    }[]
  > {
    return this.stripeService.getStripeProducts();
  }

  @Post('plans/create-from-form')
  async createPlanFromForm(@Body() dto: UpdatePlanFromFormDto) {
    return this.stripeService.createPlanFromForm(dto);
  }

  @Post('plans/update-from-form')
  async updatePlanFromForm(@Body() dto: UpdatePlanFromFormDto) {
    return this.stripeService.updatePlanFromForm(dto);
  }

  @Post('subscription/update-overrides')
  async updateSubscriptionOverrides(
    @Body() dto: UpdateSubscriptionOverridesDto
  ) {
    return this.stripeService.updateSubscriptionOverrides(dto);
  }

  @Post('plans/sync-from-stripe')
  async createPlanFromStripe(
    @Body() dto: CreatePlanFromStripeDto,
    @Headers('x-api-key') apiKey: string
  ) {
    const expectedKey = this.configService.get<string>('ADMIN_API_KEY');

    if (!apiKey || apiKey !== expectedKey) {
      throw new UnauthorizedException('Invalid or missing admin API key');
    }

    return this.stripeService.syncPlanFromStripe(dto);
  }

  @Post('billing/change-or-subscribe')
  async handleSubscriptionChangeOrCreation(
    @Body() body: { workspaceId: string; priceId: string }
  ): Promise<{ url?: string; message?: string; subscriptionId?: string }> {
    const { workspaceId, priceId } = body;

    const subscriptionList =
      await this.stripeService.getSubscriptionsForWorkspace(workspaceId);

    const hasSubscription = subscriptionList?.length > 0;

    if (!hasSubscription) {
      // Usuário ainda não tem assinatura — cria checkout
      const url = await this.stripeService.createCheckoutSession(
        workspaceId,
        priceId
      );
      return { url };
    }

    // Usuário já tem uma assinatura ativa — apenas troca o plano
    const result = await this.stripeService.confirmPlanChange(
      workspaceId,
      priceId
    );
    return result;
  }

  @Get('billing/status/:workspaceId')
  async getBillingStatus(@Param('workspaceId') workspaceId: string) {
    return this.stripeService.getBillingStatus(workspaceId);
  }

  @Post('billing/customer-portal/:workspaceId')
  async createCustomerPortal(@Param('workspaceId') workspaceId: string) {
    const url = await this.stripeService.createCustomerPortal(workspaceId);
    return { url };
  }

  @Get('billing/plan-preview/:workspaceId/:priceId')
  async previewPlanChange(
    @Param('workspaceId') workspaceId: string,
    @Param('priceId') priceId: string
  ) {
    return this.stripeService.previewPlanChange(workspaceId, priceId);
  }

  @Post('billing/change-plan')
  async confirmPlanChange(
    @Body() body: { workspaceId: string; priceId: string }
  ) {
    const { workspaceId, priceId } = body;
    return this.stripeService.confirmPlanChange(workspaceId, priceId);
  }

  @Get('billing/payments/:workspaceId')
  @ApiOperation({
    summary:
      'Retrieve daily cumulative payments (plan and one-time) for a workspace or all workspaces',
  })
  async getWorkspacePaymentsInPeriod(
    @Param('workspaceId') workspaceIdParam: string,
    @Query('startDate') startDateStr: string,
    @Query('endDate') endDateStr: string
  ): Promise<WorkspacePaymentBalanceItem[]> {
    if (!startDateStr || !endDateStr) {
      throw new HttpException(
        'startDate and endDate are required',
        HttpStatus.BAD_REQUEST
      );
    }

    const startDate = parseISO(startDateStr);
    const endDate = parseISO(endDateStr);

    if (!isValid(startDate) || !isValid(endDate)) {
      throw new HttpException(
        'Invalid startDate or endDate format',
        HttpStatus.BAD_REQUEST
      );
    }

    const rangeDays = differenceInDays(endDate, startDate);
    if (rangeDays > 180) {
      throw new HttpException(
        'Date range cannot exceed 180 days',
        HttpStatus.BAD_REQUEST
      );
    }

    // Interpret "all" keyword to fetch from all workspaces
    const workspaceId =
      workspaceIdParam.toLowerCase() === 'all' ? null : workspaceIdParam;

    return this.stripeService.getWorkspacePaymentsInPeriod(
      workspaceId,
      startDate,
      endDate
    );
  }
}
