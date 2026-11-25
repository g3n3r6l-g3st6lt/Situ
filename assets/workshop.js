/* Visual exercises, local notebook, short editable JavaScript challenges. */
(() => {
  "use strict";
  const {lessons,checks}=window.SituWorkshop,root=document.getElementById("situ-workshop");
  if(!root)return;
  const $=id=>document.getElementById(id),key="situ-workshop-v1";
  const el=(tag,attrs={},...children)=>{const n=document.createElement(tag);for(const [k,v] of Object.entries(attrs)){if(k.startsWith("on"))n.addEventListener(k.slice(2),v);else if(k==="class")n.className=v;else n.setAttribute(k,v);}for(const c of children.flat())if(c!=null)n.append(typeof c==="string"?document.createTextNode(c):c);return n;};
  const button=(label,fn,cls="")=>el("button",{type:"button",class:cls,onclick:fn},label);
  let state={version:1,lessons:{}},current=0,worker=null,timer=null,serial=0,output=null,passed=false;
  function clean(value) {
    if(!value||value.version!==1||!value.lessons||typeof value.lessons!=="object")throw Error("Choose a version 1 SITU Workshop notebook.");
    const out={version:1,lessons:{}};
    for(const l of lessons) {const x=value.lessons[l.id];if(x&&typeof x==="object")out.lessons[l.id]={code:typeof x.code==="string"?x.code.slice(0,30000):l.starter,reflection:typeof x.reflection==="string"?x.reflection.slice(0,3000):"",choice:Number.isInteger(x.choice)&&x.choice>=0&&x.choice<l.choices.length?x.choice:null,hints:Math.min(3,Math.max(0,Number(x.hints)||0)),solution:!!x.solution,complete:!!x.complete};}
    return out;
  }
  try {const saved=localStorage.getItem(key);if(saved)state=clean(JSON.parse(saved));}catch {$("sw-storage").textContent="Saved progress could not be loaded. You can still use and export this session.";}
  const entry=l=>state.lessons[l.id]||(state.lessons[l.id]={code:l.starter,reflection:"",choice:null,hints:0,solution:false,complete:false});
  function save(){try{localStorage.setItem(key,JSON.stringify(state));$("sw-storage").textContent="Saved on this browser. Export for a portable copy.";}catch{$("sw-storage").textContent="Browser storage is unavailable. Export your notebook before leaving.";}}
  function progress(){const count=lessons.filter(l=>entry(l).complete).length;$("sw-progress").textContent=`${count} / ${lessons.length} checkpoints recorded`;
    $("sw-lessons").replaceChildren(...lessons.map((l,i)=>button(`${String(i+1).padStart(2,"0")} ${l.title}${entry(l).complete?" ✓":""}`,()=>{current=i;render();},i===current?"sw-selected":"")));
    $("sw-lessons").children[current].setAttribute("aria-current","step");}
  function stop(){serial++;if(worker)worker.terminate();worker=null;clearTimeout(timer);}
  const svg=(tag,attrs={},text)=>{const n=document.createElementNS("http://www.w3.org/2000/svg",tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text)n.textContent=text;return n;};
  function draw(l,result,before=false){
    const view=svg("svg",{viewBox:"0 0 560 340",role:"img","aria-label":l.id==="world"?"Isometric preview: measured, assumed and unknown building heights":"Practice network with labelled nodes and selected edges"});
    const caption=svg("text",{x:24,y:28,class:"sw-map-note"},before||!result?"SOURCE / PRACTICE DATA":"YOUR RESULT / PRACTICE DATA");view.append(caption);
    if(l.id!=="world"){
      const input=l.input,xy=p=>[65+p[0]*2.6,75+p[1]*1.9],edge=(e,attrs)=>{const a=xy(input.nodes[e.a]),b=xy(input.nodes[e.b]);view.append(svg("line",{x1:a[0],y1:a[1],x2:b[0],y2:b[1],...attrs}));};
      for(const e of input.features||input.edges)edge(e,{stroke:e.kind==="highway"?"#a55":"#414951","stroke-width":3,"stroke-dasharray":e.kind==="path"||e.kind==="highway"?"6 5":"none"});
      if(l.id==="network"){
        if(result&&!before)for(const e of result.edges)edge(e,{stroke:e.id==="BG"?"#fe83cc":"#4fd1ff","stroke-width":6,"stroke-linecap":"round"});
        const a=xy(input.nodes.B),b=xy(input.nodes.G);view.append(svg("text",{x:a[0]+12,y:(a[1]+b[1])/2+4,class:"sw-map-note"},"18 m gap"));
      }else if(result&&!before){
        const max=Math.max(1,...Object.values(result.scores));for(const e of input.edges){const score=result.scores[e.id];edge(e,{stroke:"#4fd1ff","stroke-width":2+score/max*10});const a=xy(input.nodes[e.a]),b=xy(input.nodes[e.b]);view.append(svg("text",{x:(a[0]+b[0])/2+9,y:(a[1]+b[1])/2-10,class:"sw-value"},score.toFixed(2)));}
      }
      for(const [name,p]of Object.entries(input.nodes)){const [x,y]=xy(p);view.append(svg("circle",{cx:x,cy:y,r:6,fill:"#0b1116",stroke:"#eee","stroke-width":2}),svg("text",{x:x-6,y:y-14,class:"sw-node"},name));}
    }else{
      const project=(x,y,z=0)=>[280+(x+y)*2.1,245+(x-y)*0.9-z*3];
      const polygon=(pts,attrs)=>svg("polygon",{points:pts.map(p=>p.join(",")).join(" "),...attrs});
      for(let n=-10;n<=90;n+=10){for(const line of [[project(n,-80),project(n,10)],[project(-10,-n),project(90,-n)]])view.append(svg("line",{x1:line[0][0],y1:line[0][1],x2:line[1][0],y2:line[1][1],stroke:"#253039"}));}
      for(const b of l.input.buildings){const r=result&&!before?result.buildings.find(x=>x.id===b.id):null;
        const x=r?r.xy[0]/100:b.e-l.input.origin[0],y=r?r.xy[1]/100:-(b.n-l.input.origin[1]);
        const h=r?r.height_cm==null?null:r.height_cm/100:0,basis=r?r.basis:"footprint",colour=basis==="measured"?"#4fd1ff":basis==="assumed"?"#fe83cc":"#a3abb1";
        const ground=[[x,y],[x+b.width,y],[x+b.width,y-b.depth],[x,y-b.depth]].map(p=>project(...p));
        const top=[[x,y],[x+b.width,y],[x+b.width,y-b.depth],[x,y-b.depth]].map(p=>project(...p,h||0));
        if(h>0){view.append(polygon([ground[0],ground[1],top[1],top[0]],{fill:colour,"fill-opacity":0.2,stroke:colour}),polygon([ground[1],ground[2],top[2],top[1]],{fill:colour,"fill-opacity":0.35,stroke:colour}));}
        view.append(polygon(top,{fill:colour,"fill-opacity":h==null?0.03:0.12,stroke:colour,"stroke-dasharray":h==null?"5 4":"none"}));
        view.append(svg("text",{x:top[0][0],y:top[0][1]-8,class:"sw-node"},`${b.id} · ${h==null?"?":Math.round(h*100)/100+" m"}`));
      }
      if(result&&!before)for(const o of result.objects){const [x,y]=project(o.xy[0]/100,o.xy[1]/100);view.append(svg("circle",{cx:x,cy:y,r:4,fill:"#2ec4b6"}),svg("text",{x:x+6,y:y+10,class:"sw-map-note"},o.id));}
    }
    return view;
  }
  function resultTable(l,r){const rows=l.id==="network"?r.edges.map(e=>[e.id,`${e.a} → ${e.b}`,e.kind]):l.id==="routes"?Object.entries(r.scores).map(([id,n])=>[id,n.toFixed(3),"fractional best-route count"]):r.buildings.map(b=>[b.id,b.height===null?"unknown":`${b.height} m`,b.basis]);
    return el("table",{class:"sw-table"},el("caption",{},"Accessible result table"),el("thead",{},el("tr",{},["Record","Value / connection","Meaning"].map(x=>el("th",{scope:"col"},x)))),el("tbody",{},rows.map(row=>el("tr",{},row.map(x=>el("td",{},String(x)))))));}
  function render(){
    stop();output=null;passed=false;progress();const l=lessons[current],s=entry(l);let before=false;
    const message=el("p",{role:"status",class:"sw-run-status"},"Start by running the starter code. Its failing checks are part of the exercise.");
    const visual=el("div",{class:"sw-visual"},draw(l,null)),table=el("div"),checklist=el("ul",{class:"sw-checks","aria-label":"Result checks"}),decision=el("p",{role:"status"});
    const editor=el("textarea",{id:"sw-code",class:"sw-code",spellcheck:"false","aria-label":"JavaScript exercise code",rows:18});editor.value=s.code;
    const note=el("textarea",{id:"sw-reflection",rows:3,maxlength:3000,placeholder:"A few sentences in your own words…"});note.value=s.reflection;
    const completion=button(s.complete?"Checkpoint recorded ✓":"Record this checkpoint",()=>{
      if(!passed){decision.textContent="Run your current code and pass the result checks first.";return;}
      if(s.choice!==l.answer){decision.textContent="Revisit the prediction. A working script also needs a sound interpretation.";return;}
      if(s.reflection.trim().length<20){decision.textContent="Add a short reflection (at least 20 characters). This is your own research note, not an automatically graded answer.";return;}
      s.complete=true;save();progress();completion.textContent="Checkpoint recorded ✓";decision.textContent=`${l.badge}: working code, interpretation and a reflection recorded${s.solution?" with the worked example":""}. Your reflection is self-assessed.`;
    },"sw-primary");
    function invalidate(){stop();passed=false;s.complete=false;completion.textContent="Record this checkpoint";run.disabled=false;checklist.replaceChildren();message.textContent="Code changed. Run again to update the preview and checks.";output=null;visual.replaceChildren(draw(l,null));table.replaceChildren();progress();}
    editor.addEventListener("input",()=>{s.code=editor.value;invalidate();save();});
    note.addEventListener("input",()=>{s.reflection=note.value;s.complete=false;completion.textContent="Record this checkpoint";save();progress();});
    const choices=el("fieldset",{class:"sw-prediction"},el("legend",{},l.prediction));
    l.choices.forEach((label,i)=>{const radio=el("input",{type:"radio",name:"sw-choice",value:i});radio.checked=s.choice===i;radio.addEventListener("change",()=>{s.choice=i;s.complete=false;completion.textContent="Record this checkpoint";save();progress();decision.textContent=i===l.answer?"That interpretation is supported. Try the code and see what changes.":"Look again at what the data and model can actually establish.";});choices.append(el("label",{},radio,el("span",{},label)));});
    function showResult(r){const c=checks(l.id,r);output=r;passed=c.every(x=>x[1]);visual.replaceChildren(draw(l,r,before));table.replaceChildren(resultTable(l,r));checklist.replaceChildren(...c.map(([label,ok])=>el("li",{class:ok?"sw-pass":"sw-fail"},`${ok?"✓":"○"} ${label}`)));message.textContent=passed?"All result checks pass. Record your interpretation and reflection below.":"The code ran. The open checks show what to change next.";}
    const run=button("Run experiment",()=>{
      stop();passed=false;s.complete=false;completion.textContent="Record this checkpoint";save();progress();const token=serial;run.disabled=true;message.textContent="Running your code…";
      try{worker=new Worker("assets/workshop-runner.js");
        const fail=text=>{if(token!==serial)return;stop();run.disabled=false;message.textContent=text;checklist.replaceChildren();};
        worker.onmessage=e=>{if(token!==serial)return;clearTimeout(timer);worker.terminate();worker=null;run.disabled=false;if(!e.data.ok){message.textContent=`Code needs a change: ${e.data.error}`;return;}try{showResult(e.data.result);}catch(err){message.textContent=`Check the returned data: ${err.message}`;}};
        worker.onerror=()=>fail("The browser could not run this worker. Serve the workshop over HTTP and check that its assets are available.");
        timer=setTimeout(()=>fail("Stopped after 3 seconds. Look for a loop that never ends, then run again."),3000);
        worker.postMessage({code:editor.value,input:l.input});
      }catch(err){run.disabled=false;message.textContent=`Could not start: ${err.message}`;}
    },"sw-primary");
    const hintBox=el("ol",{class:"sw-hints"});const showHints=()=>hintBox.replaceChildren(...l.hints.slice(0,s.hints).map(t=>el("li",{},t)));showHints();
    const hint=button("Give me a hint",()=>{s.hints=Math.min(l.hints.length,s.hints+1);showHints();save();});
    const solution=button("Load worked example",()=>{s.solution=true;s.code=l.solution;editor.value=s.code;invalidate();save();message.textContent="Worked example loaded. Run it, then change a setting to understand what it does.";});
    const reset=button("Restore starter",()=>{s.code=l.starter;editor.value=s.code;invalidate();save();});
    const toggle=button("Show source",()=>{before=!before;toggle.textContent=before?"Show my result":"Show source";visual.replaceChildren(draw(l,output,before));});
    const download=button("Download code + practice data",()=>downloadFile(`situ-${l.id}.json`,{lesson:l.id,code:s.code,input:l.input,note:"Synthetic teaching fixture, not Griffintown observations. JavaScript function body expects input."}));
    $("sw-stage").replaceChildren(
      el("header",{class:"sw-lesson-head"},el("p",{class:"sw-kicker"},`${l.tag} · ${l.minutes}`),el("h2",{},l.question),el("p",{},l.brief),el("p",{class:"sw-muted"},l.skill)),
      el("div",{class:"sw-grid"},el("section",{class:"sw-panel"},el("div",{class:"sw-panel-head"},el("h3",{},"01 / See the system"),toggle),visual,el("p",{class:"sw-legend"},l.id==="world"?"Blue: measured · pink: assumed · dashed: unknown · green: placed objects":l.id==="network"?"Blue: retained edges · pink: checked connector · grey: source lines · red dashes: highway":"Line width: fractional best-route count · labels: your computed values"),el("details",{},el("summary",{},"Inspect the practice data"),el("pre",{},JSON.stringify(l.input,null,2))),table),
        el("section",{class:"sw-panel"},el("h3",{},"02 / Change the code"),el("p",{class:"sw-task"},l.task),el("label",{for:"sw-code",class:"sw-muted"},"JavaScript · input is supplied by the exercise"),editor,el("div",{class:"sw-actions"},run,hint),message,checklist,hintBox,el("details",{},el("summary",{},"Worked example and files"),el("p",{},"Use the example freely. A checkpoint records that you used it; this is practice, not an exam."),el("div",{class:"sw-actions"},solution,reset,download)))),
      el("section",{class:"sw-reflect"},el("h3",{},"03 / Explain the result"),choices,el("label",{for:"sw-reflection"},l.reflection),note,el("div",{class:"sw-actions"},completion),decision),
      el("section",{class:"sw-transfer"},el("h3",{},"From this exercise to a real archive"),el("p",{},l.bridge),el("div",{class:"sw-links"},l.links.map(([name,url])=>el("a",{href:url},name+" ↗")))));
  }
  function downloadFile(name,data){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));const a=el("a",{href:url,download:name});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  $("sw-export").addEventListener("click",()=>downloadFile("situ-workshop-notebook.json",{...state,exported:new Date().toISOString(),note:"Completion is a local learning record, not certification."}));
  $("sw-import").addEventListener("change",async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>200000)throw Error("Notebook is too large (maximum 200 KB).");const imported=clean(JSON.parse(await file.text()));if(!confirm("Replace this browser's workshop notebook with the imported copy?"))return;state=imported;save();render();$("sw-storage").textContent="Notebook imported. Re-run code to verify it against the current exercises.";}catch(err){$("sw-storage").textContent=`Import not applied: ${err.message}`;}finally{e.target.value="";}});
  $("sw-clear").addEventListener("click",()=>{if(!confirm("Clear your code, reflections and checkpoints on this browser? Export first if you want to keep them."))return;state={version:1,lessons:{}};save();render();});
  window.addEventListener("pagehide",stop);render();
})();
