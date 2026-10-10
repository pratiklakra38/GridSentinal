import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const requireFrontend = createRequire(new URL('../frontend/package.json', import.meta.url));
const {chromium} = requireFrontend('@playwright/test');
const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.argv[2] || 'http://127.0.0.1:5188/', {waitUntil:'networkidle'});
  await page.getByText('Browser simulation',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Open Scenario Lab'}).click();
  await page.getByLabel('Scenario',{exact:true}).selectOption('S3');
  await page.getByRole('button',{name:'Run full',exact:true}).click();
  await page.getByText('completed',{exact:true}).waitFor();
  assert.equal(await page.getByTestId('power-chart').locator('.recharts-line').count(),3);
  await page.getByRole('link',{name:'Experiment reports',exact:true}).click();
  const downloaded=page.waitForEvent('download');
  await page.getByRole('link',{name:'HTML',exact:true}).first().click();
  assert.match((await downloaded).suggestedFilename(),/gridsentinel-.*\.html/);
  assert.deepEqual(errors,[]);
  console.log('PASS: packaged production frontend runs S3, renders computed charts and exports HTML without runtime errors.');
} finally {
  await browser.close();
}
