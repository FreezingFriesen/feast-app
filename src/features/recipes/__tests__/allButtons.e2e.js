describe('All Buttons Smoke Test', () => {
  it('presses every known button', async () => {
    const buttons = [
      'set-servings-decrease-button',
      'set-servings-increase-button',
      'edit-recipe-button',
      'app-header-back-button',
      'header-text-button',
      'segmented-control-option-button',
      'text-action-button',
      'chip-select-option-button',
      'submit-button',
      'account-menu-row-button',
      'log-in-link',
      'grocery-row-button',
      'grocery-row-remove-button',
      'week-arrow-button',
      'day-slot-entry-button',
      'day-slot-add-button',
      'month-arrow-button',
      'month-grid-day-button',
      'week-strip-day-button',
      'remove-step-button'
    ];

    const failedButtons = [];

    for (const testId of buttons) {
      try {
        const button = await $(`~${testId}`);

        if (await button.isDisplayed()) {
          await button.click();
          console.log(`✅ ${testId}`);
        }
      } catch (error) {
        console.log(`❌ ${testId}`);
        failedButtons.push(testId);
      }
    }

    expect(failedButtons).toEqual([]);
  });
});