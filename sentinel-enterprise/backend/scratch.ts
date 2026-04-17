import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import dotenv from 'dotenv';
dotenv.config();

const cerebras = createOpenAI({
  baseURL: 'https://api.cerebras.ai/v1',
  apiKey: process.env.CEREBRAS_API_KEY || 'fake-key',
});

async function main() {
  try {
    const response = await generateText({
      model: cerebras.chat('llama3.1-70b'),
      prompt: 'Hello world',
    });
    console.log(response.text);
  } catch (error) {
    console.error(error);
  }
}
main();
