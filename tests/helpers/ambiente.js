// ambiente.js
// Isolamento de ambiente dos testes de API. Este módulo NÃO importa nada do
// projeto de propósito: ele precisa rodar ANTES de `conexao/db.js` e
// `conexao/jwt.js` serem avaliados, porque os dois leem o ambiente uma vez
// só, no momento em que o módulo é carregado.
//
// Por isso os helpers que dependem dele (ver servidor.js) importam este
// arquivo primeiro e só então fazem `await import(...)` dos módulos do
// projeto — import dinâmico, avaliado na hora da chamada, quando as
// variáveis abaixo já estão no lugar.
//
// O que isso garante, na prática:
//  - nenhum teste escreve no `banco.sqlite` de quem está desenvolvendo:
//    cada processo de teste ganha um SQLite próprio, num diretório
//    temporário do sistema, apagado quando o processo termina;
//  - o `jwt.secret` da raiz do projeto nunca é criado nem lido pelos testes
//    (o JWT_SECRET fixo abaixo tem precedência — ver conexao/jwt.js), então
//    rodar a suíte não invalida a sessão de ninguém.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Um diretório por processo. O `node --test` roda cada arquivo de teste num
// processo separado (e em paralelo), então isto também é o que impede um
// arquivo de enxergar as contas cadastradas por outro — cada um começa com
// um banco recém-semeado a partir de banco.json.
const DIRETORIO = mkdtempSync(path.join(tmpdir(), 'contra-zap-teste-'));

process.env.DB_PATH = path.join(DIRETORIO, 'banco.sqlite');
// Fixo (não aleatório) de propósito: um teste que precise forjar/inspecionar
// um token consegue reproduzir a assinatura sem depender de arquivo nenhum.
process.env.JWT_SECRET ??= 'segredo-de-teste-contra-zap';

// Inclui os arquivos -wal e -shm que o journal_mode = WAL cria ao lado do
// banco (ver conexao/db.js).
//
// No Windows o arquivo do SQLite ainda está aberto no 'exit' e o rmSync
// estoura EPERM — o que derrubava o arquivo de teste inteiro como falho
// mesmo com todos os testes verdes. Sobrar uma pasta no %TEMP% é inofensivo;
// reprovar a suíte por isso não é.
process.on('exit', () => {
    try {
        rmSync(DIRETORIO, { recursive: true, force: true });
    } catch {
        // o sistema limpa o %TEMP%
    }
});

// Usuários que `banco.json` semeia em todo banco novo — é a fixture de conta
// já existente pros testes de login. Reexportado daqui pra nenhum teste
// precisar repetir a senha literal.
export const USUARIO_SEMEADO = { nome: 'henrique', senha: '123' };

export const DIRETORIO_TEMPORARIO = DIRETORIO;
