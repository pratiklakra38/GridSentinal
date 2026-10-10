import { expect, test } from '@playwright/test';

test('browser demo executes, steps, renders physical data, contains stations and exports', async ({ page }) => {
  const errors: string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await expect(page.getByText('Browser simulation',{exact:true})).toBeVisible();
  await expect(page.getByText('The network is ready for an experiment.')).toBeVisible();
  await page.getByRole('button',{name:'Open Scenario Lab'}).click();
  await page.getByLabel('Scenario',{exact:true}).selectOption('S3');
  await page.getByRole('button',{name:'Run full',exact:true}).click();
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('link',{name:'Overview',exact:true}).click();
  await expect(page.getByTestId('power-chart').locator('.recharts-line')).toHaveCount(3);
  await page.screenshot({path:'../docs/screenshots/overview.png',fullPage:true});
  await page.getByRole('link',{name:'Scenario lab',exact:true}).click();
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

test('browser engine preserves determinism, physical bounds and telemetry independence',async({page})=>{
  await page.goto('/');
  const checks=await page.evaluate(async()=>{
    // Exercise the project module as served by Vite, rather than a copied test model.
    const engine=await import('/src/preview.ts');
    const settings=await import('/src/defaults.ts');
    const c={...settings.defaults,fleet_size:12,duration_steps:60,connection_rate:1,sensor_noise_kw:0};
    const normal=engine.simulate({...c,scenario:'S0'}),telemetry=engine.simulate({...c,scenario:'S3'}),disabled=engine.simulate({...c,scenario:'S5',physical_authority:false}),physical=engine.simulate({...c,scenario:'S5'});
    const protectedRun=engine.simulate({...c,scenario:'S5',defenses:{...c.defenses,firmware_verification:true}});
    return {
      deterministic:JSON.stringify(physical)===JSON.stringify(engine.simulate({...c,scenario:'S5'})),
      telemetryOnly:normal.frames.every((f,i)=>f.actual_power_kw===telemetry.frames[i].actual_power_kw),
      zeroAuthority:disabled.frames.every(f=>Math.abs(f.delta_power_kw)<1e-8),
      bounded:physical.frames.every(f=>f.stations.every(s=>s.actual_power_kw>=0&&s.actual_power_kw<=Math.min(s.rating_kw,s.vehicle_acceptance_kw)+1e-9)),
      sensorsIndependent:physical.frames.every(f=>Math.abs(f.independent_measured_power_kw-f.actual_power_kw)<1e-8),
      aggregates:physical.frames.every(f=>Math.abs(f.delta_power_kw-f.stations.reduce((a,s)=>a+s.actual_power_kw-s.baseline_power_kw,0))<1e-8),
      verification:protectedRun.frames.every(f=>Math.abs(f.delta_power_kw)<1e-8),
      allScenarios:Array.from({length:10},(_,i)=>engine.simulate({...c,scenario:'S'+i}).frames.length===60).every(Boolean)
    };
  });
  expect(Object.values(checks).every(Boolean)).toBe(true);
});

test('mobile navigation and simulation configuration remain usable',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  await page.getByRole('button',{name:'Toggle navigation'}).click();
  await page.getByRole('link',{name:'Scenario lab',exact:true}).click();
  await expect(page.getByLabel('Scenario',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Run full',exact:true}).click();
  await expect(page.getByText('completed',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'../docs/screenshots/mobile.png',fullPage:true});
});
