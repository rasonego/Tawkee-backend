const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    // Create a test workspace
    const workspace = await prisma.workspace.create({
      data: {
        name: 'Test Workspace',
        credits: 100,
        subscriptionStatus: 'TRIAL',
      },
    });
    
    console.log('Created workspace:', workspace);

    // Create a test agent within the workspace
    const agent = await prisma.agent.create({
      data: {
        name: 'Test Agent',
        behavior: 'This is a test agent for API testing.',
        communicationType: 'NORMAL',
        type: 'SUPPORT',
        workspaceId: workspace.id,
      },
    });
    
    console.log('Created agent:', agent);
    
    // Create default settings for the agent
    const settings = await prisma.agentSettings.create({
      data: {
        agentId: agent.id,
        preferredModel: 'GPT_4_1',
        timezone: 'UTC',
      },
    });
    
    console.log('Created agent settings:', settings);

    // Create default webhooks for the agent
    const webhooks = await prisma.agentWebhooks.create({
      data: {
        agentId: agent.id,
      },
    });
    
    console.log('Created agent webhooks:', webhooks);

    console.log('Seed completed successfully');
  } catch (error) {
    console.error('Error during seeding:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();