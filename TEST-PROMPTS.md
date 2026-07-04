# Standard test prompts

Three standard prompts for validating pipeline changes. Run the relevant one(s)
after any change to the creative director, storyboard builder, codegen, critique,
or render layers — each exercises a different slice of the system, and together
they cover it. Keep the wording VERBATIM across runs so results are comparable.

## 1. Launch film (baseline — continuity with all prior tuning runs)

Exercises: creative direction, beats-in-scene structure, element inventories,
light-brand color discipline, component embedding, voiceover + music.

```json
{
  "tenant_id": "marc-getquotient-ai",
  "prompt": "A 30-second launch film for Quotient, the AI marketing platform that turns one campaign brief into every channel automatically. Story arc: a marketer's morning starts as a pile-up of disconnected tools and notifications; Quotient arrives and the chaos reorganizes itself into one calm pipeline; the results speak (pipeline generated, hours saved); close on a confident call to action at getquotient.ai. Premium Framer/Linear launch-film quality: cinematic, restrained, one continuous visual world per idea.",
  "target": "video",
  "mode": "full",
  "voiceover": true,
  "background_music": true,
  "voice": "nova"
}
```

## 2. Full-media workout (media plan, b-roll, hero stills, component breadth)

Exercises: the treatment media plan (real footage opener, generated-still hold),
b-roll fetch + backdrop compositing, hero image generation, social-proof and
chart components, the single-caption-motif rule, CTA close.

```json
{
  "tenant_id": "marc-getquotient-ai",
  "prompt": "A 45-second brand film for Quotient. Open on the real world: a marketer's cluttered desk at dawn, coffee going cold — this should feel like actual footage, alive and human. Then move into Quotient's world: one brief typed, and campaigns fan out across email, social, ads and landing pages. Show proof: a bar chart of pipeline generated climbing quarter over quarter, a real-looking LinkedIn post celebrating results, and the stat '11 hours saved per week'. Hold one quiet, contemplative still moment — a calm workspace, everything in its place — before closing on getquotient.ai. Use one consistent caption treatment throughout.",
  "target": "video",
  "mode": "full",
  "voiceover": true,
  "background_music": true,
  "voice": "nova"
}
```

Pass criteria beyond the usual: at least one scene with `broll_query`, one with
`hero_image`, a `bar-chart` and a social/* component embedded, and one caption
style reused (never mixed).

## 3. Speaker walkthrough (speaker track, screencast, PiP)

Exercises: the speaker-track pipeline (continuous camera base layer, transparent
content overlays, circular PiP on screencast scenes), browser-frame/terminal
components, continuous-take beats.

Requires a speaker video asset. Upload one first (`upload` tool → note the
`/assets/...` path), then:

```json
{
  "tenant_id": "marc-getquotient-ai",
  "prompt": "A 40-second product walkthrough of Quotient, presented by a speaker on camera. Structure: the speaker introduces the problem (speaker visible, a few key phrases appearing beside them); then a screen-recording-style walkthrough of typing a campaign brief and watching the pipeline generate — browser window filling the frame with the speaker in a small picture-in-picture circle; close with the speaker back full-frame and the getquotient.ai call to action beside them. One continuous take per section, steps as beats.",
  "target": "video",
  "mode": "full",
  "speaker_source": "<PATH-OR-URL-TO-SPEAKER-VIDEO>",
  "voiceover": false,
  "background_music": true
}
```

Pass criteria: speaker visible (not covered) on intro/outro scenes; screencast
scene carries an inventoried `speaker-pip` element rendered as a circular bubble;
final composite has no audio drift (the speaker base is never sliced per scene).
