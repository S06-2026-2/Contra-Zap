// cliente.js
// Cliente de teste do protocolo socket.io (ver conexao/PROTOCOLO.md).
// Envolve um socket.io-client de verdade — o mesmo que o front usa — e
// resolve os dois problemas que todo teste deste protocolo esbarra:
//
//  1. **Ack como Promise.** Todo evento cliente -> servidor responde por
//     callback (`socket.emit(evento, payload, ack)`), não por um evento de
//     resposta. `emitir()` transforma isso em `await`, com timeout — sem
//     isso um handler que nunca responde trava o teste inteiro em vez de
//     falhar com mensagem.
//
//  2. **Corrida com eventos empurrados.** Vários eventos do servidor saem
//     ANTES do ack do que os provocou (é o caso documentado de
//     `listaJogadores` em `criarSala`, e de `partidaIniciandoEm` quando a
//     entrada lota a sala). Um `socket.once(...)` registrado depois do
//     `await` perderia esses eventos pra sempre e o teste ficaria
//     intermitente. Por isso este cliente grava TUDO desde que conecta
//     (`onAny`) e `esperar()` olha primeiro o que já chegou, só então fica
//     esperando o próximo.
import { io } from 'socket.io-client';

const TIMEOUT_ACK_MS = 5_000;
const TIMEOUT_EVENTO_MS = 8_000;

export class ClienteDeTeste {
    // Nome com que este cliente se autenticou. Preenchido pelos helpers de
    // login (ver protocolo.js) porque o ack de `entrar` não devolve o id do
    // jogador — a única forma de um teste reconhecer "esse turno é o meu" nos
    // eventos de partida é pelo campo `jogador`, que é o nome.
    nome = null;
    #socket;
    // Tudo que o servidor empurrou, na ordem, com uma marca de "já foi
    // consumido por um esperar()" — ver a explicação de consumo em esperar().
    #recebidos = [];
    // Quem está esperando um evento que ainda não chegou.
    #aguardando = [];

    constructor(socket) {
        this.#socket = socket;
        this.#socket.onAny((evento, dados) => this.#registrar(evento, dados));
    }

