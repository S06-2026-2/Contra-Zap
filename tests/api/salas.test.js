// Contrato do handshake de sala: criar, entrar, listar, sair, forçar início
// e partida rápida (conexao/PROTOCOLO.md). Cobre também os broadcasts que
// saem ANTES do ack (listaJogadores, partidaIniciandoEm) — é justamente o
// que o ack duplica no payload pra ninguém perder.
import test from 'node:test';
import assert from 'node:assert/strict';
import { subirServidor } from '../helpers/servidor.js';
import { convidado, convidados, nomeUnico, salaCheia, partidaEmAndamento } from '../helpers/protocolo.js';
import { EventosCliente, EventosServidor, CodigosErro } from '../../conexao/eventos.js';
import { MODELOS_BOT, MODELO_BOT_PADRAO } from '../../bots/modelosBot.js';

test('criarSala', async (t) => {
    const servidor = await subirServidor();
    t.after(() => servidor.fechar());

    await t.test('usa a config default quando não vem nada', async () => {
        const cliente = await convidado(servidor);
        const resposta = await cliente.ok(EventosCliente.CRIAR_SALA, {});

        assert.equal(typeof resposta.salaId, 'string');
        assert.equal(resposta.numberPlayers, 4);
        assert.equal(resposta.chatAberto, false);
        assert.equal(resposta.segundosParaIniciar, null);
        assert.deepEqual(resposta.jogadores.map(j => j.nome), [cliente.nome]);
    });

    await t.test('respeita a config passada', async () => {
        const cliente = await convidado(servidor);
        const resposta = await cliente.ok(EventosCliente.CRIAR_SALA, {
            numberPlayers: 3,
            roundStart: 2,
            randomShuffle: false,
            chatAberto: true,
        });

        assert.equal(resposta.numberPlayers, 3);
        assert.equal(resposta.chatAberto, true);
    });

    await t.test('o roster vem no próprio ack, não só no broadcast', async () => {
        // O listaJogadores desta sala sai DENTRO do handler, antes do ack —
        // um cliente que só assina o listener depois perderia o primeiro
        // broadcast pra sempre. Por isso o ack carrega o roster.
        const cliente = await convidado(servidor);
        const resposta = await cliente.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 2 });

        assert.equal(resposta.jogadores.length, 1);
        assert.equal(resposta.jogadores[0].nome, cliente.nome);
    });

    await t.test('quem cria também recebe o broadcast de listaJogadores', async () => {
        const cliente = await convidado(servidor);
        const { salaId } = await cliente.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 2 });

        const broadcast = await cliente.esperar(EventosServidor.LISTA_JOGADORES);
        assert.equal(broadcast.salaId, salaId);
        assert.deepEqual(broadcast.jogadores.map(j => j.nome), [cliente.nome]);
    });

    await t.test('salas diferentes recebem ids diferentes', async () => {
        const [a, b] = await convidados(servidor, 2);
        const primeira = await a.ok(EventosCliente.CRIAR_SALA, {});
        const segunda = await b.ok(EventosCliente.CRIAR_SALA, {});
        assert.notEqual(primeira.salaId, segunda.salaId);
    });

    await t.test('botNumber preenche os assentos na criação', async () => {
        const cliente = await convidado(servidor);
        const resposta = await cliente.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4, botNumber: 2 });

        assert.equal(resposta.jogadores.length, 3); // o dono + 2 bots
        assert.equal(resposta.segundosParaIniciar, null); // ainda falta 1 pra lotar
    });

    await t.test('botNumber que lota a sala já agenda o início no próprio ack', async () => {
        // O agendarInicio dispara de dentro do criarSala — o
        // partidaIniciandoEm sai antes do ack, então o "quantos segundos"
        // também precisa vir nele.
        const cliente = await convidado(servidor);
        const resposta = await cliente.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 2, botNumber: 1 });

        assert.equal(resposta.jogadores.length, 2);
        assert.equal(typeof resposta.segundosParaIniciar, 'number');

        const aviso = await cliente.esperar(EventosServidor.PARTIDA_INICIANDO_EM);
        assert.equal(aviso.segundos, resposta.segundosParaIniciar);
    });

    await t.test('CONFIGURACAO_INVALIDA nos limites de numberPlayers', async () => {
        const cliente = await convidado(servidor);
        for (const numberPlayers of [1, 7, 0, -1, 2.5, '4']) {
            await cliente.erro(
                EventosCliente.CRIAR_SALA,
                { numberPlayers },
                CodigosErro.CONFIGURACAO_INVALIDA
            );
        }
    });

    await t.test('null e undefined caem no default, não em erro', async () => {
        // Os campos de config são opcionais (`?? default` no SalaManager) —
        // mandar null é o mesmo que não mandar, e não pode virar erro.
        const cliente = await convidado(servidor);
        assert.equal((await cliente.ok(EventosCliente.CRIAR_SALA, { numberPlayers: null })).numberPlayers, 4);
        const outro = await convidado(servidor);
        assert.equal((await outro.ok(EventosCliente.CRIAR_SALA, { numberPlayers: undefined })).numberPlayers, 4);
    });

    await t.test('aceita as pontas válidas de numberPlayers (2 e 6)', async () => {
        const cliente = await convidado(servidor);
        assert.equal((await cliente.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 2 })).numberPlayers, 2);
        const outro = await convidado(servidor);
        assert.equal((await outro.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 6 })).numberPlayers, 6);
    });

    await t.test('CONFIGURACAO_INVALIDA com roundStart inválido', async () => {
        const cliente = await convidado(servidor);
        for (const roundStart of [0, -1, 1.5, 'tres']) {
            await cliente.erro(EventosCliente.CRIAR_SALA, { roundStart }, CodigosErro.CONFIGURACAO_INVALIDA);
        }
    });

    await t.test('CONFIGURACAO_INVALIDA com botNumber fora do intervalo', async () => {
        const cliente = await convidado(servidor);
        // Tem que sobrar pelo menos o assento de quem cria: máximo é numberPlayers - 1.
        await cliente.erro(
            EventosCliente.CRIAR_SALA,
            { numberPlayers: 4, botNumber: 4 },
            CodigosErro.CONFIGURACAO_INVALIDA
        );
        await cliente.erro(
            EventosCliente.CRIAR_SALA,
            { numberPlayers: 4, botNumber: -1 },
            CodigosErro.CONFIGURACAO_INVALIDA
        );
    });

    await t.test('CONFIGURACAO_INVALIDA com maxDeck fora do intervalo', async () => {
        // maxDeck = quantos baralhos de 40 cartas a partida pode montar.
        const cliente = await convidado(servidor);
        for (const maxDeck of [0, -1, 1.5, 'dois', 51]) {
            await cliente.erro(EventosCliente.CRIAR_SALA, { maxDeck }, CodigosErro.CONFIGURACAO_INVALIDA);
        }
    });

    await t.test('CONFIGURACAO_INVALIDA quando a 1ª rodada não cabe no maxDeck', async () => {
        // 6 jogadores x 10 cartas + vira = mais que 1 baralho de 40. Recusar
        // na criação evita uma partida que travaria sem cartas no meio.
        const cliente = await convidado(servidor);
        await cliente.erro(
            EventosCliente.CRIAR_SALA,
            { numberPlayers: 6, roundStart: 10, maxDeck: 1 },
            CodigosErro.CONFIGURACAO_INVALIDA
        );
    });

    await t.test('maxDeck suficiente é aceito', async () => {
        const cliente = await convidado(servidor);
        await cliente.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 6, roundStart: 10, maxDeck: 3 });
    });

    await t.test('CONFIGURACAO_INVALIDA com roundStart acima do teto', async () => {
        const cliente = await convidado(servidor);
        await cliente.erro(EventosCliente.CRIAR_SALA, { roundStart: 11 }, CodigosErro.CONFIGURACAO_INVALIDA);
    });

    await t.test('CONFIGURACAO_INVALIDA com chatAberto que não é boolean', async () => {
        const cliente = await convidado(servidor);
        await cliente.erro(EventosCliente.CRIAR_SALA, { chatAberto: 'sim' }, CodigosErro.CONFIGURACAO_INVALIDA);
        await cliente.erro(EventosCliente.CRIAR_SALA, { chatAberto: 1 }, CodigosErro.CONFIGURACAO_INVALIDA);
    });

    await t.test('modeloBot default é o clássico e vem no ack', async () => {
        const cliente = await convidado(servidor);
        const resposta = await cliente.ok(EventosCliente.CRIAR_SALA, {});
        assert.equal(resposta.modeloBot, MODELO_BOT_PADRAO);
        assert.equal(MODELO_BOT_PADRAO, 'classico');
    });

    await t.test('aceita todo modeloBot do catálogo', async () => {
        for (const { id } of MODELOS_BOT) {
            const cliente = await convidado(servidor);
            const resposta = await cliente.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 3, botNumber: 1, modeloBot: id });
            assert.equal(resposta.modeloBot, id);
        }
    });

    await t.test('CONFIGURACAO_INVALIDA com modeloBot fora do catálogo', async () => {
        const cliente = await convidado(servidor);
        for (const modeloBot of ['nao-existe', 'CAMPEAO', 3, true]) {
            await cliente.erro(EventosCliente.CRIAR_SALA, { modeloBot }, CodigosErro.CONFIGURACAO_INVALIDA);
        }
    });

    await t.test('config inválida não deixa sala órfã pra trás', async () => {
        const cliente = await convidado(servidor);
        const antes = (await cliente.ok(EventosCliente.LISTAR_SALAS)).salas.length;
        await cliente.erro(EventosCliente.CRIAR_SALA, { numberPlayers: 99 }, CodigosErro.CONFIGURACAO_INVALIDA);
        const depois = (await cliente.ok(EventosCliente.LISTAR_SALAS)).salas.length;
        assert.equal(depois, antes);
    });
});

