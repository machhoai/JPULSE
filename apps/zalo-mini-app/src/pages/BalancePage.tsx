import { ArrowRight, Coins, LogOut, UserRound } from "lucide-react";
import {
    secondaryButton,
    textButton,
    panel,
    panelHeading,
    sectionHeading,
    featureIcon,
    field,
    label,
    fieldControl,
    message,
} from "../uiClasses";
import type { Profile } from "../demo";
import type { MemberAccount } from "../memberApi";
import { MemberOverview } from "../components/MemberOverview";

const amountFormat = new Intl.NumberFormat("vi-VN");
const balanceColors = [
    "bg-[#eef4fc] text-[#2144bf]",
    "bg-[#fbf8e9] text-[#934600]",
    "bg-[#ebfaf3] text-[#216a54]",
    "bg-[#fcf4eb] text-[#a23908]",
    "bg-[#edf7fc] text-[#1a5b90]",
    "bg-[#f4f0fe] text-[#6222bc]",
] as const;
const dateFormat = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
});

type Props = {
    profile: Profile;
    accounts: MemberAccount[];
    accountIndex: number;
    setAccountIndex: (index: number) => void;
    justRegistered: boolean;
    updatedAt: Date | null;
    onProfile: () => void;
    signOut: () => void;
};
export function BalancePage({
    profile,
    accounts,
    accountIndex,
    setAccountIndex,
    justRegistered,
    updatedAt,
    onProfile,
    signOut,
}: Props) {
    const card = accounts[accountIndex];
    return (
        <div className="h-full mt-10">
            <MemberOverview
                profile={profile}
                level={card?.level}
                empty={justRegistered || accounts.length === 0}
            />
            <div className="grid min-w-0 mt-3 gap-3.5 min-[701px]:mt-9">
                <section
                    className={`@container/balances`}
                    aria-labelledby="balances-heading"
                >
                    <div className={panelHeading}>
                        <div>
                            <h2 className={sectionHeading} id="balances-heading">
                                Số dư hiện tại
                            </h2>
                            {updatedAt && (
                                <p className="mt-1.5 text-[0.75rem] text-muted">
                                    Cập nhật {dateFormat.format(updatedAt)}
                                </p>
                            )}
                        </div>
                        <span className={featureIcon}>
                            <Coins size={23} aria-hidden="true" />
                        </span>
                    </div>
                    {accounts.length > 1 && (
                        <div className={field}>
                            <label className={label} htmlFor="balance-store">
                                Cơ sở
                            </label>
                            <select
                                className={fieldControl}
                                id="balance-store"
                                value={accountIndex}
                                onChange={(event) =>
                                    setAccountIndex(Number(event.target.value))
                                }
                            >
                                {accounts.map((item, index) => (
                                    <option key={item.shopId} value={index}>
                                        {item.store}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    {card?.balances.length ? (
                        <dl className="grid grid-cols-1 gap-3 @min-[235px]/balances:grid-cols-2 @min-[420px]/balances:grid-cols-3">
                            {card.balances.map((balance, index) => (
                                <div
                                    className={`flex min-w-0 flex-col gap-2 rounded-[20px] px-4 py-4 ${balanceColors[index % balanceColors.length]}`}
                                    key={balance.label}
                                >
                                    <dt className="text-xs font-semibold tracking-wide uppercase wrap-anywhere">
                                        {balance.label}
                                    </dt>
                                    <dd className="mt-auto text-xl leading-tight font-extrabold tabular-nums wrap-anywhere">
                                        {amountFormat.format(balance.amount)}
                                        {balance.unit && ` ${balance.unit}`}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    ) : (
                        <p className={message}>Bạn chưa phát sinh giao dịch nào tại B.Duck Cityfuns.</p>
                    )}
                </section>
                <div className="flex gap-3 w-full">
                    <button type="button" className={secondaryButton + " flex-1"} onClick={onProfile}>
                        <UserRound size={20} aria-hidden="true" /> Hồ sơ của tôi
                    </button>
                    <button type="button" className={secondaryButton + " flex-1"} onClick={signOut}>
                        <LogOut size={17} aria-hidden="true" /> Đăng xuất
                    </button>
                </div>
            </div>
        </div>
    );
}
