import { useEffect, useRef, useState } from 'react';

// Desenho do cérebro de uma decisão: entradas (agrupadas pelo que
// significam), as duas camadas escondidas (grade de neurônios acendendo pela
// ativação) e as saídas da cabeça usada (aposta ou carta) com a
// probabilidade de cada opção. As ligações desenhadas são só o "caminho" da
// escolha: os neurônios da 2ª camada que mais empurraram a opção escolhida
// (peso x ativação), os da 1ª que mais alimentaram esses, e as entradas que
// mais alimentaram esses — o resto das ~95 mil ligações viraria um borrão.
// Cada decisão nova anima da esquerda pra direita (entrada → saída).

// Colunas por grupo de entrada (o grupo vira uma gradezinha).
const COLUNAS_GRUPO = {
    'Minha mão': 3,
    Mesa: 4,
    Jogadores: 4,
    Rodada: 2,
    'Cartas já jogadas': 4,
    'Cartas dos outros': 3,
};
const TOP_SAIDA = 10;    // neurônios da 2ª camada no caminho
const TOP_MEIO = 4;      // da 1ª camada por neurônio da 2ª
const TOP_ENTRADA = 4;   // entradas por neurônio da 1ª
const DURACAO_MS = 1600; // propagação inteira, na velocidade 1x
// Centro de cada coluna, em fração da largura.
const X_COLUNA = { entrada: 0.15, h1: 0.37, h2: 0.56, saida: 0.73 };

const COR_FUNDO_NEURONIO = '#1d2029';
const COR_BORDA_NEURONIO = '#2e313d';

function faixa(p, ini, fim) {
    return Math.max(0, Math.min(1, (p - ini) / (fim - ini)));
}

function corAtivacao(t, alfa = 1) {
    // escuro -> âmbar -> quase branco
    const r = Math.round(40 + 215 * Math.min(1, t * 1.2));
    const g = Math.round(42 + 170 * t);
    const b = Math.round(55 + 60 * t * t);
    return `rgba(${r}, ${g}, ${b}, ${alfa})`;
}

function topIndices(valores, k, filtro = () => true) {
    return valores
        .map((v, i) => [v, i])
        .filter(([, i]) => filtro(i))
        .sort((a, b) => Math.abs(b[0]) - Math.abs(a[0]))
        .slice(0, k);
}

// Caminho da escolha: [{ de, para, contrib }] por camada.
function calcularCaminho(decisao) {
    const { rede, detalhe, obs, escolha } = decisao;
    const pesosSaida = decisao.fase === 'aposta' ? rede.apw : rede.caw;
    const c2 = detalhe.h2.map((h, j) => pesosSaida[escolha][j] * h);
    const saida = topIndices(c2, TOP_SAIDA).map(([c, j]) => ({ de: j, para: escolha, contrib: c }));
    const meio = [];
    for (const { de: j } of saida) {
        const c1 = detalhe.h1.map((h, k) => rede.t2w[j][k] * h);
        for (const [c, k] of topIndices(c1, TOP_MEIO)) meio.push({ de: k, para: j, contrib: c });
    }
    const entrada = [];
    const vistos = new Set();
    for (const { de: k } of meio) {
        if (vistos.has(k)) continue;
        vistos.add(k);
        const c0 = obs.map((x, i) => rede.t0w[k][i] * x);
        for (const [c, i] of topIndices(c0, TOP_ENTRADA, (i) => obs[i] !== 0)) entrada.push({ de: i, para: k, contrib: c });
    }
    return { entrada, meio, saida };
}

// Posição de cada neurônio, em px do canvas.
function calcularLayout(largura, altura, decisao) {
    const margemTopo = 70;
    const margemBase = 30;
    const util = altura - margemTopo - margemBase;

    // Entradas: grupos empilhados, cada um numa gradezinha.
    const grupos = [];
    decisao.rotulos.forEach((r, i) => {
        const ultimo = grupos[grupos.length - 1];
        if (ultimo && ultimo.nome === r.grupo) ultimo.indices.push(i);
        else grupos.push({ nome: r.grupo, indices: [i] });
    });
    const linhasTotais = grupos.reduce((s, g) => s + Math.ceil(g.indices.length / (COLUNAS_GRUPO[g.nome] ?? 4)), 0);
    const passo = Math.min(14, (util - grupos.length * 22) / linhasTotais);
    const xEntrada = largura * X_COLUNA.entrada;
    const entradas = [];
    const rotulosGrupo = [];
    let y = margemTopo;
    for (const g of grupos) {
        const colunas = COLUNAS_GRUPO[g.nome] ?? 4;
        y += 18;
        rotulosGrupo.push({ nome: g.nome, y: y - 6 });
        g.indices.forEach((indice, n) => {
            const coluna = n % colunas;
            const linha = Math.floor(n / colunas);
            entradas[indice] = { x: xEntrada + (coluna - (colunas - 1) / 2) * passo, y: y + linha * passo };
        });
        y += Math.ceil(g.indices.length / colunas) * passo + 4;
    }
    const raioEntrada = Math.max(2, passo * 0.36);

    // Camadas escondidas em grade quadrada.
    function grade(n, xCentro) {
        const colunas = Math.ceil(Math.sqrt(n));
        const linhas = Math.ceil(n / colunas);
        const lado = Math.min(util / linhas, (largura * 0.17) / colunas);
        const yIni = margemTopo + (util - linhas * lado) / 2 + lado / 2;
        return {
            lado,
            pontos: Array.from({ length: n }, (_, i) => ({
                x: xCentro + ((i % colunas) - (colunas - 1) / 2) * lado,
                y: yIni + Math.floor(i / colunas) * lado,
            })),
        };
    }
    const h1 = grade(decisao.detalhe.h1.length, largura * X_COLUNA.h1);
    const h2 = grade(decisao.detalhe.h2.length, largura * X_COLUNA.h2);

    // Saídas em coluna.
    const n = decisao.logits.length;
    const passoSaida = Math.min(34, util / n);
    const ySaida = margemTopo + (util - (n - 1) * passoSaida) / 2;
    const saidas = Array.from({ length: n }, (_, i) => ({ x: largura * X_COLUNA.saida, y: ySaida + i * passoSaida }));

    return { entradas, rotulosGrupo, raioEntrada, h1, h2, saidas, passoSaida, xEntrada };
}

