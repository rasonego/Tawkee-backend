/**
 * Script to create a test OAuth user (simulating a user who only signed up with OAuth)
 * This script creates a user with no password field to test our login error handling
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Creating a test OAuth user...');
  
  // Create a user with OAuth fields but no password
  const user = await prisma.user.create({
    data: {
      email: 'oauth-test@example.com',
      name: 'OAuth Test User',
      provider: 'google',
      providerId: 'test-google-id',
      googleId: 'test-google-id',
      firstName: 'OAuth',
      lastName: 'User',
      emailVerified: true,
      avatar: 'https://example.com/avatar.jpg',
      workspace: {
        create: {
          name: 'OAuth Test Workspace',
          credits: 50
        }
      }
    },
    include: {
      workspace: true
    }
  });
  
  console.log('Created user:', {
    id: user.id,
    email: user.email,
    name: user.name,
    provider: user.provider,
    workspaceId: user.workspaceId
  });
  
  console.log('User created successfully!');
}

main()
  .catch(e => {
    console.error('Error creating test OAuth user:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });