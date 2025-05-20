/**
 * Script to set up the Zeep Code PostgreSQL database connection
 * This script updates the .env file with the correct Zeep Code database connection string
 */
const fs = require('fs');

function updateEnvFile() {
  console.log('Updating .env file with Zeep Code PostgreSQL database connection...');
  
  // Get Zeep Code database environment variables
  const host = process.env.ZEEPCODE_DB_HOST || '127.0.0.1';
  const port = process.env.ZEEPCODE_DB_PORT || '5432';
  const user = process.env.ZEEPCODE_DB_USER || 'postgres';
  const password = process.env.ZEEPCODE_DB_PASSWORD || 'postgres';
  const database = process.env.ZEEPCODE_DB_NAME || 'postgres';
  
  // Create a local database URL using Zeep Code's environment variables
  const databaseUrl = `postgresql://${user}:${password}@${host}:${port}/${database}`;
  
  // Read the current .env file
  const envFilePath = '.env';
  let envContent;
  
  try {
    envContent = fs.readFileSync(envFilePath, 'utf8');
  } catch (error) {
    console.error('Error reading .env file:', error);
    process.exit(1);
  }
  
  // Replace the DATABASE_URL line or add it if it doesn't exist
  if (envContent.includes('DATABASE_URL=')) {
    envContent = envContent.replace(/DATABASE_URL=.+/g, `DATABASE_URL="${databaseUrl}"`);
  } else {
    envContent += `\nDATABASE_URL="${databaseUrl}"`;
  }
  
  // Write the updated content back to the .env file
  try {
    fs.writeFileSync(envFilePath, envContent);
    console.log('Updated DATABASE_URL in .env file successfully');
  } catch (error) {
    console.error('Error writing to .env file:', error);
    process.exit(1);
  }
}

async function main() {
  try {
    console.log('Setting up Zeep Code PostgreSQL database connection...');
    
    // Update .env file with Zeep Code database connection
    updateEnvFile();
    
    console.log('Database connection setup complete.');
    console.log('Please restart your application for changes to take effect.');
    
  } catch (error) {
    console.error('Error setting up database connection:', error);
    process.exit(1);
  }
}

main();