// Contrato dos eventos de identidade: verificarNome, entrar, cadastrar,
// entrarComoConvidado e retomarSessao (conexao/PROTOCOLO.md).
// Os quatro últimos são intercambiáveis de propósito — todos devolvem
// { ok, nome, token } e deixam o socket autenticado do mesmo jeito. Vários
// testes aqui existem só pra travar essa equivalência.
import test from 'node:test';
import assert from 'node:assert/strict';
import { subirServidor } from '../helpers/servidor.js';
import { USUARIO_SEMEADO } from '../helpers/ambiente.js';
import { nomeUnico } from '../helpers/protocolo.js';
import { EventosCliente, CodigosErro } from '../../conexao/eventos.js';

test('verificarNome', async (t) => {
    const servidor = await subirServidor();
    t.after(() => servidor.fechar());

    await t.test('diz que existe pra uma conta do banco', async () => {
        const cliente = await servidor.conectar();
        const resposta = await cliente.ok(EventosCliente.VERIFICAR_NOME, { nome: USUARIO_SEMEADO.nome });
        assert.equal(resposta.existe, true);
    });

    await t.test('diz que não existe pra nome nunca cadastrado', async () => {
        const cliente = await servidor.conectar();
        const resposta = await cliente.ok(EventosCliente.VERIFICAR_NOME, { nome: nomeUnico() });
        assert.equal(resposta.existe, false);
    });

    await t.test('ignora espaços nas pontas', async () => {
        const cliente = await servidor.conectar();
        const resposta = await cliente.ok(EventosCliente.VERIFICAR_NOME, { nome: `  ${USUARIO_SEMEADO.nome}  ` });
        assert.equal(resposta.existe, true);
    });

    await t.test('nome ausente ou de outro tipo não é erro, é existe:false', async () => {
        // Documentado no PROTOCOLO: este evento não tem código de erro nenhum.
        const cliente = await servidor.conectar();
        assert.equal((await cliente.ok(EventosCliente.VERIFICAR_NOME, {})).existe, false);
        assert.equal((await cliente.ok(EventosCliente.VERIFICAR_NOME, { nome: 42 })).existe, false);
        assert.equal((await cliente.ok(EventosCliente.VERIFICAR_NOME, { nome: null })).existe, false);
    });

    await t.test('funciona sem autenticação — é pré-login', async () => {
        const cliente = await servidor.conectar();
        // Sem nenhum entrar antes: não pode devolver NAO_IDENTIFICADO.
        await cliente.ok(EventosCliente.VERIFICAR_NOME, { nome: USUARIO_SEMEADO.nome });
    });
});

test('entrar', async (t) => {
    const servidor = await subirServidor();
    t.after(() => servidor.fechar());

    await t.test('autentica com nome e senha corretos', async () => {
        const cliente = await servidor.conectar();
        const resposta = await cliente.ok(EventosCliente.ENTRAR, USUARIO_SEMEADO);

        assert.equal(resposta.nome, USUARIO_SEMEADO.nome);
        assert.equal(typeof resposta.token, 'string');
        // JWT: header.payload.assinatura
        assert.equal(resposta.token.split('.').length, 3);
        // A senha nunca pode voltar no ack, nem em hash.
        assert.equal(resposta.senha, undefined);
        assert.equal(resposta.senha_hash, undefined);
    });

    await t.test('deixa o socket identificado pro resto da conexão', async () => {
        const cliente = await servidor.conectar();
        await cliente.ok(EventosCliente.ENTRAR, USUARIO_SEMEADO);
        // Se não estivesse autenticado, isto seria NAO_IDENTIFICADO.
        await cliente.ok(EventosCliente.LISTAR_SALAS);
    });

    await t.test('USUARIO_NAO_ENCONTRADO com nome que não existe', async () => {
        const cliente = await servidor.conectar();
        await cliente.erro(
            EventosCliente.ENTRAR,
            { nome: nomeUnico(), senha: '123' },
            CodigosErro.USUARIO_NAO_ENCONTRADO
        );
    });

    await t.test('SENHA_INCORRETA com nome certo e senha errada', async () => {
        const cliente = await servidor.conectar();
        await cliente.erro(
            EventosCliente.ENTRAR,
            { nome: USUARIO_SEMEADO.nome, senha: 'senha-errada' },
            CodigosErro.SENHA_INCORRETA
        );
    });

    await t.test('não vaza a existência da conta pela mensagem de erro', async () => {
        // Códigos diferentes pros dois casos é decisão consciente do
        // protocolo (o front usa isso no login em etapas). O que este teste
        // trava é que a MENSAGEM não devolva a senha de volta pro cliente.
        const cliente = await servidor.conectar();
        const resposta = await cliente.erro(EventosCliente.ENTRAR, { nome: USUARIO_SEMEADO.nome, senha: 'xyz-secreta' });
        assert.ok(!resposta.mensagem.includes('xyz-secreta'), `mensagem vazou a senha: ${resposta.mensagem}`);
    });

    await t.test('payload vazio não derruba o handler', async () => {
        const cliente = await servidor.conectar();
        const resposta = await cliente.emitir(EventosCliente.ENTRAR, {});
        assert.equal(resposta.ok, false);
        // O que importa: virou erro de domínio tratado, não ERRO_INTERNO.
        assert.notEqual(resposta.codigo, CodigosErro.ERRO_INTERNO);
    });
});

