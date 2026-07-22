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
  it('χρησιμοποιεί το b2b flag όταν δοθεί (υπερισχύει του ονόματος)', () => {
    expect(roleHome('CUSTOM_ROLE', true)).toBe('/portal')
    expect(roleHome('CUSTOM_ROLE', false)).toBe('/dashboard')
  })
  it('χωρίς b2b flag πέφτει πίσω στα γνωστά ονόματα', () => {
    expect(roleHome('ADMIN')).toBe('/dashboard')
    expect(roleHome('CUSTOMER')).toBe('/portal')
    expect(roleHome('CUSTOM_ROLE')).toBe('/login')
  })
})
