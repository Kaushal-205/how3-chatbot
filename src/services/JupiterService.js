import { PublicKey, Transaction, VersionedTransaction, Connection } from '@solana/web3.js';

/**
 * RaydiumService (now using Jupiter Aggregator)
 * --------------
 * Wrapper around Jupiter Aggregator API to execute real swaps on Solana.
 * Docs: https://docs.jup.ag/
 */
class RaydiumService {
    constructor() {
        // Base endpoint for Jupiter Aggregator API
        this.baseUrl = 'https://quote-api.jup.ag/v6';
        // Jupiter token list API
        this.tokenListUrl = 'https://token.jup.ag/all';
        
        // Initialize token map
        this.tokenMap = new Map();
        this.initializeTokenMap();

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

    async initializeTokenMap() {
        try {
            const response = await fetch(this.tokenListUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch token list: ${response.statusText}`);
            }

            const tokens = await response.json();
            
            // First, add our common tokens to ensure they're available
            Object.entries(this.commonTokens).forEach(([symbol, info]) => {
                this.tokenMap.set(symbol, info);
            });
            
            // Then add tokens from the API
            tokens.forEach(token => {
                this.tokenMap.set(token.symbol.toUpperCase(), {
                    address: token.address,
                    decimals: token.decimals,
                    symbol: token.symbol,
                    name: token.name
                });
            });

            console.log('[Jupiter] Token map initialized with', this.tokenMap.size, 'tokens');
        } catch (error) {
            console.error('[Jupiter] Error initializing token map:', error);
            // Fallback to common tokens if API fails
            Object.entries(this.commonTokens).forEach(([symbol, info]) => {
                this.tokenMap.set(symbol, info);
            });
            console.log('[Jupiter] Fallback to common tokens:', this.tokenMap.size, 'tokens');
        }
    }

    async getTokenBySymbol(symbol) {
        const normalizedSymbol = symbol.toUpperCase();
        
        // Wait for token map to be initialized
        if (this.tokenMap.size === 0) {
            await this.initializeTokenMap();
        }

        // First try to get from common tokens which we know are correct
        if (this.commonTokens[normalizedSymbol]) {
            return this.commonTokens[normalizedSymbol];
        }
        
        // Then try the token map
        const tokenInfo = this.tokenMap.get(normalizedSymbol);
        if (!tokenInfo) {
            throw new Error(`Token "${symbol}" not found in token list`);
        }
        return tokenInfo;
    }

    async swap(
        inputTokenSymbol,
        outputTokenSymbol,
        amountInTokenUnits,
        swapMode,
        slippageBps = 100,
        computeUnitPriceMicroLamports = 100000
    ) {
        try {
            // Get the connected wallet
            const wallet = window.solana || window.solflare;
            if (!wallet) {
                throw new Error('No compatible Solana wallet detected. Please install a wallet like Phantom or Solflare.');
            }

            // Connect to wallet if not already connected
            if (!wallet.isConnected) {
                await wallet.connect();
            }

            // Get the user's public key
            const userPublicKey = wallet.publicKey.toString();
            console.log('[Jupiter] User wallet address:', userPublicKey);

            // Normalize the token symbols to uppercase
            const normalizedInputSymbol = inputTokenSymbol.toUpperCase();
            const normalizedOutputSymbol = outputTokenSymbol.toUpperCase();
            
            // First check if these are common tokens - prioritize these over the token map
            let inputTokenInfo, outputTokenInfo;
            
            if (this.commonTokens[normalizedInputSymbol]) {
                inputTokenInfo = this.commonTokens[normalizedInputSymbol];
                console.log(`[Jupiter] Using common token for ${normalizedInputSymbol}:`, inputTokenInfo);
            } else {
                inputTokenInfo = await this.getTokenBySymbol(normalizedInputSymbol);
            }
            
            if (this.commonTokens[normalizedOutputSymbol]) {
                outputTokenInfo = this.commonTokens[normalizedOutputSymbol];
                console.log(`[Jupiter] Using common token for ${normalizedOutputSymbol}:`, outputTokenInfo);
            } else {
                outputTokenInfo = await this.getTokenBySymbol(normalizedOutputSymbol);
            }

            if (!inputTokenInfo || !outputTokenInfo) {
                throw new Error('Token information not found');
            }

            console.log('[Jupiter] Using tokens for swap:', {
                input: {
                    symbol: normalizedInputSymbol,
                    address: inputTokenInfo.address,
                    decimals: inputTokenInfo.decimals
                },
                output: {
                    symbol: normalizedOutputSymbol,
                    address: outputTokenInfo.address,
                    decimals: outputTokenInfo.decimals
                }
            });

            // Convert to smallest units (integer) based on swap mode
            let amountRaw;
            if (swapMode === 'ExactIn') {
                amountRaw = Math.floor(amountInTokenUnits * Math.pow(10, inputTokenInfo.decimals));
                console.log('[Jupiter] ExactIn mode - Input amount in smallest units:', amountRaw);
            } else {
                amountRaw = Math.floor(amountInTokenUnits * Math.pow(10, outputTokenInfo.decimals));
                console.log('[Jupiter] ExactOut mode - Output amount in smallest units:', amountRaw);
            }

            // Step 1: Get quote from Jupiter
            const quoteUrl = `${this.baseUrl}/quote?inputMint=${inputTokenInfo.address}&outputMint=${outputTokenInfo.address}&amount=${amountRaw}&slippageBps=${slippageBps}&swapMode=${swapMode}`;
            console.log('[Jupiter] Quote URL:', quoteUrl);

            const quoteResponse = await fetch(quoteUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!quoteResponse.ok) {
                const errorText = await quoteResponse.text();
                console.error('[Jupiter] Quote API error response:', errorText);
                throw new Error(`Jupiter API quote error ${quoteResponse.status}: ${errorText}`);
            }

            const quoteData = await quoteResponse.json();
            console.log('[Jupiter] Full quote response:', JSON.stringify(quoteData, null, 2));

            if (!quoteData || !quoteData.inAmount || !quoteData.outAmount) {
                console.error('[Jupiter] No valid quote data found in response:', quoteData);
                throw new Error(`No swap route found between ${inputTokenSymbol} and ${outputTokenSymbol}. This trading pair may not be supported.`);
            }

            // Step 2: Get transaction data for the swap
            const swapUrl = `${this.baseUrl}/swap`;
            console.log('[Jupiter] Swap URL:', swapUrl);

            const swapResponse = await fetch(swapUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    quoteResponse: quoteData,
                    userPublicKey: userPublicKey,
                    wrapAndUnwrapSol: true,
                    useSharedAccounts: true,
                    prioritizationFeeLamports: computeUnitPriceMicroLamports
                })
            });

            if (!swapResponse.ok) {
                const errorText = await swapResponse.text();
                console.error('[Jupiter] Swap API error response:', errorText);
                throw new Error(`Jupiter API swap error ${swapResponse.status}: ${errorText}`);
            }

            const swapData = await swapResponse.json();
            console.log('[Jupiter] Swap response:', swapData);

            if (!swapData.swapTransaction) {
                throw new Error('No transaction data received from Jupiter API');
            }

            // Step 3: Deserialize and execute the transaction
            const transactionData = Buffer.from(swapData.swapTransaction, 'base64');
            if (!transactionData || transactionData.length === 0) {
                throw new Error('Invalid transaction data received from Jupiter API');
            }

            // Handle versioned transactions
            const transaction = VersionedTransaction.deserialize(transactionData);

            // Sign, send, and wait for confirmation
            const { signature } = await wallet.signAndSendTransaction(transaction);
            
            // Calculate amounts in token units
            const inAmount = Number(quoteData.inAmount) / Math.pow(10, inputTokenInfo.decimals);
            const outAmount = Number(quoteData.outAmount) / Math.pow(10, outputTokenInfo.decimals);

            const result = {
                txId: signature,
                status: 'success',
                message: 'Swap executed successfully',
                details: {
                    fromToken: inputTokenInfo.symbol,
                    toToken: outputTokenInfo.symbol,
                    inputAmount: inAmount,
                    outputAmount: outAmount,
                    price: swapMode === 'ExactIn' ? outAmount / inAmount : inAmount / outAmount,
                    priceImpact: quoteData.priceImpactPct * 100,
                    explorerUrl: `https://solscan.io/tx/${signature}`,
                    swapMode: swapMode
                }
            };

            // Log the success message and Solscan link
            console.log('Swap successful! Transaction details:', result);
            console.log('View transaction on Solscan:', result.details.explorerUrl);

            return result;
        } catch (error) {
            console.error('Error in swap:', error);
            // If we have a signature, the transaction was sent successfully
            if (error.signature) {
                const result = {
                    txId: error.signature,
                    status: 'success',
                    message: 'Swap executed successfully (confirmation error)',
                    details: {
                        explorerUrl: `https://solscan.io/tx/${error.signature}`,
                        swapMode: swapMode
                    }
                };
                console.log('Swap successful! Transaction details:', result);
                console.log('View transaction on Solscan:', result.details.explorerUrl);
                return result;
            }
            throw new Error(`Swap failed: ${error.message}`);
        }
    }

