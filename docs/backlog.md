# Contra ZAP — backlog

Bugs, pendências e ideias em aberto. Guias de desenvolvimento ficam no
`DEV.md`. Parte dos bugs da mesa já foi investigada (causa e correção) em
`docs/relatorio-bugs-dev.md`, de 2026-10-28.

---

## O que falta fazer

Legenda: 🔴 atrapalha jogar / bug · 🟡 falta informação, robustez · 🟢 polimento.

### Mobile (meetfront1)

- [ ] 🟡 Animações contra manilha.
- [ ] 🔴 **Destruição da mesa em partida longa** (`public/app/src/index.css`) —
      correção em `e2c0d27` (z-index isolado). Falta confirmar na tela, no PC e
      no celular; confirmado, remover.
- [ ] 🟡 **Cartas para fora da borda com 5–6 jogadores** (`zonasPouso.js`) —
      relatório 5.4; os números da zona não mudaram desde então. Ver na tela.
- [ ] 🟡 **Celular deitado cai no layout de PC** (`modoMobile.js`) — o corte é só
      `max-width: 639px`. Relatório 5.5: a caixa cobre o Apostar e a mão.
- [ ] 🟢 **Hover preso no toque** (`meetfront1.css`, `.mesa-exp-sua-mao-carta:hover`)
      — sem `@media (hover: hover)`. Relatório 5.7; ver no aparelho.

### Desempenho

- [ ] 🟢 Colocar skills relevantes de otimização (sem critério de pronto: definir
      quais).
- [ ] 🟢 **Zap mede o DOM em `zapCanvas.js`** — `getBoundingClientRect` e
      `getComputedStyle` (relatório 4.4: por quadro). A classe
      `mf1-choque-franjas-N` (`FiltroTela.jsx`) não tem CSS. Medir no aparelho.

### Motor, bots e produção

- [ ] 🟡 **Rede de RL só treinou com 4 assentos** (`bots/BotBrain.js`,
      `training/`) — joga em salas de 2 a 6 via `ajustarParaModelo()`
      (encaixe/corte de assento), o que cobre 2–3 bem mas deixa 5–6 fora da
      distribuição de treino (jogada coerente, mas fraca). Falta treinar com
      nº de assentos variável ou uma rede dedicada a 5–6.
- [ ] 🟡 Subir o servidor num ambiente de verdade, com sockets web
      funcionando fora da rede local (hoje só foi testado em `localhost`).
- [ ] 🟡 Banco de testes em produção.
- [ ] 🟡 **Máscara de aposta da rodada de 1 carta** — as máscaras do
      treino proíbem o último a apostar de fechar a soma; o jogo permite.
      Corrigir muda o treino da rodada cega (avaliar retreino).

### Código

- [ ] 🟢 **Nome das pastas** — `components/arcade/` e `components/meetfront1/`
      viraram só peças usadas pelo meetfront2; dá pra juntar/renomear quando
      for mexer no front de novo.

### PIN — só mexer se alguém reclamar

Fica pra depois de propósito: pro escopo e tipo de sistema, o custo de fazer
não parece compensar o ganho agora.

- 🟢 `Player.rate` / ranking: existe desde sempre (banco, classe,
  getter/setter) mas nunca é lido nem atualizado em lugar nenhum. No melhor
  dos casos é a última coisa que fazemos no projeto; no pior, nunca usamos.
  Juntar gente de nível parecido em salas ranqueadas depende disso e cai na
  mesma categoria.
- 🟡 Placar/histórico entre partidas (não só o hp da partida atual) e persistir
  qualquer coisa além de conta de usuário (`banco.sqlite` só guarda nome +
  hash de senha hoje — salas, placar, quem jogou o quê vivem só na memória e
  somem num restart).
- 🟡 Desempate quando **todos** morrem na mesma rodada: hoje é "hp mais perto de
  0, empate → quem chegou primeiro" (`GameController._resolverFimDeJogo`),
  marcado como provisório. O time ainda vai decidir o critério definitivo.
- 🟢 `jwt.secret` gerado sem flag `wx` (`jwt.js`) — só dá problema se duas
    instâncias subirem pela primeira vez ao mesmo tempo, sem o arquivo ainda
    existir.
- 🟡 Sem HTTPS/wss — item de produção puro, sem efeito nenhum em `localhost`.
- 🟡 `retomarSessao` não confere se a conta ainda existe (`retomarSessao.js`)
    — inofensivo porque não existe NENHUMA forma de apagar/renomear/banir
    conta no sistema ainda; some da lista de "de boas" no dia que isso mudar.
