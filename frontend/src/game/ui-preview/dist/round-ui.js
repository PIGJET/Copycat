/* Presentation-only score movement and an opt-in, local webcam preview. */
let rankFrame=null,rankDelay=null,rankEpoch=0,rankAnimations=[],rankVoices=[];
let checkStream=null,checkEpoch=0,checkReady=false;

function stopRankSounds(){rankVoices.forEach(node=>{try{node.stop()}catch{}});rankVoices=[]}
function stopRankAnimation(){rankEpoch++;cancelAnimationFrame(rankFrame);clearTimeout(rankDelay);rankAnimations.forEach(a=>a.cancel());rankAnimations=[];rankFrame=null;rankDelay=null;stopRankSounds()}
function playRankSound(direction,delay=0){
  if(!soundOn)return;
  const AudioEngine=window.AudioContext||window.webkitAudioContext;if(!AudioEngine)return;
  audio??=new AudioEngine();if(audio.state==='suspended')audio.resume().catch(()=>{});
  const notes=direction==='up'?[440,554,740]:[440,349,262];
  notes.forEach((frequency,i)=>{const at=audio.currentTime+delay+i*.065;const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.type='triangle';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(.035,at);gain.gain.exponentialRampToValueAtTime(.001,at+.09);oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(at);oscillator.stop(at+.1);rankVoices.push(oscillator)});
}
document.querySelector('#sound').addEventListener('click',()=>{if(!soundOn)stopRankSounds()});
function movementIcon(delta){return `<svg viewBox="0 0 18 18" aria-hidden="true"><path d="${delta>0?'M9 15V3M3 9l6-6 6 6':'M9 3v12M3 9l6 6 6-6'}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square"/></svg>`}
function animateRankings(){
  const board=document.querySelector('.animated-board');if(!board)return;
  const list=board.querySelector('ol'),transition=rankTransition(preview.crew,preview.roundBaselineResults,preview.results);
  const elements=new Map([...list.children].map(el=>[el.dataset.playerId,el]));
  const previous=new Map(transition.before.map(row=>[String(row.player.id),row]));
  const epoch=rankEpoch;board.setAttribute('aria-busy','true');board.dataset.animationPhase='counting';
  const setValues=progress=>transition.after.forEach(row=>{
    const el=elements.get(String(row.player.id)),value=el.querySelector('.rank-value');
    if(row.average===null){value.textContent='—';el.querySelector('.rank-score small').hidden=true;return}
    const from=previous.get(String(row.player.id))?.average??0;
    const number=from+(row.average-from)*progress;
    value.textContent=progress===1?scoreNumber(row.average):Number.isInteger(row.average)?String(Math.round(number)):number.toFixed(1);
    el.querySelector('.rank-score small').hidden=false;
  });
  const finish=()=>{if(epoch!==rankEpoch||!board.isConnected)return;board.dataset.animationPhase='complete';board.setAttribute('aria-busy','false');const leader=transition.after.find(row=>row.average!==null);board.querySelector('#rank-announcement').textContent=leader?`Rankings updated. ${leader.player.name} is first.`:'No scores yet.'};
  const reorder=()=>{
    if(epoch!==rankEpoch||!board.isConnected)return;
    board.dataset.animationPhase='moving';const positions=new Map([...elements].map(([id,el])=>[id,el.getBoundingClientRect().top]));
    let rank=0;const scored=transition.after.filter(row=>row.average!==null),last=scored.at(-1);
    for(const row of transition.after){
      const el=elements.get(String(row.player.id)),movement=transition.changes.get(row.player.id),badge=el.querySelector('.rank-change');
      list.appendChild(el);el.querySelector('.rank-number').textContent=row.average===null?'—':String(++rank);
      el.querySelector('.rank-attempts').textContent=row.average===null?'Creator (not scored)':`${row.attempts.length} ${row.attempts.length===1?'performance':'performances'}`;
      el.classList.toggle('first-place',row===scored[0]);el.classList.toggle('last-place',row===last&&scored.length>1);
      badge.className='rank-change';badge.removeAttribute('role');badge.innerHTML='';
      if(movement.delta){const up=movement.delta>0;badge.classList.add(up?'rank-up':'rank-down');badge.setAttribute('role','img');badge.setAttribute('aria-label',`Moved ${up?'up':'down'} ${Math.abs(movement.delta)} ${Math.abs(movement.delta)===1?'place':'places'}`);badge.innerHTML=movementIcon(movement.delta)+`<span>${Math.abs(movement.delta)}</span>`}
      else if(movement.isNew){badge.classList.add('rank-new');badge.setAttribute('aria-label','New entry');badge.textContent='NEW'}
      else badge.setAttribute('aria-label','Rank unchanged');
    }
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(reduced){finish();return}
    for(const [id,el] of elements){const delta=positions.get(id)-el.getBoundingClientRect().top;if(delta){el.style.zIndex=delta>0?'2':'1';const animation=el.animate([{transform:`translateY(${delta}px)`},{transform:'translateY(0)'}],{duration:700,easing:'cubic-bezier(.22,.8,.3,1)'});rankAnimations.push(animation)}}
    const directions=[...transition.changes.values()];const hasUp=directions.some(change=>change.delta>0),hasDown=directions.some(change=>change.delta<0);
    if(hasUp)playRankSound('up');if(hasDown)playRankSound('down',hasUp?.22:0);
    rankDelay=setTimeout(finish,720);
  };
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){setValues(1);reorder();return}
  const start=performance.now();
  const frame=now=>{if(epoch!==rankEpoch||!board.isConnected)return;const t=Math.min(1,(now-start)/900);setValues(1-Math.pow(1-t,3));if(t<1)rankFrame=requestAnimationFrame(frame);else{setValues(1);board.dataset.animationPhase='scores-complete';rankDelay=setTimeout(reorder,120)}};
  setValues(0);rankFrame=requestAnimationFrame(frame);
}

