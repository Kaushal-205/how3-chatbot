import { useState } from 'react';
import { useWallet } from "@solana/wallet-adapter-react";
import { usePrivyAuth } from "@/components/privy/privy-auth-provider";
import { useOnramp } from '@/hooks/useOnramp';
import { useJupiter } from '@/hooks/useJupiter';
import { useRaydium } from '@/hooks/useRaydium';
import { Message, SolendPool, SwapQuoteWidget } from './types';
import { generateMessageId } from './utils';
import { fetchSolendPoolsByMint } from './solend-service';

export function useChatState() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hello! I can help buy SOL or any token on Solana Blockchain, Explore passive income options. What would you like to do?",
      messageId: generateMessageId()
    }
  ]);
  
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  
  return {
    messages,
    setMessages,
    input,
    setInput,
    isTyping,
    setIsTyping
  };
}

export function useWalletState() {
  const { connected, publicKey, sendTransaction, signTransaction } = useWallet();
  const { isAuthenticated, walletAddress, sendTransaction: privySendTransaction } = usePrivyAuth();
  
  const activeWalletAddress = walletAddress || (publicKey ? publicKey.toString() : null);
  const isWalletConnected = isAuthenticated || connected;
  
  return {
    connected,
    publicKey,
    sendTransaction,
    signTransaction,
    isAuthenticated,
    walletAddress,
    privySendTransaction,
    activeWalletAddress,
    isWalletConnected
  };
}

export function useOnrampState() {
  const { 
    isProcessing, 
    currentQuote, 
    error,
    getQuote,
    confirmPurchase,
    cancelPurchase,
    handleSuccess,
    handleCancel,
    proceedToCheckout
  } = useOnramp()
  
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
  }
}

export function useJupiterState() {
  const jupiter = useJupiter();
  const [swapQuoteWidget, setSwapQuoteWidget] = useState<SwapQuoteWidget | null>(null);
  const [isSwapProcessing, setIsSwapProcessing] = useState(false);
  
  return {
    ...jupiter,
    swapQuoteWidget,
    setSwapQuoteWidget,
    isSwapProcessing,
    setIsSwapProcessing
  };
}

// export function useRaydiumState() {
//   const raydium = useRaydium();
//   const [swapQuoteWidget, setSwapQuoteWidget] = useState<SwapQuoteWidget | null>(null);
//   const [isSwapProcessing, setIsSwapProcessing] = useState(false);
  
//   return {
//     ...raydium,
//     swapQuoteWidget,
//     setSwapQuoteWidget,
//     isSwapProcessing,
//     setIsSwapProcessing
//   };
// }

export function useLendingState() {
  const [solendPools, setSolendPools] = useState<SolendPool[] | null>(null);
  const [lendingToken, setLendingToken] = useState<{ symbol: string, mint: string } | null>(null);
  const [lendingAmount, setLendingAmount] = useState<number | null>(null);
  const [selectedPool, setSelectedPool] = useState<SolendPool | null>(null);
  const [showLendingConfirm, setShowLendingConfirm] = useState(false);
  
  return {
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
  };
}

export function usePassiveIncomeState() {
  const [passiveIncomeMessageId, setPassiveIncomeMessageId] = useState<string | null>(null);
  const [passiveIncomeHandlers, setPassiveIncomeHandlers] = useState<{
    onConfirm: () => void;
    onDecline: () => void;
  } | null>(null);
  
  return {
    passiveIncomeMessageId,
    setPassiveIncomeMessageId,
    passiveIncomeHandlers,
    setPassiveIncomeHandlers
  };
}

export function useLendingOptions(
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
  setLendingToken: React.Dispatch<React.SetStateAction<{ symbol: string, mint: string } | null>>,
  setSolendPools: React.Dispatch<React.SetStateAction<SolendPool[] | null>>
) {
  const showLendingOptions = async (tokenSymbol: string, tokenMint: string) => {
    setLendingToken({ symbol: tokenSymbol, mint: tokenMint });
    
    try {
      const pools = await fetchSolendPoolsByMint(tokenMint);
      
      if (pools.length === 0) {
        setMessages(prev => [...prev, {
          role: "assistant",
          content: `No safe lending pools found for ${tokenSymbol} at the moment.`,
          messageId: generateMessageId()
        }]);
        setSolendPools(null);
        return;
      }
      
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `I found ${pools.length} lending options for ${tokenSymbol}. You can see them below.`,
        messageId: generateMessageId()
      }]);
      
      setSolendPools(pools);
    } catch (error) {
      console.error('Error fetching lending pools:', error);
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `Sorry, I had trouble finding lending options for ${tokenSymbol}. Please try again later.`,
        messageId: generateMessageId()
      }]);
      setSolendPools(null);
    }
  };
  
  return { showLendingOptions };
} 
