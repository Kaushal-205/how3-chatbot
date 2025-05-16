import jupiterService from './JupiterService';


class AgentService {
  constructor() {
    this.apiKey = process.env.NEXT_PUBLIC_TOGETHERAI_API_KEY;
    this.apiUrl = 'https://api.together.xyz/v1/chat/completions';
    this.conversationContext = new Map();
    this.pendingTransaction = new Map();

    // Predefined list of common tokens with their correct addresses
    this.commonTokens = {
      'SOL': {
        address: 'So11111111111111111111111111111111111111112',
        decimals: 9,
        symbol: 'SOL',
        name: 'Solana'
      },
      'USDC': {
        address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        decimals: 6,
        symbol: 'USDC',
        name: 'USD Coin'
      },
      'USDT': {
        address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
        decimals: 6,
        symbol: 'USDT',
        name: 'Tether USD'
      },
      'BONK': {
        address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
        decimals: 5,
        symbol: 'BONK',
        name: 'Bonk'
      },
      'TRUMP': {
        address: '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN',
        decimals: 6,
        symbol: 'TRUMP',
        name: 'Trump'
      },
      'JUP': {
        address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
        decimals: 6,
        symbol: 'JUP',
        name: 'Jupiter'
      },
      'WIF': {
        address: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fHVF28pd1rPBjay7X',
        decimals: 6,
        symbol: 'WIF',
        name: 'Dogwifhat'
      },
      'BOME': {
        address: 'Gz7VkD4MacbEB6yC5XD3HcumEiYx2EtDYYrMnKNx7JG',
        decimals: 6,
        symbol: 'BOME',
        name: 'Book of Meme'
      },
      'MSOL': {
        address: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
        decimals: 9,
        symbol: 'MSOL',
        name: 'Marinade staked SOL'
      },
      'WBTC': {
        address: '9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E',
        decimals: 6,
        symbol: 'WBTC',
        name: 'Wrapped Bitcoin (Sollet)'
      },
      'WETH': {
        address: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
        decimals: 8,
        symbol: 'WETH',
        name: 'Wrapped Ethereum (Sollet)'
      },
      'PEPE': {
        address: 'FDqp7ioPenKRzQqseFv84kxDMUT83CX1qZxgDTQDkwT2',
        decimals: 6,
        symbol: 'PEPE',
        name: 'Pepe'
      }
    };
  }

  async getTokenSymbol(userInput) {
    try {
      // Normalize input to uppercase for comparison
      const normalizedInput = userInput.toUpperCase();

      // Direct mapping for known tokens to avoid API calls
      const directMappings = {
        // SOL and variations
        'SOL': 'SOL',
        'SOLANA': 'SOL',

        // USDC and variations
        'USDC': 'USDC',
        'USD COIN': 'USDC',
        'USD': 'USDC',
        'DOLLAR': 'USDC',

        // USDT and variations
        'USDT': 'USDT',
        'TETHER': 'USDT',

        // BONK and variations
        'BONK': 'BONK',

        // TRUMP and variations
        'TRUMP': 'TRUMP',
        
        // JUP and variations
        'JUP': 'JUP',
        'JUPITER': 'JUP',
        
        // WIF and variations
        'WIF': 'WIF',
        'DOGWIFHAT': 'WIF',
        
        // BOME and variations
        'BOME': 'BOME',
        'BOOK OF MEME': 'BOME',
        
        // MSOL and variations
        'MSOL': 'MSOL',
        'MARINADE': 'MSOL',
        'MARINADE SOL': 'MSOL',
        'STAKED SOL': 'MSOL',
        
        // WBTC and variations
        'WBTC': 'WBTC',
        'WRAPPED BTC': 'WBTC',
        'WRAPPED BITCOIN': 'WBTC',
        'BITCOIN': 'WBTC',
        'BTC': 'WBTC',
        
        // WETH and variations
        'WETH': 'WETH',
        'WRAPPED ETH': 'WETH',
        'WRAPPED ETHEREUM': 'WETH',
        'ETHEREUM': 'WETH',
        'ETH': 'WETH',
        
        // PEPE and variations
        'PEPE': 'PEPE'
      };

      // Check if we have a direct mapping
      if (directMappings[normalizedInput]) {
        return directMappings[normalizedInput];
      }

      // Check if the input exactly matches a key in commonTokens
      if (this.commonTokens[normalizedInput]) {
        return normalizedInput;
      }

      // If not found in direct mappings, use the LLM to identify the token
      const prompt = `
      You are a helpful assistant that understands cryptocurrency tokens and their variations.
      
      For the token symbol or name "${userInput}", please identify the correct token symbol from the following list:
      - SOL (Solana)
      - USDC (USD Coin)
      - USDT (Tether USD)
      - BONK (Bonk)
      - TRUMP (Trump)
      - JUP (Jupiter)
      - WIF (Dogwifhat)
      - BOME (Book of Meme)
      - MSOL (Marinade staked SOL)
      - WBTC (Wrapped Bitcoin)
      - WETH (Wrapped Ethereum)
      - PEPE (Pepe)
      
      Return your answer in JSON format:
      {
        "symbol": "the standardized token symbol",
        "confidence": "high/medium/low",
        "reason": "brief explanation of why this is the correct token"
      }
      
      If the token is not in the list, return:
      {
        "symbol": null,
        "confidence": "low",
        "reason": "Token not found in supported list"
      }
      `;

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
          messages: [{ role: "user", content: prompt }],
          max_tokens: 200,
          temperature: 0.3,
          response_format: { type: "json_object" }
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = await response.json();
      const tokenInfo = JSON.parse(data.choices[0].message.content);

      if (!tokenInfo.symbol) {
        throw new Error(`Token "${userInput}" not found in supported list`);
      }

      return tokenInfo.symbol;
    } catch (error) {
      console.error('Error in getTokenSymbol:', error);
      throw error;
    }
  }

