// @ts-check
const { test, expect } = require('@playwright/test');

const DEMO_TAPE = '2:dust_storm|9:equipment_failure|11:solar_flare';

async function useStaticDemoFallback(page) {
  await page.route(
    /^https:\/\/(?:unpkg\.com|raw\.githubusercontent\.com)\//,
    route => route.abort('blockedbyclient')
  );
}

async function startClassroomDemo(page, { keyboard = false, fast = false } = {}) {
  await page.goto('/viewer.html');
  const quickStart = page.locator('#quick-start-demo');
  if (keyboard) {
    await quickStart.focus();
    await page.keyboard.press('Space');
  } else {
    await quickStart.click();
  }
  await expect(page.locator('#demo-console')).toHaveAttribute('data-ready', 'true', {
    timeout: 10000,
  });
  await page.waitForFunction(() => running && state.demoScenario === 'DEMO-JEZERO-17');
  if (fast) await page.locator('#spd-10').click();
}

async function waitForRepairTask(page) {
  await page.waitForFunction(() => state.sol === 4 && activeTask?.id === 'stuck_bolt');
  await expect(page.locator('#task-panel')).toHaveAttribute('aria-hidden', 'false');
}

async function completeClassroomBaseline(page) {
  await waitForRepairTask(page);
  await page.locator('#demo-task-repair-command').click();
  await page.waitForFunction(() =>
    remoteCommandTransit.status === 'arrived' && activeTask === null
  );
  await page.locator('#spd-10').click();
  await page.waitForFunction(() => state.outcome === 'won');
  await expect(page.locator('#death-overlay')).toBeVisible();
  return page.evaluate(() => JSON.stringify(demoSession.summary));
}

async function visibleEtaSeconds(page) {
  const text = await page.locator('#demo-command-status').innerText();
  if (text.includes('ARRIVED ON MARS')) return 0;
  const match = text.match(/ETA ([\d.]+)s/);
  if (!match) throw new Error(`No visible ETA in: ${text}`);
  return Number(match[1]);
}

async function launchKitedMission(page, mission = 'optimus') {
  await page.goto('/viewer.html');
  await page.evaluate(({ mission }) => {
    globe = null;
    launchMission(
      mission,
      {
        ...MISSIONS[mission],
        crewList: MISSIONS[mission].crewList.map(member => ({ ...member })),
        lispyProgram: 'adaptive_governor',
      },
      { seed: 4242, quickStart: true }
    );
    stopSimulationClock();
    clearDecisionTimers(true);
    frameMode = 'local';
    echoHistory = [];
    lastEcho = null;
  }, { mission });
}

async function prepareKitedStuckBolt(
  page,
  { power = 500, render = false, deadRobotIds = [] } = {}
) {
  await launchKitedMission(page, 'optimus');
  return page.evaluate(({ power, render, deadRobotIds }) => {
    R = rng32(9001);
    state.sol = 20;
    state.power = power;
    state.i_eff = 0.6;
    state.s_eff = 1;
    state.events = [];
    taskQueue = [];
    taskHistory = [];
    interventionHistory = [];
    tasksResolved = 0;
    tasksIgnored = 0;
    for (const member of state.crew) {
      if (!deadRobotIds.includes(member.name)) continue;
      member.alive = false;
      member.hp = 0;
      member.st = 'DECEASED';
    }
    const template = TASK_TEMPLATES.find(item => item.templateId === 'stuck_bolt');
    const task = template.gen(state);
    task.createdSol = state.sol;
    task.sourceEcho = 19;
    task.timerLeft = task.timeout;
    activeTask = task;
    ensureTaskInstanceId(task);
    if (render) {
      renderTask(task);
      setTaskPanelVisible(true);
    }
    return {
      taskInstanceId: task.instanceId,
      target: task.from.name,
      crewCount: state.crew.length,
    };
  }, { power, render, deadRobotIds });
}

// ══════════════════════════════════════════════════════════════
// VIEWER — Core sim page loads and LisPy VM works
// ══════════════════════════════════════════════════════════════

