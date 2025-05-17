import { Connection, clusterApiUrl } from '@solana/web3.js';
import { LLMResponse } from './types';

// System prompt for the LLM
export const SYSTEM_PROMPT = `You are a financial assistant for a Solana-based Trading/Yield Agent. Your role is to parse user inputs and identify one of the following intents: buy SOL, buy token, explore yield options, view portfolio, or out-of-scope.

For buy SOL requests, parse the amount and currency. Examples:
- "I want to buy 1 SOL" -> { "intent": "buy_sol", "amount": 1, "currency": "SOL" }
- "Buy 0.5 SOL" -> { "intent": "buy_sol", "amount": 0.5, "currency": "SOL" }
- "Purchase 2 SOL" -> { "intent": "buy_sol", "amount": 2, "currency": "SOL" }

For buy token requests, parse the amount and token name. Examples:
- "I want to buy 10 USDC" -> { "intent": "buy_token", "amount": 10, "token": "USDC" }
- "Buy 5 Trump token" -> { "intent": "buy_token", "amount": 5, "token": "TRUMP" }
- "Get me 20 BONK" -> { "intent": "buy_token", "amount": 20, "token": "BONK" }

For yield/lending requests, identify the token. Examples:
- "Show me lending options for SOL" -> { "intent": "explore_yield", "token": "SOL", "message": "Looking up lending options for SOL..." }
- "What yield can I get on USDC?" -> { "intent": "explore_yield", "token": "USDC", "message": "Let me check yield options for USDC" }
- "How can I earn interest with my BONK" -> { "intent": "explore_yield", "token": "BONK", "message": "Here are ways to earn with BONK" }

IMPORTANT: Any question about lending, yield, earning, staking, or depositing should be classified as "explore_yield" intent.

For each response, return a structured JSON with:
{
  "intent": "buy_sol" | "buy_token" | "explore_yield" | "view_portfolio" | "out_of_scope",
  "amount": number | null,  // Required for buy_sol and buy_token intents
  "currency": "SOL",       // Required for buy_solk intent
  "token": string,         // Required for buy_token intent and explore_yield intent
  "message": string        // User-friendly response
}

Keep all responses concise (under 100 characters) and conversational.`;

// Generate a unique ID for each message
export function generateMessageId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export function getAlchemyConnection(): Connection {
    // Try Alchemy if available, otherwise use public RPC
    const endpoint = process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL || 'https://api.mainnet-beta.solana.com';
    
    // Create connection with 'confirmed' commitment and no WebSocket
    return new Connection(endpoint, 'confirmed');
}

// Improved helper to extract token symbol from user input for yield intent
export function extractTokenSymbolFromYieldQuery(query: string): string | null {
  // Try to match various patterns of asking about yield
  const patterns = [
    /yield(?: options?)?(?: for)? (\w+)/i,
    /(\w+) yield/i,
    /earn(?: on| with)? (\w+)/i,
    /invest(?: in)? (\w+)/i,
    /lend(?: my)? (\w+)/i,
    /deposit(?: my)? (\w+)/i,
    /stake(?: my)? (\w+)/i,
    /lending(?: options?)?(?: for)? (\w+)/i,  // Match "lending options for X"
    /loan(?: options?)?(?: for)? (\w+)/i      // Match "loan options for X"
  ];
  
  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match) return match[1].toUpperCase();
  }
  
  return null;
}

