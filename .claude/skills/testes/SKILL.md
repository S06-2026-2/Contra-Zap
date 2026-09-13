---
name: testes
description: Escrever, rodar e depurar os testes automatizados do Contra ZAP — testes de API do protocolo socket.io (tests/api/) e, mais pra frente, E2E de navegador. Use ao criar teste novo, ao investigar teste que falha ou fica intermitente, ao mexer em conexao/ ou game/ (que exige atualizar o contrato testado), ou ao adicionar/alterar um evento do PROTOCOLO.md.
---

# Testes do Contra ZAP

## A primeira coisa a entender

**Este projeto não tem API REST.** O único endpoint HTTP é o `GET /health`.
Tudo o que se chama de "API" aqui é o protocolo **socket.io** de
`conexao/PROTOCOLO.md`: eventos request/response por **ack**, nunca por evento
de resposta.

```js
socket.emit('entrar', { nome, senha }, (resposta) => { /* ack */ });
// resposta é { ok: true, ...campos } ou { ok: false, codigo, mensagem }
```

`conexao/PROTOCOLO.md` é a fonte de verdade do contrato, e
`conexao/eventos.js` é o vocabulário (nomes de evento e códigos de erro).
**Nunca escreva a string do evento na mão** — importe de `eventos.js`, pra um
typo virar erro de import em vez de teste que passa sem testar nada.

## Mapa

```
tests/
  helpers/
    ambiente.js    -> isola DB_PATH/JWT_SECRET (banco temporário por processo)
    servidor.js    -> subirServidor(): o Server.js real, porta efêmera, tempos curtos
    cliente.js     -> ClienteDeTeste: ack como Promise + buffer de eventos
    protocolo.js   -> atalhos: convidado(), salaCheia(), partidaEmAndamento(), jogarSozinho()
  api/
    health.test.js       -> o endpoint HTTP
    autenticacao.test.js -> verificarNome, entrar, cadastrar, convidado, retomarSessao
    salas.test.js        -> criar/entrar/listar/sair/forçar início/partida rápida
    partida.test.js      -> mão, manilha, aposta, vaza, fim de jogo, jogar de novo
    reconexao.test.js    -> timeout, inatividade, vaga expirada, reconectar, sair
    chat.test.js         -> mensagem pronta, texto livre, cooldown, linhas de sistema
    limites.test.js      -> tetos de nome/senha, rate limit por IP, JA_AUTENTICADO,
                            JA_EM_PARTIDA, desistir x sairDaPartida, teto de salas
  e2e/                     (Playwright — navegador de verdade; fora do `npm test`)
    fixtures.js          -> Jogador: contexto isolado + login + criarSala/apostar/jogar pela UI
    login.spec.js        -> fluxo em etapas, cadastro, senha errada
    sala.spec.js         -> 2 jogadores reais: roster nas duas telas, forçar início, sair
    partida.spec.js      -> 1 humano + 1 bot: mão, aposta só na vez, carta sai da mão
    reconexao.spec.js    -> F5 volta pro jogo; banner de rede
playwright.config.js -> sobe o Server.js na 3100 com banco temporário
postman/           -> coleção do /health + guia de exploração manual do socket.io
docs/              -> openapi.yaml (2 rotas HTTP) + asyncapi.yaml (39 eventos)
                      + playground que dispara eventos com ack (`npm run docs`)
```

A API completa dos helpers está em `references/helpers.md` — leia antes de
escrever helper novo, quase sempre já existe o que você precisa.

## Rodar

```
npm test              # tudo
npm run test:api      # só tests/api/
npm run test:watch    # re-roda ao salvar
node --test tests/api/salas.test.js                    # um arquivo
node --test --test-name-pattern="SALA_CHEIA" tests/api/ # um teste

npm run test:e2e                                  # E2E inteiro (~40s)
npm run test:e2e:ui                               # modo interativo, pra depurar
npx playwright test tests/e2e/partida.spec.js     # um spec
npx playwright test -g "F5"                       # um teste pelo nome
```

E2E fica fora do `npm test` de propósito (sobe navegador, é lento). Na
primeira vez: `npx playwright install chromium`.

Cada arquivo roda num processo próprio, em paralelo, com um `banco.sqlite`
temporário só dele. O `banco.sqlite` e o `jwt.secret` de quem está
desenvolvendo **nunca** são tocados.

## Regras não-negociáveis

1. **Nada de `sleep` esperando o servidor agir.** Espere o *evento* que prova o
   que aconteceu (`cliente.esperar(...)`). Sleep só é aceitável quando o que
   se testa é silencioso por natureza — o fim de um cooldown, por exemplo — e
   aí explique isso num comentário.
2. **Nada de assumir ordem de jogadores ou carta específica.** O baralho é
   sempre embaralhado e a ordem da rodada é sorteada a cada partida
   (`Game.setstartsequence`). Descubra de quem é a vez reagindo a
   `turnoAposta`/`turnoJogador` e comparando pelo **nome**.