test('entrarSala', async (t) => {
    const servidor = await subirServidor();
    t.after(() => servidor.fechar());

    await t.test('entra e devolve o mesmo formato de criarSala', async () => {
        const [dono, visitante] = await convidados(servidor, 2);
        const { salaId } = await dono.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4 });

        const resposta = await visitante.ok(EventosCliente.ENTRAR_SALA, { salaId });

        assert.equal(resposta.salaId, salaId);
        assert.equal(resposta.numberPlayers, 4);
        assert.equal(resposta.chatAberto, false);
        assert.equal(resposta.segundosParaIniciar, null);
        assert.deepEqual(resposta.jogadores.map(j => j.nome), [dono.nome, visitante.nome]);
    });

    await t.test('quem entra fica sabendo qual bot o dono escolheu', async () => {
        const [dono, visitante] = await convidados(servidor, 2);
        const { salaId } = await dono.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4, botNumber: 1, modeloBot: 'campeao' });

        const resposta = await visitante.ok(EventosCliente.ENTRAR_SALA, { salaId });
        assert.equal(resposta.modeloBot, 'campeao');
    });

    await t.test('todo mundo na sala recebe o roster atualizado', async () => {
        const [dono, visitante] = await convidados(servidor, 2);
        const { salaId } = await dono.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4 });
        dono.limparHistorico();

        await visitante.ok(EventosCliente.ENTRAR_SALA, { salaId });

        const paraODono = await dono.esperar(
            EventosServidor.LISTA_JOGADORES,
            { filtro: dados => dados.jogadores.length === 2 }
        );
        assert.deepEqual(paraODono.jogadores.map(j => j.nome), [dono.nome, visitante.nome]);
    });

    await t.test('a entrada que lota a sala agenda o início e avisa no ack', async () => {
        const [dono, ultimo] = await convidados(servidor, 2);
        const { salaId } = await dono.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 2 });

        const resposta = await ultimo.ok(EventosCliente.ENTRAR_SALA, { salaId });

        assert.equal(typeof resposta.segundosParaIniciar, 'number');
        // E o broadcast chega pra quem já estava na sala.
        const aviso = await dono.esperar(EventosServidor.PARTIDA_INICIANDO_EM);
        assert.equal(aviso.salaId, salaId);
    });

    await t.test('SALA_NAO_ENCONTRADA com salaId inexistente', async () => {
        const cliente = await convidado(servidor);
        await cliente.erro(EventosCliente.ENTRAR_SALA, { salaId: 'NAOEXISTE' }, CodigosErro.SALA_NAO_ENCONTRADA);
    });

    await t.test('SALA_NAO_ENCONTRADA com salaId ausente', async () => {
        const cliente = await convidado(servidor);
        await cliente.erro(EventosCliente.ENTRAR_SALA, {}, CodigosErro.SALA_NAO_ENCONTRADA);
    });

    await t.test('JA_ESTA_NA_SALA quando o mesmo jogador entra de novo', async () => {
        const cliente = await convidado(servidor);
        const { salaId } = await cliente.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4 });
        await cliente.erro(EventosCliente.ENTRAR_SALA, { salaId }, CodigosErro.JA_ESTA_NA_SALA);
    });

    await t.test('SALA_CHEIA quando não sobra assento', async () => {
        const { salaId } = await salaCheia(servidor, { humanos: 2 });
        const atrasado = await convidado(servidor);
        await atrasado.erro(EventosCliente.ENTRAR_SALA, { salaId }, CodigosErro.SALA_CHEIA);
    });

    await t.test('NOME_INVALIDO com nome já em uso na sala', async () => {
        // Dois convidados podem ter o mesmo nome (ids diferentes, nada no
        // banco) — a sala é que não aceita homônimos.
        const nome = nomeUnico('xara');
        const dono = await convidado(servidor, nome);
        const xara = await convidado(servidor, nome);

        const { salaId } = await dono.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4 });
        await xara.erro(EventosCliente.ENTRAR_SALA, { salaId }, CodigosErro.NOME_INVALIDO);
    });

    await t.test('SALA_JA_INICIADA depois que a partida começou', async () => {
        const { salaId } = await partidaEmAndamento(servidor, { humanos: 1, botNumber: 1 });
        const atrasado = await convidado(servidor);
        await atrasado.erro(EventosCliente.ENTRAR_SALA, { salaId }, CodigosErro.SALA_JA_INICIADA);
    });
});

