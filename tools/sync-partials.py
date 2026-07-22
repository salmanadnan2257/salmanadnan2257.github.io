#!/usr/bin/env python3
"""Keep the blocks that repeat across the pages identical to one source copy.

The site is static HTML with no build step, and that is a deliberate choice: the
pages are exactly what ships, a crawler sees everything, and nothing depends on
JavaScript to assemble itself. The cost of it is duplication. The booking section
is the same 10 lines on 39 pages; the icon links are the same 3 lines on 41; the
project header is the same 14 lines on 38. Changing one of those meant 39 edits
and hoping none was missed, which is how the Cal.com link came to be corrected in
one place and left stale in others.

This does not introduce a build step. The pages keep their real markup, committed
and served as-is. Each shared block simply sits between a pair of marker comments,
and this script rewrites what is between them from the single copy in partials/.
Delete the script and the site is unchanged and still works.

  tools/sync-partials.py                 report what is out of sync (default)
  tools/sync-partials.py --apply         rewrite the pages from partials/
  tools/sync-partials.py --check         exit 1 if anything is out of sync

--check is the one that earns its keep: run it before a deploy and a block that
was edited in one page and not the rest is a failure, not a surprise months later.

Writing a partial:

  Use {{REL}} wherever a path has to reach the site root. It becomes "" for a page
  at the root and "../" for one in projects/. Everything else is literal.

  Indentation in the partial file is relative. The block is re-indented to match
  the indentation of its opening marker in each page, so the same partial lands
  correctly in index.html, which nests it one level deeper than the project pages.
"""

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PARTIALS = ROOT / "partials"

# name -> globs of the pages that carry it, and how many there must be. The count
# is not decoration: it is what catches a new page that forgot the block, and a
# glob that silently stopped matching.
MANIFEST = {
    "head-icons":   {"targets": ["*.html", "projects/*.html"], "expect": 41},
    "book-a-call":  {"targets": ["index.html", "projects/*.html"], "expect": 39},
    "nav-project":  {"targets": ["projects/*.html"], "expect": 38},
}


def targets_for(spec):
    seen, out = set(), []
    for g in spec["targets"]:
        for p in sorted(ROOT.glob(g)):
            if p.name in ("404.html",) or p in seen:
                continue
            seen.add(p)
            out.append(p)
    return out


def render(body, page, indent):
    """The partial as it should appear in this page: paths resolved, re-indented.

    A partial is written with its own first line at column zero and every other
    line relative to it, so the whole block is shifted to wherever its marker
    sits. That is what lets one copy serve index.html, which nests the booking
    section one level deeper than the project pages do."""
    rel = "../" if page.parent != ROOT else ""
    body = body.replace("{{REL}}", rel)
    lines = body.rstrip("\n").split("\n")
    return "\n".join((indent + l) if l.strip() else "" for l in lines)


def sync(apply_changes, check_only):
    stale, missing, count_errors = [], [], []

    for name, spec in MANIFEST.items():
        src = PARTIALS / f"{name}.html"
        if not src.exists():
            sys.exit(f"missing partial: partials/{name}.html")
        body = src.read_text()

        pages = targets_for(spec)
        if len(pages) != spec["expect"]:
            count_errors.append(
                f"{name}: expected {spec['expect']} pages, matched {len(pages)}")
            continue

        open_re = re.compile(
            rf"(?P<indent>[ \t]*)<!-- partial:{re.escape(name)} -->\n"
            rf"(?P<body>.*?)"
            rf"[ \t]*<!-- /partial:{re.escape(name)} -->",
            re.S)

        for page in pages:
            text = page.read_text()
            hits = list(open_re.finditer(text))
            if len(hits) != 1:
                missing.append(f"{page.relative_to(ROOT)}: {name} markers found {len(hits)} times, expected 1")
                continue
            m = hits[0]
            want = render(body, page, m.group("indent"))
            have = m.group("body").rstrip("\n")   # includes the block's own indent
            if have == want:
                continue
            stale.append(f"{page.relative_to(ROOT)}: {name}")
            if apply_changes:
                new = (f"{m.group('indent')}<!-- partial:{name} -->\n"
                       f"{want}\n"
                       f"{m.group('indent')}<!-- /partial:{name} -->")
                page.write_text(text[:m.start()] + new + text[m.end():])

    for label, rows in (("count mismatch", count_errors), ("marker problem", missing)):
        if rows:
            print(f"{len(rows)} {label}(s):")
            for r in rows:
                print("  " + r)

    if not stale:
        print("all partials in sync." if not (count_errors or missing) else "")
    elif apply_changes:
        print(f"rewrote {len(stale)} block(s) from partials/:")
        for r in stale:
            print("  " + r)
    else:
        print(f"{len(stale)} block(s) OUT OF SYNC with partials/:")
        for r in stale:
            print("  " + r)
        if not check_only:
            print("\nRe-run with --apply to rewrite them.")

    failed = bool(count_errors or missing) or (bool(stale) and not apply_changes)
    return 1 if (check_only and failed) or count_errors or missing else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--apply", action="store_true", help="rewrite the pages from partials/")
    g.add_argument("--check", action="store_true", help="exit 1 if anything is out of sync")
    args = ap.parse_args()
    return sync(args.apply, args.check)


if __name__ == "__main__":
    sys.exit(main())
