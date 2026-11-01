'use strict';
const assert=require('assert'),http=require('http');
const {createAgent}=require('../plugin-integration/js/bridge-core.js');
const TOKEN='0123456789abcdef0123456789abcdef',PORT=48761;
let hello=null,lastPoll=0,queue=[],waiter=null,pending=new Map(),calls=[],logs=[],approvals=[],allow=[];
function send(res,status,obj){res.writeHead(status,{'content-type':'application/json','access-control-allow-origin':'*'});res.end(JSON.stringify(obj));}
const server=http.createServer((req,res)=>{
 if(req.headers.host!=='127.0.0.1:'+PORT)return send(res,403,{error:'bad host'});
 if(req.method==='OPTIONS')return send(res,204,{});
 if(req.headers.authorization!=='Bearer '+TOKEN)return send(res,401,{error:'bad token'});
 const u=new URL(req.url,'http://127.0.0.1:'+PORT);
 if(req.method==='POST'&&u.pathname==='/plugin/hello'){hello=true;lastPoll=Date.now();return send(res,200,{ok:true});}
 if(req.method==='GET'&&u.pathname==='/plugin/poll'){lastPoll=Date.now();if(queue.length)return send(res,200,{commands:queue.splice(0)});waiter=res;req.on('close',()=>{if(waiter===res)waiter=null;});return;}
 if(req.method==='POST'&&u.pathname==='/plugin/result'){let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{const b=JSON.parse(raw);const p=pending.get(b.id);if(p){pending.delete(b.id);b.ok?p.resolve(b.result):p.reject(new Error(b.error));}send(res,200,{ok:true});});return;}
 if(req.method==='POST'&&u.pathname==='/plugin/bye'){hello=false;return send(res,200,{ok:true});}
 send(res,404,{error:'not found'});
});
function request(method,path,body,token=TOKEN,host='127.0.0.1:'+PORT){return new Promise((resolve,reject)=>{const q=http.request({host:'127.0.0.1',port:PORT,path,method,headers:{host,authorization:'Bearer '+token,'content-type':'application/json'}},r=>{let s='';r.on('data',c=>s+=c);r.on('end',()=>{let j;try{j=JSON.parse(s)}catch{}resolve({status:r.statusCode,json:j,body:s});});});q.on('error',reject);if(body)q.write(JSON.stringify(body));q.end();});}
function dispatch(type,params){return new Promise((resolve,reject)=>{const id=Math.random().toString(16).slice(2);pending.set(id,{resolve,reject});queue.push({id,type,params});if(waiter){const r=waiter;waiter=null;send(r,200,{commands:queue.splice(0)});}setTimeout(()=>{if(pending.has(id)){pending.delete(id);reject(new Error('test timeout'));}},4000);});}
(async()=>{
 await new Promise(r=>server.listen(PORT,'127.0.0.1',r));
 assert.strictEqual((await request('GET','/plugin/poll',null,'')).status,401);
 assert.strictEqual((await request('GET','/plugin/poll',null,'f'.repeat(32))).status,401);
 assert.strictEqual((await request('GET','/plugin/poll',null,TOKEN,'evil.example:'+PORT)).status,403);
 const OTZ={
  'library.content.read':p=>({text:'Kiddushin 2a '+JSON.stringify(p)}),
  'fs.pickUserFolder':()=>({chosen:true}),
  'network.fetch':()=>({status:200,body:'<a href="https://oraysa-media.s3.amazonaws.com/K2a.pdf">pdf</a><a href="https://evil.example/x.pdf">bad</a>'})
 };
 const agent=createAgent({
  http:(m,p,b)=>request(m,p,b),
  bridgeCall:async(m,p)=>{calls.push(m);if(!OTZ[m])throw Error('unknown method '+m);return OTZ[m](p);},
  approve:async x=>{approvals.push(x.method);return x.method!=='fs.deleteThing';},
  log:(level,message,data)=>logs.push({level,message,data}),
  getLogs:p=>({entries:logs.slice(-(p.limit||100))}),info:()=>({hasOtzaria:true,jsErrors:[]}),
  allowlist:()=>allow,version:'test',userAgent:'node',transport:'test'
 });
 await agent.start();await new Promise(r=>setTimeout(r,100));
 assert.strictEqual(hello,true);
 let result=await dispatch('call',{method:'library.content.read',params:{ref:'K2a'}});
 assert.match(result.text,/Kiddushin/);assert.deepStrictEqual(approvals,['library.content.read']);
 approvals=[];allow=['library.content.read'];
 await dispatch('call',{method:'library.content.read',params:{ref:'K2a'}});
 assert.deepStrictEqual(approvals,[]);
 allow=['fs.pickUserFolder'];await dispatch('call',{method:'fs.pickUserFolder',params:{}});
 assert.deepStrictEqual(approvals,['fs.pickUserFolder']);
 let declined=await dispatch('call',{method:'fs.deleteThing',params:{}}).then(()=>false, e=>/Declined/.test(e.message));
 assert.strictEqual(declined,true);assert.ok(!calls.includes('fs.deleteThing'));
 let invalid=await dispatch('call',{method:'../../etc',params:{}}).then(()=>false,e=>/Invalid method/.test(e.message));assert.strictEqual(invalid,true);
 const discovery=await dispatch('discover',{pages:['https://www.oraysa.org/daf/k2a','https://169.254.169.254/latest','http://www.oraysa.org/x','https://www.oraysa.org:8443/a']});
 assert.strictEqual(discovery[0].pdfCount,1);assert.ok(discovery[1].error&&discovery[2].error&&discovery[3].error);
 assert.strictEqual(calls.filter(x=>x==='network.fetch').length,1);
 assert.ok(!JSON.stringify(logs).includes(TOKEN));
 await agent.stop();server.close();console.log('PLUGIN/HTTP E2E TESTS PASSED');
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
