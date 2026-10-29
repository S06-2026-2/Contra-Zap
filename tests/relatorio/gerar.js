// gerar.js
// Relatório de qualidade do Contra ZAP: roda a suíte de API (`node --test`,
// com cobertura de código) e a E2E (Playwright, com print de cada tela),
// junta tudo e escreve relatorio-testes/index.html — uma página só, no
// visual do jogo, feita pra ser apresentada (ou exportada em PDF pelo
// navegador) e que abre direto do disco.
//
//   npm run test:relatorio          # as duas suítes
//   npm run test:relatorio -- api   # só a de API
//   npm run test:relatorio -- e2e   # só a E2E
//
// Divisão: este arquivo RODA e traduz pra um modelo comum; pagina.js
// DESENHA; areas.js tem o TEXTO (a frase de venda de cada área do produto).
// O terminal continua mostrando o progresso de sempre (`spec` e `list`),
// porque os reporters de JSON rodam lado a lado com eles.
//
// Sai com código 1 se alguma suíte falhou, pra servir no CI também.
import { spawnSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { montarPagina } from './pagina.js';
import { contar, somaDuracao } from './modelo.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SAIDA = join(RAIZ, 'relatorio-testes');
const DADOS = join(SAIDA, 'dados');
const HISTORICO = join(SAIDA, 'historico.json');

// ---------------------------------------------------------------- execução

function rodarApi() {
    const destino = join(DADOS, 'api.json');
    const reporter = pathToFileURL(join(RAIZ, 'tests', 'relatorio', 'reporterNode.js')).href;
    const inicio = Date.now();
    const { status } = spawnSync(process.execPath, [
        '--test',
        // A cobertura sai de graça: subirServidor() carrega o Server.js de
        // verdade dentro do processo de teste, então o que a suíte exercita
        // é o código de produção. tests/ fica de fora pra não inflar o número.
        '--experimental-test-coverage', '--test-coverage-exclude=tests/**',
        `--test-reporter=${reporter}`, `--test-reporter-destination=${destino}`,
        '--test-reporter=spec', '--test-reporter-destination=stdout',
        'tests/**/*.test.js',
    ], { cwd: RAIZ, stdio: 'inherit' });
    const duracaoMs = Date.now() - inicio;

    if (!existsSync(destino)) {
        return { suite: { nome: 'API', arquivos: [], duracaoMs, erroGeral: `node --test não gerou resultado (código ${status}).` } };
    }
    const { testes, cobertura } = JSON.parse(readFileSync(destino, 'utf8'));
    return { suite: { nome: 'API', arquivos: agruparPorArquivo(testes), duracaoMs }, cobertura };
}

function rodarE2e() {
    const destino = join(DADOS, 'e2e.json');
    // O cli.js direto, e não `npx`: no Windows o npx é um .cmd, e o Node 24
    // não executa .cmd sem shell.
    const cli = join(RAIZ, 'node_modules', '@playwright', 'test', 'cli.js');
    const inicio = Date.now();
    const { status } = spawnSync(process.execPath, [cli, 'test', '--reporter=list,json'], {
        cwd: RAIZ,
        stdio: 'inherit',
        // RELATORIO_TELAS: o playwright.config.js e as fixtures passam a
        // guardar o print de todo teste, não só dos que falham.
        env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: destino, RELATORIO_TELAS: '1' },
    });
    const duracaoMs = Date.now() - inicio;

    if (!existsSync(destino)) {
        return { suite: { nome: 'E2E', arquivos: [], duracaoMs, erroGeral: `Playwright não gerou resultado (código ${status}). Rodou \`npx playwright install chromium\`?` }, telas: [] };
    }
    return traduzirPlaywright(JSON.parse(readFileSync(destino, 'utf8')), duracaoMs);
}

