// Contrato da partida em si: distribuição de mão, manilha, rodada de aposta,
// vazas e fim de jogo (conexao/PROTOCOLO.md).
//
// Regra de ouro deste arquivo: NADA aqui pode depender de qual carta caiu na
// mão de quem, nem de quem joga primeiro. O baralho é sempre embaralhado
// (ver Baralho.montarBaralhos — as duas pernas do randomShuffle embaralham) e
// a ordem dos jogadores é sorteada a cada partida (Game.setstartsequence).
// Por isso todo teste aqui reage aos eventos `turnoAposta`/`turnoJogador`
// pra descobrir de quem é a vez, em vez de assumir uma ordem.
import test from 'node:test';
import assert from 'node:assert/strict';
import { subirServidor } from '../helpers/servidor.js';
import { convidado, partidaEmAndamento, jogarSozinho } from '../helpers/protocolo.js';
import { EventosCliente, EventosServidor, CodigosErro } from '../../conexao/eventos.js';

// Turnos folgados: nestes testes o assunto nunca é o timeout, e um
// tempoTurnoMs curto faria o servidor jogar sozinho no meio de uma asserção.
// Quem testa timeout de verdade é reconexao.test.js, com valor próprio.
const TURNO_FOLGADO = { tempoTurnoMs: 10_000 };

// Descobre qual dos clientes é o dono do turno anunciado — a ordem da rodada
// é sorteada, então isto é a única forma honesta de saber.
function donoDoTurno(clientes, evento) {
    const dono = clientes.find(cliente => cliente.nome === evento.jogador);
    assert.ok(dono, `o turno foi anunciado pra "${evento.jogador}", que não é nenhum dos clientes do teste`);
    return dono;
}

test('início da partida', async (t) => {
    const servidor = await subirServidor(TURNO_FOLGADO);
    t.after(() => servidor.fechar());

    await t.test('anuncia a rodada 1 com o número de cartas do roundStart', async () => {
        const { salaId, clientes } = await partidaEmAndamento(servidor, { humanos: 2, roundStart: 2 });

        for (const cliente of clientes) {
            const rodada = cliente.recebidos(EventosServidor.NOVA_RODADA_INICIADA).at(0);
            assert.equal(rodada.salaId, salaId);
            assert.equal(rodada.numero, 1);
            assert.equal(rodada.cartas, 2);
        }
    });

    await t.test('suaMao é privado: cada um recebe só a própria mão', async () => {
        const { clientes } = await partidaEmAndamento(servidor, { humanos: 2, roundStart: 3 });
        const [a, b] = clientes;

        const maoDeA = await a.esperar(EventosServidor.SUA_MAO);
        const maoDeB = await b.esperar(EventosServidor.SUA_MAO);

        assert.equal(maoDeA.mao.length, 3);
        assert.equal(maoDeB.mao.length, 3);
        // Cada cliente recebeu exatamente um suaMao — não o do vizinho junto.
        assert.equal(a.recebidos(EventosServidor.SUA_MAO).length, 1);
        assert.equal(b.recebidos(EventosServidor.SUA_MAO).length, 1);
        // Formato: string legível por carta (ver Carta.toString).
        for (const carta of maoDeA.mao) {
            assert.match(carta, /^\[.+ de (Ouros|Espadas|Copas|Paus)\]$/);
        }
    });

    await t.test('manilhaVirada é broadcast, chega igual pra todo mundo', async () => {
        const { salaId, clientes } = await partidaEmAndamento(servidor, { humanos: 2 });
        const [a, b] = clientes;

        const paraA = await a.esperar(EventosServidor.MANILHA_VIRADA);
        const paraB = await b.esperar(EventosServidor.MANILHA_VIRADA);

        assert.equal(paraA.salaId, salaId);
        assert.equal(typeof paraA.vira, 'string');
        assert.equal(typeof paraA.viraValor, 'number');
        assert.deepEqual(paraA, paraB);
    });

    await t.test('pede as apostas uma de cada vez', async () => {
        const { clientes } = await partidaEmAndamento(servidor, { humanos: 2 });
        const [a] = clientes;

        await a.esperar(EventosServidor.TURNO_APOSTA);
        // O segundo turnoAposta só pode sair depois que o primeiro apostar —
        // se saíssem juntos, os dois já teriam chegado aqui.
        assert.equal(a.recebidos(EventosServidor.TURNO_APOSTA).length, 1);
    });

    await t.test('rodada de 1 carta revela a mão dos OUTROS, nunca a sua', async () => {
        const { clientes } = await partidaEmAndamento(servidor, { humanos: 2, roundStart: 1 });
        const [a, b] = clientes;

        const paraA = await a.esperar(EventosServidor.MAOS_REVELADAS);
        const paraB = await b.esperar(EventosServidor.MAOS_REVELADAS);

        assert.deepEqual(paraA.maos.map(m => m.jogador), [b.nome]);
        assert.deepEqual(paraB.maos.map(m => m.jogador), [a.nome]);
        assert.equal(paraA.maos[0].mao.length, 1);
    });

    await t.test('fora da rodada de 1 carta não existe maosReveladas', async () => {
        const { clientes } = await partidaEmAndamento(servidor, { humanos: 2, roundStart: 3 });
        const [a] = clientes;

        await a.esperar(EventosServidor.TURNO_APOSTA); // já passou do ponto onde sairia
        assert.deepEqual(a.recebidos(EventosServidor.MAOS_REVELADAS), []);
    });
});

