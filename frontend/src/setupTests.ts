import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest runs with `globals: false`, so React Testing Library's automatic
// cleanup hook never registers itself. Unmount explicitly between tests —
// otherwise focus assertions bleed across cases, which is exactly the class
// of bug the FR-021 tests exist to catch.
afterEach(() => {
  cleanup()
})

// jsdom implements no layout engine, so Element.prototype.scrollIntoView
// simply does not exist. The FR-021 focus effect calls it after moving focus
// to a relocated task; without this stub every reorder test throws.
//
// Stubbed here rather than guarded in the component: scrolling a moved row
// into view is a real requirement, and making the production call optional to
// satisfy a test environment would weaken it. Whether the scroll genuinely
// happens is verified by the E2E suite in a real browser.
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {
    // no-op: jsdom has nothing to scroll
  }
}
