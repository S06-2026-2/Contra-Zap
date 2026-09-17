# Frente visual da Partida — checklist

Acompanha o trabalho de fechar o visual novo da tela de Partida. O
protótipo mora em `public/app/src/components/novo/MesaExperimento.jsx`
(+ estilos `mesa-exp-*`/`fantasminha-*` em `public/app/src/index.css`) —
**desligado do socket/protocolo de propósito**, só o esqueleto visual, até
fechar o arranjo pra portar pro `Partida.jsx` de verdade (hoje 100% texto
cru: `<span class="carta">`, listas, sem nenhum desse visual).

Pra rodar: `npm start` na raiz + `npm run dev` dentro de `public/app`
(porta 5173), ou `npx vite build` dentro de `public/app` + `npm start` na
raiz servindo `public/dist` — ver `DEV.md`. Rota: `/experimento` (tem um
seletor "Experimento: mesa" na tela de escolha de frente também).

A lista original de elementos que o `Partida.jsx` real precisa mostrar
está comentada no topo do próprio `MesaExperimento.jsx` — este arquivo é
só o mesmo levantamento com status, pra não repetir a leitura do código
toda vez que a gente retomar.

---

## Resolvido no sandbox (falta plugar dado/protocolo real)

- [x] Fundo, mesa oval, assentos/fantasminhas decorativos
- [x] Baralho central + animação de distribuir cartas
- [x] Sua mão em leque (cartas grandes, clicáveis) e mão dos outros em leque
      miniatura (viradas)
- [x] Mesa da vaza atual: cartas jogadas espalhadas por assento
- [x] Vira/manilha: animação de virar + legenda de hover com preview dos 4
      naipes
- [x] Carta mais forte (contorno roxo) e melada (contorno preto, agrupada
      por rank no canto — grupos com espaçamento ajustado, primeiro grupo
      puxado mais pra esquerda)
- [x] **Revelação de fim de vaza** — coreografia de 4 fases (ver
      `faseRevelacaoVaza`/`calcularEstadoRevelacaoVaza`, mesmo espírito de
      fase-a-fase de `tocarVira`):
      1. `crescendo` — tela escurece, a carta vencedora sai de onde estava
         (px reais, `getBoundingClientRect` no clique) e cresce até um
         ponto quase-central da TELA (não da mesa — um pouco pra esquerda
         do centro, sobra espaço pro texto "Fim de Vaza: {jogador}" +
         rank/naipe do outro lado), já desgirada.
      2. `impacto` — "bate": cai um pouco e encolhe rápido pro tamanho
         normal ("violentamente"). Dispara junto: tela desescurece,
         legenda some, uma onda de choque (anel expandindo) + tremor de
         tela curto, e as cartas PERDEDORAS que sobraram na mesa
         "explodem" pra fora (radialmente do centro da mesa, giram várias
         voltas, crescem um pouco, desaparecem no fim do percurso).
      3. `viajando` — a vencedora parte do centro até a pilha de fichas de
         aposta de quem ganhou (`calcularAncoraFichaAssento`, reaproveita
         a mesma âncora de `fantasmaAposta`/canto da sua aposta).
      4. `pousada` — fica ali pro resto da partida, embaixo de uma ficha
         (z-index menor, ver `cartasVazaGanhas`) — representa uma vaza
         feita. Placeholder visual só, ainda sem "cara"/número nas
         próprias fichas pra dizer quantas vazas faltam (Henrique já
         avisou que isso é próximo passo).
      Componente `CartaRevelando` reaproveita o truque de "nasce sem
      transition, pula com transition um quadro depois" de
      `CartaVoando`/`FichaVoando`, só que com VÁRIOS alvos (um por fase),
      não um só. Fase `crescendo` segura uma pausa (`VAZA_REVELACAO_
      PAUSA_MS`) parada grande/centralizada antes do impacto, dá tempo de
      ler a legenda. Botão de debug `🏆 Finalizar vaza` lê a MESMA carta
      que já é `analiseMesa.idVencedora` (não sorteia de novo). Falta
      plugar em `vazaFinalizada` de verdade.
      **A SUA pilha de fichas** (não a dos fantasminhas, essa continua em
      px) virou uma fileira `flex` de verdade (`.mesa-exp-aposta-fichas-
      linha`/`-ficha-slot`) em vez de leque calculado em px — cada ficha
      mora num slot que cresce sozinho (`slotIndice` em
      `cartasVazaGanhas`) quando uma vaza ganha "escolhe" ele, empurrando
      os slots seguintes pra direita via flexbox, sem cálculo de x na
      mão. Cartas pousadas ficaram bem menores (`VAZA_POUSO_ESCALA`
      0.62→0.28, "mais pequenininhas").
