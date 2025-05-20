/**
 * Test script to verify the enhanced agent update endpoint
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
    name: 'Original Agent Name',
    behavior: 'A helpful assistant',
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
    console.log('Agent Data:', JSON.stringify(response.data.data, null, 2));
    
    return response.data.data;
  } catch (error) {
    console.error('❌ Agent creation failed:', error.response ? error.response.data : error.message);
    throw error;
  }
}

async function updateAgent(agentId, token) {
  console.log(`3. Updating agent with ID ${agentId}...`);
  
  const updateData = {
    name: 'Updated Agent Name',
    behavior: 'An even more helpful assistant',
    communicationType: 'FORMAL',
    type: 'SUPPORT',  // Must be one of: SUPPORT, SALE, PERSONAL
    jobDescription: 'Provides excellent customer service'
  };

  try {
    const response = await axios.put(
      `${BASE_URL}/agent/${agentId}`,
      updateData,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ Agent updated successfully');
    console.log('Updated Agent Data:', JSON.stringify(response.data, null, 2));
    
    return response.data;
  } catch (error) {
    console.error('❌ Updating agent failed:', error.response ? error.response.data : error.message);
    throw error;
  }
}

async function runTest() {
  try {
    // Step 1: Register a new user and get token
    const { user, token } = await register();
    
    // Step 2: Create a new agent
    const agentData = await createAgent(user.workspaceId, token);
    
    // Step 3: Update the agent and verify the enhanced response
    const updatedAgentData = await updateAgent(agentData.agent.id, token);
    
    // Extract the actual data (it might be nested in a 'data' field)
    const actualData = updatedAgentData.data || updatedAgentData;

    // Verify the response includes settings and webhooks
    if (actualData.agent && actualData.settings && actualData.webhooks) {
      console.log('\n✅ Verification successful! The update response includes:');
      console.log('- Agent core data');
      console.log('- Agent settings');
      console.log('- Agent webhooks');
    } else {
      console.log('\n❌ Verification failed: The response does not include all required data');
    }
    
    console.log('\n🎉 Test completed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  }
}

runTest();