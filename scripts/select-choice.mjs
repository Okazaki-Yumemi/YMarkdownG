export async function selectChoice(page, label, value) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page
    .locator(`[role="option"][data-value=${JSON.stringify(value)}]`)
    .click();
}
