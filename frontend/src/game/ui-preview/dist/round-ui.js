/* Presentation-only score movement and an opt-in, local webcam preview. */
let rankFrame=null,rankDelay=null,rankEpoch=0,rankAnimations=[],rankVoices=[];
let checkStream=null,checkEpoch=0,checkReady=false;

function stopRankSounds(){rankVoices.forEach(node=>{try{node.stop()}catch{}});rankVoices=[]}
function stopRankAnimation(){rankEpoch++;cancelAnimationFrame(rankFrame);clearTimeout(rankDelay);rankAnimations.forEach(a=>a.cancel());rankAnimations=[];rankFrame=null;rankDelay=null;stopRankSounds()}
const arcadeCues = {
  floor: [220, 330, 440, 660],
  turn: [660, 880],
  count: [392],
  go: [784, 1047],
  tally: [494],
  up: [440, 554, 740],
  down: [440, 349, 262],
  score: [523, 659, 784],
  finale: [330, 440, 554, 880]
};

function playCue(name, delay = 0) {
  if (!soundOn || document.hidden) return;
  const Engine = window.AudioContext || window.webkitAudioContext;
  if (!Engine) return;
  audio ??= new Engine();
  const epoch = rankEpoch;
  const schedule = () => {
    if (epoch !== rankEpoch || !soundOn || document.hidden) return;
    arcadeCues[name].forEach((pitch, index) => {
      const start = audio.currentTime + delay + index * 0.065;
      const duration = name === 'tally' ? 0.035 : 0.1;
      const voice = audio.createOscillator();
      const envelope = audio.createGain();
      voice.type = name === 'count' || name === 'tally' ? 'square' : 'triangle';
      voice.frequency.value = pitch;
      envelope.gain.setValueAtTime(0.001, start);
      envelope.gain.exponentialRampToValueAtTime(name === 'tally' ? 0.012 : 0.045, start + 0.005);
      envelope.gain.exponentialRampToValueAtTime(0.001, start + duration);
      voice.connect(envelope);
      envelope.connect(audio.destination);
      rankVoices.push(voice);
      voice.onended = () => {
        voice.disconnect();
        envelope.disconnect();
        rankVoices = rankVoices.filter(node => node !== voice);
      };
      voice.start(start);
      voice.stop(start + duration);
    });
  };
  if (audio.state === 'running') schedule();
  else audio.resume().then(schedule).catch(() => {});
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
      else if(movement.isNew)badge.setAttribute('aria-label','New entry');
      else badge.setAttribute('aria-label','Rank unchanged');
    }
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(reduced){finish();return}
    for(const [id,el] of elements){const delta=positions.get(id)-el.getBoundingClientRect().top;if(delta){el.style.zIndex=delta>0?'2':'1';const animation=el.animate([{transform:`translateY(${delta}px)`},{transform:'translateY(0)'}],{duration:700,easing:'cubic-bezier(.22,.8,.3,1)'});rankAnimations.push(animation)}}
    const directions=[...transition.changes.values()];const hasUp=directions.some(change=>change.delta>0),hasDown=directions.some(change=>change.delta<0);
    if(hasUp)playCue('up');if(hasDown)playCue('down',hasUp?.22:0);
    rankDelay=setTimeout(finish,720);
  };
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){setValues(1);reorder();return}
  const changesScore = transition.after.some(row => row.average !== null &&
    row.average !== previous.get(String(row.player.id))?.average);
  let lastTick = -1;
  const start=performance.now();
  const frame=now=>{if(epoch!==rankEpoch||!board.isConnected)return;const t=Math.min(1,(now-start)/900);const tick = Math.min(6, Math.floor(t * 7));
    if (changesScore && tick !== lastTick) { playCue('tally'); lastTick = tick; }
    setValues(1-Math.pow(1-t,3));if(t<1)rankFrame=requestAnimationFrame(frame);else{setValues(1);board.dataset.animationPhase='scores-complete';rankDelay=setTimeout(reorder,120)}};
  setValues(0);rankFrame=requestAnimationFrame(frame);
}

