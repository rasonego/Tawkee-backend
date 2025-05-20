/**
 * Helper script to run database queries directly
 * Usage: node scripts/db-query.js
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  try {
    // Example queries - uncomment the one you want to run
    
    // 1. List all users
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        emailVerified: true,
        provider: true,
        createdAt: true
      }
    });
    console.log('Users:', JSON.stringify(users, null, 2));
    
    // 2. Count users by provider
    // const usersByProvider = await prisma.$queryRaw`
    //   SELECT provider, COUNT(*) as count 
    //   FROM "User" 
    //   GROUP BY provider
    // `;
    // console.log('Users by provider:', JSON.stringify(usersByProvider, null, 2));
    
    // 3. Get all workspaces
    // const workspaces = await prisma.workspace.findMany();
    // console.log('Workspaces:', JSON.stringify(workspaces, null, 2));
    
    // 4. Get all agents with their workspace
    // const agents = await prisma.agent.findMany({
    //   include: {
    //     workspace: true
    //   }
    // });
    // console.log('Agents:', JSON.stringify(agents, null, 2));
    
    // 5. Count interactions by status
    // const interactionsByStatus = await prisma.$queryRaw`
    //   SELECT status, COUNT(*) as count 
    //   FROM "Interaction" 
    //   GROUP BY status
    // `;
    // console.log('Interactions by status:', JSON.stringify(interactionsByStatus, null, 2));
    
  } catch (error) {
    console.error('Error running query:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();