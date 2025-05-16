import { VersionedTransaction } from "@solana/web3.js";

export interface PassiveIncomeOption {
  choice: string;
  action: string;
}

export interface Message {
  role: string;
  content: string;
  messageId?: string;
  options?: YieldOption[];
  passiveIncomeOptions?: PassiveIncomeOption[];
}

export interface LLMResponse {
  intent: "buy_sol" | "buy_token" | "explore_yield" | "view_portfolio" | "out_of_scope";
  amount?: number | null;
  currency?: string;
  token?: string;
  message: string;
  dollarAmount?: number;
  solAmount?: number;
}

export interface OnrampQuote {
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

export interface SwapQuoteWidget {
  requestId: string;
  inputToken: string;
  inputAmount: number;
  outputToken: string;
  outputAmount: number;
  priceImpact: string;
  exchangeRate: number;
}

export interface SolendPool {
  apy: number;
  market: string;
  mintAddress: string;
  pool: string;
  riskLevel: string;
}

export interface PassiveIncomeHandlers {
  onConfirm: () => void;
  onDecline: () => void;
}

export interface YieldOption {
  platform: string;
  type: string;
  apy: number;
  riskLevel: string;
  description: string;
  url: string;
  tokenSymbol: string;
}

export interface QuoteWidgetProps {
  quote: {
    countryCode: string;
    coinAmount: number;
    network: string;
    fiatCurrency: string;
    fiatAmount: number;
    cryptoCurrency: string;
  };
  onConfirm: () => void;
  onCancel: () => void;
}

export interface SwapWidget {
  requestId: string;
  inputToken: string;
  inputAmount: number;
  outputToken: string;
  outputAmount: number;
  priceImpact: string;
  exchangeRate: number;
}

export interface Token {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  logoURI: string;
  coingeckoId: string;
} 
