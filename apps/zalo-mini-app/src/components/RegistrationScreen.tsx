import {
    primaryButton,
    panel,
    panelHeading,
    sectionHeading,
    form,
    field,
    label,
    fieldControl,
    errorMessage,
    heading,
    lede,
} from "../uiClasses";
import { useState, type FormEvent } from "react";
import type { Registration } from "../memberApi";
import { MemberCard } from "./MemberCard";

export function RegistrationScreen({
    phone,
    onRegister,
}: {
    phone: string;
    onRegister: (profile: Registration) => Promise<void>;
}) {
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");
    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const name = String(form.get("name") ?? "").trim();
        if (name.length < 2) {
            setError("Nhập họ tên có ít nhất 2 ký tự.");
            return;
        }
        const email = String(form.get("email") ?? "").trim() || undefined;
        const birthday = String(form.get("birthday") ?? "") || undefined;
        const sex = String(form.get("sex") ?? "") || undefined;
        setPending(true);
        setError("");
        try {
            await onRegister({ name, email, birthday, sex });
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Chưa đăng ký được. Vui lòng thử lại.",
            );
        } finally {
            setPending(false);
        }
    }
    return (
        <section className="bg-card mt-3 w-[500px] max-[701px]:w-full rounded-lg shadow-sm max-[701px]:rounded-none max-[701px]:border-0 max-[701px]:shadow-none border border-gray-300 dark:border-gray-600" aria-labelledby="register-heading">
            <section className="h-full flex flex-col items-start">
                <div className="mx-auto mb-4">
                    <MemberCard />
                </div>
            </section>
            <div className="">
                <h2 className="text-2xl font-bold leading-tight tracking-tight mt-2 mb-2 text-gray-900 mx-auto text-center" id="register-heading">
                    Đăng ký thành viên
                </h2>
            </div>
            <form className={form} onSubmit={submit}>
                <div className={field}>
                    <label className={label} htmlFor="register-phone">
                        Số điện thoại Zalo
                    </label>
                    <input
                        className={fieldControl}
                        id="register-phone"
                        type="tel"
                        readOnly
                        value={phone}
                    />
                </div>
                <div className={field}>
                    <label className={label} htmlFor="register-name">
                        Họ tên
                    </label>
                    <input
                        className={fieldControl}
                        id="register-name"
                        name="name"
                        required
                        minLength={2}
                        maxLength={100}
                        autoComplete="name"
                    />
                </div>
                <div className={field}>
                    <label className={label} htmlFor="register-birthday">
                        Ngày sinh <span>(không bắt buộc)</span>
                    </label>
                    <input
                        className={fieldControl}
                        id="register-birthday"
                        name="birthday"
                        type="date"
                        max={new Date().toISOString().slice(0, 10)}
                        autoComplete="bday"
                    />
                </div>
                <div className={field}>
                    <label className={label} htmlFor="register-sex">
                        Giới tính <span>(không bắt buộc)</span>
                    </label>
                    <select className={fieldControl} id="register-sex" name="sex">
                        <option value="">Chọn giới tính</option>
                        <option value="1">Nam</option>
                        <option value="2">Nữ</option>
                        <option value="3">Không muốn cung cấp</option>
                    </select>
                </div>
                <div className={field}>
                    <label className={label} htmlFor="register-email">
                        Email <span>(không bắt buộc)</span>
                    </label>
                    <input
                        className={fieldControl}
                        id="register-email"
                        name="email"
                        type="email"
                        maxLength={150}
                        autoComplete="email"
                    />
                </div>
            <button type="submit" className={primaryButton + "mx-auto mt-2"} disabled={pending}>
                    {pending ? "Đang đăng ký…" : "Hoàn tất đăng ký"}
                </button>
                {error && (
                    <p className={errorMessage} role="alert">
                        {error}
                    </p>
                )}
            </form>
        </section>
    );
}
