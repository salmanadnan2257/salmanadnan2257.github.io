#!/usr/bin/env python3
"""Apply one anchored edit across a set of files, all of them or none.

The 38 files in viz/ are 38 copies of the same shell, and tests/check-runtime-identical.mjs
fails the moment they stop agreeing. So a change to that shell is not 38 edits, it
is one edit that must land 38 times or not at all. The same is true of the header,
the footer and the booking section repeated across the 41 pages. Doing that by hand,
or with a bare sed, is how a set forks: one file has a stale copy, nobody notices,
and the next patch no longer matches everywhere.

What this guarantees:

  every target must contain the anchor exactly once. Zero matches or two matches
  in ANY file aborts the whole run before a single byte is written, and says which
  files disagreed. A partial apply is the failure this exists to prevent.

  nothing is written until every file has been checked and rendered in memory.

  --dry-run is the default. Writing requires --apply, so the normal way to use
  this is to look at the report first.

Usage:
  tools/patch-set.py --glob 'viz/*.html' --patch edits/hint-stack.py            # dry run
  tools/patch-set.py --glob 'viz/*.html' --patch edits/hint-stack.py --apply

A patch file is a Python file defining EDITS, a list of (old, new) string pairs.
Each pair is applied in order, and each must match exactly once in every file:

  EDITS = [
      ("@media (max-width: 700px), (pointer: coarse) {",
       "@media (max-width: 700px), (pointer: coarse) {"),
  ]

Substitutions that must differ per file (each viz names its own PNG download)
belong in a patch that computes `new` from the file stem; define instead a
function EDITS_FOR(stem) returning the same list of pairs.
"""

import argparse
import runpy
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load_edits(patch_path):
    ns = runpy.run_path(str(patch_path))
    if "EDITS_FOR" in ns:
        return ns["EDITS_FOR"]
    if "EDITS" in ns:
        edits = ns["EDITS"]
        return lambda stem: edits
    sys.exit(f"{patch_path}: defines neither EDITS nor EDITS_FOR")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--glob", required=True,
                    help="glob of target files, relative to the site root")
    ap.add_argument("--patch", required=True, help="path to the patch file")
    ap.add_argument("--apply", action="store_true",
                    help="write the changes; without it this is a dry run")
    ap.add_argument("--expect", type=int, default=None,
                    help="fail unless exactly this many files match the glob")
    args = ap.parse_args()

    targets = sorted(ROOT.glob(args.glob))
    if not targets:
        sys.exit(f"no files match {args.glob!r}")
    if args.expect is not None and len(targets) != args.expect:
        sys.exit(f"expected {args.expect} files, found {len(targets)}: refusing to run")

    edits_for = load_edits(Path(args.patch))

    # Pass one: check and render everything in memory. Nothing is written here.
    rendered, problems, unchanged = {}, [], []
    for path in targets:
        rel = path.relative_to(ROOT)
        text = original = path.read_text()
        for i, (old, new) in enumerate(edits_for(path.stem), 1):
            n = text.count(old)
            if n != 1:
                problems.append(f"{rel}: edit {i} matched {n} times, expected exactly 1")
                break
            text = text.replace(old, new, 1)
        else:
            if text == original:
                unchanged.append(rel)
            rendered[path] = text

    if problems:
        print(f"ABORTED: {len(problems)} file(s) did not match cleanly. Nothing written.\n")
        for p in problems:
            print("  " + p)
        return 1

    changed = [p for p, t in rendered.items() if t != p.read_text()]
    print(f"{len(targets)} file(s) matched the anchor cleanly; {len(changed)} would change.")
    if unchanged:
        print(f"  {len(unchanged)} already at the target text (edit is idempotent).")

    if not args.apply:
        print("\nDry run. Re-run with --apply to write.")
        return 0

    # Pass two: write. Every file is already known to be renderable, so this loop
    # cannot fail partway for a reason pass one could have caught.
    for path, text in rendered.items():
        path.write_text(text)
    print(f"\nApplied to {len(changed)} file(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
