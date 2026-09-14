// playwright.config.js
// E2E de navegador do Contra ZAP. Fica fora do `npm test` de propósito: sobe
// navegador de verdade, é lento, e não pode travar o loop de quem só mexeu
// em regra de jogo. Roda com `npm run test:e2e` e num job próprio do CI.
//
// Cada jogador de um teste é um `browser.newContext()` isolado (ver
// tests/e2e/fixtures.js): sessionStorage e socket próprios — exatamente o
// que public/app/src/sessao.js já assume ("cada aba pode logar como um
// jogador diferente"). É o motivo de ser Playwright e não Cypress: uma
// partida exige 2 a 4 jogadores simultâneos.
import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const PORTA = 3100; // não colide com um `npm start` (3000) nem com `npm run docs` (3001)

// Banco temporário só desta execução — mesma disciplina de isolamento da
// suíte de API (ver tests/helpers/ambiente.js): rodar o E2E nunca toca no
// banco.sqlite nem no jwt.secret de quem está desenvolvendo. O banco nasce
// semeado a partir de banco.json (henrique/123 etc.), então os testes de
// login em conta existente funcionam.
const DIRETORIO_TEMPORARIO = mkdtempSync(path.join(tmpdir(), 'contra-zap-e2e-'));

export default defineConfig({
    testDir: './tests/e2e',
    // Os specs compartilham UM servidor (ver webServer abaixo) e criam salas
    // com ids distintos, então rodar em paralelo é seguro. Mas cada teste de
    // partida sobe 1-2 navegadores: mais workers que isso só briga por CPU.
    fullyParallel: true,
    workers: 2,
    // Rede + navegador: um retry legítimo no CI. Localmente, zero — um teste
    // intermitente tem que aparecer intermitente pra ser consertado.
    retries: process.env.CI ? 1 : 0,
    // A escolha da vez é sorteada e cada bot leva 2s pra agir (produção):
    // uma partida até a fase de cartas leva alguns segundos por natureza.
    timeout: 60_000,
    expect: { timeout: 15_000 },
    reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

    use: {
        baseURL: `http://localhost:${PORTA}`,
        // Evidência só quando falha — o relatório fica leve e útil.
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        locale: 'pt-BR',
    },

    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ],

    // O Server.js de verdade, com o build de verdade. Nada é mockado: o
    // teste passa pelo mesmo caminho que um jogador.
    //
    // O build entra no comando porque `public/dist` NÃO é versionado (ver
    // .gitignore): sem isto, o E2E abriria 404 no primeiro `goto('/')` e
    // falharia por um motivo que não é o testado. Buildar aqui também
    // garante que o teste sempre exercita o front ATUAL de
    // `public/app/src`, nunca um build velho que alguém esqueceu no disco.
    webServer: {
        command: 'npm --prefix public/app run build && node Server.js',
        url: `http://localhost:${PORTA}/health`,
        // Se já houver algo na porta é de OUTRA execução com OUTRO banco —
        // reusar daria testes conversando com estado que não é deles.
        reuseExistingServer: false,
        // Inclui o build do Vite, não só o boot do servidor.
        timeout: 120_000,
        env: {
            PORT: String(PORTA),
            DB_PATH: path.join(DIRETORIO_TEMPORARIO, 'banco.sqlite'),
            JWT_SECRET: 'segredo-de-teste-e2e-contra-zap',
            // Os tetos por IP contam por `socket.handshake.address`, e a
            // suíte inteira sai de 127.0.0.1: cada login de teste gasta um
            // `verificarNome`, e só de existir a suíte já passa dos 20 por
            // 5min de produção — o último teste a rodar receberia
            // MUITAS_TENTATIVAS em vez de logar. Quem cobre o rate limit de
            // propósito é tests/api/limites.test.js, com tetos apertados.
            VERIFICAR_NOME_MAX: '100000',
            ENTRAR_MAX: '100000',
            CADASTRAR_MAX: '100000',
        },
    },
});
