# Front-end (`public/app/`)

React 19 + Vite 8, sem roteador. Build sai em `public/dist/` (configurado em
`public/app/vite.config.js`), que é o que o `Server.js` serve. Workflow
detalhado em `DEV.md` → "Mexendo no front-end".

- **Dev**: `npm start` na raiz (3000) + `npm run dev` em `public/app` (5173,
  proxy de `/socket.io` → 3000). Mudanças em `src/` aparecem na hora.
- **Produção/local**: `npm run build` em `public/app`. Reiniciar o servidor
  **não** reflete mudanças sem rebuild.
- Lint: `npm run lint` em `public/app` (oxlint, `.oxlintrc.json`).

## Imports de fora de `public/app` (fontes únicas)

O front importa módulos puros do back pra nunca dessincronizar (por isso
`server.fs.allow` no Vite e o `COPY . .` no estágio de build do Dockerfile):

| Módulo | Usado por |
|---|---|
| `conexao/limites.js` | `PopupLogin.jsx` (tamanhos de nome/senha) |
| `conexao/loja.js` | `Customizacao.jsx`, `visual.js` (preços, catálogo, padrões) |
| `conexao/chat/mensagensChat.js` | `meetfront1/Partida.jsx`, `MesaExperimento.jsx` (catálogo e cooldown) |
| `bots/modelosBot.js` | `Lobby.jsx`, `MesaExperimento.jsx` (opções de bot) |
| `bots/rede.js`, `bots/observacao.js`, `game/*` | `lab/` (simulação do cérebro do bot no navegador) |

Esses módulos **não podem** importar `node:*` nem nada de servidor.

## Estrutura de `src/`

| Caminho | O que é |
|---|---|
| `main.jsx` | monta `<App/>` em StrictMode; rota `/lab` → `lab/LabCerebro.jsx`; `labsTemporarios/LabNome.jsx` → `/lab-nome` (só em branches de trabalho; apagar na `main` após merge) |
| `App.jsx` | máquina de estado das telas: inicial → (login) → salas (Lobby) / customização → partida; reconexão e retomada de sessão |
| `socket.js` | conexão socket.io única (`io()` na mesma origem), `chamar()` (ack como Promise), estado de conexão (`assinarConexao`), `window.__socket` pra debug |
| `sessao.js` | `{nome, token}` em **sessionStorage** (por aba, de propósito: várias abas = vários jogadores) |
| `visual.js`, `chapeus.js` | cor (matiz HSL) e sprite de chapéu do fantasminha; chapéus vêm de `assets/chapeus/*.png` + `calibracao-chapeus.csv` (ajuste vertical) |
| `avisoFichas.js` | barramento do aviso "+N FICHAS" (`fichasGanhas` ou ack de `desistir`) |
| `arcade/som.js` | motor de som chiptune (WebAudio, sintetizado) |
| `components/arcade/` | casca das telas fora da partida: `Casca.jsx` (fundo, barra, faixa de conexão perdida), `Lobby.jsx` (lista/criar sala, senha, JA_EM_PARTIDA, reconectar/desistir), `Modal.jsx`, filtro de tela (`PainelFiltro.jsx`, `filtros.js`), `somArcade.js`, `tema.js`, `salasInfo.js` |
| `components/meetfront1/` | `Partida.jsx` = **lógica da partida** (assina eventos do socket, monta `estado`, ações); peças da mesa: `Carta.jsx`, `Fantasminha.jsx`, `Ficha.jsx`, `MesaDanificada.jsx` (coreografias das manilhas), `RaiosNaCarta.jsx`, `FiltroTela.jsx`, layout mobile (`modoMobile.js`, `zonasPouso.js`, `maoReativa.js`), ajustes de desempenho (`ajustesZap.js`, `ajustesCopas.js`, `ajustesMesa.js`, flipbooks, `zapCanvas.js`) |
| `components/meetfront2/` | front atual: `Inicio.jsx` (JOGAR / CUSTOMIZAÇÃO / SAIR), `PopupLogin.jsx` (login em etapas + convidado `Fantasma####`), `Customizacao.jsx` (loja), `Saldo.jsx`, `AvisoFichas.jsx`, `Partida.jsx` (usa a Partida do meetfront1 com `Mesa={MesaExperimento}`), `MesaExperimento.jsx` (**apresentação** da mesa: recebe `estado`/`acoes`, ~4.7k linhas) |
| `lab/` | `/lab`: partida simulada de 4 bots mostrando o "cérebro" da rede (`LabCerebro.jsx`, `RedeCanvas.jsx`, `simulador.js`) |
| `labsTemporarios/` | protótipos temporários de branch (ver acima) |

CSS escopado por front: `.mf1` (`meetfront1.css`), `.mf2` (`meetfront2.css`,
`inicio.css`), arcade (`arcade.css`). O nome das pastas é histórico
(arcade/meetfront1 viraram peças do meetfront2); outras frentes antigas
ficaram só na branch `StashedFronts`.

## Separação lógica × apresentação na partida

`meetfront1/Partida.jsx` é dona do socket e do estado (eventos → `estado`);
a mesa (`MesaExperimento.jsx`) só desenha e chama `acoes`. Pra mudar
comportamento de protocolo, mexa na Partida; pra mudar visual/animação, na
mesa.

## Constantes pareadas com o servidor

- `PAUSA_VAZA_MS` em `meetfront1/Partida.jsx` ↔ `pausaVazaMs` do `GameController`.
- Durações das animações da mesa ↔ `game/animacoesFront.js` (o servidor
  estima quanto tempo a tela fica ocupada).
- hp inicial 3 (`tema.js`, `MesaExperimento.jsx`) ↔ `game/PlayerGame.js`.
- Ordem de valores/naipes e critério de anulação replicados em `Carta.jsx`
  e `MesaExperimento.jsx` ↔ `game/Baralho.js`/`game/Mesa.js`.

## Outros diretórios de `public/`

- `public/experimento/` — playground Vite separado pra ideias visuais; não
  fala com o servidor, não builda pra `public/dist`.
- `public/_intro/` — página estática antiga (scripts desativados).
- `public/dist/` — build gerado (fora do git).
