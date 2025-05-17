"use client"

import { FC, ReactNode, createContext, useContext, useState, useEffect } from "react"
import { usePrivy } from "@privy-io/react-auth"
import { useSolanaWallets } from "@privy-io/react-auth/solana"
import { Loader } from "@/components/ui/loader"
import { usePrivyAuth } from "./privy-auth-provider"

interface WalletReadyContextType {
  isWalletReady: boolean
}

const WalletReadyContext = createContext<WalletReadyContextType>({
  isWalletReady: false
})

export const useWalletReady = () => useContext(WalletReadyContext)

interface WalletReadyProviderProps {
  children: ReactNode
}

export const WalletReadyProvider: FC<WalletReadyProviderProps> = ({ children }) => {
  const { ready, authenticated } = usePrivy()
  const { wallets } = useSolanaWallets()
  const { isWalletInitialized } = usePrivyAuth()
  const [isWalletReady, setIsWalletReady] = useState(false)
  const [isInitializing, setIsInitializing] = useState(true)

  useEffect(() => {
    // If not authenticated or not ready, we can't proceed
    if (!ready || !authenticated) {
      setIsWalletReady(false)
      setIsInitializing(true)
      return
    }

    // Check if wallet is ready
    // We consider wallet ready when either:
    // 1. We have at least one wallet
    // 2. We've seen the "User already has an embedded wallet" message (tracked by isWalletInitialized)
    if (wallets.length > 0 || isWalletInitialized) {
      setIsWalletReady(true)
      setIsInitializing(false)
    }

    // If we don't have wallets yet but we're authenticated, 
    // the wallet creation might still be in progress
    // We'll keep checking in the next render cycle
  }, [ready, authenticated, wallets, isWalletInitialized])

  // If not ready, show loading screen inside the container rather than full-screen
  if (isInitializing && authenticated) {
    return (
      <div className="w-full h-screen flex items-center justify-center">
        <Loader className="bg-purple-100" />
      </div>
    )
  }

  return (
    <WalletReadyContext.Provider value={{ isWalletReady }}>
      {children}
    </WalletReadyContext.Provider>
  )
} 