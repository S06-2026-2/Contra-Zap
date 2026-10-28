import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// /lab abre o lab do cérebro do bot (lab/LabCerebro.jsx) no lugar do jogo.
// Carregado sob demanda: ele e os pesos da rede (~2 MB) só baixam nessa rota.
const LabCerebro = lazy(() => import('./lab/LabCerebro.jsx'))

// Labs temporários (labsTemporarios/, só nas branches de trabalho — na
// main a pasta é apagada depois do merge): cada labsTemporarios/LabNome.jsx vira a
// rota /lab-nome. Sem a pasta, a lista fica vazia e nada muda.
const labsTemporarios = Object.fromEntries(
  Object.entries(import.meta.glob('./labsTemporarios/Lab*.jsx')).map(([caminho, carregar]) => {
    const nome = caminho.match(/Lab(\w+)\.jsx$/)[1].replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
    return [`/lab-${nome}`, lazy(carregar)]
  }),
)

const caminho = window.location.pathname
const Lab = caminho === '/lab' ? LabCerebro : labsTemporarios[caminho]

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {Lab ? (
      <Suspense fallback={null}>
        <Lab />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)
