/**
 * Simple test script for the verify-email endpoint
 * This script:
 * 1. Generates a verification token for an existing user directly in the database
 * 2. Tests the verify-email endpoint with this token
 */
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const { randomBytes } = require('crypto');

const prisma = new PrismaClient();
const baseUrl = 'http://localhost:5000';

// Generate a random token
function generateToken() {
  return randomBytes(32).toString('hex');
}

async function setupTestUser() {
  try {
    // Find an existing user or create a new one
    let user = await prisma.user.findFirst({
      where: {
        emailVerified: false,
      }
    });

    if (!user) {
      console.log('No unverified users found, creating a test user...');
      // Create a test user if none exists
      user = await prisma.user.create({
        data: {
          email: `test${Date.now()}@gmail.com`,
          password: 'hashedpassword', // This would normally be hashed
          provider: 'password',
          emailVerified: false,
          name: 'Test User',
        }
      });
      console.log('Created test user:', user.id);
    }

    // Generate a verification token that's valid for 24 hours
    const token = generateToken();
    const expires = new Date();
    expires.setHours(expires.getHours() + 24);

    // Update the user with the verification token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        verificationToken: token,
        verificationExpires: expires,
      }
    });

    console.log(`Generated verification token for user ${user.id}`);
    console.log(`Token: ${token}`);
    return { userId: user.id, token };
  } catch (error) {
    console.error('Error setting up test user:', error);
    throw error;
  }
}

async function testVerifyEmail(token) {
  try {
    console.log(`\nTesting verify-email endpoint with token: ${token}`);
    const response = await axios.get(`${baseUrl}/auth/verify-email?token=${token}`);
    console.log('Response status:', response.status);
    console.log('Response data:', response.data);
    return response.data;
  } catch (error) {
    console.error('Verification failed:', error.response?.data || error.message);
    throw error;
  }
}

async function testInvalidToken() {
  try {
    const invalidToken = generateToken();
    console.log(`\nTesting verify-email endpoint with invalid token: ${invalidToken}`);
    const response = await axios.get(`${baseUrl}/auth/verify-email?token=${invalidToken}`);
    console.log('Response status:', response.status);
    console.log('Response data:', response.data);
    return response.data;
  } catch (error) {
    console.error('Verification with invalid token failed:', error.response?.data || error.message);
    throw error;
  }
}

async function runTest() {
  try {
    // Set up test user with verification token
    const { userId, token } = await setupTestUser();
    
    // Test verification with valid token
    const verificationResult = await testVerifyEmail(token);
    
    // Test verification with invalid token
    const invalidResult = await testInvalidToken();
    
    console.log('\nTest Summary:');
    console.log('- User ID:', userId);
    console.log('- Valid token verification:', verificationResult.success ? 'Success' : 'Failed');
    console.log('- Invalid token verification:', invalidResult.success ? 'Success (unexpected)' : 'Failed (expected)');
  } catch (error) {
    console.error('Test failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

runTest();