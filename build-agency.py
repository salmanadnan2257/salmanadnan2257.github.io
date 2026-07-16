#!/usr/bin/env python3
"""Build the ai.digitalise.agency variant of this site from this same source tree.

One source, two targets. salmanadnan.com ships this tree as-is; ai.digitalise.agency
ships this tree with the transforms below applied. There is deliberately no second
branch and no second copy of the site: a branch would drift and every homepage edit
would need cherry-picking. This script IS the diff.

The build is written to a scratch directory OUTSIDE the repo, so no generated file
can ever be committed by accident.

What the transform does, and what it refuses to do:

  Chrome (title, meta, nav brand, footer, back-links, structured data) becomes
  Digitalise Agency. Body-copy credits keep Salman Adnan's name, reframed as
  "our founder, Salman Adnan", because those sentences are attribution of who
  actually did the work. Re-attributing a three-person university course project
  to a company would be a false claim, and PROJECT_STANDARDS.md does not allow it.

  The legal pages MUST swap the operating entity. Per the owner directive in
  terms.html (2026-07-16), the entity for salmanadnan.com is "Salman Adnan, an
  individual" and the entity for ai.digitalise.agency is "Digitalise Agency".
  Two sites operated by two entities cannot both claim the same operator.

  Canonical and og:url are NOT rewritten. Every page keeps its canonical pointing
  at salmanadnan.com so Google consolidates ranking onto the personal site instead
  of the two competing. Only sitemap.xml and robots.txt carry the agency host.

The guard at the end is the load-bearing part. It fails the build if the personal
identity leaks into agency chrome, if first-person copy survives, or if a NEW
"Salman" context appears that nobody has classified yet. Without it, a future edit
to index.html silently ships "Digitalise Agency" saying "I've built".
"""

import re
import shutil
import subprocess
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent
OUT = Path("/tmp/ai-digitalise-build")

AGENCY_HOST = "https://ai.digitalise.agency"
PERSONAL_HOST = "https://salmanadnan.com"
AGENCY_LINKEDIN = "https://www.linkedin.com/company/digitalise-agency/"
PERSONAL_LINKEDIN = "https://www.linkedin.com/in/salman-adnan/"

