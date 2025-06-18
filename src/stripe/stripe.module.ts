import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { StripeController } from './stripe.controller';
import { RawBodyMiddleware } from './middleware/raw-body.middleware';

@Module({
  providers: [StripeService],
  controllers: [StripeController],
  exports: [StripeService],
})
export class StripeModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RawBodyMiddleware)
      .forRoutes({ path: 'stripe/webhooks', method: RequestMethod.POST });
  }
}
