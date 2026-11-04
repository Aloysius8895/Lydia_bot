# Sidebar reference adaptation

User supplied a Claude sidebar screenshot and asked to apply that design to the left sidebar only. Preserve 27/42/31 desktop proportions and current chat/detail pages. Keep Lydia branding.

Replace the existing card/large-avatar navigation with: a serif wordmark/header, plain icon-and-label navigation, an independently scrolling Recents list populated from real cases, and a fixed account footer. Match the reference's spacing, hover/selected rows and neutral surfaces in both themes.

Working menu mapping: New → create case; Search → filter recent cases/team; Projects → reveal and focus Recents; Artifacts → case sources; Crawl → native Settings Crawl; Design → avatar settings; Customize → connection settings. No Scheduled menu is added because scheduling has not been implemented. Retain team/method navigation in a compact collapsible section.

Files: Sidebar.jsx, App.jsx props, sidebar-reference.css and main.jsx import. Update existing browser checks for collapsed team navigation and add a focused sidebar integration scenario using real temporary cases, including project switching, search, fixed footer/overflow, menu destinations, theme, and 27/42/31 sizing. Save screenshots/report in bot_rea/validation/sidebar-reference.
