# Roteiro — skills e agentes no Contra ZAP

3 pessoas, cerca de 2 min cada. Abra o `fluxograma.html`: as teclas **1, 2 e 3**
trocam a etapa, e clicar numa caixa mostra o exemplo dela.

## Pessoa 1 — O que já temos (tecla 1)

> "Antes, cada um explicava o projeto para a IA do zero, e cada IA trabalhava
> de um jeito. Agora esse conhecimento está no Git, igual para todo mundo."

- **`AGENTS.md`**: as regras que o agente lê primeiro. O `CLAUDE.md` só aponta para ele.
- **`docs/projeto/`**: um arquivo por área. O agente lê só o que vai usar.
- **Skills**: passo a passo que só carrega quando a tarefa pede.
  - Nossas: `testes`, `devops`, `novo-evento` e `mudar-regra`.
  - `find-skills`: externa, procura outras skills.
- **Subagente `revisor`**: só lê e compara a mudança com o `convencoes.md`.
- **CI e revisão no PR**: valem também para código feito com IA.

**Exemplo:** "cria um teste de reconexão". A skill `testes` avisa o agente de que
não temos API REST, é socket.io com ack, e que nome de evento vem de `eventos.js`.

**Passagem:** "A base existe, mas ainda tem ponta solta."

## Pessoa 2 — O que estamos organizando (tecla 2)

> "Skill é como código: precisa de padrão, dono e revisão."

- **Padrão de skill**: a `devops` não era reconhecida pelo nome do arquivo. Virou
  **`SKILL.md`**, e um teste confere o formato de todas.
- **Skills externas**: a `find-skills` sugere instalar global e sem confirmar (`-g -y`).
  Nosso padrão: ler antes, instalar no projeto e registrar no `skills-lock.json`.
- **Documentação acompanha o código**: um teste confere se os caminhos citados
  existem. Se o texto está certo, ainda é trabalho de revisão.

**Exemplo:** mudou uma regra em `game/`, o motor Python de treino tem que mudar
junto. Se alguém esquecer, o bot treina com a regra antiga. A tabela de pares do
`convencoes.md` avisa, a skill `mudar-regra` guia, o `revisor` confere e um
teste no CI joga as mesmas partidas nos dois motores.

**Passagem:** "Com isso em ordem, dá para crescer."

## Pessoa 3 — Próximos passos (tecla 3)

> "Vamos sair de explicar o projeto para a IA e passar a padronizar como ela trabalha nele."

- **Skill nova** para o que se repete: `treino-bot`.
- **Mais subagentes**, cada um com um papel e poucas permissões:
  - `testador`: roda os testes e investiga falhas.
  - `guardiao-docs`: confere se a documentação acompanhou.
- **Checagem automática** no CI para os outros pares de arquivos.
- **Melhoria contínua**: erro repetido vira ajuste na skill ou no `AGENTS.md`.

**Exemplo ponta a ponta:** "cria um evento para reagir na mesa":

1. O agente lê o `AGENTS.md` e a documentação do servidor. *(já temos)*
2. A skill `novo-evento` guia: `eventos.js`, `PROTOCOLO.md`, `asyncapi.yaml`, testes e front. *(já temos)*
3. O `testador` roda os testes *(futuro)* e o `revisor` confere as convenções *(já temos)*.
4. O CI valida e uma pessoa revisa o PR. *(já temos)*

**Fechamento:** "Skill é *como fazer*, agente é *quem faz*, CI é *quem confere*,
e a decisão final continua sendo nossa."

## Se perguntarem

- **Skill x `AGENTS.md`?** O `AGENTS.md` entra em toda conversa; a skill, só quando a tarefa pede.
- **Skill x subagente?** Skill é instrução. Subagente executa, com contexto e permissões próprios.
- **Já temos subagentes?** Um, o `revisor`, só de leitura. Os outros são próximo passo.
- **É seguro instalar skill de fora?** Ela influencia um agente que tem acesso ao
  projeto. Por isso lemos antes e fixamos a versão.
