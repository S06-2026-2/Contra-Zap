import { useEffect, useRef, useState } from 'react';
import { FILTRO_PADRAO, useFiltros } from '../arcade/filtros.js';
import { DefsFiltro, PainelFiltro } from '../arcade/PainelFiltro.jsx';

// "FILTRO DE TELA" do meetfront1: o mesmo filtro e o mesmo painel da casca
// arcade (ver arcade/Casca.jsx), aplicados em tudo do meetfront1 — tela de
// espera (forçar início) e mesa. Lembrado à parte do arcade, com um ponto
// de partida próprio. O volume do som é o do app inteiro (somArcade.js,
// já começa em 70). O painel fica fora da camada filtrada, no canto de
// cima à direita (ver .mf1-filtro em meetfront1.css) — embaixo à direita
// é o canto do seu fantasminha/medalhão da vida.
const CHAVE_FILTRO_MF1 = 'contrazap-meetfront1-filtro';
// Painel escondido por enquanto: o filtro continua aplicado com o padrão
// abaixo (ou o último ajuste salvo neste navegador). true mostra de novo.
const MOSTRAR_PAINEL_FILTRO = false;
const FILTRO_PADRAO_MF1 = {
    ...FILTRO_PADRAO,
    grao: 2,
    graoAnimado: true,
    curvatura: 0,
    scanlines: 51,
    scanlinePasso: 4,
    aberracao: 23,
};

// Qual filtro a mesa usa. false (padrão) = filtro LEVE: o grão é uma imagem
// de ruído pronta por cima da tela (mesma mistura soft-light das scanlines)
// e a aberração só liga durante o choque da manilha. true = filtro ANTIGO:
// grão (feTurbulence) e aberração como `filter: url(...)` SVG na camada da
// tela inteira, o tempo todo — a demo de desempenho (DemoBeta.jsx) mostrou
// que isso derruba o fps no celular sempre que uma carta atravessa a tela
// (S20 FE: ~42 fps com ele, ~47 sem). Guardado pra comparar com o grupo.
// O leve ignora `efeito` e `curvatura` (os dois só existem como filtro);
// o padrão do meetfront1 não usa nenhum dos dois.
export const FILTRO_ANTIGO_SVG = false;

// Choque de manilha: quando uma manilha bate na mesa (a mesa dispara
// EVENTO_IMPACTO_MANILHA, ver dispararImpactoManilha), a aberração da tela
// salta CHOQUE_PICO_PX a mais e volta ao ajuste normal em CHOQUE_DURACAO_MS,
// tremendo no caminho — como se a carta mexesse no próprio aparelho. Só
// soma por cima do ajuste salvo, nunca grava nada.
//
// CHOQUE_MODO escolhe como (a demo de desempenho troca pela prop
// `choqueModo`):
// - 'tela': o descrito acima — `filter: url(#cz-crt)` na tela inteira,
//   refeito a cada quadro enquanto durar.
// - 'curto': o mesmo filtro, só por CHOQUE_CURTO_MS e sem o tremido (o
//   valor muda poucas vezes).
// - 'glitch': nenhum filtro — faixas coloridas e rasgos de imagem
//   pré-desenhados num sprite (ChoqueGlitch) piscam por cima da tela e
//   apagam; só imagem trocando por transform e opacidade.
// - 'franjas': as cartas e os assentos ganham um fantasma vermelho de um
//   lado e ciano do outro (drop-shadow, filtro de CSS — não SVG), que
//   tremem e somem em CHOQUE_FRANJAS_MS; é o contorno que a aberração faria
//   em tudo que tem borda transparente. O fundo da mesa não muda.
// - 'franjas-glitch': as duas juntas.
const EVENTO_IMPACTO_MANILHA = 'mf1-impacto-manilha';
const CHOQUE_PICO_PX = 14;
const CHOQUE_DURACAO_MS = 900;
const CHOQUE_TREMIDO = 0.35;
const CHOQUE_CURTO_MS = 300;
const CHOQUE_FRANJAS_MS = 650;
export const CHOQUE_MODO = 'franjas-glitch';

