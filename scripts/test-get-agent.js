/**
 * Test script to verify the enhanced agent retrieval endpoints
 * This script tests both the findAll and findOne agent methods
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:5000';

async function register() {
  console.log('1. Registering a new user...');
  
  const timestamp = Date.now();
  const userData = {
    email: `test_${timestamp}@example.com`,
    password: 'password123',
    name: 'Test User',
    workspaceName: 'Test Workspace'
  };

  try {
    // Register the user
    const registrationResponse = await axios.post(
      `${BASE_URL}/auth/register`,
      userData
    );
    
    console.log('Full registration response:', JSON.stringify(registrationResponse.data, null, 2));
    console.log('✅ Registration successful');
    
    // Login with the new user
    console.log('Logging in with the new user...');
    const loginResponse = await axios.post(
      `${BASE_URL}/auth/login`,
      {
        email: userData.email,
        password: userData.password
      }
    );
    
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
    name: 'Test Agent',
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
    
    return response.data.data;
  } catch (error) {
    console.error('❌ Agent creation failed:', error.response ? error.response.data : error.message);
    throw error;
  }
}

async function getAgentById(agentId, token) {
  console.log(`3. Getting agent with ID ${agentId}...`);
  
  try {
    const response = await axios.get(
      `${BASE_URL}/agent/${agentId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    console.log('✅ Agent retrieved successfully');
    console.log('Enhanced Agent Data:', JSON.stringify(response.data, null, 2));
    
    return response.data;
  } catch (error) {
    console.error('❌ Getting agent failed:', error.response ? error.response.data : error.message);
    throw error;
  }
}

async function getAllAgents(workspaceId, token) {
  console.log(`4. Getting all agents in workspace ${workspaceId}...`);
  
  try {
    const response = await axios.get(
      `${BASE_URL}/workspace/${workspaceId}/agents`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    console.log('✅ Agents list retrieved successfully');
    console.log('Number of agents:', response.data.data.length);
    console.log('First agent:', JSON.stringify(response.data.data[0], null, 2));
    
    return response.data;
  } catch (error) {
    console.error('❌ Getting agents list failed:', error.response ? error.response.data : error.message);
    throw error;
  }
}

async function runTest() {
  try {
    // Step 1: Register a new user and get token
    const { user, token } = await register();
    
    // Step 2: Create a new agent using the enhanced endpoint
    const agentData = await createAgent(user.workspaceId, token);
    
    // Step 3: Get the agent by ID using the enhanced endpoint
    await getAgentById(agentData.agent.id, token);
    
    // Step 4: Get all agents using the enhanced endpoint
    await getAllAgents(user.workspaceId, token);
    
    console.log('\n🎉 Test completed successfully!');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  }
}

runTest();