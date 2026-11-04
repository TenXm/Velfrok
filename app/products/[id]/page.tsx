"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ShoppingCart } from "lucide-react";
import { useParams } from "next/navigation";
import { getProducts, type Product } from "@/lib/products";

const money = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getProducts()
      .then((items) => {
        if (!cancelled) {
          setProduct(items.find((item) => item.id === id) ?? null);
        }
      })
      .catch((err) => {
        console.error("Product detail loading failed:", err);
        if (!cancelled) setError("We couldn't load this product. Please try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <main className="product-detail-page">
      <div className="site">
        <Link className="product-back-link" href="/">
          <ArrowLeft size={16} /> Back to shopping
        </Link>

        {loading ? (
          <div className="empty">Loading product...</div>
        ) : error ? (
          <div className="empty" role="alert">{error}</div>
        ) : !product ? (
          <div className="empty">
            This product is unavailable or may have been removed.
            <p><Link className="product-back-link" href="/">Continue shopping</Link></p>
          </div>
        ) : (
          <section className="product-detail">
            <div className="product-detail-image">
              {product.image ? (
                <img src={product.image} alt={product.name} />
              ) : (
                <div className="empty">Image coming soon</div>
              )}
              {product.badge && <span className="discount">{product.badge}</span>}
            </div>
            <div className="product-detail-info">
              <p className="product-detail-category">{product.category}</p>
              <h1>{product.name}</h1>
              <div className="product-detail-price">
                <strong>{money(product.price)}</strong>
                {product.mrp > product.price && <del>{money(product.mrp)}</del>}
              </div>
              {product.description ? (
                <div className="product-detail-description">
                  <h2>Product description</h2>
                  <p>{product.description}</p>
                </div>
              ) : (
                <p className="product-detail-muted">More product information will be added soon.</p>
              )}
              <Link className="product-detail-shop-button" href="/#products">
                <ShoppingCart size={17} /> Continue shopping
              </Link>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
