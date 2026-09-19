# Plain question text with measured mobile scrolling

Revision: option-b-prompts-5. Replaces shimmer with solid readable text on phone and desktop. Each question has a 2500 ms window. On mobile only, a question wider than its actual available field width holds at its beginning for 350 ms, translates left through exactly the overflow distance over 1800 ms, then holds its ending for 350 ms. The next question replaces it at x=0. Fitting questions do not move; desktop also keeps text stationary while rotating examples. Full example wording is retained on narrow phones rather than substituting compact wording.

Focus/typing stops and hides the example without changing user input. Resizing and font loading remeasure available width; hidden pages, open dialogs, pause and reduced motion stop cycling. Reduced motion presents wrapped static text. Try example and the redundant Browse capabilities link remain removed; the question heading and bold Explore capabilities section heading remain.

The orb rendering, six-system catalogue, brand palette and other site content were not redesigned.

Local Chromium checks passed at 320, 350, 375, 390, 414, 430, 720, 768 and 1280 px: no shimmer style, no horizontal page overflow, measured mobile start/middle/end translation, desktop stationary text, hidden removed controls, input preservation, typed security navigation, Business Automation feature navigation and reduced-motion static display. A full ten-question real-time cycle was inspected separately; the saved regression report samples four successive questions with reset positions and endpoint visibility. Actual browser frames provide the accompanying 8-second motion preview. Checks used locally inlined files and the installed font fallback, not a physical iPhone or a hosted test.

Hosting: this revision is saved on the isolated GitHub branch and supplied in the standalone ZIP. It has not been deployed to AppDeploy or the manual Netlify copy. The prior AppDeploy daily-limit response prohibits retrying before its reset; no paid upgrade, production dashboard merge or DNS change was performed.
