/**
 * Test script to verify the enhanced agent deletion endpoint with proper error messages
 * when deletion fails due to foreign key constraints
 */
const axios = require('axios');

const API_BASE_URL = 'http://localhost:5000';

// Test user credentials
const TEST_EMAIL = `test_${Date.now()}@example.com`;
const TEST_PASSWORD = 'Password123!';
const TEST_NAME = 'Test User';

async function register() {
  try {
    const response = await axios.post(`${API_BASE_URL}/auth/register`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      name: TEST_NAME,
      workspaceName: 'Test Workspace',
    });
    console.log('✅ Registration successful');
    return response.data;
  } catch (error) {
    console.error('❌ Registration failed:', error.response?.data || error.message);
    throw error;
  }
}

async function login() {
  try {
    const response = await axios.post(`${API_BASE_URL}/auth/login`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    console.log('✅ Login successful');
    console.log('Login response data:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
    throw error;
  }
}

async function createAgent(workspaceId, token) {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/workspace/${workspaceId}/agents`,
      {
        name: "Test Agent for Deletion",
        behavior: "A helpful assistant",
        communicationType: "NORMAL",
        type: "SUPPORT",
        jobName: "Customer Support",
        jobSite: "example.com",
        jobDescription: "Helps customers with their inquiries"
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    console.log('✅ Agent created successfully');
    return response.data;
  } catch (error) {
    console.error('❌ Agent creation failed:', error.response?.data || error.message);
    throw error;
  }
}

async function createChat(agentId) {
  try {
    // Use our utility function to directly create a chat in the database
    const { createTestChat } = require('./util/create-test-chat');
    const chat = await createTestChat(agentId);
    console.log('✅ Test chat created successfully with ID:', chat.id);
    return chat;
  } catch (error) {
    console.error('❌ Chat creation failed:', error.message);
    throw error;
  }
}

async function deleteAgent(agentId, token) {
  try {
    const response = await axios.delete(
      `${API_BASE_URL}/agent/${agentId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    console.log('✅ Agent deleted successfully');
    return response.data;
  } catch (error) {
    if (error.response) {
      console.log(`ℹ️ Deletion failed with status ${error.response.status}: ${JSON.stringify(error.response.data)}`);
      // Extract the error message from the response - it could be in different formats
      let errorMessage = error.response.data.message || error.response.data.error || 
                        (typeof error.response.data === 'string' ? error.response.data : 'Unknown error');
      
      return { success: false, message: errorMessage };
    }
    console.error('❌ Agent deletion request failed:', error.message);
    throw error;
  }
}

async function runTest() {
  try {
    console.log('1. Registering a new user...');
    const registrationData = await register();
    
    console.log('2. Logging in with the new user...');
    const loginResponse = await login();
    // Handle the nested data structure
    const loginData = loginResponse.data || loginResponse;
    const token = loginData.token;
    const user = loginData.user;
    
    console.log('User:', user);
    console.log('Token:', token.substring(0, 20) + '...');
    
    const workspaceId = user.workspaceId;
    
    console.log(`3. Creating a new agent in workspace ${workspaceId}...`);
    const agentResponse = await createAgent(workspaceId, token);
    // Handle the nested data structure
    const agentData = agentResponse.data || agentResponse;
    console.log('Agent Data:', JSON.stringify(agentData, null, 2));
    
    console.log(`4. Creating a test chat for agent ${agentData.agent.id}...`);
    await createChat(agentData.agent.id);
    
    console.log(`5. Attempting to delete agent with ID ${agentData.agent.id}...`);
    const deletionResult = await deleteAgent(agentData.agent.id, token);
    
    // Verify deletion result and error message
    if (deletionResult.success) {
      console.log('❌ Test failed: Agent was deleted when it should have failed due to foreign key constraints');
    } else {
      console.log('✅ Expected deletion failure detected');
      console.log(`Error message: ${deletionResult.message}`);
      
      if (deletionResult.message.includes('chat') && deletionResult.message.includes('delete')) {
        console.log('✅ Error message correctly identifies the constraint issue with chats');
      } else {
        console.log('❌ Error message does not clearly explain the constraint issue');
      }
    }
    
    console.log('\n🎉 Test completed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  }
}

runTest();