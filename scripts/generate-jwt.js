const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const SECRET_KEY = 'test-secret-key-for-development-only'; // This should match the one in your .env file

async function main() {
  try {
    // Get the workspace ID
    const workspace = await prisma.workspace.findFirst();
    
    if (!workspace) {
      console.error('No workspace found. Please run the seed script first.');
      return;
    }
    
    // Create a payload for the JWT
    const payload = {
      sub: 'test-user',
      workspaceId: workspace.id,
      role: 'admin'
    };
    
    // Generate the token
    const token = jwt.sign(payload, SECRET_KEY, { expiresIn: '1d' });
    
    console.log('JWT Token:');
    console.log(token);
    console.log('\nWorkspace ID:');
    console.log(workspace.id);
    
  } catch (error) {
    console.error('Error generating JWT:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();