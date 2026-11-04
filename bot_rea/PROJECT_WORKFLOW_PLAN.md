# Projects-first research workflow

User requests removal of the Artifacts and Recents sidebar blocks. Projects becomes the single place to choose a hackathon project, add its brief/files/URLs and start a discussion with Steve scoped to that project.

Implement a native #/projects page with real case list, project brief, PROJECT document upload/paste/URL intake, existing document list and an explicit “与 Steve 讨论此项目” action. Default these inputs to PROJECT, retain MARKET as a separate research-evidence concept, and make URL intake preserve the requested collection. Do not automatically execute research just by selecting/opening a project.

Remove sidebar Artifacts and Recents (including their empty placeholders); Projects navigates to the actual project page. Search goes to project search. Keep the current sidebar appearance, team shortcuts, existing chat workflows and 27/42/31 desktop chat proportions.

Add PROJECT context to expert input, separate from evidence and market citation validation. Retrieve within the selected case only, with bounded document-preview fallback when keyword search returns no match. Show the selected project in chat and retain case-scoped task submission. Update route/case synchronization so project links and refresh select the correct case.

Verify real temporary project creation, PROJECT intake and retrieval context, two-project isolation, discussion/task targeting, removal of both sidebar blocks, existing auth/CSRF/citation boundaries, desktop/mobile overflow and chat proportions. No production data edits or real inference are required for tests.