test('cadastrar', async (t) => {
    const servidor = await subirServidor();
    t.after(() => servidor.fechar());

    await t.test('cria a conta e já devolve sessão', async () => {
        const cliente = await servidor.conectar();
        const nome = nomeUnico('novo');
        const resposta = await cliente.ok(EventosCliente.CADASTRAR, { nome, senha: 'senha123' });

        assert.equal(resposta.nome, nome);
        assert.equal(typeof resposta.token, 'string');
    });

    await t.test('a conta nasce autenticada, sem precisar de entrar depois', async () => {
        const cliente = await servidor.conectar();
        await cliente.ok(EventosCliente.CADASTRAR, { nome: nomeUnico('novo'), senha: 'senha123' });
        await cliente.ok(EventosCliente.LISTAR_SALAS);
    });

    await t.test('a conta criada passa a existir para verificarNome e entrar', async () => {
        const nome = nomeUnico('novo');
        const senha = 'senha123';

        const criador = await servidor.conectar();
        await criador.ok(EventosCliente.CADASTRAR, { nome, senha });

        const outro = await servidor.conectar();
        assert.equal((await outro.ok(EventosCliente.VERIFICAR_NOME, { nome })).existe, true);
        await outro.ok(EventosCliente.ENTRAR, { nome, senha });
    });

    await t.test('CADASTRO_INVALIDO com nome curto demais', async () => {
        const cliente = await servidor.conectar();
        await cliente.erro(EventosCliente.CADASTRAR, { nome: 'ab', senha: 'senha123' }, CodigosErro.CADASTRO_INVALIDO);
    });

    await t.test('CADASTRO_INVALIDO com senha curta demais', async () => {
        const cliente = await servidor.conectar();
        await cliente.erro(EventosCliente.CADASTRAR, { nome: nomeUnico(), senha: 'ab' }, CodigosErro.CADASTRO_INVALIDO);
    });

    await t.test('o mínimo de nome é medido depois do trim', async () => {
        const cliente = await servidor.conectar();
        // '  ab  ' tem 6 caracteres, mas 'ab' depois do trim — tem que recusar.
        await cliente.erro(EventosCliente.CADASTRAR, { nome: '  ab  ', senha: 'senha123' }, CodigosErro.CADASTRO_INVALIDO);
    });

    await t.test('grava o nome já com trim', async () => {
        const nome = nomeUnico('espacado');
        const cliente = await servidor.conectar();
        const resposta = await cliente.ok(EventosCliente.CADASTRAR, { nome: `  ${nome}  `, senha: 'senha123' });
        assert.equal(resposta.nome, nome);
    });

    await t.test('NOME_JA_CADASTRADO quando o nome já existe', async () => {
        const nome = nomeUnico('duplicado');
        const primeiro = await servidor.conectar();
        await primeiro.ok(EventosCliente.CADASTRAR, { nome, senha: 'senha123' });

        const segundo = await servidor.conectar();
        await segundo.erro(EventosCliente.CADASTRAR, { nome, senha: 'outra456' }, CodigosErro.NOME_JA_CADASTRADO);
    });
});

