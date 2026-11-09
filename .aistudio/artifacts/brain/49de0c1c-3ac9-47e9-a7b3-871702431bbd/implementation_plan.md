# Mobile-First Backstage Console Redesign

## Goal
Redesign the AaronGPT Backstage Console (`src/components/OperatorDashboard.tsx`) with a mobile-first layout so it never squeezes two columns side-by-side on phones or clips header buttons off-screen, while preserving the desktop two-column view on larger screens (`md:` and up).

## Key Changes

### 1. Mobile-First Master–Detail Navigation (`< 768px`)
- **Full-Screen Visitor Queue View**:
  - By default on mobile, display the visitor session queue across 100% of the screen width (`w-full md:w-80`) so search, status filter tabs (`All`, `Needs Reply`, `Resolved`), and session cards have generous touch targets and zero horizontal cramping.
  - Tapping any visitor session card opens the full-screen active conversation view on mobile.
- **Full-Screen Conversation View**:
  - When a session is open on mobile, hide the queue list and render the conversation view across 100% of the viewport width.
  - Include a prominent **Back to Queue** button (`←` with unread/waiting badge if other sessions need a reply) in the conversation header to return to the full-screen visitor list with a single tap, alongside compact action buttons for **Preview** and **Resolve / Reopen**.
  - If the active session is reset or removed, automatically return to the queue view on mobile.
- **Desktop Breakpoint (`md:` and above)**:
  - Keep the clean two-column layout (`md:w-80` left queue + `flex-1` right conversation panel) side-by-side on tablet and desktop screens.

### 2. Responsive Header & Dynamic Viewport Height (`100dvh`)
- Use `h-[100dvh]` instead of `h-screen` on both the Backstage Console and Public Chat containers so mobile browser address bars and virtual keyboards never clip the bottom composer.
- Tighten header padding and button sizing on mobile (`px-3.5 sm:px-5`, compact **Exit** / **Chat** button label on small viewports) so the AaronGPT Backstage branding, theme toggle, and Return to Chat button fit comfortably on narrow screens (`320px–430px`) without overflowing.

### 3. Compact Toggleable Quick Replies & Mobile Composer
- Replace the always-visible horizontal macro bar with a **compact toggle button** (`Quick Replies` with a sparkle icon) integrated cleanly into the composer area.
- When toggled open, display a clean, touch-friendly tray of quick reply chips above the input; selecting a quick reply populates the draft and auto-collapses the tray on mobile to keep the chat transcript visible.
- Streamline the mobile reply composer into a single sleek pill/rounded bar with a compact send icon button (`40x40px` touch target), matching the minimal public chat composer feel.
