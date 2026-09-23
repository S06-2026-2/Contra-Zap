# Handoff: Frente "Arcade" do Contra Zap (com duelos de manilha)

Repositório alvo: `S06-2026-2/Contra-Zap` (branch `main`). App React 19 + Vite em `public/app/`.

## Visão geral
Uma **terceira frente visual** do jogo, ao lado de `novo` e `debugging`, com estética arcade/pixel. Inclui login em etapas, lobby, criar sala, sala de espera, mesa de partida, fim de partida, estados de conexão e painel de filtro de tela. O destaque são os **golpes e duelos de manilha**: animações em pixel art sobre o feltro, com som chiptune sintetizado em tempo real.

A frente usa o **mesmo** `socket.js`, `sessao.js` e protocolo (`conexao/PROTOCOLO.md`) das outras duas. Só a casca visual é nova. Jogadores em frentes diferentes jogam na mesma sala normalmente.

## Sobre os arquivos deste pacote
`referencia/Contra Zap.dc.html` é um **protótipo de design em HTML**. Ele mostra a aparência e o comportamento pretendidos, mas **não é código de produção para copiar**. Roda num runtime próprio de protótipo (`support.js`, templates `{{ }}`, dados falsos). Para ver, abra o arquivo no navegador com `support.js` e `som.js` na mesma pasta.

A tarefa é **recriar** o design dentro do app React existente, seguindo os padrões dele: componentes `.jsx`, CSS em arquivo, eventos via `socket.js`.

**Exceção:** `referencia/som.js` é JS puro (WebAudio). Pode ir para `public/app/src/arcade/som.js` quase sem mudança.

## Fidelidade
**Alta fidelidade.** Cores, tipografia, espaçamentos, tempos de animação e sons são finais. Recriar pixel a pixel.

---

## 1. Integração com o seletor de frentes

Estado atual do repo:
- `App.jsx` tem `const FRENTES = { novo: {...}, debugging: {...} }`.
- `components/SeletorFrente.jsx` tem `lerFrenteSalva()`, que só aceita `'novo' | 'debugging'`, e dois botões.

Mudanças:
1. **`SeletorFrente.jsx`**
   - `lerFrenteSalva` passa a aceitar também `'arcade'`.
   - Adicionar um terceiro botão, rótulo `👾 Arcade`, que chama `escolher('arcade')`.
2. **`App.jsx`**
   - Importar `LoginArcade`, `LobbyArcade` e `PartidaArcade` de `./components/arcade/`.
   - Adicionar a entrada `arcade: { Login: LoginArcade, Lobby: LobbyArcade, Partida: PartidaArcade }` em `FRENTES`.
   - Atualizar o `badge-frente` para mostrar `👾 Arcade` quando `frente === 'arcade'`.
   - As props de cada tela são **idênticas** às das outras frentes. Não mudar a assinatura.
   - A frente arcade já desenha o próprio banner de conexão (seção 3.7). Então, com `frente === 'arcade'`, esconder o `banner-conexao` global e passar `conectado` como prop extra para as telas.
3. **Nova pasta `public/app/src/components/arcade/`**:
   - `Login.jsx`, `Lobby.jsx` (lista de salas + criar sala), `Partida.jsx` (espera + mesa + fim).
   - `golpes.js`: geração das camadas de animação, extraída do protótipo (seção 4).
   - `arcade.css`: todas as classes prefixadas `az-` e os `@keyframes cz-*` copiados **verbatim** do `<style>` do protótipo.
4. **Lógica de eventos da partida**
   - Partir de `components/novo/Partida.jsx`: handlers de `cartaJogada`, `vazaFinalizada`, `PAUSA_VAZA_MS = 1600`, reconexão e `lerCarta`.
   - **Não reinventar o fluxo.** Copiar a máquina de estados e trocar só o render.
   - Para comparar manilhas, reaproveitar `lerCarta`, `saoIdenticas` e `compararForca` de `MesaExperimento.jsx` (linhas ~194–225). Eles espelham `game/Mesa.js`.

## 2. Design tokens

**Fontes** (Google Fonts):
- `Silkscreen` 400/700: todos os rótulos, números e botões em caixa alta.
- `Archivo` 400–800: texto corrido e nomes.
- Carregar em `public/app/index.html` ou via `@import` em `arcade.css`.

