# API dos helpers de teste

Referência dos módulos em `tests/helpers/`. Antes de escrever helper novo,
confira aqui — quase sempre já existe.

---

## `servidor.js`

### `subirServidor(configSala?) -> Promise<Servidor>`

Sobe o `criarServidor()` do `Server.js` de verdade (mesmo Express, mesmo
Socket.io, mesmo `registrarSocketServer`) numa porta efêmera. `configSala`
sobrescreve os tempos do `SalaManager`.

```js
const servidor = await subirServidor({ tempoTurnoMs: 10_000 });
t.after(() => servidor.fechar());
```

Campos do handle:

| Campo | O que é |
|---|---|
| `url` | `http://localhost:<porta efêmera>` |
| `porta` | a porta escolhida pelo sistema |
| `app`, `server`, `io` | as peças cruas, pra caso raro |
| `salaManager` | pra **inspecionar** estado; nunca pra montar cenário |
| `conectar()` | abre um `ClienteDeTeste`, já registrado pra ser fechado junto |
| `fechar()` | derruba clientes e servidor — **sempre** no `t.after` |

### `TEMPOS_DE_TESTE`

Defaults aplicados por `subirServidor`:

| Opção | Teste | Produção | Por quê |
|---|---|---|---|
| `tempoEsperaInicioMs` | `30_000` | 15s | alto de propósito: nada começa sozinho; use `forcarInicio` |
| `tempoTurnoMs` | `2_000` | 20s | suba pra `10_000` quando o assunto não for timeout |
| `atrasoBotMs` | `5` | 2s | bot não precisa de pausa cosmética em teste |
| `limiteInatividadeMs` | `90_000` | 90s | encolha só em teste de expulsão |
| `tempoReservaMs` | `150_000` | 150s | encolha só em teste de vaga expirada |
| `chatCooldownMs` | `3_000` | 3s | use `0` pra testar conteúdo, valor curto pra testar o cooldown |

---

## `cliente.js`

### `ClienteDeTeste`

Um socket.io-client de verdade, com ack virando Promise e **todo evento
recebido gravado desde a conexão** (por isso `esperar()` não perde evento que
chegou antes de você pedir).

| Método | O que faz |
|---|---|
| `emitir(evento, payload?, { timeoutMs }?)` | devolve o ack cru — não lança em `{ ok: false }` |
| `ok(evento, payload?)` | exige `{ ok: true }`; devolve o ack |
| `erro(evento, payload?, codigo?)` | exige `{ ok: false }` (e o código, se passado) |
| `esperar(evento, { filtro, timeoutMs }?)` | espera um evento empurrado; olha primeiro o histórico |
| `recebidos(evento)` | todos os payloads daquele evento (pra contar ou provar ausência) |
| `limparHistorico()` | zera o histórico — pra "a partir daqui, não deve chegar mais nada" |
| `desconectar()` | fecha a conexão e espera o `disconnect` |
| `nome`, `token` | preenchidos pelos helpers de login |
| `socket` | o socket cru — use só quando `esperar()` não servir |

**Consumo em `esperar()`**: cada evento gravado satisfaz **um** `esperar()`.
Dois `esperar('turnoJogador')` seguidos devolvem o primeiro e o segundo turno,
não duas vezes o mesmo.

**`filtro`** é uma função sobre o payload — o jeito normal de dizer "o turno
que me interessa é o meu":

```js
const meuTurno = await cliente.esperar(EventosServidor.TURNO_APOSTA, {
    filtro: (dados) => dados.jogador === cliente.nome,
});
```

---

## `protocolo.js`

Tudo montado só com eventos do protocolo — nenhum atalho por dentro.

| Função | O que devolve |
|---|---|
| `nomeUnico(prefixo?)` | nome novo a cada chamada (evita `NOME_JA_CADASTRADO` na 2ª execução) |
| `convidado(servidor, nome?)` | cliente conectado **e** autenticado (login mais barato do protocolo) |
| `convidados(servidor, n)` | N convidados, em paralelo |
| `salaCheia(servidor, opcoes?)` | `{ salaId, clientes, adm, numberPlayers }` — sala lotada, ainda não iniciada |
| `partidaEmAndamento(servidor, opcoes?)` | o mesmo, com a partida já rolando (via `forcarInicio`) |
| `jogarSozinho(cliente, salaId)` | liga o piloto automático; devolve `parar()` |
| `reconectarSocket(servidor, cliente)` | socket **novo** com a mesma identidade (`retomarSessao`) |

Opções de `salaCheia`/`partidaEmAndamento`: `{ humanos = 2, botNumber = 0 }`
mais qualquer config de `criarSala` (`roundStart`, `chatAberto`,
`randomShuffle`).

```js
// 1 jogador de verdade contra 1 bot — mesa mínima, sem segundo cliente
const { salaId, adm } = await partidaEmAndamento(servidor, { humanos: 1, botNumber: 1 });

// 2 jogadores de verdade, rodada de 1 carta ("testa")
const { salaId, clientes } = await partidaEmAndamento(servidor, { humanos: 2, roundStart: 1 });
```

### `jogarSozinho`

Responde todo turno do cliente (aposta 0, primeira carta da mão) até o
`parar()`. É o que permite levar uma partida até `jogoFinalizado` sem escrever
a mesa inteira na mão.

```js
const parar = jogarSozinho(cliente, salaId);
t.after(() => parar());
const fim = await cliente.esperar(EventosServidor.JOGO_FINALIZADO, { timeoutMs: 60_000 });
```

Dois detalhes que ele resolve por você:

- reprocessa o último turno já recebido ao ser anexado (senão perderia o
  primeiro `turnoAposta`, que sai junto com o `novaRodadaIniciada`);
- engole erro dos próprios emits (rejeição solta depois do fim do teste
  derrubaria o arquivo inteiro).

Se o servidor recusar a aposta 0 com `APOSTA_FECHA_RODADA` (só acontece com o
último a apostar), ele tenta 1.

---

## `ambiente.js`

Não tem função pra chamar — é efeito de importação, e precisa rodar **antes**
de qualquer módulo do projeto (`conexao/db.js` e `conexao/jwt.js` leem o
ambiente uma vez só, ao carregar). Por isso `servidor.js` importa
`./ambiente.js` na primeira linha e traz os módulos do projeto por
`await import(...)` dentro da função.

O que ele garante:

- `DB_PATH` aponta pra um SQLite temporário, **um por processo de teste**,
  apagado no fim — nenhum teste enxerga conta cadastrada por outro arquivo;
- `JWT_SECRET` fixo, então o `jwt.secret` da raiz nunca é criado nem lido.

Exporta `USUARIO_SEMEADO` (`{ nome: 'henrique', senha: '123' }`), a conta que
o `banco.json` semeia em todo banco novo — use nos testes de login em conta
existente.
