type Callback=(snapshot:{exists:()=>boolean;data:()=>Record<string,unknown>})=>void;
const jobs=new Map<string,Record<string,unknown>>();
const subscribers=new Map<string,Set<Callback>>();
export function doc(_db:unknown,collection:string,id:string){return{collection,id};}
export function collection(_db:unknown,name:string){return{collection:name};}
export function query(ref:unknown,...constraints:unknown[]){return{ref,constraints};}
export function where(...args:unknown[]){return args;}
export function orderBy(...args:unknown[]){return args;}
export function limit(...args:unknown[]){return args;}
export function onSnapshot(ref:{collection?:string;id?:string},fn:Callback){
 const key=ref.id||"query";const set=subscribers.get(key)||new Set<Callback>();set.add(fn);subscribers.set(key,set);
 queueMicrotask(()=>fn({exists:()=>!!jobs.get(key),data:()=>jobs.get(key)||{}}));
 return()=>set.delete(fn);
}
export function publishJob(job:Record<string,unknown>){const id=String(job.id);jobs.set(id,job);subscribers.get(id)?.forEach(fn=>fn({exists:()=>true,data:()=>job}));subscribers.get("query")?.forEach(fn=>fn({exists:()=>false,data:()=>({})}));}
