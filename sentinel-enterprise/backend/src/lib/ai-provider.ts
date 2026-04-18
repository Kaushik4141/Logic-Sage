import { generateText, type LanguageModelV1 } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

// --- Providers Configuration ---

const cerebras = createOpenAI({
  baseURL: 'https://api.cerebras.ai/v1',
  apiKey: process.env.CEREBRAS_API_KEY || '',
});

const groq = createOpenAI({
  baseURL: 'https://api.groq.com/openai/v1',
  apiKey: process.env.GROQ_API_KEY || '',
});

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

// --- Model Mapping ---

const MODELS = {
  cerebras: process.env.CEREBRAS_PRIMARY_MODEL || 'llama3.1-8b',
  groq: process.env.GROQ_PRIMARY_MODEL || 'llama-3.1-8b-instant',
  openai: process.env.OPENAI_PRIMARY_MODEL || 'gpt-4o-mini',
};

/**
 * Interface for the safe generation options.
 * Matches a subset of generateText options.
 */
interface GenerateTextSafeOptions {
  system?: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}

/**
 * Attempts to generate text using providers in sequence:
 * Cerebras -> Groq -> OpenAI
 * 
 * Automatically handles 429 (Rate Limit) and other transient errors.
 */
export async function generateTextSafe(options: GenerateTextSafeOptions): Promise<{ text: string; provider: string }> {
  const providers = [
    { name: 'cerebras', model: cerebras.chat(MODELS.cerebras), key: process.env.CEREBRAS_API_KEY },
    { name: 'groq', model: groq.chat(MODELS.groq), key: process.env.GROQ_API_KEY },
    { name: 'openai', model: openai.chat(MODELS.openai), key: process.env.OPENAI_API_KEY },
  ];

  const availableProviders = providers.filter(p => !!p.key);

  if (availableProviders.length === 0) {
    throw new Error('No AI providers configured. Please add CEREBRAS_API_KEY, GROQ_API_KEY, or OPENAI_API_KEY to your .env file.');
  }

  let lastError: any = null;

  for (const provider of availableProviders) {
    try {
      console.log(`[Sentinel] Attempting generation with provider: ${provider.name}`);
      const result = await generateText({
        model: provider.model,
        system: options.system,
        prompt: options.prompt,
        temperature: options.temperature,
        maxOutputTokens: options.maxOutputTokens,
        maxRetries: 0,
      });

      return {
        text: result.text,
        provider: provider.name,
      };
    } catch (error: any) {
      lastError = error;
      const statusCode = error?.statusCode ?? error?.lastError?.statusCode;
      console.warn(`[Sentinel] Provider ${provider.name} failed (status=${statusCode ?? 'unknown'}). Trying next...`);
      continue;
    }
  }

  throw lastError || new Error('All AI providers failed to generate a response.');
}
