import { useMemo, useState } from 'react';
import selo from './seal-removebg-preview.png';

const QTD_PARTICULAS = 50;

// Bola de SVG maior que a tela (140vmax garante isso em qualquer proporção)
// que encolhe ao clicar. É um toggle, não só ida: clica de novo e ela volta
// a crescer — dá pra testar a transição várias vezes sem recarregar a
// página. A escala fica no <div> em volta, não no <svg> direto — elemento
// HTML tem transform-origin central por padrão, SVG não (evita a bola
// encolher pro canto em vez do centro).
export default function Bola() {
    const [pequena, setPequena] = useState(false);

    const particulas = useMemo(
        () =>
            Array.from({ length: QTD_PARTICULAS }, () => {
                const anguloSpawn = Math.random() * Math.PI * 2;
                const raioSpawn = Math.sqrt(Math.random()) * 14;
                return {
                    cx: 50 + Math.cos(anguloSpawn) * raioSpawn,
                    cy: 50 + Math.sin(anguloSpawn) * raioSpawn,
                    dx: Math.random() * 32 - 16,
                    atraso: Math.random() * 1.4,
                };
            }),
        []
    );

    return (
        <div className="bola-cena">
            <div
                className={`bola-wrap ${pequena ? 'bola-pequena' : ''}`}
                onClick={() => setPequena((v) => !v)}
            >
                <svg className="bola-svg" viewBox="0 0 100 100">
                    <defs>
                        <radialGradient id="bola-gradiente" cx="35%" cy="30%" r="75%">
                            <stop offset="0%" stopColor="#e9d5ff" />
                            <stop offset="45%" stopColor="#c084fc" />
                            <stop offset="100%" stopColor="#6d28d9" />
                        </radialGradient>
                    </defs>
                    <g className="bola-particulas">
                        {particulas.map((p, i) => (
                            <circle
                                key={i}
                                className="bola-particula"
                                cx={p.cx}
                                cy={p.cy}
                                r="10"
                                style={{ '--dx': p.dx, animationDelay: `-${p.atraso}s` }}
                            />
                        ))}
                    </g>
                    <circle className="bola-circulo" cx="50" cy="50" r="48" fill="url(#bola-gradiente)" />
                </svg>
                <img className="bola-selo" src={selo} alt="" />
            </div>
            <p className="bola-dica">{pequena ? 'clique pra crescer de novo' : 'clique na bola'}</p>
        </div>
    );
}
