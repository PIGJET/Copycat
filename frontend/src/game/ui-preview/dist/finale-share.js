/* Local-only replay delivery. The recorder/encoder supplies the finished video Blob. */
(() => {
  let file=null,objectUrl=null,busy=false;
  const root=document.querySelector('#game-screen');
  const element=id=>document.getElementById(id);
  const status=message=>{const node=element('share-status');if(node)node.textContent=message};
  function canShareFile(){
    try{return !!(file&&navigator.share&&navigator.canShare?.({files:[file]}))}catch{return false}
  }
  function mount(){
    const video=element('finale-video');
    if(video){video.hidden=!file;if(file){if(video.src!==objectUrl)video.src=objectUrl}else video.removeAttribute('src')}
    const controls=root?.querySelector('.finale-replay-controls');if(controls)controls.hidden=!file;
    const empty=element('finale-empty');if(empty)empty.hidden=!!file;
    const replay=element('finale-replay');if(replay)replay.disabled=!file;
    const native=element('share-native');if(native){native.disabled=!canShareFile()||busy;native.hidden=!!file&&!canShareFile()}
    const save=element('share-download');if(save){save.disabled=!file||busy;save.className=canShareFile()?'ui-secondary':'ui-primary'}
    const note=root?.querySelector('.finale-replay-controls>span');if(note)note.textContent=file?'Saved on this device':'Demo replay';
    const send=element('replay-send');if(send)send.disabled=!file||busy;
    status(!file?'No video is available for this player.':'Your video is ready to send.');
  }
  function clear(){
    element('finale-video')?.pause();
    if(objectUrl)URL.revokeObjectURL(objectUrl);
    file=null;objectUrl=null;busy=false;mount();
  }
  function setVideo(blob,playerName='player'){
    if(!(blob instanceof Blob)||!blob.size||!/^video\//i.test(blob.type))throw new TypeError('Expected a nonempty video Blob.');
    clear();
    const extension=({'video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov','video/ogg':'ogv'})[blob.type.split(';')[0]]||'webm';
    const name=String(playerName).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48)||'player';
    file=new File([blob],`copycat-${name}.${extension}`,{type:blob.type});
    objectUrl=URL.createObjectURL(file);mount();
  }
  async function share(){
    if(!file||busy)return;
    if(!canShareFile()){status('Download the video, then attach it to an email or text.');return}
    // Call directly from the click to preserve the browser's user activation.
    const sharedFile=file;
    let operation;
    try{operation=navigator.share({files:[sharedFile],title:'My Copycat replay'})}
    catch(error){status(error.name==='AbortError'?'Sharing canceled. Your video is still here.':'Sharing could not open. Download the video instead.');return}
    busy=true;const native=element('share-native');if(native)native.disabled=true;
    try{await operation;if(file===sharedFile)status('Video handed to your share app.');}
    catch(error){if(file===sharedFile)status(error.name==='AbortError'?'Sharing canceled. Your video is still here.':'Sharing could not finish. Download the video instead.');}
    finally{if(file===sharedFile){busy=false;if(native)native.disabled=false}}
  }
  function download(){
    if(!file||busy)return;
    const link=document.createElement('a');link.href=objectUrl;link.download=file.name;
    document.body.append(link);link.click();link.remove();
    status('Download started. Attach the saved video to an email or text.');
  }
  function replay(){const video=element('finale-video');if(!file||!video)return;video.currentTime=0;video.play()?.catch(()=>status('Use the video’s play button to watch again.'))}
  root?.addEventListener('submit',async event=>{
    if(event.target.id!=='replay-delivery')return;
    event.preventDefault();
    if(!file||busy)return;
    const input=element('replay-recipient'), recipient=input.value.trim();
    const sending=file;
    busy=true;mount();status('Sending replay…');
    try{
      const response=await fetch('/api/replay-delivery',{method:'POST',headers:{'Content-Type':file.type,'X-Replay-Recipient':encodeURIComponent(recipient)},body:file});
      const result=await response.json();
      if(file===sending){busy=false;mount();status(result.message);if(response.ok)input.value=''}
    }catch{if(file===sending){busy=false;mount();status('Could not reach replay delivery. You can still download your video.')}}
  });
  root?.addEventListener('click',event=>{
    const button=event.target.closest('[data-share-action]');if(!button||button.disabled)return;
    switch(button.dataset.shareAction){
      case'open':mount();element('finale-share-dialog')?.showModal();break;
      case'close':element('finale-share-dialog')?.close();break;
      case'share':void share();break;
      case'download':download();break;
    }
  });
  globalThis.CopycatFinale=Object.freeze({setVideo,clear,mount,replay,share,download});
})();
