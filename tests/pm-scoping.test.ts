import { describe, it, expect } from 'vitest'
import { visibleApplicationWhere } from '@/lib/pm/scoping'

describe('visibleApplicationWhere', () => {
  it('admin (pm.manage) sees all', () => {
    expect(visibleApplicationWhere({ id: 'u1', permissions: ['pm.manage'] })).toEqual({})
  })
  it('assigned-only otherwise', () => {
    expect(visibleApplicationWhere({ id: 'u1', permissions: ['pm.work'] })).toEqual({ OR: [{ managerId: 'u1' }, { processorId: 'u1' }] })
  })
})
