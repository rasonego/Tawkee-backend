import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ChannelQrCodeDto {
  @ApiProperty({
    description: 'Status of the WhatsApp connection',
    example: 'WORKING',
    enum: ['WORKING', 'FAILED', 'STARTING', 'SCAN_QR_CODE', 'STOPPED'],
  })
  @IsString()
  status: string;

  @ApiProperty({
    description: 'Session name in Waha API',
    example: 'default',
  })
  @IsString()
  instanceName: string;

  @ApiProperty({
    description: 'QR Code xxx',
    example: '...',
  })
  @IsString()
  qrCode: string;
}
