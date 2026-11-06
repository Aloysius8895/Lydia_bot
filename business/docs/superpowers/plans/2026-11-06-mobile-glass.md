# Mobile glass workspace implementation plan

User approved implementation on 2026-11-06, explicitly including day mode. Latest reference: pic/mobile-spacing-refinement-2026-11-06; glass material from mobile-liquid-glass-2026-11-06. Execute inline; preserve existing dirty work and business behavior.

- [x] MobileNav: reusable glass three-destination navigation with accessible names and selected labels. Integrate home, projects and settings overview, exclude chat/new-project/detail overlays.
- [x] MobileHome: grouped team/expert rows, project picker, search/pinned controls and clear scroll space. Preserve custom avatars and role data.
- [x] Settings: mobile vertical overview and back navigation; existing desktop sidebar, all sections and deep links remain.
- [x] Chat: move existing call entry to mobile header; desktop dock remains; reduce mobile task card weight and input crowding. Keep real call lifecycle and task actions.
- [x] Add mobile-only light/dark tokens, safe areas and dynamic viewport/keyboard handling; themed project/research/source/settings surfaces; blur fallback and reduced-transparency handling.
- [x] Build/typecheck; isolated browser checks for themes/persistence, navigation, Bob clearance, chat/call controls, project upload, research/settings access, small viewport and desktop regression. Save screenshots under pic/mobile-implemented-2026-11-06. Reload running service safely after checks.
