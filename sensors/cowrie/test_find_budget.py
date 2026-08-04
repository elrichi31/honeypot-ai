"""Run: python sensors/cowrie/test_find_budget.py

Exercises the find(1) node budget injected by patch_auth.py against a fake
filesystem with a symlink cycle — the shape that wedged the reactor for 5h43m.
Command_find is stubbed here (the real one needs cowrie installed); the code
under test is the injected wrapper, extracted verbatim from patch_auth.py.
"""
import os
import posixpath

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = open(os.path.join(HERE, "patch_auth.py")).read()

_start = SOURCE.index("FIND_PATCH = '''") + len("FIND_PATCH = '''")
FIND_PATCH = SOURCE[_start : SOURCE.index("'''", _start)]

BRANCHING = 3
MAXDEPTH = 20


class CyclicFS:
    """Every directory holds BRANCHING subdirectories, forever."""

    def exists(self, path):
        return True

    def isdir(self, path):
        return True

    def isfile(self, path):
        return False

    def listdir(self, path):
        return [f"d{i}" for i in range(BRANCHING)]


class Command_find:
    """Mirrors upstream cowrie find_recursive/start, minus argument parsing."""

    def __init__(self):
        self.fs = CyclicFS()
        self.maxdepth = MAXDEPTH
        self.visited = 0
        self.written = []

    def write(self, text):
        self.written.append(text)

    def errorWrite(self, text):
        self.written.append(text)

    def exit(self):
        pass

    def start(self):
        self.find_recursive("/", 0)
        self.exit()

    def find_recursive(self, path, depth):
        self.visited += 1
        if depth > self.maxdepth:
            return
        if not self.fs.exists(path):
            return
        if self.fs.isdir(path):
            for entry in self.fs.listdir(path):
                self.find_recursive(posixpath.join(path, entry), depth + 1)


namespace = {"Command_find": Command_find}
exec(FIND_PATCH, namespace)
BUDGET = namespace["_FIND_NODE_BUDGET"]


def test_cyclic_walk_terminates_within_budget():
    cmd = Command_find()
    cmd.start()
    assert cmd.visited <= BUDGET + 1, cmd.visited


def test_unpatched_walk_would_explode():
    """Without the budget the same tree is astronomically large — the DoS."""
    assert BRANCHING ** MAXDEPTH > 1_000_000_000, "test tree too small to prove the point"


def test_budget_resets_between_invocations():
    cmd = Command_find()
    cmd.start()
    first = cmd.visited
    cmd.start()
    assert cmd.visited - first <= BUDGET + 1, (first, cmd.visited)


def test_small_tree_completes_untruncated():
    """A tree that fits in the budget must still be walked in full."""

    class SmallFS(CyclicFS):
        def isdir(self, path):
            return path.count("/") <= 2

    cmd = Command_find()
    cmd.fs = SmallFS()
    cmd.start()
    assert cmd.visited == 1 + BRANCHING + BRANCHING**2 + BRANCHING**3, cmd.visited


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_"):
            fn()
            print(f"ok  {name}")
    print("all passed")
