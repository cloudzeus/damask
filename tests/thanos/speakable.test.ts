import { describe, it, expect } from 'vitest'
import { speakable, groupDigits } from '@/lib/voice/speakable'

describe('speakable', () => {
  it('τηλέφωνα ψηφίο-ψηφίο ανά 3', () => {
    expect(speakable('Καλέστε 6940960701')).toBe('Καλέστε έξι εννιά τέσσερα, μηδέν εννιά έξι, μηδέν εφτά μηδέν ένα')
    expect(groupDigits('2107218758')).toEqual(['210', '721', '8758'])
    expect(speakable('ΑΦΜ 094 183 948')).toBe('ΑΦΜ μηδέν εννιά τέσσερα, ένα οχτώ τρία, εννιά τέσσερα οχτώ')
  })
  it('ποσά, έτη και σύνδεσμοι', () => {
    expect(speakable('€12.500 και 1.250,50 το 2024')).toBe('€12.500 και 1.250,50 το 2024')
    expect(speakable('δες [την καρτέλα](/partners/x)')).toBe('δες την καρτέλα')
  })
})
