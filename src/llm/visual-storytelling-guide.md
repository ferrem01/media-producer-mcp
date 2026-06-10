# Visual Storytelling Guide for Scene Planning

> **Purpose:** This guide teaches the planner to think like a creative director, not a marketer. Every video we produce should feel like a *story someone wants to watch*, not a slide deck someone endures.

> **Core Principle:** Each scene is a WORLD, not a layout. Before writing CSS specs and GSAP instructions, describe what the viewer EXPERIENCES.

---

## 1. Visual Storytelling Patterns

When a user describes a feature, pick the pattern that makes the feature's essence *visible*. Don't default to title cards and bullet points. Match the pattern to what makes the feature exciting.

### 1.1 UI Walkthrough

**When to use:** The feature has a real interface. The story IS the experience of using it.

Animate the user's journey through the product. A cursor moves with intention. Menus open. Toggles flip. Fields fill. The viewer should feel like they're *using* the product, not reading about it.

**Example — "New AI connector that plugs into any data source":**
> Scene opens on a clean workspace. Cursor glides to the sidebar, clicks the "+" icon. A connector menu fans open like a deck of cards. The cursor hovers over "Salesforce" — it highlights, pulses. Click. A toggle slides ON with a satisfying snap. Immediately, data particles stream from the connector icon into the workspace, coalescing into a live dashboard. The numbers aren't static — they're *arriving*.

**Key:** Every interaction gets a motion verb. Nothing "appears" — it SLIDES, SNAPS, FANS, STREAMS, COALESCES.

### 1.2 Before/After Transformation

**When to use:** The feature replaces something painful. The contrast IS the story.

Show the old way in all its misery. Then *morph* it into the new way. The transformation itself is the most powerful moment — don't cut between them, *animate the change*.

**Example — "We replaced manual CSV imports with automatic sync":**
> A spreadsheet fills the frame, rows scrolling endlessly. A cursor drags a CSV file, drops it — an upload bar crawls at painful speed. Error toast pops up: "Column mismatch." The whole spreadsheet SHUDDERS, then the rows begin to dissolve. They reconstitute as a clean data stream flowing through a pipeline. The pipeline pulses green. Data lands in perfect rows, already validated. Zero effort. The upload bar? Gone. It was never needed.

### 1.3 Cause and Effect

**When to use:** The feature triggers a satisfying chain reaction. One action unlocks many results.

The viewer sees a single simple action. Then the dominoes fall — each consequence more impressive than the last. The gap between "tiny input" and "massive output" is the story.

**Example — "One-click deployment to all environments":**
> A finger taps a single blue "Deploy" button. The button depresses with weight. A ripple radiates outward from it. The ripple hits a row of environment cards — staging LIGHTS UP green, then production, then EU-west, then AP-south — each one igniting a half-second after the last, like stadium lights firing in sequence. Deployment logs cascade down each card in real-time. Twelve environments, one tap, four seconds.

### 1.4 Build-Up Reveal

**When to use:** The product is complex. Showing it all at once overwhelms. Showing it piece by piece creates anticipation.

Components arrive one by one, each snapping into place. The viewer watches something assemble itself and feels the satisfaction of *completion*.

**Example — "Our workflow builder lets you create complex automations":**
> Empty canvas. A trigger block DROPS in from above, lands with a subtle bounce. A connection line DRAWS itself rightward. A condition block SLIDES in from the right, docks to the line with a magnetic click. The line forks — two paths. Action blocks FLY in and seat themselves on each branch. The whole workflow PULSES once, alive, and data particles begin flowing through the paths, splitting at the condition, reaching their destinations. Built in seconds. Running immediately.

### 1.5 Data Coming Alive

**When to use:** The feature involves numbers, analytics, metrics, or insights. Static data is boring. Animated data is mesmerizing.

Numbers don't just display — they COUNT UP. Charts don't just appear — they DRAW THEMSELVES. Comparisons don't sit side by side — one TRANSFORMS INTO the other.

**Example — "Real-time analytics dashboard":**
> A single metric sits center-frame: "0 active users." The zero starts CLIMBING — 12, 89, 340, 1,247 — each digit rolling like an odometer. As the number grows, a heatmap BLEEDS outward beneath it, hot spots intensifying in real time. Sidebar charts begin DRAWING their lines, racing rightward. A geographic map LIGHTS UP city by city as users come online. The whole dashboard is *breathing* with live data. Nothing is static. Everything is NOW.

### 1.6 Journey / Flow

**When to use:** The feature involves a process, pipeline, or path. Follow something as it moves through the system.

Pick a protagonist — a data packet, a user request, a document — and follow it through the entire flow. The viewer rides along.

