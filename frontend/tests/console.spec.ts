import { expect, test } from '@playwright/test';

test('browser demo executes, steps, renders physical data, contains stations and exports', async ({ page }) => {
  const errors: string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await expect(page.getByText('Browser simulation',{exact:true})).toBeVisible();
  await expect(page.getByText('The network is ready for an experiment.')).toBeVisible();
  await page.getByRole('button',{name:'Open Scenario Lab'}).click();
  await page.getByLabel('Scenario',{exact:true}).selectOption('S3');
  await page.getByRole('button',{name:'Run full',exact:true}).click();
  await expect(page.getByText('completed',{exact:true})).toBeVisible();
  await expect(page.getByTestId('power-chart').locator('.recharts-line')).toHaveCount(3);
  await page.getByRole('button',{name:'Reset',exact:true}).click();
  await expect(page.getByText('Step 1 / 90')).toBeVisible();
  await page.getByRole('button',{name:'Step',exact:true}).click();
  await expect(page.getByText('Step 2 / 90')).toBeVisible();
  await page.getByRole('button',{name:'Resume',exact:true}).click();
  await expect(page.getByRole('button',{name:'Pause',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  await page.getByRole('link',{name:'Charging stations',exact:true}).click();
  await page.getByLabel('Search stations').fill('EVSE-001');
  await expect(page.getByText('1 of 60 stations')).toBeVisible();
  await page.getByRole('button',{name:'EVSE-001',exact:true}).click();
  await page.getByRole('button',{name:'Quarantine station'}).click();
  await expect(page.getByText('Quarantined',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Recover station'}).click();
  await expect(page.getByRole('button',{name:'Quarantine station'})).toBeVisible();
  await page.getByRole('link',{name:'Scenario lab',exact:true}).click();
  await page.getByRole('button',{name:'Finish run',exact:true}).click();
  await page.getByRole('link',{name:'Experiment reports',exact:true}).click();
  const download=page.waitForEvent('download');await page.getByRole('link',{name:'HTML',exact:true}).first().click();
  expect((await download).suggestedFilename()).toMatch(/gridsentinel-.*\.html/);
  await page.reload();await expect(page.getByText('completed',{exact:true}).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('scenario settings and defense comparison produce computed differences',async({page})=>{
  await page.goto('/#/lab');await page.getByLabel('Scenario',{exact:true}).selectOption('S5');
  await page.getByRole('button',{name:'Run full',exact:true}).click();
  await page.getByRole('link',{name:'Defense center',exact:true}).click();
  await page.getByLabel('Firmware verification',{exact:true}).check();
  await page.getByRole('button',{name:'Run comparison',exact:true}).click();
  await expect(page.getByText('Matched-seed comparison',{exact:true})).toBeVisible();
  const row=page.getByRole('row').filter({hasText:'Peak |ΔP|'});
  await expect(row.locator('td').nth(1)).not.toHaveText('0.0 kW');
  await expect(row.locator('td').nth(2)).toHaveText('0.0 kW');
  await page.getByRole('link',{name:'Grid analysis',exact:true}).click();await expect(page.getByText('Feeder electrical state',{exact:true})).toBeVisible();
  await page.getByRole('link',{name:/Security monitoring/}).click();await expect(page.getByText('OCPP-style message viewer',{exact:true})).toBeVisible();
});

test('invalid configuration and empty station search show meaningful states',async({page})=>{
  await page.goto('/#/lab');await page.getByLabel('Fleet size',{exact:true}).fill('999');
  await page.getByRole('button',{name:'Run full',exact:true}).click();await expect(page.getByRole('alert')).toContainText('fleet size must be between');
  await page.getByLabel('Fleet size',{exact:true}).fill('12');await page.getByRole('button',{name:'Run full',exact:true}).click();
  await page.getByRole('link',{name:'Charging stations',exact:true}).click();await page.getByLabel('Search stations').fill('no-such-station');
  await expect(page.getByText('No stations match your search.')).toBeVisible();
});
