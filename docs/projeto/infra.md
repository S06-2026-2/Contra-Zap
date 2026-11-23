# Infra, CI/CD e operação

Gotchas aprofundados em `.claude/skills/devops/devops-playbook.md` e
`DEV.md` → "Docker", "CI/CD" e "Backlog de operação". Rode
`bash diagnostico.sh` antes de depurar ambiente.

## Docker

`Dockerfile` multi-stage, **Node 22 Alpine**:

1. `frontend-builder`: `npm ci` em `public/app`, depois `COPY . .` (o front
   importa `conexao/` e `bots/`) e `npm run build` → `/app/public/dist`.
2. `backend-deps`: `apk add python3 make g++` e `npm ci --omit=dev` (o
   `better-sqlite3` precisa compilar no Alpine/musl).
3. Final: copia `node_modules`, `package.json`, `Server.js`, `GameStart.js`,
   `banco.json`, `conexao/`, `game/`, `bots/`, `observabilidade/` e o
   `public/dist`. `NODE_ENV=production`, `PORT=3000`, `HEALTHCHECK` em
   `/health`. **Pasta nova de back-end precisa entrar nessa lista explícita.**

Não troque a versão do Node sem confirmar compatibilidade com
`better-sqlite3` (Node < 22 dá segfault).

`docker-compose.yml`: monta `banco.sqlite` e `jwt.secret` como arquivos
(rode `touch banco.sqlite jwt.secret` antes do primeiro `up`, senão o Docker
cria diretórios).

## Variáveis de ambiente

| Variável | Onde | Efeito |
|---|---|---|
| `PORT` | `Server.js` | porta (default 3000) |
| `NODE_ENV` | `conexao/db.js` | `production` pula o seed de `banco.json` |
| `DB_PATH` | `conexao/db.js` | caminho do SQLite (default `banco.sqlite` na raiz) |
| `JWT_SECRET` | `conexao/jwt.js` | segredo do JWT (senão usa/gera `jwt.secret`) |
| `VERIFICAR_NOME_MAX`, `ENTRAR_MAX`, `CADASTRAR_MAX` | `Server.js` | tetos de rate limit por IP |
| `E2E_SERVIDOR_EXTERNO`, `CI`, `RELATORIO_TELAS` | `playwright.config.js`, testes | controle do E2E/relatório |
| `DOCS_PORT`, `JOGO_HOST`, `JOGO_PORT` | `docs/servir.js` | servidor da documentação de API |
| `EVAL_SEED`, `COM_FLAG_APOSTOU`, `COM_MEMORIA_CARTAS` | `training/env_bridge.js` | treino |

## CI (`.github/workflows/ci.yml`)

Em push/PR para `main`: `docker-build` (imagem exportada como artifact) →
`test` (`npm ci` + `npm test`, Node 22) → em paralelo `docs` (lint OpenAPI
com Redocly, validação AsyncAPI, sobe o servidor e roda Newman na coleção do
Postman) e `e2e` (roda a imagem com `NODE_ENV=test`, banco temporário e rate
limits altos na porta 3100; Playwright com `E2E_SERVIDOR_EXTERNO=true`).

## Deploy (`.github/workflows/deploy-noturno.yml`)

O deploy automático do Railway não funciona em repositório de organização,
então existe um workflow agendado: todo dia às **03:00 de Brasília** (06:00
UTC) ou manual (`workflow_dispatch`, com opção `forcar`). Ele compara `HEAD`
da `main` com a tag `ultimo-deploy`; se há commit novo **e** o CI está verde
nesse commit, roda `railway up --service ... --ci` e move a tag. Precisa do
secret `RAILWAY_TOKEN` (e opcionalmente da variável `RAILWAY_SERVICE`).

## Observabilidade

- `observabilidade/metricas.js`: registro `prom-client` com métricas
  padrão de processo + `contrazap_partidas_ativas`,
  `contrazap_jogadores_conectados`, latência de decisão do bot etc. Exposto
  em `GET /metrics`. Só define métricas e exporta funções `registrar*`.
- `observabilidade/prometheus/`: imagem e config do Prometheus que faz scrape
  da produção.
- Logs ainda em `console.*` puro (backlog).

## Limitações conhecidas

Single-process com estado em memória (sem adapter do Socket.IO) → não escala
horizontalmente; restart derruba salas/partidas. Sem HTTPS próprio (fica a
cargo da plataforma).
