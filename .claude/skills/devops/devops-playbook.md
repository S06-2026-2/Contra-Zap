---
name: contra-zap-devops
description: Playbook operacional de DevOps/infra do projeto Contra-Zap (jogo de cartas multiplayer com bots de ML). Use SEMPRE que a tarefa envolver build, teste, debug ou deploy do Contra-Zap — Docker, docker-compose, CI/CD do GitHub Actions, o Dockerfile multi-stage, a versão exigida do Node, o healthcheck, o shutdown gracioso, ou qualquer erro ao subir o container (segfault, EADDRINUSE, ENOENT, exit code 137/139, banco não persiste). Também use para orientar deploy em staging (Railway) e para decisões de arquitetura de infra do projeto. Não é uma skill genérica de Docker — é específica dos gotchas e da estrutura real deste repositório.
---

# Contra-Zap — DevOps Playbook

Conhecimento operacional acumulado durante a containerização do Contra-Zap.
A maior parte disso não é intuitivo nem documentado em lugar nenhum além
daqui — foi descoberto via debug real, então siga isto ao pé da letra antes
de tentar "resolver do jeito óbvio", porque o jeito óbvio já foi tentado e
falhou pelo menos uma vez.

## Visão geral do projeto (o que importa pra infra)

- **Stack**: Node.js (ESM, `"type": "module"`) + Express + Socket.IO no
  backend; React + Vite no frontend (`public/app/`); SQLite via
  `better-sqlite3` para persistência.
- **Estrutura relevante**:
  - `Server.js` — entrypoint; exporta `criarServidor()` (reusado pelos
    testes) e só chama `server.listen()` quando é o módulo principal.
  - `conexao/db.js` — única peça que fala SQL. Abre `banco.sqlite` em modo
    **WAL**. Pula seed de contas fixture quando `NODE_ENV=production`.
  - `public/app/` — frontend React/Vite. **Importa arquivos de fora da
    própria pasta** (ex.: `conexao/limites.js`, `conexao/chat/mensagensChat.js`)
    para compartilhar regras de validação com o backend. Isso tem
    implicações diretas no Dockerfile (ver seção Build).
  - `tests/` — suíte E2E via `node --test`, sobe o servidor de verdade
    (via `criarServidor()`) numa porta efêmera.

## Requisito crítico: Node ≥ 22

`better-sqlite3@13` **exige Node ≥ 22**. Rodar em Node 20 não dá erro
óbvio — o binário nativo carrega, mas **crasha com segfault (exit code
139)** só quando de fato tenta abrir/usar o banco, por incompatibilidade
de ABI entre o addon nativo e o runtime. Sintomas típicos se isso
acontecer de novo:
- `node -e "import('better-sqlite3')"` funciona sozinho, mas
  `new Database(...)` trava com `Segmentation fault` sem stack trace
  nenhum (crash em nível de C, não capturável em JS).
- Aviso `npm warn EBADENGINE` mencionando `required: { node: '>=22' }`
  durante `npm ci` é o sinal mais direto — não ignore esse warning.

**Sempre confirme a versão do Node no `Dockerfile` e em qualquer imagem
CI antes de mexer em dependências.**

## Build: por que o Dockerfile é multi-stage do jeito que é

```
Stage 1 (frontend-builder): node:22-alpine
  - COPY package.json/lock de public/app primeiro (cache de layer)
  - RUN npm ci
  - COPY . . (o PROJETO INTEIRO, não só public/app!)
  - RUN npm run build
Stage 2 (backend-deps): node:22-alpine
  - apk add python3 make g++ (compilar o addon nativo do better-sqlite3)
  - RUN npm ci --omit=dev
Stage 3 (final): node:22-alpine
  - Copia só node_modules do stage 2, código do backend, e public/dist
    do stage 1 — SEM ferramentas de build na imagem final
```

**Por que `COPY . .` no stage 1, e não só `COPY public/app/.`:** o
frontend importa arquivos fora da própria pasta (ver acima). Copiar só
`public/app` faz o `vite build` falhar com `UNRESOLVED_IMPORT` porque os
imports relativos (`../../../../conexao/limites.js`) não encontram o
arquivo. **Isso já foi revertido sem querer uma vez por um merge de
colega com Dockerfile desatualizado — se o build do frontend voltar a
falhar com `UNRESOLVED_IMPORT`, confira essa linha primeiro.**

**Por que Alpine, e por que ainda assim precisa de `python3 make g++`:**
o prebuild pronto do `better-sqlite3` não cobre a combinação exata
Node 22 + musl (Alpine) + arm64 — cai pra compilar do zero, e o Alpine
não vem com Python por padrão (`node-gyp` precisa dele).

## Runtime: shutdown gracioso e persistência do banco

O banco roda em modo WAL (`db.pragma('journal_mode = WAL')`). Isso
significa que escritas recentes ficam num arquivo auxiliar
(`banco.sqlite-wal`) até a conexão ser fechada corretamente — só aí o
SQLite faz o checkpoint de volta pro arquivo principal.

**Consequência prática**: matar o container sem fechar o banco direito
(`db.close()`) faz contas cadastradas **sumirem** no próximo
`docker compose up`, mesmo com os volumes montados certos. `Server.js`
já trata isso — `SIGTERM`/`SIGINT` disparam `encerrarGraciosamente()`,
que fecha servidor HTTP, Socket.IO e banco nessa ordem antes de
`process.exit(0)`. **Não remova esse handler.** Ele fica fora de
`criarServidor()` de propósito (registrar em cada chamada de teste
acumularia listeners).

Se voltar a ver conta sumindo depois de rebuild: primeiro confirme que
os volumes do `docker-compose.yml` não foram comentados de novo (ver
próxima seção) — já aconteceu.

