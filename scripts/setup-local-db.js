/**
 * Script to set up the local PostgreSQL database connection
 * This updates the .env file to use Zeep Code's built-in PostgreSQL database
 */
const fs = require('fs');
const { exec } = require('child_process');

function updateEnvFile() {
  // Create a new connection string for the local Zeep Code PostgreSQL database
  const connectionString = `DATABASE_URL="postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}"`;
  
  // Read the current .env file or create a new one
  let envContent;
  try {
    envContent = fs.readFileSync('.env', 'utf8');
  } catch (error) {
    // File doesn't exist, create a new one
    envContent = '';
  }

  // Replace DATABASE_URL line or add it if it doesn't exist
  if (envContent.includes('DATABASE_URL=')) {
    envContent = envContent.replace(/DATABASE_URL=.+/g, connectionString);
  } else {
    envContent += `\n${connectionString}`;
  }

  // Write back to .env file
  fs.writeFileSync('.env', envContent);
  console.log('Updated .env file with local PostgreSQL connection');
}

async function main() {
  try {
    console.log('Setting up local PostgreSQL database connection...');
    
    // Update .env file with local PostgreSQL connection string
    updateEnvFile();
    
    console.log('Local PostgreSQL database setup complete!');
    console.log('You can now run migrations with: npx prisma migrate dev');
    console.log('Or start your application with: npm run start:dev');
  } catch (error) {
    console.error('Error setting up database:', error);
    process.exit(1);
  }
}

main();