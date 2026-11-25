# Roteiro 2 — o que mudou e para onde vamos

Continuação do `roteiro.md`. 3 pessoas, cerca de 2 min cada. Abra o
`fluxograma-2.html`: as teclas **1, 2 e 3** trocam a etapa, e clicar num cartão
mostra o exemplo dele. Retrato de 2026-11-25, branch `NewSkills`.

## Pessoa 1 — O que mudou (tecla 1)

> "Na primeira apresentação, boa parte era plano. Agora está no repositório."

- **Skills**: `devops` passou a ser reconhecida; `novo-evento`, `mudar-regra` e
  `backlog` são novas.
- **Primeiro subagente**: o `revisor`, que só lê.
- **Testes que conferem o processo**: formato das skills, caminhos citados na
  documentação e os unitários de `game/` e `conexao/` no `npm test`.
- **Backlog separado**: o que falta fazer saiu do `DEV.md` para `docs/backlog.md`.

**Passagem:** "Criar é fácil. O que importa é se funciona."

## Pessoa 2 — O que já provou valor (tecla 2)

> "Não confiamos na skill porque ela parece boa. A gente tentou enganar."

- **Revisor**: mudamos uma regra só no JS, de propósito. Os testes da época
  passaram inteiros. Ele apontou o motor Python, a falta de teste e a
  documentação falsa.
- **Paridade**: 150 partidas jogadas nos dois motores. Na primeira execução, 16
  divergiram: na rodada de 1 carta o Python proibia uma aposta que o jogo permite.
- **Prova da paridade**: 15 regras erradas, uma por vez, nos dois lados. Pegou as 15.
- **Backlog**: dois bugs já corrigidos em 29/10 ainda estavam na lista.

**Limites, dizer em voz alta:** o revisor não roda testes e não viu tudo; a
paridade não cobre o que só existe no JS; a skill `backlog` ainda não passou por
uma tarefa real; e o CI ainda não rodou a paridade.

**Passagem:** "Com isso provado, dá para escolher o próximo passo."

## Pessoa 3 — Roadmap possível (tecla 3)

> "São propostas. O grupo decide a ordem e o que entra."

- **Agora:** abrir o PR e ver o CI; testar as skills numa tarefa real (o bug da
  contagem da sala de espera); fazer os testes manuais do `docs/backlog.md`.
- **Depois:** testes Python do motor no CI; retreino da rodada cega com a máscara
  corrigida; skill `treino-bot`; lista dos outros pares avisada no PR.
- **Mais adiante:** subagentes `testador` e `guardiao-docs`, só se o `revisor`
  mostrar que falta.

**Decisões do grupo:** nome de evento como string no front; `find-skills` e a
instalação global; critério definitivo do desempate.

**Fechamento:** "Skill é *como fazer*, agente é *quem faz*, teste é *quem prova*,
e a decisão final continua sendo nossa."

## Se perguntarem

- **O revisor substitui a revisão humana?** Não. Ele lê o diff; uma pessoa aprova.
- **Por que tão poucos subagentes?** Cada um custa contexto e manutenção. Só
  criamos outro quando houver um erro repetido que ele evitaria.
- **A paridade sabe qual motor está certo?** Não. Ela avisa que são diferentes; a
  regra documentada decide.
- **O backlog cresceu de 25 para 40 itens. Piorou?** Não: relatos vagos viraram
  bugs separados, e entraram os que só estavam no relatório.
