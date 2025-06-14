import { randomUUID } from 'crypto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAiService } from '../openai/openai.service';

import { QdrantClient } from '@qdrant/js-client-rest';

@Injectable()
export class QdrantService implements OnModuleInit {
  private readonly client: QdrantClient;
  private readonly logger = new Logger(QdrantService.name);
  private readonly collectionName = 'agent_trainings';
  private readonly vectorSize = 1536; // Using OpenAI's embedding dimension

  // In-memory fallback for when Qdrant isn't available
  private inMemoryVectors: Map<
    string,
    {
      id: string;
      agentId: string;
      text: string;
      vector: number[];
      metadata?: Record<string, any>;
    }[]
  > = new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly openAiService: OpenAiService
  ) {
    // Try to connect to Qdrant in order of preference:
    // 1. Use URL and API key from environment if provided
    // 2. Try localhost connection if no credentials
    const qdrantUrl = this.configService.get<string>('QDRANT_URL');
    const qdrantApiKey = this.configService.get<string>('QDRANT_API_KEY');

    if (qdrantUrl && !qdrantApiKey) {
      this.logger.log(
        `Initializing Qdrant client with remote URL: ${qdrantUrl}`
      );
      this.client = new QdrantClient({
        url: qdrantUrl,
      });
    } else if (qdrantUrl && qdrantApiKey) {
      this.logger.log(
        `Initializing Qdrant client with remote URL: ${qdrantUrl} and apiKey`
      );
      this.client = new QdrantClient({
        url: qdrantUrl,
        apiKey: qdrantApiKey,
      });
    } else {
      // Default to localhost
      this.logger.log('Initializing local Qdrant client at localhost:6333');
      this.client = new QdrantClient({
        url: 'http://localhost:6333',
      });
    }
  }

  async onModuleInit() {
    try {
      await this.ensureCollectionExists();
      this.logger.log('Successfully connected to Qdrant');
    } catch (error) {
      this.logger.warn(
        `Failed to initialize Qdrant collection: ${error.message}`
      );
      this.logger.warn('Will use in-memory vector storage fallback instead');
    }
  }

  async ensureCollectionExists() {
    try {
      // Check if collection exists
      this.logger.log(`About to get collection Qdrant collections...`);
      const collections = await this.client.getCollections();
      this.logger.log(`Checking if ${this.collectionName} is in Qdrant...`);
      const collectionExists = collections.collections.some(
        (collection) => collection.name === this.collectionName
      );

      if (!collectionExists) {
        this.logger.log(`Creating collection ${this.collectionName}...`);
        await this.client.createCollection(this.collectionName, {
          vectors: {
            size: this.vectorSize,
            distance: 'Cosine',
          },
          optimizers_config: {
            indexing_threshold: 100, // Index after 100 vectors
          },
        });

        this.logger.log(`Created collection ${this.collectionName}`);

        // Adding necessary payload indexes for faster filtering
        await this.client.createPayloadIndex(this.collectionName, {
          field_name: 'agentId',
          field_schema: 'keyword',
        });

        await this.client.createPayloadIndex(this.collectionName, {
          field_name: 'trainingId',
          field_schema: 'keyword',
        });
      } else {
        this.logger.log(`Collection ${this.collectionName} already exists`);
      }
    } catch (error) {
      this.logger.error(`Error ensuring collection exists: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if Qdrant is available
   */
  private async isQdrantAvailable(): Promise<boolean> {
    try {
      await this.client.getCollections();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate embeddings for text using OpenAI
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      return await this.openAiService.generateEmbedding(text);
    } catch (error) {
      this.logger.error(`Error generating embedding: ${error.message}`);
      throw error;
    }
  }

  /**
   * Store training data in Qdrant
   */
  async storeTraining(
    trainingId: string,
    agentId: string,
    text: string,
    metadata: Record<string, any> = {}
  ): Promise<boolean> {
    try {
      // Check if Qdrant is available
      const qdrantAvailable = await this.isQdrantAvailable();

      // Break down long text into chunks for better retrieval (max 2000 chars per chunk)
      const chunks = this.chunkText(text, 2000);

      // Store each chunk with its embedding
      const points = await Promise.all(
        chunks.map(async (chunk, index) => {
          // Generate embedding for each chunk
          const chunkEmbedding = await this.generateEmbedding(chunk);

          this.logger.log(
            `Payload text length (chunkIndex ${index}): ${chunk.length}`
          );
          this.logger.log(`Embedding length: ${chunkEmbedding.length}`);

          return {
            id: randomUUID(),
            vector: chunkEmbedding,
            payload: {
              trainingId,
              agentId,
              text: chunk,
              chunkIndex: index,
              totalChunks: chunks.length,
              metadata,
            },
          };
        })
      );

      // If Qdrant is available, store there
      if (qdrantAvailable) {
        this.logger.log(
          `About to upsert data points on collection ${this.collectionName}...`
        );
        const result = await this.client.upsert(this.collectionName, {
          wait: true,
          points,
        });
        this.logger.log(`Did it: ${result}!`);

        return result.status === 'completed';
      } else {
        // Otherwise use in-memory fallback
        this.logger.log(
          `Using in-memory fallback to store training ${trainingId}`
        );

        // Store each point in memory
        points.forEach((point) => {
          // Get or create the agent's vector array
          if (!this.inMemoryVectors.has(agentId)) {
            this.inMemoryVectors.set(agentId, []);
          }

          const agentVectors = this.inMemoryVectors.get(agentId);

          // Add the vector
          agentVectors.push({
            id: point.id,
            agentId,
            vector: point.vector,
            ...point.payload,
            metadata: point.payload.metadata,
          });
        });

        return true;
      }
    } catch (error) {
      if (error.response) {
        this.logger.error(
          `Qdrant error response: ${JSON.stringify(error.response.data)}`
        );
      }
      this.logger.error(
        `Error storing training in vector storage: ${JSON.stringify(error)}`
      );
      throw error;
    }
  }

  /**
   * Delete training data from vector storage
   */
  async deleteTraining(trainingId: string): Promise<boolean> {
    try {
      // Check if Qdrant is available
      const qdrantAvailable = await this.isQdrantAvailable();

      if (qdrantAvailable) {
        // Delete from Qdrant
        const result = await this.client.delete(this.collectionName, {
          filter: {
            must: [
              {
                key: 'trainingId',
                match: {
                  value: trainingId,
                },
              },
            ],
          },
          wait: true,
        });

        return result.status === 'completed';
      } else {
        // Delete from in-memory storage
        this.logger.log(
          `Using in-memory fallback to delete training ${trainingId}`
        );

        // Go through all agent vectors and filter out the ones matching this trainingId
        for (const [agentId, vectors] of this.inMemoryVectors.entries()) {
          const filteredVectors = vectors.filter(
            (v) => !v.id.startsWith(trainingId)
          );
          this.inMemoryVectors.set(agentId, filteredVectors);
        }

        return true;
      }
    } catch (error) {
      this.logger.error(
        `Error deleting training from vector storage: ${error.message}`
      );
      return false;
    }
  }

  /**
   * Retrieve similar training materials
   */
  async findSimilarTrainings(
    query: string,
    agentId: string,
    limit: number = 3
  ): Promise<
    {
      text: string;
      trainingId: string;
      similarity: number;
    }[]
  > {
    try {
      // Break down long query into chunks for better retrieval (max 2000 chars per chunk)
      const queryChunks = this.chunkText(query, 2000);

      this.logger.log(`Query broken into ${queryChunks.length} chunks`);

      // Check if Qdrant is available
      const qdrantAvailable = await this.isQdrantAvailable();

      // Store all results from all chunks
      const allResults: {
        text: string;
        trainingId: string;
        similarity: number;
      }[] = [];

      // Search for each query chunk
      for (let i = 0; i < queryChunks.length; i++) {
        const chunk = queryChunks[i];
        this.logger.log(
          `Processing query chunk ${i + 1}/${queryChunks.length} (length: ${chunk.length})`
        );

        try {
          // Generate embedding for this chunk
          const embedding = await this.generateEmbedding(chunk);

          if (qdrantAvailable) {
            // Search for similar vectors in Qdrant
            const searchResult = await this.client.search(this.collectionName, {
              vector: embedding,
              limit: limit * 2, // Get more results per chunk to have better overall selection
              filter: {
                must: [
                  {
                    key: 'agentId',
                    match: {
                      value: agentId,
                    },
                  },
                ],
              },
              with_payload: true,
            });

            // Format and add results from this chunk
            const chunkResults = searchResult.map((result) => ({
              text: (result.payload?.text as string) || '',
              trainingId: (result.payload?.trainingId as string) || '',
              similarity: result.score,
            }));

            allResults.push(...chunkResults);
          } else {
            // Use in-memory fallback for similarity search
            this.logger.log(
              `Using in-memory fallback for similarity search for agent ${agentId}, chunk ${i + 1}`
            );

            const agentVectors = this.inMemoryVectors.get(agentId) || [];

            if (agentVectors.length === 0) {
              continue; // Skip this chunk if no vectors available
            }

            // Compute cosine similarity between chunk embedding and all stored vectors
            const chunkResults = agentVectors.map((vector) => {
              const similarity = this.computeCosineSimilarity(
                embedding,
                vector.vector
              );
              return {
                text: vector.text,
                trainingId:
                  vector.metadata?.trainingId || vector.id.split('_')[0], // Extract training ID
                similarity,
              };
            });

            allResults.push(...chunkResults);
          }
        } catch (chunkError) {
          this.logger.error(
            `Error processing query chunk ${i + 1}: ${chunkError.message}`
          );
          // Continue with other chunks even if one fails
          continue;
        }
      }

      if (allResults.length === 0) {
        this.logger.log('No results found for any query chunks');
        return [];
      }

      // Remove duplicates by trainingId and text, keeping the highest similarity score
      const uniqueResults = new Map<
        string,
        {
          text: string;
          trainingId: string;
          similarity: number;
        }
      >();

      allResults.forEach((result) => {
        const key = `${result.trainingId}_${result.text}`;
        const existing = uniqueResults.get(key);

        if (!existing || result.similarity > existing.similarity) {
          uniqueResults.set(key, result);
        }
      });

      // Convert back to array, sort by similarity (highest first) and take top 'limit' results
      const finalResults = Array.from(uniqueResults.values())
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

      this.logger.log(
        `Returning ${finalResults.length} unique results from ${allResults.length} total matches`
      );

      return finalResults;
    } catch (error) {
      this.logger.error(`Error searching similar trainings: ${error.message}`);
      return [];
    }
  }
  /**
   * Compute cosine similarity between two vectors
   * Returns a value between 0 and 1
   */
  private computeCosineSimilarity(a: number[], b: number[]): number {
    // Ensure vectors are of the same length
    if (a.length !== b.length) {
      throw new Error('Vectors must be of the same length');
    }

    // Compute dot product
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] ** 2;
      normB += b[i] ** 2;
    }

    // Avoid division by zero
    if (normA === 0 || normB === 0) {
      return 0;
    }

    // Return cosine similarity
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Split text into smaller chunks
   */
  private chunkText(text: string, maxChunkSize: number): string[] {
    if (text.length <= maxChunkSize) {
      return [text];
    }

    const chunks: string[] = [];
    let currentChunk = '';

    // Split by sentences to maintain context
    const sentences = text.split(/(?<=[.!?])\s+/);

    for (const sentence of sentences) {
      // If adding this sentence would exceed max size, save current chunk and start new one
      if (currentChunk.length + sentence.length > maxChunkSize) {
        if (currentChunk) {
          chunks.push(currentChunk);
        }
        currentChunk = sentence;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      }
    }

    // Add the last chunk if it has content
    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks;
  }
}