**Cores**
| Uso | Hex |
|---|---|
| Fundo da página | `#0c0d11`, com gradiente `radial-gradient(120% 90% at 50% 0%, #1b1d26 0%, #0c0d11 65%)` |
| Painel | `linear-gradient(180deg, #1a1c25, #14161d)` |
| Painel liso | `#171922` / `#12141a` / `#0f1016` (poços de número) |
| Borda de painel | `#262935` · borda forte `#2e313d` · divisória `#23252f` |
| Texto principal (creme) | `#f3ead6` |
| Texto secundário | `#8d93a6` · apagado `#6f7488` · muito apagado `#4a4f60` |
| Vermelho (marca, perigo, CTA principal) | `#ff4b3e` · hover `#ff6a5f` · sombra `#7d1f18` · sombra de texto `#5c1712` |
| Amarelo (manilha, destaque, CTA) | `#f5c451` · hover `#ffdc8a` · sombra `#8a6410` · texto sobre amarelo `#2b1d02` · fundo `#1c1810`/`#1e1a10` · borda `#3a2f16` |
| Verde (fez vazas, sucesso) | `#7fd6a5` · hover `#9ce8bd` · sombra `#245c42` · texto sobre verde `#06251a` |
| Azul (chat, convite, reconectar) | `#3d9be9` · hover `#63b4f5` · sombra `#17435f` · fundo `#0f2233` · texto `#cfe6fb` |
| Feltro | `radial-gradient(70% 90% at 50% 40%, #2a6a55 0%, #1a4739 60%, #123328 100%)`, borda `3px #0a0b0e` |
| Face da carta | `#f6efe0` (vira: `#f3ead6`) |
| Naipe vermelho (♦ ♥) | `#c0392b` |
| Naipe preto (♠ ♣) | `#1c1f26` |
| Verso da carta | `repeating-linear-gradient(45deg, #8b2018 0 4px, #a52a20 4px 8px)` |
| Cores de jogador (avatar) | `#f5c451`, `#3d9be9`, `#7fd6a5`, `#e07be0`, `#ff9d5c` (por índice de assento) |

**Botão "arcade" (padrão)**
- `border: 3px solid #0c0d11`, `border-radius: 14px`.
- `box-shadow: 0 5px 0 <sombra da cor>`.
- Fonte Silkscreen 11–12px, `min-height` de 52–56px.
- Hover troca para a cor de hover.

**Botão secundário**
- Fundo `#2a2d38`, texto `#cfd3de`, sombra `#16181f`, hover `#353948`.

**Raios**
- Cartas: 12–14px.
- Painéis: 16–20px.
- Chips: 999px.
- Feltro: `200px/90px`.

**Espaçamento**
- Gaps de 6, 8, 10, 14 e 18px.
- Padding de painel de 12–20px.
- Alvos de toque de no mínimo 44px.

## 3. Telas

Largura máxima e `data-screen-label` de cada tela, conforme o protótipo. A breakpoint é `window.innerWidth < 640` ("estreito").

### 3.1 Barra superior (todas as telas)
- Sticky, com fundo `rgba(12,13,17,.9)` + `backdrop-filter: blur(8px)` e borda inferior `2px #23252f`.
- Logo "CONTRA ZAP": Silkscreen 16px, `#ff4b3e`, `text-shadow: 2px 2px 0 #5c1712`.
- Botão **SOM ON/OFF** à direita: quadradinho de 9px na cor ativa (`#f5c451` ligado, `#6f7488` desligado).
- As **abas de telas do protótipo são só para navegação no design. NÃO portar.** No app, a navegação é a máquina de estados do `App.jsx`.

### 3.2 Login (`max-width: 440px`), mapeado para `verificarNome` / `entrar` / `cadastrar` / `entrarComoConvidado`
- Título "CONTRA / ZAP": Silkscreen 34px, `text-shadow: 4px 4px 0 #ff4b3e`.
- Subtítulo: "fodinha online — não erre o palpite".
- Etapas, na mesma ordem do `Login.jsx` atual:
  - **nome**: campo "SEU NOME" com borda `#f5c451` e botão CONTINUAR (amarelo), que chama `verificarNome`.
    - `existe: true` → etapa **senha**, com o texto "Esse nome já é registrado. Confirme que é você, **{nome}**." e o botão ENTRAR.
    - `existe: false` → etapa **oferta**, com o texto "\"{nome}\" ainda não tem conta. Quer registrar esse nome?" e os botões:
      - SIM, REGISTRAR → etapa **novaSenha**: borda verde, botão verde CADASTRAR, que chama `cadastrar`.
      - NÃO, SÓ JOGAR → chama `entrarComoConvidado`. Nota abaixo: "Como convidado, seu nome some quando a sessão acabar."
  - Toda etapa tem o botão "Voltar".
