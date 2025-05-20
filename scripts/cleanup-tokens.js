const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Script to manually clean up expired blacklisted tokens from the database
 * This can be run periodically as a maintenance task
 */
async function cleanupExpiredTokens() {
  console.log('Starting cleanup of expired blacklisted tokens...');
  
  const now = new Date();
  
  try {
    // Delete all blacklisted tokens that have expired
    const result = await prisma.$executeRaw`
      DELETE FROM "BlacklistedToken" WHERE "expiresAt" < ${now}
    `;
    
    console.log(`Successfully cleaned up ${result} expired tokens from blacklist`);
  } catch (error) {
    console.error(`Error cleaning up expired tokens: ${error.message}`);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the cleanup
cleanupExpiredTokens();