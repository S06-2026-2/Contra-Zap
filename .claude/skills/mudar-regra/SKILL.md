---
name: mudar-regra
description: Passo a passo para mudar, corrigir ou adicionar uma regra do jogo do Contra ZAP (manilha, vaza, melado, aposta, rodada cega, perda de vida, eliminação, desempate, crescimento da mão, baralho) mantendo iguais o motor JS (game/), o motor Python de treino e as réplicas do front. Use sempre que a tarefa alterar o resultado de uma partida. Não use para animação, tempo de turno, rede ou refatoração que não muda o resultado.
---

# Mudar uma regra do jogo

O mesmo jogo existe em três lugares: `game/`, o motor de treino em
`training/python/motor/` e réplicas visuais no front.
`tests/paridade/motores.test.js` joga as mesmas partidas nos dois motores e
falha no `npm test` se divergirem. Ele não sabe qual lado está certo. Há
também pares de testes escritos à mão:

| Assunto | JS | Python (`training/python/`) |
|---|---|---|
| desempate de fim de jogo | `game/fimDeJogo.test.js` | `test_fim_de_jogo.py` |
| `maxDeck` | `game/maxDeck.test.js` | `test_motor_maxdeck.py` |
| loop da partida | `game/loopPartida.test.js` | `test_motor_loop.py` |
| distribuição pela seed | `game/seed.test.js` | `test_seed.py` |

Se a regra está num par, atualize os dois lados dele; senão, crie o par.
Se os cenários da paridade não exercitam a regra, acrescente-os, com uma entrada
em `medirCobertura`: sem isso ela passa verde sem conferir nada.

## 1. Fechar a regra

Leia `docs/projeto/regras-do-jogo.md` e escreva a regra atual e a nova em uma
frase cada. Pergunte só o que o pedido não decide e muda o resultado:

- rodada de 1 carta, vaza melada, último a apostar;
- mesa de 2 e de 6, mais de um baralho (cartas idênticas);
- todos eliminados na mesma rodada, jogador que desistiu ou virou bot.

## 2. Localizar os dois lados

| Regra | JS | Python (`training/python/motor/`) |
|---|---|---|
| força, manilha, anulação | `game/Mesa.js` | `mesa.py` |
| distribuição, vira, vaza, perda de vida | `game/Rodada.js` | `rodada.py` |
| ordem, eliminação, crescimento da mão, `maxDeck` | `game/Game.js` | `jogo.py` |
| cartas e montagem do baralho | `game/Baralho.js`, `game/Carta.js` | `baralho.py`, `carta.py` |
| embaralhamento e seed | `game/rng.js` | `rng.py` |
| aposta, loop da partida, desempate final | `game/GameController.js` | `partida.py` |
| vida inicial | `game/PlayerGame.js` | `partida.py` |

## 3. Teste primeiro, depois o código

1. Escreva em `game/` um teste que **falha** com a regra atual. O primeiro
   import é `../tests/helpers/ambiente.js`; as convenções estão na skill
   `testes`.
2. Mude `game/`, sem trazer rede para dentro dele.
3. Escreva o teste equivalente em `training/python/test_*.py` com **o mesmo
   cenário e o mesmo resultado esperado**. Ele fixa o resultado certo, que a
   paridade não conhece.
4. Leve a regra para o motor Python.

Teste antigo que falhou: só mude se ele descreve a regra que foi alterada de
propósito, e diga isso no resumo.

## 4. Quem mais depende da regra

- **Front:** `Carta.jsx` e `MesaExperimento.jsx` (ordem, anulação, conta de
  vida), `tema.js` (vida inicial). Procure comentários que citam `game/`.
  Mudou `public/app/src`? Rode `npm run build` em `public/app`.
- **Bots:** se mudar o que o bot vê ou as jogadas legais, `bots/observacao.js`,
  `training/env_bridge.js`, `harness_round1.py` e `harness_nativo.py` mudam
  juntos. Mesmo sem mudar o formato, as redes foram treinadas com a regra
  antiga: avise, e **não inicie retreino sem pedirem**.
- **Protocolo:** se mudar payload, evento ou erro, siga também a skill
  `novo-evento`.
- **Documentação:** `docs/projeto/regras-do-jogo.md` e, se for o caso,
  `docs/projeto/motor.md`.

## 5. Conferir

```
npm test
```

```
cd training/python
../.venv/Scripts/python.exe -m unittest test_seed test_fim_de_jogo test_motor_loop test_motor_maxdeck -v
```

Inclua o teste Python novo no segundo comando. Os `test_*.py` **não rodam no
CI** (a paridade roda): se a venv não existir na máquina, diga que eles não foram executados.

## 6. Revisar

Chame o subagente `revisor` como descrito em "Revisão por agente" no
`docs/projeto/convencoes.md`.

No resumo final, informe: regra antes e depois, arquivos JS e Python, testes
executados, impacto nos bots e o que o revisor apontou.

## Backlog

Antes de executar ou recomendar e ao terminar, siga a skill `backlog`.