**Example — "End-to-end document processing pipeline":**
> A document icon drops into a glowing intake portal. It slides down a conveyor — first stop: OCR. Text LIFTS off the document surface like steam, rearranging into structured fields. Next stop: Classification. The document passes through a prism and splits into color-coded streams — invoice, receipt, contract. The invoice stream carries our document into a verification chamber where checkmarks STAMP themselves onto each field. Out the other side: a clean, validated record slots into a database row. Three seconds. Zero humans.

### 1.7 Metaphor

**When to use:** The feature is abstract. Speed, security, reliability, scale — these need to be made *concrete and visible*.

Translate the abstract concept into a physical, visceral visual. Speed becomes a race. Security becomes a shield. Scale becomes a landscape stretching to the horizon.

**Example — "Our search is 10x faster than competitors":**
> Split screen. Left side: a search bar. A query types itself in, letter by letter. A spinner appears. Rotates. Keeps rotating. Three seconds of nothing. Results fade in, sluggish. Right side: same query, same letters — but results SLAM into frame before the last letter is even typed. The results don't fade in. They ARRIVE. Stack. Settle. Done. The left side is still loading its second result. Speed isn't a number we tell you. Speed is the gap you *see*.

### 1.8 Zoom In / Out

**When to use:** The feature operates at different scales. Show the big picture, then dive into the detail — or start in the weeds and pull back to reveal the scope.

The camera move itself tells the story. Zooming in says "look closer, this matters." Zooming out says "this is bigger than you thought."

**Example — "Granular permissions on a massive user base":**
> We start at orbit: a vast grid of user avatars, thousands of them, stretching across the frame like a city seen from above. We DIVE. The grid blurs past us. We land on a single user's profile. Permission toggles sit in a neat column. A cursor flips "API Access" ON. We PULL BACK — rising fast — and the change ripples outward across the grid, updating policy for that user's entire team. One toggle. Fifty people. Visible from orbit.

---

## 2. Scene Description Format

Every scene you write should read like a storyboard director's notes, not a wireframe spec. Follow this structure:

### The Rules

1. **Lead with the CONCEPT, not the layout.** Wrong: "Dark blue background, text centered." Right: "We're inside the product, mid-action, momentum building."

2. **Every element gets a MOTION VERB.** Nothing "is there." Everything ARRIVES, SLAMS, DRIFTS, MORPHS, TYPES ON, ASSEMBLES, DISSOLVES, ERUPTS, CASCADES, SNAPS, RACES, BLEEDS, DROPS, PEELS, IGNITES.

3. **Describe the EXPERIENCE, not the arrangement.** Wrong: "Logo top-left, 40px. Tagline centered below, 24px, white." Right: "The logo marks the space like a signature — present but not demanding. The tagline writes itself on screen, each word landing with quiet confidence."

4. **Include depth layers.** Scenes have a background (BG), midground (MG), and foreground (FG). This creates visual depth and allows layered animation.

5. **Specify choreography.** What moves first? What follows? What overlaps? What waits? Timing relationships between elements are what make a scene feel *directed* vs. *random*.

6. **Define the transition.** How does this scene END and the next one BEGIN? Scenes don't cut to black. They *transform into each other*.

### Scene Description Template

```
SCENE [N]: [Concept Name]
Duration: [seconds]
Energy: [low/building/peak/resolving]
Mood: [tense, triumphant, playful, elegant, urgent, serene]

WHAT THE VIEWER EXPERIENCES:
[2-3 sentences describing the emotional/narrative arc of this scene]

LAYERS:
- BG: [what lives in the background — ambient motion, gradients, environment]
- MG: [the main action — UI elements, data, primary animation]
- FG: [overlay elements — particles, light effects, depth-of-field blur]

CHOREOGRAPHY:
1. [First thing that happens — with motion verb and timing]
2. [Second thing — relationship to first: "0.3s after", "simultaneously", "as it lands"]
3. [Third thing — building on the previous]

TRANSITION OUT:
[How this scene hands off to the next — morph, zoom, dissolve, push, ripple]
```

### Example Scene Description

