# test_motor_maxdeck.py -- teto de baralhos por rodada no motor Python,
# paridade com game/Game.js (item 17 do README). Local, fora do git
# (ver .gitignore).
#
# Roda com:  training\.venv\Scripts\python.exe -m unittest test_motor_maxdeck -v
import random
import unittest

from motor.jogo import Jogo, baralhos_necessarios, MAX_DECK_SEM_LIMITE
from motor.partida import Partida


class Stub:
    def __init__(self):
        self.hp = 3


def jogo_em_andamento(vivos, round_, max_deck):
    j = Jogo(vivos, round_, True, [], max_deck=max_deck)
    j.game_order = [Stub() for _ in range(vivos)]
    j.round = round_
    return j


def evoluir(j, n, mortes=None):
    mortes = mortes or {}
    hist = []
    for i in range(1, n + 1):
        if mortes.get(i):
            j.game_order = j.game_order[: len(j.game_order) - mortes[i]]
        j.proxima_rodada()
        hist.append(j.round)
    return hist


class BaralhosNecessarios(unittest.TestCase):
    def test_conta(self):
        self.assertEqual(baralhos_necessarios(4, 3), 1)   # 13 cartas
        self.assertEqual(baralhos_necessarios(6, 6), 1)   # 37
        self.assertEqual(baralhos_necessarios(6, 7), 2)   # 43
        self.assertEqual(baralhos_necessarios(3, 13), 1)  # 40 exatas
        self.assertEqual(baralhos_necessarios(3, 14), 2)  # 43


class TetoDeDeck(unittest.TestCase):
    def test_default_sem_limite(self):
        j = Jogo(4, 3, True, [])
        self.assertEqual(j.max_deck, MAX_DECK_SEM_LIMITE)
        self.assertEqual(j.max_deck, 50)

    def test_sem_limite_cresce_sempre(self):
        j = jogo_em_andamento(6, 1, MAX_DECK_SEM_LIMITE)
        self.assertEqual(evoluir(j, 8), [2, 3, 4, 5, 6, 7, 8, 9])

    def test_congela_quando_nao_cabe(self):
        j = jogo_em_andamento(6, 1, 1)
        self.assertEqual(evoluir(j, 8), [2, 3, 4, 5, 6, 6, 6, 6])

    def test_morte_destrava_sem_pular(self):
        j = jogo_em_andamento(6, 1, 1)
        hist = evoluir(j, 11, {7: 1, 9: 1})
        self.assertEqual(hist, [2, 3, 4, 5, 6, 6, 7, 7, 8, 9, 9])

    def test_congelado_nunca_diminui(self):
        j = jogo_em_andamento(6, 6, 1)
        self.assertTrue(all(r == 6 for r in evoluir(j, 20)))

    def test_20_jogadores_18_morrem(self):
        j = jogo_em_andamento(20, 1, 1)
        self.assertEqual(evoluir(j, 4), [1, 1, 1, 1])
        j.game_order = j.game_order[:2]
        self.assertEqual(evoluir(j, 5), [2, 3, 4, 5, 6])


class ParidadeComJS(unittest.TestCase):
    # Mesma tabela de valores que game/maxDeck.test.js — se um lado mudar,
    # este teste denuncia a divergência.
    def test_tabela_congela_e_destrava(self):
        casos = [
            (dict(vivos=6, round_=1, max_deck=50), 8, {}, [2, 3, 4, 5, 6, 7, 8, 9]),
            (dict(vivos=6, round_=1, max_deck=1), 8, {}, [2, 3, 4, 5, 6, 6, 6, 6]),
            (dict(vivos=6, round_=1, max_deck=1), 11, {7: 1, 9: 1}, [2, 3, 4, 5, 6, 6, 7, 7, 8, 9, 9]),
        ]
        for kwargs, n, mortes, esperado in casos:
            with self.subTest(**kwargs):
                self.assertEqual(evoluir(jogo_em_andamento(**kwargs), n, mortes), esperado)


class PartidaCompleta(unittest.TestCase):
    def _rodar(self, players, round_start, max_deck, seed):
        random.seed(seed)
        p = Partida(number_players=players, round_start=round_start,
                    random_shuffle=True, max_deck=max_deck)
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
        return p

    def test_partida_com_teto_baixo_termina_sem_erro(self):
        # maxDeck 1 força o congelamento cedo; a partida ainda tem que rodar
        # até o fim sem estourar a checagem de baralho vazio.
        for players in (2, 3, 4, 5, 6):
            with self.subTest(players=players):
                p = self._rodar(players, 1, 1, seed=100 + players)
                self.assertTrue(p.finalizada)
                self.assertIsNotNone(p.vencedor)

    def test_sem_limite_igual_ao_default(self):
        a = self._rodar(4, 3, 50, seed=7)
        b = self._rodar(4, 3, MAX_DECK_SEM_LIMITE, seed=7)
        self.assertEqual(a.vencedor.nome, b.vencedor.nome)
        self.assertEqual(a.numero_rodada, b.numero_rodada)


if __name__ == "__main__":
    unittest.main()
