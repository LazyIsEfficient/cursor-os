import importlib.util
import sys
from pathlib import Path


failures = []


def check(label, condition):
    if not condition:
        failures.append(label)


if len(sys.argv) != 2:
    failures.append("workspace argument is required")
else:
    try:
        module_path = Path(sys.argv[1]).resolve() / "ledger.py"
        spec = importlib.util.spec_from_file_location("fixture_ledger", module_path)
        ledger = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(ledger)

        normal = {"alice": 10, "bob": 2}
        check("valid transfer succeeds", ledger.transfer(normal, "alice", "bob", 4) is True)
        check("valid transfer updates both balances", normal == {"alice": 6, "bob": 6})

        rejected = {"alice": 3, "bob": 7}
        snapshot = rejected.copy()
        check("overdraft is rejected", ledger.transfer(rejected, "alice", "bob", 5) is False)
        check("rejected transfer preserves state", rejected == snapshot)

        invalid = {"alice": 3, "bob": 7}
        try:
            ledger.transfer(invalid, "alice", "bob", 0)
            failures.append("zero transfer must raise")
        except ValueError:
            pass
        check("invalid transfer preserves state", invalid == {"alice": 3, "bob": 7})
    except Exception:
        failures.append("workspace module could not be evaluated")

if failures:
    print("\n".join(failures), file=sys.stderr)
    raise SystemExit(1)
