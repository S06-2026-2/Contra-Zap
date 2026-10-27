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
| `Jogador.entrar(browser, nome?)` | contexto novo, `/` → JOGAR → nome → "JOGAR COMO CONVIDADO", espera "SALAS ABERTAS" |
| `criarSala({ jogadores, bots, cartas })` | "+ CRIAR SALA", escolhe nos seletores (grupos por nome), "ABRIR MESA", devolve o `salaId` lido de "SALA XXXXXX" |
| `entrarNaSala(salaId)` | "ATUALIZAR" → cartão `.az-sala` com o id → "ENTRAR" |
| `roster()` | os assentos da sala de espera (`.az-grade-espera`) |
| `forcarInicio()` | clica `/Forçar início/i`, espera o "Sair da partida" |
| `apostar(valor, alternativa)` | espera a placa "Apostar" da mão, aposta pelo pop-up; se o valor fecha a soma (botão travado ou APOSTA_FECHA_RODADA), tenta `alternativa` |
| `jogarUmaCarta()` | espera "Sua vez! Escolha uma carta.", clica a última do leque |
| `cartas()` / `nomesDasCartas()` | locator `.mesa-exp-sua-mao-carta` / os `aria-label` delas |
| `page`, `context`, `nome` | crus, pra asserção |

Fixtures do `test`: `jogador` (um, já logado) e `jogadores(n)` (vários em
paralelo). Ambas fecham os contextos no fim.

## Decisões tomadas (e por quê)

1. **Sem `data-testid`.** Botões têm texto; onde faltava nome (campos do
   PopupLogin e da aposta, seletores de criar sala, cartas desenhadas) o
   front ganhou nome acessível (`aria-label`, `role="group"`,
   `role="img"`). Melhora a tela pra leitor de tela e serve ao teste.
2. **Servidor por execução, não compartilhado.** `webServer` com
   `reuseExistingServer: false`: algo já na 3100 é de OUTRA execução com
   OUTRO banco. Banco em `mkdtemp`, mesma disciplina de
   `tests/helpers/ambiente.js`.
3. **Tempos de produção.** Não foi preciso expor `tempoTurnoMs` etc. por
   variável de ambiente: o teste começa a partida pelo botão do adm e
   responde aos turnos na hora. O único tempo que se paga é o `atrasoBotMs`
   de 2s por ação do bot — daí `expect.timeout` de 15s e `timeout` de 60s.
4. **Build na hora.** `public/dist` não é versionado: localmente o
   `webServer` builda antes de subir; no CI o E2E roda contra a imagem
   Docker (`E2E_SERVIDOR_EXTERNO=true`), que builda o front dentro dela.
5. **1 humano + 1 bot para partida.** Mesa mínima do projeto; dispensa um
   segundo navegador nos testes de mão/aposta/carta. Os testes com 2 humanos
   ficam em `sala.spec.js`, onde a interação entre telas é o assunto.
6. **`chromium` só.** É o que o CI instala (`--with-deps chromium`) e o que
   o ambiente remoto já traz. Firefox/WebKit entram se algum dia um bug
   específico deles aparecer.

## Armadilhas encontradas

- **O E2E segue a frente do app.** Ele já foi escrito pra frente
  `debugging` (fixada via localStorage); quando ela saiu do app, os 19
  testes morreram no primeiro `getByLabel('Nome')`. Removeu ou trocou uma
  tela? Rode o E2E antes do merge.
- **O botão de forçar início só existe pro adm** (`acoes.forcarInicio` vem
  só com `souDono`). O teste usa `/Forçar início/i` pra sobreviver a uma
  reescrita do texto.
- **A vez é sorteada.** Nunca assuma que o humano aposta/joga primeiro; a
  fixture espera a placa "Apostar" / o banner "Sua vez!" aparecer.
- **`apostar` pode ser recusado.** Se o humano for o último a apostar e o
  valor fechar a soma no número de cartas, o pop-up trava o botão (ou o
  servidor recusa com `APOSTA_FECHA_RODADA` e o pop-up fica aberto). A
  fixture detecta os dois casos e tenta outro valor.
- **Rodada cega esconde a mão.** Com 1 carta (default) ela chega como
  "Carta virada". Teste que lê a carta pede `cartas: 3`.

## O que fica de fora (de propósito)

Códigos de erro do protocolo, limites de aposta, cooldown de chat, expiração
de vaga, partida até o fim, `jogarDeNovo`. Tudo isso já está em `tests/api/`
— no E2E ficaria lento e frágil sem provar nada novo sobre a interface.
