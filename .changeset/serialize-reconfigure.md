---
"vite-plugin-justif": patch
---

Overlapping `reconfigure()` calls no longer enhance paragraphs twice. Each
call now queues behind the previous rebuild's scan; before, two calls made
back to back both scanned while the first was still loading hyphenation, so
`window.justif.controllers` doubled with every overlapping pair and the
duplicate controllers kept their observers alive.
An earlier call's promise now resolves only once the queue behind it has
rebuilt the page, and a controller whose teardown throws no longer makes every
later call fail.