test('entrarComoConvidado', async (t) => {
    const servidor = await subirServidor();
    t.after(() => servidor.fechar());

    await t.test('autentica só com o nome', async () => {
        const cliente = await servidor.conectar();
        const nome = nomeUnico('convidado');
        const resposta = await cliente.ok(EventosCliente.ENTRAR_COMO_CONVIDADO, { nome });

        assert.equal(resposta.nome, nome);
        assert.equal(typeof resposta.token, 'string');
        await cliente.ok(EventosCliente.LISTAR_SALAS);
    });

    await t.test('não cria conta nenhuma no banco', async () => {
        const nome = nomeUnico('convidado');
        const cliente = await servidor.conectar();
        await cliente.ok(EventosCliente.ENTRAR_COMO_CONVIDADO, { nome });

        // A diferença que define o convidado: nada foi persistido.
        const outro = await servidor.conectar();
        assert.equal((await outro.ok(EventosCliente.VERIFICAR_NOME, { nome })).existe, false);
    });

    await t.test('CONVIDADO_INVALIDO com nome curto demais', async () => {
        const cliente = await servidor.conectar();
        await cliente.erro(EventosCliente.ENTRAR_COMO_CONVIDADO, { nome: 'ab' }, CodigosErro.CONVIDADO_INVALIDO);
        await cliente.erro(EventosCliente.ENTRAR_COMO_CONVIDADO, { nome: '   ' }, CodigosErro.CONVIDADO_INVALIDO);
    });

    await t.test('NOME_JA_CADASTRADO se o nome é de uma conta registrada', async () => {
        const cliente = await servidor.conectar();
        await cliente.erro(
            EventosCliente.ENTRAR_COMO_CONVIDADO,
            { nome: USUARIO_SEMEADO.nome },
            CodigosErro.NOME_JA_CADASTRADO
        );
    });
});

