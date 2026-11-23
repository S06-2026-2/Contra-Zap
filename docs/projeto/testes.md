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
| `game/*.test.js`, `conexao/*.test.js` | `node --test` | `node --test game/*.test.js conexao/*.test.js` | **não** (fora do glob do `npm test` — backlog no DEV.md) |
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

## Documentação da API como teste

`tests/docs/asyncapi.test.js` exige que todo evento de `conexao/eventos.js`
tenha canal em `docs/asyncapi.yaml` (e vice-versa) e que os números do
cabeçalho da spec batam. O CI ainda valida a forma das specs (Redocly,
AsyncAPI CLI) e roda a coleção do Postman com Newman.