    get socket() { return this.#socket; }
    get id() { return this.#socket.id; }
    get conectado() { return this.#socket.connected; }

    // Emite um evento e devolve o ack cru, seja ele de sucesso ou de erro —
    // testar o caminho de erro é metade do contrato, então um ack
    // `{ ok: false }` NÃO lança aqui. Use `ok()`/`erro()` quando quiser a
    // asserção junto.
    emitir(evento, payload = {}, { timeoutMs = TIMEOUT_ACK_MS } = {}) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Timeout de ${timeoutMs}ms esperando o ack de "${evento}". O handler no servidor respondeu?`));
            }, timeoutMs);

            this.#socket.emit(evento, payload, (resposta) => {
                clearTimeout(timer);
                resolve(resposta);
            });
        });
    }

    // Emite exigindo sucesso. Devolve o ack inteiro (sem o `ok`, que já foi
    // verificado) pra encadear direto: `const { salaId } = await cli.ok('criarSala')`.
    async ok(evento, payload = {}, opcoes) {
        const resposta = await this.emitir(evento, payload, opcoes);
        if (!resposta?.ok) {
            throw new Error(`Esperava sucesso em "${evento}", veio erro ${resposta?.codigo}: ${resposta?.mensagem}`);
        }
        return resposta;
    }

    // Emite exigindo erro, opcionalmente de um código específico
    // (CodigosErro). Devolve o ack pra quem quiser conferir a mensagem.
    async erro(evento, payload = {}, codigoEsperado, opcoes) {
        const resposta = await this.emitir(evento, payload, opcoes);
        if (resposta?.ok) {
            throw new Error(`Esperava erro em "${evento}", mas veio sucesso: ${JSON.stringify(resposta)}`);
        }
        if (codigoEsperado && resposta.codigo !== codigoEsperado) {
            throw new Error(`Esperava o código ${codigoEsperado} em "${evento}", veio ${resposta.codigo} ("${resposta.mensagem}")`);
        }
        return resposta;
    }

    // Espera um evento empurrado pelo servidor. Olha primeiro o que já
    // chegou (ver o problema 2 no topo do arquivo) e só depois fica de
    // tocaia. Cada entrada gravada só satisfaz UM esperar(): dois
    // `esperar('turnoJogador')` seguidos devolvem o primeiro e o segundo
    // turno, não duas vezes o mesmo.
    //
    // `filtro` é uma função sobre o payload — o jeito normal de dizer "o
    // turno que interessa é o MEU", já que a ordem dos jogadores é sorteada
    // a cada partida (ver Game.setstartsequence) e nunca é a de entrada na sala.
    esperar(evento, { filtro, timeoutMs = TIMEOUT_EVENTO_MS } = {}) {
        const jaChegou = this.#recebidos.find(
            registro => !registro.consumido && registro.evento === evento && (!filtro || filtro(registro.dados))
        );
        if (jaChegou) {
            jaChegou.consumido = true;
            return Promise.resolve(jaChegou.dados);
        }

        return new Promise((resolve, reject) => {
            const espera = { evento, filtro, resolve };

            const timer = setTimeout(() => {
                this.#aguardando = this.#aguardando.filter(item => item !== espera);
                const vistos = this.#recebidos.map(r => r.evento).join(', ') || '(nenhum)';
                reject(new Error(
                    `Timeout de ${timeoutMs}ms esperando o evento "${evento}". Eventos recebidos até aqui: ${vistos}`
                ));
            }, timeoutMs);

            espera.resolve = (dados) => {
                clearTimeout(timer);
                resolve(dados);
            };
            this.#aguardando.push(espera);
        });
    }

    // Tudo que chegou desse evento, consumido ou não — pra asserção sobre
    // quantidade ("recebi exatamente um listaJogadores") ou sobre ausência
    // ("não recebi nenhum suaMao"), onde esperar() não serve.
    recebidos(evento) {
        return this.#recebidos.filter(registro => registro.evento === evento).map(registro => registro.dados);
    }

    // Esquece o histórico (não as esperas pendentes). Útil no meio de um
    // teste longo, pra uma asserção de "a partir daqui, não deve chegar
    // mais nada dessa sala".
    limparHistorico() {
        this.#recebidos = [];
    }

    // Silencia o socket sem fechar a conexão — usado pra simular "o cliente
    // parou de responder" (timeout de turno) sem provocar o `disconnect`,
    // que no protocolo tem efeito próprio e bem diferente.
    async desconectar() {
        if (!this.#socket.connected) return;
        const desconectou = new Promise(resolve => this.#socket.once('disconnect', resolve));
        this.#socket.disconnect();
        await desconectou;
    }

    #registrar(evento, dados) {
        const registro = { evento, dados, consumido: false };
        const espera = this.#aguardando.find(
            item => item.evento === evento && (!item.filtro || item.filtro(dados))
        );

        if (espera) {
            this.#aguardando = this.#aguardando.filter(item => item !== espera);
            registro.consumido = true;
            this.#recebidos.push(registro);
            espera.resolve(dados);
            return;
        }

        this.#recebidos.push(registro);
    }
}

// Abre uma conexão e só devolve quando ela estiver de pé — sem isso o
// primeiro emit sairia num socket ainda conectando (o socket.io enfileira,
// mas um erro de conexão viraria timeout de ack em vez de erro claro).
export function conectar(url, opcoes = {}) {
    return new Promise((resolve, reject) => {
        const socket = io(url, {
            transports: ['websocket'],
            // Reconexão automática é ótima em produção e péssima em teste:
            // um socket que devia estar fora volta sozinho no meio de uma
            // asserção. Quem quiser testar reconexão abre um socket novo,
            // que é exatamente o que o cliente de verdade faz (socket.id
            // muda, daí o retomarSessao — ver conexao/PROTOCOLO.md).
            reconnection: false,
            ...opcoes,
        });

        const timer = setTimeout(() => {
            socket.close();
            reject(new Error(`Timeout conectando em ${url}`));
        }, TIMEOUT_ACK_MS);

        socket.once('connect', () => {
            clearTimeout(timer);
            resolve(new ClienteDeTeste(socket));
        });
        socket.once('connect_error', (erro) => {
            clearTimeout(timer);
            reject(erro);
        });
    });
}
