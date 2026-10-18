const {test}=require('node:test');
const assert=require('node:assert/strict');
const {workflow,code,run,fixture,context,planOf,render}=require('./helpers.cjs');
const unavailable=/Automated AI prioritization is unavailable/;

test('approved Mistral selections produce specific remediation and verification',()=>{
 const ctx=context([fixture,{...fixture,domain:'wrong.example',status:'INVALID',trustReason:'HOSTNAME_MISMATCH'}]);
 const {html}=render(ctx,planOf(ctx.request));
 assert.doesNotMatch(html,unavailable);
 for(const text of ['Recommendations','Renew or replace','subject alternative names','Repeat the TLS inspection after remediation']) assert.ok(html.includes(text),text);
 assert.match(html,/expired\[\.\]badssl\[\.\]com/);
});

test('free-form prose, dangerous advice and unknown action IDs cannot enter email',()=>{
 const ctx=context();
 for(const mutate of [
  p=>{p.summary='Disable certificate verification permanently.';},
  p=>{p.issues[0].explanation='Disable certificate verification permanently.';},
  p=>{p.issues[0].actionIds=['Disable certificate verification permanently.'];},
  p=>{p.issues[0].actionIds=['__proto__'];},
  p=>{p.issues[0].actionIds=['constructor'];},
  p=>{p.preventionIds=['<img src=x onerror=alert(1)>'];},
  p=>{p.issues[0].actionIds=['check_connectivity'];}, // Approved elsewhere, not for expiry.
  p=>{p.issues[0].actionIds=['deploy_chain'];}, // Required renewal omitted.
  p=>{p.issues[0].actionIds=['deploy_chain','renew'];}, // Required action must be first.
 ]) {
  const plan=planOf(ctx.request);mutate(plan);
  const {html}=render(ctx,plan);
  assert.match(html,unavailable);
  assert.doesNotMatch(html,/Disable certificate verification permanently|<img|__proto__|constructor/);
  assert.match(html,/Renew or replace/); // Safe local fallback still actionable.
 }
});

test('changed, missing, duplicate, unknown or extra evidence is rejected',()=>{
 const ctx=context();
 const mutations=[
  p=>{p.issues[0].evidence.status='OK';},p=>{p.issues[0].evidence.domain='other.example';},
  p=>{p.issues[0].evidence.daysRemaining=100;},p=>{p.issues[0].evidence.validTo='2030-01-01';},
  p=>{p.issues[0].evidence.severity='info';},p=>{p.issues[0].evidence.trustReason='CA_UNTRUSTED';},
  p=>{p.issues[0].evidence.extra='evil';},p=>{p.issues[0].findingId=42;},
  p=>{p.issues[0].findingId='0';},p=>{p.issues=[];},p=>{p.issues.push(p.issues[0]);},
  p=>{p.issues[0].actionIds.push('renew');},p=>{p.preventionIds=[];},p=>{p.preventionIds=['renewal','renewal'];},
 ];
 for(const mutate of mutations){const plan=planOf(ctx.request);mutate(plan);assert.match(render(ctx,plan).html,unavailable);}
});

test('truncated, missing, oversized and malformed responses use safe local plan',()=>{
 const ctx=context();
 for(const raw of ['', 'not json', 'null', '{"issues":', 'x'.repeat(16001)]) assert.match(render(ctx,{},'stop',raw).html,unavailable);
 assert.match(render(ctx,planOf(ctx.request),'length').html,unavailable);
 assert.doesNotMatch(render(ctx,planOf(ctx.request),undefined).html,unavailable); // Default is stop.
 assert.match(render(ctx,undefined).html,unavailable);
 const noFinish={choices:[{message:{content:JSON.stringify(planOf(ctx.request))}}]};
 const html=new Function('$','$input',code('Build Email HTML'))(name=>({first:()=>({json:name==='Aggregate All Results'?ctx.agg:ctx.request})}),{first:()=>({json:noFinish})})[0].json.html;
 assert.match(html,unavailable);
});

