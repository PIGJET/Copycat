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
function GameHeader(title,label){const teamCapture=!preview.solo&&['creator','challenge'].includes(preview.screen);return `<div class="game-nav">${ArcadeButton('MENU','exit',true)}<div class="round-meta"><span>${preview.solo?'SOLO':preview.mode==='full'?'FULL GAME':'QUICK GAME'}</span><span>ROUND ${preview.round+1} / ${totalRounds()}</span><span class="demo-tag">UI DEMO</span></div></div>${teamCapture?TeamPlayerStrip():''}<header class="game-heading">${label?`<div class="phase-label">${label}</div>`:''}<h2 id="screen-title" tabindex="-1">${escapeUI(title)}</h2></header>`}
function TeamPlayerStrip(){const creator=getCreator(),active=preview.screen==='creator'?creator:getChallenger();return `<ol class="team-player-strip" aria-label="Team players" style="--team-size:${preview.crew.length}">${preview.crew.map((p,i)=>{const current=p.id===active.id;const role=p.id===creator.id?'CREATOR':current?'YOUR TURN':'WATCHING';return `<li class="team-player ${current?'current-player':''}" style="--slot-color:${crewColors[i%crewColors.length]}" ${current?'aria-current="true"':''}><span class="hud-avatar">${portrait(p)}</span><span class="hud-player-text"><strong>${escapeUI(p.name)}</strong><span>${role}</span></span><span class="hud-slot">P${i+1}</span></li>`}).join('')}</ol>`}
function PlayerIdentity(p,kind){return `<div class="player-identity"><span class="identity-avatar">${portrait(p)}</span><div><span class="identity-kind">${kind}</span><strong>${escapeUI(p.name)}</strong></div></div>`}
function poseOutline(){return '<svg class="pose-outline" viewBox="0 0 180 240" aria-hidden="true"><path d="M70 22h40v40H70zM60 82h60v65H60zM60 89l-33 44-15-11 31-50zM120 89l33 44 15-11-31-50zM65 146h22l-13 72H48zM93 146h22l17 72h-26z" fill="currentColor"/><path d="M6 30V6h26m116 0h26v24M6 210v24h26m116 0h26v-24" fill="none" stroke="currentColor" stroke-width="3"/></svg>'}
function VideoPanel({label,player,original=false,large=false}){
  const denied=!original&&preview.tracking==='denied';
  return `<section class="video-panel ${large?'large-video':''} ${original?'original-video':'camera-video'} ${!original&&preview.tracking==='body'?'body-missing':''}" aria-label="${label}"><div class="video-panel-head"><span>${label}</span><strong>${escapeUI(player.name)}</strong></div><div class="video-placeholder">${denied?'<svg class="camera-off" viewBox="0 0 80 64" aria-hidden="true"><path d="M8 14h42v36H8zM50 27l22-12v34L50 37M7 4l65 56" fill="none" stroke="currentColor" stroke-width="5"/></svg>':poseOutline()}<strong>${original?'Original video placeholder':denied?'Camera access denied':'Webcam placeholder'}</strong><span>${original?'No reference recording connected':denied?'Allow camera access when the recorder is integrated.':'No camera or pose tracker connected'}</span></div>${!original?'<div id="capture-overlay" class="capture-overlay" aria-live="polite"></div>':''}</section>`;
}
const trackingStates={ready:{label:'Tracking ready (demo)',help:'Keep your full body inside the frame.'},body:{label:'Full body not detected (demo)',help:'Step back so your head and feet fit in the frame.'},denied:{label:'Camera access denied (demo)',help:'Enable camera permission to use the integrated recorder.'},waiting:{label:'Waiting for tracking (demo)',help:'The recorder will enable capture when tracking is ready.'}};
function RecordingControls(){const status=trackingStates[preview.tracking];return `<div class="capture-controls"><div class="tracking-status ${preview.tracking==='ready'?'tracking-ready':'tracking-warning'}"><strong id="tracking-label">${status.label}</strong><span>${status.help}</span></div><label class="preview-state">Preview state<select id="tracking-state" ${preview.phase!=='idle'?'disabled':''}>${Object.entries(trackingStates).map(([key,state])=>`<option value="${key}" ${preview.tracking===key?'selected':''}>${state.label.replace(' (demo)','')}</option>`).join('')}</select></label>${ArcadeButton('PREVIEW RECORDING','record',false,preview.tracking!=='ready'||preview.phase!=='idle')}${!preview.solo?ArcadeButton('SKIP','skip',true):''}</div>${BeatGuide()}${preview.solo?`<div class="capture-bottom"><span>No video is being recorded.</span>${ArcadeButton('SKIP PREVIEW','skip',true)}</div>`:''}`}
function BeatGuide(){return `<section class="beat-guide" aria-label="Visual metronome" style="--beat-duration:${60/preview.bpm}s"><progress id="capture-progress" value="0" max="10" aria-label="Recording progress">0%</progress><div class="beat-guide-inner"><div class="beat-time"><strong id="capture-time">10s</strong><span id="capture-phase">Recording preview</span></div><div class="beat-visual"><div class="beat-lane" aria-hidden="true"><div class="beat-flow"></div><div class="beat-hit-line"></div><div class="beat-hit-square"></div></div><div class="beat-count" aria-hidden="true">${[1,2,3,4].map(n=>`<span data-beat="${n}" ${n===1?'class="active-beat"':''}>${n}</span>`).join('')}</div></div><div class="beat-tools"><div class="beat-tempo"><span>BPM</span><strong>${preview.bpm}</strong></div><button class="ui-secondary" data-action="beat-toggle" aria-label="${preview.beatPlaying?'Pause':'Start'} beat guide" aria-pressed="${preview.beatPlaying}">${preview.beatPlaying?'PAUSE':'PLAY'}</button></div></div></section>`}
function TempoScreen(){return `${GameHeader('SELECT BPM','SETUP')}<div class="tempo-setup" style="--beat-duration:${60/preview.bpm}s"><p class="tempo-intro" id="tempo-help">Choose your tempo. Slower beats give you more time to move.</p><div class="tempo-value"><input id="tempo-bpm" type="number" min="60" max="180" step="5" value="${preview.bpm}" inputmode="numeric" aria-label="BPM" aria-describedby="tempo-help"><span>bpm</span></div><label class="sr-only" for="tempo-slider">Choose BPM</label><input id="tempo-slider" class="tempo-slider" type="range" min="60" max="180" step="5" value="${preview.bpm}"><div class="tempo-scale"><span>60</span><span>180</span></div><div class="tempo-beats" aria-hidden="true">${[0,1,2,3].map(i=>`<span style="--beat-index:${i}"></span>`).join('')}</div><div class="tempo-actions">${ArcadeButton('START GAME','tempo-start')}${ArcadeButton('BACK TO CAMERA','tempo-camera',true)}</div></div>`}
/* Dashboard presentation adapter. Capture and scores still use the existing preview state. */
function dashboardPortrait(player){return portrait(player)}
function DashboardPose(){return `<svg class="dashboard-pose" viewBox="0 0 340 320" aria-hidden="true"><g class="pose-ghost" fill="none" stroke="currentColor" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"><path d="M147 98L122 163L94 193M147 98L205 105L267 78M147 98L136 207L195 211L205 105M136 207L110 254L86 298M195 211L217 256L247 298"/></g><g fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><circle cx="168" cy="51" r="25"/><path d="M147 98L122 163L94 193M147 98L205 105L267 78M147 98L136 207L195 211L205 105M136 207L110 254L86 298M195 211L217 256L247 298"/></g><g class="pose-joints" fill="currentColor">${[[147,98],[122,163],[94,193],[205,105],[267,78],[136,207],[195,211],[110,254],[217,256],[86,298],[247,298]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="6"/>`).join('')}</g></svg>`}
function DashboardScores(active){
  const rows=demoRankings(preview.crew,preview.results);
  return `<aside class="dashboard-scores" aria-label="Round standings"><div class="dashboard-panel-title"><h3>Scores</h3><span>Average /100</span></div><ol>${rows.map(row=>{const current=row.player.id===active.id,leader=row.player.id===getCreator().id;return `<li class="dashboard-score-row ${current?'is-current':''}" ${current?'aria-current="true"':''}><span class="dashboard-avatar">${dashboardPortrait(row.player)}</span><span class="dashboard-score-player"><strong>${escapeUI(row.player.name)}</strong>${leader?'<span class="dashboard-leader" role="img" aria-label="Dance leader"><svg viewBox="0 0 28 24" aria-hidden="true"><path d="M3 7l6 5 5-10 5 10 6-5-3 14H6z" fill="currentColor"/></svg></span>':''}</span><strong class="dashboard-score-value ${row.average===null?'is-unavailable':''}">${scoreNumber(row.average)}</strong></li>`}).join('')}</ol></aside>`;
}
function DashboardBeatGuide(){return `<section class="beat-guide dashboard-beat" aria-label="Visual metronome"><div class="dashboard-beat-meta"><div class="beat-time"><strong id="capture-time">10s</strong><span id="capture-phase">Ready</span></div><span class="dashboard-tempo"><strong>${preview.bpm}</strong> BPM</span><button class="ui-secondary" data-action="beat-toggle" aria-label="${preview.beatPlaying?'Pause':'Start'} beat guide" aria-pressed="${preview.beatPlaying}">${preview.beatPlaying?'Pause':'Play'}</button></div><div class="beat-visual"><ol class="beat-count dashboard-timeline" aria-label="Four-count beat">${[1,2,3,4].map(n=>`<li data-beat="${n}" ${n===1?'class="active-beat"':''}><span class="dashboard-beat-dot" aria-hidden="true"></span><span>${n}</span></li>`).join('')}</ol></div><progress id="capture-progress" value="0" max="10" aria-label="Recording progress">0%</progress></section>`}
function dashboardTurnInstruction(){const leader=getCreator();return preview.phase==='countdown'?'Get ready to dance.':preview.screen==='creator'?'Create a dance for everyone to copy.':`Copy ${leader.name}’s dance moves.`}
function DanceDashboard(){
  const isLeader=preview.screen==='creator',active=isLeader?getCreator():getChallenger(),status=trackingStates[preview.tracking],ready=preview.tracking==='ready';
  return `<header class="dashboard-header"><div class="dashboard-brand"><button class="ui-secondary dashboard-menu" data-action="exit">Menu</button><span>COPY<span>CAT</span></span></div><div class="dashboard-round" role="status">Round <strong>${preview.round+1} / ${totalRounds()}</strong></div></header><div class="dashboard-turn"><h2 id="screen-title" tabindex="-1">${escapeUI(active.name)}’s turn</h2><p id="dashboard-instruction">${escapeUI(dashboardTurnInstruction())}</p></div><div class="dashboard-arena">${DashboardScores(active)}<div class="dashboard-stage"><div class="dashboard-camera-scene">${DashboardPose()}<span class="dashboard-camera-note">Camera preview not connected</span></div><div id="capture-overlay" class="capture-overlay" aria-live="polite"></div></div><aside class="dashboard-cue" aria-label="Dance reference"><h3>${escapeUI(getCreator().name)}’s move</h3><div class="dashboard-reference">${DashboardPose()}</div><p class="dashboard-reference-status">Reference clip unavailable</p></aside></div><div class="dashboard-controls"><div class="tracking-status tracking-warning" ${ready?'hidden':''}><strong id="tracking-label">${status.label.replace(' (demo)','')}</strong><span>${status.help}</span></div><div class="dashboard-primary-actions">${ArcadeButton('Start preview','record',false,!ready||preview.phase!=='idle')}${ArcadeButton('Skip turn','skip',true)}</div><details class="dashboard-review-settings"><summary aria-label="Settings" title="Settings"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 3 1-2h4l1 2 2 1 3-1 2 4-2 2v3l2 2-2 4-3-1-2 1-1 3h-4l-1-3-2-1-3 1-2-4 2-2V9L2 7l2-4 3 1z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="11" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg><span class="sr-only">Settings</span></summary><div class="dashboard-settings-panel"><label class="preview-state">Tracking state<select id="tracking-state" aria-label="Tracking state" ${preview.phase!=='idle'?'disabled':''}>${Object.entries(trackingStates).map(([key,state])=>`<option value="${key}" ${preview.tracking===key?'selected':''}>${state.label.replace(' (demo)','')}</option>`).join('')}</select></label><p>UI demo: camera and reference clips are not connected. Scores use demonstration data; no video is recorded.</p></div></details></div>${DashboardBeatGuide()}`;
}

function creatorScreen(){return DanceDashboard()}
function challengeScreen(){return DanceDashboard()}
function ScoreDisplay(score){return `<div class="score-display" aria-label="${score} out of 100"><span>${score}</span><span class="score-denominator">/100</span></div>`}
function ScoreBreakdown(score,weak){return `<dl class="score-breakdown">${['arms','legs','torso','timing'].map(part=>`<div class="score-part ${part===weak?'weakest':''}"><dt>${part}<span>${part===weak?'LOWEST':''}</span></dt><dd>${score[part]}<span>/100</span></dd><div class="score-track" aria-hidden="true"><span style="width:${score[part]}%"></span></div></div>`).join('')}</dl>`}
function scoreScreen(){const result=preview.latest,p=getChallenger(),weak=weakestPart(result.score);return `${GameHeader(p.name,'SCORE REVEAL')}<div class="score-stage"><div class="result-player">${portrait(p)}</div><div id="evaluating" class="evaluating" role="status">Evaluating preview<span class="evaluating-dots" aria-hidden="true">...</span></div><div id="score-result" hidden><div class="fixture-label">DEMO SCORE</div>${ScoreDisplay(result.score.total)}</div></div><div id="score-details" hidden>${ScoreBreakdown(result.score,weak)}<div class="result-footer"><p>${escapeUI(CopycatDemoData.feedback[weak])}</p>${ArcadeButton('CONTINUE','score-next')}</div></div>`}
function Leaderboard(rows,compact=false,animated=false){let rank=0;const shown=animated?demoRankings(preview.crew,preview.roundBaselineResults):rows;const scored=shown.filter(r=>r.average!==null);const loser=scored.at(-1);return `<div class="leaderboard ${compact?'compact-board':''} ${animated?'animated-board':''}"><div class="board-labels"><span>RANK / PLAYER</span><span>AVG SCORE</span></div><ol aria-label="Player rankings">${shown.map(row=>`<li data-player-id="${escapeUI(row.player.id)}" class="rank-row ${row===scored[0]?'first-place':''} ${row===loser&&scored.length>1?'last-place':''}"><span class="rank-number">${row.average===null?'—':++rank}</span><span class="rank-avatar">${portrait(row.player)}</span><div class="rank-name"><strong>${escapeUI(row.player.name)}</strong><span class="rank-attempts">${row.average===null?(animated?'No previous score':'Creator (not scored)'):`${row.attempts.length} ${row.attempts.length===1?'performance':'performances'}`}</span></div>${animated?'<span class="rank-change" aria-label="Rank unchanged"></span>':''}<strong class="rank-score"><span class="rank-value">${scoreNumber(row.average)}</span><small ${row.average===null?'hidden':''}>/100</small></strong></li>`).join('')}</ol>${animated?'<p id="rank-announcement" class="sr-only" role="status"></p>':''}</div>`}
function leaderboardScreen(){const hasNext=preview.mode==='full'&&preview.round+1<preview.crew.length;return `${GameHeader('LEADERBOARD','ROUND RESULTS')}<div class="leaderboard-layout">${Leaderboard(demoRankings(preview.crew,preview.results),false,true)}<aside class="next-round">${hasNext?PlayerIdentity(preview.crew[preview.round+1],'NEXT CREATOR'):'<div class="round-complete">FINAL ROUND<br>COMPLETE</div>'}<p class="data-note">Demo scores. Ranked by average.${hasNext?'':' Unscored creators are excluded.'}</p>${ArcadeButton(hasNext?'NEXT ROUND':'VIEW FINALE',hasNext?'round-next':'finale')}</aside></div>`}
function NewsOverlay(loser,worst){const weak=weakestPart(worst.score);return `<div class="news-top"><span class="channel-brand">CCN <small>COPYCAT NEWS</small></span><span class="news-source">DEMO REPLAY PLACEHOLDER</span></div><div class="news-banner">BREAKING NEWS</div><div class="news-video">${poseOutline()}<strong>Player replay placeholder</strong><span>No recorded footage connected</span><span class="news-player-name">${escapeUI(loser.player.name)}</span></div><div class="news-headline"><span>PERFORMANCE REPORT</span><h3>${CopycatDemoData.headlines[weak]}</h3></div><div class="news-ticker" aria-label="Performance statistics"><div>${escapeUI(loser.player.name)} / AVERAGE ${scoreNumber(loser.average)}/100 &nbsp; / &nbsp; LOWEST PERFORMANCE ${worst.score.total}/100 &nbsp; / &nbsp; ${weak.toUpperCase()} ${worst.score[weak]}/100</div></div>`}
function finaleScreen(){const rows=demoRankings(preview.crew,preview.results),loser=rows.filter(r=>r.average!==null).at(-1);if(!loser)return `${GameHeader('NO RESULTS','FINALE')}${ArcadeButton('MENU','exit')}`;const worst=loser.attempts.reduce((a,b)=>a.score.total<=b.score.total?a:b);return `${GameHeader('FINAL RESULTS','BREAKING NEWS')}<div class="finale-layout"><div class="broadcast" id="broadcast">${NewsOverlay(loser,worst)}</div><aside class="final-standings"><h3>FINAL RANKING</h3>${Leaderboard(rows,true)}<div class="news-stats"><span>AVERAGE TIMING<strong>${scoreNumber(loser.timing)}<small>/100</small></strong></span><span>LOWEST SCORE<strong>${worst.score.total}<small>/100</small></strong></span></div></aside></div><div class="finale-controls"><div class="replay-actions">${ArcadeButton('REPLAY PREVIEW','replay',true)}<button class="ui-secondary privacy-button" data-action="private" aria-pressed="true">✓ KEEP PRIVATE</button></div>${ArcadeButton('RETURN TO MENU','exit')}</div><p class="privacy-note" id="privacy-note">No video is captured, uploaded, or shared by this UI demo.</p>`}

function clearPreviewTimers(){clearInterval(previewTimer);clearTimeout(scoreTimer);previewTimer=null;scoreTimer=null;stopBeatGuide();stopRankAnimation();stopCameraCheck()}
function renderPreview(){
  clearPreviewTimers();
  gameRoot.innerHTML=({camera:CameraCheckScreen,tempo:TempoScreen,creator:creatorScreen,challenge:challengeScreen,score:scoreScreen,leaderboard:leaderboardScreen,finale:finaleScreen}[preview.screen]||creatorScreen)();
  gameRoot.classList.toggle('camera-check-screen',preview.screen==='camera');
  gameRoot.classList.toggle('tempo-setup-screen',preview.screen==='tempo');
  gameRoot.classList.toggle('finale-screen',preview.screen==='finale');
  const dashboardActive=['creator','challenge'].includes(preview.screen);
  gameRoot.classList.toggle('dance-dashboard',dashboardActive);
  document.querySelector('.arcade').classList.toggle('dashboard-active',dashboardActive);
  const teamCapture=!preview.solo&&dashboardActive;
  gameRoot.classList.toggle('team-capture',teamCapture);
  document.querySelector('.arcade').classList.toggle('team-capture-active',teamCapture);
  document.querySelector('.arcade').classList.toggle('news-active',preview.screen==='finale');
  gameRoot.querySelector('#screen-title')?.focus();window.scrollTo(0,0);
  if(preview.screen==='camera'&&!applyCameraDemoState())enableCameraCheck();
  if(['creator','challenge'].includes(preview.screen)&&preview.beatPlaying)startBeatGuide();
  if(preview.screen==='leaderboard')animateRankings();
  if(preview.screen==='score'){const details=()=>{gameRoot.querySelector('#score-details').hidden=false};const reveal=()=>{gameRoot.querySelector('#evaluating').hidden=true;gameRoot.querySelector('#score-result').hidden=false;blip(660)};if(matchMedia('(prefers-reduced-motion: reduce)').matches){reveal();details()}else scoreTimer=setTimeout(()=>{reveal();scoreTimer=setTimeout(details,180)},650)}
}
function enterPreview(crew,mode,solo=false,initialScreen='camera'){
  clearPreviewTimers();beatClock=null;Object.assign(preview,{crew:crew.map(p=>({...p})),results:[],roundBaselineResults:[],mode,solo,round:0,challenger:0,screen:initialScreen,afterCamera:solo?'challenge':'creator',tracking:'ready',phase:'idle',seconds:10,count:3,latest:null,private:true,bpm:120,beatPlaying:true});
  homeScreen.hidden=true;lobby.hidden=true;gameRoot.hidden=false;document.querySelector('.arcade').classList.add('in-game');document.querySelector('.arcade').classList.remove('in-lobby');renderPreview();
}
function startTeamPreview(){enterPreview(players,document.querySelector('input[name="game-length"]:checked').value)}
function startSoloPreview(){enterPreview([{id:'solo',name:'You',avatar:'cat'}],'quick',true)}
function leavePreview(){clearPreviewTimers();beatClock=null;preview.run++;gameRoot.hidden=true;gameRoot.replaceChildren();document.querySelector('.arcade').classList.remove('in-game','news-active','team-capture-active','dashboard-active');goHome()}
function finishCapture(){
  clearPreviewTimers();preview.run++;preview.phase='idle';
  if(preview.screen==='creator'){preview.screen='challenge';preview.challenger=0;renderPreview();return}
  const p=getChallenger();const fixture=CopycatDemoData.scores[(preview.round*3+preview.challenger)%CopycatDemoData.scores.length];
  preview.latest={playerId:p.id,creatorId:getCreator().id,round:preview.round+1,score:{...fixture},videoUrl:null,source:'demo'};
  preview.results.push(preview.latest);preview.screen='score';renderPreview();
}
function updateCaptureUI(){
  const countdown=preview.phase==='countdown',recording=preview.phase==='recording',overlay=gameRoot.querySelector('#capture-overlay');if(!overlay)return;
  overlay.innerHTML=countdown?`<span class="countdown-number">${preview.count}</span>`:recording?'<span class="recording-label">Recording preview</span>':'';
  gameRoot.querySelector('#capture-phase').textContent=countdown?'Get ready':recording?'Dancing':'Complete';
  gameRoot.querySelector('#capture-time').textContent=countdown?String(preview.count):`${preview.seconds}s`;
  gameRoot.querySelector('#capture-progress').value=countdown?0:10-preview.seconds;
  const instruction=gameRoot.querySelector('#dashboard-instruction');if(instruction)instruction.textContent=dashboardTurnInstruction();
  const button=gameRoot.querySelector('[data-action="record"]');if(button)button.textContent=countdown?'Get ready…':recording?'Preview running…':'Start preview';
}
function startCapturePreview(){
  if(preview.tracking!=='ready'||preview.phase!=='idle')return;
  preview.phase='countdown';preview.count=3;preview.seconds=10;const run=++preview.run,started=performance.now();
  beatClock={key:beatTurnKey(),bpm:preview.bpm,started,lastStep:-1};
  gameRoot.querySelector('[data-action="record"]').disabled=true;gameRoot.querySelector('#tracking-state').disabled=true;updateCaptureUI();
  if(preview.beatPlaying)startBeatGuide();
  previewTimer=setInterval(()=>{
    if(run!==preview.run)return clearPreviewTimers();
    const elapsed=(performance.now()-started)/1000;
    if(elapsed<3){preview.phase='countdown';preview.count=Math.ceil(3-elapsed)}else{preview.phase='recording';preview.seconds=Math.max(0,Math.ceil(13-elapsed))}
    updateCaptureUI();if(elapsed>=13)finishCapture();
  },100);
}
function normaliseBPM(value,fallback=120){const n=String(value).trim()===''?NaN:Number(value);const safeFallback=Number.isFinite(Number(fallback))?Number(fallback):120;return Math.max(60,Math.min(180,Math.round((Number.isFinite(n)?n:safeFallback)/5)*5))}
function setBeatTempo(value,syncInput=true){const bpm=normaliseBPM(value,preview.bpm);preview.bpm=bpm;gameRoot.querySelector('.tempo-setup')?.style.setProperty('--beat-duration',`${60/bpm}s`);const slider=gameRoot.querySelector('#tempo-slider');if(slider)slider.value=String(bpm);const input=gameRoot.querySelector('#tempo-bpm');if(input&&syncInput)input.value=String(bpm)}
gameRoot.addEventListener('input',e=>{if(preview.screen!=='tempo')return;if(e.target.id==='tempo-slider')setBeatTempo(e.target.value);if(e.target.id==='tempo-bpm'&&e.target.value.trim()!==''&&Number.isFinite(Number(e.target.value)))setBeatTempo(e.target.value,false)});
gameRoot.addEventListener('focusout',e=>{if(e.target.id==='tempo-bpm'&&preview.screen==='tempo')setBeatTempo(e.target.value)});
gameRoot.addEventListener('change',e=>{if(e.target.id==='tempo-bpm'&&preview.screen==='tempo')setBeatTempo(e.target.value);if(e.target.id==='tracking-state'){preview.tracking=e.target.value;renderPreview();gameRoot.querySelector('#tracking-state').focus()}});
gameRoot.addEventListener('click',e=>{
  const b=e.target.closest('[data-action]');if(!b||b.disabled)return;
  switch(b.dataset.action){
    case'exit':leavePreview();break;
    case'tempo-start':if(preview.screen==='tempo'){setBeatTempo(gameRoot.querySelector('#tempo-bpm').value);preview.screen=preview.afterCamera;renderPreview()}break;
    case'tempo-camera':if(preview.screen==='tempo'){preview.screen='camera';renderPreview()}break;
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
let beatTimer=null,beatSoundEpoch=0,beatClock=null;
function beatTurnKey(){return [preview.round,preview.screen,preview.challenger].join(':')}
function stopBeatGuide(){beatSoundEpoch++;clearTimeout(beatTimer);beatTimer=null;gameRoot.querySelector('.beat-guide')?.classList.remove('beat-playing')}
function beatClick(downbeat){
  if(!soundOn||document.hidden)return;
  const AudioEngine=window.AudioContext||window.webkitAudioContext;
  if(!AudioEngine)return;
  audio??=new AudioEngine();
  const epoch=beatSoundEpoch;
  const play=()=>{
    if(epoch!==beatSoundEpoch||!soundOn||document.hidden||!preview.beatPlaying)return;
    const at=audio.currentTime,o=audio.createOscillator(),g=audio.createGain();
    // A short, percussive tick. Beat one has a slightly higher pitch.
    o.type='square';
    o.frequency.setValueAtTime(downbeat?1800:1400,at);
    o.frequency.exponentialRampToValueAtTime(600,at+.025);
    g.gain.setValueAtTime(.001,at);
    g.gain.exponentialRampToValueAtTime(.12,at+.001);
    g.gain.exponentialRampToValueAtTime(.001,at+.03);
    o.connect(g);g.connect(audio.destination);
    o.onended=()=>{o.disconnect();g.disconnect()};
    o.start(at);o.stop(at+.035);
  };
  if(audio.state==='suspended')audio.resume().then(play).catch(()=>{});
  else if(audio.state==='running')play();
}
function startBeatGuide(){
  stopBeatGuide();const guide=gameRoot.querySelector('.beat-guide');if(!guide||!preview.beatPlaying||document.hidden)return;
  const key=beatTurnKey(),beatMs=60000/preview.bpm;
  if(!beatClock||beatClock.key!==key||beatClock.bpm!==preview.bpm)beatClock={key,bpm:preview.bpm,started:performance.now(),lastStep:-1};
  const clock=beatClock;guide.classList.add('beat-playing');
  function tick(){
    if(!guide.isConnected||!preview.beatPlaying||document.hidden)return;
    const now=performance.now(),step=Math.floor((now-clock.started)/beatMs);
    guide.querySelectorAll('[data-beat]').forEach(el=>{const active=Number(el.dataset.beat)===step%4+1;el.classList.toggle('active-beat',active);el.setAttribute('aria-current',active?'step':'false')});
    if(clock.lastStep!==step){clock.lastStep=step;beatClick(step%4===0)}
    beatTimer=setTimeout(tick,Math.max(1,clock.started+(step+1)*beatMs-performance.now()));
  }
  tick();
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopBeatGuide();else if(['creator','challenge'].includes(preview.screen)&&preview.beatPlaying)startBeatGuide()});
// Optional, explicit presentation harness. Does not run on the normal entry path.
// Example: index.html?demo=score or ?demo=finale. All results remain demo fixtures.
function openDemoScreen(name){
  const sample=[{id:101,name:'Alex',avatar:'cat'},{id:102,name:'Jamie',avatar:'rabbit'},{id:103,name:'Riley',avatar:'frog'},{id:104,name:'Taylor',avatar:'fox'}];
  enterPreview(sample,'quick',false,name==='camera'?'camera':'creator');
  if(name==='camera')return;
  if(name==='tempo'){preview.screen='tempo';renderPreview();return}
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
if(['camera','tempo','creator','challenge','score','leaderboard','finale'].includes(requestedDemo))openDemoScreen(requestedDemo);


