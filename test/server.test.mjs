import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../server.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('14 live clients: same room/state, capacity, ready gate, host permissions, reconnect, leave migration',async()=>{
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port,clients=[],aborters=[];
 async function post(path,data,c){const r=await fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json',...(c?{Authorization:'Bearer '+c.token}:{})},body:JSON.stringify(data)});return{status:r.status,body:await r.json()}}
 async function connect(c){const abort=new AbortController();aborters.push(abort);const r=await fetch(url+'/api/events',{headers:{Authorization:'Bearer '+c.token},signal:abort.signal});assert.equal(r.status,200);const reader=r.body.getReader();c.frames=[];c.reading=(async()=>{let b='';try{for(;;){const {value,done}=await reader.read();if(done)return;b+=new TextDecoder().decode(value);const parts=b.split('\n\n');b=parts.pop();for(const p of parts)if(p.startsWith('data: '))c.frames.push(JSON.parse(p.slice(6)))}}catch{}})();return abort}
 try{for(let i=0;i<14;i++){const r=await post('/api/join',{name:'동료'+i,create:i===0,code:clients[0]?.code});assert.equal(r.status,200);clients.push(r.body);await connect(r.body)}
 const overflow=await post('/api/join',{name:'15번째',code:clients[0].code});assert.equal(overflow.status,409);
 const forbidden=await post('/api/action',{type:'start'},clients[1]);assert.equal(forbidden.status,403);
 const notReady=await post('/api/action',{type:'start'},clients[0]);assert.equal(notReady.status,409);
 for(const c of clients)assert.equal((await post('/api/action',{type:'ready',ready:true},c)).status,200);
 assert.equal((await post('/api/action',{type:'start'},clients[0])).status,200);await delay(3300);
 for(const c of clients){const s=c.frames.at(-1);assert.equal(s.status,'playing');assert.equal(s.players.length,14);assert.equal(s.capacity,42);assert.equal(s.round,1)}
 for(const c of clients)assert.equal((await post('/api/action',{type:'shoot',seq:1,x:635,y:350,power:.4},c)).status,200);
 assert.equal((await post('/api/action',{type:'shoot',seq:1,x:635,y:350,power:.4},clients[0])).status,409);
 assert.equal((await post('/api/action',{type:'pause'},clients[2])).status,403);
 aborters[3].abort();await delay(100);await connect(clients[3]);await delay(200);assert.equal(clients[3].frames.at(-1).players.filter(p=>p.id===clients[3].id).length,1);
 assert.equal((await post('/api/action',{type:'leave'},clients[0])).status,200);await delay(100);assert.equal(clients[1].frames.at(-1).host,clients[1].id);
 assert.equal((await post('/api/action',{type:'pause'},clients[1])).status,200);await delay(100);assert.equal(clients[2].frames.at(-1).status,'paused');
 assert.equal((await post('/api/action',{type:'shoot',seq:2,x:635,y:350,power:.4},clients[2])).status,409);
 const cross=await fetch(url+'/api/join',{method:'POST',headers:{Origin:'https://bad.example','Content-Type':'application/json'},body:'{}'});assert.equal(cross.status,403);
 const bad=await fetch(url+'/api/action',{method:'POST',headers:{Authorization:'Bearer bad'},body:'{}'});assert.equal(bad.status,401);
 }finally{for(const a of aborters)a.abort();server.closeAllConnections();await new Promise(r=>server.close(r))}
});
