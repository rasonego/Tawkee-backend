/**
 * Test script to verify the improved error message when OAuth users try to log in with password
 */

const axios = require('axios');
const API_URL = 'http://localhost:5000';

async function testOAuthLoginError() {
  console.log('Testing OAuth login error handling...');
  
  try {
    // Attempt to log in using an OAuth user's email with a password
    const response = await axios.post(`${API_URL}/auth/login`, {
      email: 'oauth-test@example.com',  // This user was created in create-test-oauth-user.js
      password: 'some-password'
    });
    
    console.log('❌ Login succeeded when it should have failed:', response.data);
    return false;
  } catch (error) {
    if (error.response?.data?.error === 'This account uses social login. Please sign in with Google or Facebook.') {
      console.log('✅ Received correct OAuth error message:', error.response.data);
      return true;
    } else {
      console.error('❌ Received incorrect error message:', error.response?.data || error.message);
      return false;
    }
  }
}

async function testNormalLoginError() {
  console.log('\nTesting normal password login error handling...');
  
  try {
    // Attempt to log in with incorrect credentials
    const response = await axios.post(`${API_URL}/auth/login`, {
      email: 'regular-user@example.com',
      password: 'wrong-password'
    });
    
    console.log('❌ Login succeeded when it should have failed:', response.data);
    return false;
  } catch (error) {
    if (error.response?.data?.error === 'Invalid credentials') {
      console.log('✅ Received correct error message for invalid credentials:', error.response.data);
      return true;
    } else {
      console.error('❌ Received incorrect error message:', error.response?.data || error.message);
      return false;
    }
  }
}

async function runTests() {
  console.log('=== Testing OAuth Login Error Handling ===\n');
  
  const oauthResult = await testOAuthLoginError();
  const regularResult = await testNormalLoginError();
  
  console.log('\n=== Test Results ===');
  console.log(`OAuth Login Error Test: ${oauthResult ? 'PASSED' : 'FAILED'}`);
  console.log(`Regular Login Error Test: ${regularResult ? 'PASSED' : 'FAILED'}`);
}

runTests()
  .catch(error => {
    console.error('Unhandled error during tests:', error);
  });