import 'dotenv/config';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

const cerebras = createOpenAI({
  baseURL: 'https://api.cerebras.ai/v1',
  apiKey: process.env.CEREBRAS_API_KEY
});

async function main() {
  try {
    const eventsRes = await fetch('https://edge-api.kaushik0h0s.workers.dev/api/team-history');
    const jsonResponse = await eventsRes.json() as any;
    const eventsData = jsonResponse.data;
    
    const prompt = `Recent Events:\n${JSON.stringify(eventsData, null, 2)}`;
    const systemPrompt = `You are a Senior Architect. Based on these recent GitHub merges and Jira tickets, identify which system services (e.g., Auth, Database, API, UI) are being modified. 
Generate a Mermaid.js graph TD diagram showing the flow of work. 

CRITICAL MERMAID SYNTAX RULES:
1. Connect nodes simply: A --> B
2. If you want to add descriptive text to a node, use square brackets WITH QUOTES, but NEVER use the word "label:". 
   - BAD: Auth[label: "fix-auth"]
   - GOOD: Auth["fix-auth"]
3. Keep the graph simple and clean.
Return ONLY the Mermaid code block starting with 'graph TD'.`;
    
    console.log('Sending to Cerebras...');
    const res = await generateText({
      model: cerebras.chat('llama3.1-8b'),
      system: systemPrompt,
      prompt
    });
    console.log('Got response:');
    console.log(res.text);
  } catch (e) {
    console.error('Error:', e);
  }
}
main();
