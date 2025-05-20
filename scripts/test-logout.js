const axios = require('axios');

// Base URL for API
const API_URL = 'http://localhost:5000';

// Store JWT token
let token = '';

// Test user credentials with unique email (using timestamp)
const testUser = {
  email: `test_${Date.now()}@example.com`,
  password: 'password123',
  name: 'Test User',
  workspaceName: 'Test Workspace'
};

// Register a new user
async function register() {
  try {
    console.log('1. Registering a new user...');
    const response = await axios.post(`${API_URL}/auth/register`, testUser);
    console.log('Full response:', response.data);
    
    // Check if we have a token in the response
    if (response.data) {
      if (response.data.token) {
        token = response.data.token;
        console.log('✅ Registration successful');
        console.log('User:', response.data.user);
        console.log('Token:', token.substring(0, 25) + '...' + token.substring(token.length - 5));
        return response.data;
      } else if (response.data.data && response.data.data.token) {
        // Handle nested data structure
        token = response.data.data.token;
        console.log('✅ Registration successful');
        console.log('User:', response.data.data.user);
        console.log('Token:', token.substring(0, 25) + '...' + token.substring(token.length - 5));
        return response.data.data;
      } else {
        console.log('⚠️ Registration successful but missing token in response');
        if ((response.data.user && response.data.user.id) || 
            (response.data.data && response.data.data.user && response.data.data.user.id)) {
          // If we don't have a token but have a user, try to login
          return login();
        }
      }
    }
  } catch (error) {
    if (error.response && error.response.status === 409) {
      console.log('User already exists, proceeding to login...');
      return login();
    }
    console.error('❌ Registration failed:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// Login with existing user
async function login() {
  try {
    console.log('2. Logging in...');
    const response = await axios.post(`${API_URL}/auth/login`, {
      email: testUser.email,
      password: testUser.password
    });
    token = response.data.token;
    console.log('✅ Login successful');
    console.log('User:', response.data.user);
    console.log('Token:', token.substring(0, 25) + '...' + token.substring(token.length - 5));
    return response.data;
  } catch (error) {
    console.error('❌ Login failed:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// Get user profile with token
async function getProfile() {
  try {
    console.log('3. Getting user profile...');
    const response = await axios.get(`${API_URL}/auth/profile`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    console.log('✅ Profile retrieved successfully');
    console.log('Profile:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Profile retrieval failed:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// Logout user with token
async function logout() {
  try {
    console.log('4. Logging out...');
    const response = await axios.post(`${API_URL}/auth/logout`, {}, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    console.log('✅ Logout successful');
    console.log('Response:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Logout failed:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// Try to access profile after logout (should fail)
async function tryAccessAfterLogout() {
  try {
    console.log('5. Trying to access profile after logout...');
    const response = await axios.get(`${API_URL}/auth/profile`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    console.log('❌ Access still works! Token is not properly invalidated.');
    console.log('Profile:', response.data);
    return response.data;
  } catch (error) {
    if (error.response && error.response.status === 401) {
      console.log('✅ Access denied as expected. Token invalidation works!');
      console.log('Error:', error.response.data);
      return null;
    }
    console.error('❓ Unexpected error:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// Run all tests in sequence
async function runTest() {
  try {
    // Try to register (or login if user exists)
    await register();

    // Verify we can get the profile
    await getProfile();

    // Logout
    await logout();

    // Try to access profile after logout (should fail)
    await tryAccessAfterLogout();

    console.log('\n🎉 Test completed successfully!');
  } catch (error) {
    console.error('\n❌ Test failed!');
  }
}

// Run the test
runTest();