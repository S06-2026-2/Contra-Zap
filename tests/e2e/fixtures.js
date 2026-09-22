// fixtures.js
// O vocabulário do E2E: um `Jogador` é um contexto de navegador isolado
// (sessionStorage e socket próprios — ver public/app/src/sessao.js) já
// logado, com os passos que quase todo spec repete escritos UMA vez, sempre
// pela interface. Nada aqui fala com o servidor por fora do navegador: se um
// botão sumir da tela, o E2E tem que quebrar — é pra isso que ele existe.
//
// Seletores por acessibilidade (`getByLabel`, `getByRole`): a interface tem
// <label> de verdade e botões com texto, então não precisou de data-testid.
// Regex onde o texto tem partes variáveis ou que podem ser reescritas.
import { test as base, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

// Nome novo por chamada: a fixture de login usa convidado, e dois convidados
// homônimos na mesma sala dão NOME_INVALIDO (regra do protocolo).
export function nomeUnico(prefixo = 'jogador') {
    return `${prefixo}-${randomUUID().slice(0, 6)}`;
}

export class Jogador {
    constructor(context, page, nome) {
        this.context = context;
        this.page = page;
        this.nome = nome;
    }

    // Abre a página e entra como convidado pelo fluxo em etapas do Login.jsx:
    // nome -> "ainda não tem conta" -> "Não, só jogar". É o login mais curto
    // da interface e autentica igual aos outros.
    static async entrar(browser, nome = nomeUnico()) {
        const context = await browser.newContext();
        // Contexto novo do Playwright não tem localStorage nenhum — sem isto,
        // cairia no SeletorFrente (ver App.jsx) em vez do Login direto. Fixa
        // "debugging" pra o E2E continuar testando a interface de sempre,
        // igual a um usuário de verdade que já escolheu isso antes.
        await context.addInitScript(() => {
            try { localStorage.setItem('contrazap-frente', 'debugging'); } catch {}
        });
        const page = await context.newPage();
        const jogador = new Jogador(context, page, nome);
        await page.goto('/');
        await page.getByLabel('Nome').fill(nome);
        await page.getByRole('button', { name: 'Continuar' }).click();
        await page.getByRole('button', { name: 'Não, só jogar' }).click();
        await expect(page.getByRole('heading', { name: `Olá, ${nome}` })).toBeVisible();
        return jogador;
    }

    // Preenche o formulário "Criar sala" da Lobby e devolve o salaId lido do
    // título "Sala XXXXXX" da tela seguinte.
    async criarSala({ jogadores = 2, bots = 0, cartas } = {}) {
        await this.page.getByLabel('Jogadores').fill(String(jogadores));
        await this.page.getByLabel('Bots').fill(String(bots));
        if (cartas !== undefined) {
            await this.page.getByLabel('Cartas na 1ª rodada').fill(String(cartas));
        }
        await this.page.getByRole('button', { name: 'Criar', exact: true }).click();

        const titulo = this.page.getByRole('heading', { name: /^Sala [0-9A-F]{6}$/ });
        await expect(titulo).toBeVisible();
        return (await titulo.textContent()).replace('Sala ', '').trim();
    }

    // Entra numa sala pela lista "Salas abertas" da Lobby — o caminho de quem
    // não criou a sala. Atualiza a lista primeiro: ela só recarrega sozinha a
    // cada 10s, e a sala pode ter sido criada há menos que isso.
    async entrarNaSala(salaId) {
        await this.page.getByRole('button', { name: 'Atualizar lista' }).click();
        const item = this.page.getByRole('listitem').filter({ hasText: salaId });
        await expect(item).toBeVisible();
        await item.getByRole('button', { name: 'Entrar' }).click();
        await expect(this.page.getByRole('heading', { name: `Sala ${salaId}` })).toBeVisible();
    }

    // Só o adm vê este botão, e só com a sala cheia. Regex porque o texto
    // exato desse botão não é algo que o teste deva travar.
    async forcarInicio() {
        await this.page.getByRole('button', { name: /Forçar início/ }).click();
        await expect(this.page.getByRole('heading', { name: /^Vez de:/ })).toBeVisible();
    }

    // Espera a MINHA vez de apostar (a ordem é sorteada; se um bot vem antes,
    // ele leva ~2s) e aposta `valor`. Se o servidor recusar por
    // APOSTA_FECHA_RODADA — só acontece com o último a apostar — tenta
    // `alternativa`, que por construção não fecha a soma.
    async apostar(valor = 0, alternativa = 1) {
        const minhaVez = this.page.getByRole('heading', { name: /Aposta — sua vez/ });
        await expect(minhaVez).toBeVisible({ timeout: 20_000 });

        const campo = this.page.getByLabel(/Quantas vazas/);
        await campo.fill(String(valor));
        await this.page.getByRole('button', { name: 'Apostar' }).click();

        // Aceita: o título "sua vez" some. Recusada: ele continua lá.
        const aceita = await minhaVez.waitFor({ state: 'hidden', timeout: 4_000 }).then(() => true, () => false);
        if (!aceita) {
            await campo.fill(String(alternativa));
            await this.page.getByRole('button', { name: 'Apostar' }).click();
            await expect(minhaVez).toBeHidden();
        }
    }

    // As cartas da mão são botões dentro de .mao (ver Partida.jsx).
    cartas() {
        return this.page.locator('.mao button.carta');
    }

    // Espera a minha vez de jogar e clica na primeira carta.
    async jogarPrimeiraCarta() {
        await expect(this.page.getByRole('heading', { name: /sua vez, clique numa carta/ })).toBeVisible({ timeout: 30_000 });
        await this.cartas().first().click();
    }

    async fechar() {
        await this.context.close();
    }
}

// `jogador`: um jogador já logado. `jogadores(n)`: vários, em paralelo — pra
// sala com gente de verdade dos dois lados. Os dois fecham tudo no fim.
export const test = base.extend({
    // Mesma razão do addInitScript em Jogador.entrar, pra quem usa `page`
    // direto (ex.: login.spec.js) em vez de passar por Jogador.entrar.
    context: async ({ context }, use) => {
        await context.addInitScript(() => {
            try { localStorage.setItem('contrazap-frente', 'debugging'); } catch {}
        });
        await use(context);
    },

    jogador: async ({ browser }, use) => {
        const jogador = await Jogador.entrar(browser);
        await use(jogador);
        await jogador.fechar();
    },

    jogadores: async ({ browser }, use) => {
        const criados = [];
        await use(async (quantidade) => {
            const novos = await Promise.all(Array.from({ length: quantidade }, () => Jogador.entrar(browser)));
            criados.push(...novos);
            return novos;
        });
        await Promise.all(criados.map(jogador => jogador.fechar()));
    },
});

export { expect };
