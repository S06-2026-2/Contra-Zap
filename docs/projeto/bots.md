# Bots (`bots/`)

Jogadores controlados pelo computador **em produção**. O treino que gera as
redes está em `training/` (ver [treino.md](treino.md)).

## Ideia central

- `bots/BotBrain.js` é o **único lugar** que decide uma jogada automática:
  tanto o turno de um `Bot` de verdade quanto o timeout/inatividade de um
  humano passam por ele (`GameController` chama `escolherAposta` e
  `escolherCarta`).
- As decisões vêm de redes neurais pequenas treinadas por RL, com os pesos
  exportados em JSON e o forward pass reimplementado em **JS puro** (sem
  torch no servidor).
- Falha ao carregar um modelo nunca derruba o servidor: aquele modelo cai no
  heurístico ("aposta 1, joga a última carta").

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `Bot.js` | `class Bot extends Player` com `bot = true`, id efêmero negativo (`game/idEfemero.js`), nome "Bot N", visual aleatório. Nunca tem socket |
| `BotBrain.js` | escolhe a rede da sala (`controller.modeloBot`), monta a observação, aplica máscara de ações legais, argmax; mede latência (`observabilidade/metricas.js`) |
| `modelosBot.js` | catálogo `MODELOS_BOT` (`iniciante` sem rede, `classico` = noite1.json, `veterano` = noite1H.json, `campeao` = slot01.json) e `MODELO_BOT_PADRAO = 'classico'`. **Módulo puro, importado pelo front** (lista de opções ao criar sala) |
| `observacao.js` | monta o vetor de entrada: 110 números (rodada ≥ 2) ou 22 (rodada cega) + máscaras legais; `ajustarParaModelo()` encaixa mesas de 2–6 no formato de 4 assentos; `ROTULOS_OBS*` descrevem cada posição. Puro (usado também pelo `/lab` do front) |
| `rede.js` | forward pass (`RedeAtorCritico`: tronco 2×Linear+ReLU + cabeças aposta/carta/valor), `argmaxMascarado`. Puro (roda no navegador) |
| `nn.js` | carrega `bots/models/*.json` do disco (`node:fs`) — só servidor |
| `models/*.json` | pesos exportados: `round1.json` (rodada cega, comum a todos os modelos com rede) e uma rede por modelo pra rodada ≥ 2 (~2 MB cada) |

## Duas redes por decisão

- **Rodada 1 (cega)**: `round1.json` decide a aposta (0/1). A carta é forçada
  (só tem uma).
- **Rodada ≥ 2**: a rede do modelo da sala decide aposta e carta.

## Limitações conhecidas

- As redes só treinaram com **4 assentos**. Mesas de 2–3 funcionam bem
  (assento "fantasma" = eliminado); 5–6 ficam fora da distribuição (jogada
  coerente mas fraca). `tests/bots/mesaGrande.test.js` garante que não cai
  pro heurístico.
- `observacao.js` é porte de `training/env_bridge.js` (`construirObs`) e
  `training/python/harness_round1.py` — mudar o formato de um sem o outro
  quebra o bot.

## Adicionando um modelo novo

1. Treinar e exportar com `training/python/export_weights.py` → JSON em `bots/models/`.
2. Adicionar entrada em `MODELOS_BOT` (`id`, `nome`, `descricao`, `arquivo`).
3. `tests/bots/modelosBot.test.js` confere catálogo × arquivos.
4. Atualizar esta doc e a seção de `criarSala` no `PROTOCOLO.md`/`asyncapi.yaml` se a lista de ids for citada.
