/**
 * BirdeyeService.js
 * 
 * Service for fetching token prices from Birdeye API with fallback to Jupiter.
 */

import jupiterService from './JupiterService';
import config from '../../lib/config';

// Base URLs
const BIRDEYE_API_BASE = 'https://public-api.birdeye.so';
const JUPITER_TOKEN_LIST_URL = 'https://token.jup.ag/all';

class BirdeyeService {
  constructor() {
    this.tokenMap = new Map();
    this.initializeTokenMap();
  }

  /**
   * Initialize the token map from Jupiter API
   */
  async initializeTokenMap() {
    try {
      const response = await fetch(JUPITER_TOKEN_LIST_URL);
      if (!response.ok) {
        throw new Error(`Failed to fetch Jupiter token list: ${response.status}`);
      }

      const tokens = await response.json();
      tokens.forEach(token => {
        // Store tokens by symbol (lowercase for case-insensitive lookup)
        if (token.symbol) {
          this.tokenMap.set(token.symbol.toLowerCase(), token);
        }
        // Also store by address for direct lookup
        if (token.address) {
          this.tokenMap.set(token.address, token);
        }
      });

      console.log('[BirdeyeService] Token map initialized with', this.tokenMap.size, 'tokens');
    } catch (error) {
      console.error('[BirdeyeService] Error initializing token map:', error);
    }
  }

  /**
   * Get a token from the token map
   * 
   * @param {string} tokenIdentifier - Token symbol or address
   * @returns {Object|null} - Token data or null if not found
   */
  getToken(tokenIdentifier) {
    // Normalize the identifier (lowercase for symbols)
    const normalizedIdentifier = tokenIdentifier.toLowerCase();
    return this.tokenMap.get(normalizedIdentifier) || null;
  }

  /**
   * Get token price from Birdeye API with fallback to Jupiter
   * 
   * @param {string} tokenIdentifier - Token symbol or address
   * @returns {Promise<{success: boolean, price: number|null, source: string, error: string|null}>}
   */
  async getTokenPrice(tokenIdentifier) {
    try {
      // Check if the tokenIdentifier looks like an address
      const isAddress = tokenIdentifier.length > 30; // Simplified check for Solana address
      
      if (isAddress) {
        // If it's an address, directly query Birdeye without token list check
        console.log(`[BirdeyeService] Directly querying Birdeye for address: ${tokenIdentifier}`);
        const birdeyeResult = await this.getPriceFromBirdeye(tokenIdentifier);
        if (birdeyeResult.success) {
          return birdeyeResult;
        }
        
        // If Birdeye fails and we have the token info, try Jupiter
        const token = this.getToken(tokenIdentifier);
        if (token) {
          console.log(`[BirdeyeService] Birdeye API failed, falling back to Jupiter for ${tokenIdentifier}`);
          return await this.getPriceFromJupiter(token);
        } else {
          return {
            success: false,
            price: null,
            source: null,
            error: `Birdeye failed and token not found in Jupiter list for fallback: ${tokenIdentifier}`
          };
        }
      } else {
        // It's a symbol, try to get the token address first
        const token = this.getToken(tokenIdentifier);
        if (!token) {
          return {
            success: false,
            price: null,
            source: null,
            error: `Token symbol ${tokenIdentifier} not found in token list`
          };
        }
        
        // Try Birdeye API first
        const birdeyeResult = await this.getPriceFromBirdeye(token.address);
        if (birdeyeResult.success) {
          return birdeyeResult;
        }
        
        // If Birdeye fails, fallback to Jupiter
        console.log(`[BirdeyeService] Birdeye API failed, falling back to Jupiter for ${token.symbol}`);
        return await this.getPriceFromJupiter(token);
      }
    } catch (error) {
      console.error('[BirdeyeService] Error getting token price:', error);
      return {
        success: false,
        price: null,
        source: null,
        error: error.message || 'Unknown error fetching token price'
      };
    }
  }

  /**
   * Get token price from Birdeye API
   * 
   * @param {string} tokenAddress - Token address (mint)
   * @returns {Promise<{success: boolean, price: number|null, source: string, error: string|null}>}
   */
  async getPriceFromBirdeye(tokenAddress) {
    try {
      const url = `${BIRDEYE_API_BASE}/defi/price?address=${tokenAddress}`;
      
      // Create headers with API key if available
      const headers = {
        'Content-Type': 'application/json'
      };
      
      if (config.birdeyeApiKey) {
        console.log('[BirdeyeService] Using API key for Birdeye request');
        headers['X-API-KEY'] = config.birdeyeApiKey;
      }
      
      const response = await fetch(url, {
        method: 'GET',
        headers
      });

      if (!response.ok) {
        throw new Error(`Birdeye API responded with status: ${response.status}`);
      }

      const data = await response.json();
      if (data && data.data && data.data.value) {
        return {
          success: true,
          price: data.data.value,
          source: 'birdeye',
          error: null
        };
      }
      
      throw new Error('Invalid response format from Birdeye API');
    } catch (error) {
      console.error('[BirdeyeService] Birdeye API error:', error);
      return {
        success: false,
        price: null,
        source: 'birdeye',
        error: error.message
      };
    }
  }

  /**
   * Get token price by querying Jupiter for a swap quote
   * 
   * @param {Object} token - Token data
   * @returns {Promise<{success: boolean, price: number|null, source: string, error: string|null}>}
   */
  async getPriceFromJupiter(token) {
    try {
      // Use JupiterService to get a quote for this token against USDC
      // This is a simplified approach - in reality, you might use their quote API directly
      const tokenInfo = {
        symbol: token.symbol,
        address: token.address,
        decimals: token.decimals
      };
      
      // Attempt to get a quote from Jupiter
      const result = await jupiterService.getQuote('USDC', tokenInfo.symbol, 1, true);
      
      if (result && result.outAmount) {
        // Convert outAmount to actual token value based on decimals
        const price = parseFloat(result.outAmount) / Math.pow(10, tokenInfo.decimals);
        
        return {
          success: true,
          price,
          source: 'jupiter',
          error: null
        };
      }
      
      throw new Error('Could not determine price from Jupiter swap quote');
    } catch (error) {
      console.error('[BirdeyeService] Jupiter price fallback error:', error);
      return {
        success: false,
        price: null,
        source: 'jupiter',
        error: error.message
      };
    }
  }
}

// Create singleton instance
const birdeyeService = new BirdeyeService();
export default birdeyeService;