```
SCENE 2: The Connector Awakens
Duration: 4s
Energy: building
Mood: satisfying, mechanical precision

WHAT THE VIEWER EXPERIENCES:
The moment of activation — the user flips the switch and the system comes alive.
Anticipation builds through micro-interactions before the payoff of flowing data.

LAYERS:
- BG: Deep charcoal workspace with subtle grid lines that pulse faintly, like a heartbeat
- MG: Connector panel in focus — toggle switch, status indicators, data preview
- FG: Particle stream that will flow from connector to workspace once activated

CHOREOGRAPHY:
1. Cursor GLIDES to the toggle with deliberate intent (0.4s ease-in-out)
2. Toggle SNAPS on — the switch slides right with a micro-bounce (0.2s)
3. Status dot IGNITES from gray to green, radiating a brief pulse ring (0.3s, overlaps with toggle)
4. 0.2s pause — the beat before the payoff
5. Data particles ERUPT from the connector icon, streaming rightward in an accelerating arc (1.5s)
6. Particles COALESCE into dashboard widgets, each one lighting up as data arrives (1.2s, staggered)

TRANSITION OUT:
Camera PUSHES IN toward the live dashboard, which fills the frame and becomes Scene 3's environment.
```

---

## 3. How to Translate a Feature into a Visual Story

When a user says "make a video about [feature]," follow these steps:

### Step 1: Identify the Core Experience

Ask: **What does the user FEEL when they use this feature?** Not what does it do — what does it feel like?

| Feature description | Core experience |
|---|---|
| "AI connector that plugs into any data source" | Discovery → Connection → Flow. The satisfaction of plugging something in and watching it work. |
| "Search that's 10x faster" | Impatience eliminated. Results are already there. Startling speed. |
| "Workflow builder with drag-and-drop" | Creation. Building something from nothing. Lego-like assembly satisfaction. |
| "Real-time collaboration" | Presence. You're not alone. The document is alive with other people. |
| "One-click deployment" | Power. A single action triggers a massive cascade. You're in control. |

### Step 2: Pick a Storytelling Pattern

Match the core experience to the pattern that makes it visible:

| Core experience | Best pattern |
|---|---|
| Using the product feels great | **UI Walkthrough** — show the experience |
| This replaces something painful | **Before/After Transformation** — show the contrast |
| Small input, big output | **Cause and Effect** — show the cascade |
| Complex product, many parts | **Build-Up Reveal** — show it assembling |
| Numbers or metrics are impressive | **Data Coming Alive** — animate the data |
| Process or pipeline | **Journey / Flow** — follow something through |
| Abstract benefit (speed, security) | **Metaphor** — make it physical |
| Works at multiple scales | **Zoom In/Out** — show both levels |

You can combine patterns. A video might open with a **UI Walkthrough** (show the click), transition to **Cause and Effect** (show what it triggers), and end with **Data Coming Alive** (show the results). But each *scene* should commit to one pattern.

### Step 3: Write Storyboard-Quality Scene Descriptions

Use the Scene Description Format from Section 2. For each scene, write what the viewer EXPERIENCES first, then layer in the technical details.

**Test your descriptions:** Read them aloud. If they sound like a spec doc, rewrite. If they sound like someone excitedly describing a movie scene, you're there.

### Step 4: Define Rhythm and Pacing

Map the energy arc across your scenes:

```
Scene 1: HOOK (high energy — start mid-action)
Scene 2: BUILD (escalating — add complexity)
Scene 3: PEAK (highest energy — the main payoff)
Scene 4: RESOLVE (controlled energy — land the message)
```

Not every video needs four scenes. Some features are a single three-second moment. But every video needs an energy ARC — it goes somewhere.

### Worked Example

**Input:** "We have a new AI assistant that can answer questions about your codebase."

**Step 1 — Core experience:** Relief. You have a question, you ask it in plain English, and you get an answer instantly. No more grep-ing through repos. The feeling of having a senior engineer sitting next to you.

**Step 2 — Pattern:** UI Walkthrough (show the conversation) + Cause and Effect (question triggers impressive deep retrieval).

**Step 3 — Scenes:**

> **SCENE 1** (2s, high energy): A code editor fills the frame, dense with syntax. The cursor blinks in a sea of unfamiliar code. A chat panel SLIDES open from the right edge. A question TYPES ITSELF in: "How does the auth middleware work?" The send button PULSES once.
>
> **SCENE 2** (3s, building): The question radiates outward as a search ripple. In the background, file trees ILLUMINATE one by one as the AI scans them — dozens of files lighting up and dimming in rapid sequence, like synapses firing. Three code snippets RISE from the file tree and float toward the chat panel.
>
> **SCENE 3** (3s, peak): The answer WRITES ITSELF into the chat — clean, structured, with inline code references. As each code reference appears, a translucent line DRAWS from it back to the source file in the background tree. The viewer can *see* the AI's understanding — it's not guessing, it's tracing connections. The code editor scrolls to the exact function mentioned, highlighted.

**Step 4 — Rhythm:** Hook with the intimidating wall of code (empathy). Build with the AI searching (anticipation). Peak with the answer and its visible connections (payoff). No final logo card — the answer IS the ending.

