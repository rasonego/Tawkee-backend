/**
 * Script to create a test user for password reset testing
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const prisma = new PrismaClient();

// Use a valid email for testing with Resend
const testEmail = 'test@tawkee-api-victorsgb.zeepcode.app';
const password = 'TestP@ssw0rd';

async function hashPassword(password) {
  const salt = await bcrypt.genSalt();
  return bcrypt.hash(password, salt);
}

async function createTestUser() {
  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: testEmail }
    });

    if (existingUser) {
      console.log(`Test user with email ${testEmail} already exists`);
      return existingUser;
    }

    // Create a workspace first
    const workspace = await prisma.workspace.create({
      data: {
        name: 'Test Workspace',
        credits: 100,
        subscriptionStatus: 'TRIAL'
      }
    });

    console.log(`Created test workspace with ID: ${workspace.id}`);

    // Hash the password
    const hashedPassword = await hashPassword(password);

    // Create the user
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        password: hashedPassword,
        name: 'Test User',
        workspaceId: workspace.id,
        emailVerified: true // Set to true for testing purposes
      }
    });

    console.log(`Created test user with ID: ${user.id} and email: ${user.email}`);
    console.log(`Password: ${password} (unhashed for testing)`);
    
    return user;
  } catch (error) {
    console.error('Error creating test user:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

createTestUser()
  .then(() => console.log('Done'))
  .catch(err => console.error('Script failed:', err));