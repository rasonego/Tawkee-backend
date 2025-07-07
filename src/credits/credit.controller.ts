// src/credits/credit.controller.ts

import {
  Controller,
  Patch,
  Body,
  Param,
  ParseUUIDPipe,
  Get,
  Query,
} from '@nestjs/common';
import { CreditService } from './credit.service';
import { UpdateSmartRechargeSettingDto } from './dto/update-smart-recharge-setting.dto';
import { ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';

@Controller('credits')
export class CreditController {
  constructor(private readonly creditService: CreditService) {}

  @Get('/remaining/:workspaceId')
  @ApiOperation({ summary: 'Get current workspace credits' })
  @ApiResponse({
    status: 200,
    description: 'Returns current credit balance of the workspace',
    schema: {
      example: {
        credits: 250,
      },
    },
  })
  async getWorkspaceCredits(
    @Param('workspaceId') workspaceId: string
  ): Promise<{ planCreditsRemaining: number; extraCreditsRemaining: number }> {
    return this.creditService.getWorkspaceRemainingCredits(workspaceId);
  }

  @Get('/daily-balance/:workspaceId')
  @ApiOperation({
    summary: 'Get daily credit balance within current subscription period',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Start date for the range (YYYY-MM-DD)',
    example: '2025-06-01',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'End date for the range (YYYY-MM-DD)',
    example: '2025-06-14',
  })
  @ApiResponse({
    status: 200,
    description: 'Daily balance of plan and extra credits',
    schema: {
      example: [
        {
          date: '2025-06-01',
          planCreditsRemaining: 80,
          extraCreditsRemaining: 50,
        },
        {
          date: '2025-06-02',
          planCreditsRemaining: 75,
          extraCreditsRemaining: 50,
        },
      ],
    },
  })
  async getDailyCreditBalance(
    @Param('workspaceId') workspaceId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    return this.creditService.getDailyCreditBalanceInCurrentPeriod(
      workspaceId,
      startDate,
      endDate
    );
  }

  @Patch('smart-recharge/:workspaceId')
  async updateSmartRechargeSetting(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: UpdateSmartRechargeSettingDto
  ) {
    return this.creditService.updateSmartRechargeSetting(workspaceId, dto);
  }
}