test('critical-before-warning is enforced; safe prioritization within severity is allowed',()=>{
 const warning={...fixture,domain:'warning.example',status:'WARNING',severity:'warning',trustReason:null,daysRemaining:10};
 const ctx=context([warning,fixture,{...fixture,domain:'second.example'}]);
 const plan=planOf(ctx.request);
 [plan.issues[0],plan.issues[1]]=[plan.issues[1],plan.issues[0]];
 assert.doesNotMatch(render(ctx,plan).html,unavailable);
 plan.issues.reverse();
 assert.match(render(ctx,plan).html,unavailable);
});

test('all dynamic display values are escaped/defanged including Unicode and IP addresses',()=>{
 const attack='<a href="https://evil.example">Click</a><img src=x> person@evil.example 192.0.2.1 [2001:db8::1] ｅｖｉｌ．ｅｘａｍｐｌｅ evil\u200b.example';
 const ctx=context([{...fixture,owner:attack,issuer:attack}]);
 ctx.agg.allResults[0]={...ctx.agg.allResults[0],domain:attack,status:attack,trustReason:attack,validTo:attack};
 const {html}=render(ctx,planOf(ctx.request));
 assert.doesNotMatch(html,/<(?:a|img|script|iframe|form)\b|evil\.example|person@|192\.0\.2\.1|2001:db8|[\u200b\u202e]/i);
 assert.doesNotMatch((html.match(/<[^>]*>/g)||[]).join(''),/\s(?:href|src|action|onerror)\s*=/i);
 assert.match(html,/evil\[\.\]example/);assert.match(html,/\[at\]/);assert.match(html,/&lt;a/);
});

test('request is minimized, bounded, credential-free and no free prose is requested',()=>{
 const ctx=context([{...fixture,owner:'PRIVATE OWNER',issuer:'PRIVATE ISSUER',unexpected:'PRIVATE EXTRA'}]);
 const req=ctx.request,body=JSON.parse(req.body);
 assert.equal(req.aiEligible,true);assert.equal(body.response_format.type,'json_object');
 assert.ok(req.body.length<=32000);assert.equal(body.max_tokens,4000);
 const payload=JSON.parse(body.messages[1].content.split('<findings-json>\n')[1].split('\n</findings-json>')[0]);
 assert.equal(payload.findings[0].findingId,0);
 assert.deepEqual(Object.keys(payload.findings[0].evidence),['domain','status','severity','daysRemaining','validTo','trustReason']);
 assert.doesNotMatch(req.body,/PRIVATE OWNER|PRIVATE ISSUER|PRIVATE EXTRA|apiKey/);
 assert.match(body.messages[0].content,/never write prose/);
});

test('30 domains appear once with a single shared action plan and no attachments',()=>{
 const results=Array.from({length:30},(_,i)=>({...fixture,domain:'target'+i+'.example'}));
 const ctx=context(results);
 assert.equal(ctx.request.aiEligible,false);assert.equal(ctx.request.body,null);
 const {html}=render(ctx,undefined);
 for(let i=0;i<30;i++) assert.ok(html.includes('target'+i+'[.]example'));
 assert.equal((html.match(/Renew or replace/g)||[]).length,1);
 assert.equal((html.match(/Repeat the TLS inspection after remediation/g)||[]).length,1);
 for(let i=0;i<30;i++)assert.equal(html.split('target'+i+'[.]example').length-1,1);
 assert.doesNotMatch(code('Build Email HTML'),/fileName|base64|binary:/);
 assert.equal(workflow.nodes.find(n=>n.type==='n8n-nodes-base.emailSend').parameters.options.fileAttachments,undefined);
 assert.match(html,unavailable);
});

test('long fields remain bounded and use single-column email layout',()=>{
 const ctx=context(Array.from({length:30},(_,i)=>({...fixture,domain:'a'.repeat(60)+i+'.example',owner:'&'.repeat(120),issuer:'&'.repeat(160)})));
 const {html}=render(ctx,undefined);
 assert.ok(Buffer.byteLength(html)<100000,'Keep worst-case report below common clipping threshold');
 assert.doesNotMatch(html,/<th\b|<thead\b|display\s*:\s*(?:flex|grid)|min-width/i);
 assert.match(html,/table-layout:fixed/);assert.match(html,/overflow-wrap:anywhere/);assert.match(html,/<wbr>/);assert.doesNotMatch(html,/a{24} a{24}/);
});

