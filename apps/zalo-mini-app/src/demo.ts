export type Profile = {
  name: string;
  email: string;
  phone: string;
  birthday?: string;
  sex?: string;
};

export type Balance = {
  label: string;
  amount: number;
  unit: string;
};

export const demoProfile: Profile = {
  name: "Nguyễn Minh Anh",
  email: "minhanh@example.com",
  phone: "0900000123",
};

export type DemoCard = {
  code: string;
  level: string;
  store: string;
  balances: Balance[];
  balanceUnavailable?: boolean;
};

export const demoCard: DemoCard = {
  code: "BD01PAYDUCK000123",
  level: "Thành viên",
  store: "B.Duck CityFuns",
  balances: [
    { label: "Xu chơi", amount: 1250, unit: "xu" },
    { label: "Xu thưởng", amount: 320, unit: "xu" },
  ],
};

const emptyDemoCard: DemoCard = {
  ...demoCard,
  code: "BD12PAYDUCK543218",
  balances: demoCard.balances.map((balance) => ({ ...balance, amount: 0 })),
};

const delayedDemoCard: DemoCard = {
  ...demoCard,
  code: "BD01PAYDUCK000127",
  balanceUnavailable: true,
};

export const demoCardExamples = [
  [demoCard.code, "Thẻ hợp lệ"],
  [emptyDemoCard.code, "Thẻ có số dư bằng 0"],
  ["BD01PAYDUCK000124", "Số điện thoại khác"],
  ["BD01PAYDUCK000125", "Thẻ đã liên kết"],
  ["BD01PAYDUCK000126", "Tra cứu tạm gián đoạn"],
  [delayedDemoCard.code, "Số dư tạm gián đoạn"],
] as const;

const demoErrors: ReadonlyMap<string, string> = new Map([
  [
    "BD01PAYDUCK000124",
    "Số điện thoại không khớp. Vui lòng xác minh thẻ tại quầy.",
  ],
  ["BD01PAYDUCK000125", "Thẻ đã được liên kết. Vui lòng liên hệ quầy hỗ trợ."],
  ["BD01PAYDUCK000126", "Tạm thời chưa tra cứu được. Vui lòng thử lại."],
]);

export function normalizeCardCode(value: string) {
  return value.replace(/\s/g, "").toUpperCase();
}

export function linkDemoCard(
  code: string,
): { card: DemoCard } | { error: string } {
  if (!/^[A-Z0-9]{6,40}$/.test(code)) {
    return { error: "Nhập mã gồm 6–40 chữ cái hoặc chữ số in trên thẻ." };
  }
  const card = [demoCard, emptyDemoCard, delayedDemoCard].find(
    (candidate) => candidate.code === code,
  );
  return card
    ? { card }
    : {
        error:
          demoErrors.get(code) ??
          "Không tìm thấy mã thẻ. Hãy kiểm tra mã và thử lại.",
      };
}