function desenhar(ctx, largura, altura, decisao, layout, caminho, p, rotuloSaida) {
    ctx.clearRect(0, 0, largura, altura);
    const { detalhe, obs, probs, mask, escolha } = decisao;

    // Rótulos das camadas.
    ctx.font = '11px Silkscreen, monospace';
    ctx.fillStyle = '#8d93a6';
    ctx.textAlign = 'center';
    ctx.fillText(`ENTRADAS (${obs.length})`, layout.xEntrada, 40);
    ctx.fillText(`CAMADA 1 (${detalhe.h1.length})`, largura * X_COLUNA.h1, 40);
    ctx.fillText(`CAMADA 2 (${detalhe.h2.length})`, largura * X_COLUNA.h2, 40);
    ctx.fillText(decisao.fase === 'aposta' ? 'APOSTA' : 'CARTA', largura * X_COLUNA.saida, 40);

    const maxContrib = (lista) => Math.max(1e-6, ...lista.map((l) => Math.abs(l.contrib)));
    function ligacoes(lista, de, para, ini, fim) {
        const t = faixa(p, ini, fim);
        if (t <= 0) return;
        const max = maxContrib(lista);
        for (const l of lista) {
            const a = de[l.de];
            const b = para[l.para];
            const forca = Math.abs(l.contrib) / max;
            ctx.strokeStyle = l.contrib >= 0 ? `rgba(245, 196, 81, ${0.15 + 0.6 * forca})` : `rgba(125, 211, 252, ${0.12 + 0.5 * forca})`;
            ctx.lineWidth = 0.6 + 2 * forca;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
            ctx.stroke();
        }
    }
    ligacoes(caminho.entrada, layout.entradas, layout.h1.pontos, 0.12, 0.34);
    ligacoes(caminho.meio, layout.h1.pontos, layout.h2.pontos, 0.42, 0.6);
    ligacoes(caminho.saida, layout.h2.pontos, layout.saidas, 0.66, 0.84);

    // Entradas.
    ctx.textAlign = 'right';
    ctx.font = '10px Silkscreen, monospace';
    for (const r of layout.rotulosGrupo) {
        ctx.fillStyle = '#c9cbd6';
        ctx.fillText(r.nome.toUpperCase(), layout.xEntrada - 40, r.y + 10);
    }
    const tEntrada = faixa(p, 0, 0.14);
    obs.forEach((v, i) => {
        const pt = layout.entradas[i];
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, layout.raioEntrada, 0, Math.PI * 2);
        ctx.fillStyle = v === 0 ? COR_FUNDO_NEURONIO : corAtivacao(Math.min(1, Math.abs(v)) * tEntrada + 0.0001);
        ctx.fill();
    });

    // Camadas escondidas.
    function camada(valores, g, ini, fim, destacados) {
        const t = faixa(p, ini, fim);
        const max = Math.max(1e-6, ...valores);
        const raio = Math.max(1.4, g.lado * 0.36);
        valores.forEach((v, i) => {
            const pt = g.pontos[i];
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, raio, 0, Math.PI * 2);
            ctx.fillStyle = v <= 0 ? COR_FUNDO_NEURONIO : corAtivacao((v / max) * t + 0.0001);
            ctx.fill();
            if (destacados.has(i) && t > 0) {
                ctx.strokeStyle = `rgba(255, 244, 194, ${0.8 * t})`;
                ctx.lineWidth = 1.2;
                ctx.stroke();
            }
        });
    }
    camada(detalhe.h1, layout.h1, 0.3, 0.46, new Set(caminho.meio.map((l) => l.de)));
    camada(detalhe.h2, layout.h2, 0.56, 0.7, new Set(caminho.saida.map((l) => l.de)));

    // Saídas com a probabilidade de cada opção.
    const tSaida = faixa(p, 0.8, 1);
    const larguraBarra = largura * 0.09;
    ctx.textAlign = 'left';
    probs.forEach((prob, i) => {
        const pt = layout.saidas[i];
        const legal = mask[i] === 1;
        const escolhida = i === escolha;
        const raio = Math.min(9, layout.passoSaida * 0.32);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, raio, 0, Math.PI * 2);
        ctx.fillStyle = !legal ? '#15161c' : corAtivacao(prob * tSaida + 0.0001);
        ctx.fill();
        ctx.strokeStyle = escolhida && tSaida > 0.5 ? '#f5c451' : COR_BORDA_NEURONIO;
        ctx.lineWidth = escolhida && tSaida > 0.5 ? 2.5 : 1;
        ctx.stroke();

        const xTexto = pt.x + raio + 8;
        ctx.font = `${escolhida ? 13 : 11}px Silkscreen, monospace`;
        ctx.fillStyle = !legal ? '#3a3d4a' : escolhida && tSaida > 0.5 ? '#f5c451' : '#c9cbd6';
        const rotulo = rotuloSaida(i);
        ctx.fillText(rotulo, xTexto, pt.y + 4);
        if (legal) {
            const xBarra = xTexto + 64;
            ctx.fillStyle = '#20232c';
            ctx.fillRect(xBarra, pt.y - 4, larguraBarra, 8);
            ctx.fillStyle = escolhida ? '#f5c451' : '#7d8296';
            ctx.fillRect(xBarra, pt.y - 4, larguraBarra * prob * tSaida, 8);
            ctx.font = '10px Silkscreen, monospace';
            ctx.fillStyle = '#8d93a6';
            ctx.fillText(`${Math.round(prob * 100 * tSaida)}%`, xBarra + larguraBarra + 6, pt.y + 4);
        }
    });
}