# --------------------------------------------------------------------------
# 1. CREDITS. Applied first, and sentinel-protected so the global brand swap
#    below cannot touch them. Longest-first, so no entry eats another's prefix.
#    A value identical to its key means "keep exactly as-is".
# --------------------------------------------------------------------------
CREDITS = {
    # Solo work: he is the agency, so the agency may claim it, but the founder is named.
    "Solo work by Salman Adnan.":
        "Solo work by our founder, Salman Adnan.",

    # Team / course work: the agency did NOT do these. Credit stays factual.
    "A three-person course project (CS 440 at Habib University). Salman Adnan wrote the shading and materials layer:":
        "A three-person course project (CS 440 at Habib University). Our founder, Salman Adnan, wrote the shading and materials layer:",
    "Salman wrote the shading layer of this three-person project:":
        "Our founder, Salman Adnan, wrote the shading layer of this three-person project:",
    "Salman wrote the shading layer:":
        "Our founder, Salman Adnan, wrote the shading layer:",

    "Salman built the part that cleans the verses and teaches the computer to tell the poets apart;":
        "Our founder, Salman Adnan, built the part that cleans the verses and teaches the computer to tell the poets apart;",
    # Lower-case here on purpose: this one follows a semicolon, not a full stop.
    "Salman built the part that cleans them and teaches a computer to tell three poets apart.":
        "our founder, Salman Adnan, built the part that cleans them and teaches a computer to tell three poets apart.",
    "Salman's part of a three-person course project:":
        "Our founder's part of a three-person course project:",
    "this repository is Salman's part, the classification pipeline.":
        "this repository is our founder's part, the classification pipeline.",

    "Three students built it as their final-year project, led by Salman;":
        "Three students built it as their final-year project, led by our founder, Salman Adnan;",
    "Final-year project, led by Salman, 112 tests passing.":
        "Final-year project, led by our founder, Salman Adnan, 112 tests passing.",
    "A team project Salman led, with 63 backend and 49 frontend tests passing.":
        "A team project led by our founder, Salman Adnan, with 63 backend and 49 frontend tests passing.",
    "a team project, led by Salman.":
        "a team project, led by our founder, Salman Adnan.",
    "Team project, led by Salman":
        "Team project, led by our founder",
    "commits led by Salman":
        "commits led by our founder",
    "Led by Salman Adnan (64 of 97 commits);":
        "Led by our founder, Salman Adnan (64 of 97 commits);",
    "A three-person team project. Salman Adnan led it (64 of 97 commits), with Umar Kashif and Fahad Nadeem.":
        "A three-person team project. Our founder, Salman Adnan, led it (64 of 97 commits), with Umar Kashif and Fahad Nadeem.",
    "A two-person team: Salman Adnan and Shayan Wasif.":
        "A two-person team: our founder, Salman Adnan, and Shayan Wasif.",

    "Built solo by Salman Adnan for an Enterprise Software Development course":
        "Built solo by our founder, Salman Adnan, for an Enterprise Software Development course",
    "the implementation here is Salman Adnan's work.":
        "the implementation here is our founder Salman Adnan's work.",
    "Built by Salman Adnan during a Developers Hub internship.":
        "Built by our founder, Salman Adnan, during a Developers Hub internship.",
    "Built by Salman Adnan for one of his agency's clients.":
        "Built by our founder, Salman Adnan, for one of this agency's clients.",
    "Built and operated solo by Salman Adnan for his own agency.":
        "Built and operated solo by our founder, Salman Adnan, for this agency.",
    "Built and operated by Salman Adnan; it runs unattended on a VPS and serves several agency clients.":
        "Built and operated by our founder, Salman Adnan; it runs unattended on a VPS and serves several agency clients.",

    # "his own agency" reads wrong on the agency's own site.
    "The web app that runs Salman's own agency:":
        "The web app that runs our own agency:",
    "This is the software that runs Salman's own agency.":
        "This is the software that runs our own agency.",
    "Who it serves: this is the live software of Salman's own agency, Digitalise Agency, and it runs that agency's real client work.":
        "Who it serves: this is our own live software, and it runs our real client work.",
    "Codeforces is a site full of programming puzzles, and Salman's study group ran practice contests on them.":
        "Codeforces is a site full of programming puzzles, and our founder's study group ran practice contests on them.",

    # A company is not an "Engineer". The personal site's job title becomes a
    # discipline on the agency build.
    "Salman Adnan &middot; AI &amp; Full-Stack Engineer":
        "Digitalise Agency &middot; AI &amp; Full-Stack Engineering",
    "Salman Adnan · AI &amp; Full-Stack Engineer":
        "Digitalise Agency · AI &amp; Full-Stack Engineering",

    # Kept verbatim: shared-work facts and one product UI label.
    "Salman owned the database design": "Salman owned the database design",
    "Salman's areas were the email verification": "Salman's areas were the email verification",
    "publishing it isn't Salman's call to make alone": "publishing it isn't Salman's call to make alone",
    "Mr. Salman LinkedIn": "Mr. Salman LinkedIn",
}

# --------------------------------------------------------------------------
# 2. VOICE. Phrase-based, never word-based: a bare \bI\b rule turns the string
#    "I/O dependency" in tic-tac-toe-gui.html into "we/O".
# --------------------------------------------------------------------------
VOICE = {
    "I build the software a business runs on:": "We build the software a business runs on:",
    "See what I&#39;ve built": "See what we&#39;ve built",
    "See what I've built": "See what we've built",
    "Hire me": "Hire us",
    "My Approach": "Our Approach",
    "How I work.": "How we work.",
    "I start with what you actually need,": "We start with what you actually need,",
    "Design first. I map out": "Design first. We map out",
    "I write the checks before the code.": "We write the checks before the code.",
    "Before it goes live I push it under heavy traffic,": "Before it goes live we push it under heavy traffic,",
    "without having to ask me.": "without having to ask us.",
    "I push the system under heavy traffic until something gives,": "We push the system under heavy traffic until something gives,",
    "I pick the tool that fits the job": "We pick the tool that fits the job",
    "I give honest estimates upfront,": "We give honest estimates upfront,",
    "Yes. I budget time for feedback and rework.": "Yes. We budget time for feedback and rework.",
    "Every system I ship is production-ready and documented. I'm available":
        "Every system we ship is production-ready and documented. We're available",
    "I take on AI work and the systems underneath it, and I am happy":
        "We take on AI work and the systems underneath it, and we are happy",
    "What I learned": "What we learned",
    # Role words that describe a person, not a company. None contain "Salman",
    # so only rendering the page caught these.
    '<p class="eyebrow">Software Engineer</p>': '<p class="eyebrow">Software Engineering</p>',
    "This site is aimed at people looking to hire a software engineer.":
        "This site is aimed at people looking to hire a software team.",
    "can I reproduce it": "can we reproduce it",
    "I deliberately broke the retry-cap": "We deliberately broke the retry-cap",
    "I had to actually break two safety-cap scenarios": "We had to actually break two safety-cap scenarios",
}

