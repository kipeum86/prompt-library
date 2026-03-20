# TODOS

## Design System

- [ ] **Create DESIGN.md via /design-consultation**
  Formalize the existing design system (Paperlogy font, indigo accent, per-category colors, pill components, 180ms transitions, 30/24px radii). Single source of truth for all future UI work.
  *Depends on:* Nothing. *Priority:* High.

## Accessibility

- [x] **Add ARIA live region announcements for dynamic content** (4c05f47)
- [ ] **Color contrast audit (WCAG AA)**
  `--text-muted` (#888888 on #ffffff) has ~3.5:1 contrast ratio, below WCAG AA 4.5:1 requirement. Audit all muted text colors in both light and dark themes. Fix at the CSS variable level.
  *Depends on:* DESIGN.md (to update color tokens at the source). *Priority:* Medium.

## Features (from design review 2026-03-21)

- [x] **Hash-based routing** (5d85eaf)
- [x] **Compact hero stats** (094a2a9)
- [x] **Tab scroll fade gradient** (2b1c2c2)
- [x] **Contextual search empty state** (bb8b0d9)
- [x] **Favorites empty state with category quick-links** (bb8b0d9)
- [x] **Copy error feedback** (3903aa3)
- [x] **First-visit tip bar** (07d3521)
- [x] **Remove grid texture overlay** (967bc8f)
- [x] **Remove dark mode gradient blobs** (6ea1922)
- [x] **Replace card hover lift with border-accent highlight** (43409c4)
- [x] **prefers-reduced-motion support** (a083e65)
- [x] **Modal focus trap + focus return via native <dialog>** (cd95a68)
- [x] **44px touch targets** (b34f083)
- [x] **Skip-to-content link** (a36950b)
- [x] **Modal prev/next navigation** (9abdf96)
