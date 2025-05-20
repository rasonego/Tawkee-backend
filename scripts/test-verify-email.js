/**
 * Test script to verify the email verification endpoint
 * This script:
 * 1. Registers a new user to get a verification token
 * 2. Verifies the email using that token
 * 3. Attempts verification with an invalid token to test error handling
 */
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const baseUrl = 'http://localhost:5000';

async function register() {
  try {
    const timestamp = Date.now();
    // Use a real domain to avoid Resend test email restrictions
    const email = `test${timestamp}@gmail.com`;
    const password = 'Password123!';
    
    console.log(`Registering user with email: ${email}`);
    
    const response = await axios.post(`${baseUrl}/auth/register`, {
      email,
      password,
      name: 'Test User',
      workspaceName: 'Test Workspace'
    });
    
    console.log('Registration successful!');
    
    if (!response.data || !response.data.user || !response.data.user.id) {
      console.log('Response data:', JSON.stringify(response.data, null, 2));
      throw new Error('Invalid response structure - missing user ID');
    }
    
    console.log('User ID:', response.data.user.id);
    
    return { email, userId: response.data.user.id };
  } catch (error) {
    console.error('Registration failed:', error.response?.data || error.message);
    throw error;
  }
}

async function getVerificationToken(email) {
  try {
    // Fetch the verification token directly from the database
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        verificationToken: true,
        verificationExpires: true
      }
    });
    
    if (!user) {
      throw new Error(`User not found with email: ${email}`);
    }
    
    if (!user.verificationToken) {
      throw new Error('Verification token not found');
    }
    
    console.log(`Found verification token for user ${user.id}`);
    return user.verificationToken;
  } catch (error) {
    console.error('Error getting verification token:', error.message);
    throw error;
  }
}

async function verifyEmail(token) {
  try {
    console.log(`Verifying email with token: ${token}`);
    const response = await axios.get(`${baseUrl}/auth/verify-email?token=${token}`);
    
    console.log('Verification response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Verification failed:', error.response?.data || error.message);
    throw error;
  }
}

async function testInvalidToken() {
  try {
    console.log('Testing verification with invalid token');
    const response = await axios.get(`${baseUrl}/auth/verify-email?token=invalid-token-${Date.now()}`);
    
    console.log('Invalid token response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Invalid token test failed:', error.response?.data || error.message);
    throw error;
  }
}

async function runTest() {
  try {
    // Register a new user
    const { email, userId } = await register();
    
    // Get the verification token
    const token = await getVerificationToken(email);
    
    // Verify the email with the valid token
    const verificationResult = await verifyEmail(token);
    
    // Test with an invalid token
    const invalidResult = await testInvalidToken();
    
    console.log('\nTest Summary:');
    console.log('- User registered with ID:', userId);
    console.log('- Valid token verification:', verificationResult.success ? 'Success' : 'Failed');
    console.log('- Invalid token verification:', invalidResult.success ? 'Success (unexpected)' : 'Failed (expected)');
  } catch (error) {
    console.error('Test failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

runTest();