"use strict";
// A fresh worker per run keeps a loop in an exercise from blocking the page.
self.onmessage = event => {
  try {
    const {code,input}=event.data;
    if(typeof code!=="string"||code.length>30000)throw Error("Keep this exercise under 30,000 characters.");
    const result=Function("input",'"use strict";\n'+code)(input);
    const json=JSON.stringify(result);
    if(!json||json.length>100000)throw Error("Return a small result object (under 100 KB).");
    self.postMessage({ok:true,result:JSON.parse(json)});
  } catch(error) {self.postMessage({ok:false,error:String(error.message||error).slice(0,1000)});}
};
