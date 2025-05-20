const { QdrantClient } = require('@qdrant/js-client-rest');

const client = new QdrantClient({ url: 'http://localhost:6333' });

async function checkConnection() {
  try {
    const result = await client.getCollections();
    console.log('Qdrant está funcionando:', result);
  } catch (error) {
    console.error('Erro ao conectar ao Qdrant:', error);
  }
}

checkConnection();