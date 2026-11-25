# Convenções e pontos de sincronização

Leia antes de qualquer mudança. A maioria dos bugs "silenciosos" deste
projeto vem de mudar um lado de um par e esquecer o outro.

## Princípios

- **Português** em código, identificadores, comentários, commits e docs.
- **Camadas isoladas**: `game/` não conhece rede; só `conexao/socketServer.js`
  conhece socket.io; só `conexao/db.js` fala SQL; `observabilidade/metricas.js`
  só define métricas. Mantenha essa separação ao adicionar código.
- **Sem strings soltas de protocolo**: nomes de evento e códigos de erro vêm
  sempre de `conexao/eventos.js`.
- **Comentários explicam o porquê** (decisões, armadilhas, histórico). O
  projeto comenta bastante — siga o mesmo estilo e atualize comentários que
  ficarem mentirosos.
- **Erros de domínio** são classes com `codigo` (`ErroSala`, `ErroLogin`,
  `ErroCadastro`, `ErroConvidado`, `ErroSessao`, `ErroChat`, `ErroCarteira`)
  que o `socketServer` converte em `{ ok: false, codigo, mensagem }`.
- **Tempos injetáveis**: timers de sala/partida são opções de construtor
  (testes usam valores curtos). Não hardcode tempo dentro de método.
- **Fail-fast em invariante**: estado impossível no motor lança (vira
  `partidaAbortada`), não é "tratado" com null.
- Ids de bot e convidado vêm **só** de `game/idEfemero.js`.

## Fontes únicas compartilhadas (front e back importam o mesmo arquivo)

Precisam continuar **puras** (sem `node:*`, sem banco, sem socket):

- `conexao/limites.js`, `conexao/loja.js`, `conexao/chat/mensagensChat.js`
- `bots/modelosBot.js`, `bots/rede.js`, `bots/observacao.js`
- `game/*` usado pelo `/lab`

## Pares que andam juntos (mudou um, mude o outro)

| Se mudar… | …mude também |
|---|---|
| evento/erro em `conexao/eventos.js` | `conexao/PROTOCOLO.md`, `docs/asyncapi.yaml` (+ contagem no cabeçalho), testes em `tests/api/`, front (`meetfront1/Partida.jsx`, `Lobby.jsx`, `App.jsx`) |
| regra em `game/` | `training/python/motor/` (porte fiel; `tests/paridade/motores.test.js` acusa), `docs/projeto/regras-do-jogo.md`, réplicas visuais em `Carta.jsx`/`MesaExperimento.jsx` |
| embaralhamento/rng/ordem de construção do baralho | `training/python/motor/rng.py`/`baralho.py`, `game/seed.test.js` e `training/python/test_seed.py` |
| formato da observação/máscaras | `bots/observacao.js` ↔ `training/env_bridge.js` ↔ `training/python/harness_round1.py`/`harness_nativo.py` (e retreinar) |
| duração de animação no front | `game/animacoesFront.js` |
| `PAUSA_VAZA_MS` (`meetfront1/Partida.jsx`) | `pausaVazaMs` em `game/GameController.js` |
| sprites em `public/app/src/assets/chapeus/` | `CHAPEUS_LOJA` em `conexao/loja.js` e `calibracao-chapeus.csv` |
| catálogo de bots / `bots/models/*.json` | `bots/modelosBot.js`, `tests/bots/modelosBot.test.js` |
| nova pasta de back-end | lista de `COPY` do `Dockerfile` |
| nova variável de ambiente | `docs/projeto/infra.md` (tabela) e, se for de produção, Railway/compose |
| rota HTTP | `docs/openapi.yaml`, `postman/` |
| agente em `.claude/agents/` | a seção "Skills e agentes" de `docs/projeto/visao-geral.md` |
| skill externa instalada/removida (`npx skills`) | `skills-lock.json` (a CLI cuida) e a tabela "Skills e agentes" em `docs/projeto/visao-geral.md` |
| arquivo renomeado ou removido; skill em `.claude/skills/` | menções em `AGENTS.md`, `docs/projeto/` e skills (`tests/docs/agentes.test.js` acusa parte delas; alcance em [testes.md](testes.md)) |
| algo listado em `docs/backlog.md` | o item (remover ou encurtar, ver a skill `backlog`) |
| comando, porta, pré-requisito | `README.md` e `docs/projeto/visao-geral.md` |

## Revisão por agente

O subagente `.claude/agents/revisor.md` confere uma mudança contra este
arquivo. Só tem ferramentas de leitura, então quem chama entrega:

1. o pedido original;
2. o caminho de um arquivo temporário, fora do repositório, com a saída de
   `git diff HEAD`;
3. a lista de arquivos novos (`git ls-files --others --exclude-standard`);
4. os testes executados e o resultado.

Não passe a sua justificativa da solução: a revisão vale por não partir dela.
Corrija o que for "Bloqueia" e revise de novo, no máximo duas vezes; o que
sobrar vai para a pessoa decidir. Discordou de um achado? Explique no resumo em
vez de ignorar. Agente sem suporte a subagentes segue o mesmo arquivo como
checklist. A revisão não substitui o CI nem a revisão humana do PR.

## Git e entrega

- Branch padrão `main`; trabalhe em branch e abra PR (o CI roda em PR).
- Deploy é noturno a partir da `main` com CI verde (ver [infra.md](infra.md)).
- Não commitar `banco.sqlite*`, `jwt.secret`, `.env`, `public/dist/`,
  artefatos de treino.
- `banco.json` tem senhas de fixture em texto puro — só pra dev/teste.
