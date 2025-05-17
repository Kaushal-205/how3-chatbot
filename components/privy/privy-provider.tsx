"use client"

import { type FC, type ReactNode } from "react"
import { PrivyProvider } from "@privy-io/react-auth"
import { useRouter } from "next/navigation"
import config from "@/lib/config"

// Define the props for the PrivyWalletProvider component
interface PrivyWalletProviderProps {
  children: ReactNode
}

export const PrivyWalletProvider: FC<PrivyWalletProviderProps> = ({ children }) => {
  const router = useRouter()

  // Replace this with your actual Privy App ID from the Privy dashboard
  const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID!;

  // Get the current URL for metadata
  const currentUrl = typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000/';

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["email", "google", "apple", "discord", "github"],
        appearance: {
          theme: "dark",
          accentColor: "#813DD4", // Updated to match your brand color
          logo: "/How3logo.svg" // Using your local logo
        },
        embeddedWallets: {
          createOnLogin: "users-without-wallets",
          noPromptOnSignature: true, // Skip confirmation prompts to speed up transactions
          preloadingStrategy: "all" // Preload all needed wallet modules
        },
        // Improve loading performance
        optimisticAuth: true, // Try to use cached login state
        cacheEmbeddedWalletsMethod: true, // Cache wallet state between sessions
        additionalRpcUrlsByChain: {
          solana: [
            "https://api.mainnet-beta.solana.com", // Add multiple RPC endpoints for better reliability
            process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL!
          ]
        },
        // Add metadata configuration to fix URL mismatch
        metadata: {
          name: "How3 Chatbot",
          description: "AI-powered Solana development assistant",
          url: currentUrl,
          icons: ['/How3logo.svg']
        }
      }}
    >
      {children}
    </PrivyProvider>
  )
} 