test('listarSalas', async (t) => {
    const servidor = await subirServidor();
    t.after(() => servidor.fechar());

    await t.test('lista a sala aberta com o resumo enxuto', async () => {
        const dono = await convidado(servidor);
        const { salaId } = await dono.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4, chatAberto: true, modeloBot: 'veterano' });

        const { salas } = await dono.ok(EventosCliente.LISTAR_SALAS);
        const minha = salas.find(sala => sala.salaId === salaId);

        assert.ok(minha, 'a sala recém-criada devia aparecer na listagem');
        assert.deepEqual(Object.keys(minha).sort(), ['chatAberto', 'jogadoresAtual', 'modeloBot', 'numberPlayers', 'privada', 'salaId']);
        assert.equal(minha.modeloBot, 'veterano');
        assert.equal(minha.jogadoresAtual, 1);
        assert.equal(minha.numberPlayers, 4);
        assert.equal(minha.chatAberto, true);
        assert.equal(minha.privada, false);
    });

    await t.test('não expõe o controller nem os objetos Player', async () => {
        const dono = await convidado(servidor);
        await dono.ok(EventosCliente.CRIAR_SALA, {});
        const { salas } = await dono.ok(EventosCliente.LISTAR_SALAS);

        for (const sala of salas) {
            assert.equal(sala.controller, undefined);
            assert.equal(sala.jogadores, undefined);
        }
    });

    await t.test('esconde sala cheia', async () => {
        const { salaId } = await salaCheia(servidor, { humanos: 2 });
        const observador = await convidado(servidor);

        const { salas } = await observador.ok(EventosCliente.LISTAR_SALAS);
        assert.equal(salas.find(sala => sala.salaId === salaId), undefined);
    });

    await t.test('esconde sala com partida já iniciada', async () => {
        const { salaId } = await partidaEmAndamento(servidor, { humanos: 1, botNumber: 1 });
        const observador = await convidado(servidor);

        const { salas } = await observador.ok(EventosCliente.LISTAR_SALAS);
        assert.equal(salas.find(sala => sala.salaId === salaId), undefined);
    });
});

