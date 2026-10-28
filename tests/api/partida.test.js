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

    await t.test('novaRodadaIniciada traz a ordem dos assentos, igual pra todos', async () => {
        const { clientes } = await partidaEmAndamento(servidor, { humanos: 3 });

        const ordens = clientes.map(cliente => cliente.recebidos(EventosServidor.NOVA_RODADA_INICIADA).at(0).ordem);
        // Todo mundo da mesa, cada um uma vez — a ordem em si é sorteada.
        assert.deepEqual([...ordens[0]].sort(), clientes.map(cliente => cliente.nome).sort());
        for (const ordem of ordens) assert.deepEqual(ordem, ordens[0]);
    });

    await t.test('a vez de apostar anda pra frente na ordem dos assentos', async () => {
        const { salaId, clientes } = await partidaEmAndamento(servidor, { humanos: 3, roundStart: 2 });
        const [observador] = clientes;
        const ordem = observador.recebidos(EventosServidor.NOVA_RODADA_INICIADA).at(0).ordem;

        const primeiro = await observador.esperar(EventosServidor.TURNO_APOSTA);
        await donoDoTurno(clientes, primeiro).ok(EventosCliente.APOSTAR, { salaId, valor: 0 });
        const segundo = await observador.esperar(EventosServidor.TURNO_APOSTA);

        const i = ordem.indexOf(primeiro.jogador);
        assert.equal(segundo.jogador, ordem[(i + 1) % ordem.length]);
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
        // cartas — senão alguém acerta garantido, sem risco. Precisa de uma
        // rodada com mais de 1 carta: na de 1 carta a regra é invalida (ver
        // teste abaixo).
        const { salaId, clientes } = await partidaEmAndamento(servidor, { humanos: 2, roundStart: 2 });

        const primeiroTurno = await clientes[0].esperar(EventosServidor.TURNO_APOSTA);
        const primeiro = donoDoTurno(clientes, primeiroTurno);
        // O primeiro a apostar não esbarra na regra: ele ainda não sabe a soma.
        await primeiro.ok(EventosCliente.APOSTAR, { salaId, valor: 1 });

        const segundoTurno = await clientes[0].esperar(EventosServidor.TURNO_APOSTA);
        const segundo = donoDoTurno(clientes, segundoTurno);
        // Rodada de 2 cartas, soma dos outros = 1: apostar 1 fecharia em 2.
        await segundo.erro(EventosCliente.APOSTAR, { salaId, valor: 1 }, CodigosErro.APOSTA_FECHA_RODADA);
        // Qualquer outro valor válido passa.
        await segundo.ok(EventosCliente.APOSTAR, { salaId, valor: 0 });
    });

    await t.test('rodada de 1 carta não tem APOSTA_FECHA_RODADA', async () => {
        // Com só 0 e 1 como valores possíveis, proibir um dos dois travaria
        // o último jogador num valor único e forçado — o dobro do aperto de
        // uma rodada normal. Por isso a regra não vale na rodada de 1 carta.
        const { salaId, clientes } = await partidaEmAndamento(servidor, { humanos: 2, roundStart: 1 });

        const primeiroTurno = await clientes[0].esperar(EventosServidor.TURNO_APOSTA);
        const primeiro = donoDoTurno(clientes, primeiroTurno);
        await primeiro.ok(EventosCliente.APOSTAR, { salaId, valor: 1 });

        const segundoTurno = await clientes[0].esperar(EventosServidor.TURNO_APOSTA);
        const segundo = donoDoTurno(clientes, segundoTurno);
        // Soma dos outros = 1: apostar 0 fecharia em 1 numa rodada normal,
        // mas aqui é aceito de boa.
        await segundo.ok(EventosCliente.APOSTAR, { salaId, valor: 0 });
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
        // Vaza melada (cartas empatadas se anulam) fecha sem vencedor nem carta.
        if (vaza.vencedor === null) {
            assert.equal(vaza.carta, null);
        } else {
            assert.ok(clientes.some(cliente => cliente.nome === vaza.vencedor), 'o vencedor tem que ser um dos jogadores');
            assert.equal(typeof vaza.carta, 'string');
        }
    });

    await t.test('SALA_NAO_INICIADA numa sala que ainda não começou', async () => {
        const dono = await convidado(servidor);
        const { salaId } = await dono.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4 });
        await dono.erro(EventosCliente.JOGAR_CARTA, { salaId, indice: 0 }, CodigosErro.SALA_NAO_INICIADA);
    });
});

