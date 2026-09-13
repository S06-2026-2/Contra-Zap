// protocolo.js
// Atalhos de alto nível pros fluxos que quase todo teste de API precisa
// montar antes de chegar no que ele realmente quer verificar: um cliente
// autenticado, uma sala cheia, uma partida em andamento.
//
// Tudo aqui é escrito só com eventos do protocolo (conexao/PROTOCOLO.md) —
// nenhum atalho mexendo no SalaManager/GameController por dentro. Um helper
// que "trapaceia" pra montar o cenário mais rápido esconde exatamente o tipo
// de regressão que estes testes existem pra pegar.
import { randomUUID } from 'node:crypto';
import { EventosCliente, EventosServidor } from '../../conexao/eventos.js';

// Nome novo a cada chamada. Contas ficam no banco (temporário) do processo
// pelo resto da execução, então reusar um nome fixo faria o segundo teste que
// cadastra falhar com NOME_JA_CADASTRADO — e só na segunda vez, que é o pior
// tipo de teste intermitente.
export function nomeUnico(prefixo = 'jogador') {
    return `${prefixo}-${randomUUID().slice(0, 8)}`;
}

// Cliente conectado E autenticado como convidado. É o login mais barato do
// protocolo (só nome, sem senha, sem gravar no banco — ver conexao/convidado.js)
// e autentica o socket exatamente igual a `entrar`/`cadastrar`, então serve
// pra qualquer teste cujo assunto não seja a autenticação em si.
export async function convidado(servidor, nome = nomeUnico()) {
    const cliente = await servidor.conectar();
    const { token } = await cliente.ok(EventosCliente.ENTRAR_COMO_CONVIDADO, { nome });
    cliente.nome = nome;
    cliente.token = token;
    return cliente;
}

// N convidados autenticados, em paralelo.
export function convidados(servidor, quantidade) {
    return Promise.all(Array.from({ length: quantidade }, () => convidado(servidor)));
}

// Sala cheia e prestes a começar (o início já foi agendado, mas o timer é
// longo — ver TEMPOS_DE_TESTE — então nada começa sozinho). Devolve os
// clientes na ordem de entrada; o primeiro é o adm.
export async function salaCheia(servidor, { humanos = 2, botNumber = 0, ...config } = {}) {
    const numberPlayers = humanos + botNumber;
    const clientes = await convidados(servidor, humanos);
    const [adm, ...demais] = clientes;

    const { salaId } = await adm.ok(EventosCliente.CRIAR_SALA, { numberPlayers, botNumber, ...config });
    for (const cliente of demais) {
        await cliente.ok(EventosCliente.ENTRAR_SALA, { salaId });
    }

    return { salaId, clientes, adm, numberPlayers };
}

// Partida JÁ em andamento. Começa por `forcarInicio` em vez de esperar o
// timer de início automático: o teste não fica refém de um setTimeout, e o
// momento exato em que a partida começa passa a ser escolha do teste.
//
// Só volta depois que `novaRodadaIniciada` chegou pra todo mundo — sem isso o
// teste seguinte poderia mandar `apostar` antes de a rodada existir e receber
// SALA_NAO_INICIADA por corrida, não por bug.
export async function partidaEmAndamento(servidor, opcoes = {}) {
    const sala = await salaCheia(servidor, opcoes);
    await sala.adm.ok(EventosCliente.FORCAR_INICIO, { salaId: sala.salaId });
    await Promise.all(sala.clientes.map(cliente => cliente.esperar(EventosServidor.NOVA_RODADA_INICIADA)));
    return sala;
}

