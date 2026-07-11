// @ts-check
const { test, expect } = require('@playwright/test');

// ══════════════════════════════════════════════════════════════
// SIMHUB — Leaderboard page loads and functions
// ══════════════════════════════════════════════════════════════

test.describe('SimHub', () => {
  test('page loads with tabs', async ({ page }) => {
    await page.goto('/simhub.html');
    await page.waitForSelector('.tabs');
    const tabs = await page.locator('.tab').count();
    expect(tabs).toBe(5);
  });

  test('frame feed tab shows timeline', async ({ page }) => {
    await page.goto('/simhub.html');
    await page.locator('.tab', { hasText: 'FRAME FEED' }).click();
    const timeline = page.locator('#frame-timeline');
    await expect(timeline).toBeVisible();
  });

  test('upload tab has drop zone', async ({ page }) => {
    await page.goto('/simhub.html');
    await page.locator('.tab', { hasText: 'UPLOAD' }).click();
    const dropZone = page.locator('#upload-drop');
    await expect(dropZone).toBeVisible();
  });

  test('upload and leaderboard strings render as inert text', async ({ page }) => {
    await page.goto('/simhub.html');
    const result = await page.evaluate(() => {
      window.__simhubXss = false;
      const payload = '<img id="simhub-xss" src=x onerror="window.__simhubXss=true">';
      showUploadResult('success', payload);
      leaderboard = [{
        id: payload,
        name: payload,
        mission: payload,
        score: 1,
        grade: 'A',
        sol: 1,
        crew: '1/1',
        cri: 1,
        alive: true,
      }];
      renderLeaderboard();
      return {
        injectedNodes: document.querySelectorAll('#simhub-xss').length,
        executed: window.__simhubXss,
        uploadText: document.getElementById('upload-result').textContent,
      };
    });

    expect(result.injectedNodes).toBe(0);
    expect(result.executed).toBe(false);
    expect(result.uploadText).toContain('<img id="simhub-xss"');
  });

  test('frame data loads through three bounded index requests', async ({ page }) => {
    const requests=[];
    await page.route('https://raw.githubusercontent.com/**', async route => {
      const url=route.request().url();
      requests.push(url);
      if(url.endsWith('/manifest.json')){
        await route.fulfill({json:{total_frames:2,last_sol:2}});
      }else if(url.endsWith('/latest.json')){
        await route.fulfill({json:{sol:2}});
      }else if(url.endsWith('/frames.json')){
        await route.fulfill({json:{frames:{
          '1':{sol:1,mars:{temp_c:-50,dust_tau:0.1,solar_wm2:500,wind_ms:4,pressure_pa:700,season:'Northern Spring'},events:[],hazards:[]},
          '2':{sol:2,mars:{temp_c:-49,dust_tau:0.2,solar_wm2:490,wind_ms:5,pressure_pa:699,season:'Northern Spring'},events:[],hazards:[]},
        }}});
      }else{
        await route.abort();
      }
    });
    await page.goto('/simhub.html');
    await page.waitForFunction(() => allFrames.length===2);
    expect(requests.filter(url=>url.includes('/frames/'))).toHaveLength(3);
  });

  test('leaderboard chain verification checks block hashes and suffix anchors', async ({ page }) => {
    await page.goto('/simhub.html');
    const result = await page.evaluate(() => {
      const makeBlock=(sol,prevHash)=>{
        const block={version:2,sol,stateHash:`s${sol}`,decisionHash:`d${sol}`,
          rewardHash:`r${sol}`,circulating:sol*10,prevHash,
          frameHash:null,totalReward:5};
        const data=JSON.stringify({version:2,sol,stateHash:block.stateHash,
          decisionHash:block.decisionHash,rewardHash:block.rewardHash,
          circulating:block.circulating,prevHash:block.prevHash,
          frameHash:null,totalReward:block.totalReward});
        block.hash=hashStr(data);
        return block;
      };
      const first=makeBlock(101,'retained-anchor');
      const second=makeBlock(102,first.hash);
      const cartridge={chainBlocks:[first,second],chainHead:second.hash};
      const clean=verifyChain(cartridge);
      second.totalReward=999;
      const tampered=verifyChain(cartridge);
      return {clean,tampered};
    });

    expect(result.clean).toBe('self-consistent');
    expect(result.tampered).toBe('hash-mismatch');
  });
});

