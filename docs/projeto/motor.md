# Motor de jogo (`game/`)

Regras puras + orquestração da partida. **Não conhece rede, socket nem
banco** (a única dependência "de fora" é `conexao/loja.js` pra visual padrão,
`bots/BotBrain.js` pra jogada automática e `observabilidade/metricas.js`).
É reusado sem servidor pelo treino (`training/env_bridge.js`) e pelo lab do
front (`public/app/src/lab/simulador.js`).

## Hierarquia

```
GameController  (EventEmitter; sala de espera + loop assíncrono da partida)
  └─ Game        (config, ordem de assentos, rng, crescimento da mão, maxDeck)
       └─ Rodada (monte, distribuição, vira/manilha, vazas, perda de hp)
            ├─ Baralho (monta N baralhos de 40, embaralha, comprar())
            └─ Mesa    (uma vaza: cartas na mesa, anulação, quem está ganhando)
  jogadores: PlayerGame[] (extends Player)
```

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `Carta.js` | dado puro: `id`, `naipeInt`, `valorInt`, `nomeNaipe`, `nomeValor`, `numeroBaralho`; `toString()` → `"[A de Copas]"` (formato que vai pros clientes) |
| `Baralho.js` | monta `numbaralho × 40` cartas (ordem de construção fixa, igual ao Python), embaralha conforme `randomShuffle`; `comprar()` **lança** se esvaziar (é bug, não caso normal) |
| `Mesa.js` | `receberCarta()` recalcula anulações e melhor jogada; `compararForca()`, `saoIdenticas()`; `gerarStatus()` → `{ vencedorAtual, cartaGanhando, status: 'DEFINIDO'|'MELADO' }` |
| `Rodada.js` | calcula `numCards`/`numBaralho` (fail-fast se não cabe), `darCartas()`, `virarManilha()`, `novaVaza()`, `ordemDaVaza()`, `finalizarVaza()` (soma `steak`), `finalizarRodada()` (perde hp), `resetarApostasSteaks()` |
| `Game.js` | `setstartsequence()` (sorteia assentos), `girarOrdem()` (próximo vivo abre), `eliminarZerados()`, `proximaRodada()` (+1 carta se couber em `maxDeck`); `MAX_DECK_SEM_LIMITE = 50` |
| `Player.js` | identidade (id, nome, senha, rate, bot). `rate` existe mas não é usado |
| `PlayerGame.js` | assento na partida: `hp=3`, `mao`, `aposta`, `steak`, `adm`, `desconectado`, `ultimaAcaoEm`, `expulsoPorInatividade`, `vagaExpirada`, `desistiu`, `eraBot`, `cor`, `chapeu` |
| `rng.js` | `criarRng(seed)` (mulberry32; sem seed = `Math.random`) e `embaralharComRng()` (Fisher-Yates). Mesmo algoritmo em `training/python/motor/rng.py` |
| `idEfemero.js` | contador **único** de ids negativos pra bots e convidados (não colidem com ids do SQLite) |
| `animacoesFront.js` | duração (ms) das animações do front por evento — o servidor usa pra estimar até quando a tela está ocupada |
| `GameController.js` | ver abaixo |

## GameController

Dono da sala de espera e da partida. Configurado no construtor (todos com
default de produção; testes passam valores curtos):

| Opção | Default | Para quê |
|---|---|---|
| `numberPlayers` | 4 | assentos (2..6, validado no SalaManager) |
| `roundStart` | 1 | cartas da primeira rodada |
| `randomShuffle`, `maxDeck`, `seed` | — / 50 / — | baralho |
| `modeloBot` | `classico` | rede usada nas jogadas automáticas |
| `tempoTurnoMs` | 20 000 | tempo por turno antes do automático |
| `limiteInatividadeMs` | 90 000 | sem ação real → socket expulso da sala |
| `tempoReservaMs` | 150 000 | vaga reservada pra reconectar |
| `atrasoBotMs` | 2 000 | pausa antes do bot decidir (pra UI acompanhar) |
| `pausaVazaMs` / `pausaRodadaMs` | 1 600 / 2 000 | folga entre vazas / rodadas pras animações |
| `limiteSeguraMs` / `limiteSeguraTotalMs` | 10 000 / 60 000 | teto de "segurar pelas animações" |
| `duracaoDistribuicaoMs` | calculado | espera fixa da distribuição |

### API pública (chamada pelo SalaManager)

`entrarNaSala`, `agendarInicio`, `forcarInicio`, `iniciarPartida`,
`removerJogador`, `jogadorEhAdm`, `jogarCarta(playerId, indice)`,
`apostar(playerId, valor)`, `sugestaoBot`, `estadoDeReconexao`,
`marcarReconectado`, `abandonarPartida`, `desistir`, `vagaExpirada`,
`atualizarVisual`, `registrarAnimacoes(playerId, seq)`,
`registrarAnimando(playerId)`. Os métodos com `_` são internos.

### Loop da partida

`iniciarPartida()` → `_rodarPartida()` (async) → para cada rodada
`_jogarUmaRodada()`:

1. `darCartas()` → emite `cartasDistribuidas` (a camada de socket transforma
   em `suaMao` privado); se `round === 1`, emite `maosReveladas`.
2. `virarManilha()` → `manilhaVirada`; espera a distribuição (`_esperarDistribuicao`).
3. Apostas em ordem: `_aguardarApostaOuTimeout` → `turnoAposta`, `timerTurno`,
   `apostaFeita`.
4. Para cada vaza: `_aguardarJogadaOuTimeout` → `turnoJogador`, `timerTurno`,
   `cartaJogada`; depois `vazaFinalizada` e `pausaVazaMs`.
5. `finalizarRodada()` → `rodadaFinalizada` (placar com aposta, steak,
   diferença, hp) e `pausaRodadaMs`.

Depois: `_resolverFimDeJogo()` (emite `jogoFinalizado`) ou
`_avancarParaProximaRodada()` (`jogadoresEliminados`, gira ordem,
`novaRodadaIniciada`). Colocações viram `fichasGanhas` via
`_registrarColocacoes`. Erro inesperado no motor → `partidaAbortada`
(`_abortarPartida`), a sala não é desmontada sozinha.

### Jogada automática

Turno de bot, ou humano que estourou o tempo, passa por
`bots/BotBrain.js` (`escolherAposta`, `escolherCarta`) recebendo o
`controller` (pra ver mesa, manilha, cartas já jogadas em
`_cartasJogadasRodada`). Ver [bots.md](bots.md).

### Segurar pelas animações

Clientes podem mandar `aindaAnimando`/`animacoesConcluidas(seq)`; todo evento
emitido ganha um número `seq` (o `emit` é sobrescrito). Antes de abrir um
turno o controller espera os clientes que aderiram terminarem de animar, com
tetos (`limiteSeguraMs`/`limiteSeguraTotalMs`). Cliente que nunca manda nada
não segura nada. Detalhes no `conexao/PROTOCOLO.md`, seção "Segurar pelas
animações". As durações estimadas vêm de `animacoesFront.js`, que **copia**
constantes do front.

## Testes do motor

`game/*.test.js` (fim de jogo, loop, maxDeck, PlayerGame, seed, segurar
animações). Rodam no `npm test`; só os unitários: `npm run test:unit`. `seed.test.js` pina a mesma distribuição que
`training/python/test_seed.py` (seed 999).