- [x] Reação de dano do fantasminha (flash + chapéu) — só um botão de teste
      solto (`💥 Fantasma leva dano`), ainda não ligado a nenhuma regra real
      do jogo (não existe "dano" no Contra ZAP — foi decoração pro
      fantasminha reagir a alguma coisa; decidir depois se vira eliminação,
      vaza perdida, etc., ou se fica só estética)
- [x] **Cabeçalho da sala** — título "Sala {id}" e botão sair (texto muda
      antes/depois de iniciar) flutuando nos cantos superiores; senha só
      aparece antes de iniciar. `salaId`/senha ainda são placeholders
      (`SALA_ID_TESTE`/`SENHA_TESTE`) — falta vir do servidor de verdade.
- [x] **Chat** — botão circular no canto inferior esquerdo; painel
      (4 mensagens prontas do catálogo real + campo livre, se a sala
      permitir) só visível com o botão clicado; módulo de **histórico** à
      direita do painel (mesma visibilidade) com as mensagens enviadas e
      avisos de sistema de entrar/sair; **balão de fala** em cima do
      fantasminha de quem mandou, sempre (painel aberto ou não). Cooldown
      cosmético de 3s (`CHAT_COOLDOWN_MS`, mesma fonte que o back usa).
      Falta plugar no `chatMensagem`/`chat` de verdade — hoje quem "manda"
      é ou você (via UI) ou o botão de debug `💬 Fantasma fala`.
- [x] **Indicador de bot (🤖, parte do "status por jogador")** — nome do
      assento mais claro/maior; tag "🤖 bot" ao lado do nome; fantasminha
      ganha duas engrenagens (cor = próprio `hue`, atrás do corpo) e
      olhos/boca com cantos quase retos; monitor de peito com onda
      quadrada aleatória (switch próprio pra ligar/desligar só ele, ainda
      em avaliação se fica ou é estímulo demais). Botão de debug
      `🤖 Alternar bot` cicla os fantasminhas. Falta plugar em
      `desconectados`/`jogadorExpulsoPorInatividade`/`jogadorReconectou`
      de verdade — 💀 morreu e "quanto já apostou" do resto do item
      "status por jogador" ainda não têm UI nenhuma.
- [x] **Aposta** — botão "Apostar" flutua acima da sua mão só na sua vez
      (`apostaSuaVez`, botão de debug); abre um popup (fundo escurecido,
      clique fora fecha sem confirmar) com uma pilha "flutuante" de fichas
      que cresce com o valor, campo numérico + setinhas (min 0, max
      `APOSTA_VALOR_MAX` = mesmo limite de `cartasRodada` do protocolo) e
      um botão "Apostar" que confirma. Ao confirmar, o popup fecha e as
      fichas voam (arremesso com sobe-gira-desce, rAF próprio, portado/
      "boostado" de `public/_intro/index.html`) até empilhar no canto
      inferior esquerdo da tela (perto do botão de chat, sem sobrepor).
      Ficha nova: `components/novo/Ficha.jsx` — dourada com anel de
      cassino, componente próprio. Falta plugar em `turnoAposta`/`apostar`
      de verdade — hoje quem decide "é sua vez" e o valor máximo é tudo
      local/fixo.
      **Aposta dos outros jogadores (fantasminhas)**: sem popup — o
      arremesso nasce e pousa DENTRO do próprio retângulo do assento
      (perto do fantasminha, não mais do lado de fora da mesa), fichas
      empilhadas na VERTICAL (não em leque como a sua) e **sempre
      visíveis**. Centro da ficha usa a MESMA cor (`hue`) do corpo do
      fantasminha que apostou (precisou subir a geração do `hue` de
      `Fantasminha.jsx` pro pai, `huesPorAssento`); borda da ficha
      redesenhada pra preto/branco (era dourado/vinho). O hover no
      fantasminha ganhou reciprocidade com o hover na carta jogada: os
      dois lados já destacavam o assento a partir da carta; agora hover no
      assento TAMBÉM destaca a carta dele na mesa, e revela uma legenda
      "Aposta: N" centralizada no retângulo, um pouco abaixo do centro do
      fantasminha (só essa legenda é hover-only, as fichas não). Botão de
      debug `🪙 Fantasma aposta`.
      **Indicação de turno**: fantasminha na vez ganha contorno azul claro
      (`naVez`, mesma técnica do contorno amarelo de hover — os dois nunca
      aparecem juntos, hover tem prioridade) + legenda "Vez de {jogador}"
      no MESMO lugar da legenda de aposta, só que essa NÃO é hover-only
      (as duas se revezam no mesmo espaço, nunca as duas ao mesmo tempo).
      Botão de debug `▶️ Avançar vez` — só um assento por vez, nunca
      acumula. Falta decidir/implementar indicação equivalente pra quando
      é a SUA vez (ver conversa: cogitamos um texto "Vez de X" no
      topo-centro da tela como complemento).

