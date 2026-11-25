# Visão geral

## O que é

**Contra ZAP** é um jogo de cartas multiplayer no navegador, da família do
truco/"fodinha": cada rodada os jogadores **apostam quantas vazas vão fazer**
e perdem vida pela diferença entre o apostado e o feito. O último vivo vence.
Assentos vazios (ou de quem caiu) são jogados por **bots treinados com
aprendizado por reforço (RL)**.

Em produção: `https://contrazap.up.railway.app` (Railway).

## Stack

| Camada | Tecnologia |
|---|---|
| Back-end | Node.js ≥ 22, ESM (`"type": "module"`), Express 5, Socket.IO 4 |
| Persistência | SQLite via `better-sqlite3` (modo WAL), senhas com `bcrypt` |
| Sessão | JWT HS256 (`jsonwebtoken`), validade 6h |
| Front-end | React 19 + Vite 8, `socket.io-client` (em `public/app/`) |
| Bots | Redes pequenas (MLP) com forward pass em JS puro; treino em Python/PyTorch (PPO) |
| Testes | `node --test` (API/unitários), Playwright (E2E) |
| Observabilidade | `prom-client` → `/metrics` (Prometheus) |
| Infra | Docker (multi-stage, Node 22 Alpine), GitHub Actions, Railway |

**Idioma:** código, comentários, commits e docs são em **português**.
Identificadores também (`jogarCarta`, `SalaManager`, `rodada`). Mantenha.

## Arquitetura em uma frase por camada

```
navegador (React, public/app)
   │  socket.io: eventos com ack (request/response) + eventos empurrados
   ▼
Server.js ── Express: /health, /metrics, estático public/dist, fallback SPA
   │
conexao/socketServer.js ── ÚNICA peça que conhece socket.io; traduz evento ↔ chamada
   │
conexao/SalaManager.js ── salas, entrada, tetos, chat (sem socket, testável sozinho)
   │
game/GameController.js ── orquestra uma partida e emite eventos (EventEmitter)
   │
game/Game → Rodada → Mesa / Baralho ── regras puras
   │
bots/BotBrain.js ── decide toda jogada automática (bot ou timeout)
```

Princípio que se repete no projeto inteiro: **cada camada não conhece a de
cima**. `game/` não sabe o que é rede; `SalaManager`, `login.js`, `chat.js`
não sabem o que é socket. Isso é o que permite testar cada peça isolada e
reusar o `GameController` no treino (`training/env_bridge.js`) sem servidor.

## Mapa de pastas

```
Server.js          servidor (Express + Socket.IO); exporta criarServidor() pros testes
GameStart.js       atalho: npm install (raiz + front) + build do front + sobe o Server.js
banco.json         contas fixture (senha em texto puro!) semeadas fora de produção
game/              motor de regras (ver motor.md)
conexao/           rede, salas, auth, banco, carteira, chat (ver servidor-e-conexao.md)
bots/              jogadores automáticos e redes exportadas (ver bots.md)
training/          treino de RL dos bots — Python + ponte Node (ver treino.md)
observabilidade/   métricas Prometheus + config do Prometheus de infra
public/app/        front-end React/Vite (ver front-end.md); build vai pra public/dist/
public/experimento/  playground visual isolado (Vite próprio, não fala com o servidor)
public/_intro/     página estática antiga de intro (scripts desativados)
tests/             testes automatizados (ver testes.md)
docs/              specs da API (OpenAPI/AsyncAPI), playground (npm run docs) e esta documentação
docs/apresentacao-agentes/  roteiro e fluxograma da apresentação sobre skills e agentes
postman/           coleção do /health + guia de exploração do socket.io
.github/workflows/ CI (ci.yml) e deploy noturno (deploy-noturno.yml)
.claude/skills/    skills do projeto e a externa find-skills (ver abaixo)
.claude/agents/    subagentes: revisor (ver abaixo)
skills-lock.json   lock das skills externas instaladas com `npx skills add`
Dockerfile, docker-compose.yml, diagnostico.sh   infra (ver infra.md)
```

