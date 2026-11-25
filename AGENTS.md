# AGENTS.md — Contra ZAP

Instruções para agentes de IA (Claude Code, Codex, Copilot etc.) que
trabalham neste repositório.

## O projeto em 30 segundos

Jogo de cartas multiplayer no navegador (estilo truco/"fodinha": aposta de
vazas, perde vida pela diferença, último vivo vence), com bots treinados por
aprendizado por reforço. Back-end Node.js 22 (ESM) + Express + Socket.IO +
SQLite; front-end React + Vite em `public/app/`; treino de bots em Python em
`training/`. Tudo — código, comentários, commits e docs — é em **português**.

## Documentação

A documentação para agentes fica em **[`docs/projeto/`](docs/projeto/README.md)**.
Comece pelo índice e leia o arquivo da área que você vai tocar:

| Arquivo | Conteúdo |
|---|---|
| [`docs/projeto/README.md`](docs/projeto/README.md) | índice e lista das outras fontes de verdade |
| [`docs/projeto/visao-geral.md`](docs/projeto/visao-geral.md) | o que é, stack, arquitetura, mapa de pastas, comandos, fluxo de uma partida |
| [`docs/projeto/regras-do-jogo.md`](docs/projeto/regras-do-jogo.md) | regras implementadas e glossário dos termos do código |
| [`docs/projeto/motor.md`](docs/projeto/motor.md) | `game/` — Game, Rodada, Mesa, Baralho, GameController |
| [`docs/projeto/servidor-e-conexao.md`](docs/projeto/servidor-e-conexao.md) | `Server.js` e `conexao/` — protocolo, salas, auth, banco, carteira, chat |
| [`docs/projeto/bots.md`](docs/projeto/bots.md) | `bots/` — BotBrain, redes, catálogo de modelos |
| [`docs/projeto/treino.md`](docs/projeto/treino.md) | `training/` — RL, ponte JS↔Python, motor Python |
| [`docs/projeto/front-end.md`](docs/projeto/front-end.md) | `public/app/` — telas, mesa, labs |
| [`docs/projeto/testes.md`](docs/projeto/testes.md) | suítes, helpers, E2E, relatório |
| [`docs/projeto/infra.md`](docs/projeto/infra.md) | Docker, CI, deploy, observabilidade, variáveis de ambiente |
| [`docs/projeto/convencoes.md`](docs/projeto/convencoes.md) | princípios e **pares de arquivos que precisam mudar juntos** |

Fontes de verdade que continuam valendo (a doc acima aponta para elas, não
as substitui): `conexao/PROTOCOLO.md` (contrato socket.io),
`conexao/eventos.js`, `docs/asyncapi.yaml`, `README.md`, `DEV.md`,
`docs/backlog.md` (o que falta fazer), e as skills em `.claude/skills/` (`testes`, `devops`, `mudar-regra`, `novo-evento`
e a externa `find-skills`, instalada com `npx skills` e travada em
`skills-lock.json` — ver "Skills e agentes" em `docs/projeto/visao-geral.md`).

## Regra obrigatória: documentação acompanha o código

**Sempre que você modificar ou adicionar algo no projeto, atualize a
documentação na mesma mudança.** Uma tarefa não está concluída enquanto a
documentação estiver desatualizada.

Na prática, antes de encerrar qualquer tarefa que alterou arquivos:

1. **Identifique o que mudou** — arquivo novo, removido ou renomeado;
   comportamento, regra, evento, configuração, comando, variável de
   ambiente, dependência, fluxo.
2. **Atualize o arquivo correspondente em `docs/projeto/`**:
   - arquivo/módulo novo → adicione à tabela da área (e ao mapa de pastas em
     `visao-geral.md` se for pasta nova);
   - arquivo removido/renomeado → remova/corrija todas as menções
     (procure o nome em `docs/projeto/` e `AGENTS.md`);
   - comportamento ou regra alterada → corrija a descrição;
   - assunto novo que não cabe em nenhum arquivo → crie um `.md` novo em
     `docs/projeto/` e adicione-o ao índice (`docs/projeto/README.md`) e à
     tabela acima.
3. **Atualize as outras fontes de verdade afetadas** — consulte a tabela
   "Pares que andam juntos" em `docs/projeto/convencoes.md` (ex.: evento novo
   exige `PROTOCOLO.md` + `asyncapi.yaml` + testes; regra nova exige o motor
   Python).
4. **Não duplique**: se o detalhe já vive em `PROTOCOLO.md`, `DEV.md` ou numa
   skill, a doc de `docs/projeto/` só resume e aponta.
5. Mantenha o estilo: português, direto, tabelas para inventário de
   arquivos, caminhos relativos à raiz, sem prometer coisas que o código não
   faz. Se encontrar documentação errada mesmo fora do escopo da tarefa,
   corrija ou avise.

## Regras rápidas de trabalho

- Leia `docs/projeto/convencoes.md` antes de mudar código.
- Respeite as camadas: `game/` sem rede; só `conexao/socketServer.js` conhece
  socket.io; só `conexao/db.js` fala SQL.
- Nunca escreva nome de evento/código de erro como string — importe de
  `conexao/eventos.js`.
- Módulos compartilhados com o front (`conexao/limites.js`, `conexao/loja.js`,
  `conexao/chat/mensagensChat.js`, `bots/modelosBot.js`, `bots/rede.js`,
  `bots/observacao.js`) devem continuar puros (sem `node:*`).
- Testes: `npm test` (API/bots/docs/paridade/unitários), `npm run test:unit` (só os
  unitários de `game/` e `conexao/`), `npm run test:e2e` (Playwright). Ao mexer
  em `conexao/` ou `game/`, use a skill `testes`; para mudar regra do jogo,
  `mudar-regra`; para evento do protocolo, `novo-evento`.
- Terminou mudança em `game/`, `conexao/`, `bots/` ou `training/`? Chame o
  subagente `revisor` (ver "Revisão por agente" em `docs/projeto/convencoes.md`).
- Front: mudanças em `public/app/src` só aparecem no servidor depois de
  `npm run build` em `public/app` (ou use `npm run dev` na 5173).
- Não commite `banco.sqlite*`, `jwt.secret`, `.env`, `public/dist/` nem
  artefatos de treino. Trabalhe em branch; a `main` é deployada toda noite.