# --------------------------------------------------------------------------
# 3. LEGAL. terms.html and privacy.html are written first-person singular for an
#    individual operator ("I decide what happens...", '"I" and "me" below mean
#    that person'). Swapping only the entity name would leave a company saying
#    "I", which is incoherent in the one place on the site where precision is
#    not optional. These two pages are rewritten to the first-person plural.
#
#    NOT LAWYER-REVIEWED. terms.html says so of the original, and mechanically
#    changing the declared operator does not make it more reviewed.
# --------------------------------------------------------------------------
LEGAL = {
    'This site is salmanadnan.com, operated by Salman Adnan as an individual, from Pakistan. "I" and "me" below mean that person.':
        'This site is ai.digitalise.agency, operated by Digitalise Agency, from Pakistan. "We" and "us" below mean that company.',
    "This site is salmanadnan.com, operated by Salman Adnan as an individual.":
        "This site is ai.digitalise.agency, operated by Digitalise Agency.",
    "This is the portfolio of Salman Adnan, an independent software engineer":
        "This is the portfolio of Digitalise Agency",

    "This site links to places I do not control": "This site links to places we do not control",
    "I am not responsible for what is on them": "We are not responsible for what is on them",
    "I try hard to keep it accurate and available, but I do not guarantee":
        "We try hard to keep it accurate and available, but we do not guarantee",
    "To the fullest extent the law allows, I am not liable":
        "To the fullest extent the law allows, we are not liable",
    "I operate from Pakistan, and these terms are governed by":
        "We operate from Pakistan, and these terms are governed by",

    "there is no data for me to sell even if I wanted to":
        "there is no data for us to sell even if we wanted to",
    "I decide what happens with anything this site touches, which is almost nothing, and I am the person to ask about it.":
        "We decide what happens with anything this site touches, which is almost nothing, and we are the ones to ask about it.",
    "and to me, because a booking is a message you are choosing to send me.":
        "and to us, because a booking is a message you are choosing to send us.",
    "If you email me, I have your email and whatever you wrote in it, for as long as the message sits in my mailbox.":
        "If you email us, we have your email and whatever you wrote in it, for as long as the message sits in our mailbox.",
    "I use it to reply to you and for nothing else.": "We use it to reply to you and for nothing else.",
    "I do not sell your personal information.": "We do not sell your personal information.",
    "I do not share it for cross-context behavioural advertising.":
        "We do not share it for cross-context behavioural advertising.",
    "I do not profile you, I run no advertising, and I hand nothing to a data broker.":
        "We do not profile you, we run no advertising, and we hand nothing to a data broker.",
    "If you exercise any right below, I will not treat you worse for it":
        "If you exercise any right below, we will not treat you worse for it",
    "there is usually nothing of yours for me to show you, correct, or erase.":
        "there is usually nothing of yours for us to show you, correct, or erase.",
    "Where I do hold something, which means an email you sent me or a call you booked, you can ask me to see it, correct it, or delete it, and you can ask me to":
        "Where we do hold something, which means an email you sent us or a call you booked, you can ask us to see it, correct it, or delete it, and you can ask us to",
    # Keyed short on purpose: a </a> sits between the address and "and I will
    # answer", so a longer key cannot span it.
    "and I will answer.": "and we will answer.",
    "whether I hold anything at all.": "whether we hold anything at all.",
    "Email is the way to make a request; I do not publish a phone number or a postal address.":
        "Email is the way to make a request; we do not publish a phone number or a postal address.",
    "It is not directed at children, and I do not knowingly collect anything from a child under 13.":
        "It is not directed at children, and we do not knowingly collect anything from a child under 13.",
    "If you believe a child has sent me something, email me and I will delete it.":
        "If you believe a child has sent us something, email us and we will delete it.",
    "I am in Pakistan, so an email you send me is read there.":
        "We are in Pakistan, so an email you send us is read there.",
    "anything you choose to send me crosses a border to reach me, which is true of any email to any person abroad.":
        "anything you choose to send us crosses a border to reach us, which is true of any email to any company abroad.",
}

