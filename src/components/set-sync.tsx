"use client";
import {useEffect,useRef,useState} from "react";
type Status={running:boolean;started_at:string|null;finished_at:string|null;sets:number|null;icon_failures:number|null;error:string|null};
export default function SetSync({request,onDone}:{request:(path:string,body?:unknown)=>Promise<any>;onDone:()=>void}) {
  const [status,setStatus]=useState<Status|null>(null),[error,setError]=useState("");
  const timer=useRef<ReturnType<typeof setTimeout>>(undefined);
  const wasRunning=useRef(false);
  function apply(next:Status){
    setStatus(next);
    if(next.running){wasRunning.current=true;timer.current=setTimeout(poll,2000);}
    else if(wasRunning.current){wasRunning.current=false;if(!next.error)onDone();}
  }
  async function poll(){try{apply(await request("data?resource=set_sync_status"));}catch(e){setError(e instanceof Error?e.message:"Could not read the update status");}}
  useEffect(()=>{void poll();return()=>clearTimeout(timer.current);},[]); // eslint-disable-line react-hooks/exhaustive-deps
  async function start(){setError("");try{apply(await request("data",{action:"set_sync"}));}catch(e){setError(e instanceof Error?e.message:"Could not start the update");}}
  const message=error||status?.error||(status?.running?"Updating sets and icons… you can keep working.":status?.finished_at&&status.sets!==null?`Updated ${status.sets} sets${status.icon_failures?`, ${status.icon_failures} icons will retry next time`:""}.`:"");
  return <>
    <button className="primary" disabled={status?.running} title="Contacts Scryfall: adds new sets and downloads their icons to storage" onClick={()=>void start()}>{status?.running?"Getting sets…":"⇣ Get new sets from Scryfall"}</button>
    {message&&<span role="status" className={error||status?.error?"set-sync-note error":"set-sync-note muted"}>{message}</span>}
  </>;
}
