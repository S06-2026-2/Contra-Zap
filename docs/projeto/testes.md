# Testes

Guia completo (convenções, armadilhas, helpers) na skill
`.claude/skills/testes/SKILL.md` — **leia antes de escrever teste**. Aqui só
o mapa.

## Suítes

| Onde | Runner | Comando | No CI? |
|---|---|---|---|
| `tests/api/` | `node --test` | `npm test` / `npm run test:api` | sim |
| `tests/bots/` | `node --test` | `npm test` | sim |
| `tests/docs/asyncapi.test.js` | `node --test` | `npm test` | sim |
| `tests/docs/agentes.test.js` | `node --test` | `npm test` | sim |
| `tests/paridade/motores.test.js` | `node --test` + Python 3 | `npm test` | sim |
| `game/*.test.js`, `conexao/*.test.js` | `node --test` | `npm test` / `npm run test:unit` | sim (o primeiro import é `tests/helpers/ambiente.js`, que isola o banco) |
| `tests/e2e/*.spec.js` | Playwright | `npm run test:e2e` (1ª vez: `npx playwright install chromium`) | sim (contra o container Docker) |
| `training/python/test_*.py` | `unittest` na venv | em `training/python`: `..\.venv\Scripts\python.exe -m unittest test_seed -v` | não |

## Como os testes de API funcionam

- `tests/helpers/ambiente.js` roda **antes** de qualquer módulo do projeto e
  aponta `DB_PATH` pra um SQLite temporário e `JWT_SECRET` fixo — rodar a
  suíte não toca no seu `banco.sqlite` nem no `jwt.secret`.
- `tests/helpers/servidor.js` → `subirServidor()`: o `criarServidor()` real
  numa porta efêmera, com `TEMPOS_DE_TESTE` curtos (início automático alto,
  use `forcarInicio`).
- `tests/helpers/cliente.js` → `ClienteDeTeste`: ack como Promise com timeout
  e buffer de **todos** os eventos desde a conexão (`esperar()` olha o que já
  chegou) — evita corrida com eventos que chegam antes do ack.
- `tests/helpers/protocolo.js` → atalhos só via protocolo: `convidado()`,
  `salaCheia()`, `partidaEmAndamento()`, `jogarSozinho()`, `nomeUnico()`.
- Sempre importe nomes de evento/erro de `conexao/eventos.js`.

## Paridade dos motores

`tests/paridade/motores.test.js` joga 150 partidas inteiras (mesma seed e
mesmas decisões) no `GameController` e no motor Python, este via
`training/python/paridade_motor.py`, e exige registros iguais passo a passo:
distribuição, apostas e recusas, cartas, vazas, placar e vencedor. Também
exige que os cenários passem pelas regras sensíveis (melada, rodada de 1
carta, `maxDeck`, desempate…). Regra nova que os cenários não exercitam pede
entrada nova em `medirCobertura`.

Procura o Python em `PYTHON`, na venv de `training/`, `python3` e `python`. Sem
Python 3, pula na máquina local e **falha no CI**. Não cobre o que só existe
no JS (desistência, timeout, bots, reconexão) nem as máscaras do treino.

## E2E

`playwright.config.js` builda o front e sobe o `Server.js` na **3100** com
banco temporário e rate limits afrouxados. Com `E2E_SERVIDOR_EXTERNO=true`
não sobe nada (o CI usa o container). `tests/e2e/fixtures.js` tem o
`Jogador` (contexto isolado, login e ações pela UI). Contas fixture vêm de
`banco.json` (por isso o E2E usa `NODE_ENV=test`).

## Relatório

`npm run test:relatorio [-- api|e2e]` roda as suítes com cobertura e prints e
gera `relatorio-testes/index.html` (`tests/relatorio/`: `gerar.js` roda,
`pagina.js` desenha, `areas.js` tem os textos, `reporterNode.js`).

## Documentação como teste

`tests/docs/agentes.test.js` exige que toda pasta de `.claude/skills/` tenha
`SKILL.md` com `name` igual ao da pasta e `description`, que cada agente de
`.claude/agents/` tenha o mesmo e declare `tools` (o `revisor`, só de leitura),
e que os arquivos e pastas (terminadas em `/`) citados entre crases, e os
links, no `AGENTS.md`, em `docs/projeto/`, nos agentes e nas skills próprias
existam. Ficam de fora: blocos de código, arquivos sem extensão (`Dockerfile`)
ou de extensão que a regex `CAMINHO` não lista, e os outros documentos
(`README.md`, `DEV.md`, `conexao/PROTOCOLO.md`). Um caminho curto passa se
qualquer arquivo ou pasta terminar com ele. Não julga se o texto está certo.

`tests/docs/asyncapi.test.js` exige que todo evento de `conexao/eventos.js`
tenha canal em `docs/asyncapi.yaml` (e vice-versa) e que os números do
cabeçalho da spec batam. O CI ainda valida a forma das specs (Redocly,
AsyncAPI CLI) e roda a coleção do Postman com Newman.
