/**
 * Test script to verify the password reset flow
 * This script:
 * 1. Requests a password reset email for a user
 * 2. Retrieves the reset token from the database
 * 3. Verifies the reset token
 * 4. Resets the password using the token
 * 5. Tests logging in with the new password
 */
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const baseUrl = process.env.API_URL || 'http://localhost:5000';

// User email to test with - using our newly created test user
const testUserEmail = process.argv[2] || 'test@tawkee-api-victorsgb.zeepcode.app';
const newPassword = 'NewSecureP@ss123';

async function requestPasswordReset(email) {
  try {
    console.log(`\nRequesting password reset for ${email}`);
    const response = await axios.post(`${baseUrl}/auth/forgot-password`, {
      email
    });
    console.log('Response status:', response.status);
    console.log('Response data:', response.data);
    return response.data;
  } catch (error) {
    console.error('Password reset request failed:', error.response?.data || error.message);
    throw error;
  }
}

async function getResetToken(email) {
  try {
    console.log(`\nRetrieving reset token for ${email} from database`);
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        resetToken: true,
        resetExpires: true
      }
    });

    if (!user || !user.resetToken) {
      throw new Error(`No reset token found for ${email}`);
    }

    console.log(`Token for ${email}: ${user.resetToken}`);
    console.log(`Token expires at: ${user.resetExpires}`);
    
    return user.resetToken;
  } catch (error) {
    console.error('Error retrieving reset token:', error.message);
    throw error;
  }
}

async function verifyResetToken(token) {
  try {
    console.log(`\nVerifying reset token: ${token}`);
    const response = await axios.post(`${baseUrl}/auth/verify-reset-token`, {
      token
    });
    console.log('Response status:', response.status);
    console.log('Response data:', response.data);
    
    // The actual structure seems to be { data: { valid: true } }
    if (response.data.data && typeof response.data.data.valid === 'boolean') {
      return response.data.data.valid;
    }
    
    // Fallback in case structure changes
    return response.data.valid;
  } catch (error) {
    console.error('Token verification failed:', error.response?.data || error.message);
    throw error;
  }
}

async function resetPassword(token, newPassword) {
  try {
    console.log(`\nResetting password using token: ${token}`);
    const response = await axios.post(`${baseUrl}/auth/reset-password`, {
      token,
      newPassword
    });
    console.log('Response status:', response.status);
    console.log('Response data:', response.data);
    return response.data;
  } catch (error) {
    console.error('Password reset failed:', error.response?.data || error.message);
    throw error;
  }
}

async function login(email, password) {
  try {
    console.log(`\nTesting login with new password for ${email}`);
    const response = await axios.post(`${baseUrl}/auth/login`, {
      email,
      password
    });
    console.log('Response status:', response.status);
    console.log('Login successful! User authenticated.');
    return true;
  } catch (error) {
    console.error('Login failed:', error.response?.data || error.message);
    return false;
  }
}

async function runTest() {
  try {
    // Step 1: Request password reset
    await requestPasswordReset(testUserEmail);
    
    // Step 2: Get the reset token from database
    const resetToken = await getResetToken(testUserEmail);
    
    // Step 3: Verify the reset token
    const isValid = await verifyResetToken(resetToken);
    if (!isValid) {
      throw new Error('Token verification failed');
    }
    
    // Step 4: Reset the password
    await resetPassword(resetToken, newPassword);
    
    // Step 5: Test login with new password
    const loginSuccess = await login(testUserEmail, newPassword);
    
    if (loginSuccess) {
      console.log('\nPassword reset flow completed successfully!');
    } else {
      console.log('\nPassword reset flow failed: Unable to login with new password');
    }
  } catch (error) {
    console.error('\nTest failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

runTest();