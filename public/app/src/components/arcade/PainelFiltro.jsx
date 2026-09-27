import { useState, useSyncExternalStore } from 'react';
import { FILTROS, MAPA_CURV_X, MAPA_CURV_Y } from './filtros.js';
import { assinarSom, definirVolume, volumeSom } from './somArcade.js';

const TAMANHOS_PIXEL = Array.from({ length: 15 }, (_, i) => i + 2);

// Os <filter> SVG que o CSS `filter: url(#...)` da casca referencia. Fica
// FORA da div filtrada (ver Casca.jsx) — senão o próprio SVG entraria na
// cadeia que ele mesmo define.
export function DefsFiltro({ f }) {
    return (
        <svg className="az-fx-defs" aria-hidden="true">
            {/* Pixelado: feFlood/feComposite/feTile amostra 1 ponto por
                célula e feMorphology infla pra encher o quadradinho. Um
                <filter> por tamanho (a Chrome não reavalia feTile quando só
                o atributo muda). */}
            {TAMANHOS_PIXEL.map((tam) => (
                <filter key={tam} id={`cz-pixelar-${tam}`} x="-2%" y="-2%" width="104%" height="104%" colorInterpolationFilters="sRGB">
                    <feFlood x={tam / 2} y={tam / 2} width="2" height="2" />
                    <feComposite width={tam} height={tam} />
                    <feTile result="grade" />
                    <feComposite in="SourceGraphic" in2="grade" operator="in" />
                    <feMorphology operator="dilate" radius={tam / 2} />
                </filter>
            ))}
            <filter id={f.grId} x="-2%" y="-2%" width="104%" height="104%" colorInterpolationFilters="sRGB">
                <feTurbulence
                    type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed={f.graoSeed}
                    x="0" y="0" width="220" height="220" stitchTiles="stitch" result="grTile"
                />
                <feTile in="grTile" result="grBruto" />
                {!f.graoColorido && (
                    <feColorMatrix
                        in="grBruto" type="matrix"
                        values="0.333 0.333 0.333 0 0 0.333 0.333 0.333 0 0 0.333 0.333 0.333 0 0 0 0 0 0 1"
                        result="grLum"
                    />
                )}
                <feComponentTransfer in={f.graoColorido ? 'grBruto' : 'grLum'} result="grFinal">
                    <feFuncR type="linear" slope={f.grK} intercept={f.grC} />
                    <feFuncG type="linear" slope={f.grK} intercept={f.grC} />
                    <feFuncB type="linear" slope={f.grK} intercept={f.grC} />
                    <feFuncA type="linear" slope="0" intercept="1" />
                </feComponentTransfer>
                <feBlend mode="soft-light" in="grFinal" in2="SourceGraphic" result="grMix" />
                <feComposite in="grMix" in2="SourceGraphic" operator="in" />
            </filter>
            {/* CRT — mesmo encadeamento do novo/Partida.jsx: aberração separa
                R/B em px inteiros, curvatura é um feDisplacementMap em barril. */}
            <filter id="cz-crt" x="-8%" y="-8%" width="116%" height="116%" colorInterpolationFilters="sRGB">
                {f.aberracao > 0 && (
                    <>
                        <feOffset in="SourceGraphic" dx={f.abInt} dy="0" result="shR" />
                        <feOffset in="SourceGraphic" dx={-f.abInt} dy="0" result="shB" />
                        <feColorMatrix in="shR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="rOnly" />
                        <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="gOnly" />
                        <feColorMatrix in="shB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="bOnly" />
                        <feBlend mode="screen" in="rOnly" in2="gOnly" result="rg" />
                        <feBlend mode="screen" in="rg" in2="bOnly" result="aberrada" />
                    </>
                )}
                {f.curvatura > 0 && (
                    <>
                        <feImage href={MAPA_CURV_X} preserveAspectRatio="none" x="-8%" y="-8%" width="116%" height="116%" result="mapaX" />
                        <feImage href={MAPA_CURV_Y} preserveAspectRatio="none" x="-8%" y="-8%" width="116%" height="116%" result="mapaY" />
                        <feBlend mode="screen" in="mapaX" in2="mapaY" result="mapaXY" />
                        <feDisplacementMap in={f.aberracao > 0 ? 'aberrada' : 'SourceGraphic'} in2="mapaXY" scale={f.curvPx} xChannelSelector="R" yChannelSelector="G" />
                    </>
                )}
            </filter>
        </svg>
    );
}

