// nn.js
// Pesos das redes de treino carregados do disco (bots/models/*.json) pro
// servidor. O forward pass em si fica em bots/rede.js, sem node:fs, pra
// rodar tambem no navegador.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RedeAtorCritico as RedeBase } from './rede.js';

export { argmaxMascarado } from './rede.js';

const AQUI = dirname(fileURLToPath(import.meta.url));

export class RedeAtorCritico extends RedeBase {
    static carregar(nomeArquivo) {
        const caminho = join(AQUI, 'models', nomeArquivo);
        return new RedeAtorCritico(JSON.parse(readFileSync(caminho, 'utf-8')));
    }
}
