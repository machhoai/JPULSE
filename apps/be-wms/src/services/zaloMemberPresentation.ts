import type { findZaloHkMember } from "./zaloHkMemberService.js";

const balanceLabels: Partial<Record<number, string>> = {
  101: "Điểm nạp",
  102: "Điểm thưởng",
  104: "Điểm",
  105: "Tích phân",
  106: "Lượt chơi",
  112: "Giá trị tăng trưởng",
};

export function customerResult(
  phone: string,
  member: Awaited<ReturnType<typeof findZaloHkMember>>,
) {
  if (!member) return { registered: false, phone };
  const amounts = new Map<number, number>([[101, 0], [102, 0]]);
  for (const { category, value } of member.storedValues) amounts.set(category, value);
  const balances = Array.from(amounts)
    .filter(([category, amount]) => category === 101 || category === 102 || amount !== 0)
    .map(([category, amount]) => ({
      category,
      label: balanceLabels[category] ?? `Số dư loại ${category}`,
      amount,
      unit: "",
    }));
  return {
    registered: true,
    profile: {
      name: member.realName ?? "",
      email: member.email ?? "",
      phone,
      birthday: member.birthday?.slice(0, 10),
      sex: (
        { male: "1", female: "2", "1": "1", "2": "2", "3": "3" } as Record<
          string,
          string
        >
      )[String(member.sex).toLowerCase()],
    },
    accounts: [{
      shopId: member.shopId,
      store: member.shopName,
      level: member.levelName || "Thành viên",
      balances,
    }],
  };
}
