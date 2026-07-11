// @ts-check
const { test, expect } = require('@playwright/test');

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

    await page.evaluate(cartridge => resumeFromCartridge(cartridge), cartridge);
    await page.waitForFunction(sol => running && state.sol > sol, cartridge.sol);
    expect(await page.evaluate(() => simInterval !== null)).toBe(true);
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
    const result = await page.evaluate(() => {
      const before = {...state.alloc};
      handleTwinMessage({cmd:'push_alloc',payload:{h:'NaN',i:0.5,g:0.5}});
      const afterInvalid = {...state.alloc};
      handleTwinMessage({cmd:'push_alloc',payload:{h:0.2,i:0.5,g:0.3,r:0.75}});
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
    const result = await page.evaluate(() => {
      interventionHistory=[];
      const before=autonomyEligible();
      emergencyAction('ration');
      const afterHuman=autonomyEligible();
      handleTwinMessage({cmd:'push_alloc',payload:{h:0.2,i:0.5,g:0.3}});
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
    expect(result.actors).toEqual(['human','external']);
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
