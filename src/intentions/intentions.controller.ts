import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { IntentionsService } from './intentions.service';
import { ElevenLabsService } from './elevenlabs/elevenlabs.service';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ApiPaginationQueries } from '../common/decorators/api-pagination.decorator';
import { CreateIntentionDto } from './dto/create-intention.dto';
import { UpdateIntentionDto } from './dto/update-intention.dto';
import { IntentionDto } from './dto/intention.dto';
import { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import { PaginatedIntentionsResponseDto } from './dto/paginated-intentions-response.dto';
import { AuthGuard } from '../auth/auth.guard';

@ApiTags('Intentions')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class IntentionsController {
  constructor(
    private readonly intentionsService: IntentionsService,
    private readonly elevenLabsService: ElevenLabsService
  ) {}

  @Get('agent/:agentId/intentions')
  @ApiOperation({ summary: 'List agent intentions' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns a list of intentions',
    type: PaginatedIntentionsResponseDto,
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Agent not found' })
  @ApiParam({ name: 'agentId', description: 'Agent ID' })
  @ApiPaginationQueries()
  async findAll(
    @Param('agentId') agentId: string,
    @Query() paginationDto: PaginationDto
  ): Promise<PaginatedResult<IntentionDto>> {
    return this.intentionsService.findAll(agentId, paginationDto);
  }

  @Post('agent/:agentId/intentions')
  @ApiOperation({ summary: 'Create a new intention' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Returns the created intention',
    type: IntentionDto,
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Agent not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input' })
  @ApiParam({ name: 'agentId', description: 'Agent ID' })
  async create(
    @Param('agentId') agentId: string,
    @Body() createIntentionDto: CreateIntentionDto
  ): Promise<IntentionDto> {
    return this.intentionsService.create(agentId, createIntentionDto);
  }

  @Put('intention/:intentionId')
  @ApiOperation({ summary: 'Update an intention' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Intention updated successfully',
    schema: {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          example: true,
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Intention not found',
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input' })
  @ApiParam({ name: 'intentionId', description: 'Intention ID' })
  async update(
    @Param('intentionId') intentionId: string,
    @Body() updateIntentionDto: UpdateIntentionDto
  ): Promise<{ success: boolean }> {
    return this.intentionsService.update(intentionId, updateIntentionDto);
  }

  @Delete('intention/:intentionId')
  @ApiOperation({ summary: 'Remove an intention' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Intention removed successfully',
    schema: {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          example: true,
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Intention not found',
  })
  @ApiParam({ name: 'intentionId', description: 'Intention ID' })
  async remove(
    @Param('intentionId') intentionId: string
  ): Promise<{ success: boolean }> {
    return this.intentionsService.remove(intentionId);
  }

  // ElevenLabs Integration Endpoints
  @Post('agent/:agentId/intentions/elevenlabs/setup')
  @ApiOperation({ 
    summary: 'Setup ElevenLabs intentions',
    description: 'Creates all ElevenLabs AI voice synthesis intentions (Text-to-Speech, Voice Cloning, Speech-to-Speech) for an agent'
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'ElevenLabs intentions created successfully',
    schema: {
      type: 'object',
      properties: {
        textToSpeech: { $ref: '#/components/schemas/IntentionDto' },
        voiceCloning: { $ref: '#/components/schemas/IntentionDto' },
        speechToSpeech: { $ref: '#/components/schemas/IntentionDto' },
      },
    },
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Agent not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid agent ID or setup failed' })
  @ApiParam({ name: 'agentId', description: 'Agent ID to setup ElevenLabs intentions for' })
  async setupElevenLabsIntentions(
    @Param('agentId') agentId: string
  ): Promise<{
    textToSpeech: IntentionDto;
    voiceCloning: IntentionDto;
    speechToSpeech: IntentionDto;
  }> {
    return this.elevenLabsService.createElevenLabsIntentions(agentId);
  }

  @Post('agent/:agentId/intentions/elevenlabs/text-to-speech')
  @ApiOperation({ 
    summary: 'Create ElevenLabs Text-to-Speech intention',
    description: 'Creates a single Text-to-Speech intention using ElevenLabs AI voice synthesis'
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Text-to-Speech intention created successfully',
    type: IntentionDto,
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Agent not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input' })
  @ApiParam({ name: 'agentId', description: 'Agent ID' })
  async createTextToSpeechIntention(
    @Param('agentId') agentId: string
  ): Promise<IntentionDto> {
    const { elevenLabsTextToSpeechIntention } = await import('./elevenlabs/elevenlabs.intentions');
    return this.intentionsService.create(agentId, elevenLabsTextToSpeechIntention);
  }

  @Post('agent/:agentId/intentions/elevenlabs/voice-cloning')
  @ApiOperation({ 
    summary: 'Create ElevenLabs Voice Cloning intention',
    description: 'Creates a Voice Cloning intention using ElevenLabs instant voice cloning from audio samples'
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Voice Cloning intention created successfully',
    type: IntentionDto,
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Agent not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input' })
  @ApiParam({ name: 'agentId', description: 'Agent ID' })
  async createVoiceCloningIntention(
    @Param('agentId') agentId: string
  ): Promise<IntentionDto> {
    const { elevenLabsVoiceCloningIntention } = await import('./elevenlabs/elevenlabs.intentions');
    return this.intentionsService.create(agentId, elevenLabsVoiceCloningIntention);
  }

  @Post('agent/:agentId/intentions/elevenlabs/speech-to-speech')
  @ApiOperation({ 
    summary: 'Create ElevenLabs Speech-to-Speech intention',
    description: 'Creates a Speech-to-Speech intention to convert speech audio to different voice using ElevenLabs technology'
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Speech-to-Speech intention created successfully',
    type: IntentionDto,
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Agent not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input' })
  @ApiParam({ name: 'agentId', description: 'Agent ID' })
  async createSpeechToSpeechIntention(
    @Param('agentId') agentId: string
  ): Promise<IntentionDto> {
    const { elevenLabsSpeechToSpeechIntention } = await import('./elevenlabs/elevenlabs.intentions');
    return this.intentionsService.create(agentId, elevenLabsSpeechToSpeechIntention);
  }

  @Post('agent/:agentId/intentions/google-calendar/schedule-meeting')
  @ApiOperation({ 
    summary: 'Create Google Calendar scheduling intention',
    description: 'Creates a webhook intention to schedule meetings using Google Calendar API'
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Google Calendar intention created successfully',
    type: IntentionDto,
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Agent not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input' })
  @ApiParam({ name: 'agentId', description: 'Agent ID' })
  async createGoogleCalendarIntention(
    @Param('agentId') agentId: string
  ): Promise<IntentionDto> {
    return this.intentionsService.registerGoogleCalendarIntention(agentId);
  }
}