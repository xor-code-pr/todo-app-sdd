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

// jsdom does not implement <dialog>. This makes the element open and close so
// its CONTENT can be asserted — nothing more.
//
// It deliberately does NOT emulate the focus trap, Escape handling, initial
// focus, or background inertness. Those come from the browser, and the whole
// reason this feature uses a native <dialog> is to get them without writing
// them. Asserting them here would test this polyfill rather than the
// application. They are verified in the E2E suite, in a real browser.
if (
  typeof HTMLDialogElement !== 'undefined' &&
  typeof HTMLDialogElement.prototype.showModal !== 'function'
) {
  HTMLDialogElement.prototype.showModal = function showModal(): void {
    this.open = true
  }
  HTMLDialogElement.prototype.show = function show(): void {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close(returnValue?: string): void {
    this.open = false
    if (returnValue !== undefined) this.returnValue = returnValue
    this.dispatchEvent(new Event('close'))
  }
}