AGENCY_JSONLD = '''  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Digitalise Agency",
    "url": "%s/",
    "logo": "%s/assets/agency-logo.svg",
    "image": "%s/assets/agency-logo.svg",
    "email": "mailto:salman@digitalise.agency",
    "sameAs": [
      "https://github.com/salmanadnan2257",
      "%s"
    ],
    "founder": { "@type": "Person", "name": "Salman Adnan" },
    "address": { "@type": "PostalAddress", "addressCountry": "PK" },
    "knowsAbout": [
      "LLM inference", "Database engines", "Distributed consensus",
      "Vector search", "Retrieval-augmented generation", "Agent runtimes",
      "Django", "PyTorch"
    ]
  }''' % (AGENCY_HOST, AGENCY_HOST, AGENCY_HOST, AGENCY_LINKEDIN)

CSS_OVERRIDE = """

/* ---- ai.digitalise.agency build only (build-agency.py) ----
   The hero frame held a 4:5 portrait that correctly bled to the edges. It now
   holds a 1:1 logo, which needs breathing room and a background that does not
   fight it: the logo's blue (#136bee) against --coral (#F03E3E) is a clash.
   The img rule is already width:100%/height:auto, so the card squares itself. */
.photo-frame { background: var(--cream); padding: 28px; }
"""

# Contexts in which "Salman" is expected to survive on the agency build.
# The guard fails on any occurrence that matches none of these.
ALLOWED_SALMAN = [
    r"our founder, Salman Adnan",
    r"our founder Salman Adnan",
    r"Salman owned the database design",
    r"Salman's areas were",
    r"isn't Salman's call to make alone",
    r"Mr\. Salman LinkedIn",
    r"github\.com/salmanadnan2257",          # repos live there; kept by decision
    r"cal\.com/salman-adnan",                # booking link unchanged by decision
    r"salmanadnan\.com",                     # canonical / og:url / author url
    r'"name": "Salman Adnan"',               # project JSON-LD author (accurate)
    r'"founder": \{ "@type": "Person", "name": "Salman Adnan" \}',
]

FIRST_PERSON = re.compile(r"(?<![\w/])(I|I'm|I've)(?![\w/])|(?<![\w])(Hire me)(?![\w])")


def flex_replace(text, key, val):
    """Replace `key` tolerating any run of whitespace between its words.

    The legal prose is hard-wrapped, so "I do not share it for cross-context
    behavioural advertising." spans a newline plus indentation in the source and
    an exact string match silently finds nothing. Silently finding nothing in a
    legal document is the worst possible failure here, so match on words.
    """
    pat = re.compile(r"\s+".join(re.escape(w) for w in key.split()))
    return pat.sub(lambda _m: val, text)


def protect(text, mapping, store):
    """Replace each key with an opaque token so later global rules cannot touch it."""
    for key in sorted(mapping, key=len, reverse=True):
        if key in text:
            token = f"@@@P{len(store)}@@@"
            store.append(mapping[key])
            text = text.replace(key, token)
    return text


def restore(text, store):
    for i, val in enumerate(store):
        text = text.replace(f"@@@P{i}@@@", val)
    return text


