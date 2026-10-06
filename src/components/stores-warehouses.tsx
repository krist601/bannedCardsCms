"use client";
import {useEffect,useState} from "react";
type Warehouse={id:string;name:string};
type Store={id:string;name:string;domain:string;warehouse_ids:string[];publishable_key?:string};
type Request=(path:string,body?:unknown)=>Promise<any>;
const EMPTY_STORE:Store={id:"",name:"",domain:"",warehouse_ids:[]};
function StoreForm({store,warehouses,busy,onSave}:{store:Store;warehouses:Warehouse[];busy:boolean;onSave:(store:Store)=>Promise<void>}) {
  const [draft,setDraft]=useState(store);
  useEffect(()=>setDraft(store),[store]);
  return <form onSubmit={e=>{e.preventDefault();void onSave(draft)}}>
    <div className="sealed-form-grid"><label>Store name<input required maxLength={100} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label><label>Domain<input required placeholder="distritotcg.cl" value={draft.domain} onChange={e=>setDraft({...draft,domain:e.target.value})}/></label></div>
    <fieldset disabled={busy}><legend>Warehouses visible to this store</legend>{warehouses.map(w=><label key={w.id} className="store-warehouse-option"><input type="checkbox" checked={draft.warehouse_ids.includes(w.id)} onChange={e=>setDraft({...draft,warehouse_ids:e.target.checked?[...draft.warehouse_ids,w.id]:draft.warehouse_ids.filter(id=>id!==w.id)})}/>{w.name}</label>)}</fieldset>
    {!warehouses.length&&<p>Create a warehouse using the button above.</p>}
    <p>{draft.warehouse_ids.length} selected. With no warehouses selected, this store has no available stock. Prices are shared across stores.</p>
    <button className="primary" disabled={busy}>{busy?"Saving…":"Save store"}</button>
    {store.publishable_key&&<details className="store-connection"><summary>Connect this storefront</summary><p>Use this store’s public API key in its frontend configuration. Set the storefront domain and allow its origin in the backend CORS configuration when deploying.</p><label>Publishable API key<input readOnly value={store.publishable_key} onFocus={e=>e.target.select()}/></label><small>Sales channel: {store.id}</small></details>}
  </form>;
}
export default function StoresWarehouses({request,onWarehousesChanged}:{request:Request;onWarehousesChanged:()=>void}) {
  const [rows,setRows]=useState<Store[]>([]),[warehouses,setWarehouses]=useState<Warehouse[]>([]),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [newStore,setNewStore]=useState(false),[newWarehouse,setNewWarehouse]=useState(false),[warehouseName,setWarehouseName]=useState("");
  const accept=(d:any)=>{setRows(d.rows);setWarehouses(d.warehouses)};
  useEffect(()=>{let active=true;request("data?resource=stores").then(d=>{if(active)accept(d)}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[request]);
  async function save(body:unknown){setBusy(true);setError("");setNotice("");try{accept(await request("data",body));setNewStore(false);setNewWarehouse(false);setWarehouseName("");setNotice("Saved. Storefront stock uses these warehouse assignments.");onWarehousesChanged()}catch(e){setError((e as Error).message);request("data?resource=stores").then(accept).catch(()=>{})}finally{setBusy(false)}}
  return <section className="panel import-form stores-warehouses">
    <div className="table-toolbar"><button className="primary" disabled={busy} onClick={()=>setNewStore(v=>!v)}>New store</button><button className="secondary" disabled={busy} onClick={()=>setNewWarehouse(v=>!v)}>New warehouse</button></div>
    {error&&<p className="alert error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {newWarehouse&&<form onSubmit={e=>{e.preventDefault();void save({action:"warehouse_create",name:warehouseName})}}><h3>New warehouse</h3><label>Warehouse name<input required maxLength={100} value={warehouseName} onChange={e=>setWarehouseName(e.target.value)}/></label><p>After creating it, select the stores that can use its stock.</p><button className="primary" disabled={busy}>Create warehouse</button></form>}
    {newStore&&<StoreForm store={EMPTY_STORE} warehouses={warehouses} busy={busy} onSave={s=>save({...s,action:"store_save"})}/>}
    {loading?<p role="status">Loading stores…</p>:rows.map(store=><details key={store.id} className="store-accordion"><summary><strong>{store.name}</strong> · {store.domain} · {store.warehouse_ids.length} warehouses</summary><StoreForm store={store} warehouses={warehouses} busy={busy} onSave={s=>save({...s,action:"store_save"})}/></details>)}
    {!loading&&!rows.length&&<p>No stores configured. Add Banned Cards and Distrito TCG using New store.</p>}
    <h3>All warehouses</h3><p>{warehouses.map(w=>w.name).join(" · ")||"No warehouses yet."}</p>
  </section>;
}
