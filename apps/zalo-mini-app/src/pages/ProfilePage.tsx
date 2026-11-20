import { ArrowLeft } from "lucide-react";
import { textButton } from "../uiClasses";
import type { Profile } from "../demo";
import { ProfileScreen } from "../components/ProfileScreen";
import { MemberOverview } from "../components/MemberOverview";

export function ProfilePage({
    profile,
    level,
    empty,
    saveProfile,
    onBack,
}: {
    profile: Profile;
    level?: string;
    empty: boolean;
    saveProfile?: (profile: Profile) => Promise<void>;
    onBack: () => void;
}) {
    return (
        <div className="h-full mt-10">
            <MemberOverview profile={profile} level={level} empty={empty} />
            <div className="grid min-w-0 gap-3.5">
                <button
                    type="button"
                    className={`${textButton} justify-self-start`}
                    onClick={onBack}
                >
                    <ArrowLeft size={18} aria-hidden="true" /> Về số dư
                </button>
                {saveProfile ? <ProfileScreen profile={profile} onSave={saveProfile} /> : (
                    <dl className="grid gap-3 rounded-2xl bg-white p-4">
                        <div><dt>Số điện thoại</dt><dd>{profile.phone}</dd></div>
                        <div><dt>Email</dt><dd>{profile.email || "Chưa có"}</dd></div>
                        <div><dt>Ngày sinh</dt><dd>{profile.birthday?.split("-").reverse().join("/") || "Chưa có"}</dd></div>
                        <div><dt>Giới tính</dt><dd>{profile.sex === "1" ? "Nam" : profile.sex === "2" ? "Nữ" : "Chưa xác định"}</dd></div>
                    </dl>
                )}
            </div>
        </div>
    );
}