// Neurônio mais perto do mouse (pro tooltip).
function neuronioEm(layout, decisao, x, y) {
    const candidatos = [];
    layout.entradas.forEach((pt, i) => candidatos.push({ pt, texto: `${decisao.rotulos[i].grupo} · ${decisao.rotulos[i].rotulo}: ${decisao.obs[i].toFixed(2)}`, raio: layout.raioEntrada + 3 }));
    layout.h1.pontos.forEach((pt, i) => candidatos.push({ pt, texto: `Camada 1 · neurônio ${i + 1}: ${decisao.detalhe.h1[i].toFixed(2)}`, raio: layout.h1.lado * 0.5 }));
    layout.h2.pontos.forEach((pt, i) => candidatos.push({ pt, texto: `Camada 2 · neurônio ${i + 1}: ${decisao.detalhe.h2[i].toFixed(2)}`, raio: layout.h2.lado * 0.5 }));
    let melhor = null;
    for (const c of candidatos) {
        const d = Math.hypot(c.pt.x - x, c.pt.y - y);
        if (d <= c.raio && (!melhor || d < melhor.d)) melhor = { ...c, d };
    }
    return melhor;
}

export default function RedeCanvas({ decisao, velocidade, rotuloSaida }) {
    const caixaRef = useRef(null);
    const canvasRef = useRef(null);
    const [tamanho, setTamanho] = useState(null);
    const [dica, setDica] = useState(null);
    const layoutRef = useRef(null);

    useEffect(() => {
        const caixa = caixaRef.current;
        const medir = () => setTamanho({ largura: caixa.clientWidth, altura: caixa.clientHeight });
        medir();
        const observador = new ResizeObserver(medir);
        observador.observe(caixa);
        return () => observador.disconnect();
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !tamanho || !decisao) return undefined;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = tamanho.largura * dpr;
        canvas.height = tamanho.altura * dpr;
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const layout = calcularLayout(tamanho.largura, tamanho.altura, decisao);
        layoutRef.current = layout;
        const caminho = calcularCaminho(decisao);
        const duracao = DURACAO_MS / velocidade;
        const inicio = performance.now();
        let quadro;
        const passo = (agora) => {
            const p = Math.min(1, (agora - inicio) / duracao);
            desenhar(ctx, tamanho.largura, tamanho.altura, decisao, layout, caminho, p, rotuloSaida);
            if (p < 1) quadro = requestAnimationFrame(passo);
        };
        quadro = requestAnimationFrame(passo);
        return () => cancelAnimationFrame(quadro);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- rotuloSaida muda junto com a decisão
    }, [decisao, tamanho, velocidade]);

    function aoMover(e) {
        const layout = layoutRef.current;
        if (!layout || !decisao) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const alvo = neuronioEm(layout, decisao, x, y);
        setDica(alvo ? { x, y, texto: alvo.texto } : null);
    }

    return (
        <div ref={caixaRef} className="lab-rede">
            <canvas ref={canvasRef} style={tamanho ? { width: tamanho.largura, height: tamanho.altura } : undefined} onMouseMove={aoMover} onMouseLeave={() => setDica(null)} />
            {dica && <div className="lab-dica" style={{ left: dica.x + 14, top: dica.y + 10 }}>{dica.texto}</div>}
        </div>
    );
}
