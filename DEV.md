# Contra ZAP — notas de desenvolvimento

Tudo que é detalhe de quem mexe no código. Pra rodar o projeto, ver o
`README.md`. Pro contrato de eventos socket.io, ver `conexao/PROTOCOLO.md`.

---

## Mexendo no front-end (React)

`public/dist` (o que o `Server.js` serve) só é atualizado quando você roda
`npm run build` — reiniciar o `Server.js` sozinho **não** reflete mudanças em
`public/app/src`. Pra não ter que buildar toda hora enquanto desenvolve:

1. Num terminal, na raiz: `npm start` (sobe só o back-end, porta 3000).
2. Em outro terminal, dentro de `public/app`: `npm run dev` (sobe o Vite,
   porta 5173, já configurado em `vite.config.js` pra proxiar `/socket.io`
   pro back-end em `:3000`).
3. Abra `localhost:5173` — qualquer edição em `public/app/src` aparece na
   hora, sem precisar buildar nem reiniciar nada.

Quando terminar, **rode `npm run build`** antes de commitar — o servidor de
"produção" serve o `public/dist`, não o Vite.

O código do front fica todo em `public/app/src`:
- `App.jsx` — componente raiz, decide qual tela mostrar.
- `socket.js` — conexão com o back-end via socket.io-client.
- `sessao.js` — persistência da sessão (sessionStorage) e retomada depois de
  reconexão/F5.
- Sem rotas além dos labs (ver `main.jsx`): `/lab` (cérebro do bot) e os
  labs temporários de `labsTemporarios/` (`LabNome.jsx` vira `/lab-nome`).
  Esses ficam só nas branches de trabalho: depois do merge, a pasta é
  apagada na `main` à mão e a branch fica guardada com ela. Tela inicial,
  customização, salas e partida são estado do `App.jsx`.
- `components/meetfront2/` — a tela inicial (`Inicio.jsx`): **JOGAR**
  (salas) e **CUSTOMIZAÇÃO** (`Customizacao.jsx`). Sem sessão, os dois
  abrem o pop-up de login (`PopupLogin.jsx`: fluxo em etapas + convidado
  direto, com nome do campo ou `Fantasma####` sorteado). Com sessão, o topo
  da tela inicial tem **SAIR** (limpa a sessão e recarrega); as salas têm
  **◀ INÍCIO**. A customização é a loja (cor no círculo pastel, chapéus),
  com o saldo de fichas no topo; o aviso "+N FICHAS" (`AvisoFichas.jsx`)
  aparece em qualquer tela assim que você sai da partida. A Partida usa a
  do meetfront1 com a própria `MesaExperimento.jsx` (prop `Mesa`), que
  importa o resto de `meetfront1/`. CSS próprio em `meetfront2.css`,
  escopado em `.mf2`. A mesa usa a cor/chapéu que vêm do servidor
  (`chapeuPorId`/`tom` em `visual.js`).
- `components/meetfront1/` — a Partida (socket/estado) e as peças da mesa
  (cartas, fantasminhas, manilhas, filtro de tela, layout de celular).
  CSS próprio em `meetfront1.css`, escopado em `.mf1`.
- `components/arcade/` — a casca das telas fora da partida (`Casca.jsx`,
  `Modal.jsx`, som, filtro) e a lista de salas (`Lobby.jsx`).
- **Fichas e loja** — regras em `conexao/loja.js` (compartilhado com o
  front), carteira em `conexao/carteira.js` (conta no banco, convidado em
  memória). Contrato em `conexao/PROTOCOLO.md`, seção "Carteira e loja".

As outras frentes (debugging, arcade, novo, meetfront1 e mescla como
frentes completas, o seletor `/front`, os labs de pouso/mão, a demo de
desempenho e a vitrine do fantasminha) ficaram só na branch
**`StashedFronts`**, como referência.

Pra testar sozinho, crie uma sala com o resto dos assentos em bot (ex.:
`numberPlayers: 2, botNumber: 1`) — a partida roda inteira só com você.

**Antes de mexer no protocolo de eventos (o que o cliente manda/recebe do
servidor), leia `conexao/PROTOCOLO.md`** — é a fonte de verdade de todos os
eventos socket.io, payloads e erros possíveis.

---

## Docker — por que Node 22 + Alpine

Só documentando pra ninguém precisar redescobrir isso: o binário nativo do
`better-sqlite3` não tem prebuild compatível pra Node 20, e a combinação
certa (Node 22 + musl/Alpine + arm64) ainda assim exige compilar o addon do
zero dentro do container — por isso o `Dockerfile` instala `python3 make
g++` mesmo usando Alpine. Trocar a versão do Node no `Dockerfile` sem
confirmar compatibilidade com o `better-sqlite3` provavelmente quebra o
build de novo.

## CI/CD

Todo push/PR contra a `main` roda no GitHub Actions
(`.github/workflows/ci.yml`): build da imagem Docker, `npm test`, validação
do OpenAPI/AsyncAPI + coleção do Postman (Newman) contra o servidor de pé, e
o E2E do Playwright contra o container. O `npm test` só pega
`tests/**/*.test.js` — os testes de `game/` e `conexao/` ficam de fora (ver
"Testes" em "O que falta fazer").

