"""Close the last two narrow-frame collisions left by the first pass.

1. The allowance the title leaves for the legend was 212px, measured as the
   widest legend (191px) plus one 12px gap. That is exactly too tight: it forgot
   the legend's own 12px margin from the right edge, so webgl-terrain-explorer,
   the piece with that widest legend, still crossed by 3px between 401 and 440px.
   224px leaves a real gap.

2. The control HUD is a single flex row that does not wrap, and its buttons need
   about 272px. Below roughly a 290px frame it is wider than the space between
   the margins and it runs left, under the hint, which the first pass had already
   moved to its own line. Letting it wrap is the fix, and the hint then has to
   clear two rows of it rather than one.
"""

EDITS = [
    ("""    @media (max-width: 440px) {
      #lbl { max-width: calc(100% - 212px); }
    }""",
     """    @media (max-width: 440px) {
      #lbl { max-width: calc(100% - 224px); }
    }"""),
    ("""    @media (max-width: 400px) {
      #legend { display: none; }
      #lbl { max-width: calc(100% - 24px); }
    }""",
     """    @media (max-width: 400px) {
      #legend { display: none; }
      #lbl { max-width: calc(100% - 24px); }
      /* The HUD is one flex row of buttons about 272px wide. Narrower than that
         and it runs off its own left edge, across the hint. Let it wrap, and
         give the hint the room for the second row it may now grow. */
      #hud { flex-wrap: wrap; justify-content: flex-end; }
      #hint { bottom: 96px; }
    }"""),
]
