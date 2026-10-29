// areas.js
// O texto do relatório de qualidade: como cada arquivo de teste se traduz
// numa promessa do produto, na língua de quem compra e não de quem
// programa. É o único arquivo do relatório que deveria mudar quando a
// apresentação mudar — o gerar.js e a pagina.js só consomem isto.
//
// Arquivo de teste novo que não estiver em nenhuma área cai em "Outros" no
// relatório: ele continua contado, só fica sem a frase de venda.

export const AREAS = [
    {
        nome: 'Contas e login',
        promessa: 'Cadastro, login, modo convidado e volta automática da sessão funcionam, e entradas inválidas são recusadas.',
        arquivos: ['tests/api/autenticacao.test.js', 'tests/e2e/login.spec.js'],
    },
    {
        nome: 'Salas e matchmaking',
        promessa: 'Criar, encontrar, entrar e sair de salas; partida rápida e início pelo dono da sala, com todos vendo o mesmo.',
        arquivos: ['tests/api/salas.test.js', 'tests/e2e/sala.spec.js'],
    },
    {
        nome: 'Regras do jogo',
        promessa: 'Mão, manilha, apostas, vazas e fim de jogo seguem as regras em toda partida, no ritmo das animações.',
        arquivos: ['tests/api/partida.test.js', 'tests/api/segurarAnimacoes.test.js', 'tests/e2e/partida.spec.js'],
    },
    {
        nome: 'Reconexão',
        promessa: 'Caiu a internet ou apertou F5? O jogador volta para a mesma partida, com a mão intacta.',
        arquivos: ['tests/api/reconexao.test.js', 'tests/e2e/reconexao.spec.js'],
    },
    {
        nome: 'Segurança e anti-abuso',
        promessa: 'Limite de tentativas por IP, tetos de tamanho e proteção contra troca de identidade no meio da sessão.',
        arquivos: ['tests/api/limites.test.js'],
    },
    {
        nome: 'Carteira e loja',
        promessa: 'Fichas ganhas, compras e itens equipados são contabilizados certo, ficha por ficha.',
        arquivos: ['tests/api/carteira.test.js'],
    },
    {
        nome: 'Chat da mesa',
        promessa: 'Mensagens prontas e texto livre chegam a todos da mesa, com proteção contra spam.',
        arquivos: ['tests/api/chat.test.js'],
    },
    {
        nome: 'Bots com IA',
        promessa: 'Cada nível de bot usa de fato a rede neural que promete, inclusive em mesas de 5 e 6 jogadores.',
        arquivos: ['tests/bots/modelosBot.test.js', 'tests/bots/mesaGrande.test.js'],
    },
    {
        nome: 'Operação e documentação',
        promessa: 'Health check para monitoramento e documentação da API sempre fiel ao protocolo real.',
        arquivos: ['tests/api/health.test.js', 'tests/docs/asyncapi.test.js'],
    },
];

// Pastas do código medidas pela cobertura, com o nome que o cliente entende.
// A chave é o primeiro segmento do caminho relativo à raiz do projeto.
export const MODULOS = {
    game: 'Motor do jogo',
    conexao: 'Servidor e protocolo',
    bots: 'Bots com IA',
    observabilidade: 'Métricas de operação',
    'Server.js': 'Inicialização do servidor',
};

// As etapas do .github/workflows/ci.yml, na ordem em que uma alteração passa
// por elas. Atualizar aqui quando o CI ganhar ou perder um job.
export const PIPELINE = [
    { nome: 'Build', detalhe: 'A imagem Docker de produção é montada do zero.' },
    { nome: 'Testes automatizados', detalhe: 'Toda a suíte de API, bots e documentação roda contra o servidor real.' },
    { nome: 'Contrato da API', detalhe: 'OpenAPI e AsyncAPI validados, e a coleção do Postman executada contra o servidor no ar.' },
    { nome: 'Navegador real', detalhe: 'O E2E joga pela interface contra o mesmo container que vai para produção.' },
];
