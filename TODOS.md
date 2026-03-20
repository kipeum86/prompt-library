# TODOS

## Design System

- [ ] **Create DESIGN.md via /design-consultation**
  Formalize the existing design system (Paperlogy font, indigo accent, per-category colors, pill components, 180ms transitions, 30/24px radii). Single source of truth for all future UI work.
  *Depends on:* Nothing. *Priority:* High.

## Accessibility

- [ ] **Add ARIA live region announcements for dynamic content**
  Screen readers don't announce meaningful changes when tabs switch or search filters results. The `aria-live="polite"` container exists but announcements need to be explicit.
  *Depends on:* Nothing. *Priority:* Medium.

- [ ] **Color contrast audit (WCAG AA)**
  `--text-muted` (#888888 on #ffffff) has ~3.5:1 contrast ratio, below WCAG AA 4.5:1 requirement. Audit all muted text colors in both light and dark themes. Fix at the CSS variable level.
  *Depends on:* DESIGN.md (to update color tokens at the source). *Priority:* Medium.

## Features (from design review 2026-03-21)

- [ ] **Hash-based routing** (#category-id for tabs, #category-id/item-index for modals)
  Enable deep linking so users can share/bookmark specific prompts. Build on existing state model.

- [ ] **Compact hero stats** (replace 3 stat cards with single inline row)
  Save ~110px vertical space. "87 prompts · 5 favorites · Card view" in one line.

- [ ] **Tab scroll fade gradient**
  Show gradient edges on category tabs when more exist off-screen. 9 tabs overflow on mobile.

- [ ] **Contextual search empty state**
  Show query, suggest removing words, show popular category quick-links instead of generic "No prompts found."

- [ ] **Favorites empty state with category quick-links**
  Guide first-time users to content: "Start exploring: Writing (24) · Research (12)"

- [ ] **Copy error feedback**
  Show error toast when clipboard copy fails instead of always showing success.

- [ ] **First-visit tip bar**
  Dismissible one-liner below search: "Press / to search all categories. Favorites saved in browser."

- [ ] **Remove grid texture overlay** (body::before)
  AI slop pattern. Let clean backgrounds speak.

- [ ] **Remove dark mode gradient blobs** (body::after, .hero::after)
  Replace with flat dark gradient. Remove generic glowing orb pattern.

- [ ] **Replace card hover lift with border-accent highlight**
  No translateY. On hover: widen left border + brighten background using per-category accent.

- [ ] **prefers-reduced-motion support**
  Disable animations/transitions for users with motion sensitivity. WCAG 2.1 AA.

- [ ] **Modal focus trap + focus return**
  Trap Tab key inside modal, set initial focus to first action, return focus on close.

- [ ] **44px touch targets**
  Increase icon-toggle, icon-button, ghost-button--icon, modal-close from 42px to 44px.

- [ ] **Skip-to-content link**
  Visually hidden link that appears on focus. Jumps keyboard users past ~15 tab stops.

- [ ] **Modal prev/next navigation**
  Arrow buttons (+ keyboard left/right) to browse within current filtered set. Position indicator "3 of 24".

## Implementation Notes (from eng review 2026-03-21)

- **Hash routing**: URL hash is the single source of truth. `hashchange` listener reads URL → sets state → calls `render()`. User clicks update hash, not state directly. Wrap hash parsing in try/catch for malformed URLs like `#%zz`.
- **Modal**: Convert from `<div>` to native `<dialog>` element for free focus trapping, backdrop, and Escape key. Guard `showModal()` with `if (!dialog.open)`.
- **Modal prev/next**: Guard against empty filtered set (`if (entries.length === 0) return`).
- **PR strategy**: Single branch, one atomic commit per feature. 19 commits total.
- **File structure**: Keep single `app.js` file. Add section comments (`// === ROUTING ===`, etc.).
- **Performance**: Keep full DOM re-render. Add comment noting trade-off. Revisit if dataset grows past 500 items.
- **Section comment headers to add**: `CONFIG`, `STATE`, `DOM CACHE`, `EVENTS`, `ROUTING`, `DATA FETCH`, `RENDERING`, `ACTIONS`, `UTILITIES`.
