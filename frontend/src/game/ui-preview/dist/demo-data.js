/* Presentation fixtures only. These are not backend contracts or computed dance scores. */
const CopycatDemoData=Object.freeze({
  duration:10,
  scores:Object.freeze([
    {total:84,arms:91,legs:78,torso:88,timing:79},
    {total:62,arms:75,legs:46,torso:69,timing:58},
    {total:93,arms:96,legs:89,torso:94,timing:92},
    {total:76,arms:68,legs:83,torso:81,timing:72},
    {total:71,arms:80,legs:73,torso:57,timing:74},
    {total:88,arms:90,legs:86,torso:92,timing:84}
  ]),
  feedback:{arms:'Your arms improvised.',legs:'Your legs took a different route.',torso:'Your torso started its own dance.',timing:'The beat is still waiting for you.'},
  headlines:{arms:'LOCAL DANCER DECLARES ARMS INDEPENDENT',legs:'LOCAL DANCER DEFEATED BY OWN LEGS',torso:'TORSO REFUSES TO FOLLOW INSTRUCTIONS',timing:'LOCAL DANCER LOSES CONTACT WITH THE BEAT'}
});

// Presentation aggregation only: creators receive no score for their own round.
// Average timing breaks ties for the lowest rank. Unscored creators stay unranked.
function demoRankings(crew,results){
  return crew.map((player,index)=>{
    const attempts=results.filter(r=>r.playerId===player.id);
    const average=attempts.length?attempts.reduce((sum,r)=>sum+r.score.total,0)/attempts.length:null;
    const timing=attempts.length?attempts.reduce((sum,r)=>sum+r.score.timing,0)/attempts.length:null;
    return {player,index,attempts,average,timing};
  }).sort((a,b)=>{
    if(a.average===null)return b.average===null?a.index-b.index:1;
    if(b.average===null)return -1;
    return b.average-a.average||b.timing-a.timing||a.index-b.index;
  });
}
function weakestPart(score){return ['arms','legs','torso','timing'].filter(part=>Number.isFinite(score[part])).reduce((a,b)=>score[a]<=score[b]?a:b,'timing')}
function rankTransition(crew,previousResults,currentResults){
  const before=demoRankings(crew,previousResults),after=demoRankings(crew,currentResults);
  const previousRanks=new Map(before.filter(r=>r.average!==null).map((r,i)=>[r.player.id,i+1]));
  const currentRanks=new Map(after.filter(r=>r.average!==null).map((r,i)=>[r.player.id,i+1]));
  const changes=new Map(after.map(row=>{
    const previous=previousRanks.get(row.player.id),current=currentRanks.get(row.player.id);
    return [row.player.id,{previous:previous??null,current:current??null,delta:previous&&current?previous-current:0,isNew:!previous&&!!current}];
  }));
  return {before,after,changes};
}
