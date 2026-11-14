export const container =
    "mx-auto w-[min(calc(100%-48px),1080px)] max-[701px]:w-[min(calc(100%-36px),480px)] max-[361px]:w-[calc(100%-24px)]";
export const heading =
    "text-[clamp(2.25rem,4.9vw,4.1rem)] font-extrabold tracking-[-0.07em] leading-[1.12] wrap-anywhere";
export const eyebrow =
    "mb-[18px] inline-flex items-center gap-2 text-[0.78rem] font-extrabold tracking-[0.085em] text-brand uppercase";
export const lede = "max-w-[39ch] text-base leading-[1.7] text-muted";
export const actions =
    "mt-[40px] grid max-w-[365px] gap-3 max-[701px]:mt-0 max-[701px]:max-w-none";

const focus =
    "focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-[#7a37b9]";
const button = `inline-flex min-h-12 cursor-pointer items-center justify-center gap-2.5 rounded-[13px] border py-[11px] text-center font-bold leading-[1.35] transition-colors duration-180 ease-[ease] disabled:cursor-wait disabled:opacity-70 motion-reduce:transition-none [&>svg]:shrink-0 ${focus}`;
export const primaryButton = `${button} border-transparent bg-brand px-4 text-white hover:bg-brand-deep`;
export const secondaryButton = `${button} border-[#e7d8f4] bg-lavender px-4 text-brand-deep hover:border-[#d6bce9] hover:bg-[#ecdcfc]`;
export const textButton = `${button} border-transparent bg-transparent px-2 text-brand hover:bg-lavender`;

export const panel =
    "min-w-0 rounded-3xl border border-line bg-surface p-[clamp(18px,3.4vw,29px)] shadow-[0_12px_28px_#3926580c]";
export const panelHeading = "mb-[17px] flex items-center justify-between gap-3";
export const sectionHeading =
    "text-[clamp(1.2rem,2.1vw,1.46rem)] font-bold tracking-[-0.045em] leading-[1.3]";
export const featureIcon =
    "grid size-11 shrink-0 place-items-center rounded-xl bg-lavender text-brand-deep";
export const form = "grid gap-4";
export const field = "grid min-w-0 gap-[7px]";
export const label = "text-[0.88rem] font-bold [&>span]:font-normal";
export const fieldControl = `min-h-12 w-full min-w-0 rounded-[10px] border border-[#bdb1ca] bg-white px-3 py-[9px] text-ink [&[readonly]]:bg-[#f4f0f6] aria-invalid:border-danger placeholder:text-[0.83rem] placeholder:text-[#72647b] ${focus}`;
export const fieldNote = "text-[0.8rem] leading-[1.55] text-muted";
export const message = "text-[0.83rem] leading-[1.5] text-muted";
export const errorMessage = "text-[0.83rem] leading-[1.5] text-danger";
export const demoOptions = "group text-[0.83rem] text-brand-deep";
export const demoSummary = `flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 py-2 font-semibold [&::-webkit-details-marker]:hidden group-open:[&>svg]:rotate-180 ${focus}`;
