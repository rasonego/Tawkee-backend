import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChannelQrCodeDto {
  @ApiProperty({
    description: 'Status of the WhatsApp connection',
    example: 'connecting',
    enum: ['connecting', 'connected', 'disconnected', 'error'],
  })
  status: string;

  @ApiPropertyOptional({
    description: 'Instance ID from Evolution API (legacy)',
    example: '36def398-91c8-48ee-b1ee-b459d10297a4',
  })
  instanceId?: string;

  @ApiPropertyOptional({
    description: 'Instance name used with Evolution API',
    example: 'tawkee-agent-abc123-1746295779313',
  })
  instanceName?: string;

  @ApiPropertyOptional({
    description: 'QR code data URL for scanning',
    example: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAV...',
  })
  qrCode?: string;

  @ApiPropertyOptional({
    description: 'Pairing code if available',
    example: '1234-5678',
  })
  pairingCode?: string;

  @ApiPropertyOptional({
    description: 'Error message if status is error',
    example: 'Failed to connect to WhatsApp',
  })
  error?: string;

  @ApiPropertyOptional({
    description: 'Timestamp when the QR code was generated',
    example: '2023-01-01T12:00:00.000Z',
  })
  updatedAt?: string;
}