def transform_html(text, relpath):
    store = []
    text = protect(text, CREDITS, store)          # credits first: they contain the name
    for k, v in VOICE.items():
        text = text.replace(k, v)

    # index.html only: the Person block becomes an Organization. Replaced whole
    # rather than field-by-field: an Organization has no jobTitle, and
    # "worksFor: Digitalise Agency" is nonsense once the entity IS the agency.
    # Tokenised, not inlined: the block names Salman Adnan as founder, and the
    # global brand swap below would otherwise rewrite that to "Digitalise
    # Agency's founder is Digitalise Agency".
    def _swap_person(m):
        if '"@type": "Person"' not in m.group(1):
            return m.group(0)
        token = f"@@@P{len(store)}@@@"
        store.append('<script type="application/ld+json">\n' + AGENCY_JSONLD + '\n  </script>')
        return token

    text = re.sub(r'<script type="application/ld\+json">(.*?)</script>',
                  _swap_person, text, flags=re.S)

    # Hero portrait -> logo, and the founder badge goes (the logo says it now).
    text = re.sub(
        r'<img\s+src="assets/portrait\.webp".*?>',
        '<img\n            src="assets/agency-logo.svg"\n            width="1000" height="1000"\n'
        '            alt="Digitalise Agency" loading="eager" decoding="async">',
        text, flags=re.S)
    text = re.sub(r'\s*<span class="photo-badge">Founder, Digitalise Agency</span>', "", text)

    text = text.replace(PERSONAL_LINKEDIN, AGENCY_LINKEDIN)

    # og:image / twitter:image MUST move to the agency host. Canonical and og:url
    # deliberately stay on salmanadnan.com, but an image URL is not a canonical
    # signal: left alone it makes every share of ai.digitalise.agency fetch the
    # PERSONAL card from the personal domain, which is Salman Adnan's name and
    # photograph. That would silently defeat the regenerated cards entirely.
    for prop in ("og:image", "twitter:image"):
        text = re.sub(rf'({prop}"\s+content=")' + re.escape(PERSONAL_HOST),
                      lambda m: m.group(1) + AGENCY_HOST, text)

    # The nav monogram is the founder's initials, sitting right next to the
    # agency name on all 41 pages.
    text = text.replace('<span class="nav__mark" aria-hidden="true">SA</span>',
                        '<span class="nav__mark" aria-hidden="true">DA</span>')

    # Legal entity. Required by the owner directive in terms.html (2026-07-16).
    if relpath in ("terms.html", "privacy.html"):
        for k, v in LEGAL.items():
            text = flex_replace(text, k, v)

        # These two pages must NOT canonicalise to salmanadnan.com. Canonical
        # asserts "duplicate, prefer that one", but these declare a different
        # operating entity, so they are not duplicates and the personal version
        # must not be served in their place. They self-canonicalise instead.
        text = text.replace(f'rel="canonical" href="{PERSONAL_HOST}',
                            f'rel="canonical" href="{AGENCY_HOST}')
        text = text.replace(f'property="og:url" content="{PERSONAL_HOST}',
                            f'property="og:url" content="{AGENCY_HOST}')

        text = re.sub(r"Set by the owner on 2026-07-16:.*?Email is the only contact channel\.",
                      "Set by the owner on 2026-07-16:\n      - the operating entity for THIS site is \"Digitalise Agency\".\n"
                      "        (This file is generated by build-agency.py from the salmanadnan.com\n"
                      "        source, where the entity is \"Salman Adnan\", an individual.)\n"
                      "      - governing law is Pakistan, courts of Pakistan, with a consumer-rights\n"
                      "        carve-out so a US state's non-waivable protections still reach a US reader.\n"
                      "      - no postal address, city, state, or phone number appears anywhere, by\n"
                      "        instruction. Email is the only contact channel.",
                      text, flags=re.S)

    # Global brand swap. Everything meaningful is already tokenised.
    text = text.replace("Salman Adnan", "Digitalise Agency")
    text = restore(text, store)
    return text


def main():
    if not (SRC / "index.html").exists():
        sys.exit("refusing to run: not the site root")
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    subprocess.run(
        ["rsync", "-a", "--exclude=.git", "--exclude=tests", "--exclude=build-agency.py",
         "--exclude=deploy.sh", "--exclude=tools", f"{SRC}/", f"{OUT}/"],
        check=True)

    for path in sorted(OUT.rglob("*.html")):
        rel = str(path.relative_to(OUT))
        path.write_text(transform_html(path.read_text(), rel))

    # Base URL: sitemap and robots only. Canonical and og:url stay personal on
    # purpose, so the two sites do not compete for the same queries.
    for name in ("sitemap.xml", "robots.txt"):
        p = OUT / name
        if p.exists():
            p.write_text(p.read_text().replace(PERSONAL_HOST, AGENCY_HOST))

    # favicon.svg is text, so the SA monogram is transformable. The raster icons
    # are then re-rendered from it rather than hand-edited.
    fav = OUT / "assets" / "favicon.svg"
    if fav.exists():
        s = fav.read_text()
        s = s.replace('aria-label="Salman Adnan monogram"', 'aria-label="Digitalise Agency monogram"')
        s = s.replace("<!-- SA monogram: coral S, cream A -->", "<!-- DA monogram: yellow D, cream A -->")
        s = s.replace('<tspan fill="#FFD93D">S</tspan>', '<tspan fill="#FFD93D">D</tspan>')
        fav.write_text(s)
        for name, size in (("favicon.png", 64), ("apple-touch-icon.png", 180)):
            subprocess.run(["convert", "-background", "none", "-resize", f"{size}x{size}",
                            str(fav), str(OUT / "assets" / name)], check=False)

    css = OUT / "styles.css"
    css.write_text(css.read_text() + CSS_OVERRIDE)

    # Personal imagery that no text rule can reach. Removed before the cards are
    # regenerated over the top, so a failure here cannot leave the personal
    # portrait sitting in the agency web root.
    for junk in ("portrait.webp", "portrait@2x.webp", "avatar.webp", "salman-adnan.jpg"):
        (OUT / "assets" / junk).unlink(missing_ok=True)

    # Social cards last: they read the transformed og:title / og:description, so
    # they must run after every text rule above. check=True on purpose. If the
    # generator fails, the build must fail rather than ship the personal cards,
    # which are "Salman Adnan" in 100px type next to his photograph.
    print("rendering social cards...")
    subprocess.run(["node", str(SRC / "tools" / "make-og.mjs"), str(OUT)], check=True)

    return guard()


