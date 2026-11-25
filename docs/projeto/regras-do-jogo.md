# Regras do jogo

Regras como estão implementadas hoje (fonte de verdade: `game/`). Se mudar
uma regra aqui no código, mude também o motor Python
(`training/python/motor/`) — siga a skill
`.claude/skills/mudar-regra/SKILL.md` e ver [convencoes.md](convencoes.md).

## Baralho

- Baralho de **40 cartas**: naipes Ouros(0), Espadas(1), Copas(2), Paus(3);
  valores em ordem crescente de força `4 5 6 7 Q J K A 2 3` (`valorInt` 0..9).
- Uma rodada usa `jogadores_vivos × cartas_por_mão + 1` (a vira). Se não cabe
  em 40, junta mais baralhos (`numBaralho = ceil(numCards / 40)`); cada carta
  sabe de qual baralho físico veio (`numeroBaralho`, o front desenha verso
  diferente).
- `randomShuffle`: `true` = embaralha o monte inteiro junto; `false` =
  embaralha cada baralho separado e empilha.

## Estrutura da partida

- Partida = sequência de **rodadas**; rodada = **apostas** + N **vazas**
  (N = cartas na mão). Cada vaza: cada jogador vivo joga uma carta.
- Todos começam com **hp = 3**.
- A rodada começa com `roundStart` cartas (1..10) e cresce **+1 carta por
  rodada**, desde que a próxima rodada caiba em `maxDeck` baralhos. Se não
  couber, o tamanho congela até alguém morrer (nunca diminui).
- A ordem dos assentos é sorteada (Fisher-Yates) no início. Quem abre cada
  rodada gira pro próximo jogador **vivo**.

## Manilha (vira)

- Depois de distribuir, vira-se uma carta (**vira**). A **manilha** é o valor
  seguinte ao da vira (depois do `3` volta pro `4`).
- Manilha ganha de qualquer carta comum. Entre manilhas, desempata pelo naipe:
  Paus (zap) > Copas > Espadas > Ouros.

## Vaza e "melado"

- Ganha a vaza a carta mais forte **que não foi anulada**.
- **Cartas iguais se anulam**: duas cartas comuns com o mesmo valor (qualquer
  naipe) se cancelam; manilhas só se anulam se valor **e** naipe forem iguais
  (possível com mais de um baralho).
- Se todas as cartas se anularem, a vaza fica **MELADA**: ninguém pontua e
  quem abriu continua abrindo a próxima.
- Quem ganha a vaza abre a próxima.

## Aposta

- Cada jogador, em ordem, aposta quantas vazas vai fazer (`0..cartas`).
- O **último a apostar não pode** escolher o valor que faz a soma das apostas
  ser igual ao número de cartas (`APOSTA_FECHA_RODADA`) — alguém sempre erra.
  Não vale na rodada de 1 carta.
- Fim da rodada: cada um perde `|aposta − vazas feitas|` de hp.

## Rodada de 1 carta ("testa" / rodada cega)

Com 1 carta na mão, cada jogador **não vê a própria carta** mas vê a de todos
os outros (`maosReveladas`, privado por destinatário). A aposta é 0 ou 1,
e o último a apostar pode fechar a soma.

## Eliminação e fim

- Ao fim de cada rodada, quem tem `hp ≤ 0` é eliminado.
- Sobrou 1 vivo → ele vence. **Todos morreram na mesma rodada** → vence quem
  ficou com hp mais perto de 0; empate → quem veio antes na ordem da rodada
  (critério **provisório**, ver `docs/backlog.md` → PIN).
- Colocações rendem **fichas** (moeda da loja de customização) só pra conta
  registrada — ver `conexao/loja.js`.

## Tempo e automático

- Turno (aposta ou jogada) tem `tempoTurnoMs` (20s). Estourou → o bot joga
  por você (`jogadaAutomatica`) e o assento fica "no automático".
- `limiteInatividadeMs` (90s) sem agir → seu socket sai da sala; a vaga fica
  reservada `tempoReservaMs` (150s) pra `reconectar`. Depois disso, bot pra
  sempre (`vagaExpirada`).
- `sairDaPartida` = vira bot mas pode voltar; `desistir` = perde na hora e
  libera pra entrar em outra sala.

## Glossário (termos do código)

| Termo | Significado |
|---|---|
| `rodada` / `round` | uma mão completa; `round` = nº de cartas por jogador |
| `vaza` | uma volta em que cada um joga uma carta |
| `steak` | vazas ganhas na rodada (nome histórico, não é "streak") |
| `aposta` | vazas que o jogador disse que faria |
| `vira` / `viraValor` | carta virada / valor que vira manilha |
| `manilha`, `zap` | carta mais forte; zap = manilha de Paus |
| `melado` | vaza em que tudo se anulou |
| `gameOrder` | jogadores vivos na ordem desta rodada |
| `adm` | dono da sala (quem criou; passa adiante se a vaga dele expira) |
| `sala` / `salaId` | sala de espera + partida; id curto gerado pelo servidor |
| `convidado` | login sem conta, só em memória, id negativo |
| `fichas` | moeda da loja (cor e chapéu do fantasminha) |
| `fantasminha` | avatar do jogador na mesa |
| `modeloBot` | qual rede decide pelos bots da sala (`bots/modelosBot.js`) |
