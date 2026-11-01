'use strict';
/* Real integration test: compiled MCP server + its localhost HTTP bridge + plugin agent. */
const assert=require('assert'),{spawn}=require('child_process'),http=require('http'),fs=require('fs'),os=require('os'),path=require('path');
const {createAgent}=require('../plugin-integration/js/bridge-core.js');
const PORT=Number(process.env.OTZARIA_TEST_PORT||48931),DIR=fs.mkdtempSync(path.join(os.tmpdir(),'otzaria-mcp-e2e-'));
const env=Object.assign({},process.env,{OTZARIA_BRIDGE_PORT:String(PORT),OTZARIA_BRIDGE_DIR:DIR});
const child=spawn(process.execPath,[path.resolve(__dirname,'../dist/index.js')],{env,stdio:['pipe','pipe','pipe']});
let stdout='',stderr='',nextId=1;const waiting=new Map();
child.stdout.on('data',d=>{stdout+=d.toString();let i;while((i=stdout.indexOf('\n'))>=0){const line=stdout.slice(0,i);stdout=stdout.slice(i+1);if(!line.trim())continue;let msg;try{msg=JSON.parse(line)}catch(e){continue;}if(msg.id!==undefined&&waiting.has(msg.id)){waiting.get(msg.id)(msg);waiting.delete(msg.id);}}});
child.stderr.on('data',d=>{stderr+=d.toString();});
function rpc(method,params){return new Promise((resolve,reject)=>{const id=nextId++;const timer=setTimeout(()=>{waiting.delete(id);reject(new Error('MCP request timed out: '+method+'\n'+stderr));},15000);waiting.set(id,msg=>{clearTimeout(timer);resolve(msg);});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});}
async function tool(name,args){const r=await rpc('tools/call',{name,arguments:args||{}});assert.ok(r.result,'MCP tool did not return a result: '+name);return r.result;}
function textBody(r){const s=r.content[0].text;return s.replace(/^UNTRUSTED DATA[^\n]*\n/,'');}
function request(method,p,b,token,host){return new Promise((resolve,reject)=>{const q=http.request({host:'127.0.0.1',port:PORT,path:p,method,agent:false,headers:{host:host||'127.0.0.1:'+PORT,authorization:token===undefined?'Bearer '+TOKEN:'Bearer '+token,'content-type':'application/json'}},res=>{let data='';res.on('data',x=>data+=x);res.on('end',()=>{let json;try{json=JSON.parse(data)}catch{}resolve({status:res.statusCode,body:data,json});});});q.on('error',e=>reject(new Error(method+' '+p+' request failed: '+e.message)));if(b!==undefined&&b!==null)q.write(typeof b==='string'?b:JSON.stringify(b));q.end();});}
let TOKEN;
(async()=>{
 await new Promise(r=>setTimeout(r,500));
 const init=await rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'otzaria-test',version:'1'}});
 assert.ok(init.result&&init.result.serverInfo.name==='otzaria-testing-bridge');
 child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
 const names=(await rpc('tools/list')).result.tools.map(t=>t.name);
 for(const n of ['otzaria_status','otzaria_info','otzaria_get_logs','otzaria_call','otzaria_discover_pdfs'])assert.ok(names.includes(n),'missing MCP tool '+n);
 const status=await tool('otzaria_status',{});
 TOKEN=fs.readFileSync(path.join(DIR,'token'),'utf8').trim();assert.match(TOKEN,/^[0-9a-f]{32}$/);
 assert.ok(!textBody(status).includes(TOKEN),'MCP status must not reveal bearer token');
 assert.strictEqual((await request('GET','/plugin/poll',null,'')).status,401);
 assert.strictEqual((await request('GET','/plugin/poll',null,'f'.repeat(32))).status,401);
 assert.strictEqual((await request('GET','/plugin/poll',null,TOKEN,'evil.example:'+PORT)).status,403);
 const oversized=await request('POST','/plugin/result',JSON.stringify({id:'x',pad:'x'.repeat(3*1024*1024)}),TOKEN).catch(()=>({status:0}));
 assert.ok([0,400,413].includes(oversized.status),'oversized body should be rejected');
 let before=await tool('otzaria_call',{method:'library.content.read',params:{}});
 assert.ok(before.isError&&/not connected/i.test(textBody(before)));
 const calls=[],approvals=[],logs=[];
 const otz={'library.content.read':p=>({text:'Kiddushin 2a '+JSON.stringify(p)}),'network.fetch':p=>({status:200,body:'<a href="https://oraysa-media.s3.amazonaws.com/K2a.pdf">PDF</a><a href="https://evil.example/bad.pdf">bad</a>'})};
 const agent=createAgent({http:(m,p,b)=>request(m,p,b,TOKEN),bridgeCall:async(m,p)=>{calls.push(m);if(!otz[m])throw Error('unknown method '+m);return otz[m](p);},approve:async x=>{approvals.push(x.method);return true;},log:(level,message,data)=>logs.push({level,message,data}),getLogs:p=>({entries:logs.slice(-(p.limit||100))}),info:()=>({hasOtzaria:true,jsErrors:[]}),allowlist:()=>[],version:'test',userAgent:'node test',transport:'test'});
 await agent.start();await new Promise(r=>setTimeout(r,100));
 const connected=JSON.parse(textBody(await tool('otzaria_status',{})));assert.strictEqual(connected.connected,true);
 const call=await tool('otzaria_call',{method:'library.content.read',params:{ref:'K2a'}});
 assert.ok(!call.isError&&textBody(call).includes('Kiddushin'));assert.deepStrictEqual(approvals,['library.content.read']);
 const invalid=await tool('otzaria_call',{method:'../../etc',params:{}});
 assert.ok(invalid.isError&&/Invalid method/.test(textBody(invalid)));
 const discovery=JSON.parse(textBody(await tool('otzaria_discover_pdfs',{pages:['https://www.oraysa.org/daf/k2a','https://169.254.169.254/latest','http://www.oraysa.org/x']})));
 assert.strictEqual(discovery[0].pdfCount,1);assert.ok(discovery[1].error&&discovery[2].error);assert.strictEqual(calls.filter(x=>x==='network.fetch').length,1);
 const resultLogs=JSON.parse(textBody(await tool('otzaria_get_logs',{limit:100})));
 assert.ok(resultLogs.entries.some(e=>e.level==='call-ok'));assert.ok(!JSON.stringify(logs).includes(TOKEN));
 await agent.stop();child.stdin.end();child.kill();
 console.log('MCP + LOCAL HTTP + PLUGIN E2E TESTS PASSED');
})().catch(e=>{console.error('MCP E2E FAILED:',e);child.kill();process.exitCode=1;});
setTimeout(()=>{child.kill();},60000).unref();
