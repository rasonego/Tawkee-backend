/**
 * Test script to verify user registration, login, and logout functionality
 */

const axios = require('axios');
const API_URL = 'http://localhost:5000';

// Test user credentials
const testUser = {
  email: `test-user-${Date.now()}@example.com`,
  password: 'Password123!',
  name: 'Test User',
  workspaceName: 'Test Workspace'
};

let token = null;
let userId = null;

async function register() {
  console.log('1. Testing user registration...');
  try {
    const response = await axios.post(`${API_URL}/auth/register`, testUser);
    console.log('Registration successful!');
    console.log('Full response data:', JSON.stringify(response.data, null, 2));
    
    // Check if the response has data property (nested structure)
    const responseData = response.data.data || response.data;
    
    if (responseData.token) {
      console.log('✅ Token received from registration');
      token = responseData.token;
      userId = responseData.user?.id;
      return true;
    } else {
      console.error('❌ No token returned from registration');
      return false;
    }
  } catch (error) {
    console.error('❌ Registration failed:', error.response?.data || error.message);
    if (error.response) {
      console.error('Error response:', error.response.status, error.response.statusText);
      console.error('Error data:', error.response.data);
    }
    return false;
  }
}

async function login() {
  console.log('\n2. Testing user login...');
  try {
    const response = await axios.post(`${API_URL}/auth/login`, {
      email: testUser.email,
      password: testUser.password
    });
    console.log('Login successful!');
    console.log('Full response data:', JSON.stringify(response.data, null, 2));
    
    // Check if the response has data property (nested structure)
    const responseData = response.data.data || response.data;
    
    if (responseData.token) {
      console.log('✅ Token received from login');
      token = responseData.token;
      userId = responseData.user?.id;
      return true;
    } else {
      console.error('❌ No token returned from login');
      return false;
    }
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
    if (error.response) {
      console.error('Error response:', error.response.status, error.response.statusText);
      console.error('Error data:', error.response.data);
    }
    return false;
  }
}

async function getProfile() {
  console.log('\n3. Testing profile access with token...');
  try {
    const response = await axios.get(`${API_URL}/auth/profile`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Profile access successful!');
    console.log('Profile:', response.data);
    return true;
  } catch (error) {
    console.error('❌ Profile access failed:', error.response?.data || error.message);
    return false;
  }
}

async function logout() {
  console.log('\n4. Testing user logout...');
  try {
    const response = await axios.post(`${API_URL}/auth/logout`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Logout successful!', response.data);
    return true;
  } catch (error) {
    console.error('❌ Logout failed:', error.response?.data || error.message);
    return false;
  }
}

async function tryAccessAfterLogout() {
  console.log('\n5. Testing profile access after logout (should fail)...');
  try {
    const response = await axios.get(`${API_URL}/auth/profile`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.error('❌ Profile access still working after logout!');
    console.log('Profile:', response.data);
    return false;
  } catch (error) {
    console.log('✅ Profile access properly denied after logout:', error.response?.data);
    return true;
  }
}

async function runTest() {
  console.log('=== Starting Authentication Flow Test ===');
  
  // Test registration
  const registerSuccess = await register();
  if (!registerSuccess) {
    console.log('Skipping remaining tests due to registration failure');
    return;
  }
  
  // Test profile access
  const profileSuccess = await getProfile();
  
  // Test logout
  const logoutSuccess = await logout();
  if (!logoutSuccess) {
    console.log('Skipping access check after logout due to logout failure');
    return;
  }
  
  // Test access after logout
  await tryAccessAfterLogout();
  
  console.log('\n=== Authentication Flow Test Complete ===');
}

runTest()
  .catch(error => {
    console.error('Unhandled error during test:', error);
  });