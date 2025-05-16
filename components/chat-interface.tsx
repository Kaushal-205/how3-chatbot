"use client"
import { useRef, useEffect, useState } from "react"
import { Connection, clusterApiUrl, PublicKey, VersionedTransaction } from "@solana/web3.js"
import { cn } from "@/lib/utils"
import tokenList from '../token.json'
import config from '../lib/config'
import { getAlchemyConnection, processLLMResponse, generateMessageId, extractTokenSymbolFromYieldQuery } from './chat/utils'
import { submitSolendLend } from './chat/solend-service'
import {
  useChatState,
  useWalletState,
  useOnrampState,
  useJupiterState,
  // useRaydiumState,
  useLendingState,
  usePassiveIncomeState,
  useLendingOptions
} from './chat/hooks'
import { ChatMessage } from './chat/ChatMessage'
import { QuoteWidget } from './chat/QuoteWidget'
import { SwapWidget } from './chat/SwapWidget'
import { SolendPoolsWidget } from './chat/SolendPoolsWidget'
import { LendingConfirmWidget } from './chat/LendingConfirmWidget'
import { ChatInputArea } from './chat/ChatInputArea'
import { SolendPool, Message } from './chat/types'

export default function ChatInterface() {
  // Use the custom hooks to manage state
  const {
    messages,
    setMessages,
    input,
    setInput,
    isTyping,
    setIsTyping
  } = useChatState();

  // Reference to track processed transaction signatures to avoid duplicates
  const processedTransactions = useRef<Set<string>>(new Set());

  const {
    connected,
    publicKey,
    sendTransaction,
    signTransaction,
    isAuthenticated,
    walletAddress,
    privySendTransaction,
    activeWalletAddress,
    isWalletConnected
  } = useWalletState();
  const {
    isProcessing: isProcessingBuy,
    currentQuote,
    error: onrampError,
    getQuote,
    confirmPurchase,
    cancelPurchase,
    handleSuccess,
    handleCancel,
    proceedToCheckout
  } = useOnrampState();

  // // Use Raydium for devnet swaps instead of Jupiter
  // const {
  //   isLoading: isLoadingSwap,
  //   orderResponse: raydiumOrder,
  //   swapResult,
  //   error: raydiumError,
  //   getOrder: getRaydiumOrder,
  //   executeSwap,
  //   clearOrder: clearRaydiumOrder,
  //   clearResult: clearResult,
  //   swapQuoteWidget,
  //   setSwapQuoteWidget,
  //   isSwapProcessing,
  //   setIsSwapProcessing
  // } = useRaydiumState();

  const {
    solendPools,
    setSolendPools,
    lendingToken,
    setLendingToken,
    lendingAmount,
    setLendingAmount,
    selectedPool,
    setSelectedPool,
    showLendingConfirm,
    setShowLendingConfirm
  } = useLendingState();

  const {
    passiveIncomeMessageId,
    setPassiveIncomeMessageId,
    passiveIncomeHandlers,
    setPassiveIncomeHandlers
  } = usePassiveIncomeState();

  const { showLendingOptions } = useLendingOptions(
    setMessages,
    setLendingToken,
    setSolendPools
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    isLoading: isLoadingSwap,
    orderResponse: jupiterOrder,
    swapResult,
    error: jupiterError,
    getOrder: getJupiterOrder,
    executeSwap: executeJupiterSwap,
    clearOrder: clearJupiterOrder,
    clearResult: clearJupiterSwapResult,
  } = useJupiterState();

  const [swapQuoteWidget, setSwapQuoteWidget] = useState<any>(null); // Added for Jupiter
  const [isSwapProcessing, setIsSwapProcessing] = useState<boolean>(false); // Added for Jupiter

  // Token interface matching the expected structure
  interface TokenInfo {
    name: string;
    symbol: string;
    address: string;
    decimals: number;
    logoURI?: string;
  }

  // Helper function to find token by name or symbol
  const findToken = async (tokenName: string): Promise<TokenInfo | undefined> => {
    const normalizedTokenName = tokenName.toLowerCase();
    
    // First try the local token list
    const localToken = tokenList.find(token =>
      token.symbol.toLowerCase() === normalizedTokenName ||
      token.name.toLowerCase().includes(normalizedTokenName)
    );
    
    if (localToken) {
      return localToken as TokenInfo;
    }
    
    // If not found in local list, try the BirdeyeService which uses Jupiter tokens
    try {
      const birdeyeService = (await import('@/src/services/BirdeyeService')).default;
      const token = birdeyeService.getToken(normalizedTokenName);
      
      if (token) {
        // Convert to the format expected by the app
        const tokenInfo: TokenInfo = {
          name: String(token.name || ''),
          symbol: String(token.symbol || ''),
          address: String(token.address || ''),
          decimals: Number(token.decimals || 0),
          logoURI: token.logoURI ? String(token.logoURI) : undefined
        };
        return tokenInfo;
      }
    } catch (error) {
      console.error('[findToken] Error looking up token in BirdeyeService:', error);
    }
    
    // Not found in either source
    return undefined;
  };

  // Function to handle passive income prompt
  const handlePassiveIncomePrompt = async (tokenSymbol: string) => {
    // Find token in the token list to get both symbol and mint
    const token = await findToken(tokenSymbol);
    if (!token || !token.address) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `I couldn't find details for ${tokenSymbol} in our supported tokens list.`,
        messageId: generateMessageId()
      }]);
      return;
    }

    const promptMsgId = generateMessageId();
    setMessages(prev => [...prev, {
      role: "assistant",
      content: `Would you like to earn passive income with your ${token.symbol}? I can show you some safe lending options.`,
      messageId: promptMsgId
    }]);

    // Create a promise that resolves when user clicks a button
    return new Promise<boolean>((resolve) => {
      const handleConfirm = () => {
        // First remove the passive income handlers to prevent duplicate triggers
        setPassiveIncomeHandlers(null);

        // Also clear the passive income message ID to prevent rendering options
        setPassiveIncomeMessageId(null);

        // Remove the option buttons by updating the message
        setMessages(prev => prev.map(msg =>
          msg.messageId === promptMsgId
            ? { ...msg, options: undefined }
            : msg
        ));

        // Then add user message and resolve
        setMessages(prev => [
          ...prev,
          {
            role: "user",
            content: "Sure, show me lending options",
            messageId: generateMessageId()
          }
        ]);

        resolve(true);

        // Immediately start looking up options with the correct token address
        console.log('Showing lending options for token:', token.symbol, 'address:', token.address);
        showLendingOptions(token.symbol, token.address);
      };

      const handleDecline = () => {
        // First remove the passive income handlers to prevent duplicate triggers
        setPassiveIncomeHandlers(null);

        // Also clear the passive income message ID to prevent rendering options
        setPassiveIncomeMessageId(null);

        // Remove the option buttons by updating the message
        setMessages(prev => prev.map(msg =>
          msg.messageId === promptMsgId
            ? { ...msg, options: undefined }
            : msg
        ));

        // Then add user message and resolve
        setMessages(prev => [
          ...prev,
          {
            role: "user",
            content: "I'm okay, thanks",
            messageId: generateMessageId()
          }
        ]);

        resolve(false);

        setMessages(prev => [...prev, {
          role: "assistant",
          content: "No problem! You can always check lending options later by asking me about yield opportunities.",
          messageId: generateMessageId()
        }]);
      };

      setPassiveIncomeHandlers({ onConfirm: handleConfirm, onDecline: handleDecline });
      setPassiveIncomeMessageId(promptMsgId);

      // Add options to the prompt message
      setMessages(prev => prev.map(msg =>
        msg.messageId === promptMsgId
          ? {
            ...msg,
            passiveIncomeOptions: [
              {
                'choice': 'Sure',
                'action': 'showLendingOptions'
              },
              {
                'choice': 'I\'m okay, thanks',
                'action': ''
              }
            ]
          }
          : msg
      ));
    });
  };

  // Update the effect to handle URL parameters and listen for payment messages
  useEffect(() => {
    // Handle URL parameters
    const searchParams = new URLSearchParams(window.location.search);
    const status = searchParams.get('status');
    const sessionId = searchParams.get('session_id');
    const walletParam = searchParams.get('wallet');
    const amountParam = searchParams.get('amount');
    const success = searchParams.get('success') === 'true';

    // Handle payment message from payment window
    const handlePaymentMessage = async (event: MessageEvent) => {
      if (event.data && typeof event.data === 'object' && event.data.type === 'PAYMENT_COMPLETE') {
        console.log('Received payment complete message:', event.data);
        const { 
          walletAddress, sessionId, amount, isTokenSwap, tokenSymbol, tokenAddress, tokenAmount } = event.data;
        
        // Add loading message with spinner
        const loadingMsgId = generateMessageId();
        
        // Different message based on if it's a token swap or direct SOL purchase
        if (isTokenSwap) {
          setMessages(prev => [...prev, {
            role: "assistant",
            content: `<div class="flex items-center gap-2"><span>Processing your payment and swapping ${amount || 0.1} SOL to ${tokenAmount} ${tokenSymbol}</span><div class="ml-2 h-4 w-4 animate-spin rounded-full border-2 border-solid border-brand-purple border-t-transparent"></div></div>`,
            messageId: loadingMsgId
          }]);
        } else {
          setMessages(prev => [...prev, {
            role: "assistant",
            content: `<div class="flex items-center gap-2"><span>Processing your payment and sending ${amount || 0.1} SOL to your wallet</span><div class="ml-2 h-4 w-4 animate-spin rounded-full border-2 border-solid border-brand-purple border-t-transparent"></div></div>`,
            messageId: loadingMsgId
          }]);
        }
        
        // Get the wallet address to use
        const targetWalletAddress = walletAddress || walletParam || activeWalletAddress;
        
        
        if (!targetWalletAddress) {
          setMessages(prev => prev.map(msg => 
            msg.messageId === loadingMsgId 
              ? {...msg, content: "Error: Could not determine your wallet address. Please connect your wallet and try again."} 
              : msg
          ));
          return;
        }
        
        try {
          // Handle differently based on whether it's a token swap or direct SOL purchase
          if (isTokenSwap) {
            // For token swap, call the swap-tokens endpoint
            console.log('Calling API: /api/swap-tokens');
            const swapResponse = await fetch(`${config.apiUrl}/api/swap-tokens`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                walletAddress: targetWalletAddress,
                sessionId,
                toToken: tokenAddress,
                amount: parseFloat(amount) || 0.1,
              }),
            });
            
            console.log('Swap response status:', swapResponse.status);
            
            if (!swapResponse.ok) {
              const errorText = await swapResponse.text();
              console.error('Swap API error:', errorText);
              
              setMessages((prev: Message[]) => prev.map((msg: Message) => 
                msg.messageId === loadingMsgId 
                  ? {
                      ...msg, 
                      content: `Error preparing swap transaction: ${errorText || 'Unknown server error'}`
                    } 
                  : msg
              ));
              return;
            }
            
            const swapResult = await swapResponse.json();
            console.log('Swap result:', swapResult);
            
            if (swapResult.status === 'success' || swapResult.status === 'pending') {
              // Update message with transaction details
              setMessages((prev: Message[]) => prev.map((msg: Message) => 
                msg.messageId === loadingMsgId 
                  ? {
                      ...msg, 
                      content: `${swapResult.message}\n\nTransactions:\n${swapResult.transactions.map((tx: any) => 
                        `- ${tx.description}: [View](${tx.explorerLink})`
                      ).join('\n')}`
                    }
                  : msg
              ));
              
              // Clear any loading states
              setIsSwapProcessing(false);
              setSwapQuoteWidget(null);
              
              // Offer passive income options after short delay
              setTimeout(() => {
                handlePassiveIncomePrompt(tokenSymbol);
              }, 1000);
            } else {
              // Update with error message
              setMessages((prev: Message[]) => prev.map((msg: Message) => 
                msg.messageId === loadingMsgId 
                  ? {...msg, content: `Error processing token swap: ${swapResult.error || 'Unknown error'}`} 
                  : msg
              ));
              
              // Clear loading states on error
              setIsSwapProcessing(false);
              setSwapQuoteWidget(null);
            }
          } else {
            // For direct SOL purchase, call the transfer-sol endpoint
            console.log('Calling API: /api/transfer-sol');
            const transferResponse = await fetch(`${config.apiUrl}/api/transfer-sol`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                walletAddress: targetWalletAddress,
                amount: parseFloat(amount) || 0.1,
                sessionId,
              }),
            });
            
            if (!transferResponse.ok) {
              const errorText = await transferResponse.text();
              console.error('Transfer API error:', errorText);
              
              setMessages((prev: Message[]) => prev.map((msg: Message) => 
                msg.messageId === loadingMsgId 
                  ? {
                      ...msg, 
                      content: `Error preparing transfer: ${errorText || 'Unknown server error'}`
                    } 
                  : msg
              ));
              return;
            }
            
            const transferResult = await transferResponse.json();
            console.log('Transfer result:', transferResult);
            
            if (transferResult.status === 'success') {
              // Update message with transaction details
              setMessages((prev: Message[]) => prev.map((msg: Message) => 
                msg.messageId === loadingMsgId 
                  ? {
                      ...msg, 
                      content: `Successfully sent ${amount} SOL to your wallet! [View transaction](${transferResult.explorerLink})`
                    }
                  : msg
              ));

              // Add this to show passive income options for SOL
              setTimeout(() => {
                handlePassiveIncomePrompt("SOL");
              }, 1000);
            } else {
              // Update with error message
              setMessages((prev: Message[]) => prev.map((msg: Message) => 
                msg.messageId === loadingMsgId 
                  ? {...msg, content: `Error processing transfer: ${transferResult.error || 'Unknown error'}`} 
                  : msg
              ));
            }
          }
        } catch (error) {
          console.error('Error during transfer:', error);
          setMessages((prev: Message[]) => prev.map((msg: Message) => 
            msg.messageId === loadingMsgId 
              ? {...msg, content: `Error processing your payment: ${error instanceof Error ? error.message : 'Unknown error'}`} 
              : msg
          ));
        }
      }
    };
    
    // Process direct URL success
    if (success && sessionId) {
      // If we reached here from a frontend redirect, we need to redirect to backend
      const backendUrl = `${config.apiUrl}/payment-success?amount=${amountParam}&wallet=${walletParam}&success=true&session_id=${sessionId}`;
      window.location.href = backendUrl;
      return;
    }
    // Handle cancellation
    else if (status === 'cancel' || searchParams.get('canceled') === 'true') {
      window.history.replaceState({}, '', '/chat');
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Your payment was cancelled. Would you like to try again?",
        messageId: generateMessageId()
      }]);
    }
    
    // Add event listener for messages
    window.addEventListener('message', handlePaymentMessage);
    
    // Clean up
    return () => {
      window.removeEventListener('message', handlePaymentMessage);
    };
  }, [handleSuccess, handleCancel, walletAddress, publicKey, activeWalletAddress, setMessages, generateMessageId, handlePassiveIncomePrompt]);

  // Updated effect to handle swap result with proper passive income flow
  useEffect(() => {
    if (swapResult && swapResult.signature) {
      // Check if we've already processed this transaction
      if (processedTransactions.current.has(swapResult.signature)) {
        console.log("Already processed transaction:", swapResult.signature);
        return;
      }

      if (swapResult.status === 'Success') {
        // Add to our processed set to avoid duplicates
        processedTransactions.current.add(swapResult.signature);

        const successMsgId = generateMessageId();
        setMessages(prev => [...prev, {
          role: "assistant",
          content: `Your token swap was successful! [View transaction](https://solscan.io/tx/${swapResult.signature})`,
          messageId: successMsgId
        }]);

        // If this was a token purchase, prompt for passive income options after a short delay
        if (swapQuoteWidget) {
          const tokenSymbol = swapQuoteWidget.outputToken;

          // Clear swap data but keep token info for passive income
          setIsSwapProcessing(false);
          clearJupiterSwapResult();
          setSwapQuoteWidget(null);

          // Wait a moment before showing the passive income prompt
          setTimeout(() => {
            handlePassiveIncomePrompt(tokenSymbol);
          }, 1000);
        }
      } else {
        setMessages(prev => [...prev, {
          role: "assistant",
          content: `Swap failed: ${swapResult.error || 'Unknown error'}`,
          messageId: generateMessageId()
        }]);
        setIsSwapProcessing(false);
        clearJupiterSwapResult();
        setSwapQuoteWidget(null);
      }
    }
  }, [swapResult, clearJupiterSwapResult, setMessages, handlePassiveIncomePrompt, setIsSwapProcessing, setSwapQuoteWidget]);

  // Updated effect to clean up passive income state when not needed
  useEffect(() => {
    // Clean up passive income state when no buttons are displayed
    if (passiveIncomeMessageId && !messages.some(msg => 
      msg.messageId === passiveIncomeMessageId && 
      msg.passiveIncomeOptions && 
      msg.passiveIncomeOptions.length > 0
    )) {
      setPassiveIncomeMessageId(null);
      setPassiveIncomeHandlers(null);
    }
  }, [messages, passiveIncomeMessageId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleBuySol = async (amount: number) => {
    if (!publicKey && !isAuthenticated) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Please connect your Solana wallet first to receive your tokens.",
        messageId: generateMessageId()
      }]);
      return;
    }

    try {
      const loadingMsgId = generateMessageId();
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `Getting current SOL price and preparing payment...`,
        messageId: loadingMsgId
      }]);

      // Pass the specific SOL amount if the user provided one
      const response = await proceedToCheckout({
        solAmount: amount > 0 ? amount : undefined
      });
      
      const solAmount = response.solAmount;
      const fiatAmount = response.fiatAmount;
      const fiatCurrency = response.fiatCurrency;
      const sessionId = response.sessionId;

      // Format currency based on type (USD uses $ prefix, INR uses ₹ prefix)
      const formattedCurrency = fiatCurrency === 'usd' 
        ? `$${fiatAmount.toFixed(2)} USD` 
        : `₹${fiatAmount.toFixed(2)} INR`;

      // Update the loading message with success message including both amounts
      setMessages(prev => prev.map(msg =>
        msg.messageId === loadingMsgId
          ? { ...msg, content: `Opening Stripe payment page. Please complete your purchase of ${formattedCurrency} to receive exactly ${solAmount.toFixed(4)} SOL on Solana Mainnet after the payment is processed.` }
          : msg
      ));

      // Store session ID for potential direct transfer after payment
      if (sessionId) {
        localStorage.setItem('lastPaymentSessionId', sessionId);
        localStorage.setItem('lastPaymentAmount', solAmount.toString());
        localStorage.setItem('lastPaymentWallet', walletAddress || publicKey?.toString() || '');
        localStorage.setItem('paymentTimestamp', Date.now().toString());
      }
    } catch (error) {
      console.error('Error in handleBuySol:', error);
      setMessages(prev => [...prev, {
        role: "assistant",
        content: error instanceof Error
          ? `Error: ${error.message}`
          : "There was an error opening the payment page. Please try again.",
        messageId: generateMessageId()
      }]);
    }
  };

  // Function to handle buying a token with fiat via Stripe checkout
  const handleBuyTokenWithFiat = async (amount: number, tokenName: string) => {
    if (!publicKey && !isAuthenticated) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Please connect your Solana wallet first to receive your tokens.",
        messageId: generateMessageId()
      }]);
      return;
    }

    try {
      const loadingMsgId = generateMessageId();
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `Getting current price for ${amount} ${tokenName} and preparing payment...`,
        messageId: loadingMsgId
      }]);

      // First find the token in our local token list
      const token = await findToken(tokenName);
      if (!token) {
        setMessages(prev => prev.map(msg =>
          msg.messageId === loadingMsgId
            ? { ...msg, content: `Sorry, I couldn't find the token "${tokenName}" in our supported tokens list.` }
            : msg
        ));
        return;
      }

      // Get the token price using BirdeyeService with Jupiter fallback
      console.log('Calling API: Birdeye price API with Jupiter fallback');
      const birdeyeService = (await import('@/src/services/BirdeyeService')).default;
      const priceResult = await birdeyeService.getTokenPrice(token.address);
      
      if (!priceResult.success || !priceResult.price) {
        // If both Birdeye and Jupiter failed, show error
        console.error('Error fetching token price:', priceResult.error);
        setMessages(prev => prev.map(msg =>
          msg.messageId === loadingMsgId
            ? { ...msg, content: `Sorry, I couldn't fetch the current price for ${tokenName}. Please try again later.` }
            : msg
        ));
        return;
      }
      
      // Use the price from Birdeye or Jupiter
      console.log(`Got token price from ${priceResult.source}: ${priceResult.price}`);
      const tokenPrice = priceResult.price;

      // Calculate the dollar amount needed for the desired token amount
      const dollarAmount = amount * tokenPrice;
      
      console.log('Price calculation:', {
        tokenName,
        tokenPrice,
        dollarAmount,
        tokenAmount: amount,
        tokenAddress: token.address
      });
      
      // Check if the purchase amount is too small (less than $0.5)
      if (dollarAmount < 0.5) {
        const minTokenAmount = Math.ceil((0.5 / tokenPrice) * 100) / 100; // Round up to 2 decimal places
        setMessages(prev => prev.map(msg =>
          msg.messageId === loadingMsgId
            ? { ...msg, content: `The amount is too small. Please buy at least ${minTokenAmount} ${token.symbol} (minimum $0.50) to proceed.` }
            : msg
        ));
        return;
      }
      
      // Now create the Stripe checkout session for the token purchase
      const checkoutParams = {
        dollarAmount: dollarAmount,
        tokenSymbol: token.symbol,
        tokenAddress: token.address,
        tokenAmount: amount
      };
      
      console.log('Proceeding to checkout with:', checkoutParams);
      
      const response = await proceedToCheckout(checkoutParams);
      
      // Verify the response indicates this is a token swap
      if (!response.isTokenSwap) {
        console.error('Backend did not recognize this as a token swap:', response);
        setMessages(prev => prev.map(msg =>
          msg.messageId === loadingMsgId
            ? { ...msg, content: `Error: The backend did not recognize this as a token purchase. Please try again or contact support.` }
            : msg
        ));
        return;
      }
      
      // Update the loading message with success message
      setMessages(prev => prev.map(msg =>
        msg.messageId === loadingMsgId
          ? { ...msg, content: `Opening Stripe payment page. Please complete your purchase of $${dollarAmount.toFixed(2)} to receive ${amount} ${token.symbol} tokens.` }
          : msg
      ));
    } catch (error) {
      console.error('Error in handleBuyTokenWithFiat:', error);
      setMessages(prev => [...prev, {
        role: "assistant",
        content: error instanceof Error
          ? `Error: ${error.message}`
          : "There was an error opening the payment page. Please try again.",
        messageId: generateMessageId()
      }]);
    }
  };

  // Function to handle buying a token with Raydium
  const handleBuyToken = async (amount: number, tokenName: string) => {
    if (!publicKey && !isAuthenticated) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Please connect your Solana wallet first to receive your tokens.",
        messageId: generateMessageId()
      }]);
      return;
    }

    // Find token in the token list
    const token = await findToken(tokenName);
    if (!token) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `Sorry, I couldn't find the token "${tokenName}" in our supported tokens list.`,
        messageId: generateMessageId()
      }]);
      return;
    }

    try {
      const loadingMsgId = generateMessageId();
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `Preparing to buy ${amount} ${token.symbol}...`,
        messageId: loadingMsgId
      }]);

      // Instead of getting a Jupiter quote, directly proceed to buy with fiat
      await handleBuyTokenWithFiat(amount, tokenName);
      
      // Update the loading message
      setMessages(prev => prev.map(msg =>
        msg.messageId === loadingMsgId
          ? { ...msg, content: `Redirecting to payment page to buy ${amount} ${token.symbol}` }
          : msg
      ));
    } catch (error) {
      console.error('Error handling buy token:', error);
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        messageId: generateMessageId()
      }]);
    }
  };

  // Update the handleConfirmSwap function to bypass Jupiter
  const handleConfirmSwap = async () => {
    if (!swapQuoteWidget) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "There was an error with the swap. Please try again.",
        messageId: generateMessageId()
      }]);
      return;
    }

    try {
      // Use the token and amount from swapQuoteWidget
      const { outputToken, outputAmount } = swapQuoteWidget;
      
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `Redirecting to payment page to buy ${outputAmount} ${outputToken}...`,
        messageId: generateMessageId()
      }]);
      
      // Process the purchase with fiat instead of executing a swap
      await handleBuyTokenWithFiat(outputAmount, outputToken);
      
      // Clear swap state
      setIsSwapProcessing(false);
      setSwapQuoteWidget(null);
      clearJupiterOrder();
      clearJupiterSwapResult();
    } catch (error) {
      console.error('Error confirming swap:', error);
      setMessages(prev => [...prev, {
        role: "assistant",
        content: error instanceof Error
          ? `Error with purchase: ${error.message}`
          : "There was an error processing your purchase. Please try again.",
        messageId: generateMessageId()
      }]);
      
      // Clear swap state
      setIsSwapProcessing(false);
      setSwapQuoteWidget(null);
      clearJupiterOrder();
      clearJupiterSwapResult();
    }
  };

  // Function to handle swap cancellation
  const handleCancelSwap = () => {
    clearJupiterOrder();
    setSwapQuoteWidget(null);
    setMessages(prev => [...prev, {
      role: "assistant",
      content: "Purchase cancelled. Would you like to try a different amount?",
      messageId: generateMessageId()
    }]);
  };

  const handleConfirmPurchase = async () => {
    try {
      const response = await proceedToCheckout();
      const solAmount = response.solAmount;
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `Opening Stripe payment page. Please complete your purchase there. You'll receive ${solAmount.toFixed(4)} SOL on Solana Mainnet after the payment is processed.`,
        messageId: generateMessageId()
      }]);
    } catch (error) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Sorry, there was an error opening the payment page. Please try again.",
        messageId: generateMessageId()
      }]);
    }
  };

  const handleCancelPurchase = () => {
    cancelPurchase();
    setMessages(prev => [...prev, {
      role: "assistant",
      content: "Purchase cancelled. Would you like to try a different amount?",
      messageId: generateMessageId()
    }]);
  };

  const handleLendingAmount = (amount: number, pool: SolendPool) => {
    setLendingAmount(amount);
    setSelectedPool(pool);
    setShowLendingConfirm(true);
  };

  const handleLendNow = async () => {
    // Hide lending options UI immediately when the user clicks "Lend Now"
    setShowLendingConfirm(false);
    setSolendPools(null); // Hide the pools UI immediately

    // Add debugging to see what values we have
    console.log('handleLendNow called with these values:');
    console.log('lendingAmount:', lendingAmount);
    console.log('lendingToken:', lendingToken);
    console.log('selectedPool:', selectedPool);
    console.log('publicKey:', publicKey?.toString());
    console.log('isAuthenticated:', isAuthenticated);
    console.log('walletAddress:', walletAddress);

    // Add a message with loading indicator
    const lendingMsgId = generateMessageId();
    setMessages(prev => [...prev, {
      role: "assistant",
      content: `<div class='flex items-center gap-2'><span>Processing your lending request of ${lendingAmount} ${lendingToken?.symbol} at ${selectedPool?.apy}% APY</span><span class='animate-pulse'>...</span><div class='ml-2 h-4 w-4 animate-spin rounded-full border-2 border-solid border-brand-purple border-t-transparent'></div></div>`,
      messageId: lendingMsgId
    }]);

    try {
      // Check each value individually for better error reporting
      if (!selectedPool) {
        console.error('Missing selectedPool');
        throw new Error('Missing selectedPool - Please select a lending pool');
      }

      if (!publicKey && !walletAddress) {
        console.error('Missing publicKey/walletAddress');
        throw new Error('Missing wallet address - Please connect your wallet');
      }

      if (!lendingAmount || lendingAmount <= 0) {
        console.error('Invalid lendingAmount:', lendingAmount);
        throw new Error('Please enter a valid amount to lend');
      }

      // Use either Privy wallet address or Solana wallet public key
      const userPublicKey = walletAddress || publicKey?.toString();

      // Update the message to inform user to approve the transaction
      setMessages(prev => prev.map(msg =>
        msg.messageId === lendingMsgId
          ? { 
              ...msg, 
              content: `<div class='flex items-center gap-2'><span>Please approve the transaction in your wallet</span><span class='animate-pulse'>...</span><div class='ml-2 h-4 w-4 animate-spin rounded-full border-2 border-solid border-brand-purple border-t-transparent'></div></div>` 
            }
          : msg
      ));

      // Create a callback for sending the transaction based on available wallet
      const sendTx = async (transaction: VersionedTransaction): Promise<string> => {
        const connection = getAlchemyConnection();

        if (isAuthenticated && privySendTransaction) {
          return await privySendTransaction(transaction, connection);
        } else if (connected && publicKey && sendTransaction) {
          return await sendTransaction(transaction, connection);
        } else {
          throw new Error("No wallet available to send transaction");
        }
      };

      // Update the message to show transaction is processing
      setMessages(prev => prev.map(msg =>
        msg.messageId === lendingMsgId
          ? { 
              ...msg, 
              content: `<div class='flex items-center gap-2'><span>Processing your transaction</span><span class='animate-pulse'>...</span><div class='ml-2 h-4 w-4 animate-spin rounded-full border-2 border-solid border-brand-purple border-t-transparent'></div></div>` 
            }
          : msg
      ));

      // Use the extracted service function to handle the lending logic
      const signature = await submitSolendLend(
        selectedPool.pool,
        lendingAmount,
        userPublicKey!,
        sendTx
      );

      // Update the loading message with success and a link to the transaction
      setMessages(prev => prev.map(msg =>
        msg.messageId === lendingMsgId
          ? { 
              ...msg, 
              content: `Successfully lent ${lendingAmount} ${lendingToken?.symbol} on Solend! [View transaction](https://solscan.io/tx/${signature}). You are now earning ${selectedPool.apy}% APY.` 
            }
          : msg
      ));
    } catch (e) {
      console.error('Lending error:', e);
      
      // Update the loading message with the error
      setMessages(prev => prev.map(msg =>
        msg.messageId === lendingMsgId
          ? { 
              ...msg, 
              content: `Lending failed: ${e instanceof Error ? e.message : 'Unknown error'}` 
            }
          : msg
      ));
    } finally {
      // Clear all lending-related state
      setLendingAmount(null);
      setSelectedPool(null);
      setSolendPools(null);
      setLendingToken(null);
      setShowLendingConfirm(false);
    }
  };

  const handleQuickAction = (action: string) => {
    setInput(action);
    handleSend();
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = input;
    setInput("");
    setMessages(prev => [...prev, {
      role: "user",
      content: userMessage,
      messageId: generateMessageId()
    }]);
    setIsTyping(true);

    try {
      const llmResponse = await processLLMResponse(userMessage);

      // Handle different intents
      switch (llmResponse.intent) {
        case "buy_sol":
          if (llmResponse.amount && llmResponse.amount > 0) {
            await handleBuySol(llmResponse.amount);
          } else {
            setMessages(prev => [...prev, {
              role: "assistant",
              content: "Please specify a valid amount of SOL to buy.",
              messageId: generateMessageId()
            }]);
          }
          break;

        case "buy_token":
          if (llmResponse.amount && llmResponse.amount > 0 && llmResponse.token) {
            await handleBuyToken(llmResponse.amount, llmResponse.token);
          } else {
            setMessages(prev => [...prev, {
              role: "assistant",
              content: "Please specify a valid amount and token to buy.",
              messageId: generateMessageId()
            }]);
          }
          break;

        // Handling string literal for buy_token_fiat
        case "buy_token_fiat" as any:
          if (llmResponse.amount && llmResponse.amount > 0 && llmResponse.token) {
            await handleBuyTokenWithFiat(llmResponse.amount, llmResponse.token);
          } else {
            setMessages(prev => [...prev, {
              role: "assistant",
              content: "Please specify a valid amount and token to buy.",
              messageId: generateMessageId()
            }]);
          }
          break;

        case "explore_yield": {
          // Try to extract token symbol from user message
          let tokenSymbol = llmResponse.token;
          if (!tokenSymbol) {
            tokenSymbol = extractTokenSymbolFromYieldQuery(userMessage) || undefined;
          }

          if (tokenSymbol) {
            // Find token mint from tokenList
            const token = tokenList.find(t => t.symbol.toUpperCase() === tokenSymbol.toUpperCase());
            if (token) {
              const loadingMsgId = generateMessageId();
              setMessages(prev => [...prev, {
                role: "assistant",
                content: `Looking up yield options for ${token.symbol}...`,
                messageId: loadingMsgId
              }]);

              // Use the showLendingOptions function
              showLendingOptions(token.symbol, token.address);
            } else {
              setMessages(prev => [...prev, {
                role: "assistant",
                content: `Token ${tokenSymbol} not found in supported list.`,
                messageId: generateMessageId()
              }]);
            }
          } else {
            // If no specific token is mentioned, show a list of supported tokens
            setMessages(prev => [...prev, {
              role: "assistant",
              content: "Which token would you like to explore lending options for? Here are the supported tokens:",
              messageId: generateMessageId(),
              options: tokenList.map(token => ({
                platform: token.symbol,
                type: "lend",
                apy: 0,
                riskLevel: "low",
                description: `Explore lending options for ${token.symbol}`,
                url: "",
                tokenSymbol: token.symbol
              }))
            }]);
          }
          break;
        }

        case "view_portfolio":
          // Process message to hide wallet addresses 
          setMessages(prev => [...prev, {
            role: "assistant",
            content: llmResponse.message,
            messageId: generateMessageId()
          }]);
          break;

        default:
          // Always hide wallet addresses in messages
          setMessages(prev => [...prev, {
            role: "assistant",
            content: llmResponse.message,
            messageId: generateMessageId()
          }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "I'm having trouble understanding. Please try again.",
        messageId: generateMessageId()
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  // Handle token exploration for buttons
  const handleExploreYield = (tokenSymbol: string) => {
    // Use the local token list directly for simplicity
    const token = tokenList.find(t => t.symbol.toUpperCase() === tokenSymbol.toUpperCase());
    if (token) {
      showLendingOptions(token.symbol, token.address);
    }
  };

  // Update condition to check both Solana wallet adapter and Privy wallet
  if (!connected && !isAuthenticated) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 h-screen w-full bg-gradient-main">
        <div className="text-center">
          <p className="text-foreground mb-4">Please connect your Solana wallet to get started.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden">
      {/* Messages Area - Single scrollable container with padding for input area */}
      <div className="flex-1 overflow-y-auto bg-gradient-main">
        <div className="w-full p-4 space-y-4 pb-36">
          {messages.map((message, index) => (
            <ChatMessage
              key={message.messageId || index}
              message={message}
              passiveIncomeMessageId={passiveIncomeMessageId}
              passiveIncomeHandlers={passiveIncomeHandlers}
              onExploreYield={handleExploreYield}
            />
          ))}

          {currentQuote && (
            <div className="flex justify-start">
              <div className="w-full max-w-[700px]">
                <QuoteWidget
                  quote={currentQuote}
                  onConfirm={handleConfirmPurchase}
                  onCancel={handleCancelPurchase}
                />
              </div>
            </div>
          )}

          {swapQuoteWidget && (
            <div className="flex justify-start">
              <div className="w-full max-w-[700px]">
                <SwapWidget
                  quote={swapQuoteWidget}
                  onConfirm={handleConfirmSwap}
                  onCancel={handleCancelSwap}
                  isProcessing={isSwapProcessing}
                />
              </div>
            </div>
          )}

          {solendPools && !showLendingConfirm && (
            <div className="flex justify-start w-full">
              <SolendPoolsWidget
                pools={solendPools}
                tokenSymbol={lendingToken?.symbol || ''}
                onSelectPool={(pool) => {
                  setLendingAmount(null);
                  setSelectedPool(pool);
                  setShowLendingConfirm(true);
                }}
              />
            </div>
          )}

          {showLendingConfirm && selectedPool && (
            <LendingConfirmWidget
              tokenSymbol={lendingToken?.symbol || ''}
              pool={selectedPool}
              amount={lendingAmount}
              onAmountChange={setLendingAmount}
              onConfirm={handleLendNow}
              onCancel={() => setShowLendingConfirm(false)}
            />
          )}

          {isTyping && (
            <div className="flex justify-start">
              <div className="typing-indicator rounded-lg p-3">
                <div className="flex space-x-2">
                  <div className="w-2 h-2 bg-brand-purple rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-brand-purple rounded-full animate-bounce delay-100" />
                  <div className="w-2 h-2 bg-brand-purple rounded-full animate-bounce delay-200" />
                </div>
              </div>
            </div>  
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area and Quick Actions - Fixed at bottom */}
      <div className="fixed bottom-0 left-64 right-0 bg-white border-t border-brand-purple/20 shadow-lg">
        <div className="w-full">
          <ChatInputArea
            input={input}
            onInputChange={setInput}
            onSend={handleSend}
            onQuickAction={handleQuickAction}
          />
        </div>
      </div>
    </div>
  )
} 