---

## Treino de bot (RL)

### Avaliador offline de bots

O avaliador reutiliza o motor real da partida, mas não liga modelos treinados
ao servidor. Rode com a venv de `training`:

```powershell
training\.venv\Scripts\python.exe training\python\evaluate.py versus `
  --candidate checkpoint=training\checkpoints\overnight.pt `
  --opponent heuristic --games 10000 --seed 42
```

Também há escalação livre dos quatro assentos:

```powershell
training\.venv\Scripts\python.exe training\python\evaluate.py lineup `
  --players checkpoint=training\checkpoints\overnight.pt heuristic random heuristic
```

Descritores aceitos: `checkpoint=<arquivo.pt>`, `heuristic`, `random` e
`strategy=<módulo>:<Classe>`. Uma estratégia Python deve expor
`act(kind, obs, legal_mask, rng)` e devolver uma ação permitida. O resultado
aparece no console e é salvo como JSON em `training/logs/`.

### Treino contra liga

O treinador aceita um manifesto de liga com checkpoints congelados e executa
PPO somente nos assentos controlados pelo aprendiz. A mistura usada no
experimento evolutivo é 50% self-play, 35% campeões históricos selecionados
por PFSP e 15% âncoras (H, overnight, heurístico e aleatório). O orquestrador
em `training/python/orquestrar_4dias.py` gera esses manifestos, preserva
checkpoints completos e usa torneios no motor JavaScript para a seleção.

### Paridade JS × Python

O motor em `training/python/motor/` é um porte fiel do `game/` JS. Com a
mesma `seed`, os dois distribuem a partida idêntica — `game/seed.test.js` e
`training/python/test_seed.py` pinam a mesma referência (`seed 999`); se um
lado divergir, o teste do lado que mudou quebra.

A `seed` (inteiro) também entra pelo `criarSala`: fixa o embaralhamento,
então a mesma seed reproduz a partida carta por carta. Ausente = aleatório
de sempre.

---

## O que falta fazer

Legenda: 🔴 atrapalha jogar / bug · 🟡 falta informação, robustez · 🟢 polimento.

### Mobile (meetfront1)

- [ ] 🟡 **Compor a tela com 5 e 6 jogadores** — hoje está mal resolvida no
      celular (fantasminhas, zonas de pouso e meladas brigando por espaço).
      Posições em `calcularAssentosMobile` (`meetfront2/MesaExperimento.jsx`)
      e zonas em `meetfront1/zonasPouso.js`.
- [ ] 🟢 **Polir o coração do mobile** (vida).
- [ ] 🟡 Animações contra manilha.
- [ ] 🔴 Em partidas longas a destruição da mesa buga.

### Desempenho

- [ ] 🟢 **Perfil de qualidade por aparelho** — medir o aparelho do usuário e
      ligar as animações pesadas só se ele aguentar. Tudo que saiu do padrão
      ficou atrás de flag pra isso (`ajustesZap.js`, `ajustesCopas.js`,
      `ajustesMesa.js`, `FILTRO_ANTIGO_SVG`/`GRAO_NA_PARTIDA`/`CHOQUE_MODO` no
      `FiltroTela.jsx`).
- [ ] 🟢 Impacto do zap ainda trava ~115 ms mesmo sem efeitos (clarão,
      cratera, tremor, empurrão) — nunca medidos separados.

### Motor, bots e produção

- [ ] 🟡 **Rede de RL só treinou com 4 assentos** (`bots/BotBrain.js`,
      `training/`) — joga em salas de 2 a 6 via `ajustarParaModelo()`
      (encaixe/corte de assento), o que cobre 2–3 bem mas deixa 5–6 fora da
      distribuição de treino (jogada coerente, mas fraca). Falta treinar com
      nº de assentos variável ou uma rede dedicada a 5–6.
- [ ] 🟡 Subir o servidor num ambiente de verdade, com sockets web
      funcionando fora da rede local (hoje só foi testado em `localhost`).
- [ ] 🟡 Banco de testes em produção.
- [ ] 🟡 **Paridade de regra JS × Python** — `game/seed.test.js` e
      `training/python/test_seed.py` só pinam a distribuição (mesma seed,
      mesmas cartas). Nada pega se a REGRA (manilha, soma das apostas,
      desempate, rodada cega) mudar num lado e não no outro.

### Testes

- [ ] 🔴 **Testes unitários fora do `npm test`** — o script roda só
      `tests/**/*.test.js`, então `game/*.test.js` e `conexao/*.test.js`
      não rodam no CI. Rodar na mão:
      `node --test game/*.test.js conexao/*.test.js`.
- [ ] 🔴 **`game/loopPartida.test.js` falhando** (3 testes estouram o tempo:
      a partida para na rodada 4) — desde a espera das animações do front
      (`_esperarDistribuicao`/`game/animacoesFront.js`). Provável que o teste
      precise fixar `duracaoDistribuicaoMs`, mas não foi investigado.

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
 
