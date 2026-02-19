/**
 * Local Embeddings via Ollama
 *
 * Uses nomic-embed-text or mxbai-embed-large for local embeddings.
 * No API calls, runs entirely on your machine.
 */

import { Ollama } from 'ollama';

const ollama = new Ollama();

// Default embedding model - small and fast
const DEFAULT_MODEL = 'nomic-embed-text';

/**
 * Generate embedding for a single text
 */
export async function embed(text: string, model = DEFAULT_MODEL): Promise<number[]> {
  try {
    const response = await ollama.embeddings({
      model,
      prompt: text,
    });
    return response.embedding;
  } catch (error) {
    // If model not found, try to pull it
    if (String(error).includes('not found')) {
      console.log(`[Memory] Pulling embedding model: ${model}...`);
      await ollama.pull({ model });
      const response = await ollama.embeddings({ model, prompt: text });
      return response.embedding;
    }
    throw error;
  }
}

/**
 * Generate embeddings for multiple texts
 */
export async function embedBatch(texts: string[], model = DEFAULT_MODEL): Promise<number[][]> {
  const embeddings: number[][] = [];
  for (const text of texts) {
    embeddings.push(await embed(text, model));
  }
  return embeddings;
}

/**
 * Cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}