- Mostrar os erros (`SENHA_INCORRETA`, `MUITAS_TENTATIVAS` + `ultimaTentativa`, `CADASTRO_INVALIDO`) inline, em `#ff4b3e`, abaixo do campo.
- Os campos reais são `<input>` com o estilo dos blocos do protótipo: padding 15px, raio 12px, fundo `#0f1016`.

### 3.3 Lobby (`max-width: 1000px`), mapeado para `listarSalas` / `entrarSala` / `partidaRapida`
- Cabeçalho "SALAS ABERTAS" (Silkscreen 26px, sombra `#ff4b3e`) e o subtítulo "Entre numa mesa ou abra a sua."
- Botão **+ CRIAR SALA** (vermelho), à direita.
- **Banner de reconexão**, só se houver `salaParaReconectar`:
  - Borda e texto azuis.
  - Textos: "VOCÊ SAIU DA SALA {id}" / "Sua vaga na partida continua reservada."
  - Botão RECONECTAR, que chama `onReconectou`.
- **PARTIDA RÁPIDA**: largura total, 60px, gradiente `#7fd6a5 → #4fae7c`, texto `#06251a`.
- **Grade de salas**: `repeat(auto-fill, minmax(300px, 1fr))`. Cada card tem:
  - O id da sala.
  - Vagas `x/y`: verde; vermelho se cheia.
  - Tags derivadas de `chatAberto` e `privada`.
  - Uma linha de assentos: quadrados de 26px, cor do jogador se ocupado, `#22252f` se vazio.
  - Botão ENTRAR (amarelo). Sala privada pede senha antes de entrar.
- Botão 🔄 para trocar de frente, chamando `onTrocarFrente`. Colocar discreto no cabeçalho.

### 3.4 Criar sala (`max-width: 660px`), mapeado para `criarSala`
Título "NOVA MESA" (sombra `#3d9be9`). Seletores em blocos de botões de 56×48:
- valor ativo: fundo `#f5c451`, texto `#2b1d02`.
- inativo: fundo `#1a1c25`, texto `#8d93a6`.

Campos:
- JOGADORES `2..6` → `numberPlayers`.
- BOTS PRA COMPLETAR `0..numberPlayers-1` → `botNumber`.
- CARTAS NA 1ª RODADA `1..5` → `roundStart`.
- Toggles, cada um com trilho de 62×34:
  - "Chat aberto" → `chatAberto`.
  - Adicionar "Sala privada" → `privada`, com o mesmo toggle.
- Os **CORAÇÕES INICIAIS** do protótipo não existem no protocolo. Omitir, ou deixar desabilitado com a nota "em breve".
- ABRIR MESA (vermelho, 56px).

### 3.5 Sala de espera (`max-width: 760px`), mapeado para `listaJogadores` / `partidaIniciandoEm` / `forcarInicio` / `sairSala`
- "SALA {salaId}" (sombra `#f5c451`) e "Esperando a mesa encher — {n}/{total} jogadores."
- Caixa **COMEÇA EM** com a contagem em Silkscreen 30px `#f5c451`. Contagem regressiva local a partir de `segundos`, com som `tique` a cada segundo e `tiqueFinal` nos últimos 5.
- Grade de assentos `minmax(210px, 1fr)`. Rótulos por assento:
  - "DONO DA SALA" (`#f5c451`, se `adm`).
  - "BOT".
  - "PRONTO" (`#7fd6a5`).
  - "VAGA LIVRE" (`#4a4f60`, com o card mais escuro `#121319`).
- Chips de regras: CARTAS NA 1ª RODADA, CHAT, BOTS.
- Se o ack trouxe `senha`, mostrar um bloco com a senha para repassar.
- Botões:
  - FORÇAR INÍCIO AGORA (vermelho), só para o adm.
  - SAIR DA SALA (secundário).

### 3.6 Mesa de partida (`max-width: 1180px`)