test('retomarSessao', async (t) => {
    const servidor = await subirServidor();
    t.after(() => servidor.fechar());

    await t.test('reautentica um socket novo com o token, sem senha', async () => {
        const primeiro = await servidor.conectar();
        const { token } = await primeiro.ok(EventosCliente.ENTRAR, USUARIO_SEMEADO);

        // Socket novo = socket.id novo, exatamente o que acontece quando o
        // socket.io-client reconecta ou a página dá F5.
        const segundo = await servidor.conectar();
        const resposta = await segundo.ok(EventosCliente.RETOMAR_SESSAO, { token });

        assert.equal(resposta.nome, USUARIO_SEMEADO.nome);
        await segundo.ok(EventosCliente.LISTAR_SALAS);
    });

    await t.test('devolve sempre um token NOVO', async () => {
        // É o que evita esbarrar na expiração fixa de 6h numa sessão que
        // segue sendo retomada (ver conexao/retomarSessao.js).
        const cliente = await servidor.conectar();
        const { token } = await cliente.ok(EventosCliente.ENTRAR, USUARIO_SEMEADO);
        const { token: renovado } = await cliente.ok(EventosCliente.RETOMAR_SESSAO, { token });

        assert.notEqual(renovado, token);
        // E o novo continua valendo.
        const outro = await servidor.conectar();
        await outro.ok(EventosCliente.RETOMAR_SESSAO, { token: renovado });
    });

    await t.test('preserva a identidade, não só o nome', async () => {
        // A prova real: o servidor reconhece o socket retomado como o MESMO
        // jogador que já está na sala (mesmo id), não como um homônimo.
        const original = await servidor.conectar();
        const { token } = await original.ok(EventosCliente.ENTRAR, USUARIO_SEMEADO);
        const { salaId } = await original.ok(EventosCliente.CRIAR_SALA, { numberPlayers: 4 });

        const retomado = await servidor.conectar();
        await retomado.ok(EventosCliente.RETOMAR_SESSAO, { token });
        await retomado.erro(EventosCliente.ENTRAR_SALA, { salaId }, CodigosErro.JA_ESTA_NA_SALA);
    });

    await t.test('funciona igual pra convidado', async () => {
        const nome = nomeUnico('convidado');
        const primeiro = await servidor.conectar();
        const { token } = await primeiro.ok(EventosCliente.ENTRAR_COMO_CONVIDADO, { nome });

        const segundo = await servidor.conectar();
        const resposta = await segundo.ok(EventosCliente.RETOMAR_SESSAO, { token });
        assert.equal(resposta.nome, nome);
    });

    await t.test('TOKEN_INVALIDO pros três casos que colapsam nele', async () => {
        const cliente = await servidor.conectar();
        // Malformado, ausente e com assinatura de outro segredo.
        await cliente.erro(EventosCliente.RETOMAR_SESSAO, { token: 'nao-e-um-jwt' }, CodigosErro.TOKEN_INVALIDO);
        await cliente.erro(EventosCliente.RETOMAR_SESSAO, {}, CodigosErro.TOKEN_INVALIDO);
        await cliente.erro(
            EventosCliente.RETOMAR_SESSAO,
            { token: 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MSwibm9tZSI6ImhhY2tlciJ9.assinatura-invalida' },
            CodigosErro.TOKEN_INVALIDO
        );
    });

    await t.test('token adulterado no payload não passa', async () => {
        // Troca o miolo do JWT mantendo header e assinatura: é a tentativa
        // ingênua de virar outro jogador. A assinatura tem que barrar.
        const cliente = await servidor.conectar();
        const { token } = await cliente.ok(EventosCliente.ENTRAR, USUARIO_SEMEADO);

        const [cabecalho, , assinatura] = token.split('.');
        const payloadForjado = Buffer.from(JSON.stringify({ id: 999, nome: 'invasor' }))
            .toString('base64url');

        const outro = await servidor.conectar();
        await outro.erro(
            EventosCliente.RETOMAR_SESSAO,
            { token: `${cabecalho}.${payloadForjado}.${assinatura}` },
            CodigosErro.TOKEN_INVALIDO
        );
    });
});

test('NAO_IDENTIFICADO', async (t) => {
    const servidor = await subirServidor();
    t.after(() => servidor.fechar());

    // Todo evento que o PROTOCOLO marca com "pré-condição: socket já mandou
    // entrar". Uma varredura só, pra ninguém adicionar um handler novo e
    // esquecer o exigirJogador() (ver conexao/socketServer.js).
    const eventosQueExigemLogin = [
        [EventosCliente.CRIAR_SALA, {}],
        [EventosCliente.ENTRAR_SALA, { salaId: 'QUALQUER' }],
        [EventosCliente.PARTIDA_RAPIDA, {}],
        [EventosCliente.LISTAR_SALAS, {}],
        [EventosCliente.FORCAR_INICIO, { salaId: 'QUALQUER' }],
        [EventosCliente.SAIR_SALA, { salaId: 'QUALQUER' }],
        [EventosCliente.SAIR_DA_PARTIDA, { salaId: 'QUALQUER' }],
        [EventosCliente.JOGAR_DE_NOVO, { salaId: 'QUALQUER' }],
        [EventosCliente.APOSTAR, { salaId: 'QUALQUER', valor: 1 }],
        [EventosCliente.JOGAR_CARTA, { salaId: 'QUALQUER', indice: 0 }],
        [EventosCliente.RECONECTAR, { salaId: 'QUALQUER' }],
        [EventosCliente.MINHA_SALA_ATIVA, {}],
        [EventosCliente.CHAT, { salaId: 'QUALQUER', tipo: 'restrita', id: 1 }],
    ];

    for (const [evento, payload] of eventosQueExigemLogin) {
        await t.test(`${evento} sem entrar antes`, async () => {
            const cliente = await servidor.conectar();
            await cliente.erro(evento, payload, CodigosErro.NAO_IDENTIFICADO);
        });
    }
});
