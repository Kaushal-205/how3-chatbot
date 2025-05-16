"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Wallet, TrendingUp, Coins, Loader2 } from "lucide-react"
import { Connection, LAMPORTS_PER_SOL, PublicKey, clusterApiUrl } from "@solana/web3.js"
import { usePrivyAuth } from "@/components/privy/privy-auth-provider"

export function PortfolioMetrics() {
  const { isAuthenticated, walletAddress } = usePrivyAuth()
  const [solBalance, setSolBalance] = useState<number>(0)
  const [stakedSol, setStakedSol] = useState<number>(0)
  const [earnedRewards, setEarnedRewards] = useState<number>(0)
  const [dailyRewards, setDailyRewards] = useState<number>(0)
  const [loading, setLoading] = useState<boolean>(true)
  const [solPrice, setSolPrice] = useState<number>(100) // Default SOL price in USD
  const [error, setError] = useState<string | null>(null)

  // Add this new function before useEffect
  const fetchSolPrice = async (retries = 3, delay = 1000) => {
    for (let i = 0; i < retries; i++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        const response = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
          { signal: controller.signal }
        );
        
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data && data.solana && data.solana.usd) {
          // Store the price in localStorage for fallback
          localStorage.setItem('solPrice', data.solana.usd.toString());
          localStorage.setItem('solPriceTimestamp', Date.now().toString());
          return data.solana.usd;
        }
        throw new Error('Invalid data format from CoinGecko');
      } catch (error) {
        console.error(`Attempt ${i + 1} failed:`, error);
        if (i === retries - 1) {
          // On last retry, try to get cached price
          const cachedPrice = localStorage.getItem('solPrice');
          const cachedTimestamp = localStorage.getItem('solPriceTimestamp');
          
          if (cachedPrice && cachedTimestamp) {
            const cacheAge = Date.now() - parseInt(cachedTimestamp);
            // Use cache if it's less than 1 hour old
            if (cacheAge < 3600000) {
              console.log('Using cached SOL price');
              return parseFloat(cachedPrice);
            }
          }
          throw error;
        }
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
      }
    }
    return 100; // Fallback price
  };

  useEffect(() => {
    const fetchSolanaData = async () => {
      if (!walletAddress || !isAuthenticated) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)
        
        // Get real data using clusterAPI
        const endpoints = [
          process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL || 'https://api.mainnet-beta.solana.com', // Primary endpoint (Alchemy if available)
          'https://api.mainnet-beta.solana.com', // Backup mainnet endpoint
          'https://mainnet.solana.rpcpool.com' // Another mainnet backup
        ];
        
        let connection;
        let balance = 0;
        let success = false;
        
        // Try each endpoint until one works
        for (const endpoint of endpoints) {
          try {
            connection = new Connection(endpoint, 'confirmed');
            balance = await connection.getBalance(new PublicKey(walletAddress));
            success = true;
            break;
          } catch (err) {
            console.warn(`Failed to connect to ${endpoint}:`, err);
          }
        }
        
        if (success) {
          const solBalanceValue = balance / LAMPORTS_PER_SOL;
          setSolBalance(solBalanceValue);
          
          // Set staking and rewards to zero as we're not simulating anymore
          setStakedSol(0);
          setEarnedRewards(0);
          setDailyRewards(0);
        } else {
          console.error("All RPC endpoints failed");
          setError("Failed to connect to Solana network. Please try again later.");
          setSolBalance(0);
          setStakedSol(0);
          setEarnedRewards(0);
          setDailyRewards(0);
        }
        
        // Fetch SOL price using the new function
        try {
          const price = await fetchSolPrice();
          setSolPrice(price);
        } catch (error) {
          console.error("Error fetching SOL price:", error);
          // Keep the default price
        }
        
        setLoading(false);
      } catch (error) {
        console.error("Error fetching Solana data:", error);
        setError("Failed to load portfolio data.");
        setSolBalance(0);
        setStakedSol(0);
        setEarnedRewards(0);
        setDailyRewards(0);
        setLoading(false);
      }
    }

    fetchSolanaData()
  }, [walletAddress, isAuthenticated])

  // Function to format SOL amount based on value
  const formatSolAmount = (amount: number) => {
    if (amount === 0) return "0.00";
    if (amount < 0.01) return amount.toFixed(4);
    if (amount < 0.1) return amount.toFixed(3);
    return amount.toFixed(2);
  }

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="md:col-span-2 lg:col-span-3 rounded-md border p-8 flex items-center justify-center min-h-[120px] bg-card">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mr-2" />
          <span>Loading balance data...</span>
        </div>
      </div>
    )
  }

  // Calculate portfolio percentage safely
  const portfolioPercentage = solBalance > 0 
    ? ((stakedSol / solBalance) * 100).toFixed(2) 
    : "0.00";

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {error && (
        <div className="md:col-span-2 lg:col-span-3 p-2 rounded-md bg-amber-500/20 text-amber-800 text-sm mb-2">
          {error}
        </div>
      )}
      <Card className="min-h-[120px]">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total SOL Balance</CardTitle>
          <Wallet className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatSolAmount(solBalance)} SOL</div>
          <p className="text-xs text-muted-foreground">≈ ${(solBalance * solPrice).toFixed(2)} USD</p>
        </CardContent>
      </Card>

      <Card className="min-h-[120px]">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Staked SOL</CardTitle>
          <Coins className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatSolAmount(stakedSol)} SOL</div>
          <p className="text-xs text-muted-foreground">{portfolioPercentage}% of portfolio</p>
        </CardContent>
      </Card>

      <Card className="min-h-[120px]">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Earned Rewards</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatSolAmount(earnedRewards)} SOL</div>
          <p className="text-xs text-brand-purple">+{formatSolAmount(dailyRewards)} SOL (24h)</p>
        </CardContent>
      </Card>
    </div>
  )
}
