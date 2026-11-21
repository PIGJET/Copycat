const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function harness({supported=true,outcome='ok'}={}){
  const nodes=new Map(),calls={shared:[],downloads:[],revoked:[],plays:0};let handler;
  const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,disabled:false,textContent:'',removeAttribute(name){delete this[name]},pause(){},play(){calls.plays++;return Promise.resolve()},showModal(){this.open=true},close(){this.open=false}});return nodes.get(id)};
  const root={addEventListener:(type,fn)=>{handler=fn},querySelector:node};
  const context=vm.createContext({Blob,File,URL:{createObjectURL:()=>`blob:clip-${calls.revoked.length}`,revokeObjectURL:url=>calls.revoked.push(url)},document:{querySelector:()=>root,getElementById:node,body:{append(){}},createElement:()=>({click(){calls.downloads.push({href:this.href,name:this.download})},remove(){}})},navigator:{canShare:()=>supported,share:async payload=>{calls.shared.push(payload);if(outcome!=='ok')throw Object.assign(new Error(outcome),{name:outcome})}}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/finale-share.js'),'utf8'),context);
  return {api:context.CopycatFinale,node,calls,click:action=>handler({target:{closest:()=>({dataset:{shareAction:action}})}})};
}
const clip=()=>new Blob(['test media'],{type:'video/webm'});
test('missing footage opens an honest empty state and never shares or downloads',async()=>{
  const h=harness();h.click('open');assert(h.node('finale-share-dialog').open);assert(h.node('share-native').disabled);assert(h.node('share-download').disabled);assert.match(h.node('share-status').textContent,/No video/);await h.api.share();h.api.download();assert.equal(h.calls.shared.length,0);assert.equal(h.calls.downloads.length,0);
});
test('finished replay is handed to the device share API as an actual video file',async()=>{
  const h=harness();h.api.setVideo(clip(),'Riley');assert.equal(h.node('finale-video').hidden,false);assert.equal(h.node('finale-empty').hidden,true);assert.equal(h.node('finale-replay').disabled,false);await h.api.share();const file=h.calls.shared[0].files[0];assert.equal(file.name,'copycat-riley.webm');assert.equal(file.type,'video/webm');assert.equal(await file.text(),'test media');assert.match(h.node('share-status').textContent,/handed/);
});
test('browsers without file sharing offer a real download for email or text attachments',()=>{
  const h=harness({supported:false});h.api.setVideo(clip(),'Riley');assert(h.node('share-native').hidden);assert.equal(h.node('share-download').disabled,false);h.api.download();assert.deepEqual(h.calls.downloads,[{href:'blob:clip-0',name:'copycat-riley.webm'}]);
});
test('canceling the share sheet keeps the video and never reports it sent',async()=>{
  const h=harness({outcome:'AbortError'});h.api.setVideo(clip());await h.api.share();assert.match(h.node('share-status').textContent,/canceled/);assert.equal(h.node('share-download').disabled,false);assert.equal(h.node('finale-video').hidden,false);
});
test('share failures offer download and leave sharing retryable',async()=>{
  const h=harness({outcome:'NotAllowedError'});h.api.setVideo(clip());await h.api.share();assert.match(h.node('share-status').textContent,/Download/);assert.equal(h.node('share-native').disabled,false);
});
test('clearing a game revokes its video URL so the next session cannot share old footage',async()=>{
  const h=harness();h.api.setVideo(clip());h.api.clear();assert.deepEqual(h.calls.revoked,['blob:clip-0']);assert(h.node('finale-video').hidden);assert(h.node('finale-replay').disabled);await h.api.share();assert.equal(h.calls.shared.length,0);
});
test('nonvideo and empty files are rejected without discarding a valid replay',()=>{
  const h=harness();h.api.setVideo(clip());assert.throws(()=>h.api.setVideo(new Blob(['bad'],{type:'text/html'})));assert.throws(()=>h.api.setVideo(new Blob([],{type:'video/mp4'})));assert.equal(h.node('finale-video').hidden,false);
});