// Faz o cliente responder sozinho todo turno dele (aposta e carta) até
// alguém chamar o `parar()` devolvido. É o que permite um teste levar uma
// partida até `jogoFinalizado` sem escrever a mesa inteira na mão.
//
// A escolha é a mais boba possível de propósito (aposta 0, primeira carta da
// mão): quem testa estratégia é o avaliador de bots (ver README), não a
// camada de API. O único desvio é o retry com 1 quando o servidor recusa o 0
// por APOSTA_FECHA_RODADA — regra real do protocolo, que só pega o último a
// apostar da rodada.
export function jogarSozinho(cliente, salaId) {
    let parado = false;

    const meuTurno = ({ salaId: sala, jogador }) => !parado && sala === salaId && jogador === cliente.nome;

    // Este é um motor de fundo, não um ponto de asserção: ele dispara sem
    // ninguém dando `await` nele. Por isso todo emit daqui é engolido — um
    // erro solto (ex.: o teste acabou e o servidor fechou no meio de um
    // emit) viraria unhandledRejection e derrubaria o arquivo de teste
    // INTEIRO, mesmo com todas as asserções tendo passado. Quem precisa
    // afirmar algo sobre uma jogada faz o emit no próprio teste, com await.
    const emitirEmSilencio = async (evento, payload) => {
        if (parado || !cliente.conectado) return null;
        try {
            return await cliente.emitir(evento, payload);
        } catch {
            return null;
        }
    };

    const aoApostar = async (dados) => {
        if (!meuTurno(dados)) return;
        const resposta = await emitirEmSilencio(EventosCliente.APOSTAR, { salaId, valor: 0 });
        if (resposta && !resposta.ok && resposta.codigo === 'APOSTA_FECHA_RODADA') {
            await emitirEmSilencio(EventosCliente.APOSTAR, { salaId, valor: 1 });
        }
    };

    const aoJogar = async (dados) => {
        if (!meuTurno(dados)) return;
        await emitirEmSilencio(EventosCliente.JOGAR_CARTA, { salaId, indice: 0 });
    };

    cliente.socket.on(EventosServidor.TURNO_APOSTA, aoApostar);
    cliente.socket.on(EventosServidor.TURNO_JOGADOR, aoJogar);

    // O primeiro `turnoAposta` sai no MESMO tick que o `novaRodadaIniciada`
    // (ver GameController._jogarRodadaAtual: distribuir, virar manilha e
    // pedir a primeira aposta é tudo síncrono). Quem chama isto logo depois
    // de a partida começar já perdeu esse evento — o listener acima só vale
    // pros próximos. Sem este replay, o primeiro turno ficaria sem resposta
    // até estourar tempoTurnoMs, e num teste de inatividade isso expulsa
    // justamente o jogador que devia ficar.
    //
    // Reprocessar um turno que já passou é inofensivo: o servidor responde
    // NAO_E_SUA_VEZ e `emitir` não lança em ack de erro.
    for (const [evento, tratador] of [[EventosServidor.TURNO_APOSTA, aoApostar], [EventosServidor.TURNO_JOGADOR, aoJogar]]) {
        const ultimo = cliente.recebidos(evento).at(-1);
        if (ultimo) tratador(ultimo);
    }

    return function parar() {
        parado = true;
        cliente.socket.off(EventosServidor.TURNO_APOSTA, aoApostar);
        cliente.socket.off(EventosServidor.TURNO_JOGADOR, aoJogar);
    };
}

// Abre uma conexão NOVA com a mesma identidade de um cliente existente —
// é o que acontece de verdade quando a rede cai ou a página dá F5: o
// socket.io-client volta com um `socket.id` que o servidor nunca viu, e o
// cliente reautentica por `retomarSessao` com o token que já tinha.
//
// Não reconecta na sala: isso é o evento `reconectar`, decisão de quem
// chama (a sala de espera e a partida em andamento têm caminhos diferentes).
export async function reconectarSocket(servidor, clienteAntigo) {
    const novo = await servidor.conectar();
    const { token } = await novo.ok(EventosCliente.RETOMAR_SESSAO, { token: clienteAntigo.token });
    novo.nome = clienteAntigo.nome;
    novo.token = token;
    return novo;
}
