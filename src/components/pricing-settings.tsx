"use client";
import {useEffect,useRef,useState} from "react";
type Source="scryfall"|"cardkingdom";
type Last={at:string;sets:number;printings:number;matched:number;updated:number;without_file:string[]};
type Sync={running:boolean;started_at:string|null;finished_at:string|null;sets:number|null;matched:number|null;updated:number|null;error:string|null;last:Last|null};
const sources:{id:Source;title:string;text:string}[]=[
 {id:"scryfall",title:"Scryfall",text:"Market prices from Scryfall (mostly TCGplayer). Free, updated by Scryfall every day."},
 {id:"cardkingdom",title:"Card Kingdom",text:"Card Kingdom's retail price (USD, Near Mint), republished daily by MTGJSON. Cards Card Kingdom does not list use the Scryfall price."},
];
export default function PricingSettings({request}:{request:(path:string,body?:unknown)=>Promise<any>}){
 const [settings,setSettings]=useState<{rate:number;minimum:number;rounding:number;source:Source}>({rate:750,minimum:300,rounding:50,source:"scryfall"}),[busy,setBusy]=useState(true),[message,setMessage]=useState('');
 const [sync,setSync]=useState<Sync|null>(null),[syncError,setSyncError]=useState('');
 const timer=useRef<ReturnType<typeof setTimeout>>(undefined);
 async function poll(){try{const next:Sync=await request('data?resource=ck_prices_status');setSync(next);if(next.running)timer.current=setTimeout(poll,2500);}catch(e){setSyncError(e instanceof Error?e.message:'Could not read the update status');}}
 useEffect(()=>{request('data?resource=pricing').then(d=>setSettings(d.settings)).catch(e=>setMessage(e.message)).finally(()=>setBusy(false));void poll();return()=>clearTimeout(timer.current)},[request]); // eslint-disable-line react-hooks/exhaustive-deps
 async function startSync(){setSyncError('');try{const next=await request('data',{action:'ck_prices_sync'});setSync(current=>({...(current??{last:null}),...next} as Sync));timer.current=setTimeout(poll,2500);}catch(e){setSyncError(e instanceof Error?e.message:'Could not start the update');}}
 const last=sync?.last;
 return <form className="panel import-form" onSubmit={async e=>{e.preventDefault();setBusy(true);setMessage('');try{const d=await request('data',{action:'pricing_settings',...settings});setSettings(d.settings);setMessage('Settings saved. Use "Update prices" in each set to apply the new source to its listings.')}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}}>
  <h2>Card pricing</h2><p>Convert USD prices into CLP. Results round up using your chosen increment.</p>
  <fieldset className="price-source"><legend>Price source</legend>
   {sources.map(s=><label key={s.id} className={settings.source===s.id?"is-selected":""}><input type="radio" name="price-source" checked={settings.source===s.id} onChange={()=>setSettings({...settings,source:s.id})}/><span><strong>{s.title}</strong><small>{s.text}</small></span></label>)}
  </fieldset>
  {settings.source==="cardkingdom"&&<p className="price-source-note">Card Kingdom is a retailer, so its prices are usually higher than Scryfall's, especially on cheap cards. Selecting a source does not change your listings by itself: open a set and use <b>Update prices</b> when you want its listings to follow the new source.</p>}
  <label>USD multiplier<input type="number" required min="1" max="100000" step="1" value={settings.rate} onChange={e=>setSettings({...settings,rate:Number(e.target.value)})}/></label>
  <label>Minimum card price (CLP)<input type="number" required min="1" max="100000000" step="1" value={settings.minimum} onChange={e=>setSettings({...settings,minimum:Number(e.target.value)})}/></label>
  <label>Round up to (CLP)<input type="number" required min="1" max="100000000" step="1" value={settings.rounding} onChange={e=>setSettings({...settings,rounding:Number(e.target.value)})}/></label>
  <p>The minimum is applied first, then the price rounds up to a multiple of this amount. Existing custom prices are preserved; new custom prices must meet the minimum.</p>
  <button className="primary" disabled={busy}>{busy?'Loading…':'Save pricing settings'}</button><p role="status">{message}</p>
  <div className="ck-sync">
   <h3>Card Kingdom prices</h3>
   <p>{last?`Last downloaded ${new Date(last.at).toLocaleString()}: ${last.matched.toLocaleString()} of ${last.printings.toLocaleString()} printings in ${last.sets} sets have a Card Kingdom price.${last.without_file.length?` No price file for: ${last.without_file.join(", ")}.`:""}`:"Not downloaded yet."} They also refresh automatically every day while Card Kingdom is the selected source.</p>
   <button type="button" className="secondary" disabled={sync?.running} onClick={()=>void startSync()}>{sync?.running?"Downloading prices…":"Download Card Kingdom prices now"}</button>
   {(syncError||sync?.error)&&<p role="alert" className="alert error">{syncError||sync?.error}</p>}
   {sync?.running&&<p role="status">Downloading and matching prices… you can keep working.</p>}
   {!sync?.running&&sync?.finished_at&&!sync.error&&sync.sets!==null&&<p role="status">Done: {sync.matched?.toLocaleString()} printings matched in {sync.sets} sets ({sync.updated?.toLocaleString()} changed). Your listings keep their prices until you use Update prices in a set.</p>}
  </div>
 </form>;
}