## docker-compose.yml: pontos de atenção

- **Volumes de `banco.sqlite`/`jwt.secret` precisam estar descomentados.**
  Se alguém comentar pra debugar algo (ex.: testar se bind mount causa
  algum problema), **reverter é obrigatório** antes de mergear — já
  esquecemos isso uma vez e ficamos rebuildando sem persistência por um
  tempo sem perceber.
- Antes do primeiro `up`, criar os arquivos vazios manualmente:
  `touch banco.sqlite jwt.secret` — sem isso, o Docker cria **diretórios**
  no lugar (já que o path não existe ainda no host), quebrando o bind
  mount.
- **Não hardcode `platform:`** (ex.: `linux/arm64`). Já causou build
  quebrado em CI (`amd64`) quando deixado de um debug específico de Mac
  Apple Silicon. O Docker resolve a plataforma certa sozinho.

## Script de diagnóstico automatizado

Antes de seguir o checklist manual abaixo, rode o script empacotado nessa
skill: `scripts/diagnostico.sh`. Ele checa automaticamente boa parte dos
pontos que historicamente causaram problema (versão do Node no Dockerfile,
volumes comentados no compose, `banco.sqlite`/`jwt.secret` virando
diretório em vez de arquivo, porta 3000 ocupada, build do frontend
ausente, `.dockerignore` incompleto).

Quando o usuário reportar qualquer erro de Docker/build/container do
Contra-Zap, sugira rodar isso primeiro, na raiz do projeto:

```bash
bash scripts/diagnostico.sh
```

(Se o script ainda não estiver copiado pro projeto, copie-o da skill pra
raiz do repositório antes.) Interprete a saída antes de propor qualquer
correção manual — na maioria dos casos já aponta a causa direto, evitando
repetir o processo de tentativa-e-erro documentado no checklist abaixo.

## Checklist de diagnóstico rápido (nessa ordem)

Quando `docker compose up` falhar ou o container ficar reiniciando:

1. **`exited with code 139`** → segfault. Suspeite primeiro de
   versão errada do Node (ver seção acima). Teste isolado:
   `docker compose run --rm --entrypoint sh <serviço>` e depois
   `node -e "import('better-sqlite3').then(m => new m.default('teste.db'))"`
   dentro do container — se isso sozinho já crashar, é ABI/versão do
   Node, não é bug do código do projeto.
2. **`exited with code 0` mas nunca aparece "Servidor rodando em..."**
   → o bloco de entrypoint (`if (process.argv[1] && ...)`) não está
   sendo executado. Provável causa: edição manual quebrou o escopo de
   chaves do `Server.js` (aconteceu — uma rota `/health` duplicada
   "prendeu" o resto do arquivo dentro de `criarServidor()`, que nunca é
   chamada de fora). Rode `node --check Server.js` local antes de
   buildar a imagem — pega esse tipo de erro estrutural sem precisar de
   Docker.
3. **`EADDRINUSE :::3000`** → outro processo (geralmente um container
   anterior que ficou de pé, ou um `npm start` local esquecido) já está
   na porta. `lsof -i :3000` no Mac pra achar o PID.
4. **`ENOENT ... public/dist/index.html`** → o build do frontend não
   rodou. Se for rodando `npm start` direto (sem Docker), rode
   `cd public/app && npm run build` manualmente primeiro. Se for
   Docker, confira o stage `frontend-builder` (ver seção Build acima).
5. **`Cannot open ... .node` / erro de path em `better_sqlite3.node`**
   → confirme que não voltou a usar uma imagem base errada (glibc vs
   musl) sem reinstalar dependências com `--no-cache`.
6. **Exit code 137 esporádico só no `docker compose down` (não no
   `kill -s TERM` direto)**: já observamos isso mesmo com o shutdown
   gracioso funcionando corretamente (logs de "banco fechado" aparecem
   antes do 137). Pode ser um bug cosmético de report de exit code do
   Docker Desktop no Mac. Não persiga isso — valide o que importa de
   verdade: **os dados persistiram?** Teste fazendo login com a conta
   criada antes do restart.

## CI/CD (GitHub Actions)

Pipeline em `.github/workflows/ci.yml`: `npm test` (Node 22) + build da
imagem Docker, em paralelo/sequência a cada push/PR pra `main`.

- Se o CI reportar 0 falhas suspeitosamente rápido, verifique se
  `tests/**/*.test.js` não está sendo ignorado no `.gitignore` — já
  aconteceu dos testes existirem só localmente e o CI rodar "verde" sem
  testar nada de verdade.
- Runners do GitHub Actions são `amd64` — qualquer coisa hardcoded pra
  `arm64` (ver nota sobre `platform:` acima) quebra especificamente aqui,
  mesmo funcionando local no Mac.

## Deploy (staging)

Plano: Railway (plano Hobby, ~$5/mês) em vez de Fly.io/Render — evita
cold start (ruim pra jogo multiplayer com WebSocket) e não depende mais
de free tier, que ambos os concorrentes removeram. Variáveis de ambiente
mínimas a configurar na plataforma: `NODE_ENV=production`,
`PORT` (a plataforma injeta a dela — `Server.js` já lê de
`process.env.PORT`, não precisa setar manualmente na maioria dos casos).

## Antes de mexer em qualquer um desses arquivos

`Dockerfile`, `docker-compose.yml`, `.dockerignore`, `.github/workflows/ci.yml`
— **dê um `git pull` antes de editar localmente.** Já tivemos duas
regressões nessa sessão por edição feita em cima de versão desatualizada
(uma vez com o próprio autor deste histórico, outra vez por um colega de
time). Branch protection exigindo PR atualizado com a `main` resolveria
isso de forma estrutural, se/quando o dono do repo configurar.