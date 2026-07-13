// @ts-check
const { test, expect } = require('@playwright/test');

async function completeVisiblePairing(viewer, control, viewerFirst = false) {
  const viewerCard = viewer.locator('.twin-pairing-card');
  await expect(viewerCard).toBeVisible({ timeout: 10000 });
  await expect(control.locator('#pairing-card')).toBeVisible();
  if (viewerFirst) {
    await viewerCard.getByRole('button', { name: 'ALLOW' }).click();
    await expect(control.locator('#pairing-status'))
      .toContainText('VIEWER ALLOWED');
    await control.locator('#pairing-confirm').click();
  } else {
    await control.locator('#pairing-confirm').click();
    await expect(control.locator('#pairing-status'))
      .toContainText('WAITING FOR VIEWER ALLOW');
    await viewerCard.getByRole('button', { name: 'ALLOW' }).click();
  }
  await expect(control.locator('#conn-status'))
    .toContainText('TWIN LINKED', { timeout: 10000 });
}

async function launchPairedMissionControl(context, seed) {
  const viewer = await context.newPage();
  const control = await context.newPage();
  await viewer.goto('/viewer.html');
  await viewer.evaluate(missionSeed => {
    globe = null;
    launchMission(
      'optimus',
      {
        ...MISSIONS.optimus,
        crewList: MISSIONS.optimus.crewList.map(member => ({ ...member })),
        lispyProgram: 'adaptive_governor',
      },
      { seed: missionSeed, quickStart: true }
    );
    stopSimulationClock();
    clearDecisionTimers(true);
  }, seed);
  await control.goto('/control.html');
  await completeVisiblePairing(viewer, control);
  return { viewer, control };
}

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

  test('matching PIN links Viewer and enables only signed authority', async ({ context }) => {
    test.setTimeout(60000);
    const viewer = await context.newPage();
    const control = await context.newPage();
    await viewer.setViewportSize({ width: 390, height: 844 });
    await control.setViewportSize({ width: 390, height: 844 });
    await viewer.goto('/viewer.html');
    await viewer.evaluate(() => {
      globe = null;
      launchMission(
        'optimus',
        {
          ...MISSIONS.optimus,
          crewList: MISSIONS.optimus.crewList.map(member => ({ ...member })),
          lispyProgram: 'adaptive_governor',
        },
        { seed: 6060, quickStart: true }
      );
      stopSimulationClock();
      clearDecisionTimers(true);
    });
    await control.goto('/control.html');

    const viewerCard = viewer.locator('.twin-pairing-card');
    const controlCard = control.locator('#pairing-card');
    await expect(viewerCard).toBeVisible({ timeout: 10000 });
    await expect(controlCard).toBeVisible();
    const viewerPin = await viewerCard.locator('[data-field="pairing-pin"]')
      .textContent();
    const controlPin = await control.locator('#pairing-pin').textContent();
    expect(viewerPin).toMatch(/^\d{6}$/);
    expect(controlPin).toBe(viewerPin);
    await expect(control.locator('#conn-status'))
      .toContainText('VIEWER FOUND · PAIRING REQUIRED');
    await expect(control.locator('#conn-status')).not.toContainText('TWIN LINKED');
    await expect(control.getByRole('button', { name: 'GET STATE' }))
      .toBeDisabled();
    expect(await control.evaluate(() => ({
      twinState,
      sol: document.getElementById('mc-sol').textContent,
    }))).toEqual({ twinState: null, sol: '—' });

    const authenticChallenge = await control.evaluate(
      () => activePairingChallenge.challengeId
    );
    await control.evaluate(async () => {
      const keyPair=await crypto.subtle.generateKey(
        {name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']
      );
      const exported=await crypto.subtle.exportKey('jwk',keyPair.publicKey);
      const publicKeyJwk={
        kty:'EC',crv:'P-256',x:exported.x,y:exported.y,
        ext:true,key_ops:['verify'],
      };
      const viewerKeyId=await TwinPairingProtocol.sha256Base64Url(
        TwinPairingProtocol.canonicalJson(publicKeyJwk)
      );
      const viewerApprovalNonce=TwinPairingProtocol.randomValue(32);
      const fakeChallenge={
        ok:true,
        protocolTag:TwinPairingProtocol.protocolTag,
        status:'pairing_required',
        challengeId:TwinPairingProtocol.randomValue(16),
        challenge:TwinPairingProtocol.randomValue(32),
        pairingPin:'123456',
        viewerApprovalCommitment:
          await TwinPairingProtocol.sha256Base64Url(viewerApprovalNonce),
        viewerPublicKeyJwk:publicKeyJwk,
        viewerKeyId,
        twinId:CONTROL_TWIN_ID,
        viewerInstanceId:'forged-viewer',
        runId:'forged-run',
        expiresAt:new Date(Date.now()+30000).toISOString(),
      };
      const sign=async envelope=>TwinPairingProtocol.base64UrlEncode(
        await crypto.subtle.sign(
          {name:'ECDSA',hash:'SHA-256'},
          keyPair.privateKey,
          TwinPairingProtocol.encodeText(
            TwinPairingProtocol.canonicalViewerMessage(envelope)
          )
        )
      );
      const challengeEnvelope={
        from:'twin',
        cmd:'kited_twin_challenge',
        payload:fakeChallenge,
        replyTo:'forged-registration',
        targetTwinId:CONTROL_TWIN_ID,
        viewerInstanceId:fakeChallenge.viewerInstanceId,
        runId:fakeChallenge.runId,
        pairingChallengeId:fakeChallenge.challengeId,
        viewerKeyId,
        viewerSequence:1,
      };
      challengeEnvelope.viewerSignature=await sign(challengeEnvelope);
      const resultEnvelope={
        from:'twin',
        cmd:'kited_twin_proof_result',
        payload:{
          ok:true,
          status:'paired',
          challengeId:fakeChallenge.challengeId,
          twinId:CONTROL_TWIN_ID,
          viewerInstanceId:fakeChallenge.viewerInstanceId,
          runId:fakeChallenge.runId,
          viewerApproved:true,
          clientConfirmed:true,
          pairingPin:fakeChallenge.pairingPin,
          viewerApprovalCommitment:
            fakeChallenge.viewerApprovalCommitment,
          viewerApprovalNonce,
          clientProofSignature:'forged-proof',
          clientProofRequestId:'forged-proof-request',
        },
        replyTo:'forged-proof-request',
        targetTwinId:CONTROL_TWIN_ID,
        viewerInstanceId:fakeChallenge.viewerInstanceId,
        runId:fakeChallenge.runId,
        pairingChallengeId:fakeChallenge.challengeId,
        viewerKeyId,
        viewerSequence:2,
      };
      resultEnvelope.viewerSignature=await sign(resultEnvelope);
      const attacker=new BroadcastChannel(CHANNEL_NAME);
      attacker.postMessage(challengeEnvelope);
      attacker.postMessage(resultEnvelope);
      attacker.close();
    });
    await control.waitForTimeout(100);
    expect(await control.evaluate(() => ({
      challengeId:activePairingChallenge?.challengeId,
      clientConfirmedPairing,
      pairingState,
      enabled:!document.querySelector(
        'button[onclick*="get_state"]'
      )?.disabled,
    }))).toEqual({
      challengeId:authenticChallenge,
      clientConfirmedPairing:false,
      pairingState:'PAIRING_REQUIRED',
      enabled:false,
    });

    for (const box of [
      await viewerCard.boundingBox(),
      await controlCard.boundingBox(),
    ]) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
    }

    await control.locator('#pairing-confirm').focus();
    await control.keyboard.press('Enter');
    await expect(control.locator('#pairing-status'))
      .toContainText('WAITING FOR VIEWER ALLOW');
    await expect(control.getByRole('button', { name: 'GET STATE' }))
      .toBeDisabled();
    await control.evaluate(() => {
      const attacker=new BroadcastChannel(CHANNEL_NAME);
      attacker.postMessage({
        from:'twin',
        cmd:'kited_twin_proof_result',
        targetTwinId:CONTROL_TWIN_ID,
        payload:{
          ok:true,
          status:'paired',
          sequence:0,
          challengeId:activePairingChallenge.challengeId,
          twinId:CONTROL_TWIN_ID,
          viewerInstanceId:activePairingChallenge.viewerInstanceId,
          runId:activePairingChallenge.runId,
          viewerApprovalNonce:TwinPairingProtocol.randomValue(32),
        },
      });
      attacker.close();
    });
    await control.waitForTimeout(100);
    await expect(control.locator('#conn-status')).not.toContainText('TWIN LINKED');
    await expect(control.getByRole('button', { name: 'GET STATE' }))
      .toBeDisabled();
    expect(await viewer.evaluate(() =>
      getKitedTwinSemanticSnapshot().filter(actor => !actor.native).length
    )).toBe(0);

    const allow = viewerCard.getByRole('button', { name: 'ALLOW' });
    await allow.focus();
    await viewer.keyboard.press('Enter');
    await expect(control.locator('#conn-status'))
      .toContainText('TWIN LINKED', { timeout: 10000 });
    await expect(control.getByRole('button', { name: 'GET STATE' }))
      .toBeEnabled();

    const twinId = await control.evaluate(() => CONTROL_TWIN_ID);
    const actor = await viewer.evaluate(id => ({
      matches: getKitedTwinSemanticSnapshot().filter(item => item.id === id),
      rowText: document.querySelector(
        `.kited-twin-row[data-twin-id="${id}"]`
      )?.textContent,
    }), twinId);
    expect(actor.matches).toHaveLength(1);
    expect(actor.matches[0].trust).toBe('LOCAL KEY / IDENTITY UNVERIFIED');
    expect(actor.rowText).toContain('🪁');

    const signed = await control.evaluate(async () => {
      await signedSendChain;
      const sent = [];
      const original = channel.postMessage.bind(channel);
      channel.postMessage = message => {
        sent.push(structuredClone(message));
        original(message);
      };
      await send('get_state');
      await send('push_alloc', { h: 0.1, i: 0.7, g: 0.2, r: 1 });
      return sent.filter(message =>
        ['get_state', 'push_alloc'].includes(message.cmd)
      );
    });
    expect(signed).toHaveLength(2);
    expect(signed.every(message =>
      message.twinId === twinId &&
      Number.isSafeInteger(message.sequence) &&
      typeof message.signature === 'string' &&
      message.signature.length > 0
    )).toBe(true);
    expect(signed[1].sequence).toBe(signed[0].sequence + 1);
    await expect.poll(() => viewer.evaluate(() => state.alloc.i))
      .toBeCloseTo(0.7, 5);
  });

  test('paired LisPy success and failure return verified canonical receipts', async ({ context }) => {
    test.setTimeout(60000);
    const {viewer,control}=await launchPairedMissionControl(context,6111);
    await control.evaluate(async()=>{
      await signedSendChain;
      window.__pairedLispyReceipts=[];
      window.__pairedLispyVerifications=[];
      const listener=new BroadcastChannel(CHANNEL_NAME);
      window.__pairedLispyListener=listener;
      listener.onmessage=event=>{
        const message=event.data;
        if(message?.from==='twin'&&message.cmd==='lispy_result'&&
           message.targetTwinId===CONTROL_TWIN_ID){
          window.__pairedLispyReceipts.push(structuredClone(message));
        }
      };
      const subtle=crypto.subtle;
      window.__pairedLispyVerifyDescriptor=
        Object.getOwnPropertyDescriptor(subtle,'verify');
      window.__pairedLispyOriginalVerify=subtle.verify.bind(subtle);
      Object.defineProperty(subtle,'verify',{
        configurable:true,
        value:async(...args)=>{
          const verified=await window.__pairedLispyOriginalVerify(...args);
          if(verified){
            try{
              const canonical=JSON.parse(
                new TextDecoder().decode(args[3])
              );
              if(canonical.command==='lispy_result'){
                window.__pairedLispyVerifications.push(canonical);
              }
            }catch(error){}
          }
          return verified;
        },
      });
    });

    const successId=await control.evaluate(async()=>{
      const message=await send('exec_lispy',{
        code:'(begin (set! heating_alloc 0.6) (set! isru_alloc 0.3) (set! greenhouse_alloc 0.1) (print "canonical-success") (list 7 (list "nested" (begin))))',
      });
      return message.id;
    });
    await control.waitForFunction(requestId=>
      window.__pairedLispyReceipts.some(
        message=>message.replyTo===requestId
      )&&window.__pairedLispyVerifications.some(
        message=>message.requestId===requestId
      )
    ,successId);
    const afterSuccess=await viewer.evaluate(()=>({...state.alloc}));

    const failureId=await control.evaluate(async()=>{
      const message=await send('exec_lispy',{
        code:'(begin (set! heating_alloc 0.95) (print "before-failure") (unknown-op 1))',
      });
      return message.id;
    });
    await control.waitForFunction(requestId=>
      window.__pairedLispyReceipts.some(
        message=>message.replyTo===requestId
      )&&window.__pairedLispyVerifications.some(
        message=>message.requestId===requestId
      )
    ,failureId);
    const afterFailure=await viewer.evaluate(()=>({...state.alloc}));

    const receipts=await control.evaluate(({successId,failureId})=>{
      const select=requestId=>({
        receipt:window.__pairedLispyReceipts.find(
          message=>message.replyTo===requestId
        ),
        verified:window.__pairedLispyVerifications.find(
          message=>message.requestId===requestId
        ),
      });
      const result={
        success:select(successId),
        failure:select(failureId),
        acceptedViewerSequence:pairedContext.viewerSequence,
        handled:protoLog.filter(entry=>
          entry.msg.startsWith('LisPy result:')
        ).length,
      };
      window.__pairedLispyListener.close();
      const descriptor=window.__pairedLispyVerifyDescriptor;
      if(descriptor){
        Object.defineProperty(crypto.subtle,'verify',descriptor);
      }else{
        delete crypto.subtle.verify;
      }
      return result;
    },{successId,failureId});

    expect(afterSuccess.h).toBeCloseTo(0.6,8);
    expect(afterSuccess.i).toBeCloseTo(0.3,8);
    expect(afterSuccess.g).toBeCloseTo(0.1,8);
    expect(afterFailure).toEqual(afterSuccess);
    expect(receipts.success.receipt.payload).toEqual({
      ok:true,
      result:[7,['nested',null]],
      output:['canonical-success'],
      error:null,
      truncated:false,
    });
    expect(receipts.failure.receipt.payload).toEqual({
      ok:false,
      result:null,
      output:['before-failure'],
      error:'Unknown op: unknown-op',
      truncated:false,
    });
    for(const result of [receipts.success,receipts.failure]){
      expect(result.receipt.viewerSignature).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(result.verified.payload).toEqual(result.receipt.payload);
      expect(result.verified.viewerSequence)
        .toBe(result.receipt.viewerSequence);
      expect(Buffer.byteLength(JSON.stringify(result.receipt.payload),'utf8'))
        .toBeLessThan(16384);
    }
    expect(receipts.acceptedViewerSequence).toBeGreaterThanOrEqual(
      receipts.failure.receipt.viewerSequence
    );
    expect(receipts.handled).toBeGreaterThanOrEqual(2);
  });

  test('rejects forged, tampered, replayed, and unsigned post-pair messages', async ({ context }) => {
    test.setTimeout(60000);
    const {viewer,control}=await launchPairedMissionControl(context,6161);
    const connection=await control.evaluate(() => ({
      challengeId:pairedContext.challengeId,
      twinId:CONTROL_TWIN_ID,
    }));
    const pairedPin=await viewer.evaluate(challengeId =>
      externalKitedTwinPairingResults.get(challengeId)?.pairingPin
    ,connection.challengeId);

    const result=await control.evaluate(async ({challengeId,pairedPin})=>{
      const observed=[];
      const peer=new BroadcastChannel(CHANNEL_NAME);
      peer.onmessage=event=>observed.push(structuredClone(event.data));
      await send('get_state');
      const deadline=Date.now()+3000;
      while(Date.now()<deadline&&!observed.some(message=>
        message?.cmd==='state_update'&&
        message?.targetTwinId===CONTROL_TWIN_ID&&
        typeof message?.viewerSignature==='string'
      )){
        await new Promise(resolve=>setTimeout(resolve,10));
      }
      const authentic=observed.findLast(message=>
        message?.cmd==='state_update'&&
        message?.targetTwinId===CONTROL_TWIN_ID&&
        typeof message?.viewerSignature==='string'
      );
      const before={
        sol:twinState?.sol,
        cause:twinState?.cause,
        sequence:pairedContext.viewerSequence,
      };
      const tamperedPayload=structuredClone(authentic);
      tamperedPayload.viewerSequence=pairedContext.viewerSequence+1;
      tamperedPayload.payload.sol=999999;
      tamperedPayload.payload.cause='forged payload';
      peer.postMessage(tamperedPayload);

      const tamperedSignature=structuredClone(authentic);
      tamperedSignature.viewerSequence=pairedContext.viewerSequence+1;
      tamperedSignature.viewerSignature=
        TwinPairingProtocol.randomValue(64);
      peer.postMessage(tamperedSignature);
      peer.postMessage(authentic);
      peer.postMessage({
        from:'twin',
        cmd:'state_update',
        targetTwinId:CONTROL_TWIN_ID,
        payload:{sol:888888,cause:'unsigned payload'},
      });
      peer.postMessage({
        from:'control',
        cmd:'cancel_kited_twin_pairing',
        twinId:CONTROL_TWIN_ID,
        id:'replayed-public-cancel',
        payload:{
          challengeId,
          twinId:CONTROL_TWIN_ID,
          pairingPin:pairedPin,
        },
      });
      await new Promise(resolve=>setTimeout(resolve,250));
      const nestedOne={
        cmd:'probe',
        viewerInstanceId:'viewer',
        runId:'run',
        pairingChallengeId:'challenge',
        viewerKeyId:'A'.repeat(43),
        targetTwinId:'TARGET',
        viewerSequence:1,
        payload:{application:{signature:'one'}},
      };
      const nestedTwo=structuredClone(nestedOne);
      nestedTwo.payload.application.signature='two';
      const after={
        sol:twinState?.sol,
        cause:twinState?.cause,
        sequence:pairedContext?.viewerSequence,
        pairingState,
      };
      peer.close();
      return {
        before,
        after,
        signedEnvelope:Boolean(
          authentic?.viewerSignature&&
          authentic?.viewerKeyId&&
          authentic?.pairingChallengeId===challengeId
        ),
        nestedSignatureIsSigned:
          TwinPairingProtocol.canonicalViewerMessage(nestedOne)!==
          TwinPairingProtocol.canonicalViewerMessage(nestedTwo),
      };
    },{challengeId:connection.challengeId,pairedPin});

    expect(result.signedEnvelope).toBe(true);
    expect(result.nestedSignatureIsSigned).toBe(true);
    expect(result.after.sol).toBe(result.before.sol);
    expect(result.after.cause).toBe(result.before.cause);
    expect(result.after.sequence).toBeGreaterThanOrEqual(
      result.before.sequence
    );
    expect(result.after.pairingState).toBe('PAIRED');
    await expect(control.locator('#conn-status')).toContainText('TWIN LINKED');
    expect(await viewer.evaluate(id =>
      getKitedTwinSemanticSnapshot().some(actor => actor.id===id)
    ,connection.twinId)).toBe(true);
  });

  test('renders signed state, echo, and wallet protocol text without DOM injection', async ({ context }) => {
    test.setTimeout(60000);
    const {viewer,control}=await launchPairedMissionControl(context,6262);
    const marker='<img class="pairing-protocol-xss" src=x onerror="window.__pairingProtocolXss=true">';
    await viewer.evaluate(value=>{
      window.__pairingProtocolXss=false;
      state.alive=false;
      state.cause=value;
      state.crew[0].name=value;
      state.crew[0].role=value;
      state.events=[{
        type:value,
        desc:value,
        description:value,
        severity:0.5,
        remaining:1,
      }];
      lastEcho={
        frame:state.sol,
        cri:42,
        delta:{o2:0,h2o:0,food:0,power:0},
        events:[{
          type:value,
          description:value,
          severity:0.5,
        }],
        reflexes_fired:[],
      };
      marsWallets={
        [value]:{
          owner:value,
          type:'external',
          balance:0,
        },
      };
      marsTransfers=[{
        sol:state.sol,
        from:value,
        fromOwner:value,
        to:value,
        toOwner:value,
        amount:1,
        memo:value,
      }];
      updateAllUI();
      updateWalletUI();
    },marker);
    await control.evaluate(async ()=>{
      window.__pairingProtocolXss=false;
      await send('get_state');
      await send('get_echo');
      await send('get_wallets');
      await signedSendChain;
    });
    await expect(control.locator('#state-kv')).toContainText(marker);
    await expect(control.locator('#crew-state')).toContainText(marker);
    await expect(control.locator('#echo-stream')).toContainText(marker);
    await expect(control.locator('#wallet-display')).toContainText(marker);
    await expect(control.locator('#transfer-display')).toContainText(marker);
    expect(await viewer.locator('.pairing-protocol-xss').count()).toBe(0);
    expect(await control.locator('.pairing-protocol-xss').count()).toBe(0);
    expect(await viewer.evaluate(() => window.__pairingProtocolXss)).toBe(false);
    expect(await control.evaluate(() => window.__pairingProtocolXss)).toBe(false);
    const validation=await viewer.evaluate(value=>({
      badAddress:registerExternalWallet(value,'owner'),
      longOwner:registerExternalWallet(
        'mars1_external_safe','x'.repeat(101)
      ),
      badMemo:marsTransfer(
        Object.keys(marsWallets)[0],
        Object.keys(marsWallets)[0],
        1,
        'x'.repeat(257)
      ),
    }),marker);
    expect(validation.badAddress.ok).toBe(false);
    expect(validation.longOwner.ok).toBe(false);
    expect(validation.badMemo.ok).toBe(false);
  });

  test('reload posts a cached disconnect newer than every normal command', async ({ context }) => {
    test.setTimeout(90000);
    const {viewer,control}=await launchPairedMissionControl(context,6969);
    await control.evaluate(()=>{
      const finalInterval=setInterval(()=>{},1_000_000);
      for(let interval=1;interval<=finalInterval;interval++){
        clearInterval(interval);
      }
    });
    const baseline=await control.evaluate(async()=>{
      await signedSendChain;
      return {
        twinId:CONTROL_TWIN_ID,
        sequence:signedSequence,
        disconnectSequence:preparedDisconnectEnvelope?.sequence,
      };
    });
    expect(baseline.disconnectSequence).toBe(baseline.sequence+1);
    await expect.poll(() => viewer.evaluate(twinId=>
      externalKitedTwinRegistrations.get(twinId)?.sequence
    ,baseline.twinId)).toBe(baseline.sequence);
    const initialSubscriptions=await viewer.evaluate(twinId=>
      [...(externalKitedTwinSubscriptions.get(twinId)||[])].sort()
    ,baseline.twinId);
    expect(initialSubscriptions).toEqual(['echo','state']);
    await viewer.evaluate(twinId=>{
      window.__disconnectRaceMessages=[];
      const listener=new BroadcastChannel(TWIN_CHANNEL_NAME);
      window.__disconnectRaceListener=listener;
      listener.onmessage=event=>{
        if(event.data?.twinId===twinId){
          window.__disconnectRaceMessages.push(
            structuredClone(event.data)
          );
        }
      };
    },baseline.twinId);

    const delayed=await control.evaluate(async()=>{
      await signedSendChain;
      const baseSequence=signedSequence;
      const delayedSequence=baseSequence+2;
      const subtle=crypto.subtle;
      const originalSign=subtle.sign.bind(subtle);
      let markStarted;
      let release;
      const started=new Promise(resolve=>{markStarted=resolve});
      const gate=new Promise(resolve=>{release=resolve});
      window.__releaseDelayedDisconnect=release;
      Object.defineProperty(subtle,'sign',{
        configurable:true,
        value:async(...args)=>{
          const canonical=new TextDecoder().decode(args[2]);
          let signed;
          try{
            signed=JSON.parse(canonical);
          }catch(error){}
          if(signed?.command==='unregister_kited_twin'&&
             signed.sequence===delayedSequence){
            markStarted();
            await gate;
          }
          return originalSign(...args);
        },
      });
      void send('get_state');
      await started;
      return {
        baseSequence,
        delayedSequence,
        controlSequence:signedSequence,
        cachedSequence:preparedDisconnectEnvelope?.sequence,
      };
    });
    expect(delayed.baseSequence).toBe(baseline.sequence);
    expect(delayed.controlSequence).toBe(baseline.sequence);
    expect(delayed.cachedSequence).toBe(baseline.sequence+1);
    expect(delayed.delayedSequence).toBe(baseline.sequence+2);
    await viewer.waitForTimeout(100);
    expect(await viewer.evaluate(twinId=>
      externalKitedTwinRegistrations.get(twinId)?.sequence
    ,baseline.twinId)).toBe(baseline.sequence);

    await control.reload({waitUntil:'domcontentloaded'});
    await expect.poll(() => viewer.evaluate(twinId=>
      window.__disconnectRaceMessages.some(message=>
        message.cmd==='unregister_kited_twin'&&message.twinId===twinId
      )
    ,baseline.twinId)).toBe(true);
    await expect.poll(() => viewer.evaluate(twinId=>
      externalKitedTwinRegistrations.has(twinId)
    ,baseline.twinId)).toBe(false);
    const result=await viewer.evaluate(({twinId,baselineSequence})=>{
      const messages=window.__disconnectRaceMessages.filter(
        message=>message.twinId===twinId
      );
      const disconnect=messages.find(
        message=>message.cmd==='unregister_kited_twin'
      );
      const normalSequences=messages
        .filter(message=>
          message.cmd!=='unregister_kited_twin'&&
          Number.isSafeInteger(message.sequence)
        )
        .map(message=>message.sequence);
      window.__disconnectRaceListener.close();
      return {
        disconnect,
        maxNormalSequence:Math.max(
          baselineSequence,...normalSequences
        ),
        actorPresent:externalKitedTwinRegistrations.has(twinId),
        subscriptionsPresent:
          externalKitedTwinSubscriptions.has(twinId),
      };
    },{
      twinId:baseline.twinId,
      baselineSequence:baseline.sequence,
    });
    expect(result.disconnect.sequence)
      .toBeGreaterThan(result.maxNormalSequence);
    expect(result.disconnect.sequence).toBe(baseline.sequence+1);
    expect(result.actorPresent).toBe(false);
    expect(result.subscriptionsPresent).toBe(false);
    await expect(control.locator('#conn-status'))
      .toContainText('PAIRING REQUIRED', {timeout:10000});
    await expect(control.getByRole('button',{name:'GET STATE'}))
      .toBeDisabled();
    await expect(viewer.locator('.twin-pairing-card')).toBeVisible();
    expect(await control.evaluate(()=>CONTROL_TWIN_ID))
      .not.toBe(baseline.twinId);
  });

  test('reset and either page reload revoke Control until a fresh PIN', async ({ context }) => {
    test.setTimeout(90000);
    const viewer = await context.newPage();
    const control = await context.newPage();
    await viewer.goto('/viewer.html');
    await viewer.evaluate(() => {
      globe = null;
      launchMission(
        'optimus',
        {
          ...MISSIONS.optimus,
          crewList: MISSIONS.optimus.crewList.map(member => ({ ...member })),
          lispyProgram: 'adaptive_governor',
        },
        { seed: 7070, quickStart: true }
      );
      stopSimulationClock();
      clearDecisionTimers(true);
    });
    await control.goto('/control.html');
    await completeVisiblePairing(viewer, control);

    const firstChallenge = await control.evaluate(() => pairedContext.runId);
    await viewer.evaluate(() => {
      launchMission(
        'optimus',
        {
          ...MISSIONS.optimus,
          crewList: MISSIONS.optimus.crewList.map(member => ({ ...member })),
          lispyProgram: 'adaptive_governor',
        },
        { seed: 7071, quickStart: true }
      );
      stopSimulationClock();
      clearDecisionTimers(true);
    });
    await expect(control.locator('#conn-status'))
      .toContainText('PAIRING REQUIRED', { timeout: 10000 });
    await expect(control.getByRole('button', { name: 'GET STATE' }))
      .toBeDisabled();
    await expect(viewer.locator('.twin-pairing-card')).toBeVisible();
    expect(await viewer.evaluate(() =>
      getKitedTwinSemanticSnapshot().filter(actor => !actor.native).length
    )).toBe(0);
    const resetChallenge = await viewer.evaluate(() =>
      [...externalKitedTwinChallenges.values()][0]?.runId
    );
    expect(resetChallenge).not.toBe(firstChallenge);

    await completeVisiblePairing(viewer, control, true);
    const oldControlId = await control.evaluate(() => CONTROL_TWIN_ID);
    await control.waitForFunction(() => preparedDisconnectEnvelope !== null);
    await control.reload();
    await expect(control.locator('#conn-status'))
      .toContainText('PAIRING REQUIRED', { timeout: 10000 });
    await expect(control.getByRole('button', { name: 'GET STATE' }))
      .toBeDisabled();
    await expect(control.locator('#pairing-card')).toBeVisible();
    await expect(viewer.locator('.twin-pairing-card')).toBeVisible();
    expect(await control.evaluate(() => CONTROL_TWIN_ID)).not.toBe(oldControlId);
    await expect.poll(() => viewer.evaluate(id =>
      getKitedTwinSemanticSnapshot().some(actor => actor.id === id)
    , oldControlId)).toBe(false);

    await completeVisiblePairing(viewer, control, true);
    const oldViewerInstance = await control.evaluate(
      () => pairedContext.viewerInstanceId
    );
    await viewer.reload();
    await expect(control.locator('#conn-status'))
      .toContainText('PAIRING REQUIRED', { timeout: 10000 });
    await expect(control.getByRole('button', { name: 'GET STATE' }))
      .toBeDisabled();
    await expect(control.locator('#pairing-card')).toBeVisible();
    await expect(viewer.locator('.twin-pairing-card')).toBeVisible();
    expect(await viewer.evaluate(() => KITED_TWIN_VIEWER_INSTANCE_ID))
      .not.toBe(oldViewerInstance);
  });
});

