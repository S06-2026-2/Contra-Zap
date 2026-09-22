# test_seed.py -- RNG semeável no motor Python (item 21 do README) e paridade
# de embaralhamento com game/ em JS. Sem seed nada muda (random global); com
# seed a partida é reproduzível E idêntica à do motor JS pra a mesma seed.
# Local, fora do git (ver .gitignore).
#
# Roda com:  training\.venv\Scripts\python.exe -m unittest test_seed -v
import random
import unittest

from motor.rng import criar_rng
from motor.jogo import Jogo


class _P:
    def __init__(self, nome, i):
        self.nome = nome
        self.id = i
        self.mao = []
        self.hp = 3


def primeira_rodada(jogadores=4, round_start=3, seed=None):
    jog = [_P(f"a{i}", i) for i in range(jogadores)]
    g = Jogo(jogadores, round_start, True, jog, seed=seed)
    g.set_start_sequence()
    r = g.nova_rodada()
    r.dar_cartas()
    r.virar_manilha()
    return {
        "ordem": [j.nome for j in g.game_order],
        "vira": str(r.vira),
        "maos": [{"nome": j.nome, "mao": [str(c) for c in j.mao]} for j in g.game_order],
    }


class RngSemeavel(unittest.TestCase):
    def test_sem_seed_usa_random_global(self):
        self.assertIs(criar_rng(None), random.random)

    def test_com_seed_deterministico_no_intervalo(self):
        a = [criar_rng(42)() for _ in range(20)]
        b = [criar_rng(42)() for _ in range(20)]
        self.assertEqual(a, b)
        self.assertTrue(all(0 <= x < 1 for x in a))
        self.assertNotEqual(a, [criar_rng(43)() for _ in range(20)])

    def test_mesma_seed_reproduz_a_partida(self):
        self.assertEqual(primeira_rodada(seed=12345), primeira_rodada(seed=12345))

    def test_seeds_diferentes_partidas_diferentes(self):
        self.assertNotEqual(primeira_rodada(seed=1), primeira_rodada(seed=2))

    def test_sem_seed_ainda_roda(self):
        r = primeira_rodada(seed=None)
        self.assertEqual(len(r["ordem"]), 4)
        self.assertEqual(sum(len(m["mao"]) for m in r["maos"]), 12)


class ParidadeComJS(unittest.TestCase):
    # MESMA referência fixa de game/seed.test.js. Se um dos dois motores mudar
    # o embaralhamento, o teste do lado que mudou quebra.
    def test_seed_999_bate_com_o_motor_js(self):
        r = primeira_rodada(jogadores=4, round_start=3, seed=999)
        self.assertEqual(r["ordem"], ["a2", "a0", "a1", "a3"])
        self.assertEqual(r["vira"], "[5 de Paus]")
        self.assertEqual(r["maos"], [
            {"nome": "a2", "mao": ["[4 de Paus]", "[A de Espadas]", "[5 de Copas]"]},
            {"nome": "a0", "mao": ["[5 de Ouros]", "[4 de Copas]", "[3 de Copas]"]},
            {"nome": "a1", "mao": ["[J de Ouros]", "[5 de Espadas]", "[K de Paus]"]},
            {"nome": "a3", "mao": ["[3 de Ouros]", "[4 de Ouros]", "[J de Copas]"]},
        ])

    def test_mulberry32_bate_com_o_de_game_rng_js(self):
        # primeiros 8 valores de criarRng(12345) em game/rng.js
        esperado = [
            0.9797282677609473, 0.3067522644996643, 0.484205421525985,
            0.817934412509203, 0.5094283693470061, 0.34747186047025025,
            0.07375754183158278, 0.7663964673411101,
        ]
        r = criar_rng(12345)
        self.assertEqual([r() for _ in range(8)], esperado)


if __name__ == "__main__":
    unittest.main()
