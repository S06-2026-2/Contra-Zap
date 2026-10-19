import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// /lab abre o lab do cérebro do bot (lab/LabCerebro.jsx) no lugar do jogo.
// Carregado sob demanda: ele e os pesos da rede (~2 MB) só baixam nessa rota.
const LabCerebro = lazy(() => import('./lab/LabCerebro.jsx'))
const ehLab = window.location.pathname === '/lab'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {ehLab ? (
      <Suspense fallback={null}>
        <LabCerebro />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)