test.describe('Multiplayer', () => {
  test('peer messages render as inert text', async ({ page }) => {
    await page.goto('/multiplayer.html');
    const result = await page.evaluate(() => {
      window.__peerXss = false;
      addMsg(
        '<img id="peer-xss" src=x onerror="window.__peerXss=true">',
        'msg-remote'
      );
      return {
        injectedNodes: document.querySelectorAll('#peer-xss').length,
        executed: window.__peerXss,
        text: document.querySelector('#msg-box .msg:last-child')?.textContent,
        invalidState: normalizeRemoteState({ sol: 'not-a-number' }),
      };
    });

    expect(result.injectedNodes).toBe(0);
    expect(result.executed).toBe(false);
    expect(result.text).toContain('<img id="peer-xss"');
    expect(result.invalidState).toBeNull();
  });

  test('trades are connection-safe, delayed, and idempotent', async ({ page }) => {
    await page.goto('/multiplayer.html');
    const result = await page.evaluate(() => {
      localState={sol:10,alive:true,o2:100,h2o:200,food:1000,power:500,crew:4,morale:1};
      dc=null;
      const disconnected=sendTrade(10,20);
      const afterDisconnected={o2:localState.o2,h2o:localState.h2o};

      const sent=[];
      dc={readyState:'open',send:value=>sent.push(JSON.parse(value))};
      const invalid=[
        sendTrade(-1,10),sendTrade(10,-1),
        sendTrade(Number.NaN,1),sendTrade(1,Number.POSITIVE_INFINITY),
        sendTrade(1000,0),
      ];
      const connected=sendTrade(10,20);
      const afterSend={o2:localState.o2,h2o:localState.h2o};

      const incoming={type:'trade',id:'trade-1',o2:7,h2o:9,delay:2};
      const queued=queueIncomingTrade(incoming);
      const duplicate=queueIncomingTrade(incoming);
      localState.sol=12;
      processPendingTrades();
      return {
        disconnected,afterDisconnected,invalid,connected,afterSend,
        sent:sent[0],queued,duplicate,
        afterReceive:{o2:localState.o2,h2o:localState.h2o},
        pending:pendingTrades.length,
      };
    });

    expect(result.disconnected).toBe(false);
    expect(result.afterDisconnected).toEqual({o2:100,h2o:200});
    expect(result.invalid).toEqual([false,false,false,false,false]);
    expect(result.connected).toBe(true);
    expect(result.afterSend).toEqual({o2:90,h2o:180});
    expect(result.sent.id).toBeTruthy();
    expect(result.queued).toBe(true);
    expect(result.duplicate).toBe(false);
    expect(result.afterReceive).toEqual({o2:97,h2o:189});
    expect(result.pending).toBe(0);
  });
});

test.describe('Replay', () => {
  test('uses only exact retained history bounds', async ({ page }) => {
    await page.goto('/replay.html');
    const result = await page.evaluate(() => {
      cartridge={
        _format:'mars-barn-cartridge',sol:500,alive:true,
        config:{o2:100,h2o:200,food:300000,power:500},
        echoHistory:[
          {frame:401,delta:{o2:-1,h2o:-2,food:-3,power:-4},alive:true,events:[]},
          {frame:402,delta:{o2:-1,h2o:-2,food:-3,power:-4},alive:true,events:[]},
          {frame:405,delta:{o2:-1,h2o:-2,food:-3,power:-4},alive:true,events:[]},
        ],
        taskHistory:[],
      };
      initReplay();
      renderSol(403);
      return {
        minSol,maxSol,currentSol,
        message:document.getElementById('state-display').textContent,
        resourcePoints:resourceHistory.length,
      };
    });

    expect(result.minSol).toBe(401);
    expect(result.maxSol).toBe(405);
    expect(result.currentSol).toBe(403);
    expect(result.message).toContain('not retained');
    expect(result.resourcePoints).toBe(0);
  });

  test('renders imported replay fields as inert text', async ({ page }) => {
    await page.goto('/replay.html');
    const result = await page.evaluate(() => {
      window.__replayXss=false;
      const payload='<img id="replay-xss" src=x onerror="window.__replayXss=true">';
      cartridge={
        _format:'mars-barn-cartridge',sol:1,alive:false,
        state:{cause:payload},score:{grade:payload,total:1},
        config:{o2:100,h2o:100,food:100000,power:100},
        echoHistory:[{frame:1,alive:false,cri:10,cri_grade:payload,
          delta:{o2:0,h2o:0,food:0,power:0},
          events:[{type:payload,desc:payload,severity:0.5}]}],
        taskHistory:[{sol:1,id:payload,choice:'deny',timedOut:false}],
      };
      const validation=validateReplayCartridge(cartridge);
      initReplay();
      renderSol(1);
      return {
        validation,
        injected:document.querySelectorAll('#replay-xss').length,
        executed:window.__replayXss,
        text:document.getElementById('state-display').textContent+
          document.getElementById('events-display').textContent,
      };
    });

    expect(result.validation).toBeNull();
    expect(result.injected).toBe(0);
    expect(result.executed).toBe(false);
    expect(result.text).toContain('<img id="replay-xss"');
  });
});

// ══════════════════════════════════════════════════════════════
// CONTROL — Mission control loads
// ══════════════════════════════════════════════════════════════

