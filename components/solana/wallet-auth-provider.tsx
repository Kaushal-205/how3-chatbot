"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import { useWallet } from "@solana/wallet-adapter-react"
import type { PublicKey } from "@solana/web3.js"
import nacl from "tweetnacl" // Changed from import { sign } from "tweetnacl"

// Define the auth context type
interface WalletAuthContextType {
  isAuthenticated: boolean
  isAuthenticating: boolean
  authError: string | null
  authenticate: () => Promise<boolean>
  logout: () => void
  publicKey: PublicKey | null
  walletAddress: string | null
  shortAddress: string | null
}

// Create the context with default values
const WalletAuthContext = createContext<WalletAuthContextType>({
  isAuthenticated: false,
  isAuthenticating: false,
  authError: null,
  authenticate: async () => false,
  logout: () => {},
  publicKey: null,
  walletAddress: null,
  shortAddress: null,
})

// Hook to use the wallet auth context
export const useWalletAuth = () => useContext(WalletAuthContext)

interface WalletAuthProviderProps {
  children: ReactNode
}

export const WalletAuthProvider = ({ children }: WalletAuthProviderProps) => {
  const { publicKey, signMessage, disconnect, connected } = useWallet()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [shortAddress, setShortAddress] = useState<string | null>(null)

  // Update wallet address when publicKey changes
  useEffect(() => {
    if (publicKey) {
      const address = publicKey.toString()
      setWalletAddress(address)
      setShortAddress(`${address.slice(0, 4)}...${address.slice(-4)}`)
    } else {
      setWalletAddress(null)
      setShortAddress(null)
    }
  }, [publicKey])

  // Check for existing auth on mount and when connected state changes
  useEffect(() => {
    const storedAuth = localStorage.getItem("walletAuth")
    if (storedAuth && publicKey) {
      try {
        const authData = JSON.parse(storedAuth)
        // Check if the stored public key matches the connected wallet
        if (authData.publicKey === publicKey.toString()) {
          // In a real app, you'd verify the JWT token here
          // For demo, we'll just check if the auth is less than 24 hours old
          const isValid = Date.now() - authData.timestamp < 24 * 60 * 60 * 1000
          if (isValid) {
            setIsAuthenticated(true)
          } else {
            localStorage.removeItem("walletAuth")
            setIsAuthenticated(false)
          }
        }
      } catch (e) {
        localStorage.removeItem("walletAuth")
        setIsAuthenticated(false)
      }
    } else if (!connected) {
      setIsAuthenticated(false)
    }
  }, [publicKey, connected])

  // Authenticate user by signing a message
  const authenticate = async (): Promise<boolean> => {
    if (!publicKey || !signMessage) {
      setAuthError("Wallet not connected or doesn't support message signing")
      return false
    }

    try {
      setIsAuthenticating(true)
      setAuthError(null)

      // Create a challenge message with timestamp to prevent replay attacks
      const message = `Sign this message to authenticate with How3-Chatbot: ${Date.now()}`
      const encodedMessage = new TextEncoder().encode(message)

      // Request signature from the wallet
      const signature = await signMessage(encodedMessage)

      // Verify the signature (in a real app, this would be done on the server)
      const verified = nacl.sign.detached.verify(encodedMessage, signature, publicKey.toBytes())

      if (verified) {
        setIsAuthenticated(true)

        // Store auth state in localStorage
        localStorage.setItem(
          "walletAuth",
          JSON.stringify({
            publicKey: publicKey.toString(),
            timestamp: Date.now(),
          }),
        )

        return true
      } else {
        setAuthError("Signature verification failed")
        return false
      }
    } catch (error) {
      console.error("Authentication error:", error)
      setAuthError(error instanceof Error ? error.message : "Unknown authentication error")
      return false
    } finally {
      setIsAuthenticating(false)
    }
  }

  // Logout function
  const logout = () => {
    setIsAuthenticated(false)
    localStorage.removeItem("walletAuth")
    disconnect()
  }

  return (
    <WalletAuthContext.Provider
      value={{
        isAuthenticated,
        isAuthenticating,
        authError,
        authenticate,
        logout,
        publicKey,
        walletAddress,
        shortAddress,
      }}
    >
      {children}
    </WalletAuthContext.Provider>
  )
}