function CameraCheckScreen(){return `${GameHeader('CAMERA CHECK','')}<div class="camera-check-layout"><section class="camera-check-stage" aria-label="Camera preview"><div class="camera-check-viewport"><video id="check-video" autoplay muted playsinline hidden aria-label="Local webcam preview"></video><div id="check-placeholder" class="camera-check-placeholder">${poseOutline()}<strong id="camera-placeholder-title">Camera off</strong></div></div></section><aside class="camera-check-settings"><div id="camera-demo-state" class="demo-tag" hidden>SIMULATED STATE</div><div class="camera-check-status" hidden><strong id="camera-status" role="status"></strong><span id="camera-status-detail"></span></div><p>Challenge turns are filmed for the breaking-news replay. You choose whether to send it after the game.</p><div class="camera-check-actions">${ArcadeButton('ENABLE CAMERA','camera-enable',true)}${ArcadeButton('CONTINUE','camera-continue',false,true)}${ArcadeButton('CONTINUE DEMO','camera-demo',true)}</div></aside></div>`}
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
  status.parentElement.hidden=false;status.textContent=message.title;status.classList.add('camera-status-error');document.querySelector('#camera-status-detail').textContent=message.detail;
  document.querySelector('#camera-placeholder-title').textContent=message.title;
  document.querySelector('#check-video').hidden=true;document.querySelector('#check-placeholder').hidden=false;
  document.querySelector('[data-action="camera-continue"]').disabled=true;
  const enable=document.querySelector('[data-action="camera-enable"]');enable.disabled=false;enable.textContent='TRY CAMERA';document.querySelector('#camera-demo-state').hidden=!simulated;
}
function applyCameraDemoState(){const state=new URLSearchParams(location.search).get('camera-state');if(['denied','missing','busy'].includes(state)){showCameraFailure(state,true);return true}return false}
async function enableCameraCheck(){
  stopCameraCheck();const epoch=checkEpoch,enable=document.querySelector('[data-action="camera-enable"]');if(!enable)return;
  enable.disabled=true;document.querySelector('[data-action="camera-continue"]').disabled=true;document.querySelector('#camera-demo-state').hidden=true;const status=document.querySelector('#camera-status');status.parentElement.hidden=false;status.classList.remove('camera-status-error');status.textContent='Requesting camera…';document.querySelector('#camera-status-detail').textContent='Respond to the browser permission prompt.';
  if(!navigator.mediaDevices?.getUserMedia){showCameraFailure('unavailable');return}
  try{
    const stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720},facingMode:'user'},audio:false});
    if(epoch!==checkEpoch||preview.screen!=='camera'){stream.getTracks().forEach(track=>track.stop());return}
    checkStream=stream;const video=document.querySelector('#check-video');video.hidden=false;document.querySelector('#check-placeholder').hidden=true;
    const ready=()=>{if(epoch!==checkEpoch||preview.screen!=='camera'||!stream.active)return;checkReady=true;status.parentElement.hidden=true;status.textContent='Camera ready';document.querySelector('#camera-status-detail').textContent='Check your head and feet are visible.';document.querySelector('[data-action="camera-continue"]').disabled=false;enable.disabled=false;enable.textContent='RESTART CAMERA'};
    video.onloadeddata=ready;video.srcObject=stream;await video.play();if(video.readyState>=2)ready();
    stream.getVideoTracks().forEach(track=>{track.onended=()=>{if(epoch===checkEpoch)showCameraFailure('ended')}});
  }catch(error){if(epoch!==checkEpoch||preview.screen!=='camera')return;stopCameraCheck();showCameraFailure(cameraFailureKind(error.name))}
}
document.querySelector('#game-screen').addEventListener('click',e=>{
  const button=e.target.closest('[data-action]');if(!button||button.disabled)return;
  if(button.dataset.action==='camera-enable')enableCameraCheck();
  if(button.dataset.action==='camera-demo'||button.dataset.action==='camera-continue'&&checkReady&&checkStream?.active){preview.live=button.dataset.action==='camera-continue'||!!globalThis.CopycatTracking;preview.mock=button.dataset.action==='camera-demo';preview.screen='tempo';renderPreview()}
});
