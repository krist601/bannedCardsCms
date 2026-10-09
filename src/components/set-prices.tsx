"use client";
import {useEffect,useRef,useState} from "react";
type Preview = {rate:number;minimum:number;rounding:number;fetched_at:string;source?:string;price_source?:"scryfall"|"cardkingdom";warning?:string;rows:{id:string;name:string;collector_number:string;prices:{finish:string;usd:string|number|null;clp:number|null;source?:string|null}[]}[]};
export default function SetPrices({set,request,onClose}:{set:{id:string;name?:string};request:(path:string,body?:unknown)=>Promise<any>;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [data,setData]=useState<Preview|null>(null),[error,setError]=useState(""),[revision,setRevision]=useState(0);
  const [search,setSearch]=useState("");
  const [busy,setBusy]=useState(false),[result,setResult]=useState("");
  const [pending,setPending]=useState<"update"|"reset"|null>(null);
  async function apply(mode:"update"|"reset"){
    if(busy)return;
    setPending(null);setBusy(true);setError("");setResult("");
    try{const r=await request("data",{action:mode==="update"?"set_prices_update":"set_prices_reset",set_id:set.id});
      setResult(`${mode==="update"?"Updated":"Reset"}: ${r.updated} listings changed${mode==="reset"?` (${r.overridden} hand-set prices overwritten)`:`, ${r.custom} hand-set kept`}${r.unavailable?`, ${r.unavailable} without a price`:""}.${mode==="reset"&&r.custom?` ${r.custom} hand-set kept because no source has a price.`:""}${r.card_kingdom_warning?` ${r.card_kingdom_warning}`:""}`);setRevision(v=>v+1);}
    catch(e){setError(e instanceof Error?e.message:"Price change failed");}
    finally{setBusy(false);}
  }
  useEffect(()=>{const el=dialog.current;el?.showModal();return()=>el?.close();},[]);
  useEffect(()=>{let active=true;setError("");setData(null);request("data",{action:"set_prices",set_id:set.id}).then(d=>{if(active)setData(d)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false};},[set.id,revision,request]);
  const label=data?.price_source==="cardkingdom"?"Card Kingdom":"Scryfall";
  const money=(n:number)=>new Intl.NumberFormat("es-CL",{style:"currency",currency:"CLP",maximumFractionDigits:0}).format(n);
  const rows=data?.rows.filter(r=>`${r.name} ${r.collector_number}`.toLowerCase().includes(search.toLowerCase()))||[];
  return <dialog ref={dialog} className="sealed-dialog sealed-finder-dialog" aria-labelledby="set-prices-title" onCancel={e=>{e.preventDefault();onClose()}}>
    <section className="panel import-form set-prices">
      <div className="section-head"><h2 id="set-prices-title">{label} prices · {set.name}</h2><button className="secondary" onClick={onClose}>Close</button></div>
      <p>{data ? `USD × ${data.rate}, minimum CLP ${data.minimum}, rounded up to the next CLP ${data.rounding}.` : "Uses your saved pricing settings."} {data?.source?` Source: ${data.source}.`:""} Reference prices by printing and finish; condition-specific prices are unavailable.</p>{data?.warning&&<p role="alert" className="alert error">{data.warning}</p>}
      <p>The table is a preview. Use the buttons below to apply prices to this set's listings. Each division is handled separately.</p>
      <div className="price-actions"><button className="primary" disabled={busy} onClick={()=>setPending("update")}>{busy?"Working…":`Update prices from ${label}`}</button> <button className="secondary" disabled={busy} onClick={()=>setPending("reset")}>Reset to {label} prices</button></div>
      {pending&&<div role="alertdialog" className="price-confirm"><p>{pending==="update"?`Fetch current ${label} prices for ${set.name||"this set"} and update every automatic listing? Hand-set prices are kept.`:`Reset EVERY listing in ${set.name||"this set"} to its stored ${label} price? Hand-set prices will be overwritten.`}</p><div className="price-actions"><button className="primary" onClick={()=>void apply(pending)}>{pending==="update"?"Yes, update prices":"Yes, reset prices"}</button><button className="secondary" onClick={()=>setPending(null)}>Cancel</button></div></div>}
      {busy&&<p role="status">Applying prices… this can take a minute for large sets.</p>}
      {result&&<p role="status">{result}</p>}
      {error?<div role="alert" className="alert error">{error} <button className="secondary" onClick={()=>setRevision(v=>v+1)}>Retry</button></div>:!data?<p role="status">Fetching all cards and prices for this set…</p>:<>
        <div className="price-meta"><span className="muted">{data.rows.length} cards · Checked {new Date(data.fetched_at).toLocaleString()} · Cached for 5 minutes</span><label>Filter the table<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Card name or number"/></label></div>
        {!data.rows.length?<p>No paper cards found on Scryfall for this set.</p>:<div className="table-scroll"><table><thead><tr><th>Card</th><th>Collector no.</th><th>Non-foil · USD / CLP</th><th>Foil · USD / CLP</th><th>Etched · USD / CLP</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.name}</td><td>#{r.collector_number}</td>{r.prices.map(p=><td key={p.finish}>{p.clp===null?"Unavailable":<><span>US${p.usd}{p.source&&data?.price_source==="cardkingdom"&&<small className={`price-from price-from-${p.source==="Card Kingdom"?"ck":"sf"}`}>{p.source==="Card Kingdom"?"CK":"SF"}</small>}</span><strong style={{display:"block"}}>{money(p.clp)}</strong></>}</td>)}</tr>)}</tbody></table>{!rows.length&&<p>No matching cards.</p>}</div>}
      </>}
    </section>
  </dialog>;
}
