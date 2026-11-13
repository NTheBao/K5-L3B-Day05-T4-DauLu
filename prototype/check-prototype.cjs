// Local browser check; requires installed Chrome, no npm packages or network.
const fs=require('fs'), os=require('os'), path=require('path');
const {spawn}=require('child_process');
const {pathToFileURL}=require('url');
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'daulu-check-'));
 const child=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--remote-debugging-port=9337','--remote-allow-origins=*','--no-first-run','--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});
 let ws;
 try{
  let tabs;
  for(let i=0;i<60;i++){try{tabs=await(await fetch('http://127.0.0.1:9337/json')).json();break;}catch{await new Promise(r=>setTimeout(r,200));}}
  if(!tabs)throw Error('Chrome did not start');
  ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise(r=>ws.addEventListener('open',r,{once:true}));
  let id=0;const pending=new Map();
  ws.addEventListener('message',e=>{const v=JSON.parse(e.data);if(pending.has(v.id)){pending.get(v.id)(v);pending.delete(v.id);}});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,v=>v.error?reject(Error(v.error.message)):resolve(v.result));ws.send(JSON.stringify({id:n,method,params}));});
  const evaluate=async expression=>{const v=await call('Runtime.evaluate',{expression,returnByValue:true});if(v.exceptionDetails)throw Error(v.exceptionDetails.text+JSON.stringify(v.exceptionDetails));return v.result.value;};
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:1600,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:pathToFileURL(path.join(__dirname,'index.html')).href});
  for(let i=0;i<40;i++){if(await evaluate('typeof setCase === "function"'))break;await new Promise(r=>setTimeout(r,100));}
  const checks=[];
  const check=async(name,expr)=>{if(!await evaluate(expr))throw Error('FAIL: '+name);checks.push(name);};
  await check('No shop data before approval',`!sent && !document.querySelector('#seller').textContent.includes('Hạn phản hồi:')`);
  await evaluate(`setCase(1);go('transfer')`);
  await check('Unknown order blocks transfer',`state==='ask-order'&&!transferred`);
  await evaluate(`go('ordered');go('upload')`);
  await check('Evidence requires privacy confirmation',`document.querySelector('#btn-submit').disabled`);
  await evaluate(`document.querySelector('#ck-priv').checked=true;submitEv();go('transfer')`);
  await check('Case 1 transfer preserves evidence',`evidence&&transferred&&!sent`);
  await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true}).then(x=>fs.writeFileSync(path.join(__dirname,'kiem-tra-1.png'),Buffer.from(x.data,'base64')));
  await evaluate(`view('seller');document.querySelector('#draft-text').value='Xin shop cung cấp tem size và mô tả lúc đặt.';editDraft();approve()`);
  await check('Edited draft sent and deadline starts after send',`sent&&draftText.includes('Xin shop')&&document.querySelector('#seller').textContent.includes('17:00')`);
  await evaluate(`document.querySelector('#reply-text').value='Tem size M; đề nghị kiểm tra mô tả lúc đặt.';sellerReply()`);
  await check('Shop response saved',`reply.includes('Tem size M')`);
  await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true}).then(x=>fs.writeFileSync(path.join(__dirname,'kiem-tra-2.png'),Buffer.from(x.data,'base64')));
  await evaluate(`setCase(7)`);
  await check('Case 7 privacy refusal without transfer',`!transferred&&!sent&&document.querySelector('#buyer').textContent.includes('không cung cấp hoặc xác nhận')`);
  await evaluate(`go('ordered');go('transfer');go('cancel-transfer')`);
  await check('Case 7 transfer can be cancelled',`!transferred`);
  await evaluate(`setCase(4);go('ordered');go('ask-order');go('ordered')`);
  await check('Case 4 request sent once on revisit',`requestCount===1`);
  await evaluate(`go('upload');document.querySelector('#ck-priv').checked=true;submitEv();view('seller');view('buyer')`);
  await check('Evidence persists across tabs',`evidence`);
  await check('No financial or penalty action buttons',`![...document.querySelectorAll('button')].some(b=>/hoàn tiền|từ chối khiếu nại|phạt shop|xem số/i.test(b.textContent))`);
  console.log(JSON.stringify({passed:checks.length,checks},null,2));
 }finally{if(ws)ws.close();child.kill();}
})().catch(e=>{console.error(e);process.exitCode=1});
