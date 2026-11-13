import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { heading, lede, textButton } from "../uiClasses";
import { MemberCard } from "./MemberCard";

export function RegistrationIntro({
    phone,
    onBack,
    children,
}: {
    phone: string;
    onBack: () => void;
    children?: ReactNode;
}) {
    return (
        <section className="h-full flex flex-col items-start">
            <button
                type="button"
                className={`${textButton} -ml-2 mb-5 max-[701px]:mb-3`}
                onClick={onBack}
            >
                <ArrowLeft size={18} aria-hidden="true" /> Quay lại
            </button>
            <div className="mx-auto mb-4">
                <MemberCard empty />
            </div>
            <h1 className={heading}>Số điện thoại của bạn chưa được đăng ký</h1>
            <p className={`${lede} !mt-2`}>
                Đăng ký thành viên cho số điện thoại {phone}. Bạn có thể nhận thẻ vật lý tại quầy
                khi cần.
            </p>
            <div className="flex-1 mx-auto mt-10">
                {children}
            </div>
        </section>
    );
}
