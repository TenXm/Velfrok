import ProductDetail from "@/components/product-detail";

type Props = { params: { id: string } };

export default function ProductByIdPage({ params }: Props) {
  return <ProductDetail identifier={decodeURIComponent(params.id)} />;
}
