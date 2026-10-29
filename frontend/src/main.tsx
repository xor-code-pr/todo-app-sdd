import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
// Tokens first: index.css and every component stylesheet reference them.
import './styles/tokens.css'
import './index.css'

const container = document.getElementById('root')

if (container === null) {
  throw new Error('Root element #root is missing from index.html')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
