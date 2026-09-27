// Contrato do que acontece quando alguém some no meio da partida: timeout de
// turno, expulsão por inatividade, vaga reservada e expirada, reconexão e
// abandono voluntário (conexao/PROTOCOLO.md).
//
// Estes são os testes que mais dependem de tempo, então os tempos vêm
// encolhidos POR TESTE, nunca com sleep no meio da asserção: o teste espera
// o evento que prova o que aconteceu, não um relógio.
import test from 'node:test';
import assert from 'node:assert/strict';
import { subirServidor } from '../helpers/servidor.js';
import { convidado, partidaEmAndamento, jogarSozinho, reconectarSocket } from '../helpers/protocolo.js';
import { EventosCliente, EventosServidor, CodigosErro } from '../../conexao/eventos.js';

test('minhaSalaAtiva', async (t) => {
    const servidor = await subirServidor({ tempoTurnoMs: 10_000 });
    t.after(() => servidor.fechar());

    await t.test('null quando o jogador não está em partida nenhuma', async () => {
        const cliente = await convidado(servidor);
        const resposta = await cliente.ok(EventosCliente.MINHA_SALA_ATIVA, {});
        assert.equal(resposta.salaId, null);
    });

    await t.test('null pra sala de espera — só partida em andamento conta', async () => {
        const cliente = await convidado(servidor);
        await cliente.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4 });

        const resposta = await cliente.ok(EventosCliente.MINHA_SALA_ATIVA, {});
        assert.equal(resposta.salaId, null);
    });

    await t.test('devolve o salaId da partida em andamento', async () => {
        const { salaId, adm } = await partidaEmAndamento(servidor, { humanos: 2 });
        const resposta = await adm.ok(EventosCliente.MINHA_SALA_ATIVA, {});
        assert.equal(resposta.salaId, salaId);
    });

    await t.test('um socket novo descobre a partida sem saber o salaId', async () => {
        // É o caso real: F5 na página, o cliente não guarda salaId nenhum.
        const { salaId, adm } = await partidaEmAndamento(servidor, { humanos: 2 });
        const novo = await reconectarSocket(servidor, adm);

        const resposta = await novo.ok(EventosCliente.MINHA_SALA_ATIVA, {});
        assert.equal(resposta.salaId, salaId);
    });
});

