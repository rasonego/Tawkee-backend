// // prisma/seeds/plans.seed.ts
// import { PrismaClient } from '@prisma/client';

// const prisma = new PrismaClient();

// async function seedPlans() {
//   const plans = [
//     {
//       name: 'Starter',
//       description: 'Perfeito para começar',
//       price: 29.99,
//       currency: 'USD',
//       interval: 'MONTH',
//       intervalCount: 1,
//       features: [
//         'Até 5 agentes',
//         '10.000 requests da API por mês',
//         'Suporte por email',
//         'Integração básica'
//       ],
//       apiRequestLimit: 10000,
//       agentLimit: 5,
//       trialDays: 7,
//       isActive: true,
//     },
//     {
//       name: 'Professional',
//       description: 'Para equipes em crescimento',
//       price: 99.99,
//       currency: 'USD',
//       interval: 'MONTH',
//       intervalCount: 1,
//       features: [
//         'Até 25 agentes',
//         '100.000 requests da API por mês',
//         'Suporte prioritário',
//         'Integrações avançadas',
//         'Analytics detalhado'
//       ],
//       apiRequestLimit: 100000,
//       agentLimit: 25,
//       trialDays: 14,
//       isActive: true,
//     },
//     {
//       name: 'Business',
//       description: 'Para empresas estabelecidas',
//       price: 299.99,
//       currency: 'USD',
//       interval: 'MONTH',
//       intervalCount: 1,
//       features: [
//         'Até 100 agentes',
//         '500.000 requests da API por mês',
//         'Suporte 24/7',
//         'Todas as integrações',
//         'Analytics avançado',
//         'API customizada'
//       ],
//       apiRequestLimit: 500000,
//       agentLimit: 100,
//       trialDays: 14,
//       isActive: true,
//     },
//     {
//       name: 'Enterprise',
//       description: 'Soluções customizadas para grandes empresas',
//       price: 999.99,
//       currency: 'USD',
//       interval: 'MONTH',
//       intervalCount: 1,
//       features: [
//         'Agentes ilimitados',
//         'Requests ilimitados',
//         'Suporte dedicado',
//         'Integrações customizadas',
//         'SLA garantido',
//         'Implementação assistida'
//       ],
//       apiRequestLimit: null, // Ilimitado
//       agentLimit: null, // Ilimitado
//       isEnterprise: true,
//       isActive: true,
//     }
//   ];

//   for (const planData of plans) {
//     const existingPlan = await prisma.plan.findUnique({
//       where: { name: planData.name }
//     });

//     if (!existingPlan) {
//       // Aqui você precisaria criar os produtos/preços no Stripe primeiro
//       // Este é apenas um exemplo de estrutura
//       await prisma.plan.create({
//         data: {
//           ...planData,
//           stripePriceId: `price_${planData.name.toLowerCase()}`, // Placeholder
//           stripeProductId: `prod_${planData.name.toLowerCase()}`, // Placeholder
//         }
//       });
//       console.log(`Created plan: ${planData.name}`);
//     }
//   }
// }

// // Como usar nos controllers - Exemplo
// // src/example/example.controller.ts
// import { Controller, Post, UseGuards, UseInterceptors, Body } from '@nestjs/common';
// import { TrackUsage } from '../stripe/decorators/usage-tracking.decorator';
// import { UsageLimitGuard } from '../stripe/guards/usage-limit.guard';
// import { UsageTrackingInterceptor } from '../stripe/interceptors/usage-tracking.interceptor';

// @Controller('example')
// export class ExampleController {
  
//   @Post('generate-text')
//   @TrackUsage('api_call') // Vai registrar como 'api_call' na tabela de usage
//   @UseGuards(UsageLimitGuard) // Verifica limites antes de executar
//   @UseInterceptors(UsageTrackingInterceptor) // Registra uso após sucesso
//   async generateText(@Body() body: { workspaceId: string; text: string }) {
//     // Sua lógica aqui
//     return { result: 'Generated text...' };
//   }

