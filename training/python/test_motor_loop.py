# test_motor_loop.py -- o loop da partida no motor Python (item 20 do README):
# antes era recursão mútua _jogar_rodada_atual <-> _avancar_ou_finalizar (via
# `yield from`), agora é um while em _rodar_partida. Paridade com o refactor
# no game/GameController.js. Local, fora do git (ver .gitignore).
#
# Roda com:  training\.venv\Scripts\python.exe -m unittest test_motor_loop -v
import random
import unittest

from motor.partida import Partida


def rodar(players, round_start, max_deck, hp, seed):
    random.seed(seed)
    rodadas = []
    p = Partida(number_players=players, round_start=round_start, random_shuffle=True,
                hp_inicial=hp, max_deck=max_deck,
                on_nova_rodada=lambda num, cartas: rodadas.append(num))
    g = p.jogar()
    try:
        kind, jog = next(g)
        while True:
            if kind == "aposta":
                num = p.rodada.round
                val = random.randint(0, num)
                if p._eh_ultimo_a_apostar(jog) and p._soma_apostas_dos_outros(jog) + val == num:
                    val = (val + 1) % (num + 1)
                kind, jog = g.send(val)
            else:
                kind, jog = g.send(random.randrange(len(jog.mao)))
    except StopIteration:
        pass
    return p, rodadas


class LoopDaPartida(unittest.TestCase):
    def test_partida_curta_termina_com_vencedor(self):
        p, rodadas = rodar(3, 1, 2, hp=3, seed=1)
        self.assertTrue(p.finalizada)
        self.assertIsNotNone(p.vencedor)
        # on_nova_rodada dispara uma vez por rodada, a última inclusa
        self.assertEqual(rodadas, list(range(1, p.numero_rodada + 1)))

    def test_partida_longa_muitas_rodadas_sem_estourar(self):
        # hp alto + max_deck 1 (mão travada) => dezenas de rodadas. A recursão
        # antiga empilhava um frame por rodada; o while não.
        p, rodadas = rodar(3, 1, 1, hp=200, seed=7)
        self.assertTrue(p.finalizada)
        self.assertIsNotNone(p.vencedor)
        self.assertGreaterEqual(p.numero_rodada, 20)
        self.assertEqual(rodadas, list(range(1, p.numero_rodada + 1)))

    def test_varias_seeds_todas_terminam(self):
        for seed in range(30):
            p, rodadas = rodar(random.Random(seed).randint(2, 6), 1, 2, hp=6, seed=seed)
            self.assertTrue(p.finalizada, f"seed {seed} não terminou")
            self.assertEqual(rodadas, list(range(1, p.numero_rodada + 1)))


if __name__ == "__main__":
    unittest.main()
