const test=require('node:test');
const assert=require('node:assert/strict');

const {
  MISSIONS,applyPoweredProduction,computeCRI,isRobotCrew,resourceDelta,rng32,
}=require('../tools/run_sim');

test('headless RNG is deterministic and remains in [0, 1)',()=>{
  const first=rng32(42);
  const second=rng32(42);
  for(let index=0;index<10000;index++){
    const a=first();
    assert.equal(a,second());
    assert.ok(a>=0&&a<1,`out of range at ${index}: ${a}`);
  }
});

test('headless robot classification includes OPT, LUN, and explicit bots',()=>{
  assert.equal(isRobotCrew({name:'OPT-01'}),true);
  assert.equal(isRobotCrew({name:'LUN-01'}),true);
  assert.equal(isRobotCrew({name:'Unit-7',bot:true}),true);
  assert.equal(isRobotCrew({name:'Chen W.'}),false);
});

test('Garden and Hybrid match canonical viewer mission starts',()=>{
  assert.deepEqual(
    {
      crew:MISSIONS.garden.crewList.map(member=>isRobotCrew(member)?'robot':'human'),
      resources:[MISSIONS.garden.o2,MISSIONS.garden.h2o,MISSIONS.garden.food,MISSIONS.garden.power],
    },
    {
      crew:['human','human','human','human','human','human'],
      resources:[300,900,900000,1000],
    },
  );
  assert.deepEqual(
    {
      crew:MISSIONS.hybrid.crewList.map(member=>isRobotCrew(member)?'robot':'human'),
      resources:[MISSIONS.hybrid.o2,MISSIONS.hybrid.h2o,MISSIONS.hybrid.food,MISSIONS.hybrid.power],
    },
    {
      crew:['human','human','robot','robot','robot','robot'],
      resources:[50,200,150000,800],
    },
  );
});

test('headless CRI excludes robots from life-support runway',()=>{
  const base={
    o2:20,h2o:40,food:50000,power:500,morale:0.85,s_eff:1,events:[],
    crew:[{name:'Human',alive:true}],
  };
  const withRobots={...base,crew:[
    ...base.crew,
    {name:'OPT-01',alive:true},
    {name:'LUN-01',alive:true},
  ]};
  assert.equal(computeCRI(base,0.15),computeCRI(withRobots,0.15));

  const robotOnly={...base,o2:0,h2o:0,food:0,
    crew:[{name:'OPT-01',alive:true},{name:'LUN-01',alive:true}]};
  assert.equal(computeCRI(robotOnly,0.15),10);
});

test('headless powered production obeys canonical limits',()=>{
  const state={
    o2:0,h2o:0,food:0,power:60,s_eff:0,i_eff:1,g_eff:1,modules:[],
  };
  applyPoweredProduction(state,0,{h:0,i:1,g:0,r:1});
  assert.equal(state.o2,2.5);
  assert.equal(state.h2o,6);
  assert.equal(state.power,30);

  const greenhouse={
    o2:0,h2o:2.5,food:0,power:45,s_eff:0,i_eff:1,g_eff:1,modules:[],
  };
  applyPoweredProduction(greenhouse,0,{h:0,i:0,g:1,r:1});
  assert.equal(greenhouse.food,7500);
  assert.equal(greenhouse.h2o,0);
  assert.equal(greenhouse.power,30);

  const unpowered={
    o2:0,h2o:10,food:0,power:30,s_eff:0,i_eff:1,g_eff:1,modules:[],
  };
  applyPoweredProduction(unpowered,0,{h:0,i:0.5,g:0.5,r:1});
  assert.deepEqual(
    {o2:unpowered.o2,h2o:unpowered.h2o,food:unpowered.food,power:unpowered.power},
    {o2:0,h2o:10,food:0,power:30},
  );
});

test('headless four-resource deltas reconstruct terminal state',()=>{
  const initial={o2:100,h2o:200,food:300000,power:500};
  const states=[
    {o2:99,h2o:198,food:297500,power:520},
    {o2:101,h2o:196,food:300000,power:480},
    {o2:98,h2o:190,food:292500,power:450},
  ];
  let previous=initial;
  const totals={o2:0,h2o:0,food:0,power:0};
  for(const state of states){
    const delta=resourceDelta(previous,state);
    assert.deepEqual(Object.keys(delta).sort(),['food','h2o','o2','power']);
    for(const key of Object.keys(totals))totals[key]+=delta[key];
    previous=state;
  }
  for(const key of Object.keys(totals)){
    assert.equal(initial[key]+totals[key],states[states.length-1][key]);
  }
});
