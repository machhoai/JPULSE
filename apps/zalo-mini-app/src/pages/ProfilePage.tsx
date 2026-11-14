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
    saveProfile: (profile: Profile) => Promise<void>;
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
                <ProfileScreen profile={profile} onSave={saveProfile} />
            </div>
        </div>
    );
}