test.describe('Viewer', () => {
  test('page loads with mission selector', async ({ page }) => {
    await page.goto('/viewer.html');
    await page.waitForSelector('#mission-overlay');
    const title = await page.locator('#mission-overlay h1').textContent();
    expect(title).toContain('FIRST PRINCIPLES TO MARS');
  });

  test('mission cards are clickable', async ({ page }) => {
    await page.goto('/viewer.html');
    await page.waitForSelector('.mission-card');
    const cards = await page.locator('.mission-card').count();
    expect(cards).toBe(8);
  });

  test.describe('Classroom demo', () => {
    // Serial fallback runs avoid parallel browser/WebGL resource exhaustion in stress repeats.
    test.describe.configure({ mode: 'serial' });
    test.beforeEach(async ({ page }) => {
      await useStaticDemoFallback(page);
    });

  test('classroom quick start is semantic, mobile-safe, and immediately playable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/viewer.html');

    const entry = await page.evaluate(() => {
      const title = document.querySelector('#mission-overlay h1').getBoundingClientRect();
      const quick = document.getElementById('quick-start-demo');
      const quickBox = quick.getBoundingClientRect();
      return {
        scrollTop: document.getElementById('mission-overlay').scrollTop,
        titleBottom: title.bottom,
        quickBottom: quickBox.bottom,
        tagName: quick.tagName,
        objective: document.getElementById('demo-objective').textContent,
        gameUiInert: ['game-hdr', 'left-panel', 'right-panel', 'top-nav', 'cartridge-bar']
          .every(id => document.getElementById(id).inert),
      };
    });

    expect(entry.scrollTop).toBe(0);
    expect(entry.titleBottom).toBeLessThan(844);
    expect(entry.quickBottom).toBeLessThan(844);
    expect(entry.tagName).toBe('BUTTON');
    expect(entry.objective).toContain('send one delayed repair command');
    expect(entry.gameUiInert).toBe(true);
    await expect(page.getByRole('button', { name: 'Load saved cartridge' }))
      .toHaveAccessibleName('Load saved cartridge');

    await page.locator('#mission-overlay h1').click();
    await page.keyboard.press('Space');
    expect(await page.evaluate(() => ({
      running,
      demo: demoSession,
      missionVisible: !document.getElementById('mission-overlay').inert,
    }))).toEqual({ running: false, demo: null, missionVisible: true });
    await expect(page.locator('#mission-config')).toBeHidden();

    const firstMission = page.locator('.mission-card').first();
    await firstMission.focus();
    await page.keyboard.press('Space');
    await expect(page.locator('#mission-config')).toBeVisible();

    await page.evaluate(() => {
      globe = { pointOfView() {} };
    });
    const launchButton = page.getByRole('button', { name: '▶ LAUNCH MISSION' });
    await launchButton.focus();
    await page.keyboard.press('Space');
    await expect(page.locator('#landing-overlay')).toBeVisible();
    expect(await page.locator('#mission-overlay').evaluate(element => element.inert))
      .toBe(true);
    const landingSeed = await page.evaluate(() => state.startSeed);
    await page.keyboard.press('Space');
    expect(await page.evaluate(() => state.startSeed)).toBe(landingSeed);

    await page.reload();
    await page.keyboard.press('Tab');
    await expect(page.locator('#quick-start-demo')).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.locator('#demo-console')).toHaveAttribute('data-ready', 'true', {
      timeout: 10000,
    });
    expect(await page.evaluate(() => demoSession.readyElapsedMs)).toBeLessThan(1000);
    await expect(page.locator('#demo-console')).toBeVisible();
    await expect(page.locator('#demo-scenario-label')).toContainText('seed 424242');
    await expect(page.locator('#demo-truth-copy')).toContainText('not live telemetry');
    await expect(page.locator('#demo-truth-copy')).toContainText('not deployed on-chain');
    expect(await page.locator('#mission-overlay').evaluate(element => element.inert)).toBe(true);
    const pauseBox = await page.locator('#demo-pause-button').boundingBox();
    expect(pauseBox.width).toBeGreaterThanOrEqual(44);
    expect(pauseBox.height).toBeGreaterThanOrEqual(44);
    await expect(page.locator('.emergency-controls')).toBeHidden();
    await expect(page.locator('#lispy-select')).toBeDisabled();
    await expect(page.locator('#lispy-editor')).toBeDisabled();
    await expect(page.locator('#lispy-toggle')).toBeDisabled();
    await expect(page.locator('#autopilot-btn')).toBeDisabled();

    await page.locator('#demo-pause-button').click();
    await expect(page.locator('#demo-pause-button')).toHaveText('▶ RESUME');
    await expect(page.locator('#demo-pause-button')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#demo-pause-button').click();
    await expect(page.locator('#demo-pause-button')).toHaveText('⏸ PAUSE');
    await expect(page.locator('#demo-pause-button')).toHaveAttribute('aria-pressed', 'false');

    await waitForRepairTask(page);
    expect(await page.locator('#task-panel').evaluate(element => element.inert)).toBe(false);
    expect(await page.locator('#override-buttons').count()).toBe(0);
    await page.locator('#demo-pause-button').click();
    await page.locator('#demo-task-repair-command').focus();
    await page.keyboard.press('Space');
    await page.waitForFunction(() => remoteCommandTransit.status === 'queued');
  });

  test('classroom demo records one delayed repair and exact one-rule replay', async ({ page }) => {
    test.setTimeout(60000);
    await startClassroomDemo(page);
    await waitForRepairTask(page);

    const telemetry = await page.evaluate(() => ({
      marsTime: document.getElementById('mars-telemetry-time').textContent,
      earthTime: document.getElementById('earth-telemetry-time').textContent,
      marsSol: document.getElementById('mars-telemetry-sol').textContent,
      earthSol: document.getElementById('earth-telemetry-sol').textContent,
      marsResources: document.getElementById('mars-resources').textContent,
      earthResources: document.getElementById('earth-resources').textContent,
      before: captureCausalState(),
    }));
    expect(telemetry.marsTime).not.toBe(telemetry.earthTime);
    expect(telemetry.marsSol).toBe('4');
    expect(telemetry.earthSol).toBe('2');
    expect(Date.parse(telemetry.marsTime) - Date.parse(telemetry.earthTime))
      .toBe(8 * 60 * 1000);
    expect(telemetry.marsResources).not.toBe(telemetry.earthResources);
    expect(telemetry.before.robot.status).toBe('ISRU intake restricted');

    await page.locator('#demo-pause-button').click();
    const mutationLock = await page.evaluate(() => {
      const snapshot = () => ({
        program: lispyCode,
        activeLispy,
        lispyEnabled,
        autopilotEnabled,
        allocation: { ...state.alloc },
        interventions: JSON.stringify(interventionHistory),
      });
      const before = snapshot();
      const results = [
        switchLispy('basic_governor'),
        updateLispyCode('(begin (set! isru_alloc 1))'),
        toggleLispyEnabled(),
        toggleAutopilot(),
        applyEmergencyAction('isru'),
      ];
      handleTwinMessage({
        cmd: 'push_alloc',
        payload: { h: 0, i: 1, g: 0, r: 0.1 },
      });
      handleTwinMessage({
        cmd: 'push_lispy',
        payload: { code: '(begin (set! isru_alloc 1))' },
      });
      handleTwinMessage({
        cmd: 'exec_lispy',
        payload: {
          code: '(begin (set! heating_alloc 0) (set! isru_alloc 1) (set! greenhouse_alloc 0))',
        },
      });
      return { before, after: snapshot(), results };
    });
    expect(mutationLock.results).toEqual([false, false, false, false, false]);
    expect(mutationLock.after).toEqual(mutationLock.before);
    expect(mutationLock.before.program).toBe(
      await page.evaluate(() => demoGovernorProgram('baseline'))
    );

    await page.locator('#demo-task-repair-command').focus();
    await page.keyboard.press('Space');
    await page.waitForFunction(() => remoteCommandTransit.status === 'queued');
    const initialEta = await visibleEtaSeconds(page);
    await page.locator('#demo-repair-command').dispatchEvent('click');
    expect(await page.evaluate(() => remoteCommandTransit.rejectedCount)).toBe(1);

    const inTransit = await page.evaluate(() => ({
      applied: remoteCommandTransit.appliedCount,
      state: captureCausalState(),
      status: document.getElementById('demo-command-status').textContent,
    }));
    expect(inTransit.applied).toBe(0);
    expect(inTransit.state).toEqual(telemetry.before);
    expect(inTransit.status).toContain('ETA');

    const paused = await page.evaluate(() => ({
      eta: document.getElementById('demo-command-status').textContent,
      timer: document.getElementById('task-timer-display').textContent,
      sol: state.sol,
      remaining: remoteCommandTransit.remainingMs,
    }));
    await page.waitForTimeout(2200);
    expect(await page.evaluate(() => ({
      eta: document.getElementById('demo-command-status').textContent,
      timer: document.getElementById('task-timer-display').textContent,
      sol: state.sol,
      remaining: remoteCommandTransit.remainingMs,
    }))).toEqual(paused);

    await page.locator('#demo-pause-button').click();
    await expect.poll(() => visibleEtaSeconds(page), {
      timeout: 2500,
      intervals: [50],
    }).toBeLessThan(initialEta);
    await page.waitForFunction(() =>
      remoteCommandTransit.appliedCount === 1 && activeTask === null
    );
    const arrived = await page.evaluate(() => ({
      applied: remoteCommandTransit.appliedCount,
      totalApplied: remoteCommandTransit.totalApplied,
      delta: demoSession.evidence.arrivalDelta,
      before: demoSession.evidence.arrivalBefore,
      arrival: demoSession.evidence.arrivalAfter,
    }));
    expect(arrived.applied).toBe(1);
    expect(arrived.totalApplied).toBe(1);
    expect(arrived.delta.isruEfficiency).toBeCloseTo(0.2, 10);
    expect(arrived.delta.robotHp).toBe(2);
    expect(arrived.delta.o2).toBe(0);
    expect(arrived.arrival.isruEfficiency - arrived.before.isruEfficiency)
      .toBeCloseTo(0.2, 10);
    expect(arrived.arrival.robot.hp - arrived.before.robot.hp).toBe(2);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => ({
      appliedCount: remoteCommandTransit.appliedCount,
      totalApplied: remoteCommandTransit.totalApplied,
    }))).toEqual({ appliedCount: 1, totalApplied: 1 });

    await page.locator('#spd-10').click();
    await page.waitForFunction(() => state.outcome === 'won');
    await expect(page.locator('#death-overlay')).toHaveAttribute('aria-modal', 'true');
    await expect(page.locator('#demo-replay-button')).toBeFocused();
    expect(await page.locator('#game-hdr').evaluate(element => element.inert)).toBe(true);
    expect(await page.locator('#task-panel').evaluate(element => element.inert)).toBe(true);
    await expect(page.locator('#demo-phase')).toHaveText('POST-MORTEM READY');
    await expect(page.locator('#death-postmortem')).toContainText('Recorded causal trace');
    await expect(page.locator('#death-postmortem')).toContainText('applied 1 time');
    await expect(page.locator('#death-postmortem')).toContainText('ASSISTED / UNRANKED');
    await expect(page.locator('#death-postmortem')).toContainText('matches pinned tape');
    const baseline = await page.evaluate(() => demoComparisonBaseline);
    expect(baseline.observedTape).toBe(DEMO_TAPE);
    expect(baseline.tape).toBe(DEMO_TAPE);
    expect(await page.evaluate(() =>
      JSON.parse(localStorage.getItem('mars-barn-highscores') || '[]')
    )).toEqual([]);

    const lastResultControl = page.locator('#death-overlay button').last();
    await lastResultControl.focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('#demo-rule-select')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(lastResultControl).toBeFocused();
    await page.locator('#death-overlay').focus();
    await page.keyboard.press('Shift+Tab');
    await expect(lastResultControl).toBeFocused();
    expect(await page.evaluate(() => {
      const overlay = document.getElementById('death-overlay');
      const active = document.activeElement;
      return overlay.contains(active) && active !== document.body &&
        !active.closest('[inert]');
    })).toBe(true);

    await page.locator('#demo-replay-button').click();
    await expect(page.locator('#demo-console')).toHaveAttribute('data-ready', 'true');
    const replayStart = await page.evaluate(() => ({
      seed: state.startSeed,
      scenario: state.demoScenario,
      tape: demoSession.evidence.eventTape,
      governorDiff: demoSession.governorDiff,
      program: lispyCode,
      changedProgram: lispyCode.includes('(set! isru_alloc 0.65)'),
    }));
    expect(replayStart.seed).toBe(baseline.seed);
    expect(replayStart.scenario).toBe(baseline.scenarioId);
    expect(replayStart.tape.map(event => `${event.sol}:${event.type}`).join('|'))
      .toBe(baseline.tape);
    expect(replayStart.governorDiff).toContain('0.55 → 0.65');
    expect(replayStart.changedProgram).toBe(true);
    expect(replayStart.program).toBe(
      mutationLock.before.program.replace(
        '(set! isru_alloc 0.55)',
        '(set! isru_alloc 0.65)'
      )
    );
    await expect(page.locator('#lispy-editor')).toBeDisabled();

    await page.waitForFunction(() => remoteCommandTransit.status === 'arrived');
    await page.locator('#spd-10').click();
    await page.waitForFunction(() => state.outcome === 'won');
    const comparison = await page.evaluate(() => ({
      summary: demoSession.summary,
      display: getComputedStyle(document.getElementById('demo-comparison')).display,
      text: document.getElementById('demo-comparison').textContent,
      applied: remoteCommandTransit.appliedCount,
    }));
    expect(comparison.summary.seed).toBe(baseline.seed);
    expect(comparison.summary.tape).toBe(baseline.tape);
    expect(comparison.summary.observedTape).toBe(DEMO_TAPE);
    expect(comparison.summary.decision).toBe(baseline.decision);
    expect(comparison.summary.resources.o2).not.toBeCloseTo(baseline.resources.o2, 8);
    expect(comparison.display).toBe('block');
    expect(comparison.text).toContain('Outcome');
    expect(comparison.text).toContain('Terminal sol');
    expect(comparison.text).toContain('Crew alive');
    expect(comparison.text).toContain('Governor diff');
    expect(comparison.applied).toBe(1);
    const allocation = comparison.summary.allocationTape.find(item => item.sol === 2);
    const baselineAllocation = baseline.allocationTape.find(item => item.sol === 2);
    expect(allocation.i).not.toBe(baselineAllocation.i);
    await expect(page.locator('tr[data-measure="o2"] td').nth(1))
      .toHaveText(baseline.resources.o2.toFixed(2));
    await expect(page.locator('tr[data-measure="o2"] td').nth(2))
      .toHaveText(comparison.summary.resources.o2.toFixed(2));
    await expect(page.locator('tr[data-measure="power"] td').nth(1))
      .toHaveText(baseline.resources.power.toFixed(2));
    await expect(page.locator('tr[data-measure="power"] td').nth(2))
      .toHaveText(comparison.summary.resources.power.toFixed(2));
    expect(await page.evaluate(() =>
      JSON.parse(localStorage.getItem('mars-barn-highscores') || '[]')
    )).toEqual([]);
  });

  test('classroom late command is cancelled without claiming execution', async ({ page }) => {
    await startClassroomDemo(page);
    await waitForRepairTask(page);
    await page.locator('#demo-pause-button').click();
    const before = await page.evaluate(() => {
      activeTask.timerLeft = 1;
      document.getElementById('task-timer-display').textContent = '1s';
      return captureCausalState();
    });
    await page.locator('#demo-task-repair-command').click();
    await page.locator('#demo-pause-button').click();
    await page.waitForFunction(() => remoteCommandTransit.status === 'cancelled');
    await page.locator('#demo-pause-button').click();
    await expect(page.locator('#demo-command-status')).toContainText('applied 0 times');
    const late = await page.evaluate(() => ({
      applied: remoteCommandTransit.appliedCount,
      totalApplied: remoteCommandTransit.totalApplied,
      outcome: demoSession.evidence.command.outcome,
      lifecycle: demoSession.taskLifecycle,
      arrivalDelta: demoSession.evidence.arrivalDelta,
      isru: state.i_eff,
      robotHp: state.crew.find(isRobotCrewMember).hp,
      historyLength: taskHistory.length,
      checkpoint: serializeDemoCheckpoint(),
    }));
    expect(late.applied).toBe(0);
    expect(late.totalApplied).toBe(0);
    expect(late.outcome).toBe('cancelled');
    expect(late.lifecycle).toBe('timed_out');
    expect(late.checkpoint.task).toBeNull();
    expect(late.checkpoint.session.taskLifecycle).toBe('timed_out');
    expect(late.arrivalDelta).toBeNull();
    expect(late.isru).not.toBeCloseTo(before.isruEfficiency + 0.2, 10);

    await page.evaluate(() => autoSave());
    await page.reload();
    await expect(page.locator('#autosave-recovery')).toBeVisible();
    await page.getByRole('button', { name: 'RESUME' }).click();
    await expect(page.locator('#task-panel')).toHaveAttribute('aria-hidden', 'true');
    const restored = await page.evaluate(() => {
      if (activeTask) {
        activeTask.timerLeft = 0;
        resolveOverride(false);
      }
      return {
        activeTask,
        lifecycle: demoSession.taskLifecycle,
        commandStatus: remoteCommandTransit.status,
        isru: state.i_eff,
        robotHp: state.crew.find(isRobotCrewMember).hp,
        historyLength: taskHistory.length,
      };
    });
    expect(restored.activeTask).toBeNull();
    expect(restored.lifecycle).toBe('timed_out');
    expect(restored.commandStatus).toBe('cancelled');
    expect(restored.isru).toBe(late.isru);
    expect(restored.robotHp).toBe(late.robotHp);
    expect(restored.historyLength).toBe(late.historyLength);
  });

  test('classroom repeated unchanged baselines are byte-equivalent', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/viewer.html');
    const normalFrames = await page.evaluate(async () => {
      await loadPublicFrames();
      frameMode = 'public';
      waitingForFrame = true;
      frameManifest = { marker: 'loaded-public-source', last_sol: 1 };
      publicFrames = { 1: { frame: 1, marker: 'loaded-public-frame' } };
      const cartridge = serializeCartridge();
      restartGame();
      const afterRestart = {
        mode: frameMode,
        waiting: waitingForFrame,
        source: frameManifest.marker,
        frame: publicFrames[1].marker,
      };
      if (!deserializeCartridge(cartridge)) throw new Error('ordinary import rejected');
      return {
        afterRestart,
        afterImport: {
          mode: frameMode,
          waiting: waitingForFrame,
          source: frameManifest.marker,
          frame: publicFrames[1].marker,
        },
      };
    });
    expect(normalFrames.afterRestart).toEqual({
      mode: 'public',
      waiting: true,
      source: 'loaded-public-source',
      frame: 'loaded-public-frame',
    });
    expect(normalFrames.afterImport).toEqual(normalFrames.afterRestart);

    await page.locator('#quick-start-demo').click();
    await expect(page.locator('#demo-console')).toHaveAttribute('data-ready', 'true');
    expect(await page.evaluate(() => frameMode)).toBe('local');
    const first = await completeClassroomBaseline(page);
    await page.locator('#result-restart-button').click();
    await expect(page.locator('#quick-start-demo')).toBeFocused();
    expect(await page.evaluate(() => ({
      mode: frameMode,
      waiting: waitingForFrame,
      source: frameManifest.marker,
      frame: publicFrames[1].marker,
      controlsUnlocked:
        !document.getElementById('lispy-editor').disabled &&
        !document.getElementById('lispy-select').disabled,
    }))).toEqual({
      mode: 'public',
      waiting: true,
      source: 'loaded-public-source',
      frame: 'loaded-public-frame',
      controlsUnlocked: true,
    });
    await page.locator('#quick-start-demo').click();
    await expect(page.locator('#demo-console')).toHaveAttribute('data-ready', 'true');
    expect(await page.evaluate(() => frameMode)).toBe('local');
    const second = await completeClassroomBaseline(page);
    expect(second).toBe(first);
  });

  test('classroom queued command save/load stays paused then resumes once', async ({ page }) => {
    test.setTimeout(45000);
    await startClassroomDemo(page);
    await waitForRepairTask(page);
    await page.locator('#demo-pause-button').click();
    await page.locator('#demo-task-repair-command').click();
    await page.waitForFunction(() => remoteCommandTransit.status === 'queued');
    const saved = await page.evaluate(() => {
      autoSave();
      return {
        remaining: remoteCommandTransit.remainingMs,
        timer: activeTask.timerLeft,
        source: document.getElementById('demo-truth-copy').textContent,
        before: demoSession.evidence.preDecision,
      };
    });

    await page.reload();
    await expect(page.locator('#autosave-recovery')).toBeVisible();
    await page.getByRole('button', { name: 'RESUME' }).click();
    await expect(page.locator('#demo-import-badge')).toBeVisible();
    await expect(page.locator('#task-panel')).toHaveAttribute('aria-hidden', 'false');
    await expect(page.locator('#demo-pause-button')).toBeFocused();
    await expect(page.locator('#demo-pause-button')).toHaveText('▶ RESUME');
    await expect(page.locator('#demo-pause-button')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => {
      const active = document.activeElement;
      return {
        id: active.id,
        visible: active.getClientRects().length > 0,
        inMissionOverlay: document.getElementById('mission-overlay').contains(active),
        inInertContent: !!active.closest('[inert]'),
      };
    })).toEqual({
      id: 'demo-pause-button',
      visible: true,
      inMissionOverlay: false,
      inInertContent: false,
    });
    const restored = await page.evaluate(() => ({
      status: remoteCommandTransit.status,
      lifecycle: demoSession.taskLifecycle,
      remaining: remoteCommandTransit.remainingMs,
      timer: activeTask.timerLeft,
      source: document.getElementById('demo-truth-copy').textContent,
      running,
    }));
    expect(restored.status).toBe('queued');
    expect(restored.lifecycle).toBe('queued');
    expect(restored.remaining).toBeCloseTo(saved.remaining, 5);
    expect(restored.timer).toBe(saved.timer);
    expect(restored.source).toBe(saved.source);
    expect(restored.running).toBe(false);

    const frozenStatus = await page.locator('#demo-command-status').innerText();
    await page.waitForTimeout(2200);
    await expect(page.locator('#demo-command-status')).toHaveText(frozenStatus);
    await page.locator('#demo-pause-button').click();
    await page.waitForFunction(() => remoteCommandTransit.status === 'arrived');
    const applied = await page.evaluate(() => ({
      applied: remoteCommandTransit.appliedCount,
      totalApplied: remoteCommandTransit.totalApplied,
      delta: demoSession.evidence.arrivalDelta,
    }));
    expect(applied.applied).toBe(1);
    expect(applied.totalApplied).toBe(1);
    expect(applied.delta.isruEfficiency).toBeCloseTo(0.2, 10);
    expect(applied.delta.robotHp).toBe(2);
  });

  test('classroom terminal baseline import is unverified and can replay', async ({ page }) => {
    test.setTimeout(45000);
    await startClassroomDemo(page);
    await completeClassroomBaseline(page);
    const original = await page.evaluate(() => ({
      source: document.getElementById('demo-truth-copy').textContent,
      baseline: JSON.stringify(demoComparisonBaseline),
    }));

    await page.reload();
    await expect(page.locator('#autosave-recovery')).toBeVisible();
    await page.getByRole('button', { name: 'RESUME' }).click();
    await expect(page.locator('#death-overlay')).toBeVisible();
    await expect(page.locator('#demo-replay-button')).toBeFocused();
    await expect(page.locator('#death-postmortem')).toContainText('IMPORTED / UNVERIFIED');
    expect(await page.evaluate(() =>
      document.getElementById('demo-import-badge').hidden
    )).toBe(false);
    expect(await page.locator('#demo-truth-copy').textContent()).toBe(original.source);
    expect(await page.evaluate(() => JSON.stringify(demoComparisonBaseline)))
      .toBe(original.baseline.replace('"imported":false', '"imported":true'));
    expect(await page.evaluate(() => rankingEligible())).toBe(false);

    await page.locator('#demo-replay-button').click();
    await page.waitForFunction(() => remoteCommandTransit.status === 'arrived');
    await page.locator('#spd-10').click();
    await page.waitForFunction(() => state.outcome === 'won');
    const importedReplay = await page.evaluate(() => ({
      importTrust: state.importTrust,
      imported: demoSession.imported,
      observedTape: demoSession.summary.observedTape,
      comparisonVisible:
        getComputedStyle(document.getElementById('demo-comparison')).display,
      scores: JSON.parse(localStorage.getItem('mars-barn-highscores') || '[]'),
    }));
    expect(importedReplay.importTrust).toBe('unverified');
    expect(importedReplay.imported).toBe(true);
    expect(importedReplay.observedTape).toBe(DEMO_TAPE);
    expect(importedReplay.comparisonVisible).toBe('block');
    expect(importedReplay.scores).toEqual([]);
  });
  });

  test.describe('Kited vTwin vertical slice', () => {
    test('native twins are deterministic telepresence actors, never crew', async ({ page }) => {
      await launchKitedMission(page, 'ares');
      const result = await page.evaluate(() => ({
        version: state.kitedTwinAgency.version,
        twins: getKitedTwinSemanticSnapshot(),
        crewCount: state.crew.length,
        aliveCrew: state.crew.filter(member => member.alive).length,
        lifeSupportHeadcount: aliveHumanCrew(state.crew).length,
        twinIdsInCrew: state.crew.filter(member =>
          member.name === 'KITE-SCOUT' || member.name === 'KITE-OPS'
        ).length,
      }));

      expect(result.version).toBe(1);
      expect(result.twins.map(twin => twin.id)).toEqual(['KITE-SCOUT', 'KITE-OPS']);
      expect(result.twins.map(twin => twin.capabilities)).toEqual([
        ['observe', 'interview'],
        ['control', 'collaborate'],
      ]);
      expect(result.twins.every(twin => twin.native && twin.online)).toBe(true);
      expect(result.crewCount).toBe(4);
      expect(result.aliveCrew).toBe(4);
      expect(result.lifeSupportHeadcount).toBe(4);
      expect(result.twinIdsInCrew).toBe(0);
    });

    test('semantic stage is the complete no-WebGL fallback and terminal echo stays usable', async ({ page }) => {
      await launchKitedMission(page, 'ares');
      const result = await page.evaluate(() => {
        window.THREE = undefined;
        currentZoom = 'base';
        enterGround();
        R = () => 1;
        state.missionContract.noAtmosphericIsru = true;
        state.i_eff = 0;
        state.o2 = 0.1;
        const echo = stepSim();
        return {
          rows: document.querySelectorAll('#kited-twin-list [role="listitem"]').length,
          text: document.getElementById('kited-twin-stage').textContent,
          fallback: document.querySelector('.ground-webgl-fallback')?.textContent,
          sol: state.sol,
          echoActors: echo.kitedTwins.actors.map(actor => actor.id),
          echoAlive: echo.alive,
        };
      });

      expect(result.rows).toBe(2);
      expect(result.text).toContain('🪁');
      expect(result.text).toContain('KITE-SCOUT');
      expect(result.text).toContain('KITE-OPS');
      expect(result.text).toContain('IDLE');
      expect(result.text).toContain('Target: none');
      expect(result.text).toContain('Activity:');
      expect(result.fallback).toContain('semantic kited vTwin stage remains authoritative');
      expect(result.sol).toBe(1);
      expect(result.echoActors).toEqual(['KITE-SCOUT', 'KITE-OPS']);
      expect(result.echoAlive).toBe(false);
    });

    test('Three.js has one literal kite per online twin after rebuild and honors reduced motion', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await launchKitedMission(page, 'ares');
      await page.evaluate(() => {
        currentZoom = 'base';
        document.getElementById('ground-view').style.display = 'block';
        buildGroundScene();
      });
      await page.waitForTimeout(100);
      const first = await page.evaluate(() => getKitedTwinRenderSnapshot());
      await page.evaluate(() => buildGroundScene());
      await page.waitForTimeout(100);
      const rebuilt = await page.evaluate(() => ({
        snapshot: getKitedTwinRenderSnapshot(),
        roots: groundScene.children.filter(child =>
          child.name?.startsWith('kited-vtwin:') &&
          !child.name.includes(':target-')
        ).filter(child => child.name.split(':').length === 2).length,
      }));

      expect(first).toHaveLength(2);
      expect(first.every(twin =>
        twin.kiteVisible &&
        twin.kiteObjectCount === 1 &&
        twin.objectNames.some(name => name.endsWith(':kite-diamond-sail'))
      )).toBe(true);
      expect(rebuilt.snapshot).toHaveLength(2);
      expect(rebuilt.snapshot.every(twin => twin.kiteObjectCount === 1)).toBe(true);
      expect(rebuilt.roots).toBe(2);
      expect(rebuilt.snapshot.every(twin =>
        twin.reducedMotion &&
        !twin.continuousKiteMotion &&
        !twin.cameraTween
      )).toBe(true);
    });

    test('deployment requires both capability sets and declared power', async ({ page }) => {
      await prepareKitedStuckBolt(page, { power: 37, render: true });
      await expect(page.locator('#deploy-kited-twin-team')).toBeVisible();
      await expect(page.locator('#deploy-kited-twin-team')).toBeDisabled();
      const result = await page.evaluate(() => {
        const insufficient = beginKitedTwinCollaboration();
        state.power = 500;
        const ops = findKitedTwinActor('KITE-OPS');
        ops.capabilities = ['control'];
        const missingCapability = beginKitedTwinCollaboration();
        ops.capabilities = ['control', 'collaborate'];
        ops.online = false;
        const offlinePartner = beginKitedTwinCollaboration();
        return {
          insufficient,
          missingCapability,
          offlinePartner,
          activeProblem: getKitedTwinAgency().activeProblem,
          declaredCost: kitedCollaborationTotalCost(),
          phaseCosts: { ...KITED_TWIN_CONFIG.phaseCosts },
        };
      });

      expect(result).toMatchObject({
        insufficient: false,
        missingCapability: false,
        offlinePartner: false,
        activeProblem: null,
        declaredCost: 38,
        phaseCosts: {
          observeKWh: 6,
          interviewKWh: 8,
          controlKWh: 18,
          verifyKWh: 6,
        },
      });
    });

    test('observe and interview conserve phase costs without applying task success', async ({ page }) => {
      await prepareKitedStuckBolt(page);
      const result = await page.evaluate(() => {
        const before = {
          i_eff: state.i_eff,
          o2: state.o2,
          h2o: state.h2o,
          food: state.food,
        };
        const started = beginKitedTwinCollaboration();
        R = () => 1;
        const observeEcho = stepSim();
        const afterObserve = {
          i_eff: state.i_eff,
          history: taskHistory.length,
          problem: copyKitedPlain(getKitedTwinAgency().activeProblem),
        };
        const interviewEcho = stepSim();
        const agency = getKitedTwinAgency();
        const interview = agency.evidence.find(item => item.kind === 'interview');
        return {
          started,
          before,
          afterObserve,
          afterInterview: {
            i_eff: state.i_eff,
            history: taskHistory.length,
            paidPowerKWh: agency.activeProblem.paidPowerKWh,
            phases: agency.activeProblem.phaseTrace.map(entry => entry.phase),
            costs: agency.activeProblem.phaseTrace.map(entry => entry.costKWh),
          },
          evidenceKinds: agency.evidence.map(item => item.kind),
          interview,
          semantic: document.getElementById('kited-twin-stage').textContent,
          observeEvents: observeEcho.kitedTwins.events.map(event => event.type),
          interviewEvents: interviewEcho.kitedTwins.events.map(event => event.type),
          observeEvidence: copyKitedPlain(observeEcho.kitedTwins.evidence),
          interviewEvidence: copyKitedPlain(interviewEcho.kitedTwins.evidence),
          autonomyEligible: autonomyEligible(),
        };
      });

      expect(result.started).toBe(true);
      expect(result.afterObserve.i_eff).toBe(result.before.i_eff);
      expect(result.afterObserve.history).toBe(0);
      expect(result.afterObserve.problem.paidPowerKWh).toBe(6);
      expect(result.afterInterview.i_eff).toBe(result.before.i_eff);
      expect(result.afterInterview.history).toBe(0);
      expect(result.afterInterview.paidPowerKWh).toBe(14);
      expect(result.afterInterview.phases).toEqual(['observe', 'interview']);
      expect(result.afterInterview.costs).toEqual([6, 8]);
      expect(result.evidenceKinds).toEqual(['observation', 'interview']);
      expect(result.interview.facts).toMatchObject({
        torqueRequiredNm: expect.any(Number),
        robotMaxTorqueNm: expect.any(Number),
      });
      expect(result.interview.question).toContain('confirm intake status and torque limit');
      expect(result.interview.answer).toContain('ISRU intake fastener blocked');
      expect(result.interview.usesEvidenceId).toBe(result.afterObserve.problem.evidenceIds[0]);
      expect(result.semantic).toContain(result.interview.question);
      expect(result.semantic).toContain(result.interview.answer);
      expect(result.observeEvents).toEqual([
        'collaboration_started',
        'observation_recorded',
      ]);
      expect(result.interviewEvents).toEqual(['interview_recorded']);
      expect(result.observeEvidence).toHaveLength(1);
      expect(result.observeEvidence[0]).toMatchObject({
        kind: 'observation',
        actorId: 'KITE-SCOUT',
        target: {
          id: result.afterObserve.problem.targetId,
          taskStatus: 'ISRU intake fastener blocked',
        },
        facts: {
          system: 'ISRU intake',
          torqueRequiredNm: expect.any(Number),
          robotMaxTorqueNm: expect.any(Number),
        },
      });
      expect(result.interviewEvidence).toHaveLength(1);
      expect(result.interviewEvidence[0]).toMatchObject({
        kind: 'interview',
        question: result.interview.question,
        answer: result.interview.answer,
        usesEvidenceId: result.observeEvidence[0].id,
      });
      expect(result.autonomyEligible).toBe(true);
    });

    test('ordered collaboration cites evidence and resolves the existing override exactly once', async ({ page }) => {
      await prepareKitedStuckBolt(page);
      const result = await page.evaluate(() => {
        const beforeEfficiency = state.i_eff;
        beginKitedTwinCollaboration();
        R = () => 1;
        stepSim();
        stepSim();
        stepSim();
        const completionEcho = stepSim();
        const completedEfficiency = state.i_eff;
        const history = copyKitedPlain(taskHistory.at(-1));
        const evidence = copyKitedPlain(getKitedTwinAgency().evidence);
        const successCountBefore = taskHistory.filter(entry =>
          entry.id === 'stuck_bolt' && entry.choice === 'override_success'
        ).length;
        stepSim();
        return {
          beforeEfficiency,
          completedEfficiency,
          history,
          evidence,
          completionEcho: completionEcho.kitedTwins,
          successCountBefore,
          successCountAfter: taskHistory.filter(entry =>
            entry.id === 'stuck_bolt' && entry.choice === 'override_success'
          ).length,
          tasksResolved,
          activeProblem: getKitedTwinAgency().activeProblem,
          autonomyEligible: autonomyEligible(),
          rankingEligible: rankingEligible(),
        };
      });

      const interview = result.evidence.find(item => item.kind === 'interview');
      const control = result.evidence.find(item => item.kind === 'control_handoff');
      expect(result.history.actor).toBe('KITE-TEAM');
      expect(result.history.participants).toEqual(['KITE-SCOUT', 'KITE-OPS']);
      expect(result.history.phaseTrace.map(entry => entry.phase))
        .toEqual(['observe', 'interview', 'control', 'verify']);
      expect(result.history.powerCostKWh).toBe(38);
      expect(result.history.provenance).toContain('player-delegated');
      expect(control.usesEvidenceId).toBe(interview.id);
      expect(result.history.evidenceIds).toContain(control.id);
      expect(result.completedEfficiency - result.beforeEfficiency).toBeCloseTo(0.05, 10);
      expect(result.history.directDelta.isruEfficiency).toBeCloseTo(0.05, 10);
      expect(result.history.directDelta.power).toBe(0);
      expect(result.successCountBefore).toBe(1);
      expect(result.successCountAfter).toBe(1);
      expect(result.tasksResolved).toBe(1);
      expect(result.activeProblem).toBeNull();
      const completed = result.completionEcho.events.find(event =>
        event.type === 'collaboration_completed'
      );
      expect(completed.details.participants).toEqual(['KITE-SCOUT', 'KITE-OPS']);
      expect(completed.details.directDelta.isruEfficiency).toBeCloseTo(0.05, 10);
      const completedProblem = result.completionEcho.completedProblems[0];
      expect(completedProblem.phaseTrace.map(entry => entry.phase))
        .toEqual(['observe', 'interview', 'control', 'verify']);
      expect(completedProblem.participants).toEqual(['KITE-SCOUT', 'KITE-OPS']);
      expect(completedProblem.outcome).toBe('override_success');
      expect(completedProblem.paidPowerKWh).toBe(38);
      expect(completedProblem.evidenceIds).toEqual(result.history.evidenceIds);
      expect(completedProblem.directDelta).toEqual(result.history.directDelta);
      expect(result.completionEcho.evidence).toHaveLength(1);
      expect(result.completionEcho.evidence[0]).toMatchObject({
        kind: 'verification',
        id: result.history.evidenceIds.at(-1),
      });
      expect(result.completionEcho.actors.map(actor => actor.id))
        .toEqual(['KITE-SCOUT', 'KITE-OPS']);
      expect(result.autonomyEligible).toBe(false);
      expect(result.rankingEligible).toBe(false);
    });

    test('resolved kited task callback cannot replace or retime the next task', async ({ page }) => {
      await prepareKitedStuckBolt(page);
      const setup = await page.evaluate(() => {
        beginKitedTwinCollaboration();
        R = () => 1;
        for (let phase = 0; phase < 3; phase++) stepSim();
        const queuedTask = {
          id: 'queued-regression-b',
          urgency: 'info',
          from: { name: 'Colony AI', role: 'GOV' },
          title: 'QUEUED TASK B',
          body: 'Regression task B',
          data: 'One countdown owner',
          timeout: 10,
          timerLeft: 10,
          defaultChoice: 'deny',
          approve: { label: 'APPROVE', effect: () => {} },
          deny: { label: 'DENY', effect: () => {} },
          createdSol: state.sol,
          sourceEcho: state.sol,
        };
        taskQueue.push(queuedTask);
        const completionEcho = stepSim();
        const shown = showNextTask();
        running = true;
        return {
          shown,
          taskBInstanceId: queuedTask.instanceId,
          completionCount: completionEcho.kitedTwins.completedProblems.length,
        };
      });

      expect(setup.shown).toBe(true);
      expect(setup.completionCount).toBe(1);
      await page.waitForTimeout(1450);
      const after = await page.evaluate(taskBInstanceId => {
        const snapshot = {
          activeInstanceId: activeTask?.instanceId,
          activeId: activeTask?.id,
          timerLeft: activeTask?.timerLeft,
          countdownPaths: decisionIntervals.size,
          delayedPaths: decisionTimeouts.size,
          taskAResolutions: taskHistory.filter(entry =>
            entry.id === 'stuck_bolt' && entry.choice === 'override_success'
          ).length,
          taskBResolutions: taskHistory.filter(entry =>
            entry.id === 'queued-regression-b'
          ).length,
        };
        running = false;
        clearDecisionTimers(true);
        return snapshot;
      }, setup.taskBInstanceId);

      expect(after).toEqual({
        activeInstanceId: setup.taskBInstanceId,
        activeId: 'queued-regression-b',
        timerLeft: 9,
        countdownPaths: 1,
        delayedPaths: 0,
        taskAResolutions: 1,
        taskBResolutions: 0,
      });
    });

    test('direct collaboration delta stays bound to the exact task robot', async ({ page }) => {
      const prepared = await prepareKitedStuckBolt(page, {
        deadRobotIds: ['OPT-01'],
      });
      expect(prepared.target).toBe('OPT-02');
      const result = await page.evaluate(() => {
        beginKitedTwinCollaboration();
        R = () => 1;
        let completionEcho;
        for (let phase = 0; phase < 4; phase++) completionEcho = stepSim();
        return {
          history: copyKitedPlain(taskHistory.at(-1)),
          problem: copyKitedPlain(
            completionEcho.kitedTwins.completedProblems[0]
          ),
          completion: copyKitedPlain(
            completionEcho.kitedTwins.events.find(event =>
              event.type === 'collaboration_completed'
            )
          ),
        };
      });

      expect(result.history.targetId).toBe('OPT-02');
      expect(result.history.before.robot.name).toBe('OPT-02');
      expect(result.history.after.robot.name).toBe('OPT-02');
      expect(result.history.directDelta).toMatchObject({
        robotId: 'OPT-02',
        robotStatus: expect.stringContaining('ISRU intake restored'),
      });
      expect(result.problem.targetId).toBe('OPT-02');
      expect(result.problem.phaseTrace.every(entry =>
        entry.targetId === 'OPT-02'
      )).toBe(true);
      expect(result.completion.details.targetId).toBe('OPT-02');
      expect(JSON.stringify(result)).not.toContain('OPT-01');
    });

    test('manual resolution, partner loss, and target loss cancel without later double application', async ({ page }) => {
      await prepareKitedStuckBolt(page);
      const manual = await page.evaluate(() => {
        beginKitedTwinCollaboration();
        R = () => 1;
        stepSim();
        resolveOverride(false);
        const afterResolution = state.i_eff;
        stepSim();
        return {
          afterResolution,
          afterLaterSol: state.i_eff,
          historyCount: taskHistory.length,
          successCount: taskHistory.filter(entry => entry.choice === 'override_success').length,
          activeProblem: getKitedTwinAgency().activeProblem,
          outcome: getKitedTwinAgency().problems.at(-1).outcome,
        };
      });
      expect(manual.historyCount).toBe(1);
      expect(manual.successCount).toBe(0);
      expect(manual.afterLaterSol).toBe(manual.afterResolution);
      expect(manual.activeProblem).toBeNull();
      expect(manual.outcome).toBe('cancelled');

      await prepareKitedStuckBolt(page);
      const partnerLoss = await page.evaluate(() => {
        beginKitedTwinCollaboration();
        R = () => 1;
        stepSim();
        findKitedTwinActor('KITE-OPS').online = false;
        const before = state.i_eff;
        stepSim();
        stepSim();
        return {
          before,
          after: state.i_eff,
          historyCount: taskHistory.length,
          activeProblem: getKitedTwinAgency().activeProblem,
          failureReason: getKitedTwinAgency().problems.at(-1).failureReason,
        };
      });
      expect(partnerLoss.after).toBe(partnerLoss.before);
      expect(partnerLoss.historyCount).toBe(0);
      expect(partnerLoss.activeProblem).toBeNull();
      expect(partnerLoss.failureReason).toContain('KITE-OPS');

      await prepareKitedStuckBolt(page);
      const targetLoss = await page.evaluate(() => {
        beginKitedTwinCollaboration();
        const target = state.crew.find(member => member.name === activeTask.from.name);
        target.alive = false;
        target.hp = 0;
        R = () => 1;
        stepSim();
        stepSim();
        return {
          historyCount: taskHistory.length,
          activeProblem: getKitedTwinAgency().activeProblem,
          failureReason: getKitedTwinAgency().problems.at(-1).failureReason,
        };
      });
      expect(targetLoss.historyCount).toBe(0);
      expect(targetLoss.activeProblem).toBeNull();
      expect(targetLoss.failureReason).toContain('target robot');
    });

    test('cartridges retain completed evidence, migrate old state, and cancel orphan work', async ({ page }) => {
      await prepareKitedStuckBolt(page);
      const completed = await page.evaluate(() => {
        beginKitedTwinCollaboration();
        R = () => 1;
        for (let phase = 0; phase < 4; phase++) stepSim();
        R = rng32(1234);
        const cartridge = serializeCartridge();
        const invalidNamespace = structuredClone(cartridge);
        invalidNamespace.state.kitedTwinAgency.actors = Array.from(
          { length: 11 },
          (_, index) => ({
            ...structuredClone(cartridge.state.kitedTwinAgency.actors[0]),
            id: `EXTERNAL-${index}`,
            native: false,
          })
        );
        const namespaceValidation = validateCartridge(invalidNamespace);
        const expectedEvidenceIds = [...taskHistory.at(-1).evidenceIds];
        const loaded = deserializeCartridge(cartridge);
        return {
          loaded,
          namespaceValidation,
          expectedEvidenceIds,
          restoredEvidenceIds: state.kitedTwinAgency.evidence.map(item => item.id),
          restoredPhases: state.kitedTwinAgency.problems.at(-1)
            .phaseTrace.map(entry => entry.phase),
          restoredParticipants: taskHistory.at(-1).participants,
          nativeActors: state.kitedTwinAgency.actors.map(actor => actor.id),
          cartridge,
        };
      });
      expect(completed.loaded).toBe(true);
      expect(completed.namespaceValidation).toBe('Invalid kited vTwin actors.');
      expect(completed.restoredEvidenceIds).toEqual(completed.expectedEvidenceIds);
      expect(completed.restoredPhases).toEqual(['observe', 'interview', 'control', 'verify']);
      expect(completed.restoredParticipants).toEqual(['KITE-SCOUT', 'KITE-OPS']);
      expect(completed.nativeActors).toEqual(['KITE-SCOUT', 'KITE-OPS']);

      const oldMigration = await page.evaluate(cartridge => {
        const oldCartridge = structuredClone(cartridge);
        delete oldCartridge.state.kitedTwinAgency;
        const loaded = deserializeCartridge(oldCartridge);
        return {
          loaded,
          version: state.kitedTwinAgency.version,
          actors: state.kitedTwinAgency.actors.map(actor => actor.id),
          evidenceCount: state.kitedTwinAgency.evidence.length,
        };
      }, completed.cartridge);
      expect(oldMigration).toEqual({
        loaded: true,
        version: 1,
        actors: ['KITE-SCOUT', 'KITE-OPS'],
        evidenceCount: 0,
      });

      await prepareKitedStuckBolt(page);
      const orphan = await page.evaluate(() => {
        beginKitedTwinCollaboration();
        R = () => 1;
        stepSim();
        R = rng32(5678);
        const cartridge = serializeCartridge();
        const loaded = deserializeCartridge(cartridge);
        return {
          loaded,
          activeProblem: state.kitedTwinAgency.activeProblem,
          problem: state.kitedTwinAgency.problems.at(-1),
          event: state.kitedTwinAgency.events.at(-1),
        };
      });
      expect(orphan.loaded).toBe(true);
      expect(orphan.activeProblem).toBeNull();
      expect(orphan.problem.status).toBe('cancelled');
      expect(orphan.problem.failureReason).toContain('Imported task instance is unavailable');
      expect(orphan.event.type).toBe('problem_cancelled_on_import');
    });

    test('max-bound orphan imports remain valid without sequence overflow', async ({ page }) => {
      await prepareKitedStuckBolt(page);
      const result = await page.evaluate(() => {
        beginKitedTwinCollaboration();
        R = () => 1;
        stepSim();
        R = rng32(2468);
        const cartridge = serializeCartridge();
        const namespace = cartridge.state.kitedTwinAgency;
        namespace.sequence = KITED_TWIN_CONFIG.maxSequence;
        namespace.events = Array.from(
          { length: KITED_TWIN_CONFIG.maxEvents },
          (_, index) => ({
            id: `BOUNDARY-EVENT-${index}`,
            sol: state.sol,
            type: 'boundary_event',
            actorId: 'KITE-SCOUT',
            problemId: null,
            details: { index },
          })
        );
        namespace.pendingEvents = Array.from(
          { length: KITED_TWIN_CONFIG.maxEvents },
          (_, index) => ({
            id: `BOUNDARY-PENDING-${index}`,
            sol: state.sol,
            type: 'historical_pending_event',
            actorId: 'KITE-SCOUT',
            problemId: null,
            details: { index },
          })
        );
        const preValidation = validateCartridge(cartridge);
        const alerts = [];
        const originalAlert = window.alert;
        window.alert = message => alerts.push(String(message));
        const loaded = deserializeCartridge(cartridge);
        window.alert = originalAlert;
        const reserialized = serializeCartridge();
        const restored = reserialized.state.kitedTwinAgency;
        const validation = validateCartridge(reserialized);
        const cancellationEvents = restored.events.filter(event =>
          event.type === 'problem_cancelled_on_import'
        );
        const pendingCancellationEvents = restored.pendingEvents.filter(event =>
          event.type === 'problem_cancelled_on_import'
        );
        const nextEcho = buildKitedTwinEchoPayload();
        return {
          loaded,
          preValidation,
          alerts,
          validation,
          sequence: restored.sequence,
          eventCount: restored.events.length,
          pendingEventCount: restored.pendingEvents.length,
          pendingEvidenceCount: restored.pendingEvidence.length,
          pendingProblemCount: restored.pendingCompletedProblems.length,
          uniqueEventIds: new Set(restored.events.map(event => event.id)).size,
          cancellationEvents,
          pendingCancellationEvents,
          echoEvidence: nextEcho.evidence,
          echoCompletedProblems: nextEcho.completedProblems,
        };
      });

      expect(result.preValidation).toBeNull();
      expect(result.alerts).toEqual([]);
      expect(result.loaded).toBe(true);
      expect(result.validation).toBeNull();
      expect(result.sequence).toBe(1000000000);
      expect(result.eventCount).toBe(160);
      expect(result.pendingEventCount).toBe(1);
      expect(result.pendingEvidenceCount).toBe(0);
      expect(result.pendingProblemCount).toBe(1);
      expect(result.uniqueEventIds).toBe(result.eventCount);
      expect(result.cancellationEvents).toHaveLength(1);
      expect(result.pendingCancellationEvents).toHaveLength(1);
      expect(result.pendingCancellationEvents[0].id)
        .toBe(result.cancellationEvents[0].id);
      expect(result.echoEvidence).toEqual([]);
      expect(result.echoCompletedProblems).toHaveLength(1);
      expect(result.echoCompletedProblems[0]).toMatchObject({
        status: 'cancelled',
        outcome: 'cancelled',
      });
    });

    test('matching PIN requires both humans and rejects stale bootstrap authority', async ({ page }) => {
      await launchKitedMission(page, 'optimus');

      const result = await page.evaluate(async () => {
        const algorithm = { name: 'ECDSA', namedCurve: 'P-256' };
        const signAlgorithm = { name: 'ECDSA', hash: 'SHA-256' };
        const encoder = new TextEncoder();
        const signText = async (privateKey, text) => kitedTwinBase64UrlEncode(
          await crypto.subtle.sign(
            signAlgorithm, privateKey, encoder.encode(text)
          )
        );
        const keys = await crypto.subtle.generateKey(
          algorithm, true, ['sign', 'verify']
        );
        const publicKeyJwk = await crypto.subtle.exportKey(
          'jwk', keys.publicKey
        );
        const broadcasts = [];
        twinChannel = { postMessage: message => broadcasts.push(message) };
        const register = twinId => registerExternalKitedTwin({
          twinId,
          label: '<img id="pairing-xss" src=x onerror="window.pairingXss=true">',
          capabilities: ['observe', 'control'],
          publicKeyJwk,
        });
        const proofPayload = async (challenge, pairingPin = challenge.pairingPin) => ({
          challengeId: challenge.challengeId,
          pairingPin,
          clientConfirmed: true,
          signature: await signText(
            keys.privateKey,
            canonicalKitedTwinChallenge(challenge)
          ),
        });
        window.pairingXss = false;

        const viewerOnly = await register('VIEWER-ONLY');
        const viewerPinText = document.querySelector(
          `[data-challenge-id="${viewerOnly.challengeId}"] [data-field="pairing-pin"]`
        )?.textContent;
        const pairingDialog = document.querySelector(
          `[data-challenge-id="${viewerOnly.challengeId}"]`
        );
        const buttons = [...pairingDialog.querySelectorAll('button')];
        const focusedAction = document.activeElement?.textContent;
        await confirmKitedTwinPairing(viewerOnly.challengeId);
        const actorsAfterViewerOnly = getKitedTwinSemanticSnapshot()
          .filter(actor => actor.id === 'VIEWER-ONLY').length;
        denyKitedTwinPairing(viewerOnly.challengeId);

        const wrongPinChallenge = await register('WRONG-PIN');
        const wrongPin = wrongPinChallenge.pairingPin === '000000'
          ? '000001' : '000000';
        const wrongPinProof = await proveExternalKitedTwin(
          await proofPayload(wrongPinChallenge, wrongPin)
        );
        const wrongPinChallengeRetained=externalKitedTwinChallenges.has(
          wrongPinChallenge.challengeId
        );
        const actorsAfterWrongPin = getKitedTwinSemanticSnapshot()
          .filter(actor => actor.id === 'WRONG-PIN').length;
        denyKitedTwinPairing(wrongPinChallenge.challengeId);

        const clientOnly = await register('CLIENT-ONLY');
        const clientOnlyPayload = await proofPayload(clientOnly);
        const clientOnlyProof = await proveExternalKitedTwin(
          clientOnlyPayload,{replyTo:'client-only-proof'}
        );
        const actorsAfterClientOnly = getKitedTwinSemanticSnapshot()
          .filter(actor => actor.id === 'CLIENT-ONLY').length;
        const denied = denyKitedTwinPairing(clientOnly.challengeId);
        const staleProof = await proveExternalKitedTwin(clientOnlyPayload);

        const expired = await register('EXPIRED-PIN');
        externalKitedTwinChallenges.get(expired.challengeId).expiresAtMs =
          Date.now() - 1;
        const expiredProof = await proveExternalKitedTwin(
          await proofPayload(expired)
        );

        const cancelledPair = await register('CANCEL-REPLAY');
        await confirmKitedTwinPairing(cancelledPair.challengeId);
        await proveExternalKitedTwin(await proofPayload(cancelledPair));
        const staleCommand = {
          id: 'cancelled-command',
          cmd: 'push_alloc',
          twinId: 'CANCEL-REPLAY',
          sequence: 1,
          payload: { h: 0.9, i: 0.05, g: 0.05 },
        };
        staleCommand.signature = await signText(
          keys.privateKey, canonicalKitedTwinCommand(staleCommand)
        );
        const pairedCancellation = cancelExternalKitedTwinPairing({
          challengeId: cancelledPair.challengeId,
          twinId: 'CANCEL-REPLAY',
        });
        const actorsAfterUnsignedCancel = getKitedTwinSemanticSnapshot()
          .filter(actor => actor.id === 'CANCEL-REPLAY').length;
        const beforeAuthorizedCommand = { ...state.alloc };
        await handleTwinMessage(staleCommand);
        const afterAuthorizedCommand = { ...state.alloc };
        const oldUnregister = {
          id: 'cancel-replay-unregister',
          cmd: 'unregister_kited_twin',
          twinId: 'CANCEL-REPLAY',
          sequence: 2,
          payload: {},
        };
        oldUnregister.signature = await signText(
          keys.privateKey, canonicalKitedTwinCommand(oldUnregister)
        );
        await handleTwinMessage(oldUnregister);
        const replacementPair = await register('CANCEL-REPLAY');
        await confirmKitedTwinPairing(replacementPair.challengeId);
        await proveExternalKitedTwin(await proofPayload(replacementPair));
        const beforeStaleReplay = { ...state.alloc };
        await handleTwinMessage(staleCommand);
        const afterStaleReplay = { ...state.alloc };
        const replacementCancellation = cancelExternalKitedTwinPairing({
          challengeId: replacementPair.challengeId,
          twinId: 'CANCEL-REPLAY',
        });
        const actorsAfterReplacementCancel = getKitedTwinSemanticSnapshot()
          .filter(actor => actor.id === 'CANCEL-REPLAY').length;
        const replacementUnregister = {
          id: 'replacement-unregister',
          cmd: 'unregister_kited_twin',
          twinId: 'CANCEL-REPLAY',
          sequence: 1,
          payload: {},
        };
        replacementUnregister.signature = await signText(
          keys.privateKey, canonicalKitedTwinCommand(replacementUnregister)
        );
        await handleTwinMessage(replacementUnregister);

        const before = {
          alloc: { ...state.alloc },
          walletCount: Object.keys(marsWallets).length,
          running,
        };
        const anonymous = [
          ['anonymous-announce', 'announce', {}],
          ['anonymous-state', 'get_state', {}],
          ['anonymous-wallets', 'get_wallets', {}],
          ['anonymous-register-wallet', 'register_wallet', {
            address: 'mars1_unpaired', owner: 'Unpaired',
          }],
          ['anonymous-allocation', 'push_alloc', {
            h: 0.8, i: 0.1, g: 0.1,
          }],
          ['anonymous-emergency', 'emergency_stop', {}],
        ];
        for (const [id, cmd, payload] of anonymous) {
          await handleTwinMessage({ id, cmd, payload });
        }
        const after = {
          alloc: { ...state.alloc },
          walletCount: Object.keys(marsWallets).length,
          running,
        };
        const anonymousReplies = broadcasts
          .filter(message => message.replyTo?.startsWith('anonymous-'))
          .map(message => ({
            replyTo: message.replyTo,
            cmd: message.cmd,
            payload: message.payload,
          }));
        const announce = anonymousReplies.find(
          message => message.replyTo === 'anonymous-announce'
        );

        return {
          viewerOnly,
          viewerPinText,
          dialogRole: pairingDialog.getAttribute('role'),
          buttonLabels: buttons.map(button => button.textContent),
          buttonTabIndexes: buttons.map(button => button.tabIndex),
          focusedAction,
          externalLabelText: pairingDialog.textContent,
          injectedNodes: document.querySelectorAll('#pairing-xss').length,
          pairingXss: window.pairingXss,
          actorsAfterViewerOnly,
          wrongPinProof,
          wrongPinChallengeRetained,
          actorsAfterWrongPin,
          clientOnlyProof,
          actorsAfterClientOnly,
          denied,
          staleProof,
          expiredProof,
          pairedCancellation,
          replacementCancellation,
          actorsAfterUnsignedCancel,
          actorsAfterReplacementCancel,
          beforeAuthorizedCommand,
          afterAuthorizedCommand,
          pairingIds: [
            cancelledPair.challengeId,replacementPair.challengeId,
          ],
          beforeStaleReplay,
          afterStaleReplay,
          before,
          after,
          anonymousReplies,
          announcePayload: announce?.payload,
          disclosedBeforePairing: anonymousReplies.some(message =>
            ['state_update','state','wallets','attestation','cartridge']
              .includes(message.cmd)
          ),
          actors: getKitedTwinSemanticSnapshot().map(actor => actor.id),
        };
      });

      expect(result.viewerOnly.pairingPin).toMatch(/^\d{6}$/);
      expect(result.viewerPinText).toBe(result.viewerOnly.pairingPin);
      expect(result.dialogRole).toBe('dialog');
      expect(result.buttonLabels).toEqual(['ALLOW', 'DENY']);
      expect(result.buttonTabIndexes).toEqual([0, 0]);
      expect(result.focusedAction).toBe('ALLOW');
      expect(result.externalLabelText).toContain('<img id="pairing-xss"');
      expect(result.injectedNodes).toBe(0);
      expect(result.pairingXss).toBe(false);
      expect(result.actorsAfterViewerOnly).toBe(0);
      expect(result.wrongPinProof.error).toBe('Pairing PIN does not match');
      expect(result.wrongPinChallengeRetained).toBe(false);
      expect(result.actorsAfterWrongPin).toBe(0);
      expect(result.clientOnlyProof.status)
        .toBe('awaiting_viewer_confirmation');
      expect(result.actorsAfterClientOnly).toBe(0);
      expect(result.denied).toBe(true);
      expect(result.staleProof.ok).toBe(false);
      expect(result.expiredProof.ok).toBe(false);
      expect(result.pairedCancellation).toMatchObject({
        ok: false,
        error: 'Kited twin challenge is missing or expired',
      });
      expect(result.replacementCancellation.ok).toBe(false);
      expect(result.actorsAfterUnsignedCancel).toBe(1);
      expect(result.actorsAfterReplacementCancel).toBe(1);
      expect(result.afterAuthorizedCommand)
        .not.toEqual(result.beforeAuthorizedCommand);
      expect(result.pairingIds[0]).not.toBe(result.pairingIds[1]);
      expect(result.afterStaleReplay).toEqual(result.beforeStaleReplay);
      expect(result.after).toEqual(result.before);
      expect(result.anonymousReplies.filter(
        message => message.replyTo !== 'anonymous-announce'
      ).every(message => message.cmd === 'pairing_required')).toBe(true);
      expect(result.announcePayload).toMatchObject({
        role: 'twin',
        pairingSupported: true,
        pairingRequired: true,
      });
      expect(result.announcePayload).not.toHaveProperty('sol');
      expect(result.announcePayload).not.toHaveProperty('mission');
      expect(result.disclosedBeforePairing).toBe(false);
      expect(result.actors).toEqual(['KITE-SCOUT', 'KITE-OPS']);
    });

    test('P-256 proof gates bounded attributable local presence', async ({ page }) => {
      await launchKitedMission(page, 'optimus');
      await page.evaluate(() => {
        currentZoom = 'base';
        document.getElementById('ground-view').style.display = 'block';
        buildGroundScene();
      });
      await page.waitForTimeout(100);

      const result = await page.evaluate(async () => {
        const algorithm = { name: 'ECDSA', namedCurve: 'P-256' };
        const signAlgorithm = { name: 'ECDSA', hash: 'SHA-256' };
        const encoder = new TextEncoder();
        const signText = async (privateKey, text) => kitedTwinBase64UrlEncode(
          await crypto.subtle.sign(signAlgorithm, privateKey, encoder.encode(text))
        );
        const signCommand = async (privateKey, message) => ({
          ...message,
          signature: await signText(privateKey, canonicalKitedTwinCommand(message)),
        });
        const prove = async (keyPair, challenge) => {
          await confirmKitedTwinPairing(challenge.challengeId);
          return proveExternalKitedTwin({
            challengeId: challenge.challengeId,
            pairingPin: challenge.pairingPin,
            clientConfirmed: true,
            signature: await signText(
              keyPair.privateKey,
              canonicalKitedTwinChallenge(challenge)
            ),
          });
        };

        const controlKeys = await crypto.subtle.generateKey(
          algorithm, true, ['sign', 'verify']
        );
        const observeKeys = await crypto.subtle.generateKey(
          algorithm, true, ['sign', 'verify']
        );
        const attackerKeys = await crypto.subtle.generateKey(
          algorithm, true, ['sign', 'verify']
        );
        const controlJwk = await crypto.subtle.exportKey(
          'jwk', controlKeys.publicKey
        );
        const observeJwk = await crypto.subtle.exportKey(
          'jwk', observeKeys.publicKey
        );

        const crewCount = state.crew.length;
        const broadcasts = [];
        twinChannel = { postMessage: message => broadcasts.push(message) };
        window.protocolXss = false;

        const controlChallenge = await registerExternalKitedTwin({
          twinId: 'LOCAL-CTRL',
          label: 'Local controller',
          capabilities: ['control'],
          publicKeyJwk: controlJwk,
        });
        const duplicateReservation = await registerExternalKitedTwin({
          twinId: 'LOCAL-CTRL',
          label: 'Takeover',
          capabilities: ['control'],
          publicKeyJwk: controlJwk,
        });
        const challengeCountBeforeReserved = externalKitedTwinChallenges.size;
        const teamCollision = await registerExternalKitedTwin({
          twinId: 'KITE-TEAM',
          label: 'Team collision',
          capabilities: ['control'],
          publicKeyJwk: controlJwk,
        });
        const crewCollision = await registerExternalKitedTwin({
          twinId: state.crew[0].name,
          label: 'Crew collision',
          capabilities: ['control'],
          publicKeyJwk: controlJwk,
        });
        const challengeCountAfterReserved = externalKitedTwinChallenges.size;

        const invalidProof = await proveExternalKitedTwin({
          challengeId: controlChallenge.challengeId,
          pairingPin: controlChallenge.pairingPin,
          clientConfirmed: true,
          signature: await signText(
            attackerKeys.privateKey,
            canonicalKitedTwinChallenge(controlChallenge)
          ),
        });
        const actorsAfterInvalid = getKitedTwinSemanticSnapshot()
          .filter(actor => actor.id === 'LOCAL-CTRL').length;
        const controlProof = await prove(controlKeys, controlChallenge);
        const repeatedProof = await prove(controlKeys, controlChallenge);
        const controlActorCount = getKitedTwinSemanticSnapshot()
          .filter(actor => actor.id === 'LOCAL-CTRL').length;

        const observeChallenge = await registerExternalKitedTwin({
          twinId: 'LOCAL-OBS',
          label: '<img id="protocol-xss" src=x onerror="window.protocolXss=true">',
          capabilities: ['observe'],
          activity: 'Inspecting local telemetry',
          publicKeyJwk: observeJwk,
        });
        const observeProof = await prove(observeKeys, observeChallenge);
        const activityMessage = await signCommand(observeKeys.privateKey, {
          id: 'observe-activity-1',
          cmd: 'kited_twin_activity',
          twinId: 'LOCAL-OBS',
          sequence: 1,
          payload: {
            mode: 'observe',
            target: 'UNKNOWN-TARGET',
            activity: 'A'.repeat(1000),
          },
        });
        await handleTwinMessage(activityMessage);
        await new Promise(resolve => requestAnimationFrame(() =>
          requestAnimationFrame(resolve)
        ));
        const registered = getKitedTwinSemanticSnapshot();
        const registeredRender = getKitedTwinRenderSnapshot();

        const beforeForgery = { ...state.alloc };
        const forgedControl = await signCommand(attackerKeys.privateKey, {
          id: 'forged-control-1',
          cmd: 'push_alloc',
          twinId: 'LOCAL-CTRL',
          sequence: 1,
          payload: { h: 0.2, i: 0.5, g: 0.3 },
        });
        await handleTwinMessage(forgedControl);
        const afterForgery = { ...state.alloc };

        const validControl = await signCommand(controlKeys.privateKey, {
          id: 'valid-control-1',
          cmd: 'push_alloc',
          twinId: 'LOCAL-CTRL',
          sequence: 1,
          payload: { h: 0.15, i: 0.6, g: 0.25 },
        });
        const attributedBefore = interventionHistory.filter(
          entry => entry.actor === 'LOCAL-CTRL'
        ).length;
        await handleTwinMessage(validControl);
        const afterControl = { ...state.alloc };
        const attributedAfterControl = interventionHistory.filter(
          entry => entry.actor === 'LOCAL-CTRL'
        ).length;

        await handleTwinMessage(validControl);
        const afterReplay = { ...state.alloc };
        const attributedAfterReplay = interventionHistory.filter(
          entry => entry.actor === 'LOCAL-CTRL'
        ).length;
        await handleTwinMessage({
          ...validControl,
          id: 'copied-signature-2',
          sequence: 2,
          payload: { h: 0.8, i: 0.1, g: 0.1 },
        });
        const afterChangedPayload = { ...state.alloc };

        const observeControl = await signCommand(observeKeys.privateKey, {
          id: 'observe-control-2',
          cmd: 'push_alloc',
          twinId: 'LOCAL-OBS',
          sequence: 2,
          payload: { h: 0.7, i: 0.2, g: 0.1 },
        });
        await handleTwinMessage(observeControl);
        const afterObserveDenied = { ...state.alloc };
        await handleTwinMessage(observeControl);
        const afterObserveReplay = { ...state.alloc };

        const heartbeat = await signCommand(controlKeys.privateKey, {
          id: 'control-heartbeat-2',
          cmd: 'kited_twin_heartbeat',
          twinId: 'LOCAL-CTRL',
          sequence: 2,
          payload: { mode: 'control', activity: 'Control verified' },
        });
        await handleTwinMessage(heartbeat);

        const serialized = JSON.stringify(serializeCartridge());
        const controlUnregister = await signCommand(controlKeys.privateKey, {
          id: 'control-unregister-3',
          cmd: 'unregister_kited_twin',
          twinId: 'LOCAL-CTRL',
          sequence: 3,
          payload: {},
        });
        const observeUnregister = await signCommand(observeKeys.privateKey, {
          id: 'observe-unregister-3',
          cmd: 'unregister_kited_twin',
          twinId: 'LOCAL-OBS',
          sequence: 3,
          payload: {},
        });
        await handleTwinMessage(controlUnregister);
        await handleTwinMessage(observeUnregister);

        const actorsBeforeLegacy = getKitedTwinSemanticSnapshot()
          .map(actor => actor.id);
        await handleTwinMessage({
          id: 'request-123',
          cmd: 'push_alloc',
          payload: { h: 0.25, i: 0.5, g: 0.25 },
        });

        return {
          crewCount,
          crewAfter: state.crew.length,
          controlChallenge,
          duplicateReservation,
          teamCollision,
          crewCollision,
          challengeCountBeforeReserved,
          challengeCountAfterReserved,
          invalidProof,
          actorsAfterInvalid,
          controlProof,
          repeatedProof,
          controlActorCount,
          observeProof,
          registered,
          registeredRender,
          beforeForgery,
          afterForgery,
          afterControl,
          afterReplay,
          afterChangedPayload,
          afterObserveDenied,
          afterObserveReplay,
          attributedBefore,
          attributedAfterControl,
          attributedAfterReplay,
          errors: broadcasts.filter(message =>
            message.payload?.ok === false
          ).map(message => ({
            replyTo: message.replyTo,
            error: message.payload.error,
          })),
          authorizationPersisted:
            serialized.includes(controlJwk.x) ||
            serialized.includes(controlChallenge.challenge) ||
            serialized.includes(controlChallenge.pairingPin) ||
            serialized.includes(validControl.signature),
          responseContainsBearer:
            JSON.stringify(broadcasts).includes('sessionToken'),
          actorsBeforeLegacy,
          actorsAfter: getKitedTwinSemanticSnapshot().map(actor => actor.id),
          renderAfter: getKitedTwinRenderSnapshot().map(actor => actor.id),
          legacyActor: interventionHistory.at(-1).actor,
          legacyReply: broadcasts.find(message =>
            message.replyTo === 'request-123'
          )?.replyTo,
          legacyResponse: broadcasts.find(message =>
            message.replyTo === 'request-123'
          )?.cmd,
          injectedNodes: document.querySelectorAll('#protocol-xss').length,
          executed: window.protocolXss,
          semanticText: document.getElementById('kited-twin-stage').textContent,
        };
      });

      expect(result.crewAfter).toBe(result.crewCount);
      expect(result.controlChallenge).toMatchObject({
        ok: true,
        protocolTag: 'mars-barn-kited-twin/v1',
        status: 'pairing_required',
        twinId: 'LOCAL-CTRL',
      });
      expect(result.controlChallenge.pairingPin).toMatch(/^\d{6}$/);
      expect(result.controlChallenge).not.toHaveProperty('actor');
      expect(result.duplicateReservation.error)
        .toBe('Kited twin id is already registered or reserved');
      expect(result.teamCollision.error)
        .toBe('Kited twin id is reserved by the simulation');
      expect(result.crewCollision.error)
        .toBe('Kited twin id is reserved by colony crew');
      expect(result.challengeCountAfterReserved)
        .toBe(result.challengeCountBeforeReserved);
      expect(result.invalidProof.ok).toBe(false);
      expect(result.actorsAfterInvalid).toBe(0);
      expect(result.controlProof.ok).toBe(true);
      expect(result.controlProof.sequence).toBe(0);
      expect(result.controlProof.actor.trust)
        .toBe('LOCAL KEY / IDENTITY UNVERIFIED');
      expect(result.controlProof.trust).toContain(
        'owner identity is not authenticated'
      );
      expect(result.repeatedProof).toMatchObject({
        ok: true,
        duplicate: true,
      });
      expect(result.controlActorCount).toBe(1);
      expect(result.observeProof.ok).toBe(true);
      expect(result.registered.map(actor => actor.id))
        .toEqual(['KITE-SCOUT', 'KITE-OPS', 'LOCAL-CTRL', 'LOCAL-OBS']);
      const external = result.registered.find(actor => actor.id === 'LOCAL-OBS');
      expect(external.trust).toBe('LOCAL KEY / IDENTITY UNVERIFIED');
      expect(external.activity).toHaveLength(220);
      const externalRender = result.registeredRender.find(actor =>
        actor.id === 'LOCAL-OBS'
      );
      expect(externalRender.kiteVisible).toBe(true);
      expect(externalRender.kiteObjectCount).toBe(1);
      expect(externalRender.targetBound).toBe(false);
      expect(result.afterForgery).toEqual(result.beforeForgery);
      expect(result.afterControl).not.toEqual(result.beforeForgery);
      expect(result.attributedAfterControl - result.attributedBefore).toBe(1);
      expect(result.afterReplay).toEqual(result.afterControl);
      expect(result.attributedAfterReplay).toBe(result.attributedAfterControl);
      expect(result.afterChangedPayload).toEqual(result.afterControl);
      expect(result.afterObserveDenied).toEqual(result.afterControl);
      expect(result.afterObserveReplay).toEqual(result.afterControl);
      expect(result.errors).toEqual(expect.arrayContaining([
        {
          replyTo: 'forged-control-1',
          error: 'Invalid kited twin signature',
        },
        {
          replyTo: 'valid-control-1',
          error: 'Kited twin sequence must strictly increase',
        },
        {
          replyTo: 'copied-signature-2',
          error: 'Invalid kited twin signature',
        },
        {
          replyTo: 'observe-control-2',
          error: 'Kited twin lacks required control capability',
        },
        {
          replyTo: 'observe-control-2',
          error: 'Kited twin sequence must strictly increase',
        },
      ]));
      expect(result.authorizationPersisted).toBe(false);
      expect(result.responseContainsBearer).toBe(false);
      expect(result.actorsBeforeLegacy).toEqual(['KITE-SCOUT', 'KITE-OPS']);
      expect(result.actorsAfter).toEqual(['KITE-SCOUT', 'KITE-OPS']);
      expect(result.renderAfter).toEqual(['KITE-SCOUT', 'KITE-OPS']);
      expect(result.legacyActor).toBe('LOCAL-CTRL');
      expect(result.legacyReply).toBe('request-123');
      expect(result.legacyResponse).toBe('pairing_required');
      expect(result.injectedNodes).toBe(0);
      expect(result.executed).toBe(false);
      expect(result.semanticText).not.toContain('LOCAL-OBS');
      expect(result.semanticText).not.toContain('LOCAL-CTRL');
    });

    test('serializes signed verification and safely rejects gaps, tampering, and replay', async ({ page }) => {
      await launchKitedMission(page, 'optimus');

      const result=await page.evaluate(async ()=>{
        const algorithm={name:'ECDSA',namedCurve:'P-256'};
        const signAlgorithm={name:'ECDSA',hash:'SHA-256'};
        const encoder=new TextEncoder();
        const keyPair=await crypto.subtle.generateKey(
          algorithm,true,['sign','verify']
        );
        const publicKeyJwk=await crypto.subtle.exportKey(
          'jwk',keyPair.publicKey
        );
        const signText=async text=>kitedTwinBase64UrlEncode(
          await crypto.subtle.sign(
            signAlgorithm,keyPair.privateKey,encoder.encode(text)
          )
        );
        const challenge=await registerExternalKitedTwin({
          twinId:'QUEUE-CTRL',
          label:'Queued controller',
          capabilities:['control'],
          publicKeyJwk,
        });
        await confirmKitedTwinPairing(challenge.challengeId);
        await proveExternalKitedTwin({
          challengeId:challenge.challengeId,
          pairingPin:challenge.pairingPin,
          clientConfirmed:true,
          signature:await signText(
            canonicalKitedTwinChallenge(challenge)
          ),
        });
        const signCommand=async message=>({
          ...message,
          signature:await signText(canonicalKitedTwinCommand(message)),
        });
        const first=await signCommand({
          id:'queue-command-1',
          cmd:'push_alloc',
          twinId:'QUEUE-CTRL',
          sequence:1,
          payload:{h:0.7,i:0.2,g:0.1},
        });
        const second=await signCommand({
          id:'queue-command-2',
          cmd:'push_alloc',
          twinId:'QUEUE-CTRL',
          sequence:2,
          payload:{h:0.1,i:0.7,g:0.2},
        });
        const outOfOrder=await signCommand({
          id:'queue-command-4-early',
          cmd:'push_alloc',
          twinId:'QUEUE-CTRL',
          sequence:4,
          payload:{h:0.8,i:0.1,g:0.1},
        });
        const third=await signCommand({
          id:'queue-command-3',
          cmd:'push_alloc',
          twinId:'QUEUE-CTRL',
          sequence:3,
          payload:{
            h:0.2,i:0.2,g:0.6,
            application:{signature:'nested-one'},
          },
        });
        const nestedTamper=structuredClone(third);
        nestedTamper.payload.application.signature='nested-two';

        const broadcasts=[];
        twinChannel={postMessage:message=>broadcasts.push(message)};
        const subtle=crypto.subtle;
        const ownVerify=Object.getOwnPropertyDescriptor(subtle,'verify');
        const originalVerify=subtle.verify.bind(subtle);
        let releaseFirst;
        let releaseSecond;
        let noteFirstStarted;
        let noteSecondStarted;
        const firstGate=new Promise(resolve=>{releaseFirst=resolve});
        const secondGate=new Promise(resolve=>{releaseSecond=resolve});
        const firstStarted=new Promise(resolve=>{noteFirstStarted=resolve});
        const secondStarted=new Promise(resolve=>{noteSecondStarted=resolve});
        Object.defineProperty(subtle,'verify',{
          configurable:true,
          value:async(...args)=>{
            const canonical=new TextDecoder().decode(args[3]);
            if(canonical.includes('"requestId":"queue-command-1"')){
              noteFirstStarted();
              await firstGate;
            }else if(canonical.includes('"requestId":"queue-command-2"')){
              noteSecondStarted();
              await secondGate;
            }
            return originalVerify(...args);
          },
        });
        let secondStartedBeforeFirstRelease=false;
        let afterFirst;
        let afterSecond;
        try{
          const firstDispatch=handleTwinMessage(first);
          await firstStarted;
          const secondDispatch=handleTwinMessage(second);
          secondStartedBeforeFirstRelease=await Promise.race([
            secondStarted.then(()=>true),
            new Promise(resolve=>setTimeout(()=>resolve(false),50)),
          ]);
          releaseFirst();
          await firstDispatch;
          afterFirst={...state.alloc};
          await secondStarted;
          releaseSecond();
          await secondDispatch;
          afterSecond={...state.alloc};
        }finally{
          if(ownVerify){
            Object.defineProperty(subtle,'verify',ownVerify);
          }else{
            delete subtle.verify;
          }
        }

        await handleTwinMessage(outOfOrder);
        const afterOutOfOrder={...state.alloc};
        await handleTwinMessage(nestedTamper);
        const afterNestedTamper={...state.alloc};
        await handleTwinMessage(third);
        const afterThird={...state.alloc};
        await handleTwinMessage(third);
        const afterReplay={...state.alloc};
        const unregister=await signCommand({
          id:'queue-unregister-4',
          cmd:'unregister_kited_twin',
          twinId:'QUEUE-CTRL',
          sequence:4,
          payload:{},
        });
        await handleTwinMessage(unregister);
        return {
          secondStartedBeforeFirstRelease,
          afterFirst,
          afterSecond,
          afterOutOfOrder,
          afterNestedTamper,
          afterThird,
          afterReplay,
          errors:broadcasts
            .filter(message=>message.payload?.ok===false)
            .map(message=>({
              replyTo:message.replyTo,
              error:message.payload.error,
            })),
          actorRemoved:!externalKitedTwinRegistrations.has('QUEUE-CTRL'),
        };
      });

      expect(result.secondStartedBeforeFirstRelease).toBe(false);
      expect(result.afterFirst.h).toBeCloseTo(0.7,8);
      expect(result.afterFirst.i).toBeCloseTo(0.2,8);
      expect(result.afterFirst.g).toBeCloseTo(0.1,8);
      expect(result.afterSecond.h).toBeCloseTo(0.1,8);
      expect(result.afterSecond.i).toBeCloseTo(0.7,8);
      expect(result.afterSecond.g).toBeCloseTo(0.2,8);
      expect(result.afterOutOfOrder).toEqual(result.afterSecond);
      expect(result.afterNestedTamper).toEqual(result.afterSecond);
      expect(result.afterThird.h).toBeCloseTo(0.2,8);
      expect(result.afterThird.i).toBeCloseTo(0.2,8);
      expect(result.afterThird.g).toBeCloseTo(0.6,8);
      expect(result.afterReplay).toEqual(result.afterThird);
      expect(result.errors).toEqual(expect.arrayContaining([
        {
          replyTo:'queue-command-4-early',
          error:'Kited twin sequence arrived out of order',
        },
        {
          replyTo:'queue-command-3',
          error:'Invalid kited twin signature',
        },
        {
          replyTo:'queue-command-3',
          error:'Kited twin sequence must strictly increase',
        },
      ]));
      expect(result.actorRemoved).toBe(true);
    });

    test('BroadcastChannel exposes public proof traffic but not control authority', async ({ page }) => {
      await launchKitedMission(page, 'optimus');

      const result = await page.evaluate(async () => {
        const algorithm = { name: 'ECDSA', namedCurve: 'P-256' };
        const signAlgorithm = { name: 'ECDSA', hash: 'SHA-256' };
        const encoder = new TextEncoder();
        const signText = async (privateKey, text) => kitedTwinBase64UrlEncode(
          await crypto.subtle.sign(signAlgorithm, privateKey, encoder.encode(text))
        );
        const signCommand = async (privateKey, message) => ({
          ...message,
          signature: await signText(privateKey, canonicalKitedTwinCommand(message)),
        });
        const controllerKeys = await crypto.subtle.generateKey(
          algorithm, true, ['sign', 'verify']
        );
        const listenerKeys = await crypto.subtle.generateKey(
          algorithm, true, ['sign', 'verify']
        );
        const publicKeyJwk = await crypto.subtle.exportKey(
          'jwk', controllerKeys.publicKey
        );
        const client = new BroadcastChannel(TWIN_CHANNEL_NAME);
        const listener = new BroadcastChannel(TWIN_CHANNEL_NAME);
        const listenerMessages = [];
        listener.onmessage = event => listenerMessages.push(event.data);
        const waitForReply = (replyTo, command) => new Promise(
          (resolve, reject) => {
            const timeout = setTimeout(() => {
              client.removeEventListener('message', onMessage);
              reject(new Error(`Timed out waiting for ${replyTo}`));
            }, 3000);
            const onMessage = event => {
              if(event.data?.from !== 'twin' ||
                 event.data?.replyTo !== replyTo ||
                 (command && event.data.cmd !== command))return;
              clearTimeout(timeout);
              client.removeEventListener('message', onMessage);
              resolve(event.data);
            };
            client.addEventListener('message', onMessage);
          }
        );
        const send = async (sender, message, responseCommand) => {
          const response = waitForReply(message.id, responseCommand);
          sender.postMessage(message);
          return response;
        };
        initWallets();
        const treasuryBefore=marsWallets.mars1_treasury.balance;
        const internalTransfer=marsTransfer(
          GENESIS_WALLET,'mars1_treasury',1,'internal pre-pair transfer'
        );
        stepSim();
        await new Promise(resolve=>setTimeout(resolve,50));
        const sensitiveCommands=new Set([
          'mars_transfer','state','state_update','echo_frame','task_event',
          'reflex_event','attestation','score','cartridge','wallets',
        ]);
        const prePairSensitive=listenerMessages.filter(message=>
          message?.from==='twin'&&sensitiveCommands.has(message.cmd)
        );

        const challengeReceipt = await send(client, {
          id: 'channel-register-1',
          cmd: 'register_kited_twin',
          twinId: 'CHANNEL-CTRL',
          payload: {
            label: 'Channel controller',
            capabilities: ['control'],
            publicKeyJwk,
          },
        }, 'kited_twin_challenge');
        const challenge = challengeReceipt.payload;
        const proofSignature = await signText(
          controllerKeys.privateKey,
          canonicalKitedTwinChallenge(challenge)
        );
        const awaitingProofReceipt = await send(client, {
          id: 'channel-proof-1',
          cmd: 'prove_kited_twin',
          twinId: 'CHANNEL-CTRL',
          payload: {
            challengeId: challenge.challengeId,
            pairingPin: challenge.pairingPin,
            clientConfirmed: true,
            signature: proofSignature,
          },
        }, 'kited_twin_proof_result');
        const actorsAfterClientProof = getKitedTwinSemanticSnapshot().filter(
          actor => actor.id === 'CHANNEL-CTRL'
        ).length;
        const finalProof = waitForReply(
          'channel-proof-1','kited_twin_proof_result'
        );
        const viewerConfirmed = await confirmKitedTwinPairing(
          challenge.challengeId
        );
        const proofReceipt = await finalProof;

        const beforeForgery = { ...state.alloc };
        const forged = await signCommand(listenerKeys.privateKey, {
          id: 'listener-forgery-1',
          cmd: 'push_alloc',
          twinId: 'CHANNEL-CTRL',
          sequence: 1,
          payload: { h: 0.8, i: 0.1, g: 0.1 },
        });
        const forgedReceipt = await send(
          listener, forged, 'allocation_error'
        );
        const afterForgery = { ...state.alloc };

        const validControl = await signCommand(controllerKeys.privateKey, {
          id: 'channel-control-1',
          cmd: 'push_alloc',
          twinId: 'CHANNEL-CTRL',
          sequence: 1,
          payload: { h: 0.1, i: 0.7, g: 0.2 },
        });
        const validReceipt = await send(
          client, validControl, 'state_update'
        );
        const afterControl = { ...state.alloc };
        const attributedAfterControl = interventionHistory.filter(
          entry => entry.actor === 'CHANNEL-CTRL'
        ).length;

        const copiedSignature = {
          ...validControl,
          id: 'listener-copy-2',
          sequence: 2,
          payload: { h: 0.9, i: 0.05, g: 0.05 },
        };
        const copiedReceipt = await send(
          listener, copiedSignature, 'allocation_error'
        );
        const afterCopiedSignature = { ...state.alloc };
        const attributedAfterCopy = interventionHistory.filter(
          entry => entry.actor === 'CHANNEL-CTRL'
        ).length;

        const beforeLegacy = {
          alloc: { ...state.alloc },
          interventions: interventionHistory.length,
        };
        const legacyAllocation = await send(client, {
          id: 'request-123',
          cmd: 'push_alloc',
          payload: { h: 0.2, i: 0.5, g: 0.3 },
        }, 'pairing_required');
        const legacyLispy = await send(client, {
          id: 'request-lispy',
          cmd: 'exec_lispy',
          payload: { code: '(begin (set! heating_alloc 0.3) 7)' },
        }, 'pairing_required');
        running = true;
        const legacyEmergency = await send(client, {
          id: 'request-emergency',
          cmd: 'emergency_stop',
          payload: {},
        }, 'pairing_required');
        const legacyRead = await send(client, {
          id: 'request-state',
          cmd: 'get_state',
          payload: {},
        }, 'pairing_required');
        const afterLegacy = {
          alloc: { ...state.alloc },
          interventions: interventionHistory.length,
          running,
        };

        await new Promise(resolve => setTimeout(resolve, 50));
        const twinResponses = listenerMessages.filter(
          message => message?.from === 'twin'
        );
        const pairedSensitive=twinResponses.filter(message=>
          sensitiveCommands.has(message.cmd)
        );
        const protocolTraffic = listenerMessages.map(message => ({
          cmd: message.cmd,
          replyTo: message.replyTo || null,
        }));
        const actorCount = getKitedTwinSemanticSnapshot().filter(
          actor => actor.id === 'CHANNEL-CTRL'
        ).length;
        client.close();
        listener.close();
        return {
          challengeReceipt,
          awaitingProofReceipt,
          actorsAfterClientProof,
          viewerConfirmed,
          proofReceipt,
          forgedReceipt,
          validReceipt,
          copiedReceipt,
          beforeForgery,
          afterForgery,
          afterControl,
          afterCopiedSignature,
          attributedAfterControl,
          attributedAfterCopy,
          legacyReplies: [
            legacyAllocation.replyTo,
            legacyLispy.replyTo,
            legacyEmergency.replyTo,
            legacyRead.replyTo,
          ],
          legacyCommands: [
            legacyAllocation.cmd,
            legacyLispy.cmd,
            legacyEmergency.cmd,
            legacyRead.cmd,
          ],
          beforeLegacy,
          afterLegacy,
          actorCount,
          protocolTraffic,
          eavesdroppedPin: listenerMessages.some(message =>
            message.cmd === 'kited_twin_challenge' &&
            message.payload?.pairingPin === challenge.pairingPin
          ),
          responseContainsBearer:
            JSON.stringify(twinResponses).includes('sessionToken'),
          internalTransferOk:internalTransfer.ok,
          treasuryConserved:
            marsWallets.mars1_treasury.balance>=treasuryBefore+1,
          prePairSensitive,
          pairedSensitiveAuthenticated:pairedSensitive.every(message=>
            message.targetTwinId==='CHANNEL-CTRL'&&
            Number.isSafeInteger(message.viewerSequence)&&
            typeof message.viewerSignature==='string'&&
            message.viewerSignature.length>0
          ),
          challengeAuthenticated:
            typeof challengeReceipt.viewerSignature==='string'&&
            challengeReceipt.targetTwinId==='CHANNEL-CTRL',
          proofAuthenticated:
            typeof proofReceipt.viewerSignature==='string'&&
            proofReceipt.targetTwinId==='CHANNEL-CTRL',
        };
      });

      expect(result.challengeReceipt.replyTo).toBe('channel-register-1');
      expect(result.challengeReceipt.payload.ok).toBe(true);
      expect(result.challengeReceipt.payload.pairingPin).toMatch(/^\d{6}$/);
      expect(result.awaitingProofReceipt.payload.status)
        .toBe('awaiting_viewer_confirmation');
      expect(result.actorsAfterClientProof).toBe(0);
      expect(result.viewerConfirmed).toBe(true);
      expect(result.proofReceipt.replyTo).toBe('channel-proof-1');
      expect(result.proofReceipt.payload.ok).toBe(true);
      expect(result.actorCount).toBe(1);
      expect(result.forgedReceipt.payload.error)
        .toBe('Invalid kited twin signature');
      expect(result.afterForgery).toEqual(result.beforeForgery);
      expect(result.afterControl).not.toEqual(result.beforeForgery);
      expect(result.attributedAfterControl).toBe(1);
      expect(result.copiedReceipt.payload.error)
        .toBe('Invalid kited twin signature');
      expect(result.afterCopiedSignature).toEqual(result.afterControl);
      expect(result.attributedAfterCopy).toBe(1);
      expect(result.legacyReplies).toEqual([
        'request-123',
        'request-lispy',
        'request-emergency',
        'request-state',
      ]);
      expect(result.legacyCommands).toEqual([
        'pairing_required',
        'pairing_required',
        'pairing_required',
        'pairing_required',
      ]);
      expect(result.afterLegacy).toEqual({
        ...result.beforeLegacy,
        running: true,
      });
      expect(result.eavesdroppedPin).toBe(true);
      expect(result.internalTransferOk).toBe(true);
      expect(result.treasuryConserved).toBe(true);
      expect(result.prePairSensitive).toEqual([]);
      expect(result.pairedSensitiveAuthenticated).toBe(true);
      expect(result.challengeAuthenticated).toBe(true);
      expect(result.proofAuthenticated).toBe(true);
      expect(result.protocolTraffic).toEqual(expect.arrayContaining([
        { cmd: 'register_kited_twin', replyTo: null },
        { cmd: 'kited_twin_challenge', replyTo: 'channel-register-1' },
        { cmd: 'prove_kited_twin', replyTo: null },
        { cmd: 'kited_twin_proof_result', replyTo: 'channel-proof-1' },
        { cmd: 'state_update', replyTo: 'channel-control-1' },
      ]));
      expect(result.responseContainsBearer).toBe(false);
    });

    test('mission reset and import require fresh key proof', async ({ page }) => {
      await launchKitedMission(page, 'optimus');
      const result = await page.evaluate(async () => {
        const algorithm = { name: 'ECDSA', namedCurve: 'P-256' };
        const signAlgorithm = { name: 'ECDSA', hash: 'SHA-256' };
        const encoder = new TextEncoder();
        const signText = async (privateKey, text) => kitedTwinBase64UrlEncode(
          await crypto.subtle.sign(signAlgorithm, privateKey, encoder.encode(text))
        );
        const keys = await crypto.subtle.generateKey(
          algorithm, true, ['sign', 'verify']
        );
        const publicKeyJwk = await crypto.subtle.exportKey(
          'jwk', keys.publicKey
        );
        const registerAndProve = async label => {
          const challenge = await registerExternalKitedTwin({
            twinId: 'LOCAL-RESET',
            label,
            capabilities: ['control'],
            publicKeyJwk,
          });
          await confirmKitedTwinPairing(challenge.challengeId);
          const proof = await proveExternalKitedTwin({
            challengeId: challenge.challengeId,
            pairingPin: challenge.pairingPin,
            clientConfirmed: true,
            signature: await signText(
              keys.privateKey,
              canonicalKitedTwinChallenge(challenge)
            ),
          });
          return { challenge, proof };
        };
        const signControl = async (id, sequence, payload) => {
          const message = {
            id,
            cmd: 'push_alloc',
            twinId: 'LOCAL-RESET',
            sequence,
            payload,
          };
          return {
            ...message,
            signature: await signText(
              keys.privateKey,
              canonicalKitedTwinCommand(message)
            ),
          };
        };
        const broadcasts = [];
        twinChannel = { postMessage: message => broadcasts.push(message) };

        const first = await registerAndProve('Reset controller');
        const oldResetCommand = await signControl(
          'before-reset-1', 1, { h: 0.2, i: 0.5, g: 0.3 }
        );
        const firstSerialized = JSON.stringify(serializeCartridge());
        launchMission(
          'optimus',
          {
            ...MISSIONS.optimus,
            crewList: MISSIONS.optimus.crewList.map(member => ({ ...member })),
            lispyProgram: 'adaptive_governor',
          },
          { seed: 5150, quickStart: true }
        );
        stopSimulationClock();
        clearDecisionTimers(true);
        const beforeResetAttempt = { ...state.alloc };
        await handleTwinMessage(oldResetCommand);
        const afterResetAttempt = { ...state.alloc };

        const second = await registerAndProve('Re-proved controller');
        const oldImportCommand = await signControl(
          'before-import-1', 1, { h: 0.15, i: 0.6, g: 0.25 }
        );
        const cartridge = serializeCartridge();
        const loaded = deserializeCartridge(cartridge);
        const beforeImportAttempt = { ...state.alloc };
        await handleTwinMessage(oldImportCommand);
        const afterImportAttempt = { ...state.alloc };
        const third = await registerAndProve('Imported run controller');

        return {
          loaded,
          beforeResetAttempt,
          afterResetAttempt,
          beforeImportAttempt,
          afterImportAttempt,
          proofs: [first.proof.ok, second.proof.ok, third.proof.ok],
          contexts: [
            first.challenge.runId,
            second.challenge.runId,
            third.challenge.runId,
          ],
          actors: getKitedTwinSemanticSnapshot().map(actor => actor.id),
          registrations: externalKitedTwinRegistrations.size,
          challenges: externalKitedTwinChallenges.size,
          resetError: broadcasts.find(message =>
            message.replyTo === 'before-reset-1'
          )?.payload.error,
          importError: broadcasts.find(message =>
            message.replyTo === 'before-import-1'
          )?.payload.error,
          authorizationPersisted:
            firstSerialized.includes(publicKeyJwk.x) ||
            firstSerialized.includes(first.challenge.challenge) ||
            firstSerialized.includes(first.challenge.pairingPin),
        };
      });

      expect(result.loaded).toBe(true);
      expect(result.afterResetAttempt).toEqual(result.beforeResetAttempt);
      expect(result.afterImportAttempt).toEqual(result.beforeImportAttempt);
      expect(result.proofs).toEqual([true, true, true]);
      expect(result.contexts[0]).not.toBe(result.contexts[1]);
      expect(result.contexts[2]).not.toBe(result.contexts[1]);
      expect(result.resetError)
        .toBe('Matching-PIN pairing is required before this request');
      expect(result.importError)
        .toBe('Matching-PIN pairing is required before this request');
      expect(result.authorizationPersisted).toBe(false);
      expect(result.registrations).toBe(1);
      expect(result.challenges).toBe(0);
      expect(result.actors)
        .toEqual(['KITE-SCOUT', 'KITE-OPS', 'LOCAL-RESET']);
    });
  });

  test('configured mission advances without tick errors', async ({ page }) => {
    await page.goto('/viewer.html');

    const result = await page.evaluate(() => {
      launchMission('ares', {
        ...MISSIONS.ares,
        crewList: MISSIONS.ares.crewList.map(member => ({ ...member })),
        lispyProgram: 'basic_governor',
      });
      landingMissionRef = null;
      const first = stepSim();
      const second = stepSim();
      updateAllUI();
      return {
        sol: state.sol,
        alive: state.alive,
        activeLispy,
        frames: [first?.frame, second?.frame],
      };
    });

    expect(result).toEqual({
      sol: 2,
      alive: true,
      activeLispy: 'basic_governor',
      frames: [1, 2],
    });
  });

  test('mission starts in dashboard mode without WebGL', async ({ page }) => {
    await page.goto('/viewer.html');
    await page.evaluate(() => {
      globe = null;
      launchMission('ares', {
        ...MISSIONS.ares,
        crewList: MISSIONS.ares.crewList.map(member => ({ ...member })),
        lispyProgram: 'basic_governor',
      });
    });

    await page.waitForFunction(() => running && state.sol >= 1);
    const result = await page.evaluate(() => ({
      running,
      sol: state.sol,
      landingPhase,
      groundSceneCleared: groundScene === null,
      missionVisible: document.getElementById('mission-overlay').style.display,
    }));

    expect(result.running).toBe(true);
    expect(result.sol).toBeGreaterThanOrEqual(1);
    expect(result.landingPhase).toBe('playing');
    expect(result.groundSceneCleared).toBe(true);
    expect(result.missionVisible).toBe('none');
  });

  test('simulation clock remains singular across speed, pause, and load', async ({ page }) => {
    await page.goto('/viewer.html');
    await page.evaluate(() => {
      globe = null;
      launchMission('ares', {
        ...MISSIONS.ares,
        crewList: MISSIONS.ares.crewList.map(member => ({ ...member })),
        lispyProgram: 'basic_governor',
      });
    });
    await page.waitForFunction(() => running && state.sol >= 1);

    const afterSpeed = await page.evaluate(() => {
      const startsBefore = simulationClockStarts;
      setSpeed(10);
      return {
        startsBefore,
        startsAfter: simulationClockStarts,
        hasClock: simInterval !== null,
      };
    });
    expect(afterSpeed.startsAfter).toBe(afterSpeed.startsBefore + 1);
    expect(afterSpeed.hasClock).toBe(true);

    await page.waitForFunction(() => state.sol >= 5);
    const pausedSol = await page.evaluate(() => {
      toggleSim();
      return state.sol;
    });
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => state.sol)).toBe(pausedSol);
    expect(await page.evaluate(() => simInterval)).toBeNull();

    await page.evaluate(() => toggleSim());
    await page.waitForFunction(sol => state.sol > sol, pausedSol);
    const cartridge = await page.evaluate(() => serializeCartridge());
    const loadState = await page.evaluate(cartridge => {
      const loaded = deserializeCartridge(cartridge);
      return { loaded, running, hasClock: simInterval !== null };
    }, cartridge);
    expect(loadState).toEqual({ loaded: true, running: false, hasClock: false });

    const resumeStarts = await page.evaluate(cartridge => {
      const startsBefore = simulationClockStarts;
      resumeFromCartridge(cartridge);
      resumeFromCartridge(cartridge);
      return startsBefore;
    }, cartridge);
    await page.waitForFunction(sol => running && state.sol > sol, cartridge.sol);
    expect(await page.evaluate(() => simInterval !== null)).toBe(true);
    expect(await page.evaluate(() => simulationClockStarts)).toBe(resumeStarts + 1);
  });

  test('robot missions do not consume human life support', async ({ page }) => {
    await page.goto('/viewer.html');

    const result = await page.evaluate(() => {
      launchMission('optimus', {
        ...MISSIONS.optimus,
        crewList: MISSIONS.optimus.crewList.map(member => ({ ...member })),
        lispyProgram: 'adaptive_governor',
      });
      landingMissionRef = null;
      R = () => 1;
      state.i_eff = 0;
      state.g_eff = 0;
      state.o2 = 0;
      state.h2o = 0;
      state.food = 0;
      stepSim();
      autopilotEnabled = true;
      return {
        alive: state.alive,
        cause: state.cause,
        o2: state.o2,
        h2o: state.h2o,
        food: state.food,
        autopilotDecision: runAutopilotOnTask({
          id: 'isru_catalyst',
          urgency: 'request',
          timeout: 30,
        }),
        lunarHumans: aliveHumanCrew(MISSIONS.lunar.crewList).length,
        crew: state.crew.map(member => ({ hp: member.hp, status: member.st })),
      };
    });

    expect(result.alive).toBe(true);
    expect(result.cause).toBeNull();
    expect(result.o2).toBe(0);
    expect(result.h2o).toBe(0);
    expect(result.food).toBe(0);
    expect(result.autopilotDecision).toBe('deny');
    expect(result.lunarHumans).toBe(0);
    expect(result.crew.every(member => member.hp === 100 && member.status === 'Nominal')).toBe(true);
  });

  test('versioned environment frames normalize into viewer weather', async ({ page }) => {
    await page.goto('/viewer.html');

    const weather = await page.evaluate(() => {
      launchMission('ares', MISSIONS.ares);
      landingMissionRef = null;
      publicFrames[1067] = {
        sol: 1067,
        environment: {
          temperature_k: 225.8,
          pressure_pa: 571.1,
          solar_irradiance: 606.7,
          wind_speed_ms: 18.8,
          solar_longitude: 202.9,
          season: 'Northern Autumn',
        },
        events: [],
        hazards: [],
        challenges: [],
      };
      if (!applyPublicFrame(1067)) throw new Error('frame was not applied');
      return {
        tempC: marsWeather.tempC,
        tempK: marsWeather.tempK,
        pressurePa: marsWeather.pressurePa,
        solarWm2: marsWeather.solarWm2,
        windMs: marsWeather.windMs,
        ls: marsWeather.ls,
        season: marsWeather.season,
      };
    });

    expect(weather.tempC).toBeCloseTo(-47.35, 2);
    expect(weather).toMatchObject({
      tempK: 225.8,
      pressurePa: 571.1,
      solarWm2: 606.7,
      windMs: 18.8,
      ls: 202.9,
      season: 'Northern Autumn',
    });
  });

  test('imported cartridge display fields remain inert text', async ({ page }) => {
    await page.goto('/viewer.html');

    const result = await page.evaluate(() => {
      const cartridge = serializeCartridge();
      cartridge.state.crew[0].name = '<img id="cartridge-xss" src=x onerror="window.__cartridgeXss=true">';
      cartridge.state.log = ['<img id="log-xss" src=x onerror="window.__cartridgeXss=true">'];
      window.__cartridgeXss = false;
      const loaded = deserializeCartridge(cartridge);
      updateAllUI();
      return {
        loaded,
        injectedNodes: document.querySelectorAll('#cartridge-xss,#log-xss').length,
        executed: window.__cartridgeXss,
        crewText: document.getElementById('crew-roster').textContent,
      };
    });

    expect(result.loaded).toBe(true);
    expect(result.injectedNodes).toBe(0);
    expect(result.executed).toBe(false);
    expect(result.crewText).toContain('<img id="cartridge-xss"');
  });

  test('terminal tick is atomic and idempotent', async ({ page }) => {
    await page.goto('/viewer.html');
    const result = await page.evaluate(() => {
      launchMission('ares', MISSIONS.ares);
      landingMissionRef = null;
      R = () => 1;
      state.i_eff = 0;
      state.g_eff = 0;
      state.o2 = 0.1;
      const before = {
        economy: state.economy,
        modules: state.modules.length,
        research: state.research.length,
      };
      const echo = stepSim();
      const terminalSol = state.sol;
      const repeated = stepSim();
      return {
        before,
        after: {
          economy: state.economy,
          modules: state.modules.length,
          research: state.research.length,
        },
        alive: state.alive,
        cause: state.cause,
        echoAlive: echo.alive,
        echoAlert: echo.visual.alert,
        repeated,
        solUnchanged: state.sol === terminalSol,
      };
    });

    expect(result.alive).toBe(false);
    expect(result.cause).toBe('O2 depletion');
    expect(result.echoAlive).toBe(false);
    expect(result.echoAlert).toBe('colony_dead');
    expect(result.after).toEqual(result.before);
    expect(result.repeated).toBeNull();
    expect(result.solUnchanged).toBe(true);
  });

  test('invalid cartridge is rejected without mutating live state', async ({ page }) => {
    await page.goto('/viewer.html');
    page.on('dialog', dialog => dialog.dismiss());
    const result = await page.evaluate(() => {
      const before = JSON.stringify(state);
      const cartridge = serializeCartridge();
      cartridge.state.power = -1;
      const loaded = deserializeCartridge(cartridge);
      return {
        loaded,
        unchanged: JSON.stringify(state) === before,
      };
    });

    expect(result).toEqual({ loaded: false, unchanged: true });
  });

  test('imported derived victory and financial claims stay untrusted', async ({ page }) => {
    await page.goto('/viewer.html');
    const result = await page.evaluate(() => {
      const cartridge=serializeCartridge();
      cartridge.state.outcome='won';
      cartridge.tasksResolved=999;
      cartridge.marsCirculating=20000000;
      cartridge.chainHead='forged';
      cartridge.chainBlocks=[{hash:'forged'}];
      cartridge.marsWallets={attacker:{balance:20000000}};
      const loaded=deserializeCartridge(cartridge);
      return {
        loaded,
        outcome:state.outcome,
        claimedOutcome:state.claimedOutcome,
        importTrust:state.importTrust,
        tasksResolved,marsCirculating,chainHead,
        attackerWallet:marsWallets.attacker,
      };
    });

    expect(result.loaded).toBe(true);
    expect(result.outcome).toBe('running');
    expect(result.claimedOutcome).toBe('won');
    expect(result.importTrust).toBe('unverified');
    expect(result.tasksResolved).toBe(0);
    expect(result.marsCirculating).toBe(0);
    expect(result.chainHead).toBeNull();
    expect(result.attackerWallet).toBeUndefined();
  });

  test('twin allocation updates reject invalid payloads atomically', async ({ page }) => {
    await page.goto('/viewer.html');
    const result = await page.evaluate(async () => {
      const keys=await crypto.subtle.generateKey(
        {name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']
      );
      const publicKeyJwk=await crypto.subtle.exportKey('jwk',keys.publicKey);
      const challenge=await registerExternalKitedTwin({
        twinId:'ATOMIC-CONTROL',
        label:'Atomic allocation test',
        capabilities:['control'],
        publicKeyJwk,
      });
      await confirmKitedTwinPairing(challenge.challengeId);
      const signText=async text=>kitedTwinBase64UrlEncode(
        await crypto.subtle.sign(
          {name:'ECDSA',hash:'SHA-256'},keys.privateKey,
          new TextEncoder().encode(text)
        )
      );
      await proveExternalKitedTwin({
        challengeId:challenge.challengeId,
        pairingPin:challenge.pairingPin,
        clientConfirmed:true,
        signature:await signText(canonicalKitedTwinChallenge(challenge)),
      });
      const command=async(id,sequence,payload)=>{
        const message={
          id,cmd:'push_alloc',twinId:'ATOMIC-CONTROL',sequence,payload,
        };
        return {
          ...message,
          signature:await signText(canonicalKitedTwinCommand(message)),
        };
      };
      const before = {...state.alloc};
      await handleTwinMessage(await command(
        'atomic-invalid',1,{h:'NaN',i:0.5,g:0.5}
      ));
      const afterInvalid = {...state.alloc};
      await handleTwinMessage(await command(
        'atomic-valid',2,{h:0.2,i:0.5,g:0.3,r:0.75}
      ));
      return {
        before,
        afterInvalid,
        afterValid:{...state.alloc},
      };
    });

    expect(result.afterInvalid).toEqual(result.before);
    expect(result.afterValid.r).toBe(0.75);
    expect(result.afterValid.h+result.afterValid.i+result.afterValid.g).toBeCloseTo(1,10);
  });

  test('cartridge chain verification detects component tampering', async ({ page }) => {
    await page.goto('/viewer.html');
    const result = await page.evaluate(() => {
      chainBlocks=[];chainHead=null;marsCirculating=10;
      buildChainBlock(1,null,{'Chen W.':5});
      marsCirculating=20;
      buildChainBlock(2,null,{'Chen W.':5});
      const cartridge=serializeCartridge();
      const clean=verifyCartridgeChain(cartridge);
      cartridge.chainBlocks[1].circulating=999;
      const tampered=verifyCartridgeChain(cartridge);
      return {clean,tampered};
    });

    expect(result.clean.verified).toBe(true);
    expect(result.tampered.verified).toBe(false);
    expect(result.tampered.reason).toContain('Block hash mismatch');
  });

  test('human and twin actions mark autonomy as assisted', async ({ page }) => {
    await page.goto('/viewer.html');
    const result = await page.evaluate(async () => {
      const keys=await crypto.subtle.generateKey(
        {name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']
      );
      const publicKeyJwk=await crypto.subtle.exportKey('jwk',keys.publicKey);
      const challenge=await registerExternalKitedTwin({
        twinId:'ASSIST-CONTROL',
        label:'Assistance test',
        capabilities:['control'],
        publicKeyJwk,
      });
      await confirmKitedTwinPairing(challenge.challengeId);
      const signText=async text=>kitedTwinBase64UrlEncode(
        await crypto.subtle.sign(
          {name:'ECDSA',hash:'SHA-256'},keys.privateKey,
          new TextEncoder().encode(text)
        )
      );
      await proveExternalKitedTwin({
        challengeId:challenge.challengeId,
        pairingPin:challenge.pairingPin,
        clientConfirmed:true,
        signature:await signText(canonicalKitedTwinChallenge(challenge)),
      });
      interventionHistory=[];
      const before=autonomyEligible();
      emergencyAction('ration');
      const afterHuman=autonomyEligible();
      const message={
        id:'assisted-allocation',
        cmd:'push_alloc',
        twinId:'ASSIST-CONTROL',
        sequence:1,
        payload:{h:0.2,i:0.5,g:0.3},
      };
      await handleTwinMessage({
        ...message,
        signature:await signText(canonicalKitedTwinCommand(message)),
      });
      const cartridge=serializeCartridge();
      return {
        before,
        afterHuman,
        eligible:cartridge.autonomyEligible,
        actors:cartridge.interventionHistory.map(entry=>entry.actor),
      };
    });

    expect(result.before).toBe(true);
    expect(result.afterHuman).toBe(false);
    expect(result.eligible).toBe(false);
    expect(result.actors).toEqual(['human','ASSIST-CONTROL']);
  });

  test('RNG checkpoint resumes deterministically in a fresh page', async ({ page }) => {
    await page.goto('/viewer.html');
    const checkpoint = await page.evaluate(() => {
      resetState();
      state.startSeed=12345;
      R=rng32(12345);
      frameMode='local';
      supplyChain={nextLaunchWindow:9999,inTransit:[],delivered:0};
      chainBlocks=[];chainHead=null;marsCirculating=0;
      stepSim();
      const cartridge=serializeCartridge();
      for(let index=0;index<3;index++)stepSim();
      return {
        cartridge,
        expected:{
          sol:state.sol,o2:state.o2,h2o:state.h2o,food:state.food,
          power:state.power,events:state.events,
          rngState:R.getState(),
        },
      };
    });

    await page.reload();
    const resumed = await page.evaluate(({cartridge}) => {
      if(!deserializeCartridge(cartridge))throw new Error('checkpoint rejected');
      frameMode='local';
      for(let index=0;index<3;index++)stepSim();
      return {
        sol:state.sol,o2:state.o2,h2o:state.h2o,food:state.food,
        power:state.power,events:state.events,
        rngState:R.getState(),
      };
    }, checkpoint);

    expect(resumed).toEqual(checkpoint.expected);
  });

  test('Earth supply launch disqualifies autonomy', async ({ page }) => {
    await page.goto('/viewer.html');
    const result = await page.evaluate(() => {
      interventionHistory=[];
      supplyChain={nextLaunchWindow:0,inTransit:[],delivered:0};
      tickSupplyChain(1);
      return {
        eligible:autonomyEligible(),
        entry:interventionHistory[0],
      };
    });

    expect(result.eligible).toBe(false);
    expect(result.entry.actor).toBe('external');
    expect(result.entry.kind).toBe('supply_launch');
  });

  test('mission contract completes exactly once at its horizon', async ({ page }) => {
    await page.goto('/viewer.html');
    const result = await page.evaluate(() => {
      launchMission('ares',MISSIONS.ares);
      landingMissionRef=null;
      state.missionContract={...MISSION_CONTRACTS.ares,targetSols:2};
      frameMode='local';R=()=>1;
      const first=stepSim();
      const second=stepSim();
      const terminalSol=state.sol;
      const repeated=stepSim();
      return {
        firstOutcome:first.outcome||'running',
        secondType:second.type,
        outcome:state.outcome,
        alive:state.alive,
        repeated,
        solUnchanged:state.sol===terminalSol,
      };
    });

    expect(result.firstOutcome).toBe('running');
    expect(result.secondType).toBe('mission_complete');
    expect(result.outcome).toBe('won');
    expect(result.alive).toBe(true);
    expect(result.repeated).toBeNull();
    expect(result.solUnchanged).toBe(true);
  });

  test('mission contracts enforce resupply and Dust Bowl modifiers', async ({ page }) => {
    await page.goto('/viewer.html');
    const result = await page.evaluate(() => {
      launchMission('skeleton',MISSIONS.skeleton);
      landingMissionRef=null;
      supplyChain={nextLaunchWindow:0,inTransit:[],delivered:0};
      tickSupplyChain(1);
      const skeletonLaunches=supplyChain.inTransit.length;

      launchMission('garden',MISSIONS.garden);
      landingMissionRef=null;
      supplyChain={nextLaunchWindow:1,inTransit:[],delivered:0};
      interventionHistory=[];
      tickSupplyChain(1);
      const garden={launches:supplyChain.inTransit.length,next:supplyChain.nextLaunchWindow,
        assisted:!autonomyEligible()};

      launchMission('dustbowl',MISSIONS.dustbowl);
      landingMissionRef=null;frameMode='local';R=()=>1;
      state.events=[];
      const dustIrr=solIrr(10);
      const originalMultiplier=state.missionContract.solarMultiplier;
      state.missionContract.solarMultiplier=1;
      const normalIrr=solIrr(10);
      state.missionContract.solarMultiplier=originalMultiplier;
      state.sol=49;
      stepSim();
      return {
        skeletonLaunches,garden,
        solarRatio:dustIrr/normalIrr,
        contractStorm:state.events.some(event=>
          event.type==='dust_storm'&&event.desc.includes('Contract dust storm')),
      };
    });

    expect(result.skeletonLaunches).toBe(0);
    expect(result.garden).toEqual({launches:1,next:401,assisted:true});
    expect(result.solarRatio).toBeCloseTo(0.4,10);
    expect(result.contractStorm).toBe(true);
  });

  test('duration-one event affects one tick before expiring', async ({ page }) => {
    await page.goto('/viewer.html');
    const result = await page.evaluate(() => {
      resetState();
      frameMode='local';
      R=()=>1;
      state.events=[{type:'dust_storm',severity:0.5,remaining:1,duration:1,desc:'one sol'}];
      const irradianceWithEvent=solIrr(1);
      const echo=stepSim();
      const irradianceAfterExpiry=solIrr(2);
      return {
        echoSawStorm:echo.visual.dust_storm,
        eventsRemaining:state.events.length,
        irradianceWithEvent,
        irradianceAfterExpiry,
      };
    });

    expect(result.echoSawStorm).toBe(true);
    expect(result.eventsRemaining).toBe(0);
    expect(result.irradianceWithEvent).toBeLessThan(result.irradianceAfterExpiry);
  });

  test('tier-one research changes browser physics after completion', async ({ page }) => {
    await page.goto('/viewer.html');
    const result = await page.evaluate(() => {
      const measure=research=>{
        resetState();frameMode='local';R=()=>1;
        state.research=research;
        state.events=[];state.modules=[];
        state.alloc={h:0.2,i:0.3,g:0.5,r:1};
        const before={power:state.power,h2o:state.h2o,food:state.food,rad:state.rad};
        stepSim();
        return {
          power:state.power-before.power,
          h2o:state.h2o-before.h2o,
          food:state.food-before.food,
          rad:state.rad-before.rad,
        };
      };
      return {
        baseline:measure([]),
        solar:measure(['improved_solar']),
        water:measure(['water_recycling']),
        crops:measure(['crop_optimization']),
        radiation:measure(['radiation_hardening']),
      };
    });

    expect(result.solar.power).toBeGreaterThan(result.baseline.power);
    expect(result.water.h2o-result.baseline.h2o).toBeCloseTo(2,10);
    expect(result.crops.food).toBeGreaterThan(result.baseline.food);
    expect(result.radiation.rad).toBeCloseTo(result.baseline.rad*0.7,10);
  });

  test('public mode cannot advance past a missing ledger frame', async ({ page }) => {
    await page.goto('/viewer.html');
    const result = await page.evaluate(() => {
      resetState();
      frameMode='public';latestPublicSol=1;publicFrames={};
      const blocked=stepSim();
      const blockedSol=state.sol;
      publicFrames[1]={
        sol:1,mars:{temp_c:-50,temp_k:223.15,pressure_pa:700,
          solar_wm2:500,dust_tau:0.1,wind_ms:4,lmst:12,ls:1,season:'Spring'},
        events:[],hazards:[],frame_echo:{prev_sol:null},
      };
      R=()=>1;
      const applied=stepSim();
      return {blocked,blockedSol,appliedFrame:applied.frame,finalSol:state.sol};
    });

    expect(result.blocked).toBeNull();
    expect(result.blockedSol).toBe(0);
    expect(result.appliedFrame).toBe(1);
    expect(result.finalSol).toBe(1);
  });

  test('public solar flare applies severity dose once before expiry', async ({ page }) => {
    await page.goto('/viewer.html');
    const result = await page.evaluate(() => {
      resetState();frameMode='public';latestPublicSol=1;R=()=>1;
      state.rad=0;state.crew.forEach(member=>{member.rad=0});
      publicFrames={1:{
        sol:1,mars:{temp_c:-50,temp_k:223.15,pressure_pa:700,
          solar_wm2:500,dust_tau:0.1,wind_ms:4,lmst:12,ls:1,season:'Spring'},
        events:[{type:'solar_flare',severity:0.5,duration_sols:1,desc:'test flare'}],
        hazards:[],frame_echo:{prev_sol:null},
      }};
      stepSim();
      return {
        colonyDose:state.rad,
        crewDoses:state.crew.map(member=>member.rad),
        activeEvents:state.events.length,
      };
    });

    expect(result.colonyDose).toBeCloseTo(25.335,10);
    expect(result.crewDoses.every(dose=>Math.abs(dose-25.335)<1e-9)).toBe(true);
    expect(result.activeEvents).toBe(0);
  });

  test('browser powered production obeys power and water limits', async ({ page }) => {
    await page.goto('/viewer.html');
    const result = await page.evaluate(() => {
      const prepare=(power,h2o,allocation)=>{
        resetState();frameMode='local';R=()=>1;
        state.crew=[{name:'OPT-01',role:'ENGR',hp:100,mor:100,rad:0,
          alive:true,st:'Nominal',kind:'robot'}];
        state.resources=undefined;
        state.o2=0;state.h2o=h2o;state.food=0;state.power=power;
        state.s_eff=0;state.events=[];state.modules=[];state.research=[];
        state.alloc=allocation;
        const before={o2:state.o2,h2o:state.h2o,food:state.food};
        stepSim();
        return {
          o2:state.o2-before.o2,
          h2o:state.h2o-before.h2o,
          food:state.food-before.food,
          power:state.power,
        };
      };
      return {
        isru:prepare(60,0,{h:0,i:1,g:0,r:1}),
        greenhouse:prepare(45,2.5,{h:0,i:0,g:1,r:1}),
        unpowered:prepare(30,10,{h:0,i:0.5,g:0.5,r:1}),
      };
    });

    expect(result.isru.o2).toBeCloseTo(2.5,10);
    expect(result.isru.h2o).toBeCloseTo(6,10);
    expect(result.isru.power).toBe(0);
    expect(result.greenhouse.food).toBeCloseTo(7500,10);
    expect(result.greenhouse.h2o).toBeCloseTo(-2.5,10);
    expect(result.greenhouse.power).toBe(0);
    expect(result.unpowered.o2).toBe(0);
    expect(result.unpowered.food).toBe(0);
  });

  test('wallet transfers reject invalid amounts and conserve balances', async ({ page }) => {
    await page.goto('/viewer.html');
    const result = await page.evaluate(() => {
      marsWallets={
        sender:{owner:'Sender',balance:100,type:'agent'},
        recipient:{owner:'Recipient',balance:50,type:'agent'},
      };
      marsTransfers=[];
      const invalid=[
        marsTransfer('sender','recipient','10','bad'),
        marsTransfer('sender','recipient',Number.NaN,'bad'),
        marsTransfer('sender','recipient',Number.POSITIVE_INFINITY,'bad'),
        marsTransfer('sender','recipient',-1,'bad'),
        marsTransfer('sender','recipient',1000,'bad'),
      ];
      const beforeValid=marsWallets.sender.balance+marsWallets.recipient.balance;
      const valid=marsTransfer('sender','recipient',25,'valid');
      const afterValid=marsWallets.sender.balance+marsWallets.recipient.balance;
      return {
        invalid:invalid.map(entry=>entry.ok),
        valid:valid.ok,
        balances:[marsWallets.sender.balance,marsWallets.recipient.balance],
        conserved:beforeValid===afterValid,
        transfers:marsTransfers.length,
      };
    });

    expect(result.invalid).toEqual([false,false,false,false,false]);
    expect(result.valid).toBe(true);
    expect(result.balances).toEqual([75,75]);
    expect(result.conserved).toBe(true);
    expect(result.transfers).toBe(1);
  });

  test('Lunar darkness and ISRU Down repair rules execute', async ({ page }) => {
    await page.goto('/viewer.html');
    const result = await page.evaluate(() => {
      launchMission('lunar',MISSIONS.lunar);landingMissionRef=null;
      frameMode='local';R=()=>1;state.events=[];
      const lunarSolar=[];
      for(let sol=1;sol<=15;sol++)lunarSolar.push(solIrr(sol));
      state.power=1000;state.alloc={h:0,i:1,g:0,r:1};
      const lunarO2=state.o2;stepSim();
      const lunarNoIsru=state.o2===lunarO2;

      launchMission('noisru',MISSIONS.noisru);landingMissionRef=null;
      frameMode='local';R=()=>1;state.s_eff=0;state.events=[];
      state.o2=10000;state.h2o=10000;state.food=10000000;state.power=10000;
      state.alloc={h:0,i:1,g:0,r:1};
      for(let index=0;index<59;index++)stepSim();
      const beforeRepair=state.o2;
      stepSim();
      const repairSolDelta=state.o2-beforeRepair;
      return {
        firstFourteenDark:lunarSolar.slice(0,14).every(value=>value===0),
        daylightReturns:lunarSolar[14]>0,
        lunarNoIsru,
        repairProgress:state.missionRepairProgress,
        isruEfficiency:state.i_eff,
        repairSolDelta,
      };
    });

    expect(result.firstFourteenDark).toBe(true);
    expect(result.daylightReturns).toBe(true);
    expect(result.lunarNoIsru).toBe(true);
    expect(result.repairProgress).toBe(60);
    expect(result.isruEfficiency).toBe(0.95);
    expect(result.repairSolDelta).toBeGreaterThan(-4*0.84);
  });

  test('decision callbacks cannot survive reset cleanup', async ({ page }) => {
    await page.goto('/viewer.html');
    await page.evaluate(() => {
      window.__staleDecisionMutation=false;
      scheduleDecisionTimeout(()=>{window.__staleDecisionMutation=true},50);
      clearDecisionTimers(true);
    });
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.__staleDecisionMutation)).toBe(false);
  });

  test('LisPy VM works in browser', async ({ page }) => {
    await page.goto('/viewer.html');
    // Run LisPy directly in the page context
    const result = await page.evaluate(() => {
      const vm = new LispyVM();
      vm.setEnv('x', 42);
      return vm.run('(+ x 8)');
    });
    expect(result.ok).toBe(true);
    expect(result.result).toBe(50);
  });

  test('LisPy string literals work', async ({ page }) => {
    await page.goto('/viewer.html');
    const result = await page.evaluate(() => {
      const vm = new LispyVM();
      return vm.run('(concat "hello" " " "world")');
    });
    expect(result.ok).toBe(true);
    expect(result.result).toBe('hello world');
  });

  test('LisPy prompt library accessible', async ({ page }) => {
    await page.goto('/viewer.html');
    const result = await page.evaluate(() => {
      const vm = new LispyVM();
      return vm.run('(prompt-list)');
    });
    expect(result.ok).toBe(true);
    expect(result.result.length).toBeGreaterThan(10);
  });

  test('cartridge drop zone exists', async ({ page }) => {
    await page.goto('/viewer.html');
    const dropZone = page.locator('#cartridge-drop');
    await expect(dropZone).toBeVisible();
  });

  test('autopilot toggle exists', async ({ page }) => {
    await page.goto('/viewer.html');
    // The autopilot button exists in the header (hidden until game starts)
    const btn = page.locator('#autopilot-btn');
    expect(await btn.count()).toBe(1);
  });
});
