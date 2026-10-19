// preparar.js
// Primeiro passo do `webServer` do playwright.config.js: garante que
// public/app/node_modules existe antes de alguém tentar rodar o `vite build`.
//
// Por que isso precisa existir: public/app tem package.json próprio e as
// dependências dele NÃO são instaladas pelo `npm install` da raiz (não é
// workspace). Num clone limpo — a máquina de quem entrou no grupo agora, ou
// o runner do CI — `npm run test:e2e` morre antes do primeiro teste com
// `sh: 1: vite: not found` e `Exit code: 127`, que não diz nada sobre o que
// fazer.
//
// Por que é o primeiro passo do COMANDO do webServer, e não um globalSetup:
// o Playwright sobe o `webServer` ANTES de rodar o globalSetup, então de lá
// a instalação chegaria tarde demais — o build já teria morrido.
//
// Instala só quando falta. Em máquina de quem já desenvolve, é um
// `existsSync` e pronto.
import { existsSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = join(RAIZ, 'public', 'app');

export function prepararFront() {
    if (existsSync(join(APP, 'node_modules'))) return false;

    console.log('[e2e] public/app/node_modules não existe — instalando as dependências do front…');
    // `npm ci` porque existe package-lock.json: instala exatamente o que está
    // travado, sem reescrever o lockfile por baixo de quem for commitar
    // depois. Herda o stdio pra que um erro de instalação apareça inteiro,
    // em vez de sumir dentro do log do webServer.
    const { status, error } = spawnSync('npm', ['ci'], { cwd: APP, stdio: 'inherit', shell: process.platform === 'win32' });
    if (error) throw error;
    if (status !== 0) {
        throw new Error(`npm ci falhou em public/app (código ${status}). Rode à mão para ver o erro completo.`);
    }
    return true;
}

// Rodável direto (`node tests/e2e/preparar.js`), que é como o webServer o usa.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
    prepararFront();
}
