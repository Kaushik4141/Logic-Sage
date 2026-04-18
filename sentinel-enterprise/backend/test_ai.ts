import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import dotenv from 'dotenv';
dotenv.config();

const cerebras = createOpenAI({
  baseURL: 'https://api.cerebras.ai/v1',
  apiKey: process.env.CEREBRAS_API_KEY || '',
});

async function main() {
  console.log("starting generateText...");
  try {
    const result = await generateText({
      model: cerebras.chat('llama3.1-8b'),
      prompt: 'Hello',
    });
    console.log("llama3.1-8b success:", result.text);
  } catch (e: any) {
    console.error("llama3.1-8b error:", e.message);
  }
}
main();
