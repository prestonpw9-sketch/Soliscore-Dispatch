import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AIProviderRoot } from '@/services/ai/aiProviderFactory'
import App from './App'
import './index.css'

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AIProviderRoot defaultProvider="gemini">
        <App />
      </AIProviderRoot>
    </QueryClientProvider>
  </React.StrictMode>,
)