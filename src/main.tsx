import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { initRendererMonitoring, MonitoringErrorBoundary } from '@/lib/monitoring'

initRendererMonitoring()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MonitoringErrorBoundary>
      <HashRouter>
        <App />
      </HashRouter>
    </MonitoringErrorBoundary>
  </React.StrictMode>,
)
