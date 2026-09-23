# Postman — Contra ZAP

Dois arquivos pra importar (Postman > Import > File):

- `Contra-Zap.postman_collection.json` — a coleção.
- `Contra-Zap.postman_environment.json` — o ambiente local (`baseUrl`, `socketUrl`
  e um usuário de `banco.json` pra testar login).

Com o servidor rodando (`npm start`, porta 3000), a coleção já roda inteira.

---

## O que está aqui e o que não está (leia antes de reclamar)

Este projeto **quase não tem HTTP**. O único endpoint é o `GET /health`. Toda a
API de verdade — login, salas, partida, chat — é o protocolo **Socket.IO**
descrito em [`../conexao/PROTOCOLO.md`](../conexao/PROTOCOLO.md).

Isso divide o trabalho em dois:

| | Onde | Roda no CI? |
|---|---|---|
| `GET /health` (com asserções) | esta coleção | ✅ sim, via Newman |
| Protocolo Socket.IO (exploração manual) | Postman, request Socket.IO (ver abaixo) | ❌ não |
| Protocolo Socket.IO (suíte automatizada) | `../tests/api/` (`npm test`) | ✅ sim |

**Por que o protocolo não virou coleção Postman:** o Postman conecta em
Socket.IO e emite eventos com **Ack** (é ótimo pra explorar), mas requests
Socket.IO não aceitam scripts de teste e **o Newman/Postman CLI não executa
requests Socket.IO** — nada disso rodaria no `ci.yml`. Como neste protocolo
*toda* resposta vem por ack, uma suíte só-Postman não travaria contrato
nenhum. Daí a divisão acima.

### Rodando a coleção pela linha de comando

```
npx newman run postman/Contra-Zap.postman_collection.json \
  --env-var baseUrl=http://localhost:3000
```

---

## Explorando o protocolo Socket.IO no Postman

1. **New** > **Socket.IO**.
2. URL: `http://localhost:3000` > **Connect**.
3. Aba **Events**: registre os eventos que quer escutar (`listaJogadores`,
   `suaMao`, `turnoAposta`, `turnoJogador`, `cartaJogada`, ...). O Postman só
   mostra evento que você registrou antes.
4. Aba **Message**: escreva o **nome do evento**, escolha **JSON**, cole o
   payload e marque **Ack** — sem o Ack você não vê a resposta, porque neste
   protocolo o retorno vem sempre pelo callback, nunca por um evento separado.

Toda resposta tem um destes dois formatos:

```jsonc
{ "ok": true,  /* ...campos do resultado */ }
{ "ok": false, "codigo": "NOME_DO_ERRO", "mensagem": "texto legível" }
```

`codigo` é pra lógica; `mensagem` é só pra exibir. A lista completa está na
seção "Códigos de erro" do `PROTOCOLO.md`.

### Payloads prontos pra copiar

Sequência mínima pra chegar numa partida (use **duas** conexões Socket.IO em
abas separadas, ou uma sala com bots):

| # | Evento | Payload | Resposta esperada |
|---|---|---|---|
| 1 | `verificarNome` | `{"nome":"henrique"}` | `{"ok":true,"existe":true}` |
| 2 | `entrar` | `{"nome":"henrique","senha":"123"}` | `{"ok":true,"nome":"...","token":"..."}` |
| 3 | `criarSala` | `{"numberPlayers":2,"botNumber":1,"modeloBot":"campeao","chatAberto":true}` | `{"ok":true,"salaId":"ABC123",...}` |
| 4 | `forcarInicio` | `{"salaId":"ABC123"}` | `{"ok":true}` |
| 5 | `apostar` | `{"salaId":"ABC123","valor":1}` | `{"ok":true}` — só na sua vez (`turnoAposta`) |
| 6 | `jogarCarta` | `{"salaId":"ABC123","indice":0}` | `{"ok":true}` — só na sua vez (`turnoJogador`) |

Com `botNumber: 1` e `numberPlayers: 2` você joga sozinho contra um bot, sem
precisar de uma segunda aba. `modeloBot` escolhe qual bot: `iniciante`,
`classico` (default), `veterano` ou `campeao` (ver `bots/modelosBot.js`).

Outros eventos úteis:

| Evento | Payload |
|---|---|
| `cadastrar` | `{"nome":"novoJogador","senha":"senha123"}` |
| `entrarComoConvidado` | `{"nome":"visitante"}` |
| `retomarSessao` | `{"token":"<token de um entrar anterior>"}` |
| `partidaRapida` | `{}` |
| `listarSalas` | `{}` |
| `entrarSala` | `{"salaId":"ABC123"}` |
| `sairSala` | `{"salaId":"ABC123"}` |
| `sairDaPartida` | `{"salaId":"ABC123"}` |
| `desistir` | `{"salaId":"ABC123"}` |
| `reconectar` | `{"salaId":"ABC123"}` |
| `minhaSalaAtiva` | `{}` |
| `jogarDeNovo` | `{"salaId":"ABC123"}` |
| `chat` (pronta) | `{"salaId":"ABC123","tipo":"restrita","id":1}` |
| `chat` (livre) | `{"salaId":"ABC123","tipo":"aberta","texto":"boa!"}` |

### Erros fáceis de provocar (bons pra conferir na mão)

| Faça isto | Código esperado |
|---|---|
| `criarSala` antes de `entrar` | `NAO_IDENTIFICADO` |
| `entrar` com senha errada | `SENHA_INCORRETA` |
| `criarSala` com `{"numberPlayers":9}` | `CONFIGURACAO_INVALIDA` |
| `entrarSala` com `salaId` inventado | `SALA_NAO_ENCONTRADA` |
| `forcarInicio` sem a sala estar cheia | `SALA_NAO_CHEIA` |
| `apostar` fora da sua vez | `NAO_E_SUA_VEZ` |
| `jogarCarta` com `indice` maior que a mão | `CARTA_INVALIDA` |
| `chat` com `tipo:"aberta"` numa sala sem `chatAberto` | `CHAT_DESABILITADO` |
| dois `chat` seguidos (menos de 3s) | `CHAT_EM_COOLDOWN` |
| `criarSala` estando numa partida em andamento | `JA_EM_PARTIDA` |
| `entrar` num socket que já é outra conta | `JA_AUTENTICADO` |
| repetir `verificarNome` mais de 20x em 5min | `MUITAS_TENTATIVAS` |

Todos esses casos já estão travados automaticamente em `../tests/api/` — a
tabela aqui é pra conferir na mão enquanto você desenvolve.