- 🟡 Contador de `idEfemero.js` reinicia em -1 a cada restart, mas token de
    convidado vale 6h → risco de colisão de id — só bate numa sessão longa
    com restart no meio e convidado com token ainda válido rondando; uma
    demo curta sem restart não passa perto disso.
- 🟡 **Pódio** — arcade mostra a ordem de eliminação (2º, 3º... "eliminado
  na rodada N"). Precisa guardar `ordemEliminacao` a partir de
  `jogadoresEliminados` (com o `numeroRodada` da hora).

---

## Front da mesa — o que falta na Partida

Números como 3.1 são de `docs/relatorio-bugs-dev.md`, onde estão a causa e a
correção sugerida. Nos itens numerados, o código foi relido em 2026-11-24 e
não se achou correção; o sintoma não foi reproduzido de novo.

### Sala de espera

Relatos: "tela de espera de sala às vezes bugado", "sala de espera meio bugada".

- [ ] 🔴 **Contagem não para quando alguém sai da sala cheia** (3.1) —
      `removerJogador` (`game/GameController.js`) cancela sem avisar; a tela só
      olha `segundosParaIniciar`.
- [ ] 🔴 **Queda de rede na espera deixa a tela surda** (3.2) — o servidor tira o
      jogador (`conexao/socketServer.js`); `Partida.jsx` só ressincroniza com a
      partida iniciada.
- [ ] 🟡 **"SAIR DA FILA" por cima de "SALA" no celular** (3.5) — a raiz da espera
      em `MesaExperimento.jsx` não recebe `mf1-mobile`.
- [ ] 🟡 **F5 na espera tira da sala sem aviso** (3.6) — o front não guarda a sala;
      `minhaSalaAtiva` só cobre partida em andamento.
- [ ] 🟢 **Contagem só local** (3.7) — `setTimeout` de 1 s encadeado em
      `Partida.jsx`; atrasa em aba travada.

### Timer

Relato: "timer bugado".

- [ ] 🟡 **Pavio parado em 0 depois de queda no meio da partida** (3.3) —
      `ressincronizar` (`Partida.jsx`) não mexe em `prazoTurno`.
- [ ] 🟡 **Seu timer não aparece depois de F5 no seu turno** (3.4) —
      `estadoDeReconexao` (`game/GameController.js`) não devolve o prazo.
- [ ] 🟢 **Erro `null.setAttribute/style` no console** (1.7) — `TimerNome` e
      o pavio (`MesaExperimento.jsx`) usam o ref no `passo` sem checar.

### Mesa e cartas

- [ ] 🔴 **Ouros muito bugado no PC** (4.2) — suspeito: o `translate` em
      `.mesa-exp-mesa` (`meetfront2.css`) desloca os `position: fixed` de dentro.
- [ ] 🟡 **Card some quando você morre (web)** (5.1) — `SeuFantasminha`
      (`MesaExperimento.jsx`) devolve `null` em `'morto'`.
- [ ] 🟡 **Colisão da manilha só na carta de baixo** (4.3) — não reproduzido;
      suspeito: `Z_CARTA_SIMULADA_POUSADA = 1` (`MesaDanificada.jsx`). Confirmar
      com quem reportou.
- [ ] 🟡 **Tamanho da carta na 1ª rodada (web)** (5.3) — provável: cartas
      reveladas dos outros, `scale: 1.35` em `meetfront2.css`. Confirmar qual
      carta era.
- [ ] 🟡 **Mão fantasma** (1.6) — carta na mão local que o servidor não tem:
      `jogarCartaClicada` (`Partida.jsx`) falha em silêncio. Causa da dessincronia
      não encontrada.

### Comparação com o arcade

Comparação da tela de partida atual com a do **arcade**
(`components/arcade/Partida.jsx`, na branch `StashedFronts`). Só entra aqui
o que o arcade mostrava e a mesa não.

Legenda: 🔴 falta e atrapalha jogar · 🟡 falta informação/feedback · 🟢 extra/polimento.

### Já coberto (não precisa mexer)

Mão, mão dos outros em leque, rodada cega (sua virada + dos outros
revelada), vira/manilha (animação + hover com os naipes), destaque de
manilha em qualquer carta, carta mais forte/melada na mesa, revelação de
vaza e "MELOU!", aposta com popup (e bloqueio do valor que fecha a mesa),
fichas + vazas ganhas pousadas, vida (medalhão + corações no hover),
dano/eliminação dos fantasminhas, timer do turno (anel + pizza no nome),
banner de vez, indicador de bot/automático, chat (prontas, livre, balão,
histórico), cabeçalho (sala, senha, rodada, nome, sair), tela de vitória
com "Jogar de novo" (só adm) e convite de revanche, ressincronizar depois
de queda de rede, banner global de conexão perdida. Tela de espera inteira
(contagem regressiva, forçar início só pro dono, vagas, dono/bots, chips de
regra, visual ardósia). Layout de celular (`meetfront1/modoMobile.js`).

### Durante a partida

- [ ] 🔴 **Erros de ação invisíveis** — o `erro` da Partida (falha no
      `jogarCarta`, no `jogarDeNovo`, no aceitar revanche) só aparece na tela
      de espera; durante a partida e no fim ninguém vê. Precisa de um aviso
      na tela (toast/faixa no estilo arcade).
- [ ] 🔴 **Partida abortada** (`partidaAbortada`) — só vira `erro`, que não
      aparece: a mesa trava sem explicação. Arcade tem tela "PARTIDA
      INTERROMPIDA" com o motivo + "Voltar às salas". Sair dela ainda oferece
      RECONECTAR numa sala encerrada (`sair` em `Partida.jsx` só olha `vencedor`).
- [ ] 🟡 **Você eliminado / assistindo** — nenhum sinal de que você está
      fora (arcade troca a dica por "VOCÊ ESTÁ FORA — ASSISTINDO").
- [ ] 🟡 **Vazas feitas x aposta legível de relance** — as cartas pousadas
      em cima das fichas mostram isso, mas sem número. Arcade mostra
      "APOSTA n · FEZ n" por jogador.
- [ ] 🟡 **Manilha fixa no cabeçalho** — arcade tem a pílula "MANILHA
      [rank]" sempre visível; aqui só no hover da vira.
- [ ] 🟡 **Cooldown do chat** — os botões travam sem dizer por quanto tempo,
      e as mensagens prontas nem aparecem desabilitadas (o clique só é
      ignorado; só o campo livre usa `chatEmCooldown`).
- [ ] 🟡 **Expulso por inatividade** — manda direto pra Lobby. Arcade abre
      modal "VOCÊ SAIU DA MESA" com RECONECTAR ali mesmo.
- [ ] 🟡 **Jogada automática por timeout** (`jogadaAutomatica`) — só vai pro
      histórico; nenhum aviso na mesa. O timeout de **aposta** nem emite o evento
      (`_aguardarApostaOuTimeout`).
- [ ] 🟢 **Dica do bot** — arcade tem (`sugestaoBot` + `dicaBot.js`); aqui
      entraria como contorno na carta da mão e no número do popup de aposta.
- [ ] 🟢 **Sons** — só o tique da contagem toca; arcade toca `somArcade.js`
      em carta, sua vez, aposta, vaza, eliminado, vitória, erro e chat.

### Fim de partida

- [ ] 🟢 "Agora não" no convite: arcade só fecha o convite e continua na
      tela; aqui "Não" já sai da sala.
- [ ] 🟡 **Aceitar revanche de sala já desfeita** (`aceitarConviteRevanche`,
      `Partida.jsx`) — sai da sala antiga antes de entrar na nova; se falhar,
      cai na Lobby e o erro se perde. Lido no código, não reproduzido.

---

## Backlog de operação / produção (DevOps) — em aberto
 
Itens levantados na fase de containerização que ainda não foram resolvidos.
Numeração mantida pra rastreabilidade com discussões/commits anteriores.
🔴 crítico, 🟡 médio, 🟢 baixo.
 
- [ ] 🟡 **46** — Logs ainda em `console.*` puro, sem nível/timestamp/JSON/
  request-id.
- [ ] 🟡 **48** — Arquitetura single-process em memória + Socket.IO sem
  adapter (Redis, por exemplo) → não escala horizontalmente. Fora de escopo
  por ora; documentado como limitação conhecida.
- [ ] 🟢 **56** — `GameStart.js` roda `npm install` toda vez sem checar
  `node_modules`, e não repassa `SIGINT` pro processo filho (causa direta
  da porta 3000 ficando presa depois de um Ctrl+C mal-sucedido).

46 (observabilidade básica) é o mais barato de resolver a seguir. 48 é
decisão de arquitetura maior, fica documentado como débito técnico
consciente.
