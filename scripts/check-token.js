/**
 * Script to check if a verified user still has a verification token
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkVerificationToken(userId) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        verificationToken: true,
        verificationExpires: true,
        emailVerified: true
      }
    });
    
    if (!user) {
      console.log(`User with ID ${userId} not found`);
      return;
    }
    
    console.log('User details:');
    console.log('- ID:', user.id);
    console.log('- Email:', user.email);
    console.log('- Email verified:', user.emailVerified);
    console.log('- Verification token:', user.verificationToken || 'null');
    console.log('- Token expires at:', user.verificationExpires ? user.verificationExpires.toISOString() : 'null');
    
    // Calculate time left if token is still present
    if (user.verificationExpires) {
      const now = new Date();
      const timeLeftMs = user.verificationExpires.getTime() - now.getTime();
      const timeLeftSec = Math.round(timeLeftMs / 1000);
      
      console.log('- Time left until token removal:', timeLeftSec > 0 ? `${timeLeftSec} seconds` : 'Expired');
    }
  } catch (error) {
    console.error('Error checking verification token:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// The user ID to check
const userId = process.argv[2] || 'a01bdfc1-41ef-4f59-a655-32a0553b47fb';

checkVerificationToken(userId);