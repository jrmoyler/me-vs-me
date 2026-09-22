import React from 'react';
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const fighters = [
  {id:'aether', name:'AETHER', power:'Aether Break'},
  {id:'binary', name:'BINARY', power:'Binary Overdrive'},
  {id:'civic', name:'CIVIC', power:'Civic Crown'},
  {id:'gaia', name:'GAIA', power:'Gaia Surge'},
  {id:'glyph', name:'GLYPH', power:'Glyph Rupture'},
  {id:'hybrid', name:'HYBRID', power:'Hybrid Rush'},
  {id:'nexus', name:'NEXUS', power:'Nexus Collapse'},
  {id:'quilt', name:'QUILT', power:'Quilt Storm'},
  {id:'zenith', name:'ZENITH', power:'Zenith Ascension'},
];

const gameplay = [
  'gameplay/browser-neon-training.jpg',
  'gameplay/browser-ion-burst.jpg',
  'gameplay/browser-roundhouse.jpg',
  'gameplay/browser-crown-breaker.jpg',
  'gameplay/browser-uppercut.jpg',
  'gameplay/browser-stage-select.jpg',
  'gameplay/expansion-combat-peaks.jpg',
  'gameplay/expansion-motion-peaks.jpg',
  'gameplay/five-arenas.jpg',
];

const palette = {
  gold:'#D4A843',
  teal:'#00D9B5',
  white:'#F5F5F5',
  navy:'#050A18',
};

const TextShadow = '0 0 24px rgba(0,0,0,.8), 0 4px 10px rgba(0,0,0,.8)';

const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const p = spring({frame, fps, config:{damping:14, stiffness:120}});
  return (
    <AbsoluteFill style={{backgroundColor:palette.navy}}>
      <Img src={staticFile('gameplay/browser-title.jpg')} style={{width:'100%',height:'100%',objectFit:'cover',filter:'brightness(.38) saturate(1.2)'}} />
      <AbsoluteFill style={{background:'linear-gradient(90deg, rgba(5,10,24,.94) 0%, rgba(5,10,24,.55) 45%, rgba(5,10,24,.35) 100%)'}} />
      <div style={{position:'absolute',left:110,top:220,transform:`translateY(${(1-p)*70}px)`,opacity:p}}>
        <div style={{fontFamily:'Arial Black, Arial',fontSize:38,letterSpacing:12,color:palette.teal,textShadow:TextShadow}}>ME VS ME</div>
        <div style={{fontFamily:'Arial Black, Arial',fontSize:108,lineHeight:.95,color:palette.white,textShadow:TextShadow,marginTop:24}}>
          9 NEW<br/><span style={{color:palette.gold}}>FIGHTERS</span>
        </div>
        <div style={{fontFamily:'Arial, sans-serif',fontSize:34,color:palette.white,opacity:.9,marginTop:34}}>New identities. New powers. Same battle for the crown.</div>
      </div>
    </AbsoluteFill>
  );
};

const FighterCard: React.FC<{index:number}> = ({index}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const f = fighters[index];
  const p = spring({frame, fps, config:{damping:13, stiffness:130}});
  const punch = interpolate(frame,[38,50,64],[1,1.04,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  return (
    <AbsoluteFill style={{backgroundColor:palette.navy}}>
      <Img src={staticFile(gameplay[index])} style={{
        width:'100%',height:'100%',objectFit:'cover',
        transform:`scale(${1.05 + frame/1400})`,
        filter:'brightness(.48) contrast(1.12) saturate(1.22)'
      }} />
      <AbsoluteFill style={{background:'linear-gradient(90deg, rgba(5,10,24,.96) 0%, rgba(5,10,24,.78) 38%, rgba(5,10,24,.26) 68%, rgba(5,10,24,.62) 100%)'}} />

      <div style={{position:'absolute',left:100,top:82,fontFamily:'Arial Black, Arial',fontSize:24,letterSpacing:8,color:palette.teal}}>
        FIGHTER {String(index+1).padStart(2,'0')} / 09
      </div>

      <div style={{position:'absolute',left:104,top:185,width:790}}>
        <div style={{fontFamily:'Arial Black, Arial',fontSize:118,lineHeight:.9,color:palette.white,textShadow:TextShadow,
          transform:`translateX(${(1-p)*-90}px)`,opacity:p}}>
          {f.name}
        </div>
        <div style={{fontFamily:'Arial Black, Arial',fontSize:38,letterSpacing:3,color:palette.gold,marginTop:28,opacity:p}}>
          SIGNATURE POWER // {f.power.toUpperCase()}
        </div>
        <div style={{fontFamily:'Arial, sans-serif',fontSize:28,color:palette.white,opacity:.84,marginTop:28,maxWidth:700,lineHeight:1.35}}>
          Built from the new combat and motion sets now integrated into the roster.
        </div>
      </div>

      <div style={{position:'absolute',right:95,bottom:75,width:760,height:760,display:'flex',alignItems:'flex-end',justifyContent:'center',
        transform:`scale(${p*punch}) translateY(${(1-p)*80}px)`,opacity:p}}>
        <Img src={staticFile(`characters/${f.id}-combat.png`)} style={{
          width:'100%',height:'100%',objectFit:'contain',
          filter:'drop-shadow(0 28px 45px rgba(0,0,0,.55))'
        }}/>
      </div>

      <div style={{position:'absolute',left:100,bottom:72,width:710,height:8,background:'rgba(255,255,255,.16)'}}>
        <div style={{height:'100%',width:`${Math.min(100,(frame/68)*100)}%`,background:palette.teal}}/>
      </div>
    </AbsoluteFill>
  );
};

const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const p = interpolate(frame,[0,18,120,145],[0,1,1,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  return (
    <AbsoluteFill style={{backgroundColor:palette.navy}}>
      <Img src={staticFile('gameplay/expansion-combat-peaks.jpg')} style={{width:'100%',height:'100%',objectFit:'cover',filter:'brightness(.32) saturate(1.28)'}} />
      <AbsoluteFill style={{background:'radial-gradient(circle at center, rgba(0,217,181,.14), rgba(5,10,24,.96) 70%)'}} />
      <div style={{margin:'auto',textAlign:'center',opacity:p,transform:`scale(${.94+.06*p})`}}>
        <div style={{fontFamily:'Arial Black, Arial',fontSize:34,letterSpacing:12,color:palette.teal}}>ROSTER EXPANSION</div>
        <div style={{fontFamily:'Arial Black, Arial',fontSize:122,color:palette.white,textShadow:TextShadow,marginTop:24}}>20 FIGHTERS</div>
        <div style={{fontFamily:'Arial Black, Arial',fontSize:50,color:palette.gold,marginTop:18}}>ME VS ME</div>
        <div style={{fontFamily:'Arial, sans-serif',fontSize:32,color:palette.white,opacity:.9,marginTop:30}}>Nine new challengers are now in the fight.</div>
      </div>
    </AbsoluteFill>
  );
};

export const Promo: React.FC = () => {
  const per = 70;
  const intro = 90;
  const outroStart = intro + fighters.length * per;
  return (
    <AbsoluteFill style={{backgroundColor:palette.navy}}>
      <Sequence from={0} durationInFrames={intro}><Intro/></Sequence>
      {fighters.map((_, i) => (
        <Sequence key={fighters[i].id} from={intro+i*per} durationInFrames={per}>
          <FighterCard index={i}/>
        </Sequence>
      ))}
      <Sequence from={outroStart} durationInFrames={900-outroStart}><Outro/></Sequence>
    </AbsoluteFill>
  );
};
