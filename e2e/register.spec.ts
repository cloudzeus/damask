import { test, expect } from '@playwright/test'

test('register renders and the role picker toggles selection', async ({ page }) => {
  await page.goto('/register')
  await expect(page.getByText('Αίτημα πρόσβασης B2B').first()).toBeVisible()

  const customerOpt = page.getByRole('button', { name: /Πελάτης/ })
  const architectOpt = page.getByRole('button', { name: /Αρχιτέκτονας/ })
  await expect(customerOpt).toHaveAttribute('aria-pressed', 'true')
  await expect(architectOpt).toHaveAttribute('aria-pressed', 'false')

  await architectOpt.click()
  await expect(architectOpt).toHaveAttribute('aria-pressed', 'true')
  await expect(customerOpt).toHaveAttribute('aria-pressed', 'false')
})
