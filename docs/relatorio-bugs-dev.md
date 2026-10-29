# Relatório de investigação — problemas do DEV.md (2026-10-28)

Investigação feita por 5 subagentes (só leitura, nada do projeto foi editado).
Base: HEAD `3547471`, front buildado a partir de `public/app/src`.
Evidências (scripts, screenshots, logs) em
`C:\Users\vitor\AppData\Local\Temp\claude\D--Codigos-Contra-Zap\38ec352b-ff55-4e3c-b279-fcc1a33d608f\scratchpad\`
(subpastas `testes`, `espera`, `mesa`, `layout`, `fluxo`).

Gravidade: 🔴 alta · 🟡 média · 🟢 baixa. Esforço: P (<30 min) · M (1–2 h).

---

## 1. Novos bugs críticos encontrados (fora da lista)

| # | Bug | Causa | Correção | Esf. |
|---|---|---|---|---|
| 🔴 1.1 | **Celular 375/360 px não consegue apostar** — toque no "Apostar" cai no seu próprio assento invisível; servidor aposta sozinho por timeout | `meetfront1/meetfront1.css:741-746` — `z-index:38` em `.mf1-mobile .mesa-exp-assento` pega também `.mesa-exp-assento-voce` | `:not(.mesa-exp-assento-voce)` ou `pointer-events:none` nele | P |
| 🔴 1.2 | **Duplo clique em "Jogar de novo" cria 2 salas de revanche** (você adm nas duas, uma órfã) | `criandoRevanche` não chega na mesa; botão sem `disabled` (`MesaExperimento.jsx:4715`) | passar `criandoRevanche` no `estado`, guarda por ref em `jogarDeNovo`, servidor rejeitar repetição (`SalaManager` ~349) | P |
| 🔴 1.3 | **Vitória no desktop prende não-adm sem convite** — "Sair" do cabeçalho fica coberto pelo overlay `.mesa-exp-vitoria` | botão "Sair" da vitória só existe com `mobile &&` (`MesaExperimento.jsx:4722`) | remover `mobile &&`, rotular "Voltar às salas" | P |
| 🟡 1.4 | **Lobby oferece RECONECTAR pra sala já encerrada** (→ `SALA_NAO_ENCONTRADA`) após vitória/Não/abort | `App.jsx:217-220` sempre arma `salaParaReconectar` | usar `onSairDaSala` quando `vencedor`/abortada | P |
| 🟡 1.5 | **Popup de aposta não fecha quando o tempo estoura** → `NAO_E_SUA_VEZ` dentro dele | nada reage a `jogadorDaVezAposta` (`MesaExperimento.jsx:2446/3665/3714`) | `useEffect` fecha popup quando não é mais sua vez | P |
| 🟡 1.6 | **Mão fantasma** — carta na mão local que o servidor não tem; clique falha em silêncio → expulsão por inatividade | `Partida.jsx:507` (`indexOf` falha sem aviso) | investigar dessincronia + ressincronizar mão ao falhar | M |
| 🟢 1.7 | Erros `null.setAttribute/style` no console em toda partida | loops rAF de `TimerNome` (~1176) e `PavioBorda` (~1330) após desmontar | `if (!ref.current) return` no `passo` | P |

## 2. Testes

| Item | Status | Causa real | Correção |
|---|---|---|---|
| 🔴 `loopPartida.test.js` estoura tempo | Reproduzido | **Não é a distribuição** (retorna na hora sem humano). São as pausas reais `pausaVazaMs` (1,6 s) e `pausaRodadaMs` (2 s), do commit `fe6bf8e`; o teste nunca as zerou. "Rodada 4" é só onde o relógio corta. | `game/loopPartida.test.js:19`: adicionar `pausaVazaMs: 0, pausaRodadaMs: 0` — provado: 4/4 passam em ~1,5 s. **P** |
| 🔴 Testes fora do `npm test` | Reproduzido (11 arquivos em `game/` e `conexao/`) | Incluir hoje quebraria o CI (loopPartida + `login.test.js` intermitente com `database is locked` por compartilhar o banco entre processos) | 1) corrigir loopPartida; 2) isolar banco em `login`/`cadastro` importando `tests/helpers/ambiente.js` primeiro; 3) `"test": "node --test \"tests/**/*.test.js\" \"game/*.test.js\" \"conexao/*.test.js\""`. Com isso: 111/111. **M** |
| 🟢 `tests/api` no Windows | 9 arquivos "falham" na saída (subtestes verdes) | `rmSync` do SQLite aberto → `EPERM` em `tests/helpers/ambiente.js` | fechar o banco antes de apagar; provavelmente OK no Linux do CI (não verificado) |

## 3. Sala de espera e timer ("tela de espera bugada", "timer bugado")

| # | Bug | Causa | Correção |
|---|---|---|---|
| 🔴 3.1 | **Contagem não para quando alguém sai da sala cheia** — vai até "COMEÇA EM 0", "Forçar início" dá `SALA_NAO_CHEIA` e o erro fica | servidor cancela em `GameController.js:205-224` mas não avisa; cliente só zera em `novaRodadaIniciada` (`Partida.jsx:157-161, 417-425`); `salaCheia` por `segundosParaIniciar != null` (`MesaExperimento.jsx:1921`) | emitir `partidaIniciandoEm {segundos:null}` (documentar no PROTOCOLO.md); `salaCheia = jogadores.length >= total`; limpar `erro` em `listaJogadores` |
| 🔴 3.2 | **Queda de rede na espera deixa tela "surda"** — servidor tira o jogador, tela continua mostrando ele sentado; partida começa sem ele | `socketServer.js:620-622` sai da sala no disconnect; `assinarSessaoRetomada` só com `iniciada` (`Partida.jsx:379-381`) | na espera, re-`entrarSala` ao retomar sessão (ou ir pro lobby com aviso); opcional: prazo de graça no servidor |
| 🟡 3.3 | Após queda no meio da partida, pavio parado em 0 e caixa "VOCÊ" acesa na vez de outro | `ressincronizar` (`Partida.jsx:382-402`) não mexe em `prazoTurno` | `setPrazoTurno(null)` + prazo no ack (3.4) |
| 🟡 3.4 | Após F5 no meio do turno, seu timer não aparece (prazo corre invisível) | `estadoDeReconexao` (`GameController.js:890`) não devolve prazo | guardar `_prazoTurno` em `_emitirTimerTurno` e devolver `tempoMs` restante |
| 🟡 3.5 | Tela de espera no celular: "SAIR DA FILA" por cima de "SALA XXXX" | raiz da espera (`MesaExperimento.jsx:3982`) não recebe `mf1-mobile` | adicionar `${mobile ? ' mf1-mobile' : ''}` |
| 🟡 3.6 | F5 na espera tira da sala sem aviso (dono sozinho → sala destruída) | ligado a 3.2 | guardar sala no sessionStorage e reentrar |
| 🟢 3.7 | Contagem da espera só local, acumula atraso em aba travada | `setTimeout(1000)` encadeado (`Partida.jsx:417-425`) | usar `terminaEm` absoluto |

OK: pavio/pizza batem com o servidor (1–15 ms), dono saindo passa a coroa, contagem recomeça ao relotar.

## 4. Mesa e efeitos

**Causa raiz comum (PC):** `meetfront2/meetfront2.css:27-31` aplica `translate` em `.mesa-exp-mesa`. Isso (a) faz a mesa virar bloco de contenção dos `position: fixed` internos (overlay, picareta, clarões) — ficam deslocados pelo canto da mesa, (+171, +210) px em 1440×900; (b) cria contexto de empilhamento próprio — o escurecido não cobre mão/caixa/topo. No celular a regra não se aplica.

| # | Item DEV.md | Status | Causa | Correção |
|---|---|---|---|---|
| 🔴 4.1 | "Z das destruições depois de muito tempo" / "destruição da mesa buga em partida longa" | Reproduzido (6 jog., seed 57) | camada de dano usa `zIndex: geracao`, que só cresce (`MesaDanificada.jsx:2389`, `MesaExperimento.jsx:2633`). Geração 14+ cobre a vira (12), 15+ as cartas (14); de 46–49 cobriria escurecido/coreografia. **Não é vazamento** (DOM/heap estáveis) | `isolation: isolate; z-index: 0` em `.mesa-exp-danos` (ou `geracao % 10`). **P** |
| 🔴 4.2 | "Ouros muito bugado no PC" | Reproduzido (seed 179, 2 jog., roundStart 6) | picareta/clarão em `position: fixed` deslocados pelo `translate` (`MesaDanificada.jsx:1391-1447`); escurecido só no retângulo da mesa. Zap tem o mesmo escurecido preso | tirar o `translate` (usar `margin-top`/`top`) ou portal dos overlays pra `.mesa-exp-tela`. **P/M** |
| 🟡 4.3 | "Colisão da manilha só na carta de baixo" | Não reproduzido como descrito (Zap empurrou todas) | limitações: só o Zap colide; cartas voando/outra manilha ficam de fora; manilha pousada com `Z_CARTA_SIMULADA_POUSADA = 1` (`MesaDanificada.jsx:443`) fica **abaixo** das cartas (14) | confirmar com quem reportou; provável que seja o z-index 1 |
| 🟢 4.4 | Zap trava ~115 ms | Não reproduzido no desktop (maior tarefa ~10 ms; 1 quadro de 56–77 ms) | `getBoundingClientRect`/`getComputedStyle` por quadro em `zapCanvas.js quadro()` (~13%); commit no impacto invalida a árvore toda; classe `mf1-choque-franjas-N` sem CSS (`FiltroTela.jsx:297`) | cachear medidas, apagar a classe, desmontar glitch ao fim; medir no aparelho real |

## 5. Layout web/mobile

| # | Item | Status | Causa | Correção |
|---|---|---|---|---|
| 🟡 5.1 | "Card quando você morre some (web)" | Reproduzido (1280/1440/1920) | `SeuFantasminha` retorna `null` em `'morto'` (`MesaExperimento.jsx:986`); os outros ganham placeholder em `:4301` mas você é pulado | placeholder 💀 reaproveitando `.mesa-exp-assento-eliminado` |
| 🟡 5.2 | "Você eliminado / assistindo" | Reproduzido (desktop e mobile) | não existe estado de UI `euEliminado` (só em `:2944/:3095`) | faixa "VOCÊ FOI ELIMINADO — ASSISTINDO", banner em modo espectador |
| 🟡 5.3 | "Tamanho carta 1ª rodada (web)" | Sua carta: sem diferença. **Cartas reveladas dos outros na rodada cega: 43×51 px**, meio escondidas atrás da barra do nome | `meetfront2.css:178-181` (`scale 1.35` dentro de `--escala-fantasma .72`) | escala ~2,5–3 no desktop (mobile já usa 2.55) e z-index acima da barra. *Confirmar qual carta a anotação queria dizer* |
| 🟡 5.4 | Mobile 5–6 jogadores | Muito melhor; restos | zonas laterais e melada (`zonasPouso.js:50`) saem 12–22 px pela borda; cartas jogadas se sobrepõem 58–89% (`sortearPontoNaZona`, `:65`); em 375 o chat e o "Sair" ficam cobertos por caixinhas; em 412 "SALA" por cima de "RODADA" | fechar zonas com meia carta de margem; melada x≥18%; descer `ASSENTOS_MOBILE[4/6]` |
| 🟡 5.5 | Paisagem (812×375) | cai no layout de PC; SuaCaixa cobre Apostar e mão | — | tratar paisagem como mobile |
| 🟢 5.6 | Corações do mobile | OK | — | — |
| 🟢 5.7 | Hover preso no mobile infla a carta pra cima do Apostar | plausível | `meetfront1.css:200` ignora `escalaBase` | `@media (hover:hover)` |

## 6. Front da mesa — "Durante a partida" / "Fim de partida"

| Item DEV.md | Procede? | Onde mexer | Esf. |
|---|---|---|---|
| 🔴 Erros de ação invisíveis | **Sim** — e `jogarCarta` recusado ainda faz o arremesso otimista (`MesaExperimento.jsx:3734`) | `erro` só renderizado na espera (`:2013`); toast na mesa + desfazer arremesso | M |
| 🔴 Partida abortada | **Sim** — mesa congela. Obs.: só acontece por erro interno do motor; humanos caindo viram bot | estado `abortada` em `Partida.jsx:284-291` + overlay "PARTIDA INTERROMPIDA" | P/M |
| 🔴 Sem "Voltar às salas" na vitória | **Sim no desktop** (ver 1.3), parcial no mobile | `MesaExperimento.jsx:4722` | P |
| 🟡 "Jogar de novo" sem carregando | **Sim, pior** (ver 1.2) | | P |
| 🟡 Aceitar revanche com sala já desfeita | cai no Lobby com faixa de reconectar enganosa | só sair da sala antiga após `entrarSala` ok | M |
| 🟡 Expulso por inatividade | Parcial — RECONECTAR funciona no Lobby, mas sem explicação | modal "VOCÊ SAIU DA MESA" (atenção: mesmo evento quando você sai por vontade) | M |
| 🟡 `jogadaAutomatica` sem aviso | **Sim** — e o timeout de **aposta** nem emite o evento (`GameController.js:787-794`) | toast + emitir também na aposta (PROTOCOLO.md + teste) | P/M |
| 🟡 Cooldown do chat | **Sim** | `disabled={... \|\| estado.chatEmCooldown}` em `:4176-4185`, passar `segundosCooldown` | P |
| 🟢 "Não" no convite sai da sala | **Sim** | ação `recusarConvite` que só fecha (`Partida.jsx:617-637`) | P |

---

## Ordem sugerida

1. Rápidos e de alto impacto: **1.1** (apostar no iPhone), **4.1** (z-index do dano), **1.3/1.4** (sair da vitória), **1.2** (revanche dupla), `loopPartida` (1 linha).
2. **4.2** (remover `translate` da mesa — conserta Ouros e escurecido do Zap juntos).
3. **3.1/3.2** (sala de espera), **5.1+5.2** (estado eliminado), erros visíveis/abortada.
4. Incluir `game/` e `conexao/` no `npm test`.
