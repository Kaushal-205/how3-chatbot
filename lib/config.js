// Configuration for API endpoints
const config = {
  // API URL - will use the deployed backend URL in production
  // and localhost in development
  apiUrl: process.env.NEXT_PUBLIC_API_URL || 
          (process.env.NODE_ENV === 'production' 
            ? 'https://how3-chatbot.onrender.com' // Replace with your actual deployed URL
            : 'http://localhost:4000'),
  // apiUrl: 'http://localhost:4000',
  birdeyeApiKey: process.env.NEXT_PUBLIC_BIRDEYE_API_KEY || '' // Optional Birdeye API key
};

export default config; 
