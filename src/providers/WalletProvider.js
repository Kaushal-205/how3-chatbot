'use client';

import { useMemo, useState } from 'react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';

// Import the styles
require('@solana/wallet-adapter-react-ui/styles.css');

// Public RPC endpoints
const RPC_ENDPOINTS = {
  [WalletAdapterNetwork.Mainnet]: 'https://api.mainnet-beta.solana.com',
  [WalletAdapterNetwork.Devnet]: 'https://api.devnet.solana.com',
  [WalletAdapterNetwork.Testnet]: 'https://api.testnet.solana.com',
};

export default function SolanaWalletProvider({ children }) {
  // Default to mainnet for production
  const [network, setNetwork] = useState(WalletAdapterNetwork.Mainnet);

  // Use the public RPC endpoint
  const endpoint = useMemo(() => RPC_ENDPOINTS[network], [network]);

  // Configure wallets
  const wallets = useMemo(
    () => {
      const phantomWallet = new PhantomWalletAdapter();
      return [phantomWallet];
    },
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
} 