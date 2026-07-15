import { describe, it, expect } from 'vitest'
import { roleHome } from '@/lib/role-home'

describe('roleHome()', () => {
  it('στέλνει το εσωτερικό προσωπικό στο /dashboard', () => {
    expect(roleHome('ADMIN')).toBe('/dashboard')
    expect(roleHome('PURCHASING')).toBe('/dashboard')
    expect(roleHome('PRODUCT_MANAGER')).toBe('/dashboard')
    expect(roleHome('SALES')).toBe('/dashboard')
  })
  it('στέλνει πελάτες/αρχιτέκτονες στο B2B /portal', () => {
    expect(roleHome('ARCHITECT')).toBe('/portal')
    expect(roleHome('CUSTOMER')).toBe('/portal')
  })
  it('άγνωστος ρόλος πάει στο /login', () => {
    expect(roleHome('')).toBe('/login')
    expect(roleHome('SOMETHING_ELSE')).toBe('/login')
  })
})
