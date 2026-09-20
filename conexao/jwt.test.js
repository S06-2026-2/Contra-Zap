// jwt.test.js
// Testes do token de sessão assinado (conexao/jwt.js), isolado de login.js
// e do banco — só precisa de um objeto { id, nome }.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emitirToken, verificarToken } from './jwt.js';

test('emitirToken + verificarToken faz round-trip de id e nome', () => {
    const token = emitirToken({ id: 42, nome: 'henrique' });

    const dados = verificarToken(token);

    assert.equal(dados.id, 42);
    assert.equal(dados.nome, 'henrique');
});

test('dois tokens emitidos pro mesmo jogador são diferentes mesmo no mesmo instante', () => {
    // Sem jwtid, dois JWT com o mesmo payload + iat (resolução de segundo)
    // e o mesmo segredo saem byte a byte idênticos, porque HMAC é
    // determinístico — esse teste existe pra pegar essa regressão.
    const player = { id: 1, nome: 'moras' };

    const tokens = new Set();
    for (let i = 0; i < 5; i++) {
        tokens.add(emitirToken(player));
    }

    assert.equal(tokens.size, 5);
});

test('verificarToken devolve null pra um token adulterado', () => {
    const token = emitirToken({ id: 1, nome: 'guilherme' });
    const adulterado = token.slice(0, -2) + 'xx';

    assert.equal(verificarToken(adulterado), null);
});

test('verificarToken devolve null pra uma string que não é um JWT', () => {
    assert.equal(verificarToken('nao-e-um-token'), null);
});