test('apostar', async (t) => {
    const servidor = await subirServidor(TURNO_FOLGADO);
    t.after(() => servidor.fechar());

    await t.test('aceita a aposta de quem tem a vez e avisa a sala', async () => {
        const { salaId, clientes } = await partidaEmAndamento(servidor, { humanos: 2, roundStart: 3 });
        const turno = await clientes[0].esperar(EventosServidor.TURNO_APOSTA);
        const daVez = donoDoTurno(clientes, turno);

        await daVez.ok(EventosCliente.APOSTAR, { salaId, valor: 2 });

        // apostaFeita é broadcast — sai pros dois, não só pra quem apostou.
        for (const cliente of clientes) {
            const feita = await cliente.esperar(
                EventosServidor.APOSTA_FEITA,
                { filtro: dados => dados.jogador === daVez.nome }
            );
            assert.equal(feita.aposta, 2);
            assert.equal(feita.salaId, salaId);
        }
    });

    await t.test('NAO_E_SUA_VEZ pra quem não tem o turno', async () => {
        const { salaId, clientes } = await partidaEmAndamento(servidor, { humanos: 2 });
        const turno = await clientes[0].esperar(EventosServidor.TURNO_APOSTA);
        const foraDaVez = clientes.find(cliente => cliente.nome !== turno.jogador);

        await foraDaVez.erro(EventosCliente.APOSTAR, { salaId, valor: 1 }, CodigosErro.NAO_E_SUA_VEZ);
    });

    await t.test('APOSTA_INVALIDA fora do intervalo [0, cartas da rodada]', async () => {
        const { salaId, clientes } = await partidaEmAndamento(servidor, { humanos: 2, roundStart: 2 });
        const turno = await clientes[0].esperar(EventosServidor.TURNO_APOSTA);
        const daVez = donoDoTurno(clientes, turno);

        // A rodada tem 2 cartas: 3 é mais vazas do que existe pra fazer.
        await daVez.erro(EventosCliente.APOSTAR, { salaId, valor: 3 }, CodigosErro.APOSTA_INVALIDA);
        await daVez.erro(EventosCliente.APOSTAR, { salaId, valor: -1 }, CodigosErro.APOSTA_INVALIDA);
        await daVez.erro(EventosCliente.APOSTAR, { salaId, valor: 1.5 }, CodigosErro.APOSTA_INVALIDA);
        await daVez.erro(EventosCliente.APOSTAR, { salaId, valor: '1' }, CodigosErro.APOSTA_INVALIDA);
        // Recusada não consome o turno: ele ainda pode apostar de verdade.
        await daVez.ok(EventosCliente.APOSTAR, { salaId, valor: 2 });
    });

    await t.test('0 e o total de cartas são valores válidos', async () => {
        const { salaId, clientes } = await partidaEmAndamento(servidor, { humanos: 2, roundStart: 2 });
        const turno = await clientes[0].esperar(EventosServidor.TURNO_APOSTA);
        const daVez = donoDoTurno(clientes, turno);

        await daVez.ok(EventosCliente.APOSTAR, { salaId, valor: 0 });

        const segundoTurno = await clientes[0].esperar(EventosServidor.TURNO_APOSTA);
        const segundo = donoDoTurno(clientes, segundoTurno);
        // Soma ficaria 0 + 2 = 2 = cartas da rodada -> fecharia. Então o
        // valor máximo aqui só é aceito porque testamos o limite superior
        // com a soma que NÃO fecha: 0 + 2 fecha, logo o teste do limite
        // superior é feito pelo primeiro a apostar acima.
        await segundo.erro(EventosCliente.APOSTAR, { salaId, valor: 2 }, CodigosErro.APOSTA_FECHA_RODADA);
        await segundo.ok(EventosCliente.APOSTAR, { salaId, valor: 1 });
    });

    await t.test('APOSTA_FECHA_RODADA só pega o último a apostar', async () => {
        // Regra: a soma das apostas não pode dar exatamente o número de
        // cartas — senão alguém acerta garantido, sem risco.
        const { salaId, clientes } = await partidaEmAndamento(servidor, { humanos: 2, roundStart: 1 });

        const primeiroTurno = await clientes[0].esperar(EventosServidor.TURNO_APOSTA);
        const primeiro = donoDoTurno(clientes, primeiroTurno);
        // O primeiro a apostar não esbarra na regra: ele ainda não sabe a soma.
        await primeiro.ok(EventosCliente.APOSTAR, { salaId, valor: 1 });

        const segundoTurno = await clientes[0].esperar(EventosServidor.TURNO_APOSTA);
        const segundo = donoDoTurno(clientes, segundoTurno);
        // Rodada de 1 carta, soma dos outros = 1: apostar 0 fecharia em 1.
        await segundo.erro(EventosCliente.APOSTAR, { salaId, valor: 0 }, CodigosErro.APOSTA_FECHA_RODADA);
        // Qualquer outro valor válido passa.
        await segundo.ok(EventosCliente.APOSTAR, { salaId, valor: 1 });
    });

    await t.test('SALA_NAO_INICIADA numa sala que ainda não começou', async () => {
        const dono = await convidado(servidor);
        const { salaId } = await dono.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4 });
        await dono.erro(EventosCliente.APOSTAR, { salaId, valor: 1 }, CodigosErro.SALA_NAO_INICIADA);
    });

    await t.test('SALA_NAO_ENCONTRADA com salaId inexistente', async () => {
        const dono = await convidado(servidor);
        await dono.erro(EventosCliente.APOSTAR, { salaId: 'NAOEXISTE', valor: 1 }, CodigosErro.SALA_NAO_ENCONTRADA);
    });
});

