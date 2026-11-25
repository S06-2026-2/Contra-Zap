---
name: novo-evento
description: Passo a passo para criar, alterar ou remover evento, payload, ack ou código de erro do protocolo socket.io do Contra ZAP, sem esquecer PROTOCOLO.md, asyncapi.yaml, testes, playground e front. Use sempre que conexao/eventos.js ou o formato de uma mensagem entre cliente e servidor mudar.
---

# Criar ou mudar um evento

## 1. Decidir o contrato

- **Cliente → servidor:** sempre com ack, `{ ok: true, ... }` ou
  `{ ok: false, codigo, mensagem }`. Não existe evento de erro.
- **Servidor → cliente:** vai para a sala inteira ou só para um jogador?
  Informação escondida (mão, carta cega) é sempre privada.
- Defina payload, pré-condições e **todos** os erros. Antes de criar, veja se
  um evento ou código existente já serve.
- O cliente não é confiável: o servidor valida tipo, tamanho, autenticação,
  se está na sala e se é a vez dele.

## 2. Servidor

1. `conexao/eventos.js`: constante com o comentário do payload.
2. Lógica em `conexao/SalaManager.js`, `game/GameController.js` ou módulo sem
   socket. Erro de domínio é classe com `codigo`.
3. `conexao/socketServer.js`: handler fino, que só traduz evento ↔ chamada.
   Evento emitido pelo controller também precisa ser retransmitido em
   `ligarControllerASala`.
4. O cliente pode cair e voltar: se o evento muda o que a tela mostra, o
   estado precisa vir no ack de `reconectar`.
5. Teto de frequência se puder ser repetido à vontade (veja o cooldown do chat).

## 3. Contrato escrito

1. `conexao/PROTOCOLO.md`: payload, pré-condição, ack e todos os erros.
2. `docs/asyncapi.yaml`: canal, operação, schema e os números do cabeçalho.
   `tests/docs/asyncapi.test.js` confere nomes e contagem, não o payload.
3. Evento de cliente: tabela em `postman/README.md` e lista `EVENTOS` em
   `docs/index.html`.
4. `docs/projeto/servidor-e-conexao.md`, se o comportamento geral mudou.

## 4. Testes

Em `tests/api/`, seguindo a skill `testes`: caminho feliz, **cada** código de
erro novo, quem recebe e quem **não** recebe e, se afetar o estado, a
reconexão. Rode o arquivo 3 vezes seguidas.

## 5. Front

`meetfront1/Partida.jsx` trata eventos da partida; `Lobby.jsx` e `App.jsx`, o
resto. A mesa (`MesaExperimento.jsx`) só recebe `estado` e `acoes`. O front
ainda usa o nome do evento como string: confira letra por letra com
`conexao/eventos.js`. Remova o listener na limpeza do efeito e
rode `npm run build` em `public/app`. Evento com animação: confira
`game/animacoesFront.js`.

## 6. Conferir e revisar

Rode `npm test` e depois chame o subagente `revisor` como descrito em
"Revisão por agente" no `docs/projeto/convencoes.md`.

## Backlog

Antes de executar ou recomendar e ao terminar, siga a skill `backlog`.
