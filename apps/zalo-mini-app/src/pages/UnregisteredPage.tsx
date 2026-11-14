import { ArrowRight } from "lucide-react";
import { actions, primaryButton } from "../uiClasses";
import { RegistrationIntro } from "../components/RegistrationIntro";
import { MemberCard } from "../components/MemberCard";

export function UnregisteredPage({
    phone,
    onBack,
    onRegister,
}: {
    phone: string;
    onBack: () => void;
    onRegister: () => void;
}) {
    return (
        <RegistrationIntro phone={phone} onBack={onBack}>
            <div className={`${actions} max-[701px]:order-4`}>
                <button type="button" className={primaryButton} onClick={onRegister}>
                    Đăng ký ngay<ArrowRight size={18} aria-hidden="true" />
                </button>
            </div>
        </RegistrationIntro>
    );
}