test('jogarCarta', async (t) => {
    const servidor = await subirServidor(TURNO_FOLGADO);
    t.after(() => servidor.fechar());

    // Leva a partida do início até o primeiro turnoJogador, apostando 0 por
    // todo mundo (0 nunca fecha a rodada quando ela tem mais de uma carta).
    async function ateAPrimeiraVaza(opcoes = {}) {
        const sala = await partidaEmAndamento(servidor, { humanos: 2, roundStart: 3, ...opcoes });
        for (let i = 0; i < sala.clientes.length; i++) {
            const turno = await sala.clientes[0].esperar(EventosServidor.TURNO_APOSTA);
            await donoDoTurno(sala.clientes, turno).ok(EventosCliente.APOSTAR, { salaId: sala.salaId, valor: 0 });
        }
        const turnoJogador = await sala.clientes[0].esperar(EventosServidor.TURNO_JOGADOR);
        return { ...sala, daVez: donoDoTurno(sala.clientes, turnoJogador) };
    }

    await t.test('joga a carta e a sala inteira vê o resultado', async () => {
        const { salaId, clientes, daVez } = await ateAPrimeiraVaza();
        const mao = daVez.recebidos(EventosServidor.SUA_MAO).at(0).mao;

        await daVez.ok(EventosCliente.JOGAR_CARTA, { salaId, indice: 0 });

        for (const cliente of clientes) {
            const jogada = await cliente.esperar(
                EventosServidor.CARTA_JOGADA,
                { filtro: dados => dados.jogador === daVez.nome }
            );
            assert.equal(jogada.salaId, salaId);
            assert.equal(jogada.carta, mao[0]);
        }
    });

    await t.test('NAO_E_SUA_VEZ pra quem não tem o turno', async () => {
        const { salaId, clientes, daVez } = await ateAPrimeiraVaza();
        const foraDaVez = clientes.find(cliente => cliente !== daVez);
        await foraDaVez.erro(EventosCliente.JOGAR_CARTA, { salaId, indice: 0 }, CodigosErro.NAO_E_SUA_VEZ);
    });

    await t.test('CARTA_INVALIDA com índice fora da mão', async () => {
        const { salaId, daVez } = await ateAPrimeiraVaza();

        // A mão tem 3 cartas (índices 0..2).
        await daVez.erro(EventosCliente.JOGAR_CARTA, { salaId, indice: 3 }, CodigosErro.CARTA_INVALIDA);
        await daVez.erro(EventosCliente.JOGAR_CARTA, { salaId, indice: -1 }, CodigosErro.CARTA_INVALIDA);
        await daVez.erro(EventosCliente.JOGAR_CARTA, { salaId, indice: 1.5 }, CodigosErro.CARTA_INVALIDA);
        await daVez.erro(EventosCliente.JOGAR_CARTA, { salaId, indice: '0' }, CodigosErro.CARTA_INVALIDA);
        await daVez.erro(EventosCliente.JOGAR_CARTA, { salaId }, CodigosErro.CARTA_INVALIDA);
        // Recusada não consome o turno.
        await daVez.ok(EventosCliente.JOGAR_CARTA, { salaId, indice: 0 });
    });

    await t.test('a vaza fecha e anuncia o vencedor', async () => {
        const { salaId, clientes } = await ateAPrimeiraVaza();
        // Cada um joga a primeira carta da mão até a vaza fechar.
        const parar = clientes.map(cliente => jogarSozinho(cliente, salaId));

        const vaza = await clientes[0].esperar(EventosServidor.VAZA_FINALIZADA);
        parar.forEach(fn => fn());

        assert.equal(vaza.salaId, salaId);
        assert.ok(clientes.some(cliente => cliente.nome === vaza.vencedor), 'o vencedor tem que ser um dos jogadores');
        assert.equal(typeof vaza.carta, 'string');
    });

    await t.test('SALA_NAO_INICIADA numa sala que ainda não começou', async () => {
        const dono = await convidado(servidor);
        const { salaId } = await dono.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4 });
        await dono.erro(EventosCliente.JOGAR_CARTA, { salaId, indice: 0 }, CodigosErro.SALA_NAO_INICIADA);
    });
});

