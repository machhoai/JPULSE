import React from "react";
import {createRoot} from "react-dom/client";
import {GooeyToaster} from "goey-toast";
import PayrollEmailWorkspace from "@/components/notifications/payroll/PayrollEmailWorkspace";
import EmailSignatureManager from "@/components/notifications/EmailSignatureManager";
import {useUserStore} from "@/stores/useUserStore";
import {useAppSettingsStore} from "@/stores/useAppSettingsStore";
import {I18nProvider} from "@/lib/i18n";
import {publishJob} from "./firestore";
import "../../src/app/globals.css";
import "quill/dist/quill.snow.css";
import "goey-toast/styles.css";
const actions=["compose","download","send","history.read","templates.manage"].map(x=>"notifications.payroll."+x);
useUserStore.setState({user:{id:"qa-browser",full_name:"QA Browser",email:"qa@example.invalid"} as never,
 permissions:{"store-a":Object.fromEntries([...actions,"notifications.email_signatures.manage"].map(x=>[x,true]))},
 isAuthenticated:true,authStatus:"VERIFIED" as never,accessStatus:"READY",hasUsableSessionSnapshot:true});
(window as unknown as {__payrollQa:unknown}).__payrollQa={publishJob,logout:()=>useUserStore.getState().clearAuth(),
 restrictCompose:()=>useUserStore.setState({permissions:{"store-a":{"notifications.payroll.templates.manage":true}}}),
 restrictSignatures:()=>useUserStore.setState({permissions:{"store-a":Object.fromEntries(actions.map(x=>[x,true]))}}),
 revoke:()=>useUserStore.getState().revokeAccess(),setLang:(lang:"vi"|"zh")=>useAppSettingsStore.getState().setLanguage(lang)};
createRoot(document.getElementById("root")!).render(<I18nProvider><GooeyToaster/><header className="mb-3 flex items-start justify-between gap-3"><h1 className="text-lg font-bold">Thông báo</h1><EmailSignatureManager/></header><section aria-label="Payroll workspace"><PayrollEmailWorkspace/></section></I18nProvider>);
