/* Teaching fixtures and deterministic checks. No network, DOM or project-file writes. */
(function (root) {
  "use strict";
  const nodes = { A:[0,0], B:[80,0], C:[160,0], D:[0,100], E:[80,100], F:[160,100], G:[80,18] };
  const features = [
    {id:"AB",a:"A",b:"B",kind:"street",walk:true}, {id:"BC",a:"B",b:"C",kind:"street",walk:true},
    {id:"DE",a:"D",b:"E",kind:"street",walk:true}, {id:"EF",a:"E",b:"F",kind:"street",walk:true},
    {id:"CF",a:"C",b:"F",kind:"path",walk:true}, {id:"GE",a:"G",b:"E",kind:"path",walk:true},
    {id:"AD",a:"A",b:"D",kind:"highway",walk:false}
  ];
  const graph = { A:[0,60], B:[70,60], C:[140,60], D:[0,0], E:[70,0], F:[140,0] };
  const roads = ["AB","BC","AD","DE","EF","CF","BE"].map(id=>({id,a:id[0],b:id[1]}));
  const distance = (a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  function pathsForGraph() {
    const paths=[]; const keys=Object.keys(graph);
    for(let i=0;i<keys.length;i++) for(let j=i+1;j<keys.length;j++) {
      const start=keys[i], end=keys[j];
      function walk(at, trail, edges) {
        if(at===end) {
          let length=0,turn=0;
          for(let k=1;k<trail.length;k++) {
            const a=graph[trail[k-1]],b=graph[trail[k]];length+=distance(a,b);
            if(k>1) {const p=graph[trail[k-2]],u=[a[0]-p[0],a[1]-p[1]],v=[b[0]-a[0],b[1]-a[1]];
              turn+=Math.acos(Math.max(-1,Math.min(1,(u[0]*v[0]+u[1]*v[1])/(Math.hypot(...u)*Math.hypot(...v)))))*180/Math.PI;}
          }
          paths.push({pair:start+end,nodes:trail,edges,length,turn});return;
        }
        for(const e of roads) {const next=e.a===at?e.b:e.b===at?e.a:null;if(next&&!trail.includes(next))walk(next,[...trail,next],[...edges,e.id]);}
      }
      walk(start,[start],[]);
    }
    return paths;
  }
  const networkInput={nodes,features,gap:{id:"BG",a:"B",b:"G",length:18},note:"Practice evidence: a site check confirms this 18 m gap is walkable. This is an invented exercise."};
  const routeInput={nodes:graph,edges:roads,paths:pathsForGraph()};
  const worldInput={origin:[299180,5038120],buildings:[
    {id:"B1",e:299190,n:5038130,width:24,depth:18,height_m:12,storeys:4},
    {id:"B2",e:299230,n:5038130,width:18,depth:24,height_m:null,storeys:3},
    {id:"B3",e:299190,n:5038170,width:25,depth:20,height_m:null,storeys:null},
    {id:"B4",e:299230,n:5038170,width:20,depth:20,height_m:20,storeys:6}],
    objects:[{record:"city-1",physical_id:"lamp-1",e:299185,n:5038125},{record:"photo-1",physical_id:"lamp-1",e:299185,n:5038125},{record:"city-2",physical_id:"tree-1",e:299222,n:5038160}]};
  const solutionNetwork=`// filter keeps records that pass a condition.
const includePaths = true;
const maxGap = 25;          // metres, not degrees
const checkedGap = true;   // evidence, not just proximity

const edges = input.features.filter(f =>
  f.walk && (includePaths || f.kind !== "path")
);
if (checkedGap && input.gap.length <= maxGap) {
  edges.push({ ...input.gap, kind: "connector", walk: true });
}
return { edges, maxGap, checkedGap };`;
  const solutionRoutes=`const mode = "angular"; // try "metric" as a comparison
const radius = 220;      // maximum route length, metres
const scores = Object.fromEntries(input.edges.map(e => [e.id, 0]));
const pairs = [...new Set(input.paths.map(p => p.pair))];
let eligiblePairs = 0;
for (const pair of pairs) {
  const candidates = input.paths.filter(p =>
    p.pair === pair && p.length <= radius
  );
  if (!candidates.length) continue;
  eligiblePairs++;
  const cost = p => mode === "angular" ? p.turn : p.length;
  const best = Math.min(...candidates.map(cost));
  const winners = candidates.filter(p => Math.abs(cost(p) - best) < 0.000001);
  // Tied routes share this pair's contribution.
  for (const path of winners) {
    for (const edge of path.edges) scores[edge] += 1 / winners.length;
  }
}
return { scores, mode, radius, eligiblePairs };`;
  const solutionWorld=`const unitsPerMetre = 100; // centimetres in this exercise
const metresPerStorey = 3; // an assumption, recorded below
const position = row => [
  (row.e - input.origin[0]) * unitsPerMetre,
  -(row.n - input.origin[1]) * unitsPerMetre
];
const buildings = input.buildings.map(b => {
  const height = b.height_m ??
    (b.storeys == null ? null : b.storeys * metresPerStorey);
  return { id: b.id, xy: position(b), height,
    height_cm: height == null ? null : height * unitsPerMetre,
    basis: b.height_m != null ? "measured" :
      b.storeys != null ? "assumed" : "unknown" };
});
// Two records can describe one physical object.
const unique = [...new Map(input.objects.map(o => [o.physical_id, o])).values()];
const objects = unique.map(o => ({ id: o.physical_id, xy: position(o) }));
return { buildings, objects, unitsPerMetre };`;
  const lessons=[
    {id:"network",title:"Make the connections",tag:"01 / ROAD NETWORK",skill:"Filter · conditions · evidence",minutes:"10–15 minutes",input:networkInput,
      question:"Which line belongs in a walking network?",brief:"Two rows of streets are disconnected. Bring in the footpaths and bridge the checked 18 m gap, while keeping the highway out.",
      prediction:"Before running: will raising a distance limit alone prove that a connection is walkable?",
      choices:["Yes: nearby endpoints always connect.","No: distance finds a candidate; evidence decides.","Yes, if the map looks connected."],answer:1,
      task:"Include both paths. Allow the checked 18 m connector with a 25 m limit. Keep the highway out.",
      starter:solutionNetwork.replace('includePaths = true','includePaths = false').replace('maxGap = 25','maxGap = 15').replace('checkedGap = true','checkedGap = false'),solution:solutionNetwork,
      hints:["The three settings at the top are the first things to change. true and false are Boolean values.","includePaths controls the filter; maxGap controls distance; checkedGap records whether evidence supports the join.","A crossing is not automatically a junction: bridges and tunnels need level information. This tiny exercise only joins explicitly named endpoints."],
      bridge:"In SITU, a 15 m general limit and a 25 m checked-area limit are decisions tied to the evidence. Do not copy those distances into another city without checking. Split a real street where a supported connector lands mid-line; this fixture already has explicit nodes.",links:[["SITU's walking network","network.html"],["S1 construction","s1-build.html"],["Keep a provenance trail","provenance.html"]],
      reflection:"For your own archive, what evidence would make you accept or reject a proposed connection?",badge:"Network builder"},
    {id:"routes",title:"Change the meaning of near",tag:"02 / ROUTE ANALYSIS",skill:"Loops · costs · tied paths",minutes:"15–20 minutes",input:routeInput,
      question:"Shortest in metres—or fewest turns?",brief:"The same network can favour different routes. Compare distance with angular change, then inspect which edges share the most best routes.",
      prediction:"If a street has a high route-choice score, what can you conclude?",
      choices:["Many people must walk there.","It has the most shops.","It lies on many modelled best routes under these settings."],answer:2,
      task:"Run metric first. Then change mode to angular and radius to 220. Inspect the edge counts before claiming anything about people.",
      starter:solutionRoutes.replace('mode = "angular"','mode = "metric"').replace('radius = 220','radius = 120'),solution:solutionRoutes,
      hints:["mode chooses the cost: length in metres or accumulated turning angle in degrees.","The radius here is a cap on complete route length. Some origin–destination pairs disappear when it shrinks.","When several best paths tie, each gets 1 / winners.length. Counting every tied path as a whole would inflate the result."],
      bridge:"This is a teaching model of edge betweenness between junction pairs, using exhaustive simple paths. It is not segment-based NACH or NAIN, and its radius rule is not a reproduction of PlanX. SITU's real segment workflow uses PlanX, its own radius handling, a surrounding network and recorded versions. Counts here do not predict observed movement.",links:[["What space syntax measures","space-syntax.html"],["S2 construction","s2-build.html"],["Compare with observation","s9-observer.html"]],
      reflection:"Which modelling choice changed your interpretation, and what observation would you need before making a claim about people?",badge:"Route investigator"},
    {id:"world",title:"Place data in a world",tag:"03 / DATA TO 3D",skill:"Coordinates · null · deduplication",minutes:"10–15 minutes",input:worldInput,
      question:"What should happen when a height is missing?",brief:"Translate projected coordinates into a local scene. Keep measured and assumed heights distinct, leave one building's height unknown, and place each physical object once.",
      prediction:"A building has neither height nor storeys. What does the archive support?",
      choices:["A zero-height building.","An unknown height, visible as a gap.","The neighbourhood's average as a measured value."],answer:1,
      task:"Use 100 units per metre. Replace the missing-height fallback with null. Keep the storey estimate labelled assumed.",
      starter:solutionWorld.replace('unitsPerMetre = 100','unitsPerMetre = 1').replace('b.storeys == null ? null','b.storeys == null ? 0'),solution:solutionWorld,
      hints:["The projected origin is subtracted before scaling. Do not put longitude and latitude directly into this metre-based formula.","null means unknown; 0 is a numerical claim. The ?? operator only falls back for null or undefined.","Here positive north becomes negative scene Y. This is an explicit teaching convention; test axis, origin, rotation and scale in your own engine."],
      bridge:"The preview is an isometric SVG drawing of your returned coordinates and heights, not an Unreal import. SITU's G1 records the origin, units, height basis and deduplication decisions. A real model also needs footprint orientation, terrain, pivots and an engine check. Unknown opening hours still do not imply an NPC visitation rule.",links:[["G1 World","g1-world.html"],["Build the game in stages","game.html"],["Portable file formats","formats.html"]],
      reflection:"Which parts of your scene would be measured, assumed or missing? How will another person tell them apart?",badge:"World translator"}
  ];
  function expected(id) {const l=lessons.find(x=>x.id===id);return Function('input',l.solution)(JSON.parse(JSON.stringify(l.input)));}
  function checks(id,result) {
    if(!result||typeof result!=="object")throw Error("Return an object, as shown in the starter code.");
    const want=expected(id),near=(a,b)=>typeof a==="number"&&Number.isFinite(a)&&Math.abs(a-b)<1e-6;
    if(id==="network") {
      if(!Array.isArray(result.edges)||result.edges.length>40)throw Error("Return edges as an array of at most 40 records.");
      if(result.edges.some(e=>!e||!nodes[e.a]||!nodes[e.b]))throw Error("An edge needs known a and b node names.");
      const ids=result.edges.map(e=>e.id);
      const geometry = result.edges.every(e => want.edges.some(w => w.id===e.id && w.a===e.a && w.b===e.b && w.kind===e.kind));
      return [["Both footpaths included",ids.includes("CF")&&ids.includes("GE")],["Checked connector within the exercise limit",ids.includes("BG")&&result.checkedGap===true&&result.maxGap===25],["No highway or duplicate edges",!ids.includes("AD")&&new Set(ids).size===ids.length],["Expected walking edges retained",geometry&&JSON.stringify([...ids].sort())===JSON.stringify(want.edges.map(e=>e.id).sort())]];
    }
    if(id==="routes") {
      if(!result.scores||roads.some(e=>typeof result.scores[e.id]!=="number"||!Number.isFinite(result.scores[e.id])||result.scores[e.id]<0)||!Number.isFinite(result.radius))throw Error("Return finite, non-negative scores for every edge and a finite radius.");
      return [["Angular cost selected",result.mode==="angular"],["220 m teaching radius",result.radius===220],["Tied routes counted fractionally",roads.every(e=>near(result.scores[e.id],want.scores[e.id]))],["Eligible pairs recorded",result.eligiblePairs===want.eligiblePairs]];
    }
    if(!Array.isArray(result.buildings)||!Array.isArray(result.objects)||result.buildings.length>20||result.objects.length>20)throw Error("Return buildings and objects as small arrays.");
    if([...result.buildings,...result.objects].some(b=>!b||!Array.isArray(b.xy)||b.xy.length!==2||b.xy.some(v=>!Number.isFinite(v))))throw Error("Each item needs two finite xy coordinates.");
    if(result.buildings.some(b=>!worldInput.buildings.some(w=>w.id===b.id)||(b.height!==null&&(!Number.isFinite(b.height)||b.height<0||b.height>100))))throw Error("Use the fixture's building IDs and heights from 0 to 100 m, or null.");
    if(new Set(result.buildings.map(b=>b.id)).size!==result.buildings.length)throw Error("Each building ID must occur once.");
    if(result.buildings.some(b=>b.height_cm!==null&&(!Number.isFinite(b.height_cm)||b.height_cm<0||b.height_cm>10000)))throw Error("Return height_cm between 0 and 10000, or null for unknown.");
    const by=Object.fromEntries(result.buildings.map(b=>[b.id,b]));
    return [["Local coordinates and centimetres",result.unitsPerMetre===100&&want.buildings.every(b=>by[b.id]&&b.xy.every((v,i)=>near(v,by[b.id].xy[i])))],["Unknown stays unknown",by.B3?.height===null&&by.B3?.height_cm===null&&by.B3?.basis==="unknown"],["Height evidence and scale preserved",want.buildings.every(b=>by[b.id]&&by[b.id].basis===b.basis&&(b.height===null?by[b.id].height===null:near(by[b.id].height,b.height)&&near(by[b.id].height_cm,b.height_cm)))],["One placement per physical object",result.objects.length===2&&want.objects.every(o=>result.objects.some(x=>x.id===o.id&&o.xy.every((v,i)=>near(v,x.xy[i]))))]];
  }
  const api={lessons,checks,expected}; root.SituWorkshop=api;if(typeof module!=="undefined")module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:this);
