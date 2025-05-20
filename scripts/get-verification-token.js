/**
 * Helper script to get a verification token for a user by email
 * This allows us to test the verification endpoint without actually receiving emails
 */
const { PrismaClient } = require('@prisma/client');

// Create a new Prisma client
const prisma = new PrismaClient();

async function getVerificationToken(email) {
  try {
    console.log(`Looking for verification token for email: ${email}`);
    
    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        verificationToken: true,
        verificationExpires: true,
      },
    });

    if (!user) {
      console.error('User not found');
      return null;
    }

    console.log('User found:', {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      tokenExpires: user.verificationExpires,
    });

    if (!user.verificationToken) {
      console.log('No verification token found for this user');
      
      // Generate a new verification token manually
      console.log('Generating a new verification token...');
      
      // Generate a random token
      const crypto = require('crypto');
      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date();
      expires.setHours(expires.getHours() + 24); // 24 hours expiration
      
      // Update user with the new token using Prisma's type-safe API
      await prisma.user.update({
        where: { id: user.id },
        data: {
          verificationToken: token,
          verificationExpires: expires,
        },
      });
      
      console.log('Token generated and saved to the database');
      return token;
    }

    return user.verificationToken;
  } catch (error) {
    console.error('Error getting verification token:', error);
    return null;
  } finally {
    // Disconnect from the database
    await prisma.$disconnect();
  }
}

// Run the function with the email provided as command-line argument
async function main() {
  const email = process.argv[2];
  
  if (!email) {
    console.error('Please provide an email as a command-line argument');
    console.error('Example: node get-verification-token.js test@example.com');
    process.exit(1);
  }
  
  const token = await getVerificationToken(email);
  
  if (token) {
    console.log('\nVerification token:', token);
    console.log('\nVerification URL:');
    console.log(`http://localhost:5000/auth/verify-email?token=${token}`);
  } else {
    console.log('Failed to get or generate a verification token');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });