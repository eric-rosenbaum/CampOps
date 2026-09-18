import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Before App: the first paint must already be in the reader's language and direction.
import './i18n'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
