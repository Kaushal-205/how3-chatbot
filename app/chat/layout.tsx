"use client"
import { AppSidebar } from "@/components/app-sidebar"
import { Header } from "@/components/header"

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex w-full min-h-screen bg-background">
      <AppSidebar />
      <div className="flex flex-col flex-1 w-full">
        <Header title={"Chat with How3-Chatbot"} />
        <main className="flex-1 w-full overflow-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  )
} 