test('timerTurno', async (t) => {
    // É por este evento que o front desenha a contagem regressiva. Ele sai
    // logo depois do setTimeout do turno, então `tempoMs` é exatamente o que
    // falta pro automático agir — não uma estimativa que a tela precise
    // corrigir.
    const TEMPO_DE_TURNO = 8_000;
    const ATRASO_DO_BOT = 40;
    const servidor = await subirServidor({ tempoTurnoMs: TEMPO_DE_TURNO, atrasoBotMs: ATRASO_DO_BOT });
    t.after(() => servidor.fechar());

    await t.test('acompanha o turno de aposta, com o tempo que o jogador tem', async () => {
        const { salaId, clientes } = await partidaEmAndamento(servidor, { humanos: 2 });

        const turno = await clientes[0].esperar(EventosServidor.TURNO_APOSTA);
        const timer = await clientes[0].esperar(
            EventosServidor.TIMER_TURNO,
            { filtro: dados => dados.jogador === turno.jogador },
        );

        assert.equal(timer.salaId, salaId);
        assert.equal(timer.tipo, 'aposta');
        assert.equal(timer.tempoMs, TEMPO_DE_TURNO);
        assert.ok(timer.id, 'o id vem junto — é por ele que a tela acha o assento');
        assert.equal(timer.jogador, turno.jogador, 'o timer tem que ser do mesmo turno anunciado');
    });

    await t.test('na fase de carta o tipo muda para jogada', async () => {
        const { salaId, clientes } = await partidaEmAndamento(servidor, { humanos: 2 });
        const parar = clientes.map(cliente => jogarSozinho(cliente, salaId));
        t.after(() => parar.forEach(fn => fn()));

        const timer = await clientes[0].esperar(
            EventosServidor.TIMER_TURNO,
            { filtro: dados => dados.tipo === 'jogada', timeoutMs: 20_000 },
        );
        assert.equal(timer.salaId, salaId);
        assert.equal(timer.tempoMs, TEMPO_DE_TURNO);
    });

    await t.test('para o bot, tempoMs é a pausa dele — não o prazo de um humano', async () => {
        // Bot não tem prazo pra perder: o que o timer anuncia é o atrasoBotMs,
        // a pausa cosmética antes de ele decidir. Uma tela que usasse
        // tempoTurnoMs aqui desenharia 8 segundos de contagem para algo que
        // acontece em 40ms.
        const { salaId, adm } = await partidaEmAndamento(servidor, { humanos: 1, botNumber: 1 });

        const timerDoBot = await adm.esperar(
            EventosServidor.TIMER_TURNO,
            { filtro: dados => dados.jogador !== adm.nome, timeoutMs: 20_000 },
        );

        assert.equal(timerDoBot.salaId, salaId);
        assert.equal(timerDoBot.tempoMs, ATRASO_DO_BOT);
        assert.ok(['aposta', 'jogada'].includes(timerDoBot.tipo));
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

    // Mesa de 4 de propósito. Numa de 2 este evento é inalcançável: quem
    // zera a vida deixa UM vivo, e o GameController resolve o fim de jogo
    // antes de virar a rodada (_resolverFimDeJogo roda antes de
    // _avancarParaProximaRodada, que é quem emite `jogadoresEliminados`).
    // Era por isso que o evento não tinha teste nenhum.
    //
    // E `seed` não é luxo aqui: sem ela o teste é intermitente de verdade
    // (~10%). Nas rodadas de 3+ cartas vários jogadores podem zerar a vida
    // na MESMA virada; quando isso deixa um só vivo, a partida termina pelo
    // mesmo atalho de cima e o evento nunca sai — foi assim que este teste
    // falhou uma vez em onze, esperando 60s por um evento que não viria.
    // Com a seed a mesa é reproduzível carta por carta (ver `seed` em
    // criarSala no PROTOCOLO.md), então a eliminação acontece sempre no
    // mesmo ponto. Se um dia o baralho ou o rng mudarem, isto quebra de
    // forma determinística — alta e sempre, não uma vez a cada dez.
    await t.test('jogadoresEliminados sai quando alguém zera a vida e a partida continua', async () => {
        const { salaId, clientes } = await partidaEmAndamento(servidor, { humanos: 4, seed: 1 });
        const parar = clientes.map(cliente => jogarSozinho(cliente, salaId));
        t.after(() => parar.forEach(fn => fn()));

        const eliminacao = await clientes[0].esperar(EventosServidor.JOGADORES_ELIMINADOS, { timeoutMs: 60_000 });

        assert.equal(eliminacao.salaId, salaId);
        assert.ok(eliminacao.eliminados.length >= 1, 'o evento só sai quando há eliminado');
        for (const morto of eliminacao.eliminados) {
            assert.ok(clientes.some(cliente => cliente.nome === morto.nome), `eliminado inesperado: ${morto.nome}`);
            assert.ok(morto.hp <= 0, `${morto.nome} foi eliminado com hp ${morto.hp}`);
        }
        // Se a partida tivesse acabado aqui, este evento não teria saído —
        // ele é o sinal de que a mesa encolheu mas o jogo segue.
        assert.ok(eliminacao.eliminados.length < clientes.length, 'não dá pra eliminar a mesa inteira e continuar');
    });
});

test('jogarDeNovo', async (t) => {
    const servidor = await subirServidor(TURNO_FOLGADO);
    t.after(() => servidor.fechar());

    // Uma partida inteira, do início ao jogoFinalizado.
    async function partidaTerminada() {
        // modeloBot fora do default só pra provar que "jogar de novo" herda.
        const sala = await partidaEmAndamento(servidor, { humanos: 2, modeloBot: 'iniciante' });
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
        assert.equal(resposta.modeloBot, 'iniciante');
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

test('sugestaoBot', async (t) => {
    const servidor = await subirServidor(TURNO_FOLGADO);
    t.after(() => servidor.fechar());

    await t.test('na vez de apostar, devolve um valor válido sem registrar aposta', async () => {
        const { salaId, clientes } = await partidaEmAndamento(servidor, { humanos: 2, roundStart: 3, modeloBot: 'campeao' });
        const turno = await clientes[0].esperar(EventosServidor.TURNO_APOSTA);
        const daVez = donoDoTurno(clientes, turno);

        const dica = await daVez.ok(EventosCliente.SUGESTAO_BOT, { salaId });
        assert.equal(dica.tipo, 'aposta');
        assert.equal(dica.modeloBot, 'campeao');
        assert.ok(Number.isInteger(dica.valor) && dica.valor >= 0 && dica.valor <= 3);
        // Determinística: pedir de novo na mesma vez dá a mesma resposta.
        assert.equal((await daVez.ok(EventosCliente.SUGESTAO_BOT, { salaId })).valor, dica.valor);
        // Só dica: a vez continua dele e nenhuma aposta saiu.
        assert.equal(daVez.recebidos(EventosServidor.APOSTA_FEITA).length, 0);
        await daVez.ok(EventosCliente.APOSTAR, { salaId, valor: dica.valor });
    });

    await t.test('na vez de jogar, devolve uma carta da mão sem jogar', async () => {
        const { salaId, clientes } = await partidaEmAndamento(servidor, { humanos: 2, roundStart: 3 });
        for (let i = 0; i < clientes.length; i++) {
            const turno = await clientes[0].esperar(EventosServidor.TURNO_APOSTA);
            await donoDoTurno(clientes, turno).ok(EventosCliente.APOSTAR, { salaId, valor: 0 });
        }
        const daVez = donoDoTurno(clientes, await clientes[0].esperar(EventosServidor.TURNO_JOGADOR));
        const mao = daVez.recebidos(EventosServidor.SUA_MAO).at(-1).mao;

        const dica = await daVez.ok(EventosCliente.SUGESTAO_BOT, { salaId });
        assert.equal(dica.tipo, 'carta');
        assert.equal(dica.modeloBot, 'classico'); // default de criarSala
        assert.equal(dica.carta, mao[dica.indice]);
        assert.equal(daVez.recebidos(EventosServidor.CARTA_JOGADA).length, 0);

        await daVez.ok(EventosCliente.JOGAR_CARTA, { salaId, indice: dica.indice });
        const jogada = await daVez.esperar(EventosServidor.CARTA_JOGADA, { filtro: dados => dados.jogador === daVez.nome });
        assert.equal(jogada.carta, dica.carta);
    });

    await t.test('NAO_E_SUA_VEZ pra quem não tem o turno', async () => {
        const { salaId, clientes } = await partidaEmAndamento(servidor, { humanos: 2, roundStart: 3 });
        const turno = await clientes[0].esperar(EventosServidor.TURNO_APOSTA);
        const foraDaVez = clientes.find(cliente => cliente.nome !== turno.jogador);
        await foraDaVez.erro(EventosCliente.SUGESTAO_BOT, { salaId }, CodigosErro.NAO_E_SUA_VEZ);
    });

    await t.test('SALA_NAO_INICIADA numa sala que ainda não começou', async () => {
        const dono = await convidado(servidor);
        const { salaId } = await dono.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4 });
        await dono.erro(EventosCliente.SUGESTAO_BOT, { salaId }, CodigosErro.SALA_NAO_INICIADA);
    });

    await t.test('SALA_NAO_ENCONTRADA com salaId inexistente', async () => {
        const dono = await convidado(servidor);
        await dono.erro(EventosCliente.SUGESTAO_BOT, { salaId: 'NAOEXISTE' }, CodigosErro.SALA_NAO_ENCONTRADA);
    });
});