test('reconectar', async (t) => {
    const servidor = await subirServidor({ tempoTurnoMs: 10_000 });
    t.after(() => servidor.fechar());

    await t.test('devolve o estado pra remontar a tela', async () => {
        const { salaId, adm, clientes } = await partidaEmAndamento(servidor, { humanos: 2, roundStart: 3 });
        const maoOriginal = (await adm.esperar(EventosServidor.SUA_MAO)).mao;
        await adm.desconectar();

        const voltou = await reconectarSocket(servidor, adm);
        const estado = await voltou.ok(EventosCliente.RECONECTAR, { salaId });

        assert.equal(estado.salaId, salaId);
        // Mesma ordem de assentos que o novaRodadaIniciada anunciou.
        assert.deepEqual(estado.ordem, adm.recebidos(EventosServidor.NOVA_RODADA_INICIADA).at(0).ordem);
        assert.deepEqual(estado.mao, maoOriginal);
        assert.equal(estado.cartasRodada, 3);
        assert.equal(estado.chatAberto, false);
        assert.deepEqual(estado.maosReveladas, []); // só na rodada de 1 carta
        assert.equal(typeof estado.suaVez, 'boolean');
        assert.equal(typeof estado.suaVezDaAposta, 'boolean');
        // A partida está na fase de aposta: alguém tem que ser o da vez.
        assert.ok(clientes.some(cliente => cliente.nome === estado.jogadorDaVezAposta));
        assert.equal(estado.jogadorDaVez, null);
    });

    await t.test('avisa a sala com jogadorReconectou', async () => {
        const { salaId, adm, clientes } = await partidaEmAndamento(servidor, { humanos: 2 });
        const outro = clientes.find(cliente => cliente !== adm);
        await adm.desconectar();

        const voltou = await reconectarSocket(servidor, adm);
        await voltou.ok(EventosCliente.RECONECTAR, { salaId });

        const aviso = await outro.esperar(EventosServidor.JOGADOR_RECONECTOU);
        assert.equal(aviso.salaId, salaId);
        // Campo `jogador`, igual a todos os outros eventos de partida — é o
        // que Partida.jsx lê pra tirar a marca de "desconectado" de quem voltou.
        assert.equal(aviso.jogador, adm.nome);
        assert.equal(typeof aviso.id, 'number');
    });

    await t.test('volta a receber os broadcasts da sala', async () => {
        const { salaId, adm, clientes } = await partidaEmAndamento(servidor, { humanos: 2 });
        const outro = clientes.find(cliente => cliente !== adm);
        await adm.desconectar();

        const voltou = await reconectarSocket(servidor, adm);
        await voltou.ok(EventosCliente.RECONECTAR, { salaId });
        voltou.limparHistorico();

        // Movimento novo na partida: quem voltou tem que enxergar.
        const parar = jogarSozinho(outro, salaId);
        t.after(() => parar());
        const aposta = await voltou.esperar(EventosServidor.APOSTA_FEITA, { timeoutMs: 15_000 });
        assert.equal(aposta.salaId, salaId);
    });

    await t.test('quem voltou consegue jogar de novo', async () => {
        const { salaId, adm } = await partidaEmAndamento(servidor, { humanos: 2 });
        await adm.desconectar();

        const voltou = await reconectarSocket(servidor, adm);
        const estado = await voltou.ok(EventosCliente.RECONECTAR, { salaId });

        // Se for a vez dele, a aposta tem que ser aceita normalmente.
        if (estado.suaVezDaAposta) {
            await voltou.ok(EventosCliente.APOSTAR, { salaId, valor: 0 });
        } else {
            // Se não for, o servidor tem que dizer isso — e não NAO_IDENTIFICADO
            // nem NAO_ESTA_NA_SALA, que seria perda de identidade.
            await voltou.erro(EventosCliente.APOSTAR, { salaId, valor: 0 }, CodigosErro.NAO_E_SUA_VEZ);
        }
    });

    await t.test('SALA_NAO_INICIADA numa sala de espera', async () => {
        const cliente = await convidado(servidor);
        const { salaId } = await cliente.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4 });
        // Na sala de espera, sumir tira o assento de verdade — o caminho de
        // volta é entrarSala, não reconectar.
        await cliente.erro(EventosCliente.RECONECTAR, { salaId }, CodigosErro.SALA_NAO_INICIADA);
    });

    await t.test('NAO_ESTA_NA_SALA por quem nunca fez parte da partida', async () => {
        const { salaId } = await partidaEmAndamento(servidor, { humanos: 2 });
        const forasteiro = await convidado(servidor);
        await forasteiro.erro(EventosCliente.RECONECTAR, { salaId }, CodigosErro.NAO_ESTA_NA_SALA);
    });

    await t.test('SALA_NAO_ENCONTRADA com salaId inexistente', async () => {
        const cliente = await convidado(servidor);
        await cliente.erro(EventosCliente.RECONECTAR, { salaId: 'NAOEXISTE' }, CodigosErro.SALA_NAO_ENCONTRADA);
    });
});

test('sairDaPartida', async (t) => {
    const servidor = await subirServidor({ tempoTurnoMs: 10_000 });
    t.after(() => servidor.fechar());

    await t.test('o assento vira bot na hora e a sala é avisada', async () => {
        const { salaId, adm, clientes } = await partidaEmAndamento(servidor, { humanos: 2 });
        const outro = clientes.find(cliente => cliente !== adm);

        await adm.ok(EventosCliente.SAIR_DA_PARTIDA, { salaId });

        // Mesmo evento da expulsão por inatividade — o efeito é o mesmo.
        const aviso = await outro.esperar(EventosServidor.JOGADOR_EXPULSO_POR_INATIVIDADE);
        assert.equal(aviso.salaId, salaId);
        assert.equal(aviso.jogador, adm.nome);
    });

    await t.test('quem saiu para de receber os eventos da sala', async () => {
        const { salaId, adm, clientes } = await partidaEmAndamento(servidor, { humanos: 2 });
        const outro = clientes.find(cliente => cliente !== adm);

        await adm.ok(EventosCliente.SAIR_DA_PARTIDA, { salaId });
        await outro.esperar(EventosServidor.JOGADOR_EXPULSO_POR_INATIVIDADE);
        adm.limparHistorico();

        // A partida segue (bot no lugar dele), mas ele não vê mais nada.
        const parar = jogarSozinho(outro, salaId);
        t.after(() => parar());
        await outro.esperar(EventosServidor.APOSTA_FEITA, { timeoutMs: 15_000 });
        assert.deepEqual(adm.recebidos(EventosServidor.APOSTA_FEITA), []);
    });

    await t.test('a vaga continua reservada: dá pra voltar por reconectar', async () => {
        const { salaId, adm } = await partidaEmAndamento(servidor, { humanos: 2 });
        await adm.ok(EventosCliente.SAIR_DA_PARTIDA, { salaId });

        // Não é abandono definitivo — enquanto a vaga não expira, volta.
        const estado = await adm.ok(EventosCliente.RECONECTAR, { salaId });
        assert.equal(estado.salaId, salaId);
    });

    await t.test('SALA_NAO_INICIADA antes da partida começar', async () => {
        const cliente = await convidado(servidor);
        const { salaId } = await cliente.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4 });
        // Antes de começar o caminho é sairSala.
        await cliente.erro(EventosCliente.SAIR_DA_PARTIDA, { salaId }, CodigosErro.SALA_NAO_INICIADA);
    });

    await t.test('NAO_ESTA_NA_SALA por quem não faz parte da partida', async () => {
        const { salaId } = await partidaEmAndamento(servidor, { humanos: 2 });
        const forasteiro = await convidado(servidor);
        await forasteiro.erro(EventosCliente.SAIR_DA_PARTIDA, { salaId }, CodigosErro.NAO_ESTA_NA_SALA);
    });
});

