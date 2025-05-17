"use client"

import dynamic from "next/dynamic"
import { PageContainer } from "@/components/page-container"
import { Loader } from "@/components/ui/loader"
import { WalletReadyProvider } from "@/components/privy/wallet-ready-provider"

const DynamicChatInterface = dynamic(
  () => import('../components/chat-interface'),
  { 
    loading: () => (
      <div className="flex items-center justify-center w-full h-[60vh]">
        <Loader className="bg-purple-100" />
      </div>
    ),
    ssr: false
  }
)

export function HomeContent() {
  return (
    <PageContainer title="Chat with How3-Chatbot">
      <div className="flex-1 overflow-hidden">
        <WalletReadyProvider>
          <DynamicChatInterface />
        </WalletReadyProvider>
      </div>
    </PageContainer>
  )
}  
