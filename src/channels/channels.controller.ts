import {
  Controller,
  UseGuards,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { ChannelsService } from './channels.service';
import { AuthGuard } from '../auth/auth.guard';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ApiPaginationQueries } from '../common/decorators/api-pagination.decorator';
import { ChannelDto } from './dto/channel.dto';
import { CreateChannelDto } from './dto/create-channel.dto';
import { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import { PaginatedChannelsResponseDto } from './dto/paginated-channels-response.dto';
import { ChannelQrCodeDto } from './dto/channel-qr-code.dto';

@ApiTags('Channels')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Get('agent/:agentId/search')
  @ApiOperation({ summary: 'List channels for an agent' })
  @ApiParam({ name: 'agentId', description: 'The ID of the agent' })
  @ApiPaginationQueries()
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Channels retrieved successfully',
    type: PaginatedChannelsResponseDto,
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Agent not found' })
  async findAll(
    @Param('agentId') agentId: string,
    @Query() paginationDto: PaginationDto
  ): Promise<PaginatedResult<ChannelDto>> {
    return this.channelsService.findAll(agentId, paginationDto);
  }

  @Post('agent/:agentId/create-channel')
  @ApiOperation({ summary: 'Create a new channel for an agent' })
  @ApiParam({ name: 'agentId', description: 'The ID of the agent' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Channel created successfully',
    type: ChannelDto,
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Agent not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input' })
  async create(
    @Param('agentId') agentId: string,
    @Body() createChannelDto: CreateChannelDto
  ): Promise<ChannelDto> {
    return this.channelsService.create(agentId, createChannelDto);
  }

  @Put('channel/:channelId/refresh-qr-code')
  @ApiOperation({ summary: 'Refresh WhatsApp QR code for a channel' })
  @ApiParam({ name: 'channelId', description: 'The ID of the channel' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'QR code refreshed successfully',
    type: ChannelQrCodeDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Channel not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Not a WhatsApp channel',
  })
  async refreshWhatsAppQrCode(
    @Param('channelId') channelId: string
  ): Promise<ChannelQrCodeDto> {
    return this.channelsService.refreshWhatsAppQrCode(channelId);
  }

  @Put('channel/:channelId/disconnect')
  @ApiOperation({
    summary: 'Disconnect a WhatsApp session without deleting the channel',
  })
  @ApiParam({
    name: 'channelId',
    description: 'The ID of the WhatsApp channel to disconnect',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'WhatsApp disconnected successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Channel not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Not a WhatsApp channel or invalid config',
  })
  async disconnect(
    @Param('channelId') channelId: string
  ): Promise<{ success: boolean; message: string }> {
    return this.channelsService.disconnectChannel(channelId);
  }

  @Delete('channel/:channelId')
  @ApiOperation({ summary: 'Delete a channel' })
  @ApiParam({
    name: 'channelId',
    description: 'The ID of the channel to delete',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Channel deleted successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Channel not found',
  })
  async remove(
    @Param('channelId') channelId: string
  ): Promise<{ success: boolean }> {
    return this.channelsService.deleteChannel(channelId);
  }
}
