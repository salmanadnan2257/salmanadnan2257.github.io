"""Stop a small drag from setting a piece spinning forever.

Each frame the runtime gives the scene back its own camera position before the
scene steps, so a scene that eases the camera from where it currently is never
reads the viewer's orbit back as its own starting point. The orientation was not
given back. A scene that places its camera once and leaves it (zarailink does,
in setup) therefore handed the runtime last frame's orbited orientation as "the
scene's own". applyView measured that as the scene's twist, the viewer's turn was
layered on top of it again, and the two compounded every frame: a 6 px drag
became an orbit that never stopped. Measured on viz/zarailink.html, camera
rotation between 4 s and 8 s after releasing a 6 px drag:

  untouched: 0.00 deg/s    after the drag: 13.55 deg/s, and still going

The fix keeps the scene's own orientation next to its position (baseCamQ) and
restores both before every scene step, so the twist is always measured against
what the scene itself did.

Also here: the first frame after a loop is (re)started could see a negative dt,
because the loop's clock is seeded from performance.now() while requestAnimationFrame
stamps the frame with its own, slightly earlier, start time. A negative dt made the
slerp factor negative, which nudged the view backwards for one frame, and grew the
release momentum instead of decaying it. dt is now clamped at zero from below.
"""

EDITS = [
    ("""const baseCam = new THREE.Vector3();
const off = new THREE.Vector3();""",
     """const baseCam = new THREE.Vector3();
/* Its orientation too. Restoring only the position let a scene that does not
   re-aim its camera every frame hand back last frame's orbited orientation as its
   own, and the orbit compounded on itself into a spin that never stopped. */
const baseCamQ = new THREE.Quaternion();
const off = new THREE.Vector3();"""),
    ("""  if (fresh) {
    baseCam.copy(camera.position);
    baseSet = true;""",
     """  if (fresh) {
    baseCam.copy(camera.position);
    baseCamQ.copy(camera.quaternion);
    baseSet = true;"""),
    ("""  const dt = Math.min((now - vlast) / 1000, 0.1);""",
     """  const dt = Math.max(0, Math.min((now - vlast) / 1000, 0.1));"""),
    ("""  const dt = Math.min((now - last) / 1000, 0.1);""",
     """  const dt = Math.max(0, Math.min((now - last) / 1000, 0.1));"""),
    ("""  if (baseSet) camera.position.copy(baseCam);""",
     """  if (baseSet) { camera.position.copy(baseCam); camera.quaternion.copy(baseCamQ); }"""),
]
