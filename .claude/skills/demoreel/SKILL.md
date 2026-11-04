---
name: demoreel
description: Make a product demo video, YouTube Short, or step-by-step tutorial with DemoReel (scripted app recording + local AI voice). Use when the user asks for a video, short, tutorial, or demo of one of their products, or to change, re-record, or translate one.
---

# Making videos with DemoReel

DemoReel (this folder) drives a real app with Playwright, records it, and narrates it with a local voice (Kokoro). The user describes the video; you write the script, record it, check it, and hand over the files. Read README.md for the full step list.

## Workflow
1. **Understand the ask.** Pick the format:
   - **video:** 16:9, 45–90 s, for sales
   - **short:** 9:16, about 30 s, must open with a hook
   - **tutorial:** a sequence of chapters, several minutes long
   Check videos.md for what already exists, and add the new video to it.
2. **Learn the screens before scripting.** Read the product's UI code for real selectors and text. To see a screen, probe the running app: launch it with `src/launch.mjs`, take screenshots, and dump `innerText`. Never guess selectors from memory.
3. **Write the script** in `products/<p>/scripts/<name>.yaml`. A tutorial is a sequence in `products/<p>/sequences/<name>.yaml`, with one script per chapter. Copy an existing script as the starting point:
   - `overview.yaml`: a sales video
   - `short.yaml`: a Short
   - `getting-started.yaml` plus `tutorial-*.yaml`: a tutorial
4. **Make it:** `node src/cli.mjs make <product> <name> --keep-frames`. A tutorial takes as long as its chapters play plus any AI waits. Run anything that may take over 2 minutes in the background.
5. **Check it yourself before showing the user.**
   - Build a contact sheet with ffmpeg:
     ```
     node_modules/ffmpeg-static/ffmpeg.exe -i output/<file>.mp4 -vf "fps=1/2,scale=480:-1,tile=6x5" -frames:v 1 sheet.png
     ```
     Then read the image.
   - Look for wrong screens, bad crops or zooms, captions covering something important, and dialogs left open.
   - Read the recording log. "steps ran N s past the narration" means silence on screen. Fix it by lengthening the line or trimming the steps; aim for under 1.5 s.
6. **Deliver.** Send the MP4. Say where the `.srt`, thumbnail, and `-youtube.txt` files are, and give the user anything they need to add themselves, such as the Store link.
7. **Update videos.md** with the video's status.

## Writing narration
- Plain, friendly, second person ("you"). Each sentence becomes one caption, so keep sentences short.
- **Never claim a feature the app doesn't have.** Check the code or the app's Guide first.
- With live data, don't quote numbers or company names that will change. Describe what the screen shows instead.
- Avoid periods inside sentences. They split captions, so write "the Ollama website", not "ollama.com", and "federal jobs in the United States", not "U.S.".
- Fix pronunciation with `pronounce:`, e.g. `{ USAJOBS: U.S.A. Jobs }`.
- A Short needs a hook in the first line and must stay at 60 s or under. Desktop text is small on a phone, so make it readable:
  - Best: scale the whole page with script CSS (`main.content { zoom: 1.35; }`). The page re-flows to the narrow width, so nothing is cropped (`privacy-short.yaml`).
  - Use the `zoom` step only on things narrower than the screen. Zooming a full-width section crops its lines.
  - Hide the sidebar and wide table columns with script CSS. This styling is recording-only; say so when delivering.

## Data and safety rules
- Film only throwaway data folders. The product's `env()` points the app at one, and the user's real profile is never used.
- Demo people and companies are made up. Real company names appear only when the user chose real job boards (Job Explorer tutorial: Reddit, Coinbase, Vanta).
- Don't film another company's logo or branding as if it were ours.
- Never upload or publish anything. The user posts the videos.
- Don't commit unless the user asks.

## Product notes
**Job Explorer** (`products/job-explorer`):
- Build the dev bundle first: `npm run build` in `JobSearcher/apps/desktop`.
- `product.mjs` sets `JOBSEARCHER_STORE_EDITION=1`, so videos show the Store version.
- Demo data: `node src/cli.mjs seed job-explorer`. It uses local Ollama, which must be running.
- The setup wizard keeps its step in memory. A tutorial part that continues the wizard re-walks the earlier steps in its `setup`, off camera.
- Native file dialogs are replaced by `openFiles` (the made-up resume in `assets/`).
- Native `<select>` popups don't show in the recording, so use the `select` step.
- Clicking "Open posting" opens the real browser. Hover it instead.

## Re-recording
- Sequences: `--only=N` re-records one chapter from the state the previous chapter saved. `--from=N` re-records from chapter N to the end. `--join` only re-joins the chapters.
- If a live-data run changes too much between takes, tell the user and offer made-up jobs instead. That's their call.