3. **Sempre `t.after(() => servidor.fechar())`.** Socket aberto segura o event
   loop e o processo de teste não termina.
4. **Monte o cenário só com eventos do protocolo.** Nunca mexa direto no
   `SalaManager`/`GameController` pra chegar mais rápido no estado desejado —
   um atalho por dentro esconde exatamente a regressão que o teste existe pra
   pegar. (`servidor.salaManager` existe pra *inspecionar*, não pra montar.)
5. **Comece a partida com `forcarInicio`, não esperando o timer.** É o que faz
   o momento de início ser decisão do teste. Por isso `tempoEsperaInicioMs`
   default de teste é alto: nada começa sozinho no meio de uma asserção.
6. **Teste o erro junto com o sucesso.** Metade deste contrato são os códigos
   de `CodigosErro` — um evento coberto só no caminho feliz está meio coberto.

## Anatomia de um teste

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { subirServidor } from '../helpers/servidor.js';
import { convidado, partidaEmAndamento } from '../helpers/protocolo.js';
import { EventosCliente, EventosServidor, CodigosErro } from '../../conexao/eventos.js';

test('nome do evento ou do assunto', async (t) => {
    const servidor = await subirServidor();
    t.after(() => servidor.fechar());

    await t.test('descreve o comportamento, não a implementação', async () => {
        const cliente = await convidado(servidor);

        const resposta = await cliente.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 2 });

        assert.equal(resposta.numberPlayers, 2);
    });

    await t.test('CODIGO_DO_ERRO quando <condição>', async () => {
        const cliente = await convidado(servidor);
        await cliente.erro(EventosCliente.ENTRAR_SALA, { salaId: 'NAOEXISTE' }, CodigosErro.SALA_NAO_ENCONTRADA);
    });
});
```

Três métodos cobrem quase tudo:

- `cliente.ok(evento, payload)` — exige `{ ok: true }`, devolve o ack.
- `cliente.erro(evento, payload, CodigosErro.X)` — exige `{ ok: false }` com
  aquele código.
- `cliente.emitir(evento, payload)` — devolve o ack cru, sem exigir nada.
- `cliente.esperar(evento, { filtro })` — espera um evento empurrado pelo
  servidor, olhando também o que já chegou.

## Armadilhas deste protocolo (todas já custaram um teste intermitente)

- **Broadcast sai antes do ack.** `listaJogadores` (em `criarSala`) e
  `partidaIniciandoEm` (na entrada que lota a sala) saem *dentro* do handler,
  antes da resposta. Um `socket.once` registrado depois do `await` perde o
  evento pra sempre. O `ClienteDeTeste` grava tudo desde que conecta, então
  `esperar()` funciona mesmo pra evento que já passou — mas
  `cliente.socket.on(...)` cru **não** tem essa proteção.
- **O primeiro `turnoAposta` sai no mesmo tick que `novaRodadaIniciada`.**
  Quem liga um listener cru depois de a partida começar já perdeu esse turno.
  É por isso que `jogarSozinho()` reprocessa o último turno registrado ao ser
  anexado.
- **Quem é expulso para de receber broadcast.** Na expulsão por inatividade (e
  no `sairDaPartida`), o socket sai da room na hora. Ele nunca verá o
  `vagaExpirada` que vem depois — a testemunha precisa ser alguém que continua
  na sala. E precisa haver alguém real na sala, senão ela é descartada
  (`GameController._expirarVaga`).
- **`partidaRapida` compartilha uma fila por servidor.** Dois subtestes no
  mesmo `subirServidor()` disputam a mesma sala. Suba um servidor por subteste.
- **O cooldown do chat é checado antes do conteúdo.** Dentro da janela, até
  mensagem inválida volta `CHAT_EM_COOLDOWN`. Pra testar validação de
  conteúdo, use `chatCooldownMs: 0`.
- **Config `null` cai no default, não em erro.** `numberPlayers: null` vira 4
  (`??` no `SalaManager`) — não é `CONFIGURACAO_INVALIDA`.
- **Reconectar é socket novo.** Não existe "reconectar o mesmo socket": abra
  outra conexão e faça `retomarSessao` com o token (`reconectarSocket()` no
  `protocolo.js` faz isso).
- **Motor de fundo não pode lançar.** Qualquer emit disparado sem `await`
  (como o `jogarSozinho`) precisa engolir erro: uma rejeição solta depois do
  fim do teste derruba o **arquivo inteiro**, mesmo com todas as asserções
  passando.
- **`chatMensagem` não é só fala de jogador.** O servidor manda linhas de
  `tipo: 'sistema'` ("entrou na sala", "saiu da sala") no MESMO evento. Um
  `esperar(CHAT_MENSAGEM)` solto pega a linha de sistema primeiro — filtre
  por `tipo`.
- **Rate limit conta por IP, e a suíte inteira é 127.0.0.1.** Os tetos de
  `verificarNome`/`entrar`/`cadastrar` (ver `conexao/rateLimiter.js`) são
  afrouxados por default no `subirServidor` — sem isso, o quinto login
  errado de um arquivo viraria `MUITAS_TENTATIVAS` em vez do código
  testado, e a ordem dos subtestes mudaria o resultado. Quem testa o limite
  de propósito passa tetos apertados (ver `limites.test.js`).
- **Um jogador, uma partida.** Depois que a partida começa, o mesmo player
  recebe `JA_EM_PARTIDA` ao criar/entrar noutra sala. Cenário com duas
  partidas pro mesmo cliente precisa de `desistir` no meio — `sairDaPartida`
  **não** libera (a vaga fica reservada).

## Ao mexer no protocolo

Mudou/adicionou evento em `conexao/`? Na mesma mudança:

1. `conexao/eventos.js` — o nome e o comentário do payload.
2. `conexao/PROTOCOLO.md` — payload, pré-condição, ack de sucesso e **todos**
   os erros possíveis.
3. `tests/api/` — o caminho feliz e cada código de erro novo.
4. `docs/asyncapi.yaml` — o canal, a operação e o schema do payload. O CI
   valida este arquivo, então um erro de forma quebra o build; um evento
   *faltando* ele não pega — isso é com você.
5. `postman/README.md` e o catálogo `EVENTOS` em `docs/index.html` — a linha
   na tabela de payloads, se for evento de cliente.

Se o teste e o `PROTOCOLO.md` discordarem, **um dos dois é bug** — descubra
qual antes de mudar o teste pra passar. (Foi assim que apareceu o
`jogadorReconectou` mandando `nome` onde todo o resto do protocolo, e o
`Partida.jsx`, esperavam `jogador`.)

## Checklist antes de commitar

- [ ] `npm test` passa.
- [ ] Rodei o arquivo novo **3 vezes seguidas** — teste de rede que passa uma
      vez não provou nada.
- [ ] Nenhum `sleep`/`setTimeout` esperando o servidor agir.
- [ ] Todo `subirServidor()` tem o `t.after` fechando.
- [ ] Cada evento novo tem caminho feliz **e** códigos de erro.
- [ ] Os nomes dos testes descrevem comportamento, não implementação.

## E2E (Playwright)

Cobre só o que a suíte de API **não alcança**: a interface e a costura entre
as peças. Não repita aqui o que já está em `tests/api/` — E2E é lento e
frágil por natureza; cada teste precisa pagar o próprio custo.

Regras extras, além das da API:

- **Nada de `waitForTimeout`.** `expect(locator).toBeVisible()` já espera.
  Onde a vez de jogar importa, a fixture `Jogador` espera ela chegar
  (`apostar()`, `jogarPrimeiraCarta()`).
- **Seletores por acessibilidade** (`getByLabel`, `getByRole`). A interface
  tem `<label>` de verdade e botões com texto — não precisou de
  `data-testid`. Regex onde o texto tem parte variável ou pode ser
  reescrito (`/Forçar início/`, `/^Sala [0-9A-F]{6}$/`).
- **Cuidado com texto duplicado na tela.** O `<pre class="log">` de debug
  repete o que o painel de status mostra ("X apostou 0" aparece nos dois).
  Um `getByText` solto acha os dois e o Playwright falha por *strict mode*.
  Aponte pro elemento que o jogador olha (`.status-jogador`) ou pro log
  (`pre.log`) explicitamente.
- **Cenário só pela interface.** Um jogador é `Jogador.entrar(browser)`; a
  sala é `criarSala()`/`entrarNaSala()`. Nunca chame o servidor por fora do
  navegador pra "adiantar" — se um botão sumir, o E2E tem que quebrar.
- **Use o build.** O E2E roda contra `public/dist` (versionado). Mexeu em
  `public/app/src`? `npm run build` lá antes, senão está testando a
  interface antiga.
- **O front valida antes de mandar.** Nome curto desabilita "Continuar",
  senha curta desabilita "Cadastrar" (mínimos de `conexao/limites.js`).
  Códigos como `CONVIDADO_INVALIDO` não são mais alcançáveis pela
  interface — quem cobre isso é `tests/api/limites.test.js`. No E2E, teste
  que a barreira existe (`toBeDisabled`), não que o servidor recusa.
- **A carta na tela não é a carta do protocolo.** O front desenha rank +
  símbolo do naipe (`K♠`, ver `CartaGrande` em `Partida.jsx`); o protocolo
  manda `[K de Espadas]`. Quem trava o formato do fio é a suíte de API.
- **`public/dist` não é versionado.** O `playwright.config.js` builda o
  front antes de subir o servidor — por isso o `timeout` do `webServer` é
  de 120s, não 30s.
- **A versão do Playwright é fixa, sem `^`.** A lib amarra o build exato do
  navegador; com caret, um `npm install` meses depois baixa uma lib que
  procura um Chromium que ninguém instalou e o E2E morre com "Executable
  doesn't exist".
- **Rode 3 vezes antes de commitar**, igual à API.

Detalhes de fixture e o histórico de decisões em `references/e2e-playwright.md`.