**Cabeçalho**
- "SALA {id}" | "RODADA {n} · {cartas} CARTAS".
- À direita, a pílula MANILHA com o valor da manilha. Derivar de `viraValor` e conferir em `game/Rodada.js` se `viraValor` já é o valor da manilha. `Mesa.js` compara `valorInt === viraValor`, então tudo indica que sim.

**Grade**
- Largura normal:
  - `grid-template-columns: repeat(5, minmax(0,1fr))`.
  - `grid-template-areas: 'l tl tc tr r' 'l felt felt felt r'`.
  - Oponentes nas áreas `l, tl, tc, tr, r` (2 → `l,r`; 3 → `l,tc,r`; 4 → `l,tl,tr,r`; 5 → todas).
- Estreito: 2 colunas, oponentes em cima e o feltro ocupando a linha inteira.

**Card do oponente** (`max-width: 150px`)
- Versos da mão: `clamp(12px,3vw,26px)` × `clamp(18px,4.4vw,38px)`. Até 3; no estreito, até 2.
- Avatar com a inicial do jogador.
- Nome e corações (`♥` cheio / `♡` vazio, em `#ff4b3e`, Silkscreen 9px).
- Poço "APOSTA {n} FEZ {n}".
- **Da vez**: anel `3px #f5c451` com a animação `cz-pulse 1.4s`.
- **Eliminado**: overlay `rgba(9,10,13,.78)` + carimbo "FORA" (`cz-stamp .45s cubic-bezier(.2,1.4,.4,1)`, girado -14°).
- **Balão de chat** acima: borda `#3d9be9`, fundo `#0f2233`, entrada `cz-rise .25s`. Mostrar por ~3s a cada `chatMensagem`.

**Feltro**
- Oval com borda tracejada interna.
- Vira no canto superior esquerdo: 52×74, girada -8°, com o rótulo "VIRA".
- Cartas da vaza: 84×120, com o nome do jogador abaixo. Cada carta entra com `cz-rise .2s`.
- O container das cartas tem `animation: var(--cz-tremor, none)`. É a tremida do impacto (seção 4).
- Sem cartas: "MESA VAZIA".

**Overlay "VAZA FECHADA"** (em `vazaFinalizada`)
- Fundo `rgba(7,20,16,.86)` sobre o feltro.
- Carta vencedora 96×138 flutuando (`cz-float 2s`).
- Nome em Silkscreen 22px `#f5c451` e o texto "levou a vaza — {total} no total".
- Some sozinho após `PAUSA_VAZA_MS`. O botão CONTINUAR do protótipo não é necessário.
- Vaza melada (`vencedor` nulo): mostrar "MELOU" no lugar do nome.

**Sua área**
- Painel "Você" com corações, APOSTA e FEZ.
- Mão: cartas 92×132.
  - Hover: `translateY(-10px)` + brilho `0 0 30px rgba(245,196,81,.35)`.
  - Manilha: selo "MANILHA" amarelo no canto inferior esquerdo.
- Dica acima da mão:
  - "SUA MÃO — APOSTE PRIMEIRO".
  - "SUA VEZ — CLIQUE NUMA CARTA".
  - Adicionar "AGUARDANDO {jogador}".
- **Palpite**, em `turnoAposta` para mim:
  - Painel amarelo "QUANTAS VAZAS VOCÊ FAZ?" com botões de 52×52 de 0 a `cartas`.
  - Desabilitar o valor que fecha a soma (`APOSTA_FECHA_RODADA`) quando eu for o último a apostar e `cartas > 1`.
  - Nota: "Errar o palpite tira coração — pra mais ou pra menos."
- Rodada de 1 carta: minha carta aparece **virada** e as dos outros aparecem reveladas (`maosReveladas`).

**Chat e log**
- Frases prontas: chips arredondados vindos de `conexao/chat/mensagensChat.js`, com cooldown `CHAT_COOLDOWN_MS`.
- Log da partida: caixa de 190px com scroll. Cores por tipo:
  - vaza `#7fd6a5`.
  - jogada/aposta `#8d93a6`.
  - dano `#ff4b3e`.
  - rodada nova `#f5c451`.

**Expulso** (`jogadorExpulsoPorInatividade` com o meu id)
- Modal com borda `#ff4b3e`, título "VOCÊ SAIU DA MESA" e o texto do protótipo.
- Botões RECONECTAR (`reconectar`) e SALAS (`onSairDaPartida`).