## Falta (não existe visualmente em lugar nenhum ainda)

- [ ] **Tela de espera** — lista de quem já entrou, contador "sala cheia,
      começa em Xs", botão forçar início. Hoje o sandbox já nasce "na mesa,
      em partida" — precisa de um estado/tela própria pra isso (o botão de
      debug `🔀 Ver: antes de iniciar` já prevê a MUDANÇA de estado do
      cabeçalho, mas não desenha a tela de espera em si). **Decisão
      (2026-09-17): pode ser EXATAMENTE a mesma do `Partida.jsx` original**
      — não vale redesenhar algo tão simples; ao plugar no back de
      verdade, portar a tela de espera existente como está, sem passar
      pelo sandbox visual novo.
- [x] **Vida (coraçõezinhos)** — `Coracoes`: emoji puro (❤️ cheio / 🖤
      perdido), `VIDA_MAXIMA = 3` bate com `this.hp = 3` em
      `game/PlayerGame.js`. A SUA fica fixa no canto inferior direito,
      sempre visível; a dos fantasminhas só aparece com o mouse em cima
      (mesmo `assentoEmHoverIndex` da legenda de aposta/vez), ou
      MOMENTANEAMENTE sem hover nenhum: logo depois de tomar dano de vida
      de verdade (`assentosVidaTemporaria`, 1.5s, sincronizado com a
      animação de dano) OU no **fim de RODADA** (`finalizarRodada`/
      `RODADA_FIM_REVELACAO_MS`, 2.8s — bem mais longo, dá tempo de olhar
      o placar de todo mundo de uma vez, não só um flash). Coração entra
      sempre com um "pop" (`mesa-exp-assento-vida-entrada`); a sua ganha
      um pulso de destaque no fim de rodada também, pra reagir junto com
      o resto. Botões de debug `💔 Perder vida` (cicla por TODOS os
      assentos, inclusive "Você"), `💚 Restaurar vida` e
      `🏁 Finalizar rodada` (só revela os corações — não recalcula HP
      nenhum, isso é `perderVida`).
- [x] **💀 Morreu (animação de morte)** — coreografia de 3 fases (ver
      `estadoMortePorAssento`/`matarFantasma`): `'impacto'` reaproveita a
      MESMA animação de dano de sempre (`danoPorAssento`), só que os olhos
      ficam fechados **pra sempre** (o rosto "machucado" não volta sozinho
      — `Fantasminha.jsx` recebe `estadoMorte` e força isso); depois de
      `MORTE_IMPACTO_MS` (== `DURACAO_DANO_MS`, a animação de dano rolando
      inteira), `'desintegrando'` — o corpo desmancha (fade + blur +
      afunda, troca a PRÓPRIA animação de flutuar por uma de desmanchar)
      e explode num punhado de partículas quadradas na cor dele; depois de
      `MORTE_DESINTEGRAR_MS` vira `'morto'` — o assento troca de vez pra
      "💀 Eliminado" (sem fantasminha, sem legenda nenhuma). Botões de
      debug `💀 Fantasma morre` (pega o primeiro vivo, não cicla — morte é
      definitiva) e `✨ Reviver fantasmas` (reset manual pra repetir o
      teste). **Não está ligado à vida** (`vidaPorAssento` chegar a 0)
      automaticamente ainda — é um gatilho próprio por enquanto. "Quanto
      já apostou" já resolvido (ver item Aposta).
