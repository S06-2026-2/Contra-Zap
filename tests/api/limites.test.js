// Contrato das travas que a camada de conexão ganhou depois da primeira
// versão da suíte: tetos de tamanho de nome/senha (conexao/limites.js),
// rate limit por IP (conexao/rateLimiter.js), guarda contra troca de
// identidade no mesmo socket, e os tetos de sala por jogador.
//
// Estes testes existem separados de autenticacao/salas de propósito: são as
// únicas partes da suíte que precisam de tetos APERTADOS, e um teto baixo
// vazando pros outros arquivos faria eles falharem por MUITAS_TENTATIVAS em
// vez do código que estão testando (ver LIMITES_DE_TAXA_DE_TESTE em
// tests/helpers/servidor.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { subirServidor } from '../helpers/servidor.js';
import { USUARIO_SEMEADO } from '../helpers/ambiente.js';
import { convidado, convidados, nomeUnico, partidaEmAndamento } from '../helpers/protocolo.js';
import { EventosCliente, CodigosErro } from '../../conexao/eventos.js';
import { NOME_MIN, NOME_MAX, SENHA_MIN, SENHA_MAX } from '../../conexao/limites.js';

test('tetos de tamanho de nome e senha', async (t) => {
    const servidor = await subirServidor();
    t.after(() => servidor.fechar());

    await t.test(`cadastrar aceita nome de ${NOME_MIN} e de ${NOME_MAX} caracteres`, async () => {
        // As duas pontas exatas do intervalo — é onde um `<` no lugar de um
        // `<=` se esconde.
        const curto = await convidado(servidor).then(() => servidor.conectar());
        await curto.ok(EventosCliente.CADASTRAR, { nome: 'a'.repeat(NOME_MIN), senha: 'senha-valida' });

        const longo = await servidor.conectar();
        await longo.ok(EventosCliente.CADASTRAR, { nome: 'b'.repeat(NOME_MAX), senha: 'senha-valida' });
    });

    await t.test(`cadastrar recusa nome de ${NOME_MAX + 1} caracteres`, async () => {
        const cliente = await servidor.conectar();
        await cliente.erro(
            EventosCliente.CADASTRAR,
            { nome: 'c'.repeat(NOME_MAX + 1), senha: 'senha-valida' },
            CodigosErro.CADASTRO_INVALIDO
        );
    });

    await t.test(`cadastrar exige senha com pelo menos ${SENHA_MIN} caracteres`, async () => {
        const cliente = await servidor.conectar();
        await cliente.erro(
            EventosCliente.CADASTRAR,
            { nome: nomeUnico('senhacurta'), senha: 'a'.repeat(SENHA_MIN - 1) },
            CodigosErro.CADASTRO_INVALIDO
        );
        await cliente.ok(EventosCliente.CADASTRAR, { nome: nomeUnico('senhaok'), senha: 'a'.repeat(SENHA_MIN) });
    });

    await t.test(`cadastrar recusa senha acima de ${SENHA_MAX} caracteres`, async () => {
        // bcrypt ignora além de 72 bytes em silêncio — o teto existe pra isso
        // não virar "senha aceita mas truncada".
        const cliente = await servidor.conectar();
        await cliente.erro(
            EventosCliente.CADASTRAR,
            { nome: nomeUnico('senhalonga'), senha: 'a'.repeat(SENHA_MAX + 1) },
            CodigosErro.CADASTRO_INVALIDO
        );
    });

    await t.test('conta antiga com senha curta continua entrando', async () => {
        // banco.json tem senha "123", abaixo do mínimo de cadastro atual.
        // Mudar a régua não pode invalidar quem já tem conta: login() só
        // aplica o máximo, nunca o mínimo.
        assert.ok(USUARIO_SEMEADO.senha.length < SENHA_MIN, 'a fixture deveria ter senha menor que o mínimo atual');
        const cliente = await servidor.conectar();
        await cliente.ok(EventosCliente.ENTRAR, USUARIO_SEMEADO);
    });

    await t.test('entrar com nome/senha gigantes é recusado sem tocar o banco', async () => {
        const cliente = await servidor.conectar();
        await cliente.erro(
            EventosCliente.ENTRAR,
            { nome: 'd'.repeat(NOME_MAX + 1), senha: 'qualquer' },
            CodigosErro.USUARIO_NAO_ENCONTRADO
        );
    });

    await t.test('convidado também respeita o teto de nome', async () => {
        const cliente = await servidor.conectar();
        await cliente.erro(
            EventosCliente.ENTRAR_COMO_CONVIDADO,
            { nome: 'e'.repeat(NOME_MAX + 1) },
            CodigosErro.CONVIDADO_INVALIDO
        );
    });
});

