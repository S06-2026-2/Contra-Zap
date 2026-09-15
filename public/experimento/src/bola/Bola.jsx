import { useMemo, useState } from 'react';
import selo from './seal-removebg-preview.png';

const QTD_PARTICULAS = 50;

export default function Bola() {
    const [pequena, setPequena] = useState(false);

    const particulas = useMemo(
        () =>
            Array.from({ length: QTD_PARTICULAS }, () => {
                const anguloSpawn = Math.random() * Math.PI * 2;
                const raioSpawn = Math.sqrt(Math.random()) * 24;
                const cx = 50 + Math.cos(anguloSpawn) * raioSpawn;
                const cy = 50 + Math.sin(anguloSpawn) * raioSpawn;
                return {
                    cx,
                    cy,
                    dx: -(cx - 50) * 0.6 + (Math.random() * 10 - 5),
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
                    <path
                        className="bola-circulo"
                        d="M50,97 C50,97 13,58 13,33 A37,37 0 1,1 87,33 C87,58 50,97 50,97 Z"
                        fill="url(#bola-gradiente)"
                    />
                </svg>
                <img className="bola-selo" src={selo} alt="" />
                <div className="fantasma-nome">
                    <span>henrique</span>
                    <span>void</span>
                </div>
                <div className="fantasma-rosto">
                    <div className="fantasma-olho fantasma-olho-esq" />
                    <div className="fantasma-olho fantasma-olho-dir" />
                    <div className="fantasma-boca" />
                </div>
            </div>
            <p className="bola-dica">{pequena ? 'clique pra crescer de novo' : 'clique na bola'}</p>
        </div>
    );
}
