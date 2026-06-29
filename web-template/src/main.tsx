import ReactDOM from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'

import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'

import App from './App'
import { BrazeBridgeProvider } from './braze/BrazeBridgeProvider'
import { BrandTheme } from './components/BrandTheme'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'

const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter

// StrictMode intentionally omitted: this is a demo artifact, and StrictMode's
// dev-only double-invocation of effects would double-fire events.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <BrandTheme>
      <BrazeBridgeProvider>
        <Router>
          <App />
        </Router>
      </BrazeBridgeProvider>
    </BrandTheme>
  </ErrorBoundary>,
)
