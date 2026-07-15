import { test, expect } from '@playwright/test'

test('forgot-password submits and shows the generic success message', async ({ page }) => {
  await page.goto('/forgot-password')
  await page.fill('#email', 'someone-not-registered@example.com')
  await page.click('button[type=submit]')
  await expect(page.getByText('Αν το email υπάρχει, θα λάβεις σύνδεσμο επαναφοράς.')).toBeVisible()
})
