# Servidor e camada de conexão (`Server.js`, `conexao/`)

**Não existe API REST.** O HTTP serve só `/health`, `/metrics`, o build do
front e o fallback de SPA. Toda a API de verdade é o **protocolo socket.io**
documentado em `conexao/PROTOCOLO.md` (fonte de verdade) com vocabulário em
`conexao/eventos.js`.

## `Server.js`

- `criarServidor({ salaManager, limitesDeTaxa })` monta Express + Socket.IO
  (`pingInterval` 10s, `pingTimeout` 15s) **sem escutar porta** — os testes
  chamam isso com tempos curtos numa porta efêmera.
- Rotas: `GET /metrics` (Prometheus, sem auth), estático de `public/dist`
  (`index.html` sem cache, `assets/` imutável), `GET /health` (faz
  `SELECT 1`; 200 `{status:'ok'}` ou 503), `GET /*splat` → `index.html` só
  pra `Accept: text/html`.
- Só faz `listen` quando é o módulo principal (`PORT`, default 3000). Aí
  também liga encerramento gracioso (SIGTERM/SIGINT fecha HTTP, socket e
  `db.close()` pra mesclar o WAL) e loga exceções não capturadas em vez de
  morrer.
- `lerLimitesDoAmbiente()`: `VERIFICAR_NOME_MAX`, `ENTRAR_MAX`,
  `CADASTRAR_MAX` sobrescrevem os tetos de rate limit (usado no E2E).

## Arquivos de `conexao/`

| Arquivo | Responsabilidade | Conhece socket? |
|---|---|---|
| `PROTOCOLO.md` | contrato de todos os eventos, payloads e erros | — |
| `eventos.js` | `EventosCliente`, `EventosServidor`, `CodigosErro` (nunca use string literal) | não |
| `socketServer.js` | `registrarSocketServer(io, salaManager, limites)`: handlers de todos os eventos, mapas socket↔jogador↔sala, rate limit, retransmissão dos eventos do controller (`ligarControllerASala`), disconnect | **sim (único)** |
| `SalaManager.js` | criar/entrar/listar/sair de sala, partida rápida, jogar de novo, forçar início, repassa jogada/aposta/reconexão ao controller, chat com cooldown, tetos de salas; lança `ErroSala(codigo, mensagem, dados)` | não |
| `db.js` | única peça com SQL: tabela `usuarios` (id, nome, senha_hash, criado_em + colunas de carteira adicionadas por migração no boot), seed de `banco.json` fora de produção, `HASH_DUMMY` anti timing-oracle | não |
| `jwt.js` | `emitirToken`/`verificarToken` (HS256, 6h, payload `{id, nome}`); segredo de `JWT_SECRET` ou do arquivo `jwt.secret` (gerado na 1ª execução) | não |
| `login.js` | `login(nome, senha)` → `{token, player}`; `validarToken` | não |
| `cadastro.js` | `cadastrar(nome, senha)`; duplicidade via UNIQUE do banco | não |
| `convidado.js` | `entrarComoConvidado(nome)`: Player só em memória com id negativo | não |
| `retomarSessao.js` | reautentica por token e devolve token **novo** | não |
| `limites.js` | `NOME_MIN/MAX` (3/24), `SENHA_MIN/MAX` (8/72); compartilhado com o front | não |
| `rateLimiter.js` | `criarLimitadorDeTaxa({janelaMs, maxPorJanela})`, janela fixa por chave (IP) | não |
| `loja.js` | economia: fichas iniciais (100), preços, catálogo de cores/chapéus, recompensas; **compartilhado com o front** | não |
| `carteira.js` | fichas/itens/visual: conta no banco, convidado em memória (expira em 6h); `comprarItem`, `equiparItem`, `creditar`, `visualDe` | não |
| `chat/chat.js` | `montarMensagemChat`: valida tipo `restrita` (id do catálogo) ou `aberta` (texto livre ≤ 200, só com `chatAberto`) | não |
| `chat/mensagensChat.js` | catálogo de mensagens prontas e `CHAT_COOLDOWN_MS` (3s); **compartilhado com o front** | não |
| `*.test.js` | unitários de SalaManager, cadastro, login, jwt, limpeza (rodam no `npm test`) | — |

## Formato do protocolo (resumo)

- Cliente → servidor: sempre `socket.emit(evento, payload, ack)`. Resposta
  `{ ok: true, ...}` ou `{ ok: false, codigo, mensagem }` (+ `dados` extras,
  ex. `salaId` no `JA_EM_PARTIDA`). Não existe evento de erro separado.
- Servidor → cliente: eventos empurrados. Broadcast pra room `salaId`,
  exceto privados enviados à room pessoal `jogador:<id>` (`suaMao`,
  `maosReveladas`, `fichasGanhas`).
- Muitos eventos empurrados chegam **antes** do ack que os causou (ex.
  `listaJogadores` no `criarSala`) — clientes e testes precisam bufferizar.

## Estado em memória (socketServer)

- `jogadorPorSocket` (socket.id → Player), `salaPorSocket` (socket.id →
  salaId), `socketPorJogador` (player.id → socket.id mais recente).
- Salas, partidas, carteiras de convidado: **tudo em memória**. Só contas e
  carteiras de contas vão pro SQLite. Restart = salas somem. Single-process,
  sem adapter Redis (não escala horizontalmente — débito conhecido).

## Autenticação e segurança

- `verificarNome` (pré-auth) decide se o cliente pede senha ou oferece
  cadastro/convidado.
- Rate limit por IP: `verificarNome` 20/5min, `entrar` 5 **falhas**/20min
  (serializado por IP), `cadastrar` 10/10min → `MUITAS_TENTATIVAS`.
- `JA_AUTENTICADO`: um socket não pode virar outra conta (mesma conta de novo
  é permitido — o StrictMode do React dispara `retomarSessao` duas vezes).
- Login de usuário inexistente compara com `HASH_DUMMY` (mesmo custo de
  bcrypt).
- bcrypt assíncrono nas requisições; `Sync` só no boot.

## Salas (SalaManager)

- Config de `criarSala`: `numberPlayers` 2..6, `roundStart` 1..10,
  `botNumber`, `modeloBot`, `chatAberto`, `privada` (senha de 4 dígitos
  sorteada, devolvida só no ack do criador), `randomShuffle`, `maxDeck`,
  `seed`.
- Tetos: 1000 salas vivas (`LIMITE_DE_SALAS`), 4 salas ativas por adm
  (`LIMITE_DE_SALAS_POR_JOGADOR`), um assento em partida por vez
  (`JA_EM_PARTIDA`).
- Sala de espera com só bots é descartada após 5 min.
- Espera pra começar: 15s após lotar (adm pode `forcarInicio`).
- `jogarDeNovo`: só o adm da sala terminada; cria sala nova com a mesma
  config e emite `convidadoParaRevanche` na antiga.

## Adicionando ou mudando um evento

Siga a skill `.claude/skills/novo-evento/SKILL.md`.
