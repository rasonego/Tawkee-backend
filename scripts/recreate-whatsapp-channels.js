/**
 * Script to recreate WhatsApp channels for specific phone numbers
 * This will create workspace, agent, and channel entries with proper webhook configuration
 */
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Configuration for the instances we want to create
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const OUR_ADDRESS = process.env.OUR_ADDRESS || 'https://tawkee-api-victorsgb.zeepcode.app';
const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN;
const WEBHOOK_URL = `${OUR_ADDRESS}/webhooks/evolution`;

// The two instances we need to configure
const INSTANCES = [
  {
    name: 'tawkee-agent-4ac5f5cf-b59d-4d7f-96c7-75ade0bcab22-1747684594902',
    phoneNumber: '5583996628630',
    agentName: 'Agent for 5583996628630'
  },
  {
    name: 'tawkee-agent-546d3340-6591-48ca-8506-d2c10edee554-1747685537573',
    phoneNumber: '351932411012',
    agentName: 'Agent for 351932411012'
  }
];

/**
 * Update webhook URL for Evolution API instance
 */
async function updateWebhookUrl(instanceName) {
  console.log(`Updating webhook URL for instance ${instanceName}`);
  
  try {
    const response = await axios.post(
      `${EVOLUTION_API_URL}/webhook/set/${instanceName}`,
      {
        webhook: {
          enabled: true,
          url: WEBHOOK_URL,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${WEBHOOK_TOKEN}`,
          },
          events: ["CONNECTION_UPDATE", "MESSAGES_UPSERT"],
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          apikey: EVOLUTION_API_KEY,
        },
      }
    );

    if (response.status === 200 && response.data.success) {
      console.log(`✅ Webhook URL set successfully for instance ${instanceName} to ${WEBHOOK_URL}`);
      return true;
    } else {
      console.error(`❌ Failed to set webhook URL: ${JSON.stringify(response.data)}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error setting webhook URL: ${error.message}`);
    return false;
  }
}

/**
 * Check if instance exists on Evolution API
 */
async function checkInstanceExists(instanceName) {
  try {
    const response = await axios.get(
      `${EVOLUTION_API_URL}/instance/fetchInstances`,
      {
        headers: {
          "Content-Type": "application/json",
          apikey: EVOLUTION_API_KEY,
        },
      }
    );

    if (response.status === 200 && response.data.data) {
      const instanceExists = response.data.data.some(
        instance => instance.instance.instanceName === instanceName
      );
      return instanceExists;
    }
    return false;
  } catch (error) {
    console.error(`Error checking instance existence: ${error.message}`);
    return false;
  }
}

/**
 * Create a workspace
 */
async function createWorkspace(name) {
  try {
    const workspace = await prisma.workspace.create({
      data: {
        name,
        credits: 1000,
        subscriptionStatus: 'TRIAL', // Using TRIAL as it's likely a valid enum value
      }
    });
    console.log(`✅ Created workspace: ${workspace.id}`);
    return workspace;
  } catch (error) {
    console.error(`❌ Error creating workspace: ${error.message}`);
    throw error;
  }
}

/**
 * Create an agent
 */
async function createAgent(workspaceId, name) {
  try {
    const agent = await prisma.agent.create({
      data: {
        name,
        workspaceId,
        behavior: 'Helpful and friendly customer service agent',
        communicationType: 'NORMAL',
        type: 'SUPPORT',
        isActive: true,
      }
    });
    console.log(`✅ Created agent: ${agent.id}`);
    return agent;
  } catch (error) {
    console.error(`❌ Error creating agent: ${error.message}`);
    throw error;
  }
}

/**
 * Create a WhatsApp channel with proper webhook configuration
 */
async function createWhatsAppChannel(agentId, instanceName, phoneNumber) {
  try {
    // Generate a config with webhook settings
    const channelConfig = {
      evolutionApi: {
        instanceName,
        serverUrl: EVOLUTION_API_URL,
        apiKey: EVOLUTION_API_KEY,
        webhookUrl: WEBHOOK_URL,
        webhookToken: WEBHOOK_TOKEN,
      }
    };

    const channel = await prisma.channel.create({
      data: {
        agentId,
        type: 'WHATSAPP',
        phoneNumber,
        config: channelConfig,
        isActive: true,
      }
    });
    
    console.log(`✅ Created WhatsApp channel: ${channel.id}`);
    return channel;
  } catch (error) {
    console.error(`❌ Error creating WhatsApp channel: ${error.message}`);
    throw error;
  }
}

/**
 * Main function to recreate WhatsApp channels
 */
async function main() {
  console.log('Starting WhatsApp channel recreation process...');
  
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !WEBHOOK_TOKEN) {
    console.error('❌ Missing required environment variables');
    process.exit(1);
  }
  
  console.log(`Evolution API URL: ${EVOLUTION_API_URL}`);
  console.log(`Our webhook URL: ${WEBHOOK_URL}`);
  
  // Process each instance
  for (const instance of INSTANCES) {
    try {
      console.log(`\nProcessing instance: ${instance.name}`);
      
      // Check if instance exists in Evolution API
      const exists = await checkInstanceExists(instance.name);
      if (!exists) {
        console.warn(`⚠️ Instance ${instance.name} does not exist in Evolution API. It should already be configured for phone ${instance.phoneNumber}.`);
        // Continue anyway to create database entries
      }
      
      // Create workspace, agent, and channel
      const workspace = await createWorkspace(`Workspace for ${instance.phoneNumber}`);
      const agent = await createAgent(workspace.id, instance.agentName);
      const channel = await createWhatsAppChannel(agent.id, instance.name, instance.phoneNumber);
      
      // Update webhook URL on Evolution API
      const webhookSuccess = await updateWebhookUrl(instance.name);
      if (webhookSuccess) {
        console.log(`✅ Successfully configured ${instance.name} for phone ${instance.phoneNumber}`);
      } else {
        console.warn(`⚠️ Webhook update failed for ${instance.name}, but database entries were created`);
      }
    } catch (error) {
      console.error(`❌ Error processing instance ${instance.name}: ${error.message}`);
    }
  }
  
  console.log('\nWhatsApp channel recreation process completed');
}

main()
  .catch((error) => {
    console.error(`Unhandled error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });