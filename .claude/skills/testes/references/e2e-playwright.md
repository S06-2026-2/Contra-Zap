# E2E com Playwright — como está montado

## Por que Playwright e não Cypress

Restrição real do projeto: **uma partida exige de 2 a 4 jogadores
simultâneos**. No Playwright cada jogador é um `browser.newContext()` —
`sessionStorage` isolado (onde `public/app/src/sessao.js` guarda a sessão) e
socket próprio, na mesma linha do tempo. No Cypress, várias abas ao mesmo
tempo é atrito o suficiente pra inviabilizar o caso principal.

## Estrutura

```
playwright.config.js     raiz — webServer sobe o Server.js na 3100 com DB_PATH temporário
tests/e2e/
  fixtures.js            Jogador + fixtures `jogador` e `jogadores(n)`
  login.spec.js
  sala.spec.js
  partida.spec.js
  reconexao.spec.js
```

Fica ao lado de `tests/api/` porque é a mesma suíte do projeto, noutra
camada — mas fora do `npm test` (script próprio `test:e2e`, job próprio no CI).

## A fixture `Jogador`

| Método | O que faz pela interface |
|---|---|
| `Jogador.entrar(browser, nome?)` | contexto novo, `/`, login como convidado, espera "Olá, nome" |
| `criarSala({ jogadores, bots, cartas })` | preenche o form da Lobby, clica Criar, devolve o `salaId` lido do título |
| `entrarNaSala(salaId)` | "Atualizar lista" → acha o `<li>` da sala → "Entrar" |
| `forcarInicio()` | clica `/Forçar início/`, espera "Vez de:" |
| `apostar(valor, alternativa)` | espera "Aposta — sua vez", aposta; se recusada (APOSTA_FECHA_RODADA), tenta `alternativa` |
| `jogarPrimeiraCarta()` | espera "sua vez, clique numa carta", clica a 1ª |
| `cartas()` | locator `.mao button.carta` |
| `page`, `context`, `nome` | crus, pra asserção |

Fixtures do `test`: `jogador` (um, já logado) e `jogadores(n)` (vários em
paralelo). Ambas fecham os contextos no fim.

## Decisões tomadas (e por quê)

1. **Sem `data-testid`.** A interface tem `<label>` e botões com texto; os
   seletores por acessibilidade bastaram. Se um dia um elemento sem texto
   precisar ser alvo, aí sim adicione `data-testid` — não antes.
2. **Servidor por execução, não compartilhado.** `webServer` com
   `reuseExistingServer: false`: algo já na 3100 é de OUTRA execução com
   OUTRO banco. Banco em `mkdtemp`, mesma disciplina de
   `tests/helpers/ambiente.js`.
3. **Tempos de produção.** Não foi preciso expor `tempoTurnoMs` etc. por
   variável de ambiente: o teste começa a partida pelo botão do adm e
   responde aos turnos na hora. O único tempo que se paga é o `atrasoBotMs`
   de 2s por ação do bot — daí `expect.timeout` de 15s e `timeout` de 60s.
4. **Build versionado.** `public/dist` está no git, e o E2E usa ele. É
   conveniente (nada a buildar no CI) e perigoso (pode ficar velho em
   relação a `public/app/src`). Regra: mexeu no front, rebuilda antes de
   commitar.
5. **1 humano + 1 bot para partida.** Mesa mínima do projeto; dispensa um
   segundo navegador nos testes de mão/aposta/carta. Os testes com 2 humanos
   ficam em `sala.spec.js`, onde a interação entre telas é o assunto.
6. **`chromium` só.** É o que o CI instala (`--with-deps chromium`) e o que
   o ambiente remoto já traz. Firefox/WebKit entram se algum dia um bug
   específico deles aparecer.

## Armadilhas encontradas

- **Texto duplicado entre status e log.** `<span class="status-jogador">` e
  `<pre class="log">` mostram o mesmo "X apostou 0". `getByText` acha os
  dois → *strict mode violation*. Escope no elemento certo.
- **O botão de forçar início tem texto informal** (`Partida.jsx:502`). O
  teste usa `/Forçar início/` de propósito, pra sobreviver a uma reescrita.
- **A vez é sorteada.** Nunca assuma que o humano aposta/joga primeiro; a
  fixture espera o título "sua vez" aparecer.
- **`apostar` pode ser recusado.** Se o humano for o último a apostar e o
  valor fechar a soma no número de cartas (`APOSTA_FECHA_RODADA`), o form
  fica na tela. A fixture detecta pelo título que não sumiu e tenta outro valor.

## O que fica de fora (de propósito)

Códigos de erro do protocolo, limites de aposta, cooldown de chat, expiração
de vaga, partida até o fim, `jogarDeNovo`. Tudo isso já está em `tests/api/`
— no E2E ficaria lento e frágil sem provar nada novo sobre a interface.
