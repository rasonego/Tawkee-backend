/**
 * Extended User type that includes OAuth fields from the Prisma schema
 */
export interface User {
  id: string;
  email: string;
  password?: string | null;
  name: string;
  workspaceId: string;
  createdAt: Date;
  updatedAt: Date;
  avatar?: string | null;
  emailVerified: boolean;
  facebookId?: string | null;
  firstName?: string | null;
  googleId?: string | null;
  lastName?: string | null;
  provider?: string | null;
  providerId?: string | null;
}
