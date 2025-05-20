/**
 * Test script to verify that agent endpoints include channels data
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

  // Check the response structure
  console.log('Registration response structure:', JSON.stringify(response.data, null, 2));
  
  // Handle different response formats
  if (response.data.user) {
    return {
      token: response.data.token,
      userId: response.data.user.id,
      workspaceId: response.data.user.workspaceId
    };
  } else if (response.data.data && response.data.data.user) {
    return {
      token: response.data.data.token,
      userId: response.data.data.user.id,
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
      name: 'Test Agent',
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

  console.log('Agent creation response structure:', JSON.stringify(response.data, null, 2));
  
  // Handle different response structures
  if (response.data.agent) {
    return response.data;
  } else if (response.data.data && response.data.data.agent) {
    return response.data.data;
  } else {
    throw new Error('Unexpected agent response format: ' + JSON.stringify(response.data));
  }
}

async function getAllAgents(workspaceId, token) {
  console.log('Fetching all agents...');
  const response = await axios.get(
    `http://localhost:5000/workspace/${workspaceId}/agents`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  console.log('Get all agents response structure:', JSON.stringify(response.data, null, 2).substring(0, 300) + '...');
  
  // Handle different response structures
  if (response.data.data) {
    return response.data;
  } else {
    throw new Error('Unexpected get all agents response format: ' + JSON.stringify(response.data));
  }
}

async function getAgentById(agentId, token) {
  console.log(`Fetching agent with ID ${agentId}...`);
  const response = await axios.get(
    `http://localhost:5000/agent/${agentId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  console.log('Get agent by ID response structure:', JSON.stringify(response.data, null, 2).substring(0, 300) + '...');
  
  // Handle different response structures
  if (response.data.agent) {
    return response.data;
  } else if (response.data.data && response.data.data.agent) {
    return response.data.data;
  } else {
    throw new Error('Unexpected get agent response format: ' + JSON.stringify(response.data));
  }
}

async function runTest() {
  try {
    // Step 1: Register a user
    const { token, workspaceId } = await register();
    console.log(`User registered with workspace ID: ${workspaceId}`);

    // Step 2: Create an agent
    const agentData = await createAgent(workspaceId, token);
    console.log(`Agent created with ID: ${agentData.agent.id}`);
    const agentId = agentData.agent.id;

    // Step 3: Test the list endpoint
    const agentsListResponse = await getAllAgents(workspaceId, token);
    console.log('\nTesting agents list endpoint:');
    const firstAgent = agentsListResponse.data[0].agent;
    console.log('- Response includes channels array:', Array.isArray(firstAgent.channels));
    console.log('- Channels structure:', JSON.stringify(firstAgent.channels, null, 2));

    // Step 4: Test the single agent endpoint
    const singleAgentResponse = await getAgentById(agentId, token);
    console.log('\nTesting single agent endpoint:');
    console.log('- Response includes channels array:', Array.isArray(singleAgentResponse.agent.channels));
    console.log('- Channels structure:', JSON.stringify(singleAgentResponse.agent.channels, null, 2));

    console.log('\nTest completed successfully!');
  } catch (error) {
    console.error('Error during test:', error.response ? error.response.data : error.message);
  }
}

runTest();