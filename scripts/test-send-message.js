/**
 * Script to test sending messages from both Evolution API instances
 * This helps verify both instances are properly connected
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

// The two instances we need to test
const INSTANCES = [
  {
    name: 'tawkee-agent-4ac5f5cf-b59d-4d7f-96c7-75ade0bcab22-1747684594902',
    phone: '5583996628630', // The phone this instance is connected to
    testRecipient: '351932411012' // Send test message to the other phone
  },
  {
    name: 'tawkee-agent-546d3340-6591-48ca-8506-d2c10edee554-1747685537573',
    phone: '351932411012', // The phone this instance is connected to
    testRecipient: '5583996628630' // Send test message to the other phone
  }
];

/**
 * Get connection status for an instance
 */
async function getInstanceStatus(instanceName) {
  try {
    console.log(`Checking connection status for instance ${instanceName}...`);
    
    const response = await axios.get(
      `${EVOLUTION_API_URL}/instance/connectionState/${instanceName}`,
      {
        headers: {
          "Content-Type": "application/json",
          apikey: EVOLUTION_API_KEY,
        },
      }
    );

    if (response.status === 200) {
      console.log(`Status: ${JSON.stringify(response.data, null, 2)}`);
      return response.data;
    }
    return null;
  } catch (error) {
    console.error(`Error checking instance status: ${error.message}`);
    return null;
  }
}

/**
 * Send a test message from the specified instance
 */
async function sendTestMessage(instanceName, phoneNumber) {
  try {
    console.log(`Sending test message from ${instanceName} to ${phoneNumber}...`);
    
    // Format the phone number (remove leading + if present)
    const formattedPhone = phoneNumber.startsWith("+") 
      ? phoneNumber.substring(1) 
      : phoneNumber;
      
    const timestamp = new Date().toISOString();
    const message = `This is a test message from instance ${instanceName}. Time: ${timestamp}`;
    
    const response = await axios.post(
      `${EVOLUTION_API_URL}/message/sendText/${instanceName}`,
      {
        number: formattedPhone,
        options: {
          delay: 1200,
        },
        textMessage: message,
      },
      {
        headers: {
          "Content-Type": "application/json",
          apikey: EVOLUTION_API_KEY,
        },
      }
    );

    if (response.status === 201 && response.data.success) {
      console.log(`✅ Message sent successfully from ${instanceName} to ${phoneNumber}`);
      console.log(`Message: "${message}"`);
      return true;
    } else {
      console.error(`❌ Failed to send message: ${JSON.stringify(response.data, null, 2)}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error sending message: ${error.message}`);
    if (error.response) {
      console.error(`Response data: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    return false;
  }
}

/**
 * Main function to test both instances
 */
async function main() {
  console.log('Starting WhatsApp connection test...');
  console.log(`Evolution API URL: ${EVOLUTION_API_URL}`);
  
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    console.error('❌ Missing required environment variables');
    process.exit(1);
  }
  
  // Test each instance
  for (const instance of INSTANCES) {
    console.log(`\n=== Testing instance: ${instance.name} ===`);
    
    // Check connection status
    const status = await getInstanceStatus(instance.name);
    if (!status || status.state !== 'open') {
      console.warn(`⚠️ Instance ${instance.name} is not connected (status: ${status?.state || 'unknown'})`);
      console.log('Skipping message test for this instance');
      continue;
    }
    
    // Try sending a message
    await sendTestMessage(instance.name, instance.testRecipient);
  }
  
  console.log('\nTesting completed. Check your phones for messages and your application logs for webhook events.');
}

// Run the main function
main().catch(error => {
  console.error(`Unhandled error: ${error.message}`);
  process.exit(1);
});