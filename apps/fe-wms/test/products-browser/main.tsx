import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import type { Product } from "@bduck/shared-types";
import { ProductType } from "@bduck/shared-types";
import { ProductDetailModal } from "@/components/products/ProductDetailModal";
import { ProductFormModal } from "@/components/products/ProductFormModal";
import "../../src/app/globals.css";

const count = Number(new URLSearchParams(location.search).get("images") ?? 3);
const image = (index: number) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="${["tomato", "skyblue", "gold"][index % 3]}"/><text x="500" y="400" font-size="160">${index + 1}</text></svg>`)}`;
function App() {
  const [product, setProduct] = useState<Product>({
    id: "product",
    name: "Sản phẩm thử nghiệm",
    code: "SP-01",
    category_id: "category",
    unit: "Cái",
    product_type: ProductType.EQUIPMENT,
    is_serialized: false,
    product_image_url: Array.from({ length: count }, (_, i) => image(i)),
  } as Product);
  const [detail, setDetail] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState<unknown>(null);
  return (
    <>
      <button onClick={() => setDetail(true)}>Mở chi tiết</button>
      <output data-testid="saved">{saved ? JSON.stringify(saved) : ""}</output>
      <ProductDetailModal
        isOpen={detail}
        product={product}
        inventory={[]}
        warehouses={[]}
        locations={[]}
        slots={[]}
        slotMappings={[]}
        importVouchers={[]}
        exportVouchers={[]}
        onClose={() => setDetail(false)}
        onEdit={() => setEditing(true)}
      />
      <ProductFormModal
        isOpen={editing}
        product={product}
        onClose={() => setEditing(false)}
        onSave={async (payload) => {
          setSaved(payload);
          setProduct((p) => ({ ...p, ...payload }));
          return { data: { id: product.id } };
        }}
      />
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