// Process LLM response
export async function processLLMResponse(userMessage: string): Promise<LLMResponse> {
  // Check for known yield/lending patterns without LLM call to avoid any misclassification
  if (userMessage.toLowerCase().includes('lending') || 
      userMessage.toLowerCase().includes('lend') ||
      userMessage.toLowerCase().includes('yield') ||
      userMessage.toLowerCase().includes('earn') ||
      userMessage.toLowerCase().includes('deposit') ||
      userMessage.toLowerCase().includes('stake') ||
      userMessage.toLowerCase().includes('interest')) {
    
    // Try to extract token symbol directly from user message
    const tokenSymbol = extractTokenSymbolFromYieldQuery(userMessage);
    
    if (tokenSymbol) {
      return {
        intent: "explore_yield",
        token: tokenSymbol,
        message: `Looking up yield options for ${tokenSymbol}...`
      };
    } else {
      // No specific token found, but still a yield query
      return {
        intent: "explore_yield",
        message: "Which token would you like to explore lending options for?"
      };
    }
  }

  const apiKey = process.env.NEXT_PUBLIC_TOGETHER_API_KEY;
  
  if (!apiKey) {
    console.error('Together AI API key is not configured');
    return {
      intent: "out_of_scope",
      message: "The AI service is not properly configured. Please check your environment settings."
    };
  }

  try {
    const response = await fetch('https://api.together.xyz/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.1,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        console.error('Invalid Together AI API key');
        return {
          intent: "out_of_scope",
          message: "The AI service is not properly configured. Please check your API key."
        };
      }
      throw new Error(`Together AI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    try {
      // Try to parse as JSON first
      const parsedResponse = JSON.parse(content);
      if (!parsedResponse.intent || !parsedResponse.message) {
        throw new Error('Invalid response format');
      }
      
      // Double-check yield intent with our keyword check
      if (userMessage.toLowerCase().includes('lending') || 
          userMessage.toLowerCase().includes('lend') ||
          userMessage.toLowerCase().includes('yield') ||
          userMessage.toLowerCase().includes('earn') ||
          userMessage.toLowerCase().includes('deposit') ||
          userMessage.toLowerCase().includes('stake') ||
          userMessage.toLowerCase().includes('interest')) {
        
        // Force yield intent even if LLM didn't catch it
        parsedResponse.intent = "explore_yield";
        
        // Try to extract token if not already present
        if (!parsedResponse.token) {
          const extractedToken = extractTokenSymbolFromYieldQuery(userMessage);
          if (extractedToken) {
            parsedResponse.token = extractedToken;
          }
        }
      }
      
      return parsedResponse;
    } catch (e) {
      // If JSON parsing fails, analyze the text response
      console.log('LLM returned non-JSON response:', content);
      
      // Check if this is a lending/yield query first
      if (userMessage.toLowerCase().includes('lending') || 
          userMessage.toLowerCase().includes('lend') ||
          userMessage.toLowerCase().includes('yield') ||
          userMessage.toLowerCase().includes('earn') ||
          userMessage.toLowerCase().includes('deposit') ||
          userMessage.toLowerCase().includes('stake') ||
          userMessage.toLowerCase().includes('interest')) {
        
        const extractedToken = extractTokenSymbolFromYieldQuery(userMessage);
        return {
          intent: "explore_yield",
          token: extractedToken || undefined,
          message: extractedToken 
            ? `Looking up yield options for ${extractedToken}...` 
            : "Which token would you like to explore lending options for?"
        };
      }
      
      // Then check other intents as fallback
      // Check if the response contains a buy SOL request
      const solMatch = content.match(/buy\s+(\d+(?:\.\d+)?)\s*sol/i);
      if (solMatch) {
        const amount = parseFloat(solMatch[1]);
        return {
          intent: "buy_sol",
          amount: amount,
          currency: "SOL",
          message: content
        };
      }

      // Check if the response contains a buy token request
      const tokenMatch = content.match(/buy\s+(\d+(?:\.\d+)?)\s*(USDC|TRUMP|BONK|PEPE|DOGE|BTC|WALLET|FAME)/i);
      if (tokenMatch) {
        const amount = parseFloat(tokenMatch[1]);
        const token = tokenMatch[2].toUpperCase();
        return {
          intent: "buy_token",
          amount: amount,
          token: token,
          message: content
        };
      }

      // Check for other intents
      if (content.toLowerCase().includes('yield') || 
          content.toLowerCase().includes('earn') || 
          content.toLowerCase().includes('lending') || 
          content.toLowerCase().includes('lend') ||
          content.toLowerCase().includes('deposit') ||
          content.toLowerCase().includes('stake')) {
        // This should never be reached because of our earlier checks
        // But keeping as a safety fallback
        const tokenSymbol = extractTokenSymbolFromYieldQuery(userMessage);
        return {
          intent: "explore_yield",
          token: tokenSymbol || undefined,
          message: tokenSymbol 
            ? `Looking up yield options for ${tokenSymbol}...` 
            : "Which token would you like to explore lending options for?"
        };
      }

      if (content.toLowerCase().includes('portfolio') || content.toLowerCase().includes('balance')) {
        return {
          intent: "view_portfolio",
          message: content
        };
      }

      // Default to out of scope with the original message
      return {
        intent: "out_of_scope",
        message: content
      };
    }
  } catch (error) {
    console.error('Error calling LLM:', error);
    return {
      intent: "out_of_scope",
      message: "I'm having trouble connecting to the AI service. Please try again later."
    };
  }
} 