test('sairSala', async (t) => {
    const servidor = await subirServidor();
    t.after(() => servidor.fechar());

    await t.test('sai e o roster atualizado chega pra quem ficou', async () => {
        const [dono, visitante] = await convidados(servidor, 2);
        const { salaId } = await dono.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4 });
        await visitante.ok(EventosCliente.ENTRAR_SALA, { salaId });
        dono.limparHistorico();

        await visitante.ok(EventosCliente.SAIR_SALA, { salaId });

        const roster = await dono.esperar(
            EventosServidor.LISTA_JOGADORES,
            { filtro: dados => dados.jogadores.length === 1 }
        );
        assert.deepEqual(roster.jogadores.map(j => j.nome), [dono.nome]);
    });

    await t.test('quem saiu para de receber os eventos da sala', async () => {
        const [dono, visitante] = await convidados(servidor, 3).then(([a, b]) => [a, b]);
        const { salaId } = await dono.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4 });
        await visitante.ok(EventosCliente.ENTRAR_SALA, { salaId });
        await visitante.ok(EventosCliente.SAIR_SALA, { salaId });
        visitante.limparHistorico();

        // Movimento novo na sala: quem saiu não pode mais ver.
        const terceiro = await convidado(servidor);
        await terceiro.ok(EventosCliente.ENTRAR_SALA, { salaId });
        await dono.esperar(EventosServidor.LISTA_JOGADORES, { filtro: d => d.jogadores.length === 2 });

        assert.deepEqual(visitante.recebidos(EventosServidor.LISTA_JOGADORES), []);
    });

    await t.test('a sala é descartada quando fica vazia', async () => {
        const dono = await convidado(servidor);
        const { salaId } = await dono.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4 });
        await dono.ok(EventosCliente.SAIR_SALA, { salaId });

        const { salas } = await dono.ok(EventosCliente.LISTAR_SALAS);
        assert.equal(salas.find(sala => sala.salaId === salaId), undefined);
        // E de verdade: entrar nela agora é como se nunca tivesse existido.
        await dono.erro(EventosCliente.ENTRAR_SALA, { salaId }, CodigosErro.SALA_NAO_ENCONTRADA);
    });

    await t.test('o posto de adm passa pro próximo quando o adm sai', async () => {
        const [dono, segundo] = await convidados(servidor, 2);
        const { salaId } = await dono.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 2 });
        await segundo.ok(EventosCliente.ENTRAR_SALA, { salaId });

        await dono.ok(EventosCliente.SAIR_SALA, { salaId });

        // Prova pelo protocolo: só o adm consegue forçar início. Com a sala
        // cheia de novo, quem herdou o posto tem que conseguir.
        const terceiro = await convidado(servidor);
        await terceiro.ok(EventosCliente.ENTRAR_SALA, { salaId });
        await segundo.ok(EventosCliente.FORCAR_INICIO, { salaId });
    });

    await t.test('sair cancela o início agendado', async () => {
        const [dono, ultimo] = await convidados(servidor, 2);
        const { salaId } = await dono.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 2 });
        const { segundosParaIniciar } = await ultimo.ok(EventosCliente.ENTRAR_SALA, { salaId });
        assert.equal(typeof segundosParaIniciar, 'number');

        await ultimo.ok(EventosCliente.SAIR_SALA, { salaId });

        // Sala deixou de estar cheia: forçar início agora tem que recusar.
        await dono.erro(EventosCliente.FORCAR_INICIO, { salaId }, CodigosErro.SALA_NAO_CHEIA);
    });

    await t.test('NAO_ESTA_NA_SALA por quem não está nela', async () => {
        const dono = await convidado(servidor);
        const { salaId } = await dono.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4 });

        const forasteiro = await convidado(servidor);
        await forasteiro.erro(EventosCliente.SAIR_SALA, { salaId }, CodigosErro.NAO_ESTA_NA_SALA);
    });

    await t.test('SALA_NAO_ENCONTRADA com salaId inexistente', async () => {
        const cliente = await convidado(servidor);
        await cliente.erro(EventosCliente.SAIR_SALA, { salaId: 'NAOEXISTE' }, CodigosErro.SALA_NAO_ENCONTRADA);
    });

    await t.test('SALA_JA_INICIADA depois da partida começar', async () => {
        const { salaId, adm } = await partidaEmAndamento(servidor, { humanos: 1, botNumber: 1 });
        // Depois de começar, o caminho é sairDaPartida — não sairSala.
        await adm.erro(EventosCliente.SAIR_SALA, { salaId }, CodigosErro.SALA_JA_INICIADA);
    });
});

