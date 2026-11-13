import { ShieldCheck } from "lucide-react";
import type { Profile } from "../demo";
import { MemberCard } from "./MemberCard";

export function MemberOverview({
  profile,
  level,
  empty,
}: {
  profile: Profile;
  level?: string;
  empty: boolean;
}) {
  return (
    <section>
      <h1 className="mb-6 text-[clamp(2rem,4vw,3.4rem)] font-extrabold tracking-[-0.07em] leading-[1.12] wrap-anywhere max-[701px]:mb-[17px]">
        Xin chào,
        <br />
        <span className="text-brand">{profile.name}</span>
      </h1>
      <MemberCard level={level} empty={empty} />
      <p className="mt-3 flex items-center gap-2 text-[0.83rem] leading-[1.55] text-muted [&>svg]:shrink-0 [&>svg]:text-brand">
        <ShieldCheck size={17} aria-hidden="true" /> {profile.phone}
      </p>
    </section>
  );
}
