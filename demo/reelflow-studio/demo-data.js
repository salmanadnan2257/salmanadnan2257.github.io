// Fabricated demo data. No real client names, no real n8n URLs, no live calls.
// The three video files referenced below are real, freely-licensed footage
// (trimmed, re-encoded, stored locally), not stock footage of any real
// Digitalise Agency client and not depicting any identifiable person's face
// or voice. Full attribution in assets/videos/CREDITS.md.

const DEMO_VIDEOS = [
  { id: "v1", title: "Product teaser: grinder close-up", video: "assets/videos/card1-product-teaser.webm" },
  { id: "v2", title: "Behind the scenes: roastery tour", video: "assets/videos/card2-roastery-tour.webm" },
  { id: "v3", title: "Process reel: syphon brew", video: "assets/videos/card3-brew-process.webm" }
];

const RETRY_POLICY = {
  attempts: 6,
  gapSeconds: 15,
  timeoutSeconds: 120,
  timeoutHeavySeconds: 240
};