export function dispararImpactoManilha() {
    window.dispatchEvent(new Event(EVENTO_IMPACTO_MANILHA));
}

// Devolve o extra de aberração em px (modos 'tela'/'curto'), quantos
// choques com glitch já houve (a camada do glitch remonta a cada um) e o
// choque de franjas em andamento (0 = nenhum; alterna 1/2 pra animação
// recomeçar num choque logo atrás do outro).
function useChoqueAberracao(ativo, modo) {
    const [extra, setExtra] = useState(0);
    const [glitches, setGlitches] = useState(0);
    const [franjas, setFranjas] = useState(0);
    useEffect(() => {
        if (!ativo) return undefined;
        // O sprite do glitch fica pronto antes do primeiro impacto.
        const comGlitch = modo === 'glitch' || modo === 'franjas-glitch';
        const comFranjas = modo === 'franjas' || modo === 'franjas-glitch';
        if (comGlitch) gerarSpriteGlitch();
        let quadro;
        let fimFranjas;
        const duracao = modo === 'curto' ? CHOQUE_CURTO_MS : CHOQUE_DURACAO_MS;
        const tremidoMax = modo === 'curto' ? 0 : CHOQUE_TREMIDO;
        const disparar = () => {
            if (comGlitch || comFranjas) {
                if (comGlitch) setGlitches((n) => n + 1);
                if (comFranjas) {
                    clearTimeout(fimFranjas);
                    setFranjas((n) => (n === 1 ? 2 : 1));
                    fimFranjas = setTimeout(() => setFranjas(0), CHOQUE_FRANJAS_MS);
                }
                return;
            }
            cancelAnimationFrame(quadro);
            const inicio = performance.now();
            const passo = (agora) => {
                const t = Math.min(1, (agora - inicio) / duracao);
                const base = CHOQUE_PICO_PX * (1 - t) ** 2;
                const tremido = (Math.random() * 2 - 1) * base * tremidoMax;
                setExtra(t < 1 ? Math.max(0, Math.round(base + tremido)) : 0);
                if (t < 1) quadro = requestAnimationFrame(passo);
            };
            quadro = requestAnimationFrame(passo);
        };
        window.addEventListener(EVENTO_IMPACTO_MANILHA, disparar);
        return () => {
            window.removeEventListener(EVENTO_IMPACTO_MANILHA, disparar);
            cancelAnimationFrame(quadro);
            clearTimeout(fimFranjas);
        };
    }, [ativo, modo]);
    return { extra, glitches, franjas };
}

// Glitch do choque: CHOQUE_GLITCH_QUADROS quadros em baixa resolução (vira
// pixel grande, no clima arcade) gerados uma vez num canvas — faixas
// horizontais vermelhas e ciano deslocadas pros lados (o "R/B separado" da
// aberração), rasgos brancos finos e chuvisco. A camada cobre a tela em
// mistura screen, passa pelos quadros em degraus e apaga em
// CHOQUE_GLITCH_MS.
const CHOQUE_GLITCH_QUADROS = 8;
const CHOQUE_GLITCH_L = 90;
const CHOQUE_GLITCH_A = 160;
const CHOQUE_GLITCH_MS = 650;
let spriteGlitch = null;

