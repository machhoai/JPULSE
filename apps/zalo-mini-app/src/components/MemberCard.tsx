import { label } from "../uiClasses";
import cardArtwork from "../assets/member-card.png";
import logo from "../assets/bduck-cityfuns.png";

export function MemberCard({
  level,
  empty = false,
}: {
  level?: string;
  empty?: boolean;
}) {
  return (
    <div
      className={`relative isolate aspect-[1586/992] overflow-hidden rounded-[clamp(17px,3vw,29px)] border ${
        empty
          ? "border-line bg-[#f3ecfa] shadow-[0_9px_24px_#4e286922] [&>img]:opacity-[0.38] [&>img]:[filter:grayscale(0.55)_blur(3px)] [&>[aria-hidden=true]]:opacity-[0.38] [&>[aria-hidden=true]]:[filter:grayscale(0.55)_blur(3px)]"
          : "border-[#a4772760] bg-sun shadow-[0_9px_0_#6b3d19,0_20px_32px_#4e286934]"
      }`}
      aria-label={
        empty ? undefined : level ? "Thành viên B.Duck" : "Mẫu thẻ thành viên"
      }
    >
      <img
        className="block size-full object-cover"
        src={cardArtwork}
        alt=""
        width="1586"
        height="992"
      />
      <div
        className="absolute top-[6%] left-[5%] font-extrabold leading-none tracking-[-0.08em] text-brand-deep text-[clamp(1.15rem,3vw,2.05rem)]"
        aria-hidden={empty || undefined}
      >
        <img
          src={logo}
          alt="bduck-cityfuns"
          className="block w-18 object-cover"
        />
      </div>
      {empty ? (
        <div className="absolute inset-0 grid place-items-center p-3 text-center [&>p]:rounded-[10px] [&>p]:bg-surface [&>p]:px-[13px] [&>p]:py-[9px] [&>p]:font-bold [&>p]:leading-[1.4] [&>p]:text-brand-deep">
          <p>Bạn chưa có thẻ thành viên</p>
        </div>
      ) : (
        level && (
          <div className="absolute inset-x-[5%] bottom-[6%] flex flex-wrap justify-between gap-1.5 [&>span]:rounded-lg [&>span]:bg-brand-deep [&>span]:px-2.5 [&>span]:py-1.5 [&>span]:text-xs [&>span]:font-bold [&>span]:text-white">
            <span>{level}</span>
          </div>
        )
      )}
    </div>
  );
}
