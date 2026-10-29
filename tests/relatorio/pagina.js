// pagina.js
// Desenha o relatório de qualidade a partir do modelo que o gerar.js monta.
// Uma página só, autossuficiente (CSS, JS e prints embutidos), no visual
// arcade do jogo (as cores e fontes de public/app/src/components/arcade):
// ela é apresentada pra quem vai comprar o produto, então tem que parecer
// o produto.
//
// Ordem da página = ordem da conversa de venda: o placar geral, o que cada
// área garante, quanto do código é exercitado, a prova visual no navegador,
// o processo que repete tudo isso a cada mudança, e só no fim o detalhe
// técnico teste a teste.
//
// Cores dos gráficos validadas com o validador de paleta (CVD e contraste
// sobre o fundo #14161d): azul #3d9be9 = API, dourado #c98500 = navegador.
// Verde/vermelho são só estado (passou/falhou) e sempre vêm com ícone e texto.
import { AREAS, MODULOS, PIPELINE } from './areas.js';
import { contar, somaDuracao, temFalha } from './modelo.js';

// ---------------------------------------------------------------- utilidades

function esc(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const numero = (n) => n.toLocaleString('pt-BR');
const porcento = (parte, todo) => (todo ? Math.floor((parte / todo) * 1000) / 10 : 0);
const pct = (valor) => `${String(valor).replace('.', ',')}%`;

function formatarDuracao(ms) {
    if (ms < 1000) return `${Math.round(ms)} ms`;
    const s = ms / 1000;
    if (s < 60) return `${s.toFixed(1).replace('.', ',')} s`;
    const min = Math.floor(s / 60);
    const resto = Math.round(s % 60);
    return resto ? `${min} min ${String(resto).padStart(2, '0')} s` : `${min} min`;
}

function plural(n, singular, pluralTexto = `${singular}s`) {
    return `${numero(n)} ${n === 1 ? singular : pluralTexto}`;
}

const ICONE = { passou: '✔', falhou: '✖', pulou: '–', instavel: '!' };
const ROTULO = { passou: 'passou', falhou: 'falhou', pulou: 'pulado', instavel: 'instável' };

// ---------------------------------------------------------------- dados

function testesDe(suite) {
    return suite?.arquivos.flatMap((a) => a.testes) ?? [];
}

// Cada área do areas.js com as contas de API e de navegador separadas. O
// que não está mapeado vira "Outros" — contado, só sem frase de venda.
function agregarAreas(suites) {
    const api = suites.find((s) => s.nome === 'API');
    const e2e = suites.find((s) => s.nome === 'E2E');
    const usados = new Set();

    const montar = (nome, promessa, filtro) => {
        const doApi = (api?.arquivos ?? []).filter(filtro);
        const doE2e = (e2e?.arquivos ?? []).filter(filtro);
        [...doApi, ...doE2e].forEach((a) => usados.add(a.arquivo));
        const cApi = contar(doApi.flatMap((a) => a.testes));
        const cE2e = contar(doE2e.flatMap((a) => a.testes));
        return {
            nome,
            promessa,
            api: cApi,
            e2e: cE2e,
            total: cApi.total + cE2e.total,
            passou: cApi.passou + cE2e.passou,
            falhou: cApi.falhou + cE2e.falhou,
        };
    };

    const areas = AREAS.map((area) => montar(area.nome, area.promessa, (a) => area.arquivos.includes(a.arquivo)));
    const outros = montar('Outros', 'Verificações que ainda não foram agrupadas numa área do produto.', (a) => !usados.has(a.arquivo));
    return [...areas, outros].filter((a) => a.total > 0);
}

function agregarCobertura(cobertura) {
    if (!cobertura) return undefined;
    const porModulo = new Map();
    for (const arquivo of cobertura.arquivos) {
        const chave = arquivo.caminho.split('/')[0];
        const nome = MODULOS[chave] ?? chave;
        const atual = porModulo.get(nome) ?? { nome, linhas: 0, cobertas: 0, arquivos: 0 };
        atual.linhas += arquivo.linhas;
        atual.cobertas += arquivo.linhasCobertas;
        atual.arquivos++;
        porModulo.set(nome, atual);
    }
    const t = cobertura.totais;
    return {
        linhas: porcento(t.coveredLineCount, t.totalLineCount),
        ramos: porcento(t.coveredBranchCount, t.totalBranchCount),
        funcoes: porcento(t.coveredFunctionCount, t.totalFunctionCount),
        totalLinhas: t.totalLineCount,
        modulos: [...porModulo.values()]
            .map((m) => ({ ...m, pct: porcento(m.cobertas, m.linhas) }))
            .sort((a, b) => b.linhas - a.linhas),
    };
}

function coletarFalhas(suites) {
    const falhas = [];
    const visitar = (no, arquivo, caminho) => {
        const titulo = [...caminho, no.titulo];
        if (no.estado === 'falhou' && !no.erro?.soPorFilhos && !(no.filhos ?? []).some(temFalha)) {
            falhas.push({ arquivo, titulo: titulo.join(' › '), mensagem: no.erro?.mensagem ?? '' });
        }
        (no.filhos ?? []).forEach((f) => visitar(f, arquivo, titulo));
    };
    for (const suite of suites) {
        if (suite.erroGeral) falhas.push({ arquivo: suite.nome, titulo: `A suíte ${suite.nome} não terminou`, mensagem: suite.erroGeral });
        for (const { arquivo, testes } of suite.arquivos) testes.forEach((t) => visitar(t, arquivo, []));
    }
    return falhas;
}

// ---------------------------------------------------------------- seções

function secaoHero({ contagem, falhas, suites, geradoEm }) {
    const ok = falhas.length === 0;
    const duracao = suites.reduce((total, s) => total + s.duracaoMs, 0);
    return `
    <section class="hero" id="inicio">
        <p class="kicker">Relatório de qualidade · ${esc(geradoEm.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }))}</p>
        <h1 class="pixel titulo-hero ${ok ? '' : 'alerta'}">${ok ? 'Qualidade<br>comprovada' : `${plural(falhas.length, 'ponto')}<br>de atenção`}</h1>
        <p class="lead">${ok
            ? 'Cada parte do Contra ZAP é verificada automaticamente, do servidor ao navegador, antes de chegar a um jogador.'
            : 'A última verificação automática encontrou problemas. Eles estão listados abaixo, com a causa exata, e nenhuma versão com falha vai para produção.'}</p>
        <div class="placar">
            <div class="placar-num pixel">${numero(contagem.passou)}<span>/${numero(contagem.total)}</span></div>
            <div class="placar-txt">verificações automáticas aprovadas<br><span class="suave">em ${formatarDuracao(duracao)}, sem nenhuma intervenção manual</span></div>
        </div>
    </section>`;
}

function secaoAtencao(falhas) {
    if (!falhas.length) return '';
    return `
    <section class="atencao" aria-labelledby="t-atencao">
        <h2 id="t-atencao" class="pixel">✖ Pontos de atenção</h2>
        <ul>${falhas.map((f) => `
            <li><strong>${esc(f.titulo)}</strong><code>${esc(f.arquivo)}</code>${f.mensagem ? `<pre>${esc(f.mensagem.split('\n').slice(0, 6).join('\n'))}</pre>` : ''}</li>`).join('')}
        </ul>
    </section>`;
}

function secaoNumeros({ contagem, suites, cobertura, areas }) {
    const api = contar(testesDe(suites.find((s) => s.nome === 'API')));
    const e2e = contar(testesDe(suites.find((s) => s.nome === 'E2E')));
    const aprovacao = porcento(contagem.passou, contagem.total);
    const camadas = [api.total && `${numero(api.total)} no servidor`, e2e.total && `${numero(e2e.total)} no navegador`].filter(Boolean).join(' · ');
    const tiles = [
        { valor: numero(contagem.total), rotulo: 'verificações automáticas', sub: camadas },
        { valor: pct(aprovacao), rotulo: 'de aprovação', sub: contagem.falhou ? plural(contagem.falhou, 'falha') : 'nenhuma falha', destaque: contagem.falhou ? 'ruim' : 'bom' },
        cobertura && { valor: pct(cobertura.linhas), rotulo: 'do código do servidor exercitado', sub: `${numero(cobertura.totalLinhas)} linhas medidas` },
        { valor: numero(areas.filter((a) => a.nome !== 'Outros').length), rotulo: 'áreas do produto cobertas', sub: 'de login a bots com IA' },
    ].filter(Boolean);
    return `
    <section class="numeros" aria-label="Números principais">
        ${tiles.map((t) => `
        <div class="tile ${t.destaque ?? ''}">
            <div class="tile-valor pixel">${t.valor}</div>
            <div class="tile-rotulo">${t.rotulo}</div>
            <div class="tile-sub">${esc(t.sub)}</div>
        </div>`).join('')}
    </section>`;
}

function secaoAreas(areas) {
    const maior = Math.max(...areas.map((a) => a.total), 1);
    const ordenadas = [...areas].sort((a, b) => b.total - a.total);
    const temE2e = areas.some((a) => a.e2e.total);

    const cartoes = areas.map((a) => {
        const ok = a.falhou === 0;
        return `
        <article class="area ${ok ? 'ok' : 'ruim'}">
            <header>
                <h3>${esc(a.nome)}</h3>
                <span class="selo ${ok ? 'ok' : 'ruim'}">${ok ? ICONE.passou : ICONE.falhou} ${numero(a.passou)}/${numero(a.total)}</span>
            </header>
            <p>${esc(a.promessa)}</p>
            <div class="camadas">
                ${a.api.total ? `<span class="chip"><i class="mk api"></i>${plural(a.api.total, 'teste')} de servidor</span>` : ''}
                ${a.e2e.total ? `<span class="chip"><i class="mk nav"></i>${plural(a.e2e.total, 'cenário')} no navegador</span>` : ''}
            </div>
        </article>`;
    }).join('');

    // Barras horizontais empilhadas: o comprimento é a quantidade de
    // verificações, a cor é a camada. Rótulo direto no fim da barra, legenda
    // em cima; o número exato fica no tooltip e nos cartões acima.
    const barras = ordenadas.map((a) => `
        <div class="barra-linha">
            <span class="barra-nome">${esc(a.nome)}</span>
            <div class="barra-trilho">
                ${a.api.total ? `<span class="seg api" style="width:${(a.api.total / maior) * 100}%" tabindex="0" data-dica="${esc(a.nome)}|Servidor (API): ${plural(a.api.total, 'teste')}"></span>` : ''}
                ${a.e2e.total ? `<span class="seg nav" style="width:${(a.e2e.total / maior) * 100}%" tabindex="0" data-dica="${esc(a.nome)}|Navegador real: ${plural(a.e2e.total, 'cenário')}"></span>` : ''}
                <span class="barra-total">${numero(a.total)}</span>
            </div>
        </div>`).join('');

    return `
    <section id="garantias" aria-labelledby="t-garantias">
        <p class="kicker">O que está garantido</p>
        <h2 id="t-garantias" class="pixel">Cada promessa do jogo, verificada</h2>
        <p class="intro">Os testes não verificam linhas de código soltas: verificam o que o jogador vive. Cada área abaixo é coberta por testes no servidor e, onde a experiência depende da tela, também por um navegador de verdade jogando.</p>
        <div class="areas">${cartoes}</div>

        <figure class="grafico">
            <figcaption>
                <strong>Verificações por área do produto</strong>
                ${temE2e ? `<span class="legenda"><span><i class="mk api"></i>Servidor (API)</span><span><i class="mk nav"></i>Navegador real</span></span>` : ''}
            </figcaption>
            <div class="barras">${barras}</div>
        </figure>
    </section>`;
}

function secaoCobertura(cobertura) {
    if (!cobertura) return '';
    const linhas = cobertura.modulos.map((m) => `
        <div class="barra-linha">
            <span class="barra-nome">${esc(m.nome)}</span>
            <div class="barra-trilho cheio" tabindex="0" data-dica="${esc(m.nome)}|${numero(m.cobertas)} de ${numero(m.linhas)} linhas executadas pelos testes|${plural(m.arquivos, 'arquivo')}">
                <span class="seg api" style="width:${m.pct}%"></span>
            </div>
            <span class="barra-pct">${pct(m.pct)}</span>
        </div>`).join('');
    return `
    <section id="cobertura" aria-labelledby="t-cobertura">
        <p class="kicker">Profundidade</p>
        <h2 id="t-cobertura" class="pixel">${cobertura.linhas >= 90 ? 'Quase todo o código é exercitado' : `${pct(Math.round(cobertura.linhas))} do código é exercitado`}</h2>
        <p class="intro">Cobertura de código mede quanto do servidor os testes realmente executam. Não é estimativa: o Node.js registra cada linha, cada decisão e cada função tocadas durante a suíte.</p>
        <div class="anel-linha">
            ${[['linhas', 'das linhas de código', cobertura.linhas], ['ramos', 'dos caminhos de decisão (if/else)', cobertura.ramos], ['funcoes', 'das funções', cobertura.funcoes]].map(([id, rotulo, valor]) => `
            <div class="anel">
                <svg viewBox="0 0 120 120" role="img" aria-label="${pct(valor)} ${rotulo}">
                    <circle cx="60" cy="60" r="50" class="anel-trilho"/>
                    <circle cx="60" cy="60" r="50" class="anel-valor" pathLength="100" stroke-dasharray="${valor} 100" transform="rotate(-90 60 60)"/>
                </svg>
                <div class="anel-num pixel">${pct(Math.round(valor))}</div>
                <div class="anel-rotulo">${rotulo}</div>
            </div>`).join('')}
        </div>
        <figure class="grafico">
            <figcaption><strong>Linhas exercitadas por parte do sistema</strong></figcaption>
            <div class="barras">${linhas}</div>
        </figure>
    </section>`;
}

function secaoTelas(telas) {
    if (!telas.length) return '';
    // Ordem da galeria = ordem de uma sessão de jogo (login → sala →
    // partida → reconexão), que é a ordem das áreas no areas.js.
    const posicao = (arquivo) => {
        const i = AREAS.findIndex((a) => a.arquivos.includes(arquivo));
        return i === -1 ? AREAS.length : i;
    };
    const ordenadas = [...telas].sort((a, b) => posicao(a.arquivo) - posicao(b.arquivo));
    const area = (arquivo) => AREAS.find((a) => a.arquivos.includes(arquivo))?.nome ?? 'Outros';

    return `
    <section id="navegador" aria-labelledby="t-navegador">
        <p class="kicker">Prova visual</p>
        <h2 id="t-navegador" class="pixel">Jogado num navegador de verdade</h2>
        <p class="intro">Além do servidor, um Chrome automatizado abre o jogo, faz login, cria sala, aposta e joga cartas, como um jogador faria. Estas são as telas exatamente como estavam ao fim de cada cenário${ordenadas.some((t) => t.rotulo) ? ', incluindo partidas com dois jogadores reais ao mesmo tempo' : ''}.</p>
        <div class="galeria">
            ${ordenadas.map((t, i) => `
            <figure class="tela ${t.estado}">
                <button type="button" class="tela-abrir" data-indice="${i}" aria-label="Ampliar: ${esc(t.titulo)}">
                    <img src="${t.dataUri}" alt="Tela do jogo ao fim de: ${esc(t.titulo)}" loading="lazy">
                </button>
                <figcaption>
                    <span class="tela-area">${esc(area(t.arquivo))}${t.rotulo ? ` · ${esc(t.rotulo)}` : ''}</span>
                    <span class="tela-titulo"><b class="st ${t.estado}" aria-label="${ROTULO[t.estado]}">${ICONE[t.estado]}</b> ${esc(t.titulo)}</span>
                </figcaption>
            </figure>`).join('')}
        </div>
        <dialog id="ampliada" aria-label="Tela ampliada">
            <img alt="">
            <p></p>
            <form method="dialog"><button class="botao">Fechar</button></form>
        </dialog>
    </section>`;
}

function secaoProcesso(historico) {
    const passos = PIPELINE.map((p, i) => `
        <li class="passo">
            <span class="passo-num pixel">${i + 1}</span>
            <strong>${esc(p.nome)}</strong>
            <span>${esc(p.detalhe)}</span>
        </li>`).join('');

    let execucoes = '';
    if (historico.length >= 2) {
        const recentes = historico.slice(-20);
        const maior = Math.max(...recentes.map((h) => h.passou + h.falhou), 1);
        let sequencia = 0;
        for (const h of [...historico].reverse()) {
            if (h.falhou) break;
            sequencia++;
        }
        execucoes = `
        <figure class="grafico">
            <figcaption>
                <strong>Últimas ${recentes.length} execuções</strong>
                <span class="legenda"><span><i class="mk ok"></i>aprovadas</span><span><i class="mk ruim"></i>falhas</span></span>
            </figcaption>
            ${sequencia >= 2 ? `<p class="sequencia"><b class="pixel">${sequencia}</b> execuções seguidas sem nenhuma falha</p>` : ''}
            <div class="colunas">
                ${recentes.map((h) => {
                    const data = new Date(h.data).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                    return `
                <div class="coluna" tabindex="0" data-dica="${esc(data)}|${numero(h.passou)} aprovadas|${plural(h.falhou, 'falha')}|${esc(h.suites.join(' + '))}">
                    ${h.falhou ? `<span class="col-seg ruim" style="height:${(h.falhou / maior) * 100}%"></span>` : ''}
                    <span class="col-seg ok" style="height:${(h.passou / maior) * 100}%"></span>
                </div>`;
                }).join('')}
            </div>
        </figure>`;
    }

    return `
    <section id="processo" aria-labelledby="t-processo">
        <p class="kicker">Todo dia, a cada mudança</p>
        <h2 id="t-processo" class="pixel">Nada chega ao jogador sem passar por aqui</h2>
        <p class="intro">Este relatório não é uma foto tirada para a apresentação. A mesma bateria roda sozinha a cada alteração no código, e uma alteração que quebre qualquer verificação é barrada antes de ser integrada.</p>
        <ol class="pipeline">${passos}</ol>
        ${execucoes}
    </section>`;
}

// ---------------------------------------------------------------- detalhe

function htmlTeste(no) {
    const falha = temFalha(no);
    const erro = no.erro && !no.erro.soPorFilhos ? `
        <div class="erro">
            <pre class="mensagem">${esc(no.erro.mensagem)}</pre>
            ${no.erro.stack ? `<details class="stack"><summary>stack</summary><pre>${esc(no.erro.stack)}</pre></details>` : ''}
        </div>` : '';
    const anexos = (no.anexos ?? []).map((a) => `
        <figure class="anexo"><img src="${a.dataUri}" alt="${esc(a.nome)}" loading="lazy"><figcaption>${esc(a.nome)}</figcaption></figure>`).join('');
    const trace = no.trace ? `<p class="dica-trace">trace: <code>npx playwright show-trace ${esc(no.trace)}</code></p>` : '';
    const tentativas = no.tentativas > 1 ? `<span class="etiqueta">${no.tentativas} tentativas</span>` : '';
    const filhos = no.filhos?.length ? `<ul>${no.filhos.map(htmlTeste).join('')}</ul>` : '';

    return `
    <li class="teste ${no.estado}"${falha ? ' data-falha' : ''} data-titulo="${esc(no.titulo.toLowerCase())}">
        <div class="linha">
            <b class="st ${no.estado}" aria-label="${ROTULO[no.estado]}">${ICONE[no.estado]}</b>
            <span class="titulo">${esc(no.titulo)}</span>
            ${tentativas}
            <span class="duracao">${formatarDuracao(no.duracaoMs)}</span>
        </div>
        ${erro}${anexos}${trace}${filhos}
    </li>`;
}

function htmlArquivo({ arquivo, testes }) {
    const conta = contar(testes);
    const falha = testes.some(temFalha);
    return `
    <details class="arquivo"${falha ? ' open data-falha' : ''}>
        <summary>
            <b class="st ${falha ? 'falhou' : 'passou'}" aria-label="${falha ? 'falhou' : 'passou'}">${falha ? ICONE.falhou : ICONE.passou}</b>
            <span class="caminho">${esc(arquivo)}</span>
            <span class="placar-arq">${conta.passou}/${conta.total}</span>
            <span class="duracao">${formatarDuracao(somaDuracao(testes))}</span>
        </summary>
        <ul class="arvore">${testes.map(htmlTeste).join('')}</ul>
    </details>`;
}

function secaoDetalhe(suites) {
    const nomeSuite = { API: 'Servidor (API, bots e documentação)', E2E: 'Navegador real (E2E)' };
    return `
    <section id="detalhes" aria-labelledby="t-detalhes">
        <p class="kicker">Para a equipe técnica</p>
        <h2 id="t-detalhes" class="pixel">Cada verificação, uma a uma</h2>
        <div class="ferramentas">
            <input id="busca" type="search" placeholder="Buscar teste ou arquivo…" aria-label="Buscar teste ou arquivo">
            <button type="button" class="botao" id="soFalhas" aria-pressed="false">Só falhas</button>
            <button type="button" class="botao" id="expandir">Expandir tudo</button>
            <button type="button" class="botao" id="recolher">Recolher tudo</button>
        </div>
        ${suites.map((s) => `
        <h3 class="suite-nome">${esc(nomeSuite[s.nome] ?? s.nome)} <span class="suave">· ${formatarDuracao(s.duracaoMs)}</span></h3>
        ${s.erroGeral ? `<div class="erro"><pre class="mensagem">${esc(s.erroGeral)}</pre></div>` : ''}
        ${s.arquivos.map(htmlArquivo).join('')}`).join('')}
    </section>`;
}

// ---------------------------------------------------------------- página

export function montarPagina({ geradoEm, ramo, commit, suites, cobertura: coberturaBruta, telas, historico }) {
    const contagem = contar(suites.flatMap(testesDe));
    const falhas = coletarFalhas(suites);
    const areas = agregarAreas(suites);
    const cobertura = agregarCobertura(coberturaBruta);
    const versao = [ramo, commit].filter(Boolean).join(' @ ');

    const navegacao = [
        ['garantias', 'Garantias'],
        cobertura && ['cobertura', 'Cobertura'],
        telas.length && ['navegador', 'Navegador'],
        ['processo', 'Processo'],
        ['detalhes', 'Detalhes'],
    ].filter(Boolean);

    return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Qualidade Contra ZAP</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&family=Archivo:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root {
    color-scheme: dark;
    --fundo: #0c0d11; --fundo-alto: #1b1d26; --superficie: #14161d; --superficie-2: #1a1c25;
    --borda: #2e313d; --borda-forte: #4a4f60;
    --texto: #f3ead6; --texto-2: #b9bccb; --suave: #8d93a6;
    --marca: #ff4b3e; --marca-sombra: #5c1712; --ouro: #f5c451;
    --serie-api: #3d9be9; --serie-nav: #c98500;
    --ok: #7fd6a5; --ruim: #ff4b3e; --pulou: #6f7488; --instavel: #f5c451;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; scroll-padding-top: 72px; }
body { margin: 0; background: radial-gradient(120% 60% at 50% 0%, var(--fundo-alto) 0%, var(--fundo) 60%) no-repeat, var(--fundo); color: var(--texto); font: 16px/1.55 Archivo, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
.pixel { font-family: Silkscreen, ui-monospace, monospace; font-weight: 400; letter-spacing: 0.5px; }
code, pre { font-family: ui-monospace, "Cascadia Code", Consolas, monospace; font-size: 13px; }
.suave { color: var(--suave); }
main { max-width: 1120px; margin: 0 auto; padding: 0 16px 80px; }

/* ---------- topo ---------- */
.topo { position: sticky; top: 0; z-index: 10; background: rgba(12, 13, 17, 0.88); backdrop-filter: blur(8px); border-bottom: 1px solid var(--borda); }
.topo-dentro { max-width: 1120px; margin: 0 auto; padding: 12px 16px; display: flex; align-items: center; gap: 20px; }
.logo { font-family: Silkscreen, monospace; font-size: 18px; color: var(--marca); text-shadow: 2px 2px 0 var(--marca-sombra); text-decoration: none; white-space: nowrap; }
.topo nav { display: flex; gap: 4px; overflow-x: auto; margin-left: auto; scrollbar-width: none; }
.topo nav a { color: var(--texto-2); text-decoration: none; font-size: 14px; padding: 6px 10px; border-radius: 6px; white-space: nowrap; }
.topo nav a:hover { color: var(--texto); background: var(--superficie-2); }

/* ---------- hero ---------- */
.hero { padding: 72px 0 40px; }
.kicker { margin: 0 0 10px; color: var(--ouro); font-size: 13px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
.titulo-hero { margin: 0; font-size: clamp(40px, 8vw, 84px); line-height: 1.02; text-transform: uppercase; text-shadow: 4px 4px 0 var(--marca); }
.titulo-hero.alerta { color: var(--marca); text-shadow: 4px 4px 0 var(--marca-sombra); }
.lead { max-width: 640px; margin: 24px 0 0; font-size: 19px; color: var(--texto-2); }
.placar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 24px; margin-top: 40px; padding: 20px 24px; background: var(--superficie); border: 2px solid var(--borda-forte); border-radius: 4px; box-shadow: 6px 6px 0 #000; width: fit-content; max-width: 100%; }
.placar-num { font-size: clamp(44px, 9vw, 72px); line-height: 1; color: var(--ouro); text-shadow: 3px 3px 0 #3a2f16; }
.placar-num span { font-size: 0.45em; color: var(--suave); text-shadow: none; }
.placar-txt { font-size: 17px; font-weight: 600; }
.placar-txt .suave { font-weight: 400; font-size: 14px; }

/* ---------- atenção ---------- */
.atencao { margin: 0 0 32px; padding: 20px 24px; background: #1f1110; border: 2px solid var(--ruim); border-radius: 4px; }
.atencao h2 { margin: 0 0 12px; font-size: 20px; color: var(--ruim); }
.atencao ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 12px; }
.atencao li strong { display: block; }
.atencao code { color: var(--suave); }
.atencao pre { margin: 6px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--texto-2); }

/* ---------- números ---------- */
.numeros { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
.tile { padding: 20px 22px; background: var(--superficie); border: 1px solid var(--borda); border-radius: 4px; border-top: 3px solid var(--serie-api); }
.tile.bom { border-top-color: var(--ok); }
.tile.ruim { border-top-color: var(--ruim); }
.tile-valor { font-size: 40px; line-height: 1.1; }
.tile.bom .tile-valor { color: var(--ok); }
.tile.ruim .tile-valor { color: var(--ruim); }
.tile-rotulo { font-weight: 600; margin-top: 6px; }
.tile-sub { color: var(--suave); font-size: 14px; margin-top: 2px; }

/* ---------- seções ---------- */
section[id]:not(#inicio) { padding-top: 88px; }
section h2 { margin: 0; font-size: clamp(24px, 4vw, 34px); line-height: 1.15; }
.intro { max-width: 720px; color: var(--texto-2); margin: 14px 0 28px; }

.areas { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }
.area { display: flex; flex-direction: column; padding: 18px 20px; background: var(--superficie); border: 1px solid var(--borda); border-radius: 4px; }
.area header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.area h3 { margin: 0; font-size: 17px; }
.area p { margin: 8px 0 14px; color: var(--texto-2); font-size: 15px; flex: 1; }
.selo { font-size: 13px; font-weight: 700; white-space: nowrap; padding: 2px 10px; border-radius: 999px; font-variant-numeric: tabular-nums; }
.selo.ok { color: var(--ok); background: rgba(127, 214, 165, 0.1); }
.selo.ruim { color: var(--ruim); background: rgba(255, 75, 62, 0.12); }
.area.ruim { border-color: var(--ruim); }
.camadas { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 13px; color: var(--suave); }
.mk { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; }
.mk.api { background: var(--serie-api); } .mk.nav { background: var(--serie-nav); }
.mk.ok { background: var(--ok); } .mk.ruim { background: var(--ruim); }

/* ---------- gráficos ---------- */
.grafico { margin: 28px 0 0; padding: 20px 22px; background: var(--superficie); border: 1px solid var(--borda); border-radius: 4px; }
.grafico figcaption { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 20px; margin-bottom: 18px; }
.legenda { display: flex; gap: 16px; font-size: 13px; color: var(--texto-2); }
.barras { display: grid; gap: 10px; }
.barra-linha { display: grid; grid-template-columns: minmax(120px, 210px) 1fr auto; align-items: center; gap: 12px; }
.barra-nome { font-size: 14px; color: var(--texto-2); text-align: right; }
.barra-trilho { display: flex; align-items: center; gap: 2px; height: 22px; }
.barra-trilho.cheio { background: var(--superficie-2); border-radius: 0 4px 4px 0; }
.seg { display: block; height: 100%; min-width: 3px; }
.seg:last-of-type { border-radius: 0 4px 4px 0; }
.seg.api { background: var(--serie-api); } .seg.nav { background: var(--serie-nav); }
.seg:hover, .seg:focus-visible, .barra-trilho.cheio:hover .seg { filter: brightness(1.2); outline: none; }
.barra-total { padding-left: 8px; font-size: 13px; color: var(--texto-2); font-variant-numeric: tabular-nums; }
.barra-pct { font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; min-width: 52px; text-align: right; }

.anel-linha { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; }
.anel { position: relative; display: grid; justify-items: center; padding: 22px 16px; background: var(--superficie); border: 1px solid var(--borda); border-radius: 4px; text-align: center; }
.anel svg { width: 132px; height: 132px; }
.anel-trilho { fill: none; stroke: var(--superficie-2); stroke-width: 12; }
.anel-valor { fill: none; stroke: var(--serie-api); stroke-width: 12; stroke-linecap: butt; }
.anel-num { position: absolute; top: 22px; height: 132px; display: grid; place-items: center; font-size: 26px; }
.anel-rotulo { margin-top: 10px; color: var(--texto-2); font-size: 14px; max-width: 190px; }

/* ---------- galeria ---------- */
.galeria { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
.tela { margin: 0; background: var(--superficie); border: 1px solid var(--borda); border-radius: 4px; overflow: hidden; }
.tela.falhou { border-color: var(--ruim); }
.tela-abrir { display: block; width: 100%; padding: 0; border: 0; background: #000; cursor: zoom-in; }
.tela-abrir img { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; object-position: top; transition: opacity 0.15s; }
.tela-abrir:hover img { opacity: 0.85; }
.tela figcaption { padding: 10px 14px 14px; display: grid; gap: 4px; }
.tela-area { color: var(--ouro); font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
.tela-titulo { font-size: 14px; }
dialog#ampliada { max-width: min(1200px, 94vw); padding: 12px; background: var(--superficie); color: var(--texto); border: 2px solid var(--borda-forte); border-radius: 4px; }
dialog#ampliada::backdrop { background: rgba(0, 0, 0, 0.8); }
dialog#ampliada img { display: block; max-width: 100%; max-height: 78vh; margin: 0 auto; }
dialog#ampliada p { margin: 10px 4px; }
dialog#ampliada form { text-align: right; }

/* ---------- processo ---------- */
.pipeline { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; counter-reset: passo; }
.passo { position: relative; display: grid; gap: 6px; padding: 18px 20px; background: var(--superficie); border: 1px solid var(--borda); border-radius: 4px; }
.passo span:last-child { color: var(--texto-2); font-size: 14px; }
.passo-num { width: 34px; height: 34px; display: grid; place-items: center; background: var(--marca); color: var(--fundo); font-size: 18px; box-shadow: 3px 3px 0 var(--marca-sombra); margin-bottom: 4px; }
.sequencia { margin: -6px 0 16px; color: var(--texto-2); }
.sequencia b { color: var(--ok); font-size: 22px; margin-right: 4px; }
.colunas { display: flex; align-items: flex-end; gap: 6px; height: 140px; border-bottom: 1px solid var(--borda-forte); }
.coluna { flex: 1; max-width: 36px; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; gap: 2px; cursor: default; }
.col-seg { display: block; width: 100%; min-height: 3px; }
.col-seg:first-child { border-radius: 4px 4px 0 0; }
.col-seg.ok { background: var(--ok); } .col-seg.ruim { background: var(--ruim); }
.coluna:hover .col-seg, .coluna:focus-visible .col-seg { filter: brightness(1.2); }
.coluna:focus-visible { outline: none; }

/* ---------- detalhe ---------- */
.ferramentas { position: sticky; top: 57px; z-index: 5; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 20px 0 8px; padding: 10px 0; background: var(--fundo); }
.ferramentas input { flex: 1 1 220px; min-width: 0; padding: 8px 12px; border: 1px solid var(--borda-forte); border-radius: 4px; background: var(--superficie); color: var(--texto); font: inherit; font-size: 15px; }
.botao { padding: 8px 14px; border: 1px solid var(--borda-forte); border-radius: 4px; background: var(--superficie-2); color: var(--texto); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
.botao:hover { border-color: var(--texto-2); }
.botao[aria-pressed="true"] { background: var(--texto); color: var(--fundo); border-color: var(--texto); }
.suite-nome { margin: 28px 0 10px; font-size: 18px; }
.suite-nome .suave { font-weight: 400; font-size: 14px; }
.arquivo { background: var(--superficie); border: 1px solid var(--borda); border-radius: 4px; margin-bottom: 6px; }
.arquivo[data-falha] { border-color: var(--ruim); }
.arquivo > summary { display: flex; align-items: center; gap: 10px; padding: 10px 14px; cursor: pointer; list-style: none; }
.arquivo > summary::-webkit-details-marker { display: none; }
.arquivo > summary::after { content: "▸"; color: var(--suave); order: -1; transition: transform 0.15s; }
.arquivo[open] > summary::after { transform: rotate(90deg); }
.caminho { font-family: ui-monospace, "Cascadia Code", Consolas, monospace; font-size: 13.5px; overflow-wrap: anywhere; }
.placar-arq { margin-left: auto; color: var(--suave); font-size: 13px; font-variant-numeric: tabular-nums; }
.duracao { color: var(--suave); font-size: 12.5px; font-variant-numeric: tabular-nums; white-space: nowrap; min-width: 58px; text-align: right; }
.st { display: inline-block; width: 16px; text-align: center; font-size: 13px; font-weight: 700; flex: none; }
.st.passou { color: var(--ok); } .st.falhou { color: var(--ruim); } .st.pulou { color: var(--pulou); } .st.instavel { color: var(--instavel); }
ul.arvore, ul.arvore ul { list-style: none; margin: 0; padding: 0; }
ul.arvore { padding: 4px 14px 12px 34px; border-top: 1px solid var(--borda); }
ul.arvore ul { padding-left: 20px; border-left: 1px solid var(--borda); margin-left: 7px; }
.linha { display: flex; align-items: baseline; gap: 8px; padding: 4px 0; font-size: 14.5px; }
.titulo { flex: 1; overflow-wrap: anywhere; }
.teste.falhou > .linha > .titulo { color: var(--ruim); font-weight: 600; }
.teste.pulou > .linha > .titulo { color: var(--suave); }
.etiqueta { font-size: 11.5px; padding: 1px 8px; border-radius: 999px; background: var(--superficie-2); color: var(--instavel); }
.erro { margin: 4px 0 10px 24px; background: #1f1110; border-left: 3px solid var(--ruim); border-radius: 4px; padding: 10px 12px; }
.erro pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.erro .stack { margin-top: 8px; color: var(--suave); }
.erro .stack summary { cursor: pointer; font-size: 12.5px; }
.anexo { margin: 6px 0 10px 24px; }
.anexo img { display: block; max-width: 100%; border: 1px solid var(--borda); border-radius: 4px; }
.anexo figcaption, .dica-trace { font-size: 12.5px; color: var(--suave); }
.dica-trace { margin: 4px 0 8px 24px; }
body.so-falhas .arquivo:not([data-falha]), body.so-falhas .teste:not([data-falha]) { display: none; }
.escondido { display: none !important; }

/* ---------- tooltip ---------- */
#dica { position: fixed; z-index: 20; pointer-events: none; padding: 8px 12px; background: #000; border: 1px solid var(--borda-forte); border-radius: 4px; font-size: 13px; line-height: 1.45; box-shadow: 3px 3px 0 #000; opacity: 0; transition: opacity 0.1s; max-width: 280px; }
#dica.visivel { opacity: 1; }
#dica strong { display: block; margin-bottom: 2px; }
#dica span { display: block; color: var(--texto-2); }

footer { margin-top: 80px; padding-top: 24px; border-top: 1px solid var(--borda); color: var(--suave); font-size: 14px; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 24px; }
footer code { color: var(--texto-2); }

@media (max-width: 640px) {
    .hero { padding-top: 40px; }
    .topo nav { display: none; }
    .barra-linha { grid-template-columns: 1fr auto; }
    .barra-nome { grid-column: 1 / -1; text-align: left; }
    .barra-trilho { grid-column: 1; }
    .areas { grid-template-columns: 1fr; }
}

/* Exportar em PDF pelo navegador (Ctrl+P) mantém o visual escuro. */
@media print {
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .topo { position: static; }
    .ferramentas, .tela-abrir { cursor: default; }
    .ferramentas { display: none; }
    .area, .tile, .passo, .tela, .grafico, .anel { break-inside: avoid; }
    section[id]:not(#inicio) { padding-top: 40px; }
}
</style>
</head>
<body>
<header class="topo">
    <div class="topo-dentro">
        <a class="logo" href="#inicio">CONTRA ZAP</a>
        <nav aria-label="Seções">${navegacao.map(([id, nome]) => `<a href="#${id}">${nome}</a>`).join('')}</nav>
    </div>
</header>
<main>
    ${secaoHero({ contagem, falhas, suites, geradoEm })}
    ${secaoAtencao(falhas)}
    ${secaoNumeros({ contagem, suites, cobertura, areas })}
    ${secaoAreas(areas)}
    ${secaoCobertura(cobertura)}
    ${secaoTelas(telas)}
    ${secaoProcesso(historico)}
    ${secaoDetalhe(suites)}

    <footer>
        <span>Gerado em ${esc(geradoEm.toLocaleString('pt-BR'))}${versao ? ` · versão <code>${esc(versao)}</code>` : ''}</span>
        <span>Reproduza com <code>npm run test:relatorio</code></span>
    </footer>
</main>
<div id="dica" role="tooltip"></div>
<script>
// Tooltip único para todos os gráficos: o conteúdo vem de data-dica,
// partes separadas por "|" (a primeira vira o título).
const dica = document.getElementById('dica');
function mostrarDica(alvo, x, y) {
    const [titulo, ...linhas] = alvo.dataset.dica.split('|');
    dica.innerHTML = '';
    const forte = document.createElement('strong');
    forte.textContent = titulo;
    dica.append(forte, ...linhas.map((l) => Object.assign(document.createElement('span'), { textContent: l })));
    const caixa = dica.getBoundingClientRect();
    dica.style.left = Math.min(x + 14, innerWidth - caixa.width - 8) + 'px';
    dica.style.top = Math.max(8, y - caixa.height - 12) + 'px';
    dica.classList.add('visivel');
}
for (const alvo of document.querySelectorAll('[data-dica]')) {
    alvo.addEventListener('pointermove', (e) => mostrarDica(alvo, e.clientX, e.clientY));
    alvo.addEventListener('pointerleave', () => dica.classList.remove('visivel'));
    alvo.addEventListener('focus', () => { const r = alvo.getBoundingClientRect(); mostrarDica(alvo, r.left + r.width / 2, r.top); });
    alvo.addEventListener('blur', () => dica.classList.remove('visivel'));
}

// Galeria: clique amplia a tela num <dialog>.
const ampliada = document.getElementById('ampliada');
for (const botao of document.querySelectorAll('.tela-abrir')) {
    botao.addEventListener('click', () => {
        const figura = botao.closest('figure');
        ampliada.querySelector('img').src = botao.querySelector('img').src;
        ampliada.querySelector('img').alt = botao.querySelector('img').alt;
        ampliada.querySelector('p').textContent = figura.querySelector('.tela-titulo').textContent.trim();
        ampliada.showModal();
    });
}
ampliada?.addEventListener('click', (e) => { if (e.target === ampliada) ampliada.close(); });

// Detalhe técnico: filtro de falhas, expandir/recolher e busca.
const arquivos = [...document.querySelectorAll('.arquivo')];
document.getElementById('soFalhas').addEventListener('click', (e) => {
    const ligado = document.body.classList.toggle('so-falhas');
    e.currentTarget.setAttribute('aria-pressed', String(ligado));
});
document.getElementById('expandir').addEventListener('click', () => arquivos.forEach((a) => (a.open = true)));
document.getElementById('recolher').addEventListener('click', () => arquivos.forEach((a) => (a.open = false)));

// Um teste aparece se o título dele, de um ancestral ou de um descendente
// bate com a busca; um arquivo aparece se o caminho bate ou se sobrou algum
// teste visível dentro.
function filtrar(li, termo, ancestralBate) {
    const proprio = ancestralBate || li.dataset.titulo.includes(termo);
    let algumFilho = false;
    for (const filho of li.querySelectorAll(':scope > ul > li')) {
        if (filtrar(filho, termo, proprio)) algumFilho = true;
    }
    const visivel = proprio || algumFilho;
    li.classList.toggle('escondido', !visivel);
    return visivel;
}
document.getElementById('busca').addEventListener('input', (e) => {
    const termo = e.target.value.trim().toLowerCase();
    for (const arquivo of arquivos) {
        const caminhoBate = arquivo.querySelector('.caminho').textContent.toLowerCase().includes(termo);
        let algum = false;
        for (const li of arquivo.querySelectorAll(':scope > ul > li')) {
            if (filtrar(li, termo, caminhoBate)) algum = true;
        }
        arquivo.classList.toggle('escondido', !algum);
        if (termo && algum) arquivo.open = true;
    }
});
</script>
</body>
</html>
`;
}
