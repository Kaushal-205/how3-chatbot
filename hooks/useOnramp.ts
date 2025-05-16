import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { usePrivyAuth } from '@/components/privy/privy-auth-provider';
import axios from 'axios';
import config from '@/lib/config';

interface OnrampQuote {
  provider: string;
  inputAmount: number;
  inputCurrency: string;
  outputAmount: number;
  outputCurrency: string;
  fees: {
    provider: number;
    network: number;
    total: number;
  };
  estimatedProcessingTime: string;
  exchangeRate: number;
  network: string;
  redirectUrl?: string;
}

interface UseOnrampReturn {
  isProcessing: boolean;
  currentQuote: OnrampQuote | null;
  error: string | null;
  getQuote: (amount: number) => Promise<void>;
  confirmPurchase: () => Promise<void>;
  cancelPurchase: () => void;
  handleSuccess: () => void;
  handleCancel: () => void;
  proceedToCheckout: (params?: { 
    dollarAmount?: number; 
    solAmount?: number;
    tokenSymbol?: string;
    tokenAddress?: string;
    tokenAmount?: number;
  }) => Promise<{
    url: string;
    solAmount: number;
    fiatAmount: number;
    fiatCurrency: string;
    sessionId: string;
    isTokenSwap: boolean;
    tokenSymbol: string | null;
    tokenAmount: number | null;
  }>;
}

// const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

export function useOnramp(): UseOnrampReturn {
  const { publicKey } = useWallet();
  const { isAuthenticated, walletAddress } = usePrivyAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentQuote, setCurrentQuote] = useState<OnrampQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  // Helper function to directly create a Stripe checkout session
  const proceedToCheckout = async (params?: { 
    dollarAmount?: number; 
    solAmount?: number;
    tokenSymbol?: string;
    tokenAddress?: string;
    tokenAmount?: number;
  }) => {
    try {
      // Check for either Solana wallet adapter or Privy wallet
      const userWalletAddress = publicKey?.toString() || walletAddress;

      if (!userWalletAddress) {
        throw new Error('Please connect your wallet first');
      }
      
      const body: any = {
        walletAddress: userWalletAddress,
        email: undefined,
        country: undefined,
      };

      // Pass through all parameters if provided
      if (params?.dollarAmount !== undefined && typeof params.dollarAmount === 'number' && params.dollarAmount > 0) {
        body.dollarAmount = params.dollarAmount;
      }
      
      if (params?.solAmount !== undefined && typeof params.solAmount === 'number' && params.solAmount > 0) {
        body.solAmount = params.solAmount;
      }
      
      // Add token parameters if provided
      if (params?.tokenSymbol) {
        body.tokenSymbol = params.tokenSymbol;
      }
      
      if (params?.tokenAddress) {
        body.tokenAddress = params.tokenAddress;
      }
      
      if (params?.tokenAmount && params.tokenAmount > 0) {
        body.tokenAmount = params.tokenAmount;
      }

      console.log('Creating checkout session with parameters:', body);
      
      const response = await fetch(`${config.apiUrl}/api/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      
      if (data.error) throw new Error(data.error);
      
      console.log('Checkout session created:', {
        solAmount: data.solAmount,
        fiatAmount: data.fiatAmount,
        fiatCurrency: data.fiatCurrency,
        isTokenSwap: data.isTokenSwap,
        tokenSymbol: data.tokenSymbol
      });

      // Open Stripe checkout in new window
      window.open(data.url, '_blank');
      return data;
    } catch (error) {
      console.error('Error in proceedToCheckout:', error);
      throw error;
    }
  };

  // Create a quote for the specified amount
  const getQuote = async (amount: number) => {
    // Check for either Solana wallet adapter or Privy wallet
    const userAddress = publicKey?.toString() || walletAddress;

    if (!userAddress) {
      setError('Please connect your wallet first');
      return;
    }

    if (!amount || amount <= 0) {
      setError('Invalid amount. Please specify a positive number.');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Create a dynamic quote based on the specified amount
      const response = await fetch(`${config.apiUrl}/api/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: userAddress,
          dollarAmount: amount
        }),
      });

      const data = await response.json();
      
      if (data.error) throw new Error(data.error);
      
      // Create a quote from the response
      const quote: OnrampQuote = {
        provider: "Stripe",
        inputAmount: data.fiatAmount,
        inputCurrency: data.fiatCurrency.toUpperCase(),
        outputAmount: data.solAmount,
        outputCurrency: 'SOL',
        fees: {
          provider: 0,
          network: 0,
          total: 0
        },
        estimatedProcessingTime: "1-2 minutes",
        exchangeRate: data.fiatAmount / data.solAmount,
        network: 'mainnet',
        redirectUrl: data.url
      };

      console.log('Created quote:', quote);
      setCurrentQuote(quote);
    } catch (error) {
      console.error('Error in getQuote:', error);
      setError(error instanceof Error ? error.message : 'Failed to create checkout session');
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmPurchase = async () => {
    if (currentQuote) {
      const purchaseParams = {
        dollarAmount: currentQuote.inputAmount,
      };
      
      try {
        await proceedToCheckout(purchaseParams);
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Failed to process payment');
      }
    }
  };

  const cancelPurchase = () => {
    setCurrentQuote(null);
    setError(null);
  };

  const handleSuccess = () => {
    setCurrentQuote(null);
    setError(null);
  };

  const handleCancel = () => {
    setCurrentQuote(null);
    setError(null);
  };

  return {
    isProcessing,
    currentQuote,
    error,
    getQuote,
    confirmPurchase,
    cancelPurchase,
    handleSuccess,
    handleCancel,
    proceedToCheckout
  };
} 
