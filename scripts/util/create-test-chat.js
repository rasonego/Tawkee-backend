/**
 * Utility script to directly create a test chat in the database for an agent
 * This is used by the test-agent-deletion.js script
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Create a test chat directly in the database
 * @param {string} agentId - The ID of the agent to associate with the chat
 * @returns {Promise<Object>} - The created chat object
 */
async function createTestChat(agentId) {
  try {
    // First ensure the agent exists
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      include: { workspace: true }
    });
    
    if (!agent) {
      throw new Error(`Agent with ID ${agentId} not found`);
    }
    
    // Create a unique contextId using timestamp and random string
    const contextId = `test_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    
    // Create a minimal chat record for testing
    const chat = await prisma.chat.create({
      data: {
        agentId,
        workspaceId: agent.workspaceId,
        contextId,
        whatsappPhone: '1234567890', // Use correct field instead of 'from'
        humanTalk: false,
        read: true,
        finished: false,
        unReadCount: 0
      },
    });
    
    console.log(`Created test chat with ID: ${chat.id}`);
    return chat;
  } catch (error) {
    console.error('Error creating test chat:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

module.exports = { createTestChat };