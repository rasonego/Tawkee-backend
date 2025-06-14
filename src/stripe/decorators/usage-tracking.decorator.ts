import { SetMetadata } from '@nestjs/common';

export const USAGE_TRACKING_KEY = 'usageTracking';
export const TrackUsage = (requestType: string) => 
  SetMetadata(USAGE_TRACKING_KEY, requestType);