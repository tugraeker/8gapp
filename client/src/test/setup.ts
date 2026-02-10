import '@testing-library/jest-dom'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Each test run should be clean
afterEach(() => {
  cleanup()
})