const axios = require('axios');

const BASE_URL = 'http://localhost:5000';

async function register() {
  console.log('1. Registering a new user...');
  const timestamp = new Date().getTime();
  const userData = {
    email: `test_${timestamp}@example.com`,
    password: 'password123',
    name: 'Test User',
    workspaceName: 'Test Workspace'
  };

  try {
    const response = await axios.post(`${BASE_URL}/auth/register`, userData);
    console.log('Full registration response:', JSON.stringify(response.data, null, 2));
    console.log('✅ Registration successful');
    
    // Now let's login to get the token
    console.log('Logging in with the new user...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: userData.email,
      password: userData.password
    });
    
    console.log('Full login response:', JSON.stringify(loginResponse.data, null, 2));
    
    const user = loginResponse.data.data.user;
    const token = loginResponse.data.data.token;
    
    console.log('User:', user);
    console.log('Token:', token.substring(0, 25) + '...');
    
    return {
      user,
      token
    };
  } catch (error) {
    console.error('❌ Registration/Login failed:', error.response ? error.response.data : error.message);
    throw error;
  }
}

async function createAgent(workspaceId, token) {
  console.log(`2. Creating a new agent in workspace ${workspaceId}...`);
  
  const agentData = {
    name: 'Enhanced Agent',
    behavior: 'A helpful and informative assistant',
    communicationType: 'NORMAL',
    type: 'SUPPORT',
    jobName: 'Customer Support',
    jobSite: 'example.com',
    jobDescription: 'Helps customers with their inquiries'
  };

  try {
    const response = await axios.post(
      `${BASE_URL}/workspace/${workspaceId}/agents`,
      agentData,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ Agent created successfully');
    console.log('Agent Data:', JSON.stringify(response.data, null, 2));
    
    return response.data;
  } catch (error) {
    console.error('❌ Agent creation failed:', error.response ? error.response.data : error.message);
    throw error;
  }
}

async function runTest() {
  try {
    // Step 1: Register a new user and get token
    const { user, token } = await register();
    
    // Step 2: Create a new agent using the enhanced endpoint
    const agent = await createAgent(user.workspaceId, token);
    
    console.log('\n🎉 Test completed successfully!');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  }
}

runTest();