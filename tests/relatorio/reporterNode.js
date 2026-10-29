// reporterNode.js
// Reporter customizado do `node --test` que despeja os resultados em JSON —
// a matéria-prima do relatório HTML (ver gerar.js). Não substitui o `spec`
// no terminal: o gerar.js liga os dois ao mesmo tempo.
//
// O node:test emite os eventos de um teste QUANDO ELE TERMINA, então os
// subtestes (`t.test(...)`) chegam antes do pai. A árvore é montada de baixo
// pra cima: cada evento guarda-se como pendente no seu nível de `nesting`, e
// quando o pai chega ele adota os pendentes do nível logo abaixo. A chave
// inclui o arquivo porque cada arquivo roda num processo próprio, em
// paralelo — dois arquivos não podem adotar os filhos um do outro.

function chave(arquivo, nivel) {
    return `${arquivo}\0${nivel}`;
}

function extrairErro(erro) {
    if (!erro) return undefined;
    // O erro que chega aqui é o envelope ERR_TEST_FAILURE; o assert que
    // falhou de verdade está em `cause`.
    const original = erro.cause ?? erro;
    return {
        mensagem: String(original.message ?? original),
        stack: original.stack ? String(original.stack) : undefined,
        // Pai que só falhou porque um filho falhou: o relatório não repete
        // o erro nele, o filho já mostra.
        soPorFilhos: erro.failureType === 'subtestsFailed',
    };
}

export default async function* reporterJson(origem) {
    const pendentes = new Map();
    const raiz = [];
    const diagnosticos = [];
    // Só existe quando o gerar.js liga --experimental-test-coverage.
    let cobertura;

    for await (const evento of origem) {
        const { type: tipo, data: dados } = evento;

        if (tipo === 'test:coverage') {
            const { totals, files, workingDirectory } = dados.summary;
            cobertura = {
                totais: totals,
                arquivos: files.map((f) => ({
                    caminho: f.path.slice(workingDirectory.length + 1).replaceAll('\\', '/'),
                    linhas: f.totalLineCount,
                    linhasCobertas: f.coveredLineCount,
                })),
            };
            continue;
        }
        if (tipo === 'test:diagnostic') {
            diagnosticos.push(dados.message);
            continue;
        }
        if (tipo !== 'test:pass' && tipo !== 'test:fail') continue;

        const arquivo = dados.file ?? '';
        const filhos = pendentes.get(chave(arquivo, dados.nesting + 1)) ?? [];
        pendentes.delete(chave(arquivo, dados.nesting + 1));

        let estado = tipo === 'test:pass' ? 'passou' : 'falhou';
        if (dados.skip !== undefined || dados.todo !== undefined) estado = 'pulou';

        const no = {
            titulo: dados.name,
            arquivo,
            estado,
            duracaoMs: dados.details?.duration_ms ?? 0,
            erro: tipo === 'test:fail' ? extrairErro(dados.details?.error) : undefined,
            filhos,
        };

        if (dados.nesting === 0) {
            raiz.push(no);
        } else {
            const k = chave(arquivo, dados.nesting);
            if (!pendentes.has(k)) pendentes.set(k, []);
            pendentes.get(k).push(no);
        }
    }

    yield JSON.stringify({ testes: raiz, diagnosticos, cobertura });
}
