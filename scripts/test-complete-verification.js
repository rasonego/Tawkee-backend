/**
 * Script to test the complete email verification flow
 * This script:
 * 1. Registers a new user
 * 2. Gets or generates a verification token
 * 3. Verifies the email using that token
 * 4. Logs in to confirm the email is verified
 */
const axios = require('axios');
const { execSync } = require('child_process');

// Configuration
const API_URL = 'http://localhost:5000'; // Local dev URL
const TEST_EMAIL = `test-${Date.now()}@example.com`; // Use a unique email with timestamp

async function register() {
  try {
    // Register a new user
    console.log('\n=== Registering new user ===');
    console.log(`Registering email: ${TEST_EMAIL}`);
    
    const response = await axios.post(`${API_URL}/auth/register`, {
      email: TEST_EMAIL,
      password: 'TestPassword123!',
      name: 'Test User',
      workspaceName: 'Test Workspace'
    });

    // Extract user data from response
    const userData = response.data.data || response.data;
    
    if (userData && userData.user) {
      console.log(`User registered with ID: ${userData.user.id}`);
      console.log(`Email verified status: ${userData.user.emailVerified}`);
      return userData;
    } else {
      console.log('User created but response format is unexpected:', response.data);
      return response.data;
    }
  } catch (error) {
    if (error.response) {
      console.error('Registration failed:', error.response.data);
    } else {
      console.error('Registration error:', error.message);
    }
    throw error;
  }
}

function getVerificationToken(email) {
  try {
    console.log('\n=== Getting verification token ===');
    // Run the get-verification-token.js script and capture its output
    const output = execSync(`node scripts/get-verification-token.js ${email}`, { encoding: 'utf8' });
    console.log(output);
    
    // Extract the token from the output
    const tokenMatch = output.match(/Verification token: ([a-f0-9]+)/);
    if (tokenMatch && tokenMatch[1]) {
      return tokenMatch[1];
    } else {
      console.error('Could not extract token from script output');
      return null;
    }
  } catch (error) {
    console.error('Error getting verification token:', error.message);
    return null;
  }
}

async function verifyEmail(token) {
  try {
    console.log('\n=== Verifying email with token ===');
    console.log(`Token: ${token}`);
    
    // Make the request to verify the email
    const response = await axios.get(`${API_URL}/auth/verify-email?token=${token}`);
    
    // Since this is a redirect endpoint, success is determined by the response status
    console.log(`Verification status: ${response.status}`);
    console.log('Verification successful!');
    return true;
  } catch (error) {
    if (error.response) {
      console.error('Email verification failed:', error.response.data);
    } else {
      console.error('Verification error:', error.message);
    }
    return false;
  }
}

async function login() {
  try {
    console.log('\n=== Logging in user ===');
    const response = await axios.post(`${API_URL}/auth/login`, {
      email: TEST_EMAIL,
      password: 'TestPassword123!'
    });
    
    // Extract user data from response
    const userData = response.data.data || response.data;
    
    if (userData && userData.user) {
      console.log(`Login successful for user: ${userData.user.email}`);
      console.log(`Email verified status: ${userData.user.emailVerified}`);
      return userData;
    } else {
      console.log('Login successful but response format is unexpected:', response.data);
      return response.data;
    }
  } catch (error) {
    if (error.response) {
      console.error('Login failed:', error.response.data);
    } else {
      console.error('Login error:', error.message);
    }
    throw error;
  }
}

async function runTest() {
  try {
    // Step 1: Register a new user
    await register();
    
    // Step 2: Get verification token from database
    const token = getVerificationToken(TEST_EMAIL);
    if (!token) {
      throw new Error('Failed to get verification token');
    }
    
    // Step 3: Verify email using the token
    const verified = await verifyEmail(token);
    if (!verified) {
      throw new Error('Email verification failed');
    }
    
    // Step 4: Login to confirm email is verified
    await login();
    
    console.log('\n=== Test completed successfully ===');
  } catch (error) {
    console.error('\n=== Test failed ===');
    console.error(error.message);
  }
}

// Run the test
runTest();