### 3.7 Estados de conexão
- Com `!conectado`: faixa sticky abaixo da barra, fundo `#5c1712`, borda `#ff4b3e`, bolinha pulsando e o texto "CONEXÃO PERDIDA — TENTANDO RECONECTAR".
- Som `erro` na queda.

### 3.8 Fim de partida (`max-width: 620px`), mapeado para `jogoFinalizado` / `jogarDeNovo` / `convidadoParaRevanche`
- "FIM DE PARTIDA" e o card dourado do campeão: borda `#f5c451`, glow `0 0 50px rgba(245,196,81,.25)`, carta flutuando, nome em Silkscreen 28px e "último com coração na mesa".
- Pódio montado com a ordem de `jogadoresEliminados` ("eliminado na rodada N").
- Adm: botões JOGAR DE NOVO (`jogarDeNovo`) e VOLTAR ÀS SALAS.
- Convidado que recebeu `convidadoParaRevanche`: painel azul "{jogador} está te chamando pra outra partida." com os botões:
  - BORA → `sairDaPartida` + `entrarSala(novaSalaId)`, nessa ordem.
  - AGORA NÃO.
- `partidaAbortada`: mesmo layout, sem campeão, com o texto de erro.
- Som `vitoria` ao entrar.
- O botão "alternar: dono / convidado" do protótipo é só de design. **Não portar.**

### 3.9 Painel "FILTRO DE TELA"
- Fixo no canto inferior direito, com 250px de largura e expansível.
- Recria o `<details>` de filtros do `Partida.jsx` com as **mesmas chaves de `FILTROS`**: nenhum, pixelado, gameboy, crt, sepia, negativo, cinza, desfoque.
- Sliders: TAMANHO DO PIXEL (2–16, só nos efeitos pixelado/gameboy), GRÃO, CRT curvatura, scanlines, linha (2–16px) e aberração.
- Checks de grão colorido/animado. Botão RESETAR TUDO.
- Os filtros SVG (`cz-pixelar-{2..16}`, `cz-grao`) estão no topo do protótipo. **Um `<filter>` por tamanho**: o Chrome não reavalia `feTile` quando só o atributo muda.
- Se já existir implementação reutilizável no `Partida.jsx`, reaproveitar a lógica e trocar só o estilo.

## 4. Golpes e duelos de manilha (parte principal)

Fonte da verdade: o `<script>` do protótipo, com as funções `sprite`, `pedacos`, `quadrados`, `clarao`, `onda`, `camadasGolpe`, `camadasDuelo` e `dispararGolpe`.

**Como portar:**
1. Levar essas funções para `components/arcade/golpes.js`, **sem alterar números**.
2. Cada camada é uma string CSS.
3. Renderizar num overlay sobre o feltro: `position:absolute; inset:0; border-radius:200px/90px; overflow:hidden; pointer-events:none; z-index:6; image-rendering:pixelated`.
4. Para cada camada, usar um `<div>` com `ref={el => el && (el.style.cssText = camada.estilo)}`.
5. `key` única por disparo, para remontar e reiniciar as animações.

### 4.1 Hierarquia
Igual a `Baralho.js`/`Mesa.js`: `naipeInt` Ouros 0 < Espadas 1 < Copas 2 < Paus 3. No protótipo é `FORCA = {♦:1, ♠:2, ♥:3, ♣:4}`.

Mapa de naipe da string da carta (`"[K de Copas]"`) para o glifo: Ouros ♦, Espadas ♠, Copas ♥, Paus ♣.

### 4.2 Sprites
Pixel art desenhada com `box-shadow`: um div de `e×e` px e uma sombra por pixel.
- Mapas em `SPRITES` e paleta em `TINTA`.
- Escala base `e = 6px` × `golpeEscala`.
- Todas as animações usam `steps(n)`, para ficarem "travadas" em quadros como num jogo arcade.
- Toda camada nasce com `opacity: 0` e só aparece no seu `animation-delay`, com `forwards`. Isso evita o flash no primeiro quadro. **Manter.**

### 4.3 Quando disparar (em `cartaJogada`)
Guardar `reinante`: o naipe da manilha que está ganhando a vaza atual, ou `null`.

Ao chegar `cartaJogada`, fazer `c = lerCarta(p.carta)`. Se `c` não é manilha (`valorInt !== viraValor`), não animar nada. Se é manilha:

