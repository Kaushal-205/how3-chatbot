import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { Connection, PublicKey } from '@solana/web3.js';
import { Jupiter } from '@jup-ag/core';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const connection = new Connection('https://api.mainnet-beta.solana.com');
const jupiter = new Jupiter(connection);

export async function POST(req) {
  try {
    const { message, publicKey, context } = await req.json();
    
    // Check if the message is about trading
    const isTradingRequest = message.toLowerCase().includes('buy') || 
                           message.toLowerCase().includes('sell') ||
                           message.toLowerCase().includes('trade');
    
    // Check if the message is about balance
    const isBalanceRequest = message.toLowerCase().includes('balance') || 
                           message.toLowerCase().includes('holdings') ||
                           message.toLowerCase().includes('tokens');

    let response = '';

    if (isTradingRequest) {
      // Handle trading requests
      const routeMap = await jupiter.computeRoutes({
        inputMint: new PublicKey('So11111111111111111111111111111111111111112'), // SOL
        outputMint: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), // USDC
        amount: 1000000000, // 1 SOL in lamports
        slippageBps: 50,
      });

      response = `I can help you with that trade. Here's what I found:\n\n` +
                 `Best route: ${routeMap.routesInfos[0].marketInfos[0].ammKey}\n` +
                 `Estimated output: ${routeMap.routesInfos[0].outAmount / 1000000} USDC\n` +
                 `Would you like to proceed with this trade?`;
    } else if (isBalanceRequest) {
      // Handle balance requests
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        new PublicKey(publicKey),
        { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
      );

      const balances = tokenAccounts.value.map(account => {
        const tokenInfo = account.account.data.parsed.info;
        return {
          mint: tokenInfo.mint,
          amount: tokenInfo.tokenAmount.uiAmount,
          decimals: tokenInfo.tokenAmount.decimals,
        };
      });

      response = `Here are your token balances:\n\n` +
                 balances.map(b => `${b.amount} tokens (Mint: ${b.mint})`).join('\n');
    } else {
      // Handle general chat
      const completion = await openai.chat.completions.create({
        messages: [
          {
            role: "system",
            content: "You are a helpful Solana trading assistant. Keep responses focused on trading, token prices, and portfolio management. If users ask about trading, guide them to connect their wallet first."
          },
          ...context.map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          {
            role: "user",
            content: message
          }
        ],
        model: "gpt-3.5-turbo",
      });

      response = completion.choices[0].message.content;
    }

    return NextResponse.json({ response });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
} 