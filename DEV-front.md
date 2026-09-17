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
      não um só. Botão de debug `🏆 Finalizar vaza` lê a MESMA carta que
      já é `analiseMesa.idVencedora` (não sorteia de novo). Falta plugar
      em `vazaFinalizada` de verdade.
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
- [ ] **💀 Morreu / quanto já apostou** (resto do "status por jogador" —
      🤖 bot já está feito, ver acima). Precisa aparecer vinculado ao
      fantasminha/assento (que hoje nem tem nome de verdade, só
      "Player N").
- [ ] **Indicação de turno — quem VENCEU o jogo** (a parte de fantasminha
      já está feita, ver acima). Falta a tela/mensagem de fim de jogo.
- [ ] **Pós-vitória** — botão "jogar de novo" (só o dono da sala) + convite
      de revanche (aceitar/recusar) pros demais.
- [ ] **Rodada cega ("testa", 1 carta)** — mostrar a mão dos OUTROS
      revelada e esconder a própria. Hoje é sempre o contrário (mão dos
      outros sempre virada, a sua sempre visível).
- [ ] **Placar da última rodada** (hp de cada jogador). Nenhuma UI existe
      ainda.
- [ ] **Erro de ação** — feedback visual de aposta inválida etc. Hoje só
      existe como `<p class="erro">` no front antigo.
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