test('forcarInicio', async (t) => {
    const servidor = await subirServidor();
    t.after(() => servidor.fechar());

    await t.test('o adm começa a partida na hora', async () => {
        const { salaId, adm, clientes } = await salaCheia(servidor, { humanos: 2 });

        await adm.ok(EventosCliente.FORCAR_INICIO, { salaId });

        for (const cliente of clientes) {
            const rodada = await cliente.esperar(EventosServidor.NOVA_RODADA_INICIADA);
            assert.equal(rodada.salaId, salaId);
            assert.equal(rodada.numero, 1);
            assert.equal(rodada.cartas, 1); // roundStart default
        }
    });

    await t.test('SALA_NAO_CHEIA antes de lotar', async () => {
        const dono = await convidado(servidor);
        const { salaId } = await dono.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4 });
        await dono.erro(EventosCliente.FORCAR_INICIO, { salaId }, CodigosErro.SALA_NAO_CHEIA);
    });

    await t.test('NAO_AUTORIZADO por quem não é o adm', async () => {
        const { salaId, clientes } = await salaCheia(servidor, { humanos: 2 });
        const naoAdm = clientes[1];
        await naoAdm.erro(EventosCliente.FORCAR_INICIO, { salaId }, CodigosErro.NAO_AUTORIZADO);
    });

    await t.test('SALA_JA_INICIADA na segunda chamada', async () => {
        const { salaId, adm } = await partidaEmAndamento(servidor, { humanos: 2 });
        await adm.erro(EventosCliente.FORCAR_INICIO, { salaId }, CodigosErro.SALA_JA_INICIADA);
    });

    await t.test('SALA_NAO_ENCONTRADA com salaId inexistente', async () => {
        const cliente = await convidado(servidor);
        await cliente.erro(EventosCliente.FORCAR_INICIO, { salaId: 'NAOEXISTE' }, CodigosErro.SALA_NAO_ENCONTRADA);
    });
});