//   @Post('text-to-speech')
//   @TrackUsage('text_to_speech')
//   @UseGuards(UsageLimitGuard)
//   @UseInterceptors(UsageTrackingInterceptor)
//   async textToSpeech(@Body() body: { workspaceId: string; text: string }) {
//     // Integração com ElevenLabs ou similar
//     return { audioUrl: 'https://...' };
//   }
// }

// // Como verificar limites programaticamente
// // src/services/usage-check.service.ts
// import { Injectable } from '@nestjs/common';
// import { StripeService } from '../stripe/stripe.service';

// @Injectable()
// export class UsageCheckService {
//   constructor(private stripeService: StripeService) {}

//   async canMakeRequest(workspaceId: string, requestType: string): Promise<{
//     allowed: boolean;
//     currentUsage: number;
//     limit: number | null;
//     percentage: number;
//   }> {
//     const subscription = await this.stripeService.getSubscription(workspaceId);
    
//     if (!subscription) {
//       return { allowed: false, currentUsage: 0, limit: null, percentage: 0 };
//     }

//     const currentMonth = new Date();
//     currentMonth.setDate(1);
//     currentMonth.setHours(0, 0, 0, 0);
    
//     const usage = await this.stripeService.getUsage(workspaceId, currentMonth);
//     const currentUsage = usage[requestType] || 0;
//     const limit = subscription.plan.apiRequestLimit;

//     if (!limit) {
//       // Plano ilimitado
//       return { allowed: true, currentUsage, limit: null, percentage: 0 };
//     }

//     const percentage = (currentUsage / limit) * 100;
//     const allowed = currentUsage < limit;

//     return { allowed, currentUsage, limit, percentage };
//   }

//   async getUsageReport(workspaceId: string): Promise<any> {
//     const subscription = await this.stripeService.getSubscription(workspaceId);
    
//     if (!subscription) {
//       throw new Error('No subscription found');
//     }

//     const currentMonth = new Date();
//     currentMonth.setDate(1);
//     currentMonth.setHours(0, 0, 0, 0);
    
//     const nextMonth = new Date(currentMonth);
//     nextMonth.setMonth(nextMonth.getMonth() + 1);

//     const usage = await this.stripeService.getUsage(workspaceId, currentMonth, nextMonth);

//     return {
//       subscription: {
//         plan: subscription.plan.name,
//         status: subscription.status,
//         currentPeriodEnd: subscription.currentPeriodEnd,
//       },
//       limits: {
//         apiRequests: subscription.plan.apiRequestLimit,
//         agents: subscription.plan.agentLimit,
//       },
//       currentUsage: usage,
//       percentages: Object.keys(usage).reduce((acc, key) => {
//         const limit = subscription.plan.apiRequestLimit;
//         if (limit) {
//           acc[key] = Math.round((usage[key] / limit) * 100);
//         }
//         return acc;
//       }, {} as Record<string, number>),
//     };
//   }
// }

// // Script para criar planos no Stripe
// // scripts/create-stripe-plans.ts
// import { StripeService } from '../src/stripe/stripe.service';
// import { PrismaService } from '../src/prisma/prisma.service';

// async function createStripePlans() {
//   const prisma = new PrismaService();
//   const stripeService = new StripeService(prisma);

//   const plans = [
//     {
//       name: 'Starter',
//       description: 'Perfeito para começar',
//       price: 29.99,
//       currency: 'usd',
//       interval: 'MONTH' as const,
//       features: ['Até 5 agentes', '10.000 requests da API por mês'],
//       apiRequestLimit: 10000,
//       agentLimit: 5,
//       trialDays: 7,
//     },
//     // ... outros planos
//   ];

//   for (const planData of plans) {
//     try {
//       const plan = await stripeService.createPlan(planData);
//       console.log(`Created plan: ${plan.name} with ID: ${plan.id}`);
//     } catch (error) {
//       console.error(`Failed to create plan ${planData.name}:`, error);
//     }
//   }

//   await prisma.$disconnect();
// }

// // Executar: npx ts-node scripts/create-stripe-plans.ts