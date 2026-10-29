// fixtures.js
// O vocabulário do E2E: um `Jogador` é um contexto de navegador isolado
// (sessionStorage e socket próprios — ver public/app/src/sessao.js) já
// logado, com os passos que quase todo spec repete escritos UMA vez, sempre
// pela interface. Nada aqui fala com o servidor por fora do navegador: se um
// botão sumir da tela, o E2E tem que quebrar — é pra isso que ele existe.
//
// As telas são as do app: tela inicial + PopupLogin (meetfront2), salas
// (Lobby da arcade) e a mesa (MesaExperimento do meetfront2). Seletores por
// acessibilidade (`getByLabel`, `getByRole`) — campos, seletores e cartas têm
// nome acessível, então não precisou de data-testid. As poucas classes CSS
// usadas (mão, vira, cartão de sala) são o recorte da tela que o jogador olha.
import { test as base, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

// Nome novo por chamada: a fixture de login usa convidado, e dois convidados
// homônimos na mesma sala dão NOME_INVALIDO (regra do protocolo).
export function nomeUnico(prefixo = 'jogador') {
    return `${prefixo}-${randomUUID().slice(0, 6)}`;
}

// Nome acessível de uma carta com a face pra cima (ver Carta.jsx).
export const CARTA_ABERTA = /^(4|5|6|7|Q|J|K|A|2|3) de (Ouros|Copas|Espadas|Paus)$/;

// Abre o pop-up de login pelo JOGAR da tela inicial — o caminho de quem
// chega no site sem sessão.
export async function abrirLogin(page) {
    await page.goto('/');
    await page.getByRole('button', { name: 'JOGAR', exact: true }).click();
    await expect(page.getByText('ENTRE PRA JOGAR')).toBeVisible();
}

// Logado e nas salas: o título da Lobby e o nome no topo.
export async function esperarSalas(page, nome) {
    await expect(page.getByText('SALAS ABERTAS')).toBeVisible();
    await expect(page.getByTitle('Você')).toHaveText(nome);
}

export class Jogador {
    constructor(context, page, nome) {
        this.context = context;
        this.page = page;
        this.nome = nome;
    }

    // Entra como convidado direto da primeira etapa do PopupLogin ("JOGAR
    // COMO CONVIDADO" com o nome digitado): o login mais curto da interface,
    // e autentica igual aos outros.
    static async entrar(browser, nome = nomeUnico()) {
        const context = await browser.newContext();
        const page = await context.newPage();
        const jogador = new Jogador(context, page, nome);
        await abrirLogin(page);
        await page.getByLabel('Nome').fill(nome);
        await page.getByRole('button', { name: 'JOGAR COMO CONVIDADO' }).click();
        await esperarSalas(page, nome);
        return jogador;
    }

    // "+ CRIAR SALA" na Lobby, escolhe nos seletores e abre a mesa; devolve
    // o salaId lido do título "SALA XXXXXX" da sala de espera. Jogadores
    // primeiro: o seletor de bots vai de 0 a jogadores-1.
    async criarSala({ jogadores = 2, bots = 0, cartas } = {}) {
        await this.page.getByRole('button', { name: '+ CRIAR SALA' }).click();
        await this.escolher('Jogadores', jogadores);
        await this.escolher('Bots pra completar', bots);
        if (cartas !== undefined) await this.escolher('Cartas na 1ª rodada', cartas);
        await this.page.getByRole('button', { name: 'ABRIR MESA' }).click();

        const titulo = this.page.getByText(/^SALA [0-9A-F]{6}$/);
        await expect(titulo).toBeVisible();
        return (await titulo.textContent()).replace('SALA', '').trim();
    }

    async escolher(grupo, valor) {
        await this.page.getByRole('group', { name: grupo }).getByRole('button', { name: String(valor), exact: true }).click();
    }

    // Entra numa sala pela lista da Lobby — o caminho de quem não criou a
    // sala. Atualiza a lista primeiro: ela só recarrega sozinha a cada 10s,
    // e a sala pode ter sido criada há menos que isso.
    async entrarNaSala(salaId) {
        await this.page.getByRole('button', { name: 'ATUALIZAR' }).click();
        const cartao = this.page.locator('.az-sala').filter({ hasText: salaId });
        await cartao.getByRole('button', { name: 'ENTRAR', exact: true }).click();
        await expect(this.page.getByText(`SALA ${salaId}`, { exact: true })).toBeVisible();
    }

    // Os assentos da sala de espera.
    roster() {
        return this.page.locator('.az-grade-espera');
    }

    // Só o adm recebe este botão, e ele só habilita com a sala cheia. A
    // partida começou quando o "Sair da fila" vira "Sair da partida".
    async forcarInicio() {
        await this.page.getByRole('button', { name: /Forçar início/i }).click();
        await expect(this.page.getByRole('button', { name: 'Sair da partida' })).toBeVisible();
    }

    // Espera a MINHA vez de apostar (a ordem é sorteada; se um bot vem antes,
    // ele leva ~2s) — é quando a placa "Apostar" aparece na mão — e aposta
    // `valor` pelo pop-up. Se `valor` fecharia a soma das vazas (só acontece
    // com o último a apostar), o pop-up trava o botão; se o servidor recusar
    // mesmo assim, o pop-up continua aberto. Nos dois casos tenta
    // `alternativa`, que por construção não fecha a soma.
    async apostar(valor = 0, alternativa = 1) {
        await this.page.getByRole('button', { name: 'Apostar', exact: true }).click({ timeout: 20_000 });

        const popup = this.page.getByRole('heading', { name: 'Quantas vazas você vai fazer?' });
        const campo = this.page.getByLabel('Quantas vazas');
        const confirmar = this.page.getByRole('button', { name: 'Apostar', exact: true });
        await campo.fill(String(valor));

        const aceita = await confirmar.isEnabled()
            && await confirmar.click().then(() => popup.waitFor({ state: 'hidden', timeout: 4_000 })).then(() => true, () => false);
        if (!aceita) {
            await campo.fill(String(alternativa));
            await confirmar.click();
            await expect(popup).toBeHidden();
        }
    }

    // As cartas da minha mão, na ordem do leque.
    cartas() {
        return this.page.locator('.mesa-exp-sua-mao-carta');
    }

    // Nome acessível de cada carta da mão (ver Carta.jsx).
    async nomesDasCartas() {
        return this.cartas().locator('[role="img"]').evaluateAll((cartas) => cartas.map((c) => c.getAttribute('aria-label')));
    }

    // Espera a minha vez de jogar e clica na ÚLTIMA carta do leque — a única
    // que nenhuma vizinha cobre (as da esquerda ficam por baixo da seguinte).
    async jogarUmaCarta() {
        await expect(this.page.getByText('Sua vez! Escolha uma carta.')).toBeVisible({ timeout: 30_000 });
        await this.cartas().last().click();
    }

    async fechar() {
        await this.context.close();
    }
}

// A tela de cada jogador no fim do teste, anexada ao resultado — a galeria
// "testado no navegador de verdade" do relatório de qualidade
// (tests/relatorio/gerar.js liga RELATORIO_TELAS). Fora dele não custa nada.
// Nunca derruba o teste: um print que falhou não é um bug do jogo.
async function registrarTela(testInfo, jogador, rotulo) {
    if (process.env.RELATORIO_TELAS !== '1') return;
    try {
        const corpo = await jogador.page.screenshot({ type: 'jpeg', quality: 70 });
        await testInfo.attach(`tela: ${rotulo}`, { body: corpo, contentType: 'image/jpeg' });
    } catch {
        // página já fechada pelo próprio teste
    }
}

// `jogador`: um jogador já logado. `jogadores(n)`: vários, em paralelo — pra
// sala com gente de verdade dos dois lados. Os dois fecham tudo no fim.
export const test = base.extend({
    jogador: async ({ browser }, use, testInfo) => {
        const jogador = await Jogador.entrar(browser);
        await use(jogador);
        await registrarTela(testInfo, jogador, 'jogador');
        await jogador.fechar();
    },

    jogadores: async ({ browser }, use, testInfo) => {
        const criados = [];
        await use(async (quantidade) => {
            const novos = await Promise.all(Array.from({ length: quantidade }, () => Jogador.entrar(browser)));
            criados.push(...novos);
            return novos;
        });
        for (const [i, jogador] of criados.entries()) {
            await registrarTela(testInfo, jogador, `jogador ${i + 1}`);
        }
        await Promise.all(criados.map(jogador => jogador.fechar()));
    },
});

export { expect };
