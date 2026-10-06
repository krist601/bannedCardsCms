"use client";
import {useEffect,useState} from "react";
export default function PricingSettings({request}:{request:(path:string,body?:unknown)=>Promise<any>}){
 const [settings,setSettings]=useState({rate:750,minimum:300,rounding:50}),[busy,setBusy]=useState(true),[message,setMessage]=useState('');
 useEffect(()=>{request('data?resource=pricing').then(d=>setSettings(d.settings)).catch(e=>setMessage(e.message)).finally(()=>setBusy(false))},[request]);
 return <form className="panel import-form" onSubmit={async e=>{e.preventDefault();setBusy(true);setMessage('');try{const d=await request('data',{action:'pricing_settings',...settings});setSettings(d.settings);setMessage('Settings saved. Reimport a set to refresh its existing automatic prices.')}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}}>
  <h2>Card pricing</h2><p>Convert Scryfall USD prices into CLP. Results round up using your chosen increment.</p>
  <label>USD multiplier<input type="number" required min="1" max="100000" step="1" value={settings.rate} onChange={e=>setSettings({...settings,rate:Number(e.target.value)})}/></label>
  <label>Minimum card price (CLP)<input type="number" required min="1" max="100000000" step="1" value={settings.minimum} onChange={e=>setSettings({...settings,minimum:Number(e.target.value)})}/></label>
  <label>Round up to (CLP)<input type="number" required min="1" max="100000000" step="1" value={settings.rounding} onChange={e=>setSettings({...settings,rounding:Number(e.target.value)})}/></label>
  <p>The minimum is applied first, then the price rounds up to a multiple of this amount. Applies to new stock and future set imports. Reimport sets to update existing base prices. Existing custom prices are preserved; new custom prices must meet the minimum.</p>
  <button className="primary" disabled={busy}>{busy?'Loading…':'Save pricing settings'}</button><p role="status">{message}</p>
 </form>;
}