test('HTTP, execution storage, graph and portable export security controls are explicit',()=>{
 const http=workflow.nodes.find(n=>n.type==='n8n-nodes-base.httpRequest');
 assert.equal(http.parameters.authentication,'predefinedCredentialType');assert.equal(http.parameters.nodeCredentialType,'mistralCloudApi');
 assert.equal(http.parameters.options.timeout,30000);assert.equal(http.parameters.options.redirect.redirect.followRedirects,false);
 assert.equal(http.onError,'continueRegularOutput');assert.equal(http.maxTries,2);
 assert.equal(workflow.settings.executionTimeout,240);
 for(const name of ['saveDataErrorExecution','saveDataSuccessExecution']) assert.equal(workflow.settings[name],'none');
 assert.equal(workflow.settings.saveManualExecutions,false);assert.equal(workflow.settings.saveExecutionProgress,false);
 assert.equal(workflow.active,false);assert.ok(workflow.nodes.every(n=>!n.credentials));
 assert.ok(workflow.nodes.filter(n=>n.type==='n8n-nodes-base.code').every(n=>n.parameters.mode==='runOnceForAllItems'));
 const names=new Set(workflow.nodes.map(n=>n.name));assert.equal(names.size,workflow.nodes.length);
 assert.equal(new Set(workflow.nodes.map(n=>n.id)).size,workflow.nodes.length);
 for(const [source,types] of Object.entries(workflow.connections)){assert.ok(names.has(source));for(const outputs of Object.values(types))for(const targets of outputs)for(const target of targets)assert.ok(names.has(target.node));}
 assert.equal(workflow.connections['AI Request Allowed?'].main[1][0].node,'Build Email HTML');
 assert.equal(workflow.connections['Domain List — Edit Here'].main[0][0].node,'Validate Domain Configuration');
 assert.doesNotMatch(JSON.stringify(workflow),/MISTRAL_API_KEY/);
});

test('local fallback also prioritizes critical issues before warnings',()=>{
 const warning={...fixture,domain:'warning.example',status:'WARNING',severity:'warning',trustReason:null,daysRemaining:10};
 const ctx=context([warning,fixture]);
 const {html}=render(ctx,undefined);
 const analysis=html;
 assert.ok(analysis.indexOf('expired[.]badssl[.]com')<analysis.indexOf('warning[.]example'));
});

test('simple rows report expiry dates and failed checks without invented expiry claims',()=>{
 const ctx=context([
  fixture,
  {...fixture,domain:'healthy.example',status:'OK',severity:'info',trustReason:null,validTo:'2027-01-15',daysRemaining:89},
  {...fixture,domain:'self-signed.example',status:'INVALID',trustReason:'CA_UNTRUSTED'},
  {...fixture,domain:'timeout.example',status:'TIMEOUT',trustReason:'DNS_TIMEOUT',validTo:null,daysRemaining:null},
 ]);
 const result=render(ctx,planOf(ctx.request)),html=result.html;
 assert.match(html,/expired\[\.\]badssl\[\.\]com<\/strong> &rarr; Expired on 2026-10-17/);
 assert.match(html,/healthy\[\.\]example<\/strong> &rarr; Expires on 2027-01-15/);
 assert.match(html,/Untrusted certificate chain; expires on 2026-10-17/);
 assert.match(html,/DNS timeout; expiry unverified/);
 assert.equal((html.match(/Deploy the intended certificate/g)||[]).length,1);
 assert.equal((html.match(/Repeat the TLS inspection after remediation/g)||[]).length,1);
 assert.equal((html.match(/<h2/g)||[]).length,1);
 assert.equal(result.binary,undefined);
 const mail=workflow.nodes.find(n=>n.type==='n8n-nodes-base.emailSend');
 assert.equal(mail.parameters.options.appendAttribution,false);
 assert.equal(mail.parameters.options.attachments,undefined);
 assert.equal(mail.parameters.options.fileAttachments,undefined);
});