test('partida até o fim', async (t) => {
    const servidor = await subirServidor(TURNO_FOLGADO);
    t.after(() => servidor.fechar());

    await t.test('a rodada fecha com placar e a partida chega em jogoFinalizado', async () => {
        const { salaId, clientes } = await partidaEmAndamento(servidor, { humanos: 2 });
        const parar = clientes.map(cliente => jogarSozinho(cliente, salaId));
        t.after(() => parar.forEach(fn => fn()));

        const fimDaRodada = await clientes[0].esperar(EventosServidor.RODADA_FINALIZADA, { timeoutMs: 20_000 });
        assert.equal(fimDaRodada.numero, 1);
        assert.equal(fimDaRodada.resultado.length, 2);
        for (const linha of fimDaRodada.resultado) {
            assert.equal(typeof linha.nome, 'string');
            assert.equal(typeof linha.aposta, 'number');
            assert.equal(typeof linha.hp, 'number');
        }

        // Cada rodada tira hp de pelo menos um jogador (com todo mundo
        // apostando 0, alguém sempre erra), então a partida termina sozinha.
        const fim = await clientes[0].esperar(EventosServidor.JOGO_FINALIZADO, { timeoutMs: 60_000 });
        assert.equal(fim.salaId, salaId);
        assert.ok(clientes.some(cliente => cliente.nome === fim.vencedor), `vencedor inesperado: ${fim.vencedor}`);
    });
});

