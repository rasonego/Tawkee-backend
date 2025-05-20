/**
 * Script to test the email verification flow
 */
const axios = require('axios');

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

    // Log the entire response to debug
    console.log('Registration response:', JSON.stringify(response.data, null, 2));

    // Extract user data from response (the structure seems to be nested in a 'data' property)
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

async function requestVerificationEmail(email) {
  try {
    console.log('\n=== Requesting verification email ===');
    const response = await axios.post(`${API_URL}/auth/resend-verification`, {
      email
    });

    console.log('Verification email request response:', response.data);
    return response.data;
  } catch (error) {
    if (error.response) {
      console.error('Verification email request failed:', error.response.data);
    } else {
      console.error('Verification email error:', error.message);
    }
    throw error;
  }
}

// This function would be called in a real scenario when clicking the link in the email
// For testing purposes, we would need to extract the token from database or logs
async function verifyEmail(token) {
  try {
    console.log('\n=== Verifying email with token ===');
    console.log(`Token: ${token}`);
    
    // In a real scenario, the user would click a link like this:
    // GET /auth/verify-email?token=ABC123
    // For this test script, we'll simulate the redirect by making the request
    // but in reality, this would be handled by the user's browser
    
    const response = await axios.get(`${API_URL}/auth/verify-email?token=${token}`);
    console.log('Verification response:', response.data);
    return response.data;
  } catch (error) {
    if (error.response) {
      console.error('Email verification failed:', error.response.data);
    } else {
      console.error('Verification error:', error.message);
    }
    throw error;
  }
}

async function login() {
  try {
    console.log('\n=== Logging in user ===');
    const response = await axios.post(`${API_URL}/auth/login`, {
      email: TEST_EMAIL,
      password: 'TestPassword123!'
    });

    console.log('Login response:', JSON.stringify(response.data, null, 2));
    
    // Extract user data from response (the structure may be nested in a 'data' property)
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
    // Step 1: Register a new user (should send verification email automatically)
    const registerData = await register();
    
    // Step 2: Try to resend verification email
    await requestVerificationEmail(TEST_EMAIL);
    
    // Step 3: Login (should work even with unverified email but might remind the user)
    await login();
    
    console.log('\n=== Test completed ===');
    console.log('Note: To complete the verification flow, you would need to:');
    console.log('1. Extract the verification token from logs or database');
    console.log('2. Call the verification endpoint with the token');
    console.log('3. Login again to confirm the email is verified');
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

// Run the test
runTest();