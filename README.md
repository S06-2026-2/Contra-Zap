# Contra ZAP

![CI](https://github.com/Henryblh/Contra-Zap/actions/workflows/ci.yml/badge.svg)

Jogo de cartas estilo truco, multiplayer, jogado no navegador. Motor de regras
em Node.js, comunicação em tempo real via Socket.io, front-end em React.

## Pré-requisitos

[Node.js](https://nodejs.org/) **22 ou superior** — o `better-sqlite3@13`
exige. Em versões anteriores o servidor trava com segfault na primeira
operação de banco, sem erro claro. Confira com `node -v` (ou use o Docker,
que não depende da sua versão local).

### Windows: `npm install` falhando com "Could not find any Visual Studio installation"

Se o `npm install` morrer com `gyp ERR! find VS` / `node-gyp rebuild`, **não é
preciso instalar o Visual Studio**. Instale assim:

```
npm install --ignore-scripts
```

`better-sqlite3` e `bcrypt` já trazem o binário pronto pra cada plataforma
dentro do próprio pacote (`prebuilds/`). Como os dois têm `binding.gyp` e
nenhum script `install` próprio, o npm assume por conta própria que precisa
compilar e chama o `node-gyp` — e no Windows ele procura o compilador da
Microsoft **antes** de descobrir que não teria nada pra compilar. O
`--ignore-scripts` pula esse passo inútil; o binário pronto é carregado
normalmente em tempo de execução. Nenhuma dependência daqui depende de
script de instalação, então nada deixa de funcionar.

## Rodar

```
node GameStart.js
```

Instala dependências, builda o front e sobe o servidor. Quando terminar, abra
**[localhost:3000](http://localhost:3000)**.

Passo a passo, se preferir:

```
npm install
cd public/app && npm run build && cd ../..
npm start
```

> Só pode haver **um** `Server.js` rodando por vez — feche (`Ctrl+C`) qualquer
> outro antes.

## Rodar com Docker

Não precisa de Node na versão certa — tudo isolado no container. Precisa do
[Docker Desktop](https://www.docker.com/products/docker-desktop) instalado.

```
touch banco.sqlite jwt.secret     # só na primeira vez
docker compose up --build
```

Abra [localhost:3000](http://localhost:3000). `docker compose down` pra parar.
Saúde do servidor: `curl http://localhost:3000/health`.

## Testes

```
npm test              # API — 222 testes, ~25s
npm run test:e2e      # E2E no navegador — 19 testes, ~40s
npm run test:watch    # re-roda a cada arquivo salvo
```

**API** (`tests/api/`): contrato do protocolo socket.io — que é a API de
verdade daqui, já que o único endpoint HTTP é o `/health`. Cobre auth,
salas, partida, reconexão, chat, rate limit e os tetos de sala — caminho
feliz e cada código de erro. Test runner nativo do Node, sem dependência.

**E2E** (`tests/e2e/`): Playwright, navegador de verdade contra o
`Server.js` real. Cobre só o que a API não alcança — a interface e a costura
entre as peças (login em etapas, roster atualizando nas duas telas, F5 no
meio da partida voltando pro jogo). Fica fora do `npm test` porque é lento.
Na primeira vez: `npx playwright install chromium`.

Cada arquivo de teste roda com um `banco.sqlite` temporário (via `DB_PATH`):
rodar a suíte não toca no seu banco nem no seu `jwt.secret`. O E2E builda o
front sozinho antes de subir.

As convenções e as armadilhas deste protocolo estão na skill
`.claude/skills/testes/` — leia antes de escrever teste novo.

## Documentação da API

```
npm run docs
```

Abre em [localhost:3001](http://localhost:3001) (suba o jogo em outro
terminal). Tem um **playground** que conecta no servidor e dispara qualquer
um dos 19 eventos de cliente com *ack*, Swagger UI das rotas HTTP, e
download da coleção do Postman.

| Arquivo | Cobre | Padrão |
|---|---|---|
| `docs/openapi.yaml` | as 2 rotas HTTP | OpenAPI 3.1 |
| `docs/asyncapi.yaml` | os 42 eventos socket.io e 32 códigos de erro | AsyncAPI 3.1 |

São duas specs porque OpenAPI não descreve request/response por ack — o
contrato de verdade está no AsyncAPI. As duas são validadas no CI, junto com
a execução da coleção do Postman contra um servidor de verdade.

## Estrutura

```
game/         regras do jogo (baralho, cartas, mesa, rodada). Não conhece rede.
  GameController.js   orquestra uma partida e expõe o andamento como eventos
bots/         jogadores controlados por IA (Bot.js + BotBrain.js, redes de RL)
conexao/      camada de sala/rede
  PROTOCOLO.md        contrato dos eventos socket.io — leia antes de mexer no protocolo
  socketServer.js     única peça que conhece socket.io
  SalaManager.js      cria salas, valida entrada, aplica cooldown de chat
  db.js jwt.js login.js cadastro.js convidado.js retomarSessao.js   auth/sessão
  chat/               validação e catálogo do chat de sala
public/app/   front-end (React + Vite) — código-fonte em src/
public/dist/  build do front (gerado por `npm run build`, servido pelo Server.js)
tests/        testes automatizados
  helpers/            servidor efêmero, cliente de socket com ack em Promise
  api/                contrato do protocolo socket.io + o endpoint /health
  e2e/                Playwright: login, sala, partida e reconexão pela interface
docs/         documentação da API (roda por fora do Server.js, `npm run docs`)
postman/      coleção do /health e guia de exploração manual do socket.io
playwright.config.js  config do E2E: builda o front e sobe o Server.js na 3100
Server.js     servidor web (Express + Socket.io)
GameStart.js  atalho: instala + builda + sobe, tudo de uma vez
```

## O que já funciona

- Motor de jogo completo: apostas, vazas, manilha, eliminação por hp, teto de
  baralhos por partida (`maxDeck`).
- Autenticação (login/cadastro com senha em hash), sessão via JWT retomável
  sem senha depois de F5 ou queda de rede.
- Salas multiplayer ponta a ponta: criar, entrar, listar, sair, início
  automático ou forçado pelo dono; partida rápida (fila compartilhada).
- Partida real via socket.io: jogadas, mão privada, vazas, placar em tempo
  real, chat de sala com cooldown no servidor.
- Timeout de turno, expulsão por inatividade, reconexão de quem caiu.
- Bots preenchem assento e assumem quem for expulso — jogam com redes
  treinadas por RL (ver `training/`).
- "Jogar de novo": sala nova com a mesma config, convite pra quem ficou.
- Interface web em React ponta a ponta (login, lobby, partida).

## Mais

- **`conexao/PROTOCOLO.md`** — todos os eventos socket.io, payloads e erros.
- **`DEV.md`** — workflow de front (Vite), ferramentas de debug, treino de
  bot, backlog técnico e o que ainda falta.
