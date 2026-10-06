"use client";
import {useEffect,useRef,useState} from "react";
type Preview = {rate:number;minimum:number;rounding:number;fetched_at:string;rows:{id:string;name:string;collector_number:string;prices:{finish:string;usd:string|null;clp:number|null}[]}[]};
export default function SetPrices({set,request,onClose}:{set:{id:string;name?:string};request:(path:string,body?:unknown)=>Promise<any>;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [data,setData]=useState<Preview|null>(null),[error,setError]=useState(""),[revision,setRevision]=useState(0);
  const [search,setSearch]=useState("");
  useEffect(()=>{const el=dialog.current;el?.showModal();return()=>el?.close();},[]);
  useEffect(()=>{let active=true;setError("");setData(null);request("data",{action:"set_prices",set_id:set.id}).then(d=>{if(active)setData(d)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false};},[set.id,revision,request]);
  const money=(n:number)=>new Intl.NumberFormat("es-CL",{style:"currency",currency:"CLP",maximumFractionDigits:0}).format(n);
  const rows=data?.rows.filter(r=>`${r.name} ${r.collector_number}`.toLowerCase().includes(search.toLowerCase()))||[];
  return <dialog ref={dialog} className="sealed-dialog sealed-finder-dialog" aria-labelledby="set-prices-title" onCancel={e=>{e.preventDefault();onClose()}}>
    <section className="panel import-form">
      <div className="section-head"><h2 id="set-prices-title">Scryfall prices · {set.name}</h2><button className="secondary" onClick={onClose}>Close</button></div>
      <p>{data ? `USD × ${data.rate}, minimum CLP ${data.minimum}, rounded up to the next CLP ${data.rounding}.` : "Uses your saved pricing settings."} Reference prices by printing and finish; condition-specific prices are unavailable.</p>
      <p>Price preview only. Existing sale prices are unchanged. Each division is checked separately.</p>
      {error?<div role="alert" className="alert error">{error} <button className="secondary" onClick={()=>setRevision(v=>v+1)}>Retry</button></div>:!data?<p role="status">Fetching all cards and prices for this set…</p>:<>
        <p>{data.rows.length} cards · Checked {new Date(data.fetched_at).toLocaleString()} · Cached for 5 minutes</p>
        <label>Find a card<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name or collector number"/></label>
        {!data.rows.length?<p>No paper cards found on Scryfall for this set.</p>:<div className="table-scroll"><table><thead><tr><th>Card</th><th>Collector no.</th><th>Non-foil · USD / CLP</th><th>Foil · USD / CLP</th><th>Etched · USD / CLP</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.name}</td><td>#{r.collector_number}</td>{r.prices.map(p=><td key={p.finish}>{p.clp===null?"Unavailable":<><span>US${p.usd}</span><strong style={{display:"block"}}>{money(p.clp)}</strong></>}</td>)}</tr>)}</tbody></table>{!rows.length&&<p>No matching cards.</p>}</div>}
      </>}
    </section>
  </dialog>;
}
