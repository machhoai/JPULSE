import {
  primaryButton,
  panel,
  panelHeading,
  sectionHeading,
  featureIcon,
  form,
  field,
  label,
  fieldControl,
  fieldNote,
  errorMessage,
} from "../uiClasses";
import { Save, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { Profile } from "../demo";

export function ProfileScreen({
  profile,
  onSave,
}: {
  profile: Profile;
  onSave: (profile: Profile) => Promise<void>;
}) {
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [birthday, setBirthday] = useState(profile.birthday ?? "");
  const [sex, setSex] = useState(profile.sex ?? "");
  const [submitted, setSubmitted] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const nameError = submitted && name.trim().length < 2;
  const emailError =
    submitted &&
    email.trim() !== "" &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    const form = event.currentTarget;
    const nameInput = form.elements.namedItem("name") as HTMLInputElement;
    const emailInput = form.elements.namedItem("email") as HTMLInputElement;
    if (name.trim().length < 2) {
      nameInput.focus();
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      emailInput.focus();
      return;
    }
    if (birthday > new Date().toISOString().slice(0, 10)) {
      setError("Ngày sinh không thể ở tương lai.");
      setSaved(false);
      return;
    }
    const next = {
      ...profile,
      name: name.trim(),
      email: email.trim(),
      birthday: birthday || undefined,
      sex: sex || undefined,
    };
    setName(next.name);
    setEmail(next.email);
    setPending(true);
    setSaved(false);
    setError("");
    try {
      await onSave(next);
      setSaved(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Chưa lưu được hồ sơ.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={panel} aria-labelledby="profile-heading">
      <div className={panelHeading}>
        <h2 className={sectionHeading} id="profile-heading">
          Hồ sơ thành viên
        </h2>
        <span className={featureIcon}>
          <UserRound size={22} aria-hidden="true" />
        </span>
      </div>
      <form className={form} onSubmit={submit} noValidate>
        <div className={field}>
          <label className={label} htmlFor="profile-name">
            Họ tên
          </label>
          <input
            className={fieldControl}
            id="profile-name"
            name="name"
            autoComplete="name"
            required
            value={name}
            maxLength={100}
            aria-invalid={nameError}
            aria-describedby={nameError ? "name-error" : undefined}
            onChange={(event) => {
              setName(event.target.value);
              setSaved(false);
            }}
          />
          {nameError && (
            <p className={errorMessage} id="name-error">
              Nhập họ tên có ít nhất 2 ký tự.
            </p>
          )}
        </div>
        <div className={field}>
          <label className={label} htmlFor="profile-email">
            Email <span>(không bắt buộc)</span>
          </label>
          <input
            className={fieldControl}
            id="profile-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            maxLength={150}
            aria-invalid={emailError}
            aria-describedby={emailError ? "email-error" : undefined}
            onChange={(event) => {
              setEmail(event.target.value);
              setSaved(false);
            }}
          />
          {emailError && (
            <p className={errorMessage} id="email-error">
              Nhập địa chỉ email hợp lệ.
            </p>
          )}
        </div>
        <div className={field}>
          <label className={label} htmlFor="profile-birthday">
            Ngày sinh <span>(không bắt buộc)</span>
          </label>
          <input
            className={fieldControl}
            id="profile-birthday"
            type="date"
            max={new Date().toISOString().slice(0, 10)}
            value={birthday}
            onChange={(event) => {
              setBirthday(event.target.value);
              setSaved(false);
            }}
          />
        </div>
        <div className={field}>
          <label className={label} htmlFor="profile-sex">
            Giới tính <span>(không bắt buộc)</span>
          </label>
          <select
            className={fieldControl}
            id="profile-sex"
            value={sex}
            onChange={(event) => {
              setSex(event.target.value);
              setSaved(false);
            }}
          >
            <option value="">Chọn giới tính</option>
            <option value="1">Nam</option>
            <option value="2">Nữ</option>
            <option value="3">Không muốn cung cấp</option>
          </select>
        </div>
        <div className={field}>
          <label className={label} htmlFor="profile-phone">
            Số điện thoại
          </label>
          <input
            className={fieldControl}
            id="profile-phone"
            type="tel"
            value={profile.phone}
            readOnly
            aria-describedby="phone-note"
          />
          <p className={fieldNote} id="phone-note">
            Đến quầy hỗ trợ để xác minh khi đổi số.
          </p>
        </div>
        <button type="submit" className={primaryButton} disabled={pending}>
          <Save size={18} aria-hidden="true" />{" "}
          {pending ? "Đang lưu…" : "Lưu hồ sơ"}
        </button>
        {saved && (
          <p
            className="text-[0.83rem] leading-[1.5] text-success"
            role="status"
          >
            Đã lưu hồ sơ.
          </p>
        )}
        {error && (
          <p className={errorMessage} role="alert">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
