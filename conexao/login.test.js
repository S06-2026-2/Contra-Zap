// login.test.js
// Testes da autenticação contra o banco.json de teste (raiz do projeto).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { login, validarToken, ErroLogin } from './login.js';
import { CodigosErro } from './eventos.js';

// login() é assíncrona desde o item 4 do backlog de segurança (bcrypt
// nativo assíncrono, ver conexao/db.js) — todo teste que chama precisa de
// await/assert.rejects em vez de chamada direta/assert.throws.

test('login com nome e senha corretos devolve um token e o player', async () => {
    const { token, player } = await login('henrique', '123');

    assert.equal(typeof token, 'string');
    assert.ok(token.length > 0);
    assert.equal(player.nome, 'henrique');
});

test('validarToken devolve os dados do player dono do token recebido no login', async () => {
    const { token, player } = await login('piconi', '123');

    const encontrado = validarToken(token);

    // Token é stateless (JWT) — não existe mais sessão em memória guardando
    // o mesmo objeto, então a garantia é por dado (id/nome), não por
    // referência.
    assert.equal(encontrado.id, player.id);
    assert.equal(encontrado.nome, player.nome);
});

test('validarToken devolve null para um token que nunca foi emitido', () => {
    assert.equal(validarToken('token-inventado'), null);
});

test('login com usuário inexistente lança ErroLogin USUARIO_NAO_ENCONTRADO', async () => {
    await assert.rejects(
        () => login('nao-existe', '123'),
        (erro) => erro instanceof ErroLogin && erro.codigo === CodigosErro.USUARIO_NAO_ENCONTRADO
    );
});

test('login com senha errada lança ErroLogin SENHA_INCORRETA', async () => {
    await assert.rejects(
        () => login('henrique', 'senha-errada'),
        (erro) => erro instanceof ErroLogin && erro.codigo === CodigosErro.SENHA_INCORRETA
    );
});

test('logins repetidos do mesmo nome geram tokens diferentes (uma sessão por login)', async () => {
    const primeiro = await login('moras', '123');
    const segundo = await login('moras', '123');

    assert.notEqual(primeiro.token, segundo.token);
    assert.equal(validarToken(primeiro.token).nome, 'moras');
    assert.equal(validarToken(segundo.token).nome, 'moras');
});