test('desistir', async (t) => {
    const servidor = await subirServidor({ tempoTurnoMs: 10_000 });
    t.after(() => servidor.fechar());

    await t.test('avisa a sala e a vaga expira na hora', async () => {
        // O oposto de sairDaPartida: lá a vaga fica reservada, aqui acaba.
        const { salaId, clientes } = await partidaEmAndamento(servidor, { humanos: 2 });
        const [quemDesiste, testemunha] = clientes;

        await quemDesiste.ok(EventosCliente.DESISTIR, { salaId });

        const aviso = await testemunha.esperar(EventosServidor.JOGADOR_DESISTIU);
        assert.equal(aviso.salaId, salaId);
        assert.equal(aviso.jogador, quemDesiste.nome);

        // vagaExpirada sai logo atrás — sem esperar tempoReservaMs nenhum.
        const expirou = await testemunha.esperar(
            EventosServidor.VAGA_EXPIRADA,
            { filtro: dados => dados.jogador === quemDesiste.nome }
        );
        assert.equal(expirou.salaId, salaId);
    });

    await t.test('quem desistiu não consegue mais reconectar', async () => {
        const { salaId, clientes } = await partidaEmAndamento(servidor, { humanos: 2 });
        const [quemDesiste, testemunha] = clientes;

        await quemDesiste.ok(EventosCliente.DESISTIR, { salaId });
        await testemunha.esperar(EventosServidor.JOGADOR_DESISTIU);

        await quemDesiste.erro(EventosCliente.RECONECTAR, { salaId }, CodigosErro.VAGA_EXPIRADA);
        assert.equal((await quemDesiste.ok(EventosCliente.MINHA_SALA_ATIVA, {})).salaId, null);
    });

    await t.test('perde na hora: numa mesa de 2, o outro vence por W.O.', async () => {
        // hp vai a 0, então na virada de rodada sobra um vivo só.
        const { salaId, clientes } = await partidaEmAndamento(servidor, { humanos: 2 });
        const [quemDesiste, testemunha] = clientes;
        const parar = jogarSozinho(testemunha, salaId);
        t.after(() => parar());

        await quemDesiste.ok(EventosCliente.DESISTIR, { salaId });

        const fim = await testemunha.esperar(EventosServidor.JOGO_FINALIZADO, { timeoutMs: 30_000 });
        assert.equal(fim.vencedor, testemunha.nome);
    });

    await t.test('SALA_NAO_INICIADA antes da partida começar', async () => {
        const cliente = await convidado(servidor);
        const { salaId } = await cliente.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4 });
        await cliente.erro(EventosCliente.DESISTIR, { salaId }, CodigosErro.SALA_NAO_INICIADA);
    });

    await t.test('NAO_ESTA_NA_SALA por quem não faz parte da partida', async () => {
        const { salaId } = await partidaEmAndamento(servidor, { humanos: 1, botNumber: 1 });
        const forasteiro = await convidado(servidor);
        await forasteiro.erro(EventosCliente.DESISTIR, { salaId }, CodigosErro.NAO_ESTA_NA_SALA);
    });
});