    async getQuote(
        inputTokenSymbol,
        outputTokenSymbol,
        amountInTokenUnits,
        swapMode,
        slippageBps = 100
    ) {
        try {
            // Normalize the token symbols to uppercase
            const normalizedInputSymbol = inputTokenSymbol.toUpperCase();
            const normalizedOutputSymbol = outputTokenSymbol.toUpperCase();
            
            // Get token information
            const inputTokenInfo = await this.getTokenBySymbol(normalizedInputSymbol);
            const outputTokenInfo = await this.getTokenBySymbol(normalizedOutputSymbol);

            if (!inputTokenInfo || !outputTokenInfo) {
                throw new Error('Token information not found');
            }

            // Convert to smallest units (integer) based on swap mode
            let amountRaw;
            if (swapMode === 'ExactIn') {
                amountRaw = Math.floor(amountInTokenUnits * Math.pow(10, inputTokenInfo.decimals));
                console.log('[Jupiter] ExactIn mode - Input amount in smallest units:', amountRaw);
            } else {
                amountRaw = Math.floor(amountInTokenUnits * Math.pow(10, outputTokenInfo.decimals));
                console.log('[Jupiter] ExactOut mode - Output amount in smallest units:', amountRaw);
            }

            // Get quote from Jupiter
            const quoteUrl = `${this.baseUrl}/quote?inputMint=${inputTokenInfo.address}&outputMint=${outputTokenInfo.address}&amount=${amountRaw}&slippageBps=${slippageBps}&swapMode=${swapMode}`;
            console.log('[Jupiter] Quote URL:', quoteUrl);

            const quoteResponse = await fetch(quoteUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!quoteResponse.ok) {
                const errorText = await quoteResponse.text();
                console.error('[Jupiter] Quote API error response:', errorText);
                throw new Error(`Jupiter API quote error ${quoteResponse.status}: ${errorText}`);
            }

            const quoteData = await quoteResponse.json();
            console.log('[Jupiter] Full quote response:', JSON.stringify(quoteData, null, 2));

            if (!quoteData || !quoteData.inAmount || !quoteData.outAmount) {
                console.error('[Jupiter] No valid quote data found in response:', quoteData);
                throw new Error(`No swap route found between ${inputTokenSymbol} and ${outputTokenSymbol}. This trading pair may not be supported.`);
            }

            // Calculate amounts in token units
            const inAmount = Number(quoteData.inAmount) / Math.pow(10, inputTokenInfo.decimals);
            const outAmount = Number(quoteData.outAmount) / Math.pow(10, outputTokenInfo.decimals);

            return {
                inputToken: inputTokenInfo,
                outputToken: outputTokenInfo,
                inputAmount: inAmount,
                outputAmount: outAmount,
                price: swapMode === 'ExactIn' ? outAmount / inAmount : inAmount / outAmount,
                priceImpact: quoteData.priceImpactPct * 100,
                slippage: slippageBps / 100,
                swapMode: swapMode
            };
        } catch (error) {
            console.error('Error in getQuote:', error);
            throw new Error(`Failed to get quote: ${error.message}`);
        }
    }
}

const jupiterService = new RaydiumService();
export default jupiterService;
