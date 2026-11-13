import { ArrowRight, ChevronDown } from "lucide-react";
import {
    heading,
    lede,
    actions,
    primaryButton,
    label,
    fieldControl,
    errorMessage,
    demoOptions,
    demoSummary,
} from "../uiClasses";
import { MemberCard } from "../components/MemberCard";
import { hasMemberBackend } from "../memberApi";

export type DemoScenario = "new" | "returning" | "declined";
type Props = {
    scenario: DemoScenario;
    setScenario: (scenario: DemoScenario) => void;
    checkingZalo: boolean;
    declined: boolean;
    zaloError: string;
    signIn: () => void;
};
export function WelcomePage({
    scenario,
    setScenario,
    checkingZalo,
    declined,
    zaloError,
    signIn,
}: Props) {
    return (
        <>
            <section className="max-[701px]:contents flex flex-col">
                <h1 className={`${heading} max-[701px]:order-1`}>
                    Thẻ thành viên
                    <br />
                    <span className="text-brand">B.Duck Cityfuns</span> của bạn
                </h1>
                <div className={`${actions} max-[701px]:order-4 mx-auto !mt-4`}>
                    <button
                        type="button"
                        className={`${primaryButton} mx-auto`}
                        onClick={signIn}
                        disabled={checkingZalo}
                    >
                        {checkingZalo ? "Đang kiểm tra quyền Zalo…" : "Tiếp tục bằng Zalo"}
                        <ArrowRight size={19} aria-hidden="true" />
                    </button>
                    {hasMemberBackend && (
                        <p className="text-sm text-muted">
                            My B.Duck dùng số điện thoại Zalo để tìm hồ sơ và hiển thị số dư của bạn.
                        </p>
                    )}
                    {declined && (
                        <p className={errorMessage} role="alert">
                            Bạn chưa chia sẻ số điện thoại. Hãy chọn “Khách mới” bên dưới để
                            thử lại.
                        </p>
                    )}
                    {zaloError && (
                        <p className={errorMessage} role="alert">
                            {zaloError}
                        </p>
                    )}
                    {!hasMemberBackend && (
                        <details className={demoOptions}>
                            <summary className={demoSummary}>
                                Đổi tình huống thử nghiệm{" "}
                                <ChevronDown size={17} aria-hidden="true" />
                            </summary>
                            <label
                                className={`${label} mb-1.5 block`}
                                htmlFor="demo-scenario"
                            >
                                Tình huống đăng nhập
                            </label>
                            <select
                                className={fieldControl}
                                id="demo-scenario"
                                value={scenario}
                                onChange={(event) => {
                                    setScenario(event.target.value as DemoScenario);
                                }}
                            >
                                <option value="new">Khách mới</option>
                                <option value="returning">Số điện thoại đã đăng ký</option>
                                <option value="declined">Từ chối chia sẻ số điện thoại</option>
                            </select>
                        </details>
                    )}
                </div>
            </section>
            <div className="relative isolat flex-1 min-w-0 before:pointer-events-none before:absolute before:-inset-x-[5%] before:-inset-y-[12%] before:-z-10 before:bg-[radial-gradient(ellipse_at_center,#ffe585_0%,transparent_70%)] max-[701px]:order-3 max-[701px]:before:inset-x-0 flex items-center justify-center">
                <div className="flex-1">
                    <MemberCard />
                </div>
            </div>
        </>
    );
}
