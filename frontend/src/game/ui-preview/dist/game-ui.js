/* UI-only navigation and timer preview. No capture, tracking, scoring, or uploads. */
const gameRoot=document.querySelector('#game-screen');
const preview={crew:[],results:[],roundBaselineResults:[],mode:'quick',solo:false,round:0,challenger:0,screen:'creator',afterCamera:'creator',tracking:'ready',phase:'idle',seconds:10,count:3,run:0,latest:null,private:true,bpm:120,beatPlaying:true};
let previewTimer=null,scoreTimer=null;
const escapeUI=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const scoreNumber=n=>n===null?'—':Number.isInteger(n)?String(n):n.toFixed(1);
const getCreator=()=>preview.solo?{id:'reference',name:'Reference',avatar:'robot'}:preview.crew[preview.round];
const getChallengers=()=>preview.solo?preview.crew:preview.crew.filter(p=>p.id!==getCreator().id);
const getChallenger=()=>getChallengers()[preview.challenger];
const totalRounds=()=>preview.mode==='full'?preview.crew.length:1;

function ArcadeButton(label,action,secondary=false,disabled=false){return `<button class="${secondary?'ui-secondary':'ui-primary'}" data-action="${action}" ${disabled?'disabled':''}>${label}</button>`}
function GameHeader(title,label){const teamCapture=!preview.solo&&['creator','challenge'].includes(preview.screen);return `<div class="game-nav">${ArcadeButton('MENU','exit',true)}<div class="round-meta"><span>${preview.solo?'SOLO':preview.mode==='full'?'FULL GAME':'QUICK GAME'}</span><span>ROUND ${preview.round+1} / ${totalRounds()}</span><span class="demo-tag">UI DEMO</span></div></div>${teamCapture?TeamPlayerStrip():''}<header class="game-heading"><div class="phase-label">${label}</div><h2 id="screen-title" tabindex="-1">${escapeUI(title)}</h2></header>`}
function TeamPlayerStrip(){const creator=getCreator(),active=preview.screen==='creator'?creator:getChallenger();return `<ol class="team-player-strip" aria-label="Team players" style="--team-size:${preview.crew.length}">${preview.crew.map((p,i)=>{const current=p.id===active.id;const role=p.id===creator.id?'CREATOR':current?'YOUR TURN':'WATCHING';return `<li class="team-player ${current?'current-player':''}" style="--slot-color:${crewColors[i%crewColors.length]}" ${current?'aria-current="true"':''}><span class="hud-avatar">${portrait(p.avatar)}</span><span class="hud-player-text"><strong>${escapeUI(p.name)}</strong><span>${role}</span></span><span class="hud-slot">P${i+1}</span></li>`}).join('')}</ol>`}
function PlayerIdentity(p,kind){return `<div class="player-identity"><span class="identity-avatar">${portrait(p.avatar)}</span><div><span class="identity-kind">${kind}</span><strong>${escapeUI(p.name)}</strong></div></div>`}
function poseOutline(){return '<svg class="pose-outline" viewBox="0 0 180 240" aria-hidden="true"><path d="M70 22h40v40H70zM60 82h60v65H60zM60 89l-33 44-15-11 31-50zM120 89l33 44 15-11-31-50zM65 146h22l-13 72H48zM93 146h22l17 72h-26z" fill="currentColor"/><path d="M6 30V6h26m116 0h26v24M6 210v24h26m116 0h26v-24" fill="none" stroke="currentColor" stroke-width="3"/></svg>'}
function VideoPanel({label,player,original=false,large=false}){
  const denied=!original&&preview.tracking==='denied';
  return `<section class="video-panel ${large?'large-video':''} ${original?'original-video':'camera-video'} ${!original&&preview.tracking==='body'?'body-missing':''}" aria-label="${label}"><div class="video-panel-head"><span>${label}</span><strong>${escapeUI(player.name)}</strong></div><div class="video-placeholder">${denied?'<svg class="camera-off" viewBox="0 0 80 64" aria-hidden="true"><path d="M8 14h42v36H8zM50 27l22-12v34L50 37M7 4l65 56" fill="none" stroke="currentColor" stroke-width="5"/></svg>':poseOutline()}<strong>${original?'Original video placeholder':denied?'Camera access denied':'Webcam placeholder'}</strong><span>${original?'No reference recording connected':denied?'Allow camera access when the recorder is integrated.':'No camera or pose tracker connected'}</span></div>${!original?'<div id="capture-overlay" class="capture-overlay" aria-live="polite"></div>':''}</section>`;
}
const trackingStates={ready:{label:'Tracking ready (demo)',help:'Keep your full body inside the frame.'},body:{label:'Full body not detected (demo)',help:'Step back so your head and feet fit in the frame.'},denied:{label:'Camera access denied (demo)',help:'Enable camera permission to use the integrated recorder.'},waiting:{label:'Waiting for tracking (demo)',help:'The recorder will enable capture when tracking is ready.'}};
function RecordingControls(){const status=trackingStates[preview.tracking];return `<div class="capture-controls"><div class="tracking-status ${preview.tracking==='ready'?'tracking-ready':'tracking-warning'}"><strong id="tracking-label">${status.label}</strong><span>${status.help}</span></div><label class="preview-state">Preview state<select id="tracking-state" ${preview.phase!=='idle'?'disabled':''}>${Object.entries(trackingStates).map(([key,state])=>`<option value="${key}" ${preview.tracking===key?'selected':''}>${state.label.replace(' (demo)','')}</option>`).join('')}</select></label>${ArcadeButton('PREVIEW RECORDING','record',false,preview.tracking!=='ready'||preview.phase!=='idle')}${!preview.solo?ArcadeButton('SKIP','skip',true):''}</div>${preview.solo?`<div class="capture-progress"><div><span id="capture-phase">10-second recording preview</span><strong id="capture-time">10s</strong></div><progress id="capture-progress" value="0" max="10" aria-label="Recording progress">0%</progress></div><div class="capture-bottom"><span>No video is being recorded.</span>${ArcadeButton('SKIP PREVIEW','skip',true)}</div>`:BeatGuide()}`}
function BeatGuide(){return `<section class="beat-guide" aria-label="Visual metronome" style="--beat-duration:${60/preview.bpm}s"><progress id="capture-progress" value="0" max="10" aria-label="Recording progress">0%</progress><div class="beat-guide-inner"><div class="beat-time"><strong id="capture-time">10s</strong><span id="capture-phase">Recording preview</span></div><div class="beat-visual"><div class="beat-lane" aria-hidden="true"><div class="beat-flow"></div><div class="beat-hit-line"></div><div class="beat-hit-square"></div></div><div class="beat-count" aria-hidden="true">${[1,2,3,4].map(n=>`<span data-beat="${n}" ${n===1?'class="active-beat"':''}>${n}</span>`).join('')}</div></div><div class="beat-tools"><label>DEMO BPM<input id="beat-bpm" type="number" min="60" max="180" step="5" value="${preview.bpm}" aria-label="Metronome tempo in beats per minute"></label><button class="ui-secondary" data-action="beat-toggle" aria-label="${preview.beatPlaying?'Pause':'Start'} beat guide" aria-pressed="${preview.beatPlaying}">${preview.beatPlaying?'PAUSE':'PLAY'}</button></div></div></section>`}
function creatorScreen(){const p=getCreator();return `${GameHeader(p.name,'CREATOR')}${VideoPanel({label:'CREATOR CAMERA',player:p,large:true})}${RecordingControls()}`}
function challengeScreen(){const p=getChallenger();return `${GameHeader(p.name,'COPY CHALLENGE')}<div class="challenge-count">CHALLENGER ${preview.challenger+1} / ${getChallengers().length}</div><div class="video-pair">${VideoPanel({label:'ORIGINAL',player:getCreator(),original:true})}${VideoPanel({label:'YOU',player:p})}</div>${RecordingControls()}`}
function ScoreDisplay(score){return `<div class="score-display" aria-label="${score} out of 100"><span>${score}</span><span class="score-denominator">/100</span></div>`}
function ScoreBreakdown(score,weak){return `<dl class="score-breakdown">${['arms','legs','torso','timing'].map(part=>`<div class="score-part ${part===weak?'weakest':''}"><dt>${part}<span>${part===weak?'LOWEST':''}</span></dt><dd>${score[part]}<span>/100</span></dd><div class="score-track" aria-hidden="true"><span style="width:${score[part]}%"></span></div></div>`).join('')}</dl>`}
function scoreScreen(){const result=preview.latest,p=getChallenger(),weak=weakestPart(result.score);return `${GameHeader(p.name,'SCORE REVEAL')}<div class="score-stage"><div class="result-player">${portrait(p.avatar)}</div><div id="evaluating" class="evaluating" role="status">Evaluating preview<span class="evaluating-dots" aria-hidden="true">...</span></div><div id="score-result" hidden><div class="fixture-label">DEMO SCORE</div>${ScoreDisplay(result.score.total)}</div></div><div id="score-details" hidden>${ScoreBreakdown(result.score,weak)}<div class="result-footer"><p>${escapeUI(CopycatDemoData.feedback[weak])}</p>${ArcadeButton('CONTINUE','score-next')}</div></div>`}
function Leaderboard(rows,compact=false,animated=false){let rank=0;const shown=animated?demoRankings(preview.crew,preview.roundBaselineResults):rows;const scored=shown.filter(r=>r.average!==null);const loser=scored.at(-1);return `<div class="leaderboard ${compact?'compact-board':''} ${animated?'animated-board':''}"><div class="board-labels"><span>RANK / PLAYER</span><span>AVG SCORE</span></div><ol aria-label="Player rankings">${shown.map(row=>`<li data-player-id="${escapeUI(row.player.id)}" class="rank-row ${row===scored[0]?'first-place':''} ${row===loser&&scored.length>1?'last-place':''}"><span class="rank-number">${row.average===null?'—':++rank}</span><span class="rank-avatar">${portrait(row.player.avatar)}</span><div class="rank-name"><strong>${escapeUI(row.player.name)}</strong><span class="rank-attempts">${row.average===null?(animated?'No previous score':'Creator (not scored)'):`${row.attempts.length} ${row.attempts.length===1?'performance':'performances'}`}</span></div>${animated?'<span class="rank-change" aria-label="Rank unchanged"></span>':''}<strong class="rank-score"><span class="rank-value">${scoreNumber(row.average)}</span><small ${row.average===null?'hidden':''}>/100</small></strong></li>`).join('')}</ol>${animated?'<p id="rank-announcement" class="sr-only" role="status"></p>':''}</div>`}
function leaderboardScreen(){const hasNext=preview.mode==='full'&&preview.round+1<preview.crew.length;return `${GameHeader('LEADERBOARD','ROUND RESULTS')}<div class="leaderboard-layout">${Leaderboard(demoRankings(preview.crew,preview.results),false,true)}<aside class="next-round">${hasNext?PlayerIdentity(preview.crew[preview.round+1],'NEXT CREATOR'):'<div class="round-complete">FINAL ROUND<br>COMPLETE</div>'}<p class="data-note">Demo scores. Ranked by average.${hasNext?'':' Unscored creators are excluded.'}</p>${ArcadeButton(hasNext?'NEXT ROUND':'VIEW FINALE',hasNext?'round-next':'finale')}</aside></div>`}
function NewsOverlay(loser,worst){const weak=weakestPart(worst.score);return `<div class="news-top"><span class="channel-brand">CCN <small>COPYCAT NEWS</small></span><span class="news-source">DEMO REPLAY PLACEHOLDER</span></div><div class="news-banner">BREAKING NEWS</div><div class="news-video">${poseOutline()}<strong>Player replay placeholder</strong><span>No recorded footage connected</span><span class="news-player-name">${escapeUI(loser.player.name)}</span></div><div class="news-headline"><span>PERFORMANCE REPORT</span><h3>${CopycatDemoData.headlines[weak]}</h3></div><div class="news-ticker" aria-label="Performance statistics"><div>${escapeUI(loser.player.name)} / AVERAGE ${scoreNumber(loser.average)}/100 &nbsp; / &nbsp; LOWEST PERFORMANCE ${worst.score.total}/100 &nbsp; / &nbsp; ${weak.toUpperCase()} ${worst.score[weak]}/100</div></div>`}
function finaleScreen(){const rows=demoRankings(preview.crew,preview.results),loser=rows.filter(r=>r.average!==null).at(-1);if(!loser)return `${GameHeader('NO RESULTS','FINALE')}${ArcadeButton('MENU','exit')}`;const worst=loser.attempts.reduce((a,b)=>a.score.total<=b.score.total?a:b);return `${GameHeader('FINAL RESULTS','BREAKING NEWS')}<div class="finale-layout"><div class="broadcast" id="broadcast">${NewsOverlay(loser,worst)}</div><aside class="final-standings"><h3>FINAL RANKING</h3>${Leaderboard(rows,true)}<div class="news-stats"><span>AVERAGE TIMING<strong>${scoreNumber(loser.timing)}<small>/100</small></strong></span><span>LOWEST SCORE<strong>${worst.score.total}<small>/100</small></strong></span></div></aside></div><div class="finale-controls"><div class="replay-actions">${ArcadeButton('REPLAY PREVIEW','replay',true)}<button class="ui-secondary privacy-button" data-action="private" aria-pressed="true">✓ KEEP PRIVATE</button></div>${ArcadeButton('RETURN TO MENU','exit')}</div><p class="privacy-note" id="privacy-note">No video is captured, uploaded, or shared by this UI demo.</p>`}

