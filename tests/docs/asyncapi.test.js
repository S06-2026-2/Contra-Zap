// O asyncapi.yaml descreve o protocolo INTEIRO?
//
// O CI já roda `@asyncapi/cli validate`, mas isso só confere a FORMA do
// arquivo: um evento novo em conexao/eventos.js sem canal correspondente
// passa validando numa boa. É um buraco conhecido — está escrito na skill
// de testes ("um evento *faltando* ele não pega — isso é com você"). Foi
// assim que oito eventos (loja, carteira, animações, timerTurno) ficaram
// fora da spec sem ninguém notar.
//
// Este arquivo é o "isso é com você". Não valida schema nenhum: compara
// duas listas de nomes, conexao/eventos.js contra docs/asyncapi.yaml.
//
// Por que ler o YAML com regex em vez de um parser: a suíte não tem
// dependência, e a comparação é só de nomes. As duas formas procuradas
// (`address:` com 4 espaços e item de enum com 8) são estáveis no arquivo
// — se alguém reformatar a spec, o teste quebra barulhento em vez de
// passar a mentir, que é o comportamento desejado pra um teste de
// cobertura.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { EventosCliente, EventosServidor, CodigosErro } from '../../conexao/eventos.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const spec = readFileSync(join(RAIZ, 'docs', 'asyncapi.yaml'), 'utf-8');

// Todo canal do arquivo declara `address: <nome do evento>`.
const canais = new Set([...spec.matchAll(/^ {4}address: *(\S+)$/gm)].map(m => m[1]));

// Os códigos ficam no enum do schema CodigoErro, o último do arquivo.
const blocoCodigos = spec.slice(spec.lastIndexOf('    CodigoErro:'));
const codigosNaSpec = new Set([...blocoCodigos.matchAll(/^ {8}- ([A-Z_]+)$/gm)].map(m => m[1]));

test('docs/asyncapi.yaml cobre o protocolo inteiro', async (t) => {
    await t.test('a regex de canal e a de código acharam alguma coisa', () => {
        // Se a spec for reformatada, as duas viram conjuntos vazios e todos
        // os testes abaixo passariam a acusar "falta tudo". Esta checagem
        // existe pra que a mensagem seja a certa nesse caso.
        assert.ok(canais.size > 20, `só ${canais.size} canais encontrados — o formato do YAML mudou?`);
        assert.ok(codigosNaSpec.size > 20, `só ${codigosNaSpec.size} códigos encontrados — o formato do YAML mudou?`);
    });

    await t.test('todo evento de cliente tem canal', () => {
        const faltando = Object.entries(EventosCliente)
            .filter(([, evento]) => !canais.has(evento))
            .map(([chave, evento]) => `${chave} ('${evento}')`);
        assert.deepEqual(faltando, [],
            'eventos de cliente sem canal no asyncapi.yaml — ver "Ao mexer no protocolo" na skill de testes');
    });

    await t.test('todo evento de servidor tem canal', () => {
        const faltando = Object.entries(EventosServidor)
            .filter(([, evento]) => !canais.has(evento))
            .map(([chave, evento]) => `${chave} ('${evento}')`);
        assert.deepEqual(faltando, [], 'eventos de servidor sem canal no asyncapi.yaml');
    });

    await t.test('todo código de erro está no enum CodigoErro', () => {
        const faltando = Object.keys(CodigosErro).filter(codigo => !codigosNaSpec.has(codigo));
        assert.deepEqual(faltando, [], 'códigos de erro fora do enum da spec');
    });

    await t.test('a spec não inventa canal nem código que o protocolo não tem', () => {
        // O outro lado da moeda: evento removido do protocolo que ficou na
        // spec. Documentação que promete o que o servidor não entrega é tão
        // ruim quanto documentação faltando.
        const eventosReais = new Set([...Object.values(EventosCliente), ...Object.values(EventosServidor)]);
        const canaisFantasma = [...canais].filter(canal => !eventosReais.has(canal));
        assert.deepEqual(canaisFantasma, [], 'canais na spec que não existem em conexao/eventos.js');

        const codigosFantasma = [...codigosNaSpec].filter(codigo => !(codigo in CodigosErro));
        assert.deepEqual(codigosFantasma, [], 'códigos na spec que não existem em CodigosErro');
    });

    await t.test('o resumo do cabeçalho bate com a contagem real', () => {
        // A linha "N eventos de cliente, M de servidor, K códigos de erro"
        // da descrição é a primeira coisa que alguém lê — e a que mais
        // envelhece, porque nada a recalcula.
        const resumo = /(\d+) eventos de cliente, (\d+) de servidor, (\d+) códigos de erro/.exec(spec);
        assert.ok(resumo, 'o resumo sumiu do cabeçalho da spec');
        const [, cliente, servidor, codigos] = resumo.map(Number);
        assert.equal(cliente, Object.keys(EventosCliente).length, 'contagem de eventos de cliente');
        assert.equal(servidor, Object.keys(EventosServidor).length, 'contagem de eventos de servidor');
        assert.equal(codigos, Object.keys(CodigosErro).length, 'contagem de códigos de erro');
    });
});
