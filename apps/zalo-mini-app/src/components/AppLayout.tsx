import { container } from "../uiClasses";
import type { ReactNode } from "react";
import appLogo from "../assets/app-logo.png";
import type { Page } from "../navigation";

export function AppLayout({
    screen,
    children,
}: {
    screen: Page;
    children: ReactNode;
}) {
    return (
        <div className="min-h-screen min-h-dvh min-w-[280px] flex flex-col bg-canvas font-sans text-ink leading-[normal] [font-synthesis:none]">
            <header>
                <div
                    className={`${container} flex items-center justify-between gap-3 py-2`}
                >
                    <div
                        className="flex items-center gap-2.5 max-[361px]:gap-1.5"
                        aria-label="B.Duck CityFuns"
                    >
                        <span
                            className="grid size-[38px] overflow-hidden shrink-0 place-items-center rounded-xl bg-sun text-brand-deep max-[361px]:size-[30px]"
                            aria-hidden="true"
                        >
                            <img src={appLogo} alt="" className="size-full" />
                        </span>
                        <span className="font-extrabold tracking-[-0.045em] whitespace-nowrap max-[361px]:text-[0.87rem] [&>span]:text-brand">
                            B.Duck CityFuns Vietnam
                        </span>
                    </div>
                </div>
            </header>

            <main
                className={`${container} grid flex-1 gap-6 max-[701px]:flex max-[701px]:flex-col max-[701px]:pb-[35px] ${screen === "welcome" ? "grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)] items-center max-[701px]:items-start" : "grid-cols-2 max-[701px]:items-stretch"} ${screen === "balance" || screen === "profile" ? "items-start" : "items-center"}`}
            >
                {children}
            </main>
            <footer
                className={`${container} flex items-center justify-center gap-2 pt-2 pb-[max(20px,env(safe-area-inset-bottom))] text-[0.78rem] leading-[1.5] text-muted [&>svg]:shrink-0`}
            >
                <span>Powered by Joy World</span>
            </footer>
        </div>
    );
}
