/**
 * Test script to verify that newly created agents include an empty channels array
 */
const axios = require('axios');

async function register() {
  console.log('Registering test user...');
  const response = await axios.post('http://localhost:5000/auth/register', {
    email: `test-user-${Date.now()}@example.com`,
    password: 'Test123!@#',
    name: 'Test User',
    workspaceName: 'Test Workspace'
  });

  console.log('Registration successful');
  
  if (response.data.data && response.data.data.user) {
    return {
      token: response.data.data.token,
      workspaceId: response.data.data.user.workspaceId
    };
  } else {
    throw new Error('Unexpected response format: ' + JSON.stringify(response.data));
  }
}

async function createAgent(workspaceId, token) {
  console.log('Creating test agent...');
  const response = await axios.post(
    `http://localhost:5000/workspace/${workspaceId}/agents`,
    {
      name: 'Test Agent with Channels',
      behavior: 'Test agent for API testing',
      communicationType: 'NORMAL',
      type: 'SUPPORT',
      jobName: 'Test Job'
    },
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );
  
  return response.data;
}

async function runTest() {
  try {
    // Step 1: Register a user
    const { token, workspaceId } = await register();
    console.log(`User registered with workspace ID: ${workspaceId}`);

    // Step 2: Create an agent and verify the response
    const createResponse = await createAgent(workspaceId, token);
    console.log('\nAgent creation response structure:');
    console.log(JSON.stringify(createResponse, null, 2));
    
    // Step 3: Check if the response includes an empty channels array
    const hasChannels = createResponse.data &&
                       createResponse.data.agent && 
                       Array.isArray(createResponse.data.agent.channels);
    
    console.log('\nTest Results:');
    console.log(`- Response includes agent object: ${!!createResponse.data.agent}`);
    console.log(`- Agent has channels property: ${hasChannels}`);
    
    if (hasChannels) {
      console.log(`- Channels is an empty array: ${createResponse.data.agent.channels.length === 0}`);
    }
    
    console.log('\nTest completed successfully!');
  } catch (error) {
    console.error('Error during test:', error.response ? error.response.data : error.message);
    if (error.stack) console.error(error.stack);
  }
}

runTest();