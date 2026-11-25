// A documentação e as skills que os agentes leem apontam para coisas reais?
//
// Uma skill só é reconhecida se o arquivo se chamar SKILL.md e tiver `name` e
// `description` no frontmatter, e um caminho errado na documentação manda o
// agente procurar o que não existe. Nenhum dos dois falha sozinho — por isso
// são conferidos aqui.
//
// Só confere existência: se o TEXTO descreve bem o código continua sendo
// trabalho de revisão.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILLS = '.claude/skills';
const AGENTES = '.claude/agents';
const ler = (arquivo) => readFileSync(path.join(RAIZ, arquivo), 'utf-8');
const existe = (arquivo) => existsSync(path.join(RAIZ, arquivo));

// Arquivos do repositório, incluindo os ainda não commitados. O que está no
// .gitignore fica de fora: existe numa máquina e não no CI.
const arquivos = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: RAIZ, encoding: 'utf-8' },
).split('\0').filter((arquivo) => arquivo && existe(arquivo));

// Skills de fora (registradas no lock) falam de outros projetos.
const externas = new Set(Object.keys(JSON.parse(ler('skills-lock.json')).skills));
const skills = readdirSync(path.join(RAIZ, SKILLS), { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => item.name);

const documentos = arquivos.filter((arquivo) => arquivo === 'AGENTS.md'
    || /^docs\/projeto\/.*\.md$/.test(arquivo)
    || /^\.claude\/agents\/.*\.md$/.test(arquivo)
    || (/^\.claude\/skills\/.*\.md$/.test(arquivo) && !externas.has(arquivo.split('/')[2])));

// Pastas que contêm algum desses arquivos, com a barra final.
const pastas = new Set(arquivos.flatMap((arquivo) => {
    const partes = arquivo.split('/').slice(0, -1);
    return partes.map((_, i) => `${partes.slice(0, i + 1).join('/')}/`);
}));
const caminhosReais = [...arquivos, ...pastas];

// Citados de propósito sem estar no repositório: exemplos e o que é gerado.
const EXCECOES = new Set([
    'labsTemporarios/LabNome.jsx',
    'labsTemporarios/',
    'relatorio-testes/index.html',
    'relatorio-testes/',
    'playwright-report/',
    'test-results/',
    'public/dist/',
    'node_modules/',
    'training/checkpoints/',
    'logs/',
    'runs/',
]);
const CAMINHO = /`((?:[\w@.-]+\/)*[\w@.-]+\.(?:jsx?|md|py|json|ya?ml|sh|css|csv|html|txt)|(?:[\w@.-]+\/)+)`/g;
const frontmatterDe = (arquivo) => ler(arquivo).match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
const LINK = /\]\(([^)#\s]+)(?:#[^)]*)?\)/g;

test('skills são reconhecíveis pelo agente', async (t) => {
    for (const skill of skills) {
        await t.test(skill, () => {
            const arquivo = `${SKILLS}/${skill}/SKILL.md`;
            assert.ok(existe(arquivo), `${arquivo} não existe — o agente não reconhece a skill`);
            const frontmatter = frontmatterDe(arquivo);
            assert.equal(frontmatter.match(/^name: *(\S+)\s*$/m)?.[1], skill, 'name precisa ser o nome da pasta');
            assert.match(frontmatter, /^description: *\S/m, 'description ausente');
        });
    }
});

test('subagentes são reconhecíveis e têm ferramentas declaradas', async (t) => {
    for (const nomeArquivo of readdirSync(path.join(RAIZ, AGENTES)).filter((n) => n.endsWith('.md'))) {
        await t.test(nomeArquivo, () => {
            const frontmatter = frontmatterDe(`${AGENTES}/${nomeArquivo}`);
            assert.equal(frontmatter.match(/^name: *(\S+)\s*$/m)?.[1], nomeArquivo.replace(/\.md$/, ''));
            assert.match(frontmatter, /^description: *\S/m, 'description ausente');
            // Sem `tools` o agente herda todas as ferramentas.
            assert.match(frontmatter, /^tools: *\S/m, 'tools ausente');
        });
    }

    await t.test('revisor só lê', () => {
        const tools = frontmatterDe(`${AGENTES}/revisor.md`).match(/^tools: *(.+?)\s*$/m)[1].split(/, */);
        assert.deepEqual(tools.sort(), ['Glob', 'Grep', 'Read']);
    });
});

test('documentação de agentes só cita arquivos e pastas que existem', async (t) => {
    await t.test('encontrou documentos e caminhos', () => {
        assert.ok(documentos.length > 10);
        assert.ok(documentos.some((documento) => [...ler(documento).matchAll(CAMINHO)].length > 0));
    });

    for (const documento of documentos) {
        await t.test(documento, () => {
            const texto = ler(documento);
            const pasta = path.posix.dirname(documento);
            // O caminho pode ser completo, relativo ao documento ou só o final
            // (`Partida.jsx`, `python/motor/rng.py`).
            const caminhos = [...texto.matchAll(CAMINHO)].map((m) => m[1]).filter((caminho) => {
                if (EXCECOES.has(caminho)) return false;
                const relativo = path.posix.join(pasta, caminho);
                const final = caminho.replace(/^(?:\.{1,2}\/)+/, '');
                return !caminhosReais.some((a) => a === relativo || a === final || a.endsWith(`/${final}`));
            });
            const links = [...texto.matchAll(LINK)].map((m) => m[1])
                .filter((link) => !/^[a-z]+:/i.test(link) && !existe(path.posix.join(pasta, link)));
            assert.deepEqual([...new Set([...caminhos, ...links])], [], 'citados, mas inexistentes');
        });
    }
});
