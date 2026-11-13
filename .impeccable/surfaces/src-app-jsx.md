---
version: 1
slug: "src-app-jsx"
primary_target: "src/App.jsx"
related_targets: ["src/resume/ResumeApp.jsx","src/insights/InsightsApp.jsx","local-board/public/index.html"]
---

## Scope

Whole product redesign: home job list (/), resume builder (/resume/), insights (/insights/), local application board (local-board/public). Mode: Operate (insights leans Read). Code-led; no image generation available.

## Audience and task

Chinese fresh graduates on desktop, scanning hundreds of campus jobs, filtering, saving, tracking deadlines and application stages. Must stay fast and dense. Light only. Avoid: marketing-page look, cold admin look, cute/decorative, generic AI templates.

## Direction contract

THESIS: Every job is a notice posted on a campus bulletin board: a double printed rule heads it, a tear-off strip on the right carries the deadline and the way to apply, and saving a job is tearing a strip off. Refuses the default white-card-on-grey job list with a blue accent.

OWN-WORLD: Pale grey-green board ground (glass case), warm-white notice paper sheets with 10px corners and a soft offset shadow, ink near-black green. Accent is the site's original teal (#195766, user decision 2026-11-14 after rejecting red and Morandi options): page-header double rule, seal, primary actions, saved state. Card double rules are neutral printed lines (--rule = g-300) and turn teal only when the job is saved. Deadline-soon sheets switch to muted yellow paper with amber text; danger uses #b0463c. Neutrals from one 9-step grey-green ramp. Everything on one 4px baseline and shared column widths (raise from Crouwel grid). Guide words in the list header naming first and last company on the page (raise from lexicon).

STORY: Visitor sees which notices are new and which expire soon, narrows the board with filters, tears off strips for the jobs they want, then manages them in the resume builder and local board, which use the same paper, rule and strip language.

FIRST VIEWPORT: Slim header: wordmark with red-head double rule, cohort chip, links to 数据洞察/简历生成器/主页. Page title row with one-line promise and live counts. Tabs (招聘机会/即将截止/我的收藏) as a sliding segmented control. Left 280px filter rail on board ground; right: list header with guide words and sort, then notice cards: company + red double rule + title + tags, with a vertical tear-off strip at the right edge showing the deadline countdown and the apply action.

FORM: assigned direction, candidate 4 of 7 on own list (校园公告栏). seed:a64f04e761832f0c

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Motion thesis

Focal moment: saving a job tears the strip along its perforation (clip-path + rotate) and the 收藏 counter ticks. Continuity: segmented tab thumb slides; result list re-staggers briefly (capped 240ms total) on filter change; dialogs rise from their trigger. Feedback: 120-200ms state transitions. Board: cards lift while dragged, columns highlight drop target. Reduced motion: no tearing travel, just state swap with opacity.
