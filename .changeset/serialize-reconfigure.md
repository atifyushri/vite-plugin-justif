---
"vite-plugin-justif": patch
---

Overlapping `reconfigure()` calls no longer enhance paragraphs twice. Each
call now queues behind the previous rebuild's scan; before, two calls made
back to back both scanned while the first was still loading hyphenation, so
`window.justif.controllers` doubled with every overlapping pair and the
duplicate controllers kept their observers alive.
