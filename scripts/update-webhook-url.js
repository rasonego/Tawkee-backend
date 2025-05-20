/**
 * Script to update the webhook URL for Evolution API instances
 * Use this to ensure both WhatsApp channels are properly configured to send webhooks
 */
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Update webhook URL for a specific Evolution API instance
 */
async function updateWebhookUrl(instanceName, serverUrl, apiKey) {
  console.log(`Updating webhook URL for instance ${instanceName}`);
  
  const baseUrl = process.env.OUR_ADDRESS || 'https://tawkee-api-victorsgb.zeepcode.app';
  const webhookUrl = `${baseUrl}/webhooks/evolution`;
  
  try {
    const response = await axios.post(
      `${serverUrl}/webhook/set/${instanceName}`,
      {
        webhook: {
          enabled: true,
          url: webhookUrl,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.WEBHOOK_TOKEN}`,
          },
          events: ["CONNECTION_UPDATE", "MESSAGES_UPSERT"],
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          apikey: apiKey,
        },
      }
    );

    if (response.status === 200 && response.data.success) {
      console.log(`✅ Webhook URL set successfully for instance ${instanceName} to ${webhookUrl}`);
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
 * Get a list of all WhatsApp channels
 */
async function getAllWhatsAppChannels() {
  try {
    const channels = await prisma.channel.findMany({
      where: {
        type: 'WHATSAPP',
      },
      include: {
        agent: true,
      }
    });
    
    console.log(`Found ${channels.length} WhatsApp channels`);
    return channels;
  } catch (error) {
    console.error(`Error fetching WhatsApp channels: ${error.message}`);
    return [];
  }
}

/**
 * Main function to update webhook URLs for all WhatsApp channels
 */
async function main() {
  console.log('Starting webhook URL update process...');
  
  const evolutionApiUrl = process.env.EVOLUTION_API_URL;
  const evolutionApiKey = process.env.EVOLUTION_API_KEY;
  
  if (!evolutionApiUrl || !evolutionApiKey) {
    console.error('❌ Missing Evolution API configuration in environment variables');
    process.exit(1);
  }

  const channels = await getAllWhatsAppChannels();
  
  if (channels.length === 0) {
    console.log('No WhatsApp channels found');
    process.exit(0);
  }
  
  console.log('Channel details:');
  for (const channel of channels) {
    console.log(`- Channel ID: ${channel.id}, Agent ID: ${channel.agentId}`);
    
    const config = channel.config;
    if (!config || !config.evolutionApi) {
      console.error(`❌ Channel ${channel.id} does not have Evolution API configuration`);
      continue;
    }
    
    const { evolutionApi } = config;
    console.log(`  Instance name: ${evolutionApi.instanceName}`);
    console.log(`  Server URL: ${evolutionApi.serverUrl || evolutionApiUrl}`);
    
    const success = await updateWebhookUrl(
      evolutionApi.instanceName,
      evolutionApi.serverUrl || evolutionApiUrl,
      evolutionApi.apiKey || evolutionApiKey
    );
    
    if (success) {
      // Update channel config with the new webhook URL
      const baseUrl = process.env.OUR_ADDRESS || 'https://tawkee-api-victorsgb.zeepcode.app';
      const webhookUrl = `${baseUrl}/webhooks/evolution`;
      
      const updatedConfig = {
        ...config,
        evolutionApi: {
          ...evolutionApi,
          webhookUrl,
          webhookToken: process.env.WEBHOOK_TOKEN
        }
      };
      
      try {
        await prisma.channel.update({
          where: { id: channel.id },
          data: { config: updatedConfig }
        });
        console.log(`✅ Updated channel ${channel.id} config with new webhook URL`);
      } catch (error) {
        console.error(`❌ Error updating channel config: ${error.message}`);
      }
    }
  }
  
  console.log('Webhook URL update process completed');
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