import { RegistrationScreen } from "../components/RegistrationScreen";
import { RegistrationIntro } from "../components/RegistrationIntro";
import type { Registration } from "../memberApi";

export function RegistrationPage({
    phone,
    onBack,
    onRegister,
}: {
    phone: string;
    onBack: () => void;
    onRegister: (details: Registration) => Promise<void>;
}) {
    return (
        <>
            <RegistrationScreen phone={phone} onRegister={onRegister} />
        </>
    );
}
