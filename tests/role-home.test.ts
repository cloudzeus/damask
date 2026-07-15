import { describe, it, expect } from 'vitest'
import { roleHome } from '@/lib/role-home'

describe('roleHome()', () => {
  it('στέλνει το εσωτερικό προσωπικό στο /dashboard', () => {
    expect(roleHome('SUPER_ADMIN')).toBe('/dashboard')
    expect(roleHome('ADMIN')).toBe('/dashboard')
    expect(roleHome('MANAGER')).toBe('/dashboard')
    expect(roleHome('EMPLOYEE')).toBe('/dashboard')
    expect(roleHome('SALESMAN')).toBe('/dashboard')
  })
  it('στέλνει πελάτες/αρχιτέκτονες/προμηθευτές στο B2B /portal', () => {
    expect(roleHome('ARCHITECT')).toBe('/portal')
    expect(roleHome('CUSTOMER')).toBe('/portal')
    expect(roleHome('SUPPLIER')).toBe('/portal')
  })
  it('άγνωστος ρόλος πάει στο /login', () => {
    expect(roleHome('')).toBe('/login')
    expect(roleHome('SOMETHING_ELSE')).toBe('/login')
  })
})
