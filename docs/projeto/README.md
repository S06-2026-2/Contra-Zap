# Documentação do projeto (para agentes de IA)

Documentação de **o que é cada coisa e como funciona** no Contra ZAP, escrita
pra que um agente de IA (ou uma pessoa nova no time) consiga se localizar no
código sem ler tudo. As regras de manutenção destes arquivos estão no
[`AGENTS.md`](../../AGENTS.md) da raiz.

## Índice

| Arquivo | Assunto | Leia quando for mexer em… |
|---|---|---|
| [visao-geral.md](visao-geral.md) | O que é o projeto, stack, mapa de pastas, comandos | qualquer coisa (comece aqui) |
| [regras-do-jogo.md](regras-do-jogo.md) | Regras do jogo em linguagem de domínio + glossário | regras, motor, bots |
| [motor.md](motor.md) | `game/`: Game, Rodada, Mesa, Baralho, GameController | lógica de partida |
| [servidor-e-conexao.md](servidor-e-conexao.md) | `Server.js`, `conexao/`: socket, salas, auth, banco, carteira, chat | back-end, protocolo |
| [bots.md](bots.md) | `bots/`: BotBrain, redes, catálogo de modelos | jogada automática, IA em produção |
| [treino.md](treino.md) | `training/`: RL, ponte JS↔Python, motor Python | treino/avaliação de bots |
| [front-end.md](front-end.md) | `public/app/`: React, telas, mesa, labs | interface |
| [testes.md](testes.md) | `tests/`, testes unitários, E2E, relatório | testes |
| [infra.md](infra.md) | Docker, CI, deploy Railway, observabilidade, variáveis de ambiente | build, deploy, operação |
| [convencoes.md](convencoes.md) | Fontes únicas, pares que precisam andar juntos, estilo | **antes de qualquer mudança** |

## Outras fontes de verdade (não duplicar aqui)

Estes documentos já existem e continuam sendo a referência detalhada do seu
assunto. A documentação deste diretório **aponta** pra eles em vez de copiar:

- `conexao/PROTOCOLO.md` — contrato completo dos eventos socket.io (payloads, erros, casos de borda).
- `conexao/eventos.js` — vocabulário do protocolo (nomes de evento e códigos de erro).
- `docs/asyncapi.yaml` / `docs/openapi.yaml` — specs formais (validadas no CI).
- `README.md` — como rodar o projeto.
- `DEV.md` — workflow de front, Docker, CI e treino.
- `docs/backlog.md` — bugs, pendências e o que falta fazer.
- `.claude/skills/testes/` — como escrever e depurar testes (convenções e armadilhas).
- `.claude/skills/devops/SKILL.md` — gotchas de Docker/CI/deploy.
- `.claude/skills/mudar-regra/` e `.claude/skills/novo-evento/` — passo a passo das mudanças que atravessam várias áreas.
- `.claude/skills/backlog/` — como consultar e manter o `docs/backlog.md`.
- `.claude/agents/revisor.md` — subagente de leitura que confere a mudança contra as convenções.
- `.claude/skills/find-skills/` — skill externa (via `npx skills`, travada em `skills-lock.json`) pra procurar e instalar outras skills; ver "Skills e agentes" em [visao-geral.md](visao-geral.md).
- `postman/README.md` — exploração manual do protocolo.
