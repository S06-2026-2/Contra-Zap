// cadastro.test.js
// Testes de conexao/cadastro.js. Nomes únicos por teste (randomUUID) porque
// banco.sqlite persiste entre execuções — sem isso, rodar `npm test` duas
// vezes faria o segundo cadastro de cada teste colidir com o primeiro.
//
// cadastrar()/login() são assíncronas desde o item 4 do backlog de segurança
// (bcrypt nativo assíncrono, ver conexao/db.js) — inclusive quando o erro é
// de validação pura (nome/senha curtos): uma função `async` sempre devolve
// Promise, então até um `throw` síncrono lá dentro vira rejeição — todo
// `assert.throws` virou `assert.rejects`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { cadastrar, ErroCadastro } from './cadastro.js';
import { login } from './login.js';
import { CodigosErro } from './eventos.js';

function nomeUnico(prefixo) {
    return `${prefixo}-${randomUUID().slice(0, 8)}`;
}

test('cadastrar cria a conta e já devolve token e player autenticados', async () => {
    const nome = nomeUnico('novo');

    const { token, player } = await cadastrar(nome, 'senha123');

    assert.equal(typeof token, 'string');
    assert.ok(token.length > 0);
    assert.equal(player.nome, nome);
    assert.ok(Number.isInteger(player.id));
});

test('quem cadastrou consegue logar depois com a mesma senha', async () => {
    const nome = nomeUnico('relogin');
    await cadastrar(nome, 'senha123');

    const { player } = await login(nome, 'senha123');

    assert.equal(player.nome, nome);
});

test('cadastrar com nome já existente lança ErroCadastro NOME_JA_CADASTRADO', async () => {
    const nome = nomeUnico('duplicado');
    await cadastrar(nome, 'senha123');

    await assert.rejects(
        () => cadastrar(nome, 'outrasenha'),
        (erro) => erro instanceof ErroCadastro && erro.codigo === CodigosErro.NOME_JA_CADASTRADO
    );
});

test('cadastrar com nome curto demais lança ErroCadastro CADASTRO_INVALIDO', async () => {
    await assert.rejects(
        () => cadastrar('ab', 'senha123'),
        (erro) => erro instanceof ErroCadastro && erro.codigo === CodigosErro.CADASTRO_INVALIDO
    );
});

test('cadastrar com senha curta demais lança ErroCadastro CADASTRO_INVALIDO', async () => {
    await assert.rejects(
        () => cadastrar(nomeUnico('senhacurta'), 'ab'),
        (erro) => erro instanceof ErroCadastro && erro.codigo === CodigosErro.CADASTRO_INVALIDO
    );
});

test('cadastrar tira espaço nas pontas do nome antes de gravar', async () => {
    const nome = nomeUnico('espacos');

    const { player } = await cadastrar(`  ${nome}  `, 'senha123');

    assert.equal(player.nome, nome);
});
