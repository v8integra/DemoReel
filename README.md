# DemoReel

Scripted product demo videos. A YAML script says what to narrate and what to do in the app. DemoReel drives the real app with Playwright, records it, narrates it with a local voice (Kokoro), and builds an MP4 for YouTube. Everything runs offline after the first voice-model download.

```
node src/cli.mjs seed job-explorer             # once: build the demo data profile
node src/cli.mjs make job-explorer overview    # voice + record + assemble
```

Output goes to `output/`:
- `<product>-<script>.mp4`: 1920x1080, 30 fps, H.264 plus AAC
- `.srt`: captions to upload to YouTube
- `-thumbnail.png`
- `-youtube.txt`: title, description and tags

The individual steps can be re-run on their own:
- `voice`: only regenerates changed lines.
- `record`: needs the voice clips first.
- `assemble`: rebuilds from the last recording. Pass `--keep-frames` to keep the captured frames.

## How it works
1. **voice**: one Kokoro clip per sentence. Clips are cached by text, so editing one line re-voices only that line.
2. **record**: the app is launched with a copy of the seed profile, so the real data is never touched.
   - It is rendered at `size × scale` (1280×720 at 1.5 = 1080p).
   - An overlay is injected: cursor, click ripples, captions, title cards, zoom, highlight ring.
   - Each scene's steps run while its narration plays. Chromium's screencast captures frames.
3. **assemble**: ffmpeg turns the frames (held until the next change) and a narration track (clips placed where they were spoken) into the MP4.

## Script format (`products/<p>/scripts/*.yaml`)
Top-level settings:
- `voice`, `speed`: the Kokoro voice and its speed
- `size`, `scale`: window size and render scale
- `captions`: burned-in captions on or off
- `pronounce`: a map that changes how words are spoken
- `youtube`: title, description and tags
- `setup`: steps run before filming

Each scene has:
- `say`: the narration
- `card`: a title card (`{ title, subtitle, cta, image }`), or `null` to hide it
- `hold`: extra seconds at the end of the scene
- `steps`: the actions to perform

Steps (selectors are Playwright selectors):

| step | what it does |
|---|---|
| `nav: Tracker` | clicks a sidebar item |
| `click: <sel>` / `hover: <sel>` | moves the cursor smoothly, then clicks or rests |
| `type: { into, text, clear }` | types like a person |
| `select: { in, value }` | picks from a dropdown |
| `press: Enter` | presses a key |
| `scroll: 400` / `scroll: { by, over }` | mouse-wheel scroll |
| `zoom: { on, scale }` / `unzoom` | smooth zoom on an element |
| `ring: <sel>` / `ring: off` | highlights an element and dims the rest |
| `card: {...}` / `card: off` | shows or hides a title card mid-scene |
| `wait: 1.5` | pauses |
| `waitFor: <sel>` / `{ sel, timeout }` | waits until something appears (filmed) |
| `skip: { until, timeout, label }` | cuts out a long wait, such as an AI run. Filming pauses until `until` appears, then a "⏩ 2 minutes later" badge shows. |
| `clickAll: { sel, gap }` | clicks each matching control in turn, e.g. every "Approve" |
| `type: { into, text: [a, b, c] }` | a list types each entry and presses Enter (tag inputs). `enter: true` does the same for a single entry. |
| `eval: <js>` | runs JavaScript in the page |

A scene lasts as long as its narration or its steps, whichever is longer. If the steps run more than 1.5 s past the narration, recording prints a warning. Shorten the steps or lengthen the line.

More script settings:
- `start: fresh` films a brand-new install instead of the demo data.
- `openFiles: [file]` makes the app's Open dialogs return these files, since native file pickers can't be filmed.
- `chapter`, `introCard` are used by sequences.

## Tutorials (sequences)
A sequence (`products/<p>/sequences/<name>.yaml`) lists chapter scripts (`parts`) plus shared `defaults`. Example: `getting-started.yaml`.
- Each chapter starts from the app data the previous chapter left behind.
- Each chapter opens on a "Part N" card.
- The chapters are joined into one MP4 with merged captions. The `-youtube.txt` file gets the chapter timestamps for the description.

```
node src/cli.mjs make job-explorer getting-started             # everything
node src/cli.mjs make job-explorer getting-started --only=5    # redo chapter 5, re-join
node src/cli.mjs make job-explorer getting-started --from=6    # redo chapters 6 to the end
node src/cli.mjs make job-explorer getting-started --join      # re-join only
```

## Using it with Claude
Open a Claude Code session in this folder and describe the video you want. The `/demoreel` skill (`.claude/skills/demoreel`) covers the workflow and rules. `videos.md` is the list of planned and finished videos.

## YouTube Shorts (9:16)
`products/job-explorer/scripts/short.yaml` is the template. The app is rendered in a portrait window:

```yaml
size: [720, 1280]
scale: 1.5
output: [1080, 1920]
```

Other settings it uses:
- `css`: injected page CSS that tightens the layout, e.g. hides the sidebar or table columns. A `nav` step still works when the sidebar is hidden.
- `captionStyle: { bottom, fontSize, maxWidth }`: keeps captions above the Shorts UI.

Keep Shorts around 30 s, lead with a hook line, and use `zoom` a lot, since desktop text is small on a phone.

## Adding a product
Create `products/<name>/product.mjs` (how to launch it) and `seed.mjs` (demo data through the app's own API), plus scripts. Electron apps work as they are. A web app needs a `launchBrowser` variant of `src/launch.mjs` (not written yet).

## Notes
- Job Explorer: run `npm run build` in `JobSearcher/apps/desktop` first. DemoReel uses the unpackaged build, because packaged builds ignore `JOBSEARCHER_USER_DATA`.
- The seed uses the local Ollama model to score jobs, so the scores and reasons are real AI output. The people and companies are made up.
- The window is made larger than the screen on purpose to get true 1080p. It still records when covered by other windows.