test('rate limit por IP', async (t) => {
    await t.test('verificarNome corta depois do teto', async (t2) => {
        const servidor = await subirServidor({}, { verificarNomeMax: 3 });
        t2.after(() => servidor.fechar());

        const cliente = await servidor.conectar();
        for (let i = 0; i < 3; i++) {
            await cliente.ok(EventosCliente.VERIFICAR_NOME, { nome: nomeUnico() });
        }
        await cliente.erro(EventosCliente.VERIFICAR_NOME, { nome: nomeUnico() }, CodigosErro.MUITAS_TENTATIVAS);
    });

    await t.test('o teto é por IP, não por socket — reconectar não zera', async (t2) => {
        // É a razão de existir do limite: socket é de graça, IP não.
        const servidor = await subirServidor({}, { verificarNomeMax: 2 });
        t2.after(() => servidor.fechar());

        const primeiro = await servidor.conectar();
        await primeiro.ok(EventosCliente.VERIFICAR_NOME, { nome: nomeUnico() });
        await primeiro.ok(EventosCliente.VERIFICAR_NOME, { nome: nomeUnico() });

        const socketNovo = await servidor.conectar();
        await socketNovo.erro(EventosCliente.VERIFICAR_NOME, { nome: nomeUnico() }, CodigosErro.MUITAS_TENTATIVAS);
    });

    await t.test('só login que FALHA gasta a cota', async (t2) => {
        const servidor = await subirServidor({}, { entrarMax: 3 });
        t2.after(() => servidor.fechar());

        const cliente = await servidor.conectar();
        // Três logins certos não consomem nada...
        for (let i = 0; i < 3; i++) {
            const socket = await servidor.conectar();
            await socket.ok(EventosCliente.ENTRAR, USUARIO_SEMEADO);
        }
        // ...então as três falhas ainda cabem inteiras.
        for (let i = 0; i < 3; i++) {
            await cliente.erro(
                EventosCliente.ENTRAR,
                { nome: USUARIO_SEMEADO.nome, senha: 'errada' },
                CodigosErro.SENHA_INCORRETA
            );
        }
        await cliente.erro(
            EventosCliente.ENTRAR,
            { nome: USUARIO_SEMEADO.nome, senha: 'errada' },
            CodigosErro.MUITAS_TENTATIVAS
        );
    });

    await t.test('cadastrar conta toda tentativa, inclusive a que deu certo', async (t2) => {
        // Diferente de `entrar`: cada cadastro custa um hash de bcrypt de
        // verdade, mesmo quando falha por nome duplicado.
        const servidor = await subirServidor({}, { cadastrarMax: 2 });
        t2.after(() => servidor.fechar());

        const cliente = await servidor.conectar();
        await cliente.ok(EventosCliente.CADASTRAR, { nome: nomeUnico('c1'), senha: 'senha-valida' });

        const outro = await servidor.conectar();
        await outro.ok(EventosCliente.CADASTRAR, { nome: nomeUnico('c2'), senha: 'senha-valida' });

        const terceiro = await servidor.conectar();
        await terceiro.erro(
            EventosCliente.CADASTRAR,
            { nome: nomeUnico('c3'), senha: 'senha-valida' },
            CodigosErro.MUITAS_TENTATIVAS
        );
    });
});