Arquivos gerados / fora do git: `banco.sqlite*`, `jwt.secret`, `public/dist/`,
`node_modules/`, `training/{.venv,checkpoints,logs,runs}/` (exceto alguns
checkpoints versionados), `playwright-report/`, `test-results/`,
`relatorio-testes/`.

## Comandos

| Comando | O que faz |
|---|---|
| `node GameStart.js` | instala tudo, builda o front e sobe na porta 3000 |
| `npm start` | sobe só o `Server.js` (serve o `public/dist` já buildado) |
| `npm run dev` (em `public/app`) | Vite na 5173 com proxy de `/socket.io` pra 3000 |
| `npm run build` (em `public/app`) | gera `public/dist/` |
| `npm test` | API, bots, docs, paridade dos motores e unitários (`tests/`, `game/`, `conexao/`); sem Python 3, pula a paridade |
| `npm run test:unit` | só os unitários de `game/` e `conexao/` |
| `npm run test:e2e` | Playwright (builda o front e sobe servidor na 3100) |
| `npm run test:relatorio` | gera `relatorio-testes/index.html` |
| `npm run docs` | playground/specs da API na 3001 (precisa do jogo de pé na 3000) |
| `docker compose up --build` | roda em container (antes: `touch banco.sqlite jwt.secret`) |
| `bash diagnostico.sh` | checa ambiente (Node, porta, volumes…) |

No Windows, se `npm install` falhar procurando Visual Studio, use
`npm install --ignore-scripts` (os binários nativos já vêm prontos).

Só pode haver **um** `Server.js` por porta.

## Skills e agentes

Skills ficam em `.claude/skills/<nome>/SKILL.md`. As do próprio projeto:

| Skill | Para quê |
|---|---|
| `testes` | escrever, rodar e depurar testes |
| `devops` | Docker, CI e deploy |
| `mudar-regra` | mudar regra do jogo nos dois motores e nas réplicas |
| `novo-evento` | criar ou mudar evento do protocolo |

Subagentes ficam em `.claude/agents/<nome>.md`. Só há o `revisor`, de leitura;
como chamar está em "Revisão por agente" no [convencoes.md](convencoes.md).

As skills **externas** são instaladas com a
CLI `npx skills`, que copia a skill pra `.claude/skills/` e registra origem,
commit e hash em `skills-lock.json`:

| Skill | Origem | Para quê |
|---|---|---|
| `find-skills` | `vercel-labs/skills` | procurar e instalar outras skills (`npx skills find <termo>`) |

- Instalar no projeto, só pro Claude Code e como cópia (symlink é ruim no
  Windows): `npx skills add <owner/repo> --skill <nome> --agent claude-code --copy -y`.
- Restaurar a partir do lock: `npx skills experimental_install`. Atualizar:
  `npx skills update -p`.
- Leia o `SKILL.md` antes de usar: a skill roda com todas as permissões do
  agente. Skill nova entra na tabela acima.

## Fluxo de uma partida, ponta a ponta

1. Cliente conecta o socket e autentica (`verificarNome` → `entrar` /
   `cadastrar` / `entrarComoConvidado`, ou `retomarSessao` com token salvo).
2. `criarSala` (vira adm) ou `listarSalas` + `entrarSala`, ou `partidaRapida`.
   Bots podem preencher assentos (`botNumber`).
3. Sala lota → `partidaIniciandoEm` → após a espera (15s, ou `forcarInicio`
   do adm) o `GameController` começa.
4. Cada rodada: distribuição (`suaMao` privado), `manilhaVirada`, apostas em
   ordem (`turnoAposta`/`apostaFeita`), vazas (`turnoJogador`/`cartaJogada`/
   `vazaFinalizada`), `rodadaFinalizada` com perda de vida.
5. Eliminações (`jogadoresEliminados`, `fichasGanhas` privado) até sobrar um
   (`jogoFinalizado`). Adm pode chamar `jogarDeNovo` (revanche).
6. Quem cai: timeout de turno → bot joga por ele; inatividade → socket sai
   da sala mas a vaga fica reservada (reconectar); reserva expira → bot pra
   sempre.
