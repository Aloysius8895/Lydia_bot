# Native component port

User-approved scope: replace the earlier token-only integration with a working page/component adaptation of the locally inspected Grok Bot frontend. Preserve the explicitly required 27% / 42% / 31% desktop panes and readable typography. No Grok subscription or account is required for Lydia.

Source evidence: renderer bundle has sand-agents-sidebar sections/footer and pinned-agent state, multi-pane navigation, custom Bot detail/template modules, automation/detail/settings sections, a rich composer and attachment boundaries. Existing reference CSS and theme values are in reference/ and evidence/. Runtime observations remain unavailable past the app loading surface; do not claim a pixel-exact reconstruction of paid states.

Implement inline:

1. Create native shared page components: multiline composer with Enter/Shift+Enter and composition support, suggestion cards, message actions and sidebar section controls. Use only local React, existing icons/API; avoid embedding opaque vendor runtime code.
2. Replace Sidebar composition with workspace header, new-project action, real search/pinned filters, collapsible bot/room sections and direct working Crawl/source/settings shortcuts. Wire callbacks through App. Preserve project switching and custom avatars.
3. Recompose Conversation into header actions, profile-led welcome page, suggestion cards, a multiline composer toolbar and live research activity. Messages support copy and visible acknowledgement without executing source HTML. Real send/cancel/source actions retain original backend semantics.
4. Recompose right-side project summary with profile header, real case/task/evidence counters and action navigation while keeping sources/gaps/requirements backed by the existing API. Give Settings a page heading and contextual description; restyle onboarding/create-project and mobile surfaces to match the same design system.
5. Build, run typecheck and original/Crawl browser checks. Add meaningful checks for new controls, draft preservation, pinned filters, textarea keyboard semantics and navigation. Verify screenshots, all three desktop widths, mobile overflow, and persistent case/export workflows. Save results and component mapping under bot_rea.

Definition of done: new native page/component structure is visible and controls work with Lydia data. Report visual adaptation and coverage separately from unverified original Grok runtime behavior. Do not call an untouched structure a complete original-app transplant.