function CameraCheckScreen(){return `${GameHeader('CAMERA CHECK','SETUP')}<div class="camera-check-layout"><section class="camera-check-stage" aria-label="Camera preview"><div class="video-panel-head"><span>CAMERA PREVIEW</span><span class="camera-local-label">LOCAL ONLY</span></div><div class="camera-check-viewport"><video id="check-video" autoplay muted playsinline hidden aria-label="Local webcam preview"></video><div id="check-placeholder" class="camera-check-placeholder">${poseOutline()}<strong id="camera-placeholder-title">Camera off</strong><span>Enable your camera to check the framing.</span></div><div class="camera-frame-guide" aria-hidden="true"></div></div></section><aside class="camera-check-settings"><div id="camera-demo-state" class="demo-tag" hidden>SIMULATED STATE</div><div class="camera-check-status"><span>CAMERA</span><strong id="camera-status" role="status">Not enabled</strong><span id="camera-status-detail">No permission requested.</span></div><div class="camera-feed-info"><span>VIDEO FEED</span><strong id="camera-feed">Waiting for camera</strong></div><div class="camera-framing"><span>FRAMING</span><p>Step back until your head and feet fit inside the frame.</p><p class="data-note">Body tracking is not connected in this UI preview.</p></div><div class="camera-check-actions">${ArcadeButton('ENABLE CAMERA','camera-enable',true)}${ArcadeButton('CONTINUE','camera-continue',false,true)}${ArcadeButton('CONTINUE DEMO','camera-demo',true)}</div><p class="camera-privacy">Live preview only. Nothing is recorded or uploaded.</p></aside></div>`}
const cameraMessages={
  denied:{title:'Camera access denied',detail:'Allow camera access in your browser, then try again.'},
  missing:{title:'No camera found',detail:'Connect a webcam, then try again.'},
  busy:{title:'Camera unavailable',detail:'Close other apps using the camera, then try again.'},
  unavailable:{title:'Camera unavailable',detail:'Use a supported browser over HTTPS, or continue the UI demo.'},
  ended:{title:'Camera disconnected',detail:'Reconnect or re-enable the camera to continue.'}
};
function cameraFailureKind(name){return name==='NotAllowedError'||name==='SecurityError'?'denied':name==='NotFoundError'||name==='DevicesNotFoundError'?'missing':name==='NotReadableError'||name==='TrackStartError'?'busy':'unavailable'}
function stopCameraCheck(){checkEpoch++;checkReady=false;if(checkStream){checkStream.getTracks().forEach(track=>{track.onended=null;track.stop()});checkStream=null}const video=document.querySelector('#check-video');if(video)video.srcObject=null}
function showCameraFailure(kind,simulated=false){
  const message=cameraMessages[kind]||cameraMessages.unavailable;checkReady=false;
  const status=document.querySelector('#camera-status');if(!status)return;
  status.textContent=message.title;status.classList.add('camera-status-error');document.querySelector('#camera-status-detail').textContent=message.detail;
  document.querySelector('#camera-placeholder-title').textContent=message.title;
  document.querySelector('#check-video').hidden=true;document.querySelector('#check-placeholder').hidden=false;
  document.querySelector('#camera-feed').textContent='No video feed';document.querySelector('[data-action="camera-continue"]').disabled=true;
  const enable=document.querySelector('[data-action="camera-enable"]');enable.disabled=false;enable.textContent='TRY CAMERA';document.querySelector('#camera-demo-state').hidden=!simulated;
}
function applyCameraDemoState(){const state=new URLSearchParams(location.search).get('camera-state');if(['denied','missing','busy'].includes(state))showCameraFailure(state,true)}
async function enableCameraCheck(){
  stopCameraCheck();const epoch=checkEpoch,enable=document.querySelector('[data-action="camera-enable"]');if(!enable)return;
  enable.disabled=true;document.querySelector('#camera-demo-state').hidden=true;const status=document.querySelector('#camera-status');status.classList.remove('camera-status-error');status.textContent='Requesting camera…';document.querySelector('#camera-status-detail').textContent='Respond to the browser permission prompt.';
  if(!navigator.mediaDevices?.getUserMedia){showCameraFailure('unavailable');return}
  try{
    const stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720},facingMode:'user'},audio:false});
    if(epoch!==checkEpoch||preview.screen!=='camera'){stream.getTracks().forEach(track=>track.stop());return}
    checkStream=stream;const video=document.querySelector('#check-video');video.hidden=false;document.querySelector('#check-placeholder').hidden=true;
    const ready=()=>{if(epoch!==checkEpoch||preview.screen!=='camera'||!stream.active)return;checkReady=true;status.textContent='Camera ready';document.querySelector('#camera-status-detail').textContent='Check your head and feet are visible.';document.querySelector('#camera-feed').textContent=`${video.videoWidth} × ${video.videoHeight}`;document.querySelector('[data-action="camera-continue"]').disabled=false;enable.disabled=false;enable.textContent='RESTART CAMERA'};
    video.onloadeddata=ready;video.srcObject=stream;await video.play();if(video.readyState>=2)ready();
    stream.getVideoTracks().forEach(track=>{track.onended=()=>{if(epoch===checkEpoch)showCameraFailure('ended')}});
  }catch(error){if(epoch!==checkEpoch||preview.screen!=='camera')return;stopCameraCheck();showCameraFailure(cameraFailureKind(error.name))}
}
document.querySelector('#game-screen').addEventListener('click',e=>{
  const button=e.target.closest('[data-action]');if(!button||button.disabled)return;
  if(button.dataset.action==='camera-enable')enableCameraCheck();
  if(button.dataset.action==='camera-demo'||button.dataset.action==='camera-continue'&&checkReady&&checkStream?.active){preview.screen=preview.afterCamera;renderPreview()}
});
