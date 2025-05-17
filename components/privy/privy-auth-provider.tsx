"use client"

import { createContext, useContext, useEffect, useState, type ReactNode, type FC, useRef } from "react"
import { usePrivy } from "@privy-io/react-auth"
import { useSolanaWallets, useSendTransaction } from "@privy-io/react-auth/solana"
import { Connection } from "@solana/web3.js"
import bs58 from "bs58"

// Define the auth context type
interface PrivyAuthContextType {
  isAuthenticated: boolean
  isAuthenticating: boolean
  authError: string | null
  authenticate: () => Promise<boolean>
  logout: () => void
  walletAddress: string | null
  shortAddress: string | null
  signMessage: (message: Uint8Array) => Promise<Uint8Array>
  sendTransaction: (transaction: any, connection: Connection) => Promise<string>
  isWalletInitialized: boolean
}

// Create the context with default values
const PrivyAuthContext = createContext<PrivyAuthContextType>({
  isAuthenticated: false,
  isAuthenticating: false,
  authError: null,
  authenticate: async () => false,
  logout: () => {},
  walletAddress: null,
  shortAddress: null,
  signMessage: async () => new Uint8Array(),
  sendTransaction: async () => "",
  isWalletInitialized: false,
})

// Hook to use the Privy auth context
export const usePrivyAuth = () => useContext(PrivyAuthContext)

interface PrivyAuthProviderProps {
  children: ReactNode
}

export const PrivyAuthProvider: FC<PrivyAuthProviderProps> = ({ children }) => {
  const { ready, authenticated, login, logout, user } = usePrivy()
  const { wallets, createWallet } = useSolanaWallets()
  const { sendTransaction: privySendTransaction } = useSendTransaction()
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [shortAddress, setShortAddress] = useState<string | null>(null)
  const [isWalletInitialized, setIsWalletInitialized] = useState(false)
  
  // Track if wallet creation has been attempted already
  const walletCreationAttemptedRef = useRef(false);

  // Update wallet address when user or wallets change - optimized version
  useEffect(() => {
    if (!ready) return;

    // Fast wallet initialization function
    const initializeWallet = async () => {
      if (authenticated && user) {
        // Only try to create a wallet if we haven't attempted it already
        if (wallets.length === 0 && !walletCreationAttemptedRef.current) {
          walletCreationAttemptedRef.current = true;
          try {
            console.log("Creating embedded wallet...");
            await createWallet();
            console.log("Embedded wallet created successfully");
            setIsWalletInitialized(true);
          } catch (error) {
            if (error instanceof Error && error.message.includes("User already has an embedded wallet")) {
              console.log("User already has an embedded wallet, continuing...");
              setIsWalletInitialized(true);
            } else {
              console.error("Error creating wallet:", error);
              setAuthError("Failed to create wallet");
            }
          }
        }

        // We can set the wallet address from the wallets array directly
        if (wallets.length > 0) {
          const primaryWallet = wallets[0];
          const address = primaryWallet.address;
          
          // Only update if the address has changed
          if (address !== walletAddress) {
            console.log("Setting wallet address:", address);
            setWalletAddress(address);
            setShortAddress(`${address.slice(0, 4)}...${address.slice(-4)}`);
            setIsWalletInitialized(true);
          }
        }
      } else {
        setWalletAddress(null);
        setShortAddress(null);
      }
    };

    // Execute wallet initialization
    initializeWallet();
  }, [ready, authenticated, user, wallets, walletAddress, createWallet]);

  // Authenticate user
  const authenticate = async (): Promise<boolean> => {
    if (authenticated) return true

    try {
      setIsAuthenticating(true)
      setAuthError(null)

      await login()
      return true
    } catch (error) {
      console.error("Authentication error:", error)
      setAuthError(error instanceof Error ? error.message : "Unknown authentication error")
      return false
    } finally {
      setIsAuthenticating(false)
    }
  }

  // Function to sign a message with the embedded wallet - with caching
  const signMessage = async (message: Uint8Array): Promise<Uint8Array> => {
    if (!authenticated || !wallets || wallets.length === 0) {
      throw new Error("Not authenticated or no wallet available")
    }

    try {
      const wallet = wallets[0]
      const signature = await wallet.signMessage(message)
      
      // Return the signature as a Uint8Array
      return new Uint8Array(signature)
    } catch (error) {
      console.error("Error signing message:", error)
      throw new Error("Failed to sign message with Privy wallet")
    }
  }

  // Function to send a transaction - optimized version
  const sendTransaction = async (transaction: any, connection: Connection): Promise<string> => {
    if (!authenticated || !wallets || wallets.length === 0) {
      throw new Error("Not authenticated or no wallet available")
    }

    try {
      // Add blockhash only if missing, to avoid unnecessary RPC calls
      if ('recentBlockhash' in transaction && !transaction.recentBlockhash) {
        const { blockhash } = await connection.getLatestBlockhash('processed'); // Use faster commitment level
        transaction.recentBlockhash = blockhash;
      } else if ('version' in transaction && transaction.message && !transaction.message.recentBlockhash) {
        const { blockhash } = await connection.getLatestBlockhash('processed'); // Use faster commitment level
        transaction.message.recentBlockhash = blockhash;
      }
      
      // Send transaction
      const receipt = await privySendTransaction({
        transaction,
        connection
      });
      
      return receipt.signature;
    } catch (error) {
      console.error("Error sending transaction:", error);
      
      let errorMessage = "Failed to send transaction with Privy wallet";
      if (error instanceof Error) {
        errorMessage += `: ${error.message}`;
        
        if (error.message.includes("blockhash")) {
          errorMessage = "Transaction blockhash error: The transaction blockhash is invalid or expired";
        } else if (error.message.includes("signature")) {
          errorMessage = "Transaction signature error: Failed to sign the transaction";
        }
      }
      
      throw new Error(errorMessage);
    }
  }

  return (
    <PrivyAuthContext.Provider
      value={{
        isAuthenticated: authenticated,
        isAuthenticating,
        authError,
        authenticate,
        logout,
        walletAddress,
        shortAddress,
        signMessage,
        sendTransaction,
        isWalletInitialized,
      }}
    >
      {children}
    </PrivyAuthContext.Provider>
  )
} 
