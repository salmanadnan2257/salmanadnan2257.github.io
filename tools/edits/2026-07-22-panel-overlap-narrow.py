"""Stop the title panel and the legend colliding in a narrow frame.

#lbl sits top left and #legend top right. Their widths do not shrink below a
point: #lbl settles at 188px once the 480px rule has shrunk its type, and the
legend runs from 112px ("Draft Press", 4 short rows) to 191px (webgl-terrain-
explorer). Together with the 12px margins they need about 340px, and they do not
get it, because the frame that matters is not the viewport. Embedded on a project
page the viz iframe is measured at:

  390px phone -> 354px frame      360px phone -> 324px frame      320px -> 284px

Panels overlapping, counted across all 38 pieces at each of those frame widths:

  354px ->  3/38   (worst 3967px2, webgl-terrain-explorer)
  324px -> 32/38
  284px -> 38/38   (and the hint reaches the HUD again at that width)

So this is the ordinary phone case, not an edge case.

Two steps, following the reduction the file already does at 640px and 480px.
First the title is held to whatever space the legend leaves, so it wraps instead
of running underneath it. Then, below the width where the legend cannot fit at
all, the legend goes and the title gets its own width back. Dropping the legend
last is the same call compact mode already makes for the same reason: at that
size the scene is the whole point.
"""

EDITS = [
    ("""    @media (max-width: 480px) {
      /* keep even the longest title on one line, clear of the legend */
      #lbl h1 { font-size: 10px; letter-spacing: 0.1em; }
      #lbl { max-width: 26ch; padding: 8px 11px; }
    }""",
     """    @media (max-width: 480px) {
      /* keep even the longest title on one line, clear of the legend */
      #lbl h1 { font-size: 10px; letter-spacing: 0.1em; }
      #lbl { max-width: 26ch; padding: 8px 11px; }
    }
    /* Below this the title cannot have 26ch AND clear the legend, so it takes
       what is left and wraps. 212px is the widest legend here (191px) plus the
       gap between them. */
    @media (max-width: 440px) {
      #lbl { max-width: calc(100% - 212px); }
    }
    /* And below this there is no room for the legend at all: what is left for
       the title is narrower than one word. The legend goes, the title gets its
       width back, and the live caption inside it carries the commentary. */
    @media (max-width: 400px) {
      #legend { display: none; }
      #lbl { max-width: calc(100% - 24px); }
    }"""),
]