  async processUserRequest(userMessage, walletAddress) {
    try {
      // Get or initialize conversation context
      const context = this.conversationContext.get(walletAddress) || {
        fromToken: null,
        toToken: null,
        amount: null
      };

      const prompt = `
      You are a Solana trading intent analyzer. Analyze the user's message and extract trading intent.
      
      User message: "${userMessage}"
      
      Extract the following information:
      1. The token they want to trade from (fromToken)
      2. The token they want to trade to (toToken)
      3. The amount they want to trade (amount)
      
      If the user doesn't specify which token to use for trading, assume they want to use SOL.
      If the user doesn't specify an amount, set it to null.
      
      Respond in JSON format:
      {
        "fromToken": "token_symbol_or_name" | null,
        "toToken": "token_symbol_or_name" | null,
        "amount": number | null,
        "message": "brief response",
        "isComplete": boolean
      }
      
      Set isComplete to true if you have all three pieces of information.
      If any information is missing, set isComplete to false and include a message asking for the missing information.
      `;

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
          messages: [{ role: "user", content: prompt }],
          max_tokens: 200,
          temperature: 0.3,
          response_format: { type: "json_object" }
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = await response.json();
      const intentData = JSON.parse(data.choices[0].message.content);

      // Update context with new information
      Object.assign(context, intentData);
      this.conversationContext.set(walletAddress, context);

      if (intentData.isComplete) {
        try {
          // Default to SOL if fromToken is not specified
          const fromToken = intentData.fromToken || 'SOL';

          // Get standardized token symbols from LLM
          const fromTokenSymbol = await this.getTokenSymbol(fromToken);
          const toTokenSymbol = await this.getTokenSymbol(intentData.toToken);

          console.log('Token symbols extracted:', { fromTokenSymbol, toTokenSymbol });

          // Check if tokens are in our supported list
          if (!this.commonTokens[fromTokenSymbol]) {
            return {
              type: 'error',
              message: `Sorry, the token '${fromTokenSymbol}' is not supported for trading at this time.`
            };
          }

          if (!this.commonTokens[toTokenSymbol]) {
            return {
              type: 'error',
              message: `Sorry, the token '${toTokenSymbol}' is not supported for trading at this time.`
            };
          }

          // Check if we're trying to swap the same token
          if (fromTokenSymbol === toTokenSymbol) {
            return {
              type: 'error',
              message: `Cannot swap ${fromTokenSymbol} to itself. Please choose different tokens.`
            };
          }

          // Validate amount is a positive number
          if (!intentData.amount || intentData.amount <= 0) {
            return {
              type: 'error',
              message: 'Please specify a valid positive amount to swap.'
            };
          }

          console.log('Initiating swap with tokens:', {
            from: {
              symbol: fromTokenSymbol,
              address: this.commonTokens[fromTokenSymbol].address
            },
            to: {
              symbol: toTokenSymbol,
              address: this.commonTokens[toTokenSymbol].address
            },
            amount: intentData.amount
          });

          // Execute the swap directly
          const result = await jupiterService.swap(
            fromTokenSymbol,
            toTokenSymbol,
            intentData.amount,
            'ExactIn'
          );

          // Check if this was a simulated swap (demo mode)
          if (result.details.demoMode) {
            return {
              type: 'success',
              message: `DEMO MODE: Swap simulated! You would swap ${result.details.inputAmount} ${result.details.fromToken} for approximately ${result.details.outputAmount} ${result.details.toToken}. (No actual transaction was executed)`,
              transaction: result
            };
          }

          return {
            type: 'success',
            message: `Swap executed successfully! You swapped ${result.details.inputAmount} ${result.details.fromToken} for ${result.details.outputAmount} ${result.details.toToken}. Transaction ID: ${result.txId}`,
            transaction: result
          };
        } catch (error) {
          console.error('Error processing swap:', error);

          // Provide a more user-friendly error message based on the error
          let errorMessage = `Failed to execute swap: ${error.message}`;

          // Reset the conversation context on error so user can try again
          this.conversationContext.delete(walletAddress);

          return {
            type: 'error',
            message: errorMessage
          };
        }
      } else {
        return {
          type: 'incomplete',
          message: intentData.message
        };
      }
    } catch (error) {
      console.error('Error processing user request:', error);
      return {
        type: 'error',
        message: `Error processing request: ${error.message}`
      };
    }
  }
}

const agentService = new AgentService();
export default agentService; 
