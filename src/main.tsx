import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import AppErrorBoundary from './components/shared/AppErrorBoundary.tsx'
import { AuthProvider } from './contexts/AuthContext.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </AppErrorBoundary>
  </React.StrictMode>,
)
