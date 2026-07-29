#!/usr/bin/env python3
"""Trim the narrative sections from the project pages, keep the evidence.

Run from the site root:  python3 tools/edits/2026-07-29-project-page-trim.py [--apply] [file ...]

Without --apply it reports what it would do and writes nothing.

What goes, and why: these pages carried an essay around their evidence. The
"Challenges" and "What I learned" sections are reflection, "A challenge worth
noting" is an aside, and "Approach and architecture" restates in prose what the
tech stack and the results already establish. None of it is the proof.

What stays, deliberately:

  Overview            first paragraph only, so the page still opens by saying
                      what the thing is
  Key features        already a terse bullet list
  Results             the metric tables. These ARE the numbers the homepage
                      cites, so cutting them would strand the claims
  Verification        how the numbers were obtained
  Tech stack          badges
  anything "honest"   sections whose heading mentions reading the numbers
                      honestly are disclosures and are never touched
  the JSON-LD, hero, screenshot, viz link and the shared partials

The rule this respects: a number may be cut only when it survives somewhere the
reader can still reach. Prose about a number may always be cut.
"""
import re
import sys
from pathlib import Path

DROP = {
    "Challenges",
    "What I learned",
    "A challenge worth noting",
    "Approach and architecture",
    "Technical Details",
    "What Was Learned",
    "Interpretation",
}

# Never drop a section whose heading matches these, whatever else matches.
KEEP_ALWAYS = re.compile(r"honest|verification|results|tech stack|key features|overview", re.I)

SECTION = re.compile(
    r'[ \t]*<section class="proj-section">\s*<h2[^>]*>(.*?)</h2>(.*?)</section>\n',
    re.S,
)


def heading_text(raw):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", raw)).strip()


def trim(src):
    """Return (new_text, dropped_headings, overview_paras_removed)."""
    dropped = []
    trimmed = [0]

    def repl(m):
        head = heading_text(m.group(1))
        if head in DROP and not KEEP_ALWAYS.search(head):
            dropped.append(head)
            return ""
        if head == "Overview":
            body = m.group(2)
            paras = re.findall(r"[ \t]*<p>.*?</p>\n", body, re.S)
            if len(paras) > 1:
                new_body = body
                for extra in paras[1:]:
                    new_body = new_body.replace(extra, "", 1)
                    trimmed[0] += 1
                return m.group(0).replace(body, new_body)
        return m.group(0)

    return SECTION.sub(repl, src), dropped, trimmed[0]


def main(argv):
    apply = "--apply" in argv
    files = [a for a in argv if not a.startswith("--")]
    root = Path(__file__).resolve().parents[2]
    targets = [Path(f) for f in files] or sorted((root / "projects").glob("*.html"))

    tot_drop = tot_para = changed = 0
    for path in targets:
        src = path.read_text()
        out, dropped, paras = trim(src)
        if out == src:
            continue
        changed += 1
        tot_drop += len(dropped)
        tot_para += paras
        print("%-46s -%d section(s) %-34s -%d overview para(s)"
              % (path.name, len(dropped), ",".join(dropped)[:34], paras))
        if apply:
            path.write_text(out)

    print("\n%d file(s) %s: %d sections and %d overview paragraphs removed"
          % (changed, "changed" if apply else "would change", tot_drop, tot_para))
    if not apply:
        print("dry run. Re-run with --apply to write.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