function gerarSpriteGlitch() {
    if (spriteGlitch) return spriteGlitch;
    const canvas = document.createElement('canvas');
    canvas.width = CHOQUE_GLITCH_L;
    canvas.height = CHOQUE_GLITCH_A * CHOQUE_GLITCH_QUADROS;
    const ctx = canvas.getContext('2d');
    for (let q = 0; q < CHOQUE_GLITCH_QUADROS; q++) {
        const y0 = q * CHOQUE_GLITCH_A;
        const forca = 1 - q / CHOQUE_GLITCH_QUADROS;
        const faixas = 3 + Math.round(6 * forca);
        for (let i = 0; i < faixas; i++) {
            const y = y0 + Math.random() * CHOQUE_GLITCH_A;
            const h = 1 + Math.random() * 7 * forca;
            const desloc = (Math.random() * 2 - 1) * 10 * forca;
            ctx.fillStyle = `rgba(255, 40, 60, ${0.25 + 0.35 * Math.random()})`;
            ctx.fillRect(desloc, y, CHOQUE_GLITCH_L, h);
            ctx.fillStyle = `rgba(40, 220, 255, ${0.25 + 0.35 * Math.random()})`;
            ctx.fillRect(-desloc, y + h * 0.5, CHOQUE_GLITCH_L, h);
        }
        const rasgos = 1 + Math.round(3 * forca);
        for (let i = 0; i < rasgos; i++) {
            ctx.fillStyle = `rgba(255, 255, 255, ${0.3 + 0.4 * Math.random()})`;
            ctx.fillRect(Math.random() * CHOQUE_GLITCH_L * 0.5, y0 + Math.random() * CHOQUE_GLITCH_A, CHOQUE_GLITCH_L * (0.3 + Math.random() * 0.7), 1);
        }
        const pontos = Math.round(220 * forca);
        for (let i = 0; i < pontos; i++) {
            ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.35})`;
            ctx.fillRect(Math.floor(Math.random() * CHOQUE_GLITCH_L), y0 + Math.floor(Math.random() * CHOQUE_GLITCH_A), 1, 1);
        }
    }
    spriteGlitch = canvas.toDataURL();
    return spriteGlitch;
}

function ChoqueGlitch() {
    return (
        <div className="mf1-choque-glitch" style={{ animationDuration: `${CHOQUE_GLITCH_MS}ms` }}>
            <div
                className="mf1-choque-glitch-quadros"
                style={{
                    height: `${CHOQUE_GLITCH_QUADROS * 100}%`,
                    backgroundImage: `url(${gerarSpriteGlitch()})`,
                    animationDuration: `${CHOQUE_GLITCH_MS / 2}ms`,
                    animationTimingFunction: `steps(${CHOQUE_GLITCH_QUADROS})`,
                }}
            />
        </div>
    );
}

// Grão leve: um ladrilho de ruído gerado uma vez num canvas e repetido na
// tela, misturado em soft-light com opacidade = a inclinação `grK` do grão
// antigo (lá o ruído é puxado pra perto do cinza 0.5 por esse fator antes
// do soft-light — aqui é o mesmo efeito por opacidade). "Fervendo": a
// camada é maior que a tela e pula pra um deslocamento sorteado ~15x/s via
// transform (só composição, sem repintar nem re-render do React).
const GRAO_LADRILHO_PX = 256;
const GRAO_PASSO_MS = 66;
const ladrilhosGrao = {};

function ladrilhoGrao(colorido) {
    const chave = colorido ? 'cor' : 'cinza';
    if (ladrilhosGrao[chave]) return ladrilhosGrao[chave];
    const canvas = document.createElement('canvas');
    canvas.width = GRAO_LADRILHO_PX;
    canvas.height = GRAO_LADRILHO_PX;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(GRAO_LADRILHO_PX, GRAO_LADRILHO_PX);
    for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = v;
        img.data[i + 1] = colorido ? Math.random() * 255 : v;
        img.data[i + 2] = colorido ? Math.random() * 255 : v;
        img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    ladrilhosGrao[chave] = canvas.toDataURL();
    return ladrilhosGrao[chave];
}

function GraoLeve({ opacidade, animado, colorido }) {
    const ref = useRef(null);
    useEffect(() => {
        if (!animado) return undefined;
        const id = setInterval(() => {
            const x = Math.floor(Math.random() * GRAO_LADRILHO_PX);
            const y = Math.floor(Math.random() * GRAO_LADRILHO_PX);
            if (ref.current) ref.current.style.transform = `translate(${-x}px, ${-y}px)`;
        }, GRAO_PASSO_MS);
        return () => clearInterval(id);
    }, [animado]);
    return (
        <div
            ref={ref}
            className="mf1-grao-leve"
            style={{ backgroundImage: `url(${ladrilhoGrao(colorido)})`, opacity: opacidade }}
        />
    );
}

// `sobrescrita`/`semChoque`/`antigo`/`choqueModo`: só a demo de desempenho
// (DemoBeta.jsx) usa — desliga peças do filtro por cima do ajuste salvo,
// sem gravar, escolhe entre o filtro leve e o antigo e o jeito do choque.
export default function FiltroTela({ children, sobrescrita = null, semChoque = false, antigo = FILTRO_ANTIGO_SVG, choqueModo = CHOQUE_MODO }) {
    const filtroSalvo = useFiltros(CHAVE_FILTRO_MF1, FILTRO_PADRAO_MF1, sobrescrita, { animarSemente: antigo });
    const [aberto, setAberto] = useState(false);
    const { extra: choque, glitches, franjas } = useChoqueAberracao(!semChoque, antigo ? 'tela' : choqueModo);
    if (!antigo) return <FiltroLeve f={filtroSalvo} choque={choque} glitches={glitches} franjas={franjas}>{children}</FiltroLeve>;
    // Durante o choque a aberração (deslocamento R/B em px, `abInt`) ganha o
    // extra; se o ajuste salvo estiver com a CRT toda desligada, o filtro
    // dela entra só enquanto o choque durar.
    const crtDesligada = filtroSalvo.aberracao <= 0 && filtroSalvo.curvatura <= 0;
    const f = choque > 0
        ? {
            ...filtroSalvo,
            aberracao: Math.max(filtroSalvo.aberracao, 1),
            abInt: filtroSalvo.abInt + choque,
            filtroCss: crtDesligada ? `${filtroSalvo.filtroCss} url(#cz-crt)`.trim() : filtroSalvo.filtroCss,
        }
        : filtroSalvo;

    // A camada filtrada é fixa e do tamanho da janela: `filter` vira o
    // bloco de referência dos position:fixed de dentro, então ela precisa
    // cobrir a tela inteira pra eles continuarem no lugar.
    return (
        <>
            <DefsFiltro f={f} />
            <div
                className="mf1-filtro-tela"
                style={{
                    filter: f.filtroCss || undefined,
                    transform: f.overscan !== 1 ? `scale(${f.overscan})` : undefined,
                }}
            >
                {children}
                {f.scanlines > 0 && (
                    <div className="az-scanlines" style={{ background: f.scanlineBg, opacity: f.scanlineOp }} />
                )}
            </div>
            {MOSTRAR_PAINEL_FILTRO && (
                <div className="mf1-filtro">
                    <PainelFiltro f={f} aberto={aberto} onAlternar={() => setAberto((a) => !a)} />
                </div>
            )}
        </>
    );
}