test('jogarDeNovo', async (t) => {
    const servidor = await subirServidor(TURNO_FOLGADO);
    t.after(() => servidor.fechar());

    // Uma partida inteira, do início ao jogoFinalizado.
    async function partidaTerminada() {
        const sala = await partidaEmAndamento(servidor, { humanos: 2 });
        const parar = sala.clientes.map(cliente => jogarSozinho(cliente, sala.salaId));
        await sala.clientes[0].esperar(EventosServidor.JOGO_FINALIZADO, { timeoutMs: 60_000 });
        parar.forEach(fn => fn());
        return sala;
    }

    await t.test('SALA_NAO_FINALIZADA enquanto a partida está rolando', async () => {
        const { salaId, adm } = await partidaEmAndamento(servidor, { humanos: 2 });
        await adm.erro(EventosCliente.JOGAR_DE_NOVO, { salaId }, CodigosErro.SALA_NAO_FINALIZADA);
    });

    await t.test('o adm cria a sala nova com a mesma config e convida quem ficou', async () => {
        const { salaId, adm, clientes } = await partidaTerminada();
        const outro = clientes.find(cliente => cliente !== adm);

        const resposta = await adm.ok(EventosCliente.JOGAR_DE_NOVO, { salaId });

        assert.notEqual(resposta.salaId, salaId);
        assert.equal(resposta.numberPlayers, 2); // mesma config da que terminou
        assert.deepEqual(resposta.jogadores.map(j => j.nome), [adm.nome]);

        // Quem ficou na sala antiga recebe o convite com o id da sala nova.
        const convite = await outro.esperar(EventosServidor.CONVITE_REVANCHE);
        assert.equal(convite.salaId, salaId);
        assert.equal(convite.novaSalaId, resposta.salaId);
        assert.equal(convite.jogador, adm.nome);

        // E aceitar é só um entrarSala normal.
        await outro.ok(EventosCliente.ENTRAR_SALA, { salaId: convite.novaSalaId });
    });

    await t.test('NAO_AUTORIZADO por quem não é o adm da sala que terminou', async () => {
        const { salaId, adm, clientes } = await partidaTerminada();
        const outro = clientes.find(cliente => cliente !== adm);
        await outro.erro(EventosCliente.JOGAR_DE_NOVO, { salaId }, CodigosErro.NAO_AUTORIZADO);
    });

    await t.test('SALA_NAO_ENCONTRADA com salaId inexistente', async () => {
        const cliente = await convidado(servidor);
        await cliente.erro(EventosCliente.JOGAR_DE_NOVO, { salaId: 'NAOEXISTE' }, CodigosErro.SALA_NAO_ENCONTRADA);
    });
});
