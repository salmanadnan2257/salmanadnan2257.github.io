"""Stop the drag hint from running through the control HUD.

Both sit on the bottom edge of the frame, hint left and HUD right, and they
collide in two separate bands. Measured on viz/sqlmill.html, gap in px between
the hint's right edge and the HUD's left edge:

  1400 -> +344    1180 -> +124    1040 ->  -16    900 -> -156
  1280 -> +224    1100 ->  +44    1000 ->  -56    760 -> -296

and again once the tail is already hidden, because below 560px the HUD drops its
speed slider and gets narrower, but not narrower than the hint is wide:

   520 ->  +36     390 ->  -94

The second band is the damaging one: 390px is an ordinary phone, and there the
words "any way" are printed straight across the Pause button, on all 38 pieces.

The fix stacks them rather than shortening either. Below 1120px the hint moves to
its own line above the HUD, so the full tail survives at widths where it used to
have to be thrown away, and the phone case is fixed by the same rule.
"""

EDITS = [
    ("""    /* Narrow frames have no room for the tail, and a finger cannot scroll or
       double-click anyway: the drag is the part that matters on touch. */
    @media (max-width: 700px), (pointer: coarse) {
      #hintMore { display: none; }
    }""",
     """    /* Narrow frames have no room for the tail, and a finger cannot scroll or
       double-click anyway: the drag is the part that matters on touch. */
    @media (max-width: 700px), (pointer: coarse) {
      #hintMore { display: none; }
    }
    /* The hint and the HUD share the bottom edge, one on each side, and below
       this width they overlap: first the hint's tail crosses into the HUD, then,
       once the tail is gone and the HUD has dropped its speed slider, the bare
       "Drag to turn it any way" still lands on top of the Pause button. Give the
       hint its own line above the HUD instead of shortening it, so the tail
       survives everywhere it fits. */
    @media (max-width: 1120px) {
      #hint { bottom: 56px; }
    }"""),
]
