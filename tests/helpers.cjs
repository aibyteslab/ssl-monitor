const fs=require('node:fs');
const path=require('node:path');
const workflow=JSON.parse(fs.readFileSync(path.join(__dirname,'..','ssl-monitor.json'),'utf8'));
const code=name=>workflow.nodes.find(n=>n.name===name).parameters.jsCode;
const inputOf=items=>({all:()=>items,first:()=>items[0]});
const run=(name,items)=>new Function('$input',code(name))(inputOf(items));
const fixture={domain:'expired.badssl.com',status:'EXPIRED',severity:'critical',daysRemaining:-1,
  validFrom:'2025-01-01',validTo:'2026-10-17',checkedAt:'2026-10-18',trustReason:'CERTIFICATE_EXPIRED',owner:'Test owner',issuer:'Test CA'};
const evidenceKeys=['domain','status','severity','daysRemaining','validTo','trustReason'];
const evidenceOf=f=>Object.fromEntries(evidenceKeys.map(key=>[key,f[key]??null]));
function context(results=[fixture]) {
 const agg=run('Aggregate All Results',results.map(json=>({json})))[0].json;
 const request=run('Build Mistral Request Body',[{json:agg}])[0].json;
 return {agg,request};
}
function planOf(request) {
 return {issues:request.policy.issues.map(p=>({findingId:p.findingId,evidence:{...p.evidence},actionIds:[...p.allowedActionIds]}))
  .sort((a,b)=>(a.evidence.severity==='critical'?0:1)-(b.evidence.severity==='critical'?0:1)),preventionIds:['renewal','coverage']};
}
function render(context,plan,finish='stop',rawOverride) {
 const response=plan===undefined ? {error:'Mock HTTP failure'} : {choices:[{finish_reason:finish,message:{content:rawOverride??JSON.stringify(plan)}}]};
 return new Function('$','$input',code('Build Email HTML'))(name=>({first:()=>({json:name==='Aggregate All Results'?context.agg:context.request})}),inputOf([{json:response}]))[0].json;
}
module.exports={workflow,code,inputOf,run,fixture,evidenceOf,context,planOf,render};