test('timeout de turno', async (t) => {
    // tempoTurnoMs curto e limiteInatividadeMs ALTO: assim o timeout dispara
    // rápido mas ninguém é expulso — é o caso da falta isolada.
    const servidor = await subirServidor({ tempoTurnoMs: 120, limiteInatividadeMs: 60_000 });
    t.after(() => servidor.fechar());

    await t.test('o servidor aposta sozinho por quem não responde', async () => {
        const { salaId, clientes } = await partidaEmAndamento(servidor, { humanos: 2 });
        // Ninguém aposta: o servidor tem que resolver as duas apostas sozinho.
        const primeira = await clientes[0].esperar(EventosServidor.APOSTA_FEITA);
        assert.equal(primeira.salaId, salaId);
        assert.equal(typeof primeira.aposta, 'number');
    });

    await t.test('jogadaAutomatica avisa a sala quando o prazo estoura na carta', async () => {
        const { salaId, clientes } = await partidaEmAndamento(servidor, { humanos: 2 });
        // Deixando o tempo correr, a partida avança sozinha até as vazas.
        const automatica = await clientes[0].esperar(EventosServidor.JOGADA_AUTOMATICA, { timeoutMs: 20_000 });
        assert.equal(automatica.salaId, salaId);
        assert.ok(clientes.some(cliente => cliente.nome === automatica.jogador));
    });
});

test('expulsão por inatividade e vaga expirada', async (t) => {
    // Tudo encolhido: o primeiro timeout de turno já passa do limite de
    // inatividade, e a reserva expira logo depois.
    const servidor = await subirServidor({
        // tempoTurnoMs precisa ser curto (o teste espera o timeout acontecer)
        // mas folgado o bastante pro jogador ATIVO responder sempre dentro do
        // prazo — quem responde a todo turno nunca passa por _registrarTimeout,
        // então limiteInatividadeMs baixo não o alcança.
        tempoTurnoMs: 300,
        limiteInatividadeMs: 1,
        tempoReservaMs: 400,
    });
    t.after(() => servidor.fechar());

    await t.test('expulsa do socket da sala, mas o assento continua na partida', async () => {
        const { salaId, clientes } = await partidaEmAndamento(servidor, { humanos: 2 });
        const [a] = clientes;

        const expulsao = await a.esperar(EventosServidor.JOGADOR_EXPULSO_POR_INATIVIDADE, { timeoutMs: 15_000 });
        assert.equal(expulsao.salaId, salaId);

        const expulso = clientes.find(cliente => cliente.nome === expulsao.jogador);
        // A vaga ainda é dele — dá pra voltar enquanto não expira.
        const estado = await expulso.ok(EventosCliente.RECONECTAR, { salaId });
        assert.equal(estado.salaId, salaId);
    });

    // Um jogador ativo e um ausente. O ativo é indispensável como
    // TESTEMUNHA: quem é expulso tem o socket tirado da room na hora (ver
    // ligarControllerASala), então ele nunca veria o `vagaExpirada` que sai
    // depois — quem observa precisa ser alguém que continua na sala. E é
    // também o que mantém a sala viva: se ninguém real sobrasse, ela seria
    // descartada na mesma hora (ver GameController._expirarVaga).
    async function comUmAusente(contexto) {
        const sala = await partidaEmAndamento(servidor, { humanos: 2 });
        const ativo = sala.clientes[0];
        const ausente = sala.clientes[1];
        const parar = jogarSozinho(ativo, sala.salaId);
        contexto.after(() => parar());
        return { ...sala, ativo, ausente };
    }

    await t.test('VAGA_EXPIRADA depois de tempoReservaMs sem ninguém voltar', async (t2) => {
        const { salaId, ativo, ausente } = await comUmAusente(t2);

        const expiracao = await ativo.esperar(
            EventosServidor.VAGA_EXPIRADA,
            { filtro: dados => dados.jogador === ausente.nome, timeoutMs: 20_000 }
        );
        assert.equal(expiracao.salaId, salaId);

        await ausente.erro(EventosCliente.RECONECTAR, { salaId }, CodigosErro.VAGA_EXPIRADA);
    });

    await t.test('minhaSalaAtiva para de oferecer a sala de uma vaga expirada', async (t2) => {
        const { salaId, ativo, ausente } = await comUmAusente(t2);

        await ativo.esperar(
            EventosServidor.VAGA_EXPIRADA,
            { filtro: dados => dados.jogador === ausente.nome, timeoutMs: 20_000 }
        );

        const resposta = await ausente.ok(EventosCliente.MINHA_SALA_ATIVA, {});
        assert.notEqual(resposta.salaId, salaId);
    });
});