def guard():
    """Fail loudly rather than ship a half-transformed site."""
    problems = []
    allow = [re.compile(p, re.I) for p in ALLOWED_SALMAN]

    for path in sorted(OUT.rglob("*.html")):
        rel = str(path.relative_to(OUT))
        src = path.read_text()

        for m in re.finditer(r"\bSalman\b", src):
            ctx = src[max(0, m.start() - 70): m.end() + 70]
            if not any(a.search(ctx) for a in allow):
                problems.append(f"{rel}: unclassified 'Salman' -> ...{' '.join(ctx.split())[:105]}...")

        body = re.sub(r"<head>.*?</head>", "", src, flags=re.S)
        body = re.sub(r"<script.*?</script>", "", body, flags=re.S)
        body = re.sub(r"<!--.*?-->", "", body, flags=re.S)
        for m in FIRST_PERSON.finditer(re.sub(r"<[^>]+>", " ", body)):
            problems.append(f"{rel}: first-person survived -> {m.group().strip()}")

        head = src[:src.find("</head>")] if "</head>" in src else src
        for pat, label in ((r"<title>[^<]*Salman", "title"),
                           (r'name="author" content="[^"]*Salman', "meta author"),
                           (r'og:site_name" content="[^"]*Salman', "og:site_name"),
                           (r'nav__name">[^<]*Salman', "nav brand")):
            if re.search(pat, head) or re.search(pat, src):
                problems.append(f"{rel}: personal identity in {label}")

    # Over-swap checks. The leak checks above only look for surviving "Salman",
    # so a rule that rewrote too much is invisible to them: the global brand swap
    # once turned the founder's name in the JSON-LD into "Digitalise Agency",
    # making the structured data claim the agency founded itself.
    idx = (OUT / "index.html").read_text()
    if '"founder": { "@type": "Person", "name": "Salman Adnan" }' not in idx:
        problems.append("index.html: JSON-LD founder is not Salman Adnan (over-swapped?)")
    if '"@type": "Organization"' not in idx:
        problems.append("index.html: JSON-LD is not an Organization")
    for path in sorted(OUT.rglob("*.html")):
        t = path.read_text()
        if re.search(r"(Full-Stack|Software) Engineer(?!ing)", t):
            problems.append(f"{path.relative_to(OUT)}: agency described as an 'Engineer' (a person's role)")
        # A share image served from the personal host is the personal card.
        for m in re.finditer(r'(og:image|twitter:image)"\s+content="([^"]+)"', t):
            if PERSONAL_HOST in m.group(2):
                problems.append(f"{path.relative_to(OUT)}: {m.group(1)} points at the personal host")
        if re.search(r'(portrait|avatar|salman-adnan)\.(webp|jpg|png)', t):
            problems.append(f"{path.relative_to(OUT)}: references a personal image asset")

    print(f"built -> {OUT}")
    if problems:
        print(f"\nGUARD FAILED: {len(problems)} problem(s)\n")
        for p in problems[:40]:
            print("  " + p)
        if len(problems) > 40:
            print(f"  ... and {len(problems) - 40} more")
        return 1
    print("guard passed: no identity leak, no first-person, no unclassified 'Salman'")
    return 0


if __name__ == "__main__":
    sys.exit(main())
