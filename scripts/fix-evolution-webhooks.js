/**
 * Script to directly update webhook configuration for specific Evolution API instances
 */
const axios = require('axios');
const fs = require('fs');

// Manually read environment variables from .env file
function loadEnv() {
  const envFile = fs.readFileSync('.env', 'utf8');
  const envVars = {};
  
  envFile.split('\n').forEach(line => {
    // Skip comments and empty lines
    if (!line || line.startsWith('#')) return;
    
    const equalSignPos = line.indexOf('=');
    if (equalSignPos > 0) {
      const key = line.substring(0, equalSignPos).trim();
      const value = line.substring(equalSignPos + 1).trim();
      envVars[key] = value;
    }
  });
  
  return envVars;
}

// Load environment variables
const env = loadEnv();

// Evolution API configuration
const EVOLUTION_API_URL = env.EVOLUTION_API_URL;
const EVOLUTION_API_KEY = env.EVOLUTION_API_KEY;
const OUR_ADDRESS = env.OUR_ADDRESS || 'https://tawkee-api-victorsgb.zeepcode.app';
const WEBHOOK_TOKEN = env.WEBHOOK_TOKEN;
const WEBHOOK_URL = `${OUR_ADDRESS}/webhooks/evolution`;

// The two instances we need to configure
const INSTANCES = [
  'tawkee-agent-4ac5f5cf-b59d-4d7f-96c7-75ade0bcab22-1747684594902',
  'tawkee-agent-546d3340-6591-48ca-8506-d2c10edee554-1747685537573'
];

/**
 * Check if instance exists on Evolution API
 */
async function checkInstanceExists(instanceName) {
  try {
    console.log(`Checking if instance ${instanceName} exists...`);
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
      const allInstances = response.data.data;
      console.log(`Found ${allInstances.length} instances on Evolution API`);
      
      for (const instance of allInstances) {
        console.log(`- Instance: ${instance.instance.instanceName}`);
      }
      
      const instanceExists = allInstances.some(
        instance => instance.instance.instanceName === instanceName
      );
      
      if (instanceExists) {
        console.log(`✅ Instance ${instanceName} exists`);
      } else {
        console.log(`❌ Instance ${instanceName} does not exist`);
      }
      
      return instanceExists;
    }
    
    console.log(`❌ Failed to get instances list`);
    return false;
  } catch (error) {
    console.error(`❌ Error checking instance existence: ${error.message}`);
    if (error.response) {
      console.error(`Response data: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    return false;
  }
}

/**
 * Get webhook configuration for an instance
 */
async function getWebhookConfiguration(instanceName) {
  try {
    console.log(`Getting current webhook configuration for ${instanceName}...`);
    const response = await axios.get(
      `${EVOLUTION_API_URL}/webhook/find/${instanceName}`,
      {
        headers: {
          "Content-Type": "application/json",
          apikey: EVOLUTION_API_KEY,
        },
      }
    );

    if (response.status === 200) {
      console.log(`Current webhook config: ${JSON.stringify(response.data, null, 2)}`);
      return response.data;
    }
    
    console.log(`❌ Failed to get webhook configuration`);
    return null;
  } catch (error) {
    console.error(`❌ Error getting webhook configuration: ${error.message}`);
    if (error.response) {
      console.error(`Response data: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    return null;
  }
}

/**
 * Update webhook URL for Evolution API instance
 */
async function updateWebhookUrl(instanceName) {
  console.log(`Updating webhook URL for instance ${instanceName} to ${WEBHOOK_URL}`);
  
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
      console.log(`✅ Webhook URL set successfully for instance ${instanceName}`);
      console.log(`Response: ${JSON.stringify(response.data, null, 2)}`);
      return true;
    } else {
      console.error(`❌ Failed to set webhook URL: ${JSON.stringify(response.data, null, 2)}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error setting webhook URL: ${error.message}`);
    if (error.response) {
      console.error(`Response data: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    return false;
  }
}

/**
 * Main function to update webhooks for specified instances
 */
async function main() {
  console.log('Starting webhook update process...');
  console.log(`Evolution API URL: ${EVOLUTION_API_URL}`);
  console.log(`Our webhook URL: ${WEBHOOK_URL}`);
  console.log(`Authorization token provided: ${WEBHOOK_TOKEN ? 'Yes' : 'No'}`);
  
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !WEBHOOK_TOKEN) {
    console.error('❌ Missing required environment variables');
    process.exit(1);
  }
  
  // First check all existing instances
  console.log('\nChecking all instances on Evolution API:');
  await checkInstanceExists('any'); // This will list all instances
  
  // Process each instance
  for (const instanceName of INSTANCES) {
    console.log(`\n=== Processing instance: ${instanceName} ===`);
    
    // Get current webhook config
    await getWebhookConfiguration(instanceName);
    
    // Update webhook
    const success = await updateWebhookUrl(instanceName);
    if (success) {
      console.log(`✅ Successfully updated webhook for ${instanceName}`);
    } else {
      console.error(`❌ Failed to update webhook for ${instanceName}`);
    }
    
    // Verify the webhook was updated
    await getWebhookConfiguration(instanceName);
  }
  
  console.log('\nWebhook update process completed');
}

// Run the main function
main().catch(error => {
  console.error(`Unhandled error: ${error.message}`);
  process.exit(1);
});