test('troca de identidade no mesmo socket', async (t) => {
    const servidor = await subirServidor();
    t.after(() => servidor.fechar());

    await t.test('JA_AUTENTICADO ao virar outra conta na mesma conexão', async () => {
        // Sem esta trava dava pra ter duas identidades no mesmo socket e
        // sentar nos dois assentos da mesma mesa, vendo as duas mãos.
        const cliente = await convidado(servidor);
        await cliente.erro(
            EventosCliente.ENTRAR,
            USUARIO_SEMEADO,
            CodigosErro.JA_AUTENTICADO
        );
        await cliente.erro(
            EventosCliente.ENTRAR_COMO_CONVIDADO,
            { nome: nomeUnico('outro') },
            CodigosErro.JA_AUTENTICADO
        );
    });

    await t.test('reautenticar como a MESMA conta continua valendo', async () => {
        // É o que o StrictMode do React faz em desenvolvimento: dois
        // retomarSessao pro mesmo token, no mesmo socket.
        const cliente = await convidado(servidor);
        const resposta = await cliente.ok(EventosCliente.RETOMAR_SESSAO, { token: cliente.token });
        assert.equal(resposta.nome, cliente.nome);
        await cliente.ok(EventosCliente.RETOMAR_SESSAO, { token: resposta.token });
    });
});

test('um jogador, uma partida', async (t) => {
    const servidor = await subirServidor({ tempoTurnoMs: 10_000 });
    t.after(() => servidor.fechar());

    await t.test('JA_EM_PARTIDA barra criar/entrar/partida rápida, e diz onde ele está', async () => {
        const { salaId, adm } = await partidaEmAndamento(servidor, { humanos: 1, botNumber: 1 });

        for (const [evento, payload] of [
            [EventosCliente.CRIAR_SALA, { numberPlayers: 2 }],
            [EventosCliente.PARTIDA_RAPIDA, {}],
        ]) {
            const resposta = await adm.erro(evento, payload, CodigosErro.JA_EM_PARTIDA);
            // O erro carrega o salaId da partida antiga — é o que deixa a
            // Lobby oferecer "reconectar nela" ou "desistir dela".
            assert.equal(resposta.salaId, salaId);
        }
    });

    await t.test('depois de desistir, dá pra entrar em outra partida', async () => {
        const { salaId, adm } = await partidaEmAndamento(servidor, { humanos: 1, botNumber: 1 });
        await adm.erro(EventosCliente.CRIAR_SALA, { numberPlayers: 2 }, CodigosErro.JA_EM_PARTIDA);

        await adm.ok(EventosCliente.DESISTIR, { salaId });

        // A vaga expirou na hora: a sala antiga não conta mais contra ele.
        assert.equal((await adm.ok(EventosCliente.MINHA_SALA_ATIVA, {})).salaId, null);
        await adm.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 2 });
    });

    await t.test('sairDaPartida NÃO libera — a vaga continua reservada', async () => {
        // A diferença que justifica os dois eventos existirem.
        const { salaId, adm } = await partidaEmAndamento(servidor, { humanos: 1, botNumber: 1 });
        await adm.ok(EventosCliente.SAIR_DA_PARTIDA, { salaId });

        const resposta = await adm.erro(EventosCliente.CRIAR_SALA, { numberPlayers: 2 }, CodigosErro.JA_EM_PARTIDA);
        assert.equal(resposta.salaId, salaId);
    });
});

test('teto de salas por jogador', async (t) => {
    await t.test('LIMITE_DE_SALAS_POR_JOGADOR ao passar do teto como adm', async (t2) => {
        const servidor = await subirServidor({ maxSalasPorJogador: 2 });
        t2.after(() => servidor.fechar());

        const cliente = await convidado(servidor);
        await cliente.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4 });
        await cliente.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4 });

        await cliente.erro(
            EventosCliente.CRIAR_SALA,
            { numberPlayers: 4 },
            CodigosErro.LIMITE_DE_SALAS_POR_JOGADOR
        );
    });

    await t.test('sair de uma sala devolve a vaga do teto', async (t2) => {
        const servidor = await subirServidor({ maxSalasPorJogador: 1 });
        t2.after(() => servidor.fechar());

        const cliente = await convidado(servidor);
        const { salaId } = await cliente.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4 });
        await cliente.erro(EventosCliente.CRIAR_SALA, {}, CodigosErro.LIMITE_DE_SALAS_POR_JOGADOR);

        await cliente.ok(EventosCliente.SAIR_SALA, { salaId });
        await cliente.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4 });
    });

    await t.test('o teto é por jogador — não atrapalha os outros', async (t2) => {
        const servidor = await subirServidor({ maxSalasPorJogador: 1 });
        t2.after(() => servidor.fechar());

        const [a, b] = await convidados(servidor, 2);
        await a.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4 });
        await b.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4 });
    });
});
