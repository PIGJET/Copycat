const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function harness(){
  const nodes=new Map(),calls={downloads:[],revoked:[],plays:0};let handler;let n=0;
  const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,disabled:false,textContent:'',removeAttribute(name){delete this[name]},pause(){},play(){calls.plays++;return Promise.resolve()}});return nodes.get(id)};
  const root={addEventListener:(type,fn)=>{if(type==='click')handler=fn},querySelector:node};
  const context=vm.createContext({Blob,File,URL:{createObjectURL:()=>`blob:${n++}`,revokeObjectURL:url=>calls.revoked.push(url)},document:{querySelector:()=>root,getElementById:node,body:{append(){}},createElement:()=>({click(){calls.downloads.push({href:this.href,name:this.download})},remove(){}})}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/finale-video.js'),'utf8'),context);
  return {api:context.CopycatFinale,node,calls,click:action=>handler({target:{closest:()=>({disabled:false,dataset:{finaleAction:action}})}})};
}
const video=(type='video/webm')=>new Blob(['test media'],{type});
test('the finale offers Download video only, with no send or share code left',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../dist/finale-video.js'),'utf8');
  assert.doesNotMatch(source,/fetch\(|navigator\.share|replay-delivery|showModal/);
  const ui=fs.readFileSync(path.join(__dirname,'../dist/game-ui.js'),'utf8'),html=fs.readFileSync(path.join(__dirname,'../dist/index.html'),'utf8');
  assert.doesNotMatch(ui,/Send replay|share-dialog|data-share-action/);
  assert.match(ui,/class="ui-primary" id="finale-download" data-finale-action="download" disabled>Download video</);
  assert.match(html,/finale-video\.js/);assert.doesNotMatch(html,/finale-share\.js/);
});
test('no video: the button stays disabled and nothing downloads',()=>{
  const h=harness();h.api.mount();assert(h.node('finale-download').disabled);assert.match(h.node('finale-download-status').textContent,/No video/);h.click('download');assert.equal(h.calls.downloads.length,0);
});
test('the download is named copycat-<loser>-breaking-news with the recorded format',()=>{
  const h=harness();h.api.setDownload(video('video/webm;codecs=vp9,opus'),'Jamie Lee');assert.equal(h.node('finale-download').disabled,false);h.click('download');
  assert.deepEqual(h.calls.downloads,[{href:'blob:0',name:'copycat-jamie-lee-breaking-news.webm'}]);assert.match(h.node('finale-download-status').textContent,/Saved as copycat-jamie-lee-breaking-news\.webm/);
  h.api.setDownload(video('video/mp4'),'Riley!');h.click('download');assert.equal(h.calls.downloads[1].name,'copycat-riley-breaking-news.mp4');assert.deepEqual(h.calls.revoked,['blob:0']);
});
test('the on-screen replay and the download are separate, and clearing revokes both',()=>{
  const h=harness();h.api.setVideo(video());assert.equal(h.node('finale-video').hidden,false);assert.equal(h.node('finale-replay').disabled,false);assert(h.node('finale-download').disabled);
  h.api.setDownload(video(),'Riley');h.api.clear();assert.deepEqual(h.calls.revoked,['blob:0','blob:1']);assert(h.node('finale-video').hidden);assert(h.node('finale-download').disabled);
});
test('nonvideo and empty files are rejected without dropping a valid one',()=>{
  const h=harness();h.api.setDownload(video(),'Riley');assert.throws(()=>h.api.setDownload(new Blob(['x'],{type:'text/html'}),'R'));assert.throws(()=>h.api.setDownload(new Blob([],{type:'video/mp4'}),'R'));assert.equal(h.node('finale-download').disabled,false);
});