// A fila da partida rápida é estado do SalaManager (salaFilaRapidaId), e
// portanto compartilhada por todo o servidor. Cada subteste sobe o seu pra
// não herdar a sala aberta que o anterior deixou pra trás — é o mesmo motivo
// pelo qual a fila existe: quem chama depois entra onde já tem gente.
test('partidaRapida', async (t) => {
    await t.test('o primeiro a chamar cria uma sala com a config default', async (t2) => {
        const servidor = await subirServidor();
        t2.after(() => servidor.fechar());
        const cliente = await convidado(servidor);
        const resposta = await cliente.ok(EventosCliente.PARTIDA_RAPIDA, {});

        assert.equal(typeof resposta.salaId, 'string');
        assert.equal(resposta.numberPlayers, 4);
        assert.equal(resposta.chatAberto, false);
        assert.deepEqual(resposta.jogadores.map(j => j.nome), [cliente.nome]);
    });

    await t.test('quem chama depois cai na MESMA sala, sem saber o salaId', async (t2) => {
        const servidor = await subirServidor();
        t2.after(() => servidor.fechar());
        const [primeiro, segundo] = await convidados(servidor, 2);
        const um = await primeiro.ok(EventosCliente.PARTIDA_RAPIDA, {});
        const dois = await segundo.ok(EventosCliente.PARTIDA_RAPIDA, {});

        assert.equal(dois.salaId, um.salaId);
        assert.equal(dois.jogadores.length, 2);
    });

    await t.test('quando a sala da fila lota, a próxima chamada abre outra', async (t2) => {
        const servidor = await subirServidor();
        t2.after(() => servidor.fechar());
        const quatro = await convidados(servidor, 4);
        const respostas = [];
        for (const cliente of quatro) {
            respostas.push(await cliente.ok(EventosCliente.PARTIDA_RAPIDA, {}));
        }

        const salaDaFila = respostas[0].salaId;
        assert.ok(respostas.every(r => r.salaId === salaDaFila), 'os 4 primeiros deviam cair na mesma sala');
        // A quarta entrada lotou a sala (4 jogadores) e agendou o início.
        assert.equal(typeof respostas[3].segundosParaIniciar, 'number');

        const quinto = await convidado(servidor);
        const nova = await quinto.ok(EventosCliente.PARTIDA_RAPIDA, {});
        assert.notEqual(nova.salaId, salaDaFila);
        assert.equal(nova.jogadores.length, 1);
    });

    await t.test('quem entra pela fila recebe os broadcasts da sala', async (t2) => {
        const servidor = await subirServidor();
        t2.after(() => servidor.fechar());
        const [primeiro, segundo] = await convidados(servidor, 2);
        await primeiro.ok(EventosCliente.PARTIDA_RAPIDA, {});
        primeiro.limparHistorico();

        await segundo.ok(EventosCliente.PARTIDA_RAPIDA, {});

        const roster = await primeiro.esperar(
            EventosServidor.LISTA_JOGADORES,
            { filtro: dados => dados.jogadores.length === 2 }
        );
        assert.deepEqual(roster.jogadores.map(j => j.nome), [primeiro.nome, segundo.nome]);
    });
});
