import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
const file=(path:string)=>fileURLToPath(new URL(path,import.meta.url));
export default defineConfig({
 root:file("./"),plugins:[react()],server:{host:"127.0.0.1",port:4407,strictPort:true,fs:{allow:[file("../../../../")]}},
 define:{"process.env.NEXT_PUBLIC_API_URL":JSON.stringify("http://api.wms.localhost"),"process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID":JSON.stringify("test-jw-system")},
 resolve:{alias:[
  {find:/^goey-toast$/,replacement:file("./toast.tsx")},
  {find:"next/dynamic",replacement:file("./dynamic.tsx")},
  {find:"firebase/firestore",replacement:file("./firestore.ts")},
  {find:"@/lib/firebase",replacement:file("./firebase.ts")},
  {find:"@/hooks/useWarehouses",replacement:file("./warehouses.ts")},
  {find:"@",replacement:file("../../src")},
 ]},
});
