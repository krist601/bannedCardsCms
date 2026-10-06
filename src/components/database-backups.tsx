"use client";
import { useEffect, useState } from "react";
type Backup={id:string;createdAt:string;bytes:number;kind:string};
type Status={configured:boolean;rows:Backup[];maintenance?:boolean;operation?:{action:string;status:string;message?:string;safetyBackupId?:string}};
export default function DatabaseBackups({request}:{request:(path:string,body?:unknown)=>Promise<any>}) {
  const [data,setData]=useState<Status|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[selected,setSelected]=useState<Backup|null>(null),[confirmation,setConfirmation]=useState("");
  useEffect(()=>{
    let active=true;
    const load=()=>request("data?resource=backups").then(d=>{if(active){setData(d);setError("");}}).catch(e=>{if(active)setError(e.message);});
    void load(); const timer=setInterval(load,5000);
    return ()=>{active=false;clearInterval(timer);};
  },[request]);
  const running=busy || ["queued","running"].includes(data?.operation?.status || "");
  async function act(body:unknown) {
    setBusy(true);setError("");
    try { await request("data",body);setSelected(null);setConfirmation("");setData(await request("data?resource=backups")); }
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  const date=(value:string)=>new Date(value).toLocaleString("es-CL",{timeZone:"America/Santiago"});
  return <section className="panel import-form">
    <h2>Database backups</h2>
    <p>Automatic backup every day at <strong>00:00 · Santiago</strong>. Encrypted archives are stored in private S3 storage and deleted after 14 days.</p>
    <p className="muted">Covers the entire database: every store, warehouse, product, order and user. Product image files in S3 are not copied. After downtime, the next server run creates today's missing backup.</p>
    {error && <p className="alert error" role="alert">{error}</p>}
    {!data && !error && <p>Loading backups…</p>}
    {data && !data.configured && <p role="status">Backup storage is not configured on this server yet.</p>}
    {data?.configured && <>
      <button className="primary" disabled={running || data.maintenance} onClick={()=>void act({action:"backup_create"})}>Create backup now</button>
      {data.operation && <p role="status">{data.operation.action === "restore" ? "Restore" : "Backup"}: {data.operation.status}. {data.operation.message}{data.operation.safetyBackupId && <> Safety backup: <code>{data.operation.safetyBackupId}</code>.</>}</p>}
      {data.maintenance && <div className="alert error"><strong>Database maintenance is active.</strong><p>The storefront is temporarily unavailable. If a restore failed or was interrupted, inspect its result before resuming.</p>{!running && <button className="secondary" onClick={()=>{if(window.confirm("Have you checked that the database is ready to serve customers?")) void act({action:"backup_resume",confirmation:"RESUME"});}}>Resume service</button>}</div>}
      <div className="table-scroll"><table><thead><tr><th>Created (Santiago)</th><th>Type</th><th>Size</th><th>Action</th></tr></thead><tbody>
        {data.rows.map(row=><tr key={row.id}><td>{date(row.createdAt)}</td><td>{row.kind === "before-restore"?"Safety backup":row.kind}</td><td>{(row.bytes/1024/1024).toFixed(1)} MB</td><td><button className="secondary" disabled={running || data.maintenance} onClick={()=>{setSelected(row);setConfirmation("");}}>Restore</button></td></tr>)}
        {!data.rows.length && <tr><td colSpan={4}>No backups yet. Create one now or wait for the scheduled backup.</td></tr>}
      </tbody></table></div>
    </>}
    {selected && <div className="backup-confirm" role="region" aria-label="Confirm database restore"><h3>Restore {date(selected.createdAt)}?</h3><p>This replaces the entire database, including orders and changes made after this backup. All stores will be unavailable during restoration. A safety backup is created first. Your account and password will also return to their saved state.</p><label>Type RESTORE to confirm<input autoFocus value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label><button className="primary" disabled={running || confirmation!=="RESTORE"} onClick={()=>void act({action:"backup_restore",backupId:selected.id,confirmation:`RESTORE ${selected.id}`})}>Restore database</button>{" "}<button className="secondary" disabled={busy} onClick={()=>setSelected(null)}>Cancel</button></div>}
  </section>;
}
