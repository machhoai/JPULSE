const boms: never[] = [];
export const useCategories = () => ({
  categories: [{ id: "category", name: "Danh mục", code: "CAT" }],
});
export const useProducts = () => ({ products: [], loading: false });
export const useProductBOM = () => ({ boms, updateBOM: async () => {} });
export const useProductPermissions = () => ({
  canRead: true,
  canWrite: !new URLSearchParams(location.search).has("readonly"),
  canViewPrice: true,
});
export const useProductMovementHistory = () => ({
  records: [],
  loading: false,
});
export const uploadImageAsWebp = async (file: File) => {
  await new Promise((resolve) =>
    setTimeout(resolve, file.name === "new.png" ? 30 : 0),
  );
  return `/uploaded/${file.name}.webp`;
};
export const gooeyToast = {
  error: () => {},
  promise: (action: Promise<unknown>) => action,
};
export const ProductExcelImportTab = () => null;
