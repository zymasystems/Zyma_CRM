# Zyma CRM UI refresh — 10 November 2026

## Updated areas
- Contacts directory: refined contact cards, filters, responsive grid, and a dedicated contact profile hero with email/call actions.
- Projects: portfolio card layout, Active / Completed / Archived folders, progress presentation, and responsive controls.
- Leads: pipeline simplified to New → Discoverycall → Financial followup → Proposal → Won / Lost.
- Lead profile: visual sales-journey tracker, stage transition actions, and SLA tracking fields (status, document link, sent date, signed date, notes).
- Responsive behaviour and motion: page/card entrance effects, hover/focus states, mobile layouts, horizontal lead-board scrolling, and reduced-motion support.

## Project completion and archive behaviour
- Set a project's status to **Completed** to move it out of Active and into the Completed folder automatically.
- Use **Archive project** in the Completed folder to move it to Archived.
- Restore returns an archived project to Completed.
- The project's Completed status is stored with the project record. The separate Archived marker is currently stored in browser localStorage because the existing Projects API contract does not expose an archive field. This means the archive marker is browser-specific until an `isArchived` field and persistence are added to the backend.

## Validation
- `node --check app.js` passes.
- `workspace.html` parses successfully and has no duplicate element IDs.
