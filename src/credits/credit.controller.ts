// src/credits/credit.controller.ts

import {
  Controller,
  Patch,
  Body,
  Param,
  ParseUUIDPipe,
  Get,
} from '@nestjs/common';
import { CreditService } from './credit.service';
import { UpdateSmartRechargeSettingDto } from './dto/update-smart-recharge-setting.dto';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';

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

  @Patch('smart-recharge/:workspaceId')
  async updateSmartRechargeSetting(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: UpdateSmartRechargeSettingDto
  ) {
    return this.creditService.updateSmartRechargeSetting(workspaceId, dto);
  }
}
