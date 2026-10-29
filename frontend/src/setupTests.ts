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