// Painel fixo no canto inferior direito. Fica fora da div filtrada (ver
// Casca.jsx), então o próprio filtro nunca pega o painel.
export function PainelFiltro({ f }) {
    const [aberto, setAberto] = useState(false);
    const volume = useSyncExternalStore(assinarSom, volumeSom);

    const sliders = [];
    if (f.usaPixel) {
        sliders.push({ rotulo: 'TAMANHO DO PIXEL', chave: 'pixel', min: 2, max: 16, valor: f.pixel, texto: `${f.pixel}px` });
    }
    sliders.push({ rotulo: 'GRÃO / DITHER', chave: 'grao', min: 0, max: 100, valor: f.grao, texto: f.grao || 'off' });
    sliders.push({ rotulo: 'CRT · CURVATURA', chave: 'curvatura', min: 0, max: 100, valor: f.curvatura, texto: f.curvatura || 'off' });
    sliders.push({ rotulo: 'CRT · SCANLINES', chave: 'scanlines', min: 0, max: 100, valor: f.scanlines, texto: f.scanlines || 'off' });
    if (f.scanlines > 0) {
        const d = f.scanlinePasso <= 4 ? 'finas' : f.scanlinePasso >= 10 ? 'grossas' : 'médias';
        sliders.push({ rotulo: 'CRT · LINHA', chave: 'scanlinePasso', min: 2, max: 16, valor: f.scanlinePasso, texto: `${f.scanlinePasso}px ${d}` });
    }
    sliders.push({ rotulo: 'CRT · ABERRAÇÃO', chave: 'aberracao', min: 0, max: 100, valor: f.aberracao, texto: f.aberracao || 'off' });

    const checks = f.grao > 0
        ? [
            { rotulo: 'ruído colorido (RGB)', chave: 'graoColorido' },
            { rotulo: 'animar (grão "fervendo")', chave: 'graoAnimado' },
        ]
        : [];

    return (
        <div className="az-raiz az-filtro">
            <button type="button" className="az-b az-filtro-cabeca" onClick={() => setAberto((a) => !a)}>
                <span className="az-px az-filtro-titulo">FILTRO DE TELA</span>
                <span className="az-px az-filtro-resumo">{f.resumo}</span>
                <span className="az-px az-filtro-seta">{aberto ? '▾' : '▸'}</span>
            </button>

            {aberto && (
                <div className="az-filtro-corpo">
                    <div>
                        <div className="az-px az-filtro-rotulo">EFEITO</div>
                        <div className="az-filtro-efeitos">
                            {Object.keys(FILTROS).map((nome) => (
                                <button
                                    key={nome}
                                    type="button"
                                    className={`az-b az-px az-filtro-efeito${f.efeito === nome ? ' az-ativo' : ''}`}
                                    onClick={() => f.definir('efeito', nome)}
                                >
                                    {nome}
                                </button>
                            ))}
                        </div>
                    </div>

                    {sliders.map((s) => (
                        <div key={s.chave}>
                            <div className="az-filtro-linha">
                                <span className="az-px az-filtro-slider-rotulo">{s.rotulo}</span>
                                <span className="az-px az-filtro-valor" style={{ color: s.texto === 'off' ? '#4a4f60' : '#f5c451' }}>
                                    {s.texto}
                                </span>
                            </div>
                            <input
                                type="range" min={s.min} max={s.max} step="1"
                                className="az-range"
                                data-som="mudo"
                                value={s.valor}
                                onChange={(e) => f.definir(s.chave, Number(e.target.value))}
                            />
                        </div>
                    ))}

                    {checks.map((c) => (
                        <button
                            key={c.chave}
                            type="button"
                            className="az-b az-filtro-check"
                            onClick={() => f.definir(c.chave, !f[c.chave])}
                        >
                            <span className="az-filtro-marca" style={{ background: f[c.chave] ? '#7fd6a5' : '#22252f' }} />
                            <span>{c.rotulo}</span>
                        </button>
                    ))}

                    <div>
                        <div className="az-filtro-linha">
                            <span className="az-px az-filtro-slider-rotulo">VOLUME DO SOM</span>
                            <span className="az-px az-filtro-valor" style={{ color: volume > 0 ? '#f5c451' : '#4a4f60' }}>
                                {Math.round(volume * 100)}
                            </span>
                        </div>
                        <input
                            type="range" min="0" max="100" step="5"
                            className="az-range"
                            data-som="mudo"
                            value={Math.round(volume * 100)}
                            onChange={(e) => definirVolume(Number(e.target.value) / 100)}
                        />
                    </div>

                    <button type="button" className="az-b az-px az-filtro-reset" onClick={f.resetar}>
                        RESETAR TUDO
                    </button>
                    <div className="az-filtro-nota">
                        Só visual e só pra você — não muda nada na partida nem no que os outros veem.
                    </div>
                </div>
            )}
        </div>
    );
}