// Filtro leve (ver FILTRO_ANTIGO_SVG): nenhum `filter` na camada da tela
// fora do choque. No choque entra só a CRT (aberração), com o ajuste salvo
// + o extra do choque, e sai quando ele acaba (ou, nos modos sem filtro,
// a camada do glitch por cima e/ou as franjas nas cartas).
function FiltroLeve({ f, choque, glitches, franjas, children }) {
    const fChoque = choque > 0
        ? { ...f, grao: 0, curvatura: 0, aberracao: Math.max(f.aberracao, 1), abInt: f.abInt + choque }
        : null;
    return (
        <>
            {fChoque && <DefsFiltro f={fChoque} />}
            <div
                className={`mf1-filtro-tela${franjas ? ` mf1-choque-franjas-${franjas}` : ''}`}
                style={{ filter: fChoque ? 'url(#cz-crt)' : undefined, '--franjas-ms': `${CHOQUE_FRANJAS_MS}ms` }}
            >
                {children}
                {f.grao > 0 && <GraoLeve opacidade={Math.min(1, f.grK)} animado={f.graoAnimado} colorido={f.graoColorido} />}
                {f.scanlines > 0 && (
                    <div className="az-scanlines" style={{ background: f.scanlineBg, opacity: f.scanlineOp }} />
                )}
                {glitches > 0 && <ChoqueGlitch key={glitches} />}
            </div>
        </>
    );
}