// ---------------------------------------------------------- modelo comum
// Toda suíte vira { nome, duracaoMs, erroGeral?, arquivos: [{ arquivo, testes }] }
// e todo teste vira { titulo, estado, duracaoMs, erro?, anexos?, filhos }.
// estado: 'passou' | 'falhou' | 'pulou' | 'instavel'.

function caminhoRelativo(arquivo) {
    if (!arquivo) return '(sem arquivo)';
    const absoluto = arquivo.startsWith('file:') ? fileURLToPath(arquivo) : arquivo;
    return relative(RAIZ, absoluto).replaceAll('\\', '/');
}

function agruparPorArquivo(testes) {
    const porArquivo = new Map();
    for (const teste of testes) {
        const arquivo = caminhoRelativo(teste.arquivo);
        if (!porArquivo.has(arquivo)) porArquivo.set(arquivo, []);
        porArquivo.get(arquivo).push(teste);
    }
    return [...porArquivo].map(([arquivo, lista]) => ({ arquivo, testes: lista }))
        .sort((a, b) => a.arquivo.localeCompare(b.arquivo));
}

const ANSI = /\u001b\[[0-9;]*m/g;

function imagemDoAnexo(anexo) {
    if (!anexo.contentType?.startsWith('image/')) return undefined;
    // `body` (base64) é o que a fixture anexa direto; `path` é o screenshot
    // automático do Playwright, salvo em test-results/.
    if (anexo.body) return `data:${anexo.contentType};base64,${anexo.body}`;
    if (anexo.path && existsSync(anexo.path)) return `data:${anexo.contentType};base64,${readFileSync(anexo.path).toString('base64')}`;
    return undefined;
}

function traduzirPlaywright(json, duracaoMs) {
    const telas = [];

    function traduzirSuite(suite, arquivo) {
        const specs = (suite.specs ?? []).map((spec) => traduzirSpec(spec, arquivo));
        const internas = (suite.suites ?? []).map((s) => {
            const filhos = traduzirSuite(s, arquivo);
            return { titulo: s.title, estado: estadoDosFilhos(filhos), duracaoMs: somaDuracao(filhos), filhos };
        });
        return [...specs, ...internas];
    }

    function traduzirSpec(spec, arquivo) {
        // Um `test` por projeto do config; hoje só existe o chromium.
        const execucao = spec.tests[0] ?? { status: 'skipped', results: [] };
        const resultados = execucao.results ?? [];
        const ultimo = resultados.at(-1);
        const falho = [...resultados].reverse().find((r) => r.status !== 'passed' && r.status !== 'skipped');

        const estado = {
            expected: ultimo?.status === 'skipped' ? 'pulou' : 'passou',
            unexpected: 'falhou',
            flaky: 'instavel',
            skipped: 'pulou',
        }[execucao.status] ?? 'falhou';

        // Galeria: as telas da fixture ("tela: jogador 1") quando existem;
        // senão o screenshot automático (testes que usam o `page` direto).
        const anexosUltimo = ultimo?.attachments ?? [];
        const daFixture = anexosUltimo.filter((a) => a.name.startsWith('tela: '));
        for (const anexo of daFixture.length ? daFixture : anexosUltimo.filter((a) => a.name === 'screenshot')) {
            const dataUri = imagemDoAnexo(anexo);
            if (dataUri) telas.push({ titulo: spec.title, arquivo, rotulo: daFixture.length > 1 ? anexo.name.slice(6) : '', estado, dataUri });
        }

        const erroBruto = falho?.errors?.[0] ?? falho?.error;
        const anexos = (falho?.attachments ?? [])
            .map((a) => ({ nome: a.name, dataUri: imagemDoAnexo(a) }))
            .filter((a) => a.dataUri);
        const trace = (falho?.attachments ?? []).find((a) => a.name === 'trace' && a.path);

        return {
            titulo: spec.title,
            estado,
            duracaoMs: resultados.reduce((total, r) => total + (r.duration ?? 0), 0),
            tentativas: resultados.length,
            erro: erroBruto ? {
                mensagem: String(erroBruto.message ?? '').replace(ANSI, ''),
                stack: erroBruto.stack ? String(erroBruto.stack).replace(ANSI, '') : undefined,
            } : undefined,
            anexos,
            trace: trace ? caminhoRelativo(trace.path) : undefined,
            filhos: [],
        };
    }

    const arquivos = (json.suites ?? []).map((suite) => {
        const arquivo = caminhoRelativo(join(json.config?.rootDir ?? RAIZ, suite.file ?? suite.title));
        return { arquivo, testes: traduzirSuite(suite, arquivo) };
    });
    // Erro fora de qualquer teste: webServer que não subiu, spec que nem
    // compila. Sem isto o relatório diria "0 testes" e pareceria verde.
    const erroGeral = (json.errors ?? []).map((e) => String(e.message ?? '').replace(ANSI, '')).join('\n\n') || undefined;
    return { suite: { nome: 'E2E', arquivos, duracaoMs, erroGeral }, telas };
}

function estadoDosFilhos(filhos) {
    const estados = filhos.map((f) => f.estado);
    if (estados.includes('falhou')) return 'falhou';
    if (estados.includes('instavel')) return 'instavel';
    if (estados.length && estados.every((e) => e === 'pulou')) return 'pulou';
    return 'passou';
}

// ---------------------------------------------------------------- histórico
// Um resumo por execução, guardado ao lado do relatório (fora do git, como
// ele). É o que deixa a página mostrar "as últimas N rodadas foram verdes".

function lerHistorico() {
    try {
        return JSON.parse(readFileSync(HISTORICO, 'utf8'));
    } catch {
        return [];
    }
}

function registrarHistorico(execucao) {
    const historico = [...lerHistorico(), execucao].slice(-20);
    writeFileSync(HISTORICO, JSON.stringify(historico, null, 2));
    return historico;
}

// ---------------------------------------------------------------- main

function git(...args) {
    const { stdout, status } = spawnSync('git', args, { cwd: RAIZ, encoding: 'utf8' });
    return status === 0 ? stdout.trim() : '';
}

function abrir(arquivo) {
    // Só fora do CI: lá não tem navegador, o HTML vira artifact.
    if (process.env.CI) return;
    const comando = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', arquivo]]
        : process.platform === 'darwin' ? ['open', [arquivo]]
        : ['xdg-open', [arquivo]];
    spawn(comando[0], comando[1], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
}

const pedidas = process.argv.slice(2).map((a) => a.toLowerCase());
const quer = (nome) => !pedidas.length || pedidas.includes(nome);

rmSync(DADOS, { recursive: true, force: true });
mkdirSync(DADOS, { recursive: true });

const suites = [];
let cobertura;
let telas = [];
if (quer('api')) {
    const api = rodarApi();
    suites.push(api.suite);
    cobertura = api.cobertura;
}
if (quer('e2e')) {
    const e2e = rodarE2e();
    suites.push(e2e.suite);
    telas = e2e.telas;
}

const contagem = contar(suites.flatMap((s) => s.arquivos.flatMap((a) => a.testes)));
const falhou = suites.some((s) => s.erroGeral) || contagem.falhou > 0;
const geradoEm = new Date();

const historico = registrarHistorico({
    data: geradoEm.toISOString(),
    suites: suites.map((s) => s.nome),
    passou: contagem.passou,
    falhou: contagem.falhou + suites.filter((s) => s.erroGeral).length,
    total: contagem.total,
});

const html = join(SAIDA, 'index.html');
writeFileSync(html, montarPagina({
    geradoEm,
    ramo: git('rev-parse', '--abbrev-ref', 'HEAD'),
    commit: git('rev-parse', '--short', 'HEAD'),
    suites,
    cobertura,
    telas,
    historico,
}));
console.log(`\nRelatório: ${html}`);
abrir(html);

process.exitCode = falhou ? 1 : 0;