- [x] **Fim de jogo (quem venceu)** — reusa o MESMO sistema de tela
      escurecida da revelação de vaza (`.mesa-exp-vaza-overlay`), só que
      PERSISTENTE (sem fases, não some sozinho): o vencedor fica grande no
      centro (`<Fantasminha>` de verdade, escalado via `transform:
      scale()`) + "{JOGADOR} VENCEU!" + botão "Jogar de novo" (só fecha o
      overlay no sandbox, não cria sala nova de verdade). Se "Você" (índice
      0) ganhar, é a ÚNICA situação em que chega a existir um
      `<Fantasminha>` desenhado pra você — o resto do sandbox só mostra o
      texto "Você" nesse assento. Botão de debug `🏆 Alguém venceu o jogo`
      sorteia qualquer assento (inclusive você). Falta plugar em
      `jogoFinalizado` de verdade e o convite de revanche
      (aceitar/recusar) pros outros jogadores.
- [x] **Rodada cega ("testa", 1 carta)** — só a parte VISUAL (ver
      `conexao/PROTOCOLO.md`, seção "Rodada de 1 carta"): o protocolo real
      já manda `maosReveladas` com a mão dos outros pra todo mundo e
      continua mandando a SUA `suaMao` de verdade — esconder a própria
      carta é decisão só de tela, o servidor nunca deixa de te dizer o que
      você tem. Toggle `rodadaCegaAtiva`/`alternarRodadaCega` sorteia uma
      carta aleatória por assento fantasminha (`cartasCegasPorAssento`) e
      passa pra `<MaoEmLeque>` via prop `cartas` NOVA e opcional (sem
      `cartas`, comportamento de sempre: leque virado por `quantidade`,
      nenhum outro chamador foi tocado); `<SuaMaoEmLeque>` ganhou prop
      `escondida` (também opcional) que troca o render pra `<Carta virada
      />` sem mexer no `onClick`/`jogarCarta` — a carta continua jogável
      normalmente, só não aparece. Desliga sozinho ao trocar `quantidade`
      de assentos (mesmo `useEffect` de reset dos outros estados por
      assento). Botão de debug `🙈 Rodada cega: ligada/desligada`. Não
      toca em `distribuirCartas`/`maos`/`suaMao` — funciona plugado ou
      desplugado do resto do sandbox.
- [ ] **Placar da última rodada** (hp de cada jogador). Nenhuma UI existe
      ainda.
- [x] **Erro de ação (aposta inválida)** — campo da aposta virou
      `type="text"` (não mais `number`, que some sozinho com valor fora de
      min/max sem deixar nem digitar pra validar); confirmar com texto
      vazio/não-inteiro/fora de `[0, APOSTA_VALOR_MAX]` mostra mensagem
      vermelha (`--erro`, mesma cor do resto do app) + a borda do campo
      treme uma vez. Setinhas continuam sempre produzindo valor válido
      (não dá pra ficar inválido usando só elas). Resto de "erro de ação"
      (outras ações fora aposta) ainda não tem UI.
- [ ] **Nomes reais dos jogadores** ligados aos fantasminhas — hoje é
      decoração com quantidade configurável manualmente (`+`/`−`), sem
      nome de jogador nenhum (só "Player N" fixo pelo índice do assento).
- [ ] **Conexão com o socket/protocolo de verdade** — o item que amarra
      todos os outros. Hoje está desligado de propósito (ver
      `conexao/PROTOCOLO.md` pro contrato); todo dado no sandbox é
      aleatório/local/gerado por botão de debug.

## Fora de escopo por ora

Filtros de tela (pixelado/CRT/grão/aberração cromática) do `Partida.jsx`
antigo são uma "brincadeira" à parte, não fazem parte da lógica do jogo —
decidir depois se porta pro visual novo ou descarta.
