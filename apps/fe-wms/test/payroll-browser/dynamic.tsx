import React,{lazy,Suspense} from "react";
export default function dynamic(load:()=>Promise<{default:React.ComponentType<Record<string,unknown>>}>,options:{loading?:React.ComponentType}={}) {
 const Component=lazy(load),Loading=options.loading;
 return function QaDynamic(props:Record<string,unknown>){return <Suspense fallback={Loading?<Loading/>:null}><Component {...props}/></Suspense>;};
}