| Situação | Animação | Som |
|---|---|---|
| Já existe na mesa manilha **idêntica** (mesmo naipe; só com 2+ baralhos). `saoIdenticas` → anulação | `camadasGolpe(naipe, 'anula')` | `{naipe}Anula` |
| `reinante` é manilha e `FORCA[novo] > FORCA[reinante]` | `camadasDuelo(novo, reinante)` | `duelo_*` (tabela 4.4) |
| Caso contrário (primeira manilha da vaza, ou mais fraca) | `camadasGolpe(naipe, 'solo')` | `espada` / `copas` / `paus` / `ouros` |

Regras complementares:
- **Depois de animar**, atualizar `reinante` a partir de `p.status`, que vem de `Mesa.gerarStatus`:
  - `status === 'MELADO'` ou a anulação removeu a manilha → `reinante = null`.
  - Senão, `reinante` = naipe de `status.cartaGanhando`, se for manilha.
  - **Confiar no servidor para o estado. A animação só decora.**
- Se outra animação ainda estiver ativa quando chegar uma nova (`supera`), o golpe solo ganha:
  - um varrido (`cz-varrer`) e um clarão branco antes.
  - o som `supera`.
- Zerar `reinante` e cancelar a animação ativa em `vazaFinalizada`, `novaRodadaIniciada` e ao montar via `reconectar`. **Não animar as cartas que vêm no ack de reconexão.**
- Minha própria jogada anima quando o `cartaJogada` do servidor chega, não no clique (o novo/Partida já reconcilia assim). Assim todos veem a animação no mesmo instante.
- A duração máxima de um duelo é ~1180ms, abaixo de `PAUSA_VAZA_MS` (1600) e de `atrasoBotMs` (2000). Não é preciso segurar eventos.

### 4.4 Os seis duelos (vencedor → perdedor)
`bate` = instante do impacto em ms. Todos os tempos passam por `t(ms) = ms / golpeVelocidade`.

| Par | Coreografia | bate / dur | Som |
|---|---|---|---|
| ♠ → ♦ | O ouro espera tremendo. A espada atravessa na diagonal (`cz-golpe-corta`), fica um risco branco, e o ouro se parte em duas fatias **no próprio grid** (filtro `x+y < meio`) que voam em sentidos opostos. Estilhaços dourados e brancos. | 520 / 1140 | `duelo_espada_ouros` |
| ♥ → ♦ | O coração cresce dominante atrás (`cz-domina`). Duas ondas vermelhas e o ouro se desintegra em 3×3 blocos (`pedacos`) que giram para fora. | 440 / 1000 | `duelo_copas_ouros` |
| ♥ → ♠ | A espada avança (`cz-espada-presa`), o coração a trava no ar e ela se parte: a lâmina gira para cima e o punho cai. | 560 / 1180 | `duelo_copas_espada` |
| ♣ → ♦ | Marreta de cima (`cz-marreta`). O ouro achata (`cz-achata`) e estoura em 3×2 blocos. Onda de poeira. | 470 / 1050 | `duelo_paus_ouros` |
| ♣ → ♠ | Marretada lateral (`cz-marreta-lat`). A espada sai girando para fora da mesa (`cz-voa-gira`, 760°). | 520 / 1120 | `duelo_paus_espada` |
| ♣ → ♥ | Marreta de cima. O coração achata e racha ao meio (`cz-rachar-l/r`). Estilhaços vermelhos e marrons. | 470 / 1150 | `duelo_paus_copas` |

- **Tremida:** em todo duelo, e em todo golpe de ♣, aplicar `cz-tremor 380ms steps(3)` no container das cartas do feltro no instante `bate`. No protótipo isso é feito com a variável `--cz-tremor` no `documentElement`; no React, prefira state ou uma classe. Remover após 400ms.
- **Limpeza:** remover o overlay após `dur`. Limpar todos os timers no unmount.
- No protótipo, `dispararGolpe` monta via `requestAnimationFrame` **e** `setTimeout(32)`, com guarda `armado`. É um fallback para abas sem pintura. Pode manter.

### 4.5 Golpes simples e anulação
Iguais ao protótipo, em `camadasGolpe`.

Solo:
- ♠: corte diagonal com rastro.
- ♥: pulso e onda.
- ♣: pancada (bonk) e tremida.
- ♦: gema girando e clarão.

Anulação, com duas cópias colidindo no centro:
- ♠: lâminas cruzam em X.
- ♥: os corações se fundem e racham.
- ♣: choque com onda.
- ♦: chuva de estilhaços.