function clearPreviewTimers(){clearInterval(previewTimer);clearTimeout(scoreTimer);previewTimer=null;scoreTimer=null;stopBeatGuide();stopRankAnimation();stopCameraCheck()}
function renderPreview(){
  clearPreviewTimers();
  gameRoot.innerHTML=({camera:CameraCheckScreen,creator:creatorScreen,challenge:challengeScreen,score:scoreScreen,leaderboard:leaderboardScreen,finale:finaleScreen}[preview.screen]||creatorScreen)();
  gameRoot.classList.toggle('camera-check-screen',preview.screen==='camera');
  gameRoot.classList.toggle('finale-screen',preview.screen==='finale');
  const teamCapture=!preview.solo&&['creator','challenge'].includes(preview.screen);
  gameRoot.classList.toggle('team-capture',teamCapture);
  document.querySelector('.arcade').classList.toggle('team-capture-active',teamCapture);
  document.querySelector('.arcade').classList.toggle('news-active',preview.screen==='finale');
  gameRoot.querySelector('#screen-title')?.focus();window.scrollTo(0,0);
  if(teamCapture&&preview.beatPlaying)startBeatGuide();
  if(preview.screen==='leaderboard')animateRankings();
  if(preview.screen==='score'){const details=()=>{gameRoot.querySelector('#score-details').hidden=false};const reveal=()=>{gameRoot.querySelector('#evaluating').hidden=true;gameRoot.querySelector('#score-result').hidden=false;blip(660)};if(matchMedia('(prefers-reduced-motion: reduce)').matches){reveal();details()}else scoreTimer=setTimeout(()=>{reveal();scoreTimer=setTimeout(details,180)},650)}
}
function enterPreview(crew,mode,solo=false){
  clearPreviewTimers();Object.assign(preview,{crew:crew.map(p=>({...p})),results:[],roundBaselineResults:[],mode,solo,round:0,challenger:0,screen:'camera',afterCamera:solo?'challenge':'creator',tracking:'ready',phase:'idle',seconds:10,count:3,latest:null,private:true,bpm:120,beatPlaying:true});
  homeScreen.hidden=true;lobby.hidden=true;gameRoot.hidden=false;document.querySelector('.arcade').classList.add('in-game');document.querySelector('.arcade').classList.remove('in-lobby');renderPreview();
}
function startTeamPreview(){enterPreview(players,document.querySelector('input[name="game-length"]:checked').value)}
function startSoloPreview(){enterPreview([{id:'solo',name:'You',avatar:'cat'}],'quick',true)}
function leavePreview(){clearPreviewTimers();preview.run++;gameRoot.hidden=true;gameRoot.replaceChildren();document.querySelector('.arcade').classList.remove('in-game','news-active','team-capture-active');goHome()}
function finishCapture(){
  clearPreviewTimers();preview.run++;preview.phase='idle';
  if(preview.screen==='creator'){preview.screen='challenge';preview.challenger=0;renderPreview();return}
  const p=getChallenger();const fixture=CopycatDemoData.scores[(preview.round*3+preview.challenger)%CopycatDemoData.scores.length];
  preview.latest={playerId:p.id,creatorId:getCreator().id,round:preview.round+1,score:{...fixture},videoUrl:null,source:'demo'};
  preview.results.push(preview.latest);preview.screen='score';renderPreview();
}
function updateCaptureUI(){const countdown=preview.phase==='countdown',recording=preview.phase==='recording';const overlay=gameRoot.querySelector('#capture-overlay');if(!overlay)return;overlay.innerHTML=countdown?`<span class="countdown-number">${preview.count}</span>`:recording?'<span class="recording-label">RECORDING PREVIEW</span>':'';gameRoot.querySelector('#capture-phase').textContent=countdown?'Get ready':recording?'Recording preview':'Complete';gameRoot.querySelector('#capture-time').textContent=countdown?String(preview.count):`${preview.seconds}s`;gameRoot.querySelector('#capture-progress').value=countdown?0:10-preview.seconds;}
function startCapturePreview(){
  if(preview.tracking!=='ready'||preview.phase!=='idle')return;
  preview.phase='countdown';preview.count=3;preview.seconds=10;const run=++preview.run;
  gameRoot.querySelector('[data-action="record"]').disabled=true;gameRoot.querySelector('#tracking-state').disabled=true;updateCaptureUI();
  const bpmInput=gameRoot.querySelector('#beat-bpm');if(bpmInput)bpmInput.disabled=true;
  previewTimer=setInterval(()=>{if(run!==preview.run)return clearPreviewTimers();if(preview.phase==='countdown'){preview.count--;blip(330);if(preview.count<=0)preview.phase='recording'}else preview.seconds--;updateCaptureUI();if(preview.phase==='recording'&&preview.seconds<=0)finishCapture()},1000);
}
function setBeatTempo(value){if(value===preview.bpm)return;preview.bpm=value;gameRoot.querySelector('.beat-guide')?.style.setProperty('--beat-duration',`${60/value}s`);if(preview.beatPlaying)startBeatGuide()}
gameRoot.addEventListener('input',e=>{if(e.target.id==='beat-bpm'&&e.target.value!==''){const value=Number(e.target.value);if(Number.isFinite(value)&&value>=60&&value<=180)setBeatTempo(Math.round(value))}});
gameRoot.addEventListener('focusout',e=>{if(e.target.id==='beat-bpm'){const value=e.target.value===''?preview.bpm:Number(e.target.value);const bounded=Number.isFinite(value)?Math.max(60,Math.min(180,Math.round(value))):preview.bpm;e.target.value=String(bounded);setBeatTempo(bounded)}});
gameRoot.addEventListener('change',e=>{if(e.target.id==='tracking-state'){preview.tracking=e.target.value;renderPreview();gameRoot.querySelector('#tracking-state').focus()}});
gameRoot.addEventListener('click',e=>{
  const b=e.target.closest('[data-action]');if(!b||b.disabled)return;
  switch(b.dataset.action){
    case'exit':leavePreview();break;
    case'record':startCapturePreview();break;
    case'skip':finishCapture();break;
    case'beat-toggle':preview.beatPlaying=!preview.beatPlaying;b.textContent=preview.beatPlaying?'PAUSE':'PLAY';b.setAttribute('aria-label',`${preview.beatPlaying?'Pause':'Start'} beat guide`);b.setAttribute('aria-pressed',String(preview.beatPlaying));if(preview.beatPlaying)startBeatGuide();else stopBeatGuide();break;
    case'score-next':if(preview.challenger+1<getChallengers().length){preview.challenger++;preview.screen='challenge';preview.tracking='ready'}else preview.screen='leaderboard';renderPreview();break;
    case'round-next':preview.roundBaselineResults=preview.results.slice();preview.round++;preview.challenger=0;preview.screen='creator';preview.phase='idle';preview.tracking='ready';renderPreview();break;
    case'finale':preview.screen='finale';renderPreview();break;
    case'replay':{const broadcast=gameRoot.querySelector('#broadcast');broadcast.classList.remove('replay-flash');void broadcast.offsetWidth;broadcast.classList.add('replay-flash');gameRoot.querySelector('#privacy-note').textContent='Replay preview only. No player footage is connected.';break}
    case'private':gameRoot.querySelector('#privacy-note').textContent='Kept private. This demo has no sharing or upload function.';break;
  }
});
let beatTimer=null;
function stopBeatGuide(){clearTimeout(beatTimer);beatTimer=null;gameRoot.querySelector('.beat-guide')?.classList.remove('beat-playing')}
function beatClick(downbeat){if(!soundOn)return;audio??=new(window.AudioContext||window.webkitAudioContext)();const o=audio.createOscillator(),g=audio.createGain();o.type='triangle';o.frequency.value=downbeat?1000:700;g.gain.setValueAtTime(.05,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.035);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+.04)}
function startBeatGuide(){stopBeatGuide();const guide=gameRoot.querySelector('.beat-guide');if(!guide||!preview.beatPlaying||document.hidden)return;const beatMs=60000/preview.bpm;let step=-1;const started=performance.now();void guide.offsetWidth;guide.classList.add('beat-playing');function tick(){if(!guide.isConnected||!preview.beatPlaying||document.hidden)return;const current=Math.floor((performance.now()-started)/beatMs);if(step!==current){step=current;guide.querySelectorAll('[data-beat]').forEach(el=>el.classList.toggle('active-beat',Number(el.dataset.beat)===step%4+1));beatClick(step%4===0)}const untilNext=started+(step+1)*beatMs-performance.now();beatTimer=setTimeout(tick,Math.max(1,untilNext))}tick()}
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopBeatGuide();else if(!preview.solo&&['creator','challenge'].includes(preview.screen)&&preview.beatPlaying)startBeatGuide()});
// Optional, explicit presentation harness. Does not run on the normal entry path.
// Example: index.html?demo=score or ?demo=finale. All results remain demo fixtures.
function openDemoScreen(name){
  const sample=[{id:101,name:'Alex',avatar:'cat'},{id:102,name:'Jamie',avatar:'rabbit'},{id:103,name:'Riley',avatar:'frog'},{id:104,name:'Taylor',avatar:'fox'}];
  enterPreview(sample,'quick');
  if(name==='camera'){applyCameraDemoState();return}
  if(name==='creator'){preview.screen='creator';renderPreview();return}
  preview.screen='challenge';
  if(['score','leaderboard','finale'].includes(name)){
    preview.results=sample.slice(1).map((p,i)=>({playerId:p.id,creatorId:101,round:1,score:{...CopycatDemoData.scores[i]},source:'demo',videoUrl:null}));
    preview.latest=preview.results[0];preview.screen=name;
    if(name==='leaderboard'){preview.roundBaselineResults=preview.results.slice();preview.results=preview.roundBaselineResults.concat([{playerId:101,creatorId:102,score:{...CopycatDemoData.scores[3]}},{playerId:103,creatorId:102,score:{...CopycatDemoData.scores[2]}},{playerId:104,creatorId:102,score:{...CopycatDemoData.scores[1]}}]);preview.mode='full';preview.round=1;}
  }
  renderPreview();
}
const requestedDemo=new URLSearchParams(location.search).get('demo');
if(['camera','creator','challenge','score','leaderboard','finale'].includes(requestedDemo))openDemoScreen(requestedDemo);