---

## 4. Anti-Patterns

These are the patterns of mediocre product videos. Never produce them.

### ❌ The Title Card Opener
"Scene 1: Product name fades in on gradient background. Tagline below."

**Why it fails:** You've wasted 3 seconds saying nothing. The viewer has already decided whether to keep watching, and you showed them a logo. Start mid-action. The product name can appear *inside* the experience.

### ❌ The Bullet Point Parade
"Scene 1: Feature A with icon. Scene 2: Feature B with icon. Scene 3: Feature C with icon."

**Why it fails:** It's a slide deck. Each scene is the same layout with different text. There's no story, no progression, no reason to keep watching. If you have three features, find the ONE story that connects them.

### ❌ The Stock Photo with Text Overlay
"Scene: Business team collaborating. Text overlay: 'Real-time collaboration for modern teams.'"

**Why it fails:** It says nothing about YOUR product. A stock photo tells the viewer you have nothing worth showing. Show the actual product experience, even if it's stylized or abstracted.

### ❌ The Repeated Layout
Using the same visual composition for every scene — same position, same size, same animation style. Just swap the text.

**Why it fails:** Visual monotony. The viewer's brain disengages because it predicts what's coming. Vary your compositions: wide shot, then close-up. Left-weighted, then right-weighted. Dense, then sparse.

### ❌ The Floating Text on Gradient
"Bold headline floats over abstract gradient. Maybe some particles."

**Why it fails:** It's decorative emptiness. The gradient and particles aren't telling a story — they're filling space. Every visual element should serve the narrative. If you need a background, make it CONTEXTUAL: a code editor, a dashboard, a workspace. Something that grounds the viewer in the product's world.

### ❌ The Logo Card Ending
"Final scene: Logo centered, tagline below, URL at bottom."

**Why it fails:** You've ended on the least interesting thing. End on the RESULT — the working feature, the flowing data, the solved problem. If the logo must appear, let it EMERGE from the experience (e.g., it's already part of the UI that's on screen).

---

## 5. Rhythm and Pacing

### Hook in the First 2 Seconds

Never start from black. Never start from a blank screen that "builds up." Start mid-action:
- A cursor is already moving
- Data is already flowing
- The UI is already on screen
- Something is already in motion

The viewer must see MOMENTUM within the first frame. If they have to wait for your video to "get started," they won't.

### Vary Energy: Fast → SLOW → Fast

Constant high energy is exhausting. Constant low energy is boring. The contrast between speeds creates drama.

**The Power of the Pause:** After a fast sequence, hold for 0.3-0.5 seconds. Let the result breathe. That tiny pause says "look at this" louder than any animation. Then accelerate into the next sequence.

```
BAD:  ████████████████████████  (constant high energy)
GOOD: ███░██████░░███████░██░   (varied, with breaths)
```

### Every Scene Earns Its Time

If a scene doesn't advance the story, cut it. Common offenders:
- Establishing shots that establish nothing ("here's a gradient background")
- Transition scenes that are pure decoration
- Recap scenes that repeat what was already shown

A 4-scene video where every scene matters beats a 7-scene video with padding.

### Transitions Are Story Beats

Don't think of transitions as connectors between scenes. Each transition IS a micro-story:
- **Morph**: "The old thing becomes the new thing" (transformation)
- **Push/Zoom**: "We go deeper" (discovery)
- **Ripple/Expand**: "The impact spreads" (consequence)
- **Dissolve**: "Time passes" (progression)

Match the transition to the narrative relationship between scenes.

### End on Action

The last thing the viewer sees should be the product WORKING. Not a logo. Not a tagline. The feature, alive, delivering value.

If you must include branding, integrate it: the logo is part of the UI that's already on screen. The URL types itself into the browser bar of the product being shown. The brand is *inside* the story, not stapled onto the end.

---

## Quick Reference: The Checklist

Before finalizing any scene plan, verify:

- [ ] **No scene starts from nothing.** Every scene opens with something already in motion.
- [ ] **Every element has a motion verb.** Ctrl+F for "appears" and "is" — replace them.
- [ ] **Each scene has a concept, not just a layout.** Can you describe what happens without mentioning coordinates or pixel sizes?
- [ ] **Energy varies across scenes.** Map it: is there a build? A peak? A breath?
- [ ] **Zero anti-patterns.** No title cards, no bullet parades, no floating text, no logo endings.
- [ ] **Transitions are intentional.** Each one has a narrative reason.
- [ ] **The first 2 seconds hook.** Would YOU keep watching?
- [ ] **The story matches the feature.** Does the visual pattern make the feature's core experience VISIBLE?
