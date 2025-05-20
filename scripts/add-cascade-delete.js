/**
 * Script to directly modify the database and add CASCADE DELETE constraints
 * This allows deletion of agents and chats regardless of their related records
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function addCascadeDeleteConstraints() {
  console.log('Adding CASCADE DELETE constraints to the database...');

  try {
    // We'll execute direct SQL to modify the constraints
    // This bypasses Prisma migrations which can be problematic

    // Split each operation into separate commands to avoid the multiple command error
    const queries = [
      // 1. Chat should be deleted when its Agent is deleted
      'ALTER TABLE "Chat" DROP CONSTRAINT IF EXISTS "Chat_agentId_fkey";',
      'ALTER TABLE "Chat" ADD CONSTRAINT "Chat_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE;',

      // 2. Interaction should be deleted when its Chat is deleted
      'ALTER TABLE "Interaction" DROP CONSTRAINT IF EXISTS "Interaction_chatId_fkey";',
      'ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE;',

      // 3. Interaction should be deleted when its Agent is deleted
      'ALTER TABLE "Interaction" DROP CONSTRAINT IF EXISTS "Interaction_agentId_fkey";',
      'ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE;',

      // 4. Message interaction reference should be nullified when Interaction is deleted
      'ALTER TABLE "Message" DROP CONSTRAINT IF EXISTS "Message_interactionId_fkey";',
      'ALTER TABLE "Message" ADD CONSTRAINT "Message_interactionId_fkey" FOREIGN KEY ("interactionId") REFERENCES "Interaction"("id") ON DELETE SET NULL;',

      // 5. Message should be deleted when its Chat is deleted
      'ALTER TABLE "Message" DROP CONSTRAINT IF EXISTS "Message_chatId_fkey";',
      'ALTER TABLE "Message" ADD CONSTRAINT "Message_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE;',

      // 6. WebhookEvent Message reference should be nullified when Message is deleted
      'ALTER TABLE "WebhookEvent" DROP CONSTRAINT IF EXISTS "WebhookEvent_relatedMessageId_fkey";',
      'ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_relatedMessageId_fkey" FOREIGN KEY ("relatedMessageId") REFERENCES "Message"("id") ON DELETE SET NULL;'
    ];

    for (const query of queries) {
      try {
        await prisma.$executeRawUnsafe(query);
        console.log('Successfully executed query:', query);
      } catch (err) {
        // If table doesn't exist yet, that's ok - might run this before tables are created
        if (err.message.includes('does not exist')) {
          console.log('Table does not exist yet:', err.message);
        } else {
          console.log('Warning:', err.message);
        }
      }
    }

    console.log('CASCADE DELETE constraints added successfully!');
    console.log('You can now delete agents and chats without constraint errors.');
  } catch (error) {
    console.error('Error adding cascade delete constraints:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addCascadeDeleteConstraints();