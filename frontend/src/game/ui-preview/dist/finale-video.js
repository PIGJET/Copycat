/* The finale's replay and Download video, all local: nothing is uploaded. The engine hands in
   the loser's take for the on-screen replay (setVideo) and the file to save (setDownload): the
   recorded breaking-news video, or the loser's own take when that couldn't be recorded. */
(() => {
  let replay=null,replayUrl=null,file=null,fileUrl=null;
  const root=document.querySelector('#game-screen');
  const element=id=>document.getElementById(id);
  const EXTENSIONS={'video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov','video/ogg':'ogv'};
  const isVideo=blob=>blob instanceof Blob&&blob.size>0&&/^video\//i.test(blob.type);
  /** copycat-<loser name>-breaking-news.<webm|mp4|…> */
  function fileName(blob,playerName){
    const extension=EXTENSIONS[blob.type.split(';')[0].toLowerCase()]||'webm';
    const name=String(playerName).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48)||'player';
    return `copycat-${name}-breaking-news.${extension}`;
  }
  function mount(){
    const video=element('finale-video');
    if(video){video.hidden=!replay;if(replay){if(video.src!==replayUrl)video.src=replayUrl}else video.removeAttribute('src')}
    const controls=root?.querySelector('.finale-replay-controls');if(controls)controls.hidden=!replay;
    const empty=element('finale-empty');if(empty)empty.hidden=!!replay;
    const again=element('finale-replay');if(again)again.disabled=!replay;
    const note=root?.querySelector('.finale-replay-controls>span');if(note)note.textContent=replay?'Saved on this device':'Demo replay';
    const save=element('finale-download');if(save)save.disabled=!file;
    const status=element('finale-download-status');if(status)status.textContent=file?'Stays on this device. Nothing is uploaded.':'No video is available for this player.';
  }
  function clearReplay(){element('finale-video')?.pause();if(replayUrl)URL.revokeObjectURL(replayUrl);replay=null;replayUrl=null}
  function clearDownload(){if(fileUrl)URL.revokeObjectURL(fileUrl);file=null;fileUrl=null}
  function clear(){clearReplay();clearDownload();mount()}
  /** The loser's take, shown in the finale's news box with Watch again. */
  function setVideo(blob){
    if(!isVideo(blob))throw new TypeError('Expected a nonempty video Blob.');
    clearReplay();replay=blob;replayUrl=URL.createObjectURL(blob);mount();
  }
  /** The file Download video saves. */
  function setDownload(blob,playerName='player'){
    if(!isVideo(blob))throw new TypeError('Expected a nonempty video Blob.');
    clearDownload();
    file=new File([blob],fileName(blob,playerName),{type:blob.type});
    fileUrl=URL.createObjectURL(file);mount();
  }
  function download(){
    if(!file)return;
    const link=document.createElement('a');link.href=fileUrl;link.download=file.name;
    document.body.append(link);link.click();link.remove();
    const status=element('finale-download-status');if(status)status.textContent=`Saved as ${file.name}.`;
  }
  function play(){const video=element('finale-video');if(!replay||!video)return;video.currentTime=0;video.play()?.catch(()=>{})}
  root?.addEventListener('click',event=>{
    const button=event.target.closest('[data-finale-action]');if(!button||button.disabled)return;
    if(button.dataset.finaleAction==='download')download();
  });
  globalThis.CopycatFinale=Object.freeze({setVideo,setDownload,clear,mount,replay:play,download,fileName});
})();