test.describe('Mission Control', () => {
  test('page loads with grid layout', async ({ page }) => {
    await page.goto('/control.html');
    await page.waitForSelector('.mc-grid');
    const header = await page.locator('.mc-header h1').textContent();
    expect(header).toContain('MISSION CONTROL');
  });

  test('protocol buttons exist', async ({ page }) => {
    await page.goto('/control.html');
    const getState = page.locator('button', { hasText: 'GET STATE' });
    await expect(getState).toBeVisible();
  });

  test('wallet section exists', async ({ page }) => {
    await page.goto('/control.html');
    const walletBtn = page.locator('button', { hasText: 'GET WALLETS' });
    await expect(walletBtn).toBeVisible();
  });
});

test.describe('Twin telemetry', () => {
  test('Player preserves zero-valued telemetry in RTS', async ({ context }) => {
    const rts = await context.newPage();
    const player = await context.newPage();
    await rts.goto('/rts.html');
    await player.goto('/player.html');
    await rts.waitForSelector('#pwr-level');

    await player.evaluate(() => {
      currentSol=0;
      STATE={
        power:0,o2:0,h2o:0,food:0,cri:0,mod:[],
        crew:[{n:'Offline',hp:0,a:false,bot:false}],
      };
      broadcastState();
    });

    await rts.waitForFunction(() =>
      document.getElementById('pwr-level')?.textContent==='0' &&
      document.getElementById('crew-alive')?.textContent==='0'
    );
    expect(await rts.locator('#mod-count').textContent()).toBe('0');
    expect(await rts.locator('#val-o2').textContent()).toBe('0%');
    expect(await rts.locator('#val-h2o').textContent()).toBe('0%');
    expect(await rts.locator('#val-food').textContent()).toBe('0%');
    expect(await rts.locator('#val-pwr').textContent()).toBe('0%');
  });
});

test.describe('Sim Player', () => {
  test('duration-one dust event affects exactly its injection tick', async ({ page }) => {
    await page.goto('/player.html');
    const result = await page.evaluate(() => {
      const makeState=()=>{
        const state=createState();
        state.o2=100;state.h2o=200;state.food=300000;state.power=500;
        return state;
      };
      const frame={events:[{type:'dust_storm',severity:0.5,duration_sols:1}],
        hazards:[]};
      const eventState=makeState();
      const controlState=makeState();
      tick(eventState,1,frame,()=>1,null,null);
      tick(controlState,1,{events:[],hazards:[]},()=>1,null,null);
      const firstPowerPenalty=controlState.power-eventState.power;
      const eventsAfterFirst=eventState.ev.length;
      const eventPowerBeforeSecond=eventState.power;
      const controlPowerBeforeSecond=controlState.power;
      tick(eventState,2,null,()=>1,null,null);
      tick(controlState,2,null,()=>1,null,null);
      return {
        firstPowerPenalty,
        eventsAfterFirst,
        secondDeltaDifference:
          (controlState.power-controlPowerBeforeSecond)-
          (eventState.power-eventPowerBeforeSecond),
      };
    });

    expect(result.firstPowerPenalty).toBeGreaterThan(0);
    expect(result.eventsAfterFirst).toBe(0);
    expect(result.secondDeltaDifference).toBeCloseTo(0,10);
  });
});

// ══════════════════════════════════════════════════════════════
// PATTERNS — Pattern library loads
// ══════════════════════════════════════════════════════════════

test.describe('Pattern Library', () => {
  test('page loads with 14 patterns', async ({ page }) => {
    await page.goto('/patterns.html');
    const patterns = await page.locator('.pattern').count();
    expect(patterns).toBe(14);
  });

  test('TOC nav links exist', async ({ page }) => {
    await page.goto('/patterns.html');
    const navLinks = await page.locator('#toc a').count();
    expect(navLinks).toBe(14);
  });
});

// ══════════════════════════════════════════════════════════════
// BLOG — Blog index and posts load
// ══════════════════════════════════════════════════════════════

test.describe('Blog', () => {
  test('index loads with posts', async ({ page }) => {
    await page.goto('/blog/');
    const posts = await page.locator('.post-card').count();
    expect(posts).toBeGreaterThanOrEqual(7);
  });

  test.describe('Evolution guide', () => {
    test('explains improvements and filters the story', async ({ page }) => {
      await page.goto('/evolution.html');
      await expect(page.locator('h1')).toContainText('What changed');
      expect(await page.locator('#cards .card').count()).toBeGreaterThanOrEqual(8);
      await page.locator('.filter', {hasText:'Physics'}).click();
      await expect(page.locator('#cards .card[data-kind*="physics"]').first()).toBeVisible();
      await expect(page.locator('#cards .card[data-kind="platform"]').first()).toBeHidden();
    });
  });

  const blogPosts = [
    '/blog/the-1to1-thesis.html',
    '/blog/portal-pattern.html',
    '/blog/emergent-tooling.html',
    '/blog/echo-frames.html',
    '/blog/nervous-system.html',
    '/blog/sim-cartridges.html',
    '/blog/competitive-frames.html',
  ];

  for (const post of blogPosts) {
    test(`blog post loads: ${post}`, async ({ page }) => {
      await page.goto(post);
      const h1 = await page.locator('h1').textContent();
      expect(h1.length).toBeGreaterThan(5);
    });
  }
});
