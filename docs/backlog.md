# Contra ZAP — backlog

Bugs, pendências e ideias em aberto. Guias de desenvolvimento ficam no
`DEV.md`. Parte dos bugs da mesa já foi investigada (causa e correção) em
`docs/relatorio-bugs-dev.md`, de 2026-10-28.

---

## O que falta fazer

Legenda: 🔴 atrapalha jogar / bug · 🟡 falta informação, robustez · 🟢 polimento.

### Mobile (meetfront1)

- [ ] 🟡 Animações contra manilha.
- [ ] 🔴 Em partidas longas a destruição da mesa buga.

### Desempenho

- [ ] 🟢 Colocar skills relevantes de otimização
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

tela de espera de sala as vezes bugado


timer bugado

colisão do manilha só na carta de baixo

sala de esprea meio bugada

ouros muito bugado no pc

card quando você morre some web

Z DAS DESTRUIÇÕES DEPOIS DE MUITO TEMPO

tamanho carta 1 rodada , web


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
      INTERROMPIDA" com o motivo + "Voltar às salas".
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
      histórico; nenhum aviso na mesa.
- [ ] 🟢 **Dica do bot** — arcade tem (`sugestaoBot` + `dicaBot.js`); aqui
      entraria como contorno na carta da mão e no número do popup de aposta.
- [ ] 🟢 **Sons** — só o tique da contagem toca; arcade toca `somArcade.js`
      em carta, sua vez, aposta, vaza, eliminado, vitória, erro e chat.

### Fim de partida

- [ ] 🔴 **Sem "Voltar às salas" na tela de vitória** — só "Jogar de novo"
      (adm) e "Não" do convite; quem não é adm e não recebeu convite só sai
      pelo "Sair" do cabeçalho.
- [ ] 🟡 "Jogar de novo" sem estado de carregando (`criandoRevanche` existe
      na Partida mas não chega na mesa) — dá pra clicar duas vezes.
- [ ] 🟢 "Agora não" no convite: arcade só fecha o convite e continua na
      tela; aqui "Não" já sai da sala.

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
- [ ] 🔴 **57** - groke atualiza o read me minha filha 

46 (observabilidade básica) é o mais barato de resolver a seguir. 48 é
decisão de arquitetura maior, fica documentado como débito técnico
consciente.
 