test.describe('Getting Started tutorial', () => {
  test('guides a new user through the complete application', async ({ page }) => {
    await page.goto('/getting-started.html');

    await expect(page.locator('h1')).toContainText('Your first mission');
    await expect(page.getByRole('link', {name: 'Launch the Viewer'})).toBeVisible();
    await expect(page.getByRole('link', {name: 'Open Mission Control'})).toBeVisible();

    const sectionIds = [
      'ten-minute-path',
      'viewer',
      'kited-twins',
      'pairing',
      'control',
      'tasks',
      'echoes',
      'cartridges',
      'readiness',
      'troubleshooting',
      'glossary',
    ];
    for (const id of sectionIds) {
      await expect(page.locator(`#${id}`)).toBeAttached();
    }

    const text = await page.locator('main').innerText();
    expect(text).toContain('KITE-SCOUT');
    expect(text).toContain('DEPLOY KITED TWIN TEAM');
    expect(text).toContain('CONFIRM MATCH');
    expect(text).toContain('TWIN LINKED');
    expect(text).toContain('P-256');
    expect(text).toContain('Echo frame');
    expect(text).toContain('simulation cartridge');
    expect(text).toContain('Extinction Cascade Observatory');
  });
});

test.describe('Twin telemetry', () => {
  test('Player preserves zero-valued telemetry in RTS', async ({ context }) => {
    test.setTimeout(60000);
    const rts = await context.newPage();
    const player = await context.newPage();
    await rts.goto('/rts.html');
    await player.goto('/player.html');
    await rts.waitForSelector('#pwr-level');
    await rts.waitForFunction(() => window.__rtsTwinChannel !== undefined);

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