### 4.6 O que remover do protótipo
- A **faixa de teste "GOLPE DE MANILHA"**: botões por naipe, GOLPE SIMPLES/ANULAÇÃO e NOVA VAZA. Os disparos agora vêm de `cartaJogada`.
- As abas de navegação entre telas e o "alternar: dono / convidado".
- Os dados falsos (`NOMES`, `salas`, `log` etc.).

## 5. Som (`som.js`)
Classe `Som` com o método `tocar(nome)` e o volume master em `defVolume(v)`.
- O `AudioContext` só é criado no primeiro gesto do usuário (`acordar()`), por causa da política de autoplay.
- Instanciar **uma vez** na PartidaArcade, ou num singleton do módulo, e acordar no primeiro clique.
- Persistir SOM ON/OFF em `localStorage` (`contrazap-arcade-som`).

| Gatilho | Som |
|---|---|
| Clique em botão genérico | `clique` |
| Trocar de tela/aba, ligar o som | `aba` |
| Jogar carta que não é manilha (no `cartaJogada`) | `carta` (160ms, ruído baixo) |
| Manilha | só o som do golpe/duelo, **sem** `carta` por baixo |
| `apostaFeita` minha | `aposta` |
| `chatMensagem` | `chat` |
| Contagem da espera | `tique` / `tiqueFinal` (≤5s) |
| `vazaFinalizada` | `vaza` |
| `jogadoresEliminados` | `eliminado` |
| `jogoFinalizado` (vencedor) | `vitoria` |
| Conexão caiu / erro de ação | `erro` |

No protótipo, o volume é editável (`volumeSom`, padrão 0.7). Expor isso no painel de filtro ou deixar fixo.

## 6. Estado necessário (PartidaArcade)
- **Tudo o que o `novo/Partida.jsx` já mantém**: jogadores, mão, mesa, vira/viraValor, apostas, placar, vez, eliminados, desconectados, vencedor, chat e log.
- Mais estes, da frente arcade:
  - `golpe`: `{ key, camadas }` ou `null`.
  - `reinanteRef`: ref, não state.
  - `tremendo`: boolean.
  - `somLigado`: boolean.
  - `estreito`: boolean, via listener de `resize`.
  - Estado dos filtros de tela (as mesmas chaves do painel).
  - `balaoPorJogador`: mapa nome → texto, com timeout.

## 7. Checklist de teste
1. Sala solo com bots (`botNumber` = n-1) e `roundStart` 3. Jogar até o fim: mesa → vaza → rodada → eliminação → fim → revanche.
2. Com `seed` fixa, encontrar vazas com duas ou mais manilhas e conferir os 6 duelos e a ordem de força.
3. `maxDeck`/muitos jogadores para forçar 2 baralhos e testar a anulação de manilha idêntica.
4. F5 no meio de uma vaza com manilha: a mesa volta **sem** reanimar.
5. Duas abas (arcade + novo) na mesma sala: as duas jogam normalmente.
6. Derrubar a rede (DevTools offline): faixa de conexão, depois retomada.
7. Rodada de 1 carta: a própria carta aparece virada.

## Arquivos
- `referencia/Contra Zap.dc.html`: protótipo completo. Telas, CSS e keyframes no `<helmet>`; lógica e animações no `<script data-dc-script>`.
- `referencia/som.js`: motor de som, portável.
- `referencia/support.js`: runtime do protótipo, **só para abrir o HTML localmente**. Não vai para o app.

- `screenshots/`: referência visual estática (desktop ~924px). A animação real deve ser vista abrindo o protótipo.
  - `01-login.png`, `02-lobby.png`, `03-criar-sala.png`, `04-sala-espera.png`, `05-mesa.png`, `06-fim-partida.png`
  - `07-duelo-espada-corta-ouros.png`: quadro do impacto ♠ → ♦ (risco da lâmina sobre o ouro)
  - `08-painel-filtro.png`: painel FILTRO DE TELA aberto
  - Estes elementos são só do protótipo e **não devem** ser portados: as abas LOGIN…FIM na barra, a faixa de teste GOLPE DE MANILHA abaixo da mão e "alternar: dono / convidado".

## Assets
- Nenhuma imagem. Sprites em pixel art como dados (`SPRITES`) e sons sintetizados.
- Os chapéus/fantasminhas da frente `novo` não são usados aqui.
