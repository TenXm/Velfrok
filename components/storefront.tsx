
"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Search,
  ShoppingCart,
  Heart,
  Menu,
  ArrowRight,
  Monitor,
  Shirt,
  House,
  FlaskConical,
  Puzzle,
  Truck,
  RotateCcw,
  LockKeyhole,
  Headphones,
  X,
  Plus,
  Minus,
  Leaf,
  CookingPot,
  Sprout,
  Droplet,
} from "lucide-react";

import Link from "next/link";
import { getProducts, type Product } from "@/lib/products";
import AuthStatus from "@/components/auth-status";
import { storeConfig } from "@/lib/store-config";

type CartItem = {
  product: Product;
  quantity: number;
  selectedOptions?: Record<string, string>;
};

type StoredCartItem = {
  productId: string;
  quantity: number;
  options?: Record<string, string>;
};

type Collection = "all" | "new" | "home" | "tech";

const CART_STORAGE_KEY = "velfrok-cart-v1";

const categories = [
  { name: "Electronics", icon: Monitor, color: "#e0edf0" },
  { name: "Fashion", icon: Shirt, color: "#f7e5df" },
  { name: "Home & Living", icon: House, color: "#f2ead6" },
  { name: "Beauty", icon: FlaskConical, color: "#f5e2e6" },
  { name: "Kitchen", icon: CookingPot, color: "#e0eaf2" },
  { name: "Toys & Kids", icon: Puzzle, color: "#f2e6dc" },
  { name: "Plants", icon: Sprout, color: "#eee2e9" },
  { name: "Hygiene", icon: Droplet, color: "#e6e9ef" },
];

const money = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);

export default function Storefront() {
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productError, setProductError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [collection, setCollection] = useState<Collection>("all");

  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartHydrated, setCartHydrated] = useState(false);
  const cartRestoreAttempted = useRef(false);

  useEffect(() => {
    let cancelled = false;

    getProducts()
      .then((data) => {
        if (!cancelled) {
          setProducts(data);
          setProductError("");
        }
      })
      .catch((error) => {
        console.error("Product loading failed:", error);

        if (!cancelled) {
          setProductError(
            "Products could not be loaded. Please try again later."
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setProductsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Restore saved product IDs and quantities after active products load.
  // Prices and other product details always come from Supabase.
  useEffect(() => {
    if (productsLoading || cartRestoreAttempted.current) return;

    cartRestoreAttempted.current = true;

    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);

      if (saved) {
        const parsed: unknown = JSON.parse(saved);

        if (Array.isArray(parsed)) {
          const restored: CartItem[] = [];
          for (const item of parsed) {
            if (!item || typeof item.productId !== "string" ||
                !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10) continue;
            const product = products.find(candidate => candidate.id === item.productId);
            if (!product) continue;
            const selectedOptions = item.options && typeof item.options === "object" ? item.options : {};
            const existing = restored.find(candidate =>
              candidate.product.id === product.id &&
              JSON.stringify(candidate.selectedOptions || {}) === JSON.stringify(selectedOptions)
            );
            if (existing) existing.quantity = Math.min(10, existing.quantity + item.quantity);
            else restored.push({ product, quantity: item.quantity, selectedOptions });
          }
          setCart(restored);
        }
      }
    } catch (error) {
      console.error("Could not restore saved cart:", error);

      try {
        localStorage.removeItem(CART_STORAGE_KEY);
      } catch {
        // Browser storage may be unavailable.
      }
    }

    setCartHydrated(true);
  }, [productsLoading, products]);

  // Persist only IDs and quantities, never prices or other trusted data.
  useEffect(() => {
    if (!cartHydrated) return;

    try {
      const storedCart: StoredCartItem[] = cart.map((item) => ({
        productId: item.product.id,
        quantity: item.quantity,
        options: item.selectedOptions || {},
      }));

      localStorage.setItem(
        CART_STORAGE_KEY,
        JSON.stringify(storedCart)
      );
    } catch (error) {
      console.error("Could not save cart:", error);
    }
  }, [cart, cartHydrated]);

  const filteredProducts = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    return products.filter((product) => {
      const matchesCategory =
        category === "All" || product.category === category;

      const searchText =
        `${product.name} ${product.category} ${product.id}`.toLowerCase();

      const matchesSearch = searchText.includes(query.trim().toLowerCase());

      let matchesCollection = true;

      if (collection === "new") {
        const createdTime = new Date(product.createdAt).getTime();
        matchesCollection =
          Number.isFinite(createdTime) && createdTime >= sevenDaysAgo;
      }

      if (collection === "home") {
        matchesCollection = product.category === "Home & Living";
      }

      if (collection === "tech") {
        matchesCollection = product.category === "Electronics";
      }

      return matchesCategory && matchesSearch && matchesCollection;
    });
  }, [products, category, collection, query]);

  const productCategories = useMemo(
    () =>
      Array.from(
        new Set(filteredProducts.map((product) => product.category))
      ),
    [filteredProducts]
  );

  const count = cart.reduce((sum, item) => sum + item.quantity, 0);

  const subtotal = cart.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );

  function add(product: Product, selectedOptions: Record<string, string> = {}) {
    setCart((current) => {
      const existing = current.find(
        (item) => item.product.id === product.id &&
          JSON.stringify(item.selectedOptions || {}) === JSON.stringify(selectedOptions)
      );

      if (existing) {
        if (existing.quantity >= 10) return current;

        return current.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [...current, { product, quantity: 1, selectedOptions }];
    });
  }

  function adjust(id: string, delta: number, selectedOptions: Record<string, string> = {}) {
    setCart((current) =>
      current
        .map((item) =>
          item.product.id === id && JSON.stringify(item.selectedOptions || {}) === JSON.stringify(selectedOptions)
            ? {
                ...item,
                quantity: Math.min(10, item.quantity + delta),
              }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  function chooseCategory(name: string) {
    setCategory(category === name ? "All" : name);
    setCollection("all");
  }

  function chooseCollection(value: Collection) {
    setCategory("All");
    setCollection(value);
    document.getElementById("products")?.scrollIntoView({
      behavior: "smooth",
    });
  }

  const collectionTitle =
    collection === "new"
      ? "New Arrivals"
      : collection === "home"
        ? "Home Refresh"
        : collection === "tech"
          ? "Tech Essentials"
          : "Shop by Category";

  return (
    <main>
      <div className="promo">
        ✦ Free Shipping on Orders Over ₹{storeConfig.freeShippingAbove}
        <span>|</span> ◉ 30-Day Easy Returns
        <span>|</span> ♙ Secure Payments
      </div>

      <div className="site">
        <header className="header">
          <a className="brand" href="#" aria-label="Velfrok home">
            <span className="brand-mark">
              <Leaf size={25} />
            </span>
            <span>
              <span className="brand-name">Velfrok</span>
              <span className="brand-sub">BETTER LIVING.</span>
            </span>
          </a>

          <form
            className="search"
            onSubmit={(event) => {
              event.preventDefault();
              document.getElementById("products")?.scrollIntoView({
                behavior: "smooth",
              });
            }}
          >
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search products, categories and more..."
              aria-label="Search products"
            />
            <button type="submit" aria-label="Search">
              <Search size={18} />
            </button>
          </form>

          <div className="header-actions">
            <AuthStatus />

            <button
              className="header-action"
              onClick={() =>
                alert(
                  "Your wishlist feature will be available with customer accounts."
                )
              }
            >
              <Heart size={20} />
              Wishlist
            </button>

            <button
              className="header-action"
              onClick={() => setCartOpen(true)}
            >
              <ShoppingCart size={20} />
              Cart {count > 0 && `(${count})`}
            </button>
          </div>
        </header>

        <nav className="nav">
          <a className="all" href="#categories">
            <Menu size={15} />
            All Categories
          </a>
          <a href="#">Home</a>
          <a href="#products">Shop</a>
          <a href="#collections">Collections</a>
          <a href="#products" onClick={() => chooseCollection("new")}>
            New Arrivals
          </a>
          <a href="#footer">About Velfrok</a>
        </nav>

        <section
          id="categories"
          className="categories"
          aria-label="Shop by category"
        >
          {categories.map(({ name, icon: Icon, color }) => (
            <button
              key={name}
              className={`category ${category === name ? "active" : ""}`}
              onClick={() => chooseCategory(name)}
            >
              <span
                className="category-icon"
                style={{ backgroundColor: color }}
              >
                <Icon size={25} />
              </span>
              {name}
            </button>
          ))}
        </section>

        <section id="collections" className="promo-cards">
          <button
            type="button"
            className="promo-card"
            style={{ background: "#e3e9d5" }}
            onClick={() => chooseCollection("new")}
            aria-pressed={collection === "new"}
          >
            <p>New Arrivals</p>
            <h3>
              Fresh Finds
              <br />
              Just In
            </h3>
            <span>Shop Now →</span>
            <img
              src="https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=500&q=80"
              alt="Green handbag"
            />
          </button>

          <button
            type="button"
            className="promo-card"
            style={{ background: "#f1e7d9" }}
            onClick={() => chooseCollection("home")}
            aria-pressed={collection === "home"}
          >
            <p>Home Refresh</p>
            <h3>
              Make Your
              <br />
              Space Better
            </h3>
            <span>Shop Now →</span>
            <img
              src="https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&w=500&q=80"
              alt="Cozy chair"
            />
          </button>

          <button
            type="button"
            className="promo-card"
            style={{ background: "#deebf0" }}
            onClick={() => chooseCollection("tech")}
            aria-pressed={collection === "tech"}
          >
            <p>Tech Essentials</p>
            <h3>
              Upgrade Your
              <br />
              Lifestyle
            </h3>
            <span>Shop Now →</span>
            <img
              src="https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=500&q=80"
              alt="Minimal wristwatch"
            />
          </button>
        </section>

        <section id="products" className="section">
          <div className="section-head">
            <h2>
              {category !== "All" ? category : collectionTitle}
            </h2>

            <button
              className="text-button"
              onClick={() => {
                setCategory("All");
                setCollection("all");
                setQuery("");
              }}
            >
              View All <ArrowRight size={14} />
            </button>
          </div>

          {productsLoading ? (
            <div className="empty">Loading products...</div>
          ) : productError ? (
            <div className="empty" role="alert">
              {productError}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="empty">
              {collection === "new"
                ? "No products have been added in the last 7 days."
                : "No products match this selection yet."}
            </div>
          ) : (
            <div className="category-shelves">
              {productCategories.map((shelfCategory) => {
                const shelfProducts = filteredProducts.filter(
                  (product) => product.category === shelfCategory
                );

                return (
                  <section
                    className="category-shelf"
                    key={shelfCategory}
                  >
                    <div className="section-head">
                      <h2>{shelfCategory}</h2>
                      <button
                        className="text-button"
                        onClick={() => {
                          setCategory(shelfCategory);
                          setCollection("all");
                          document.getElementById("products")?.scrollIntoView({
                            behavior: "smooth",
                          });
                        }}
                      >
                        View All <ArrowRight size={14} />
                      </button>
                    </div>

                    <div className="product-grid">
                      {shelfProducts.map((product) => (
                        <ProductCard
                          key={product.id}
                          product={product}
                          onAdd={() => add(product)}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </section>

        <section className="services">
          <Service
            icon={<Truck size={25} />}
            title="Free Shipping"
            sub={`On orders over ${money(storeConfig.freeShippingAbove)}`}
          />
          <Service
            icon={<RotateCcw size={25} />}
            title="Easy Returns"
            sub="30 days return policy"
          />
          <Service
            icon={<LockKeyhole size={25} />}
            title="Secure Payments"
            sub="Secure checkout"
          />
          <Service
            icon={<Headphones size={25} />}
            title="Customer Support"
            sub="We're here to help"
          />
        </section>
      </div>

      <footer id="footer" className="footer">
        <div className="site">
          <div className="footer-grid">
            <div>
              <a className="brand" href="#" style={{ color: "#fff" }}>
                <span className="brand-mark">
                  <Leaf size={24} />
                </span>
                <span>
                  <span className="brand-name">Velfrok</span>
                  <span className="brand-sub">BETTER LIVING.</span>
                </span>
              </a>

              <p>{storeConfig.description}</p>
              <p>Live better with Velfrok.</p>
            </div>

            <div>
              <h4>Shop</h4>
              <a href="#categories">All Categories</a>
              <a href="#products" onClick={() => chooseCollection("new")}>
                New Arrivals
              </a>
              <a href="#products">Deals</a>
              <a href="#collections">Collections</a>
            </div>

            <div>
              <h4>Customer Service</h4>
              <a href="#footer">Track Order</a>
              <a href="#footer">Returns & Refunds</a>
              <a href="#footer">Shipping Info</a>
              <a href="#footer">FAQ</a>
              <a href={`mailto:${storeConfig.contactEmail}`}>
                Contact Us
              </a>
            </div>

            <div>
              <h4>Company</h4>
              <a href="#footer">About Us</a>
              <a href="#footer">Privacy Policy</a>
              <a href="#footer">Terms of Service</a>
            </div>

            <div>
              <h4>Store Details</h4>
              <p>{storeConfig.address}</p>
              <p>{storeConfig.contactEmail}</p>
              <p>{storeConfig.contactPhone}</p>
              <p>UPI: {storeConfig.upiId}</p>
            </div>
          </div>

          <div className="footer-bottom">
            <span>© 2026 Velfrok. All rights reserved.</span>
            <span>Better living. Useful everyday essentials.</span>
          </div>
        </div>
      </footer>

      {count > 0 && (
        <button
          className="floating-cart"
          onClick={() => setCartOpen(true)}
          aria-label="Open shopping cart"
        >
          <ShoppingCart size={19} />
          <span>View Cart · {money(subtotal)}</span>
          <span className="cart-count">{count}</span>
        </button>
      )}

      {cartOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setCartOpen(false)}
        >
          <aside
            className="cart-panel"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="cart-title">
              <h2>Your Shopping Cart ({count})</h2>
              <button
                className="close"
                onClick={() => setCartOpen(false)}
                aria-label="Close cart"
              >
                <X size={18} />
              </button>
            </div>

            {cart.length === 0 ? (
              <div className="empty">
                <ShoppingCart size={38} />
                <p>Your cart is waiting for something lovely.</p>
                <button
                  className="primary"
                  onClick={() => setCartOpen(false)}
                >
                  Continue Shopping
                </button>
              </div>
            ) : (
              <>
                {cart.map((item) => (
                  <div className="cart-line" key={item.product.id}>
                    {item.product.image ? (
                      <img
                        src={item.product.image}
                        alt={item.product.name}
                      />
                    ) : (
                      <div className="empty">No image</div>
                    )}

                    <div className="cart-line-main">
                      <strong>{item.product.name}</strong>
                      {Object.keys(item.selectedOptions || {}).length > 0 && <small>{Object.entries(item.selectedOptions || {}).map(([key, value]) => `${key}: ${value}`).join(" · ")}</small>}
                      <small>{money(item.product.price)}</small>

                      <div className="qty">
                        <button
                          onClick={() => adjust(item.product.id, -1, item.selectedOptions)}
                          aria-label="Decrease quantity"
                        >
                          <Minus size={13} />
                        </button>

                        <span>{item.quantity}</span>

                        <button
                          onClick={() => adjust(item.product.id, 1, item.selectedOptions)}
                          aria-label="Increase quantity"
                          disabled={item.quantity >= 10}
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="cart-total">
                  <div>
                    <span>Subtotal</span>
                    <strong>{money(subtotal)}</strong>
                  </div>

                  <div>
                    <span>Shipping</span>
                    <strong>
                      {subtotal >= storeConfig.freeShippingAbove
                        ? "Free"
                        : "Calculated at checkout"}
                    </strong>
                  </div>

                  <button
                    className="checkout"
                    onClick={() =>
                      alert(
                        "Checkout is the next build phase. Payment must be confirmed server-side before production orders are accepted."
                      )
                    }
                  >
                    Continue to Checkout
                  </button>

                  <p className="notice">
                    Your final payable amount will be calculated securely
                    by the server. This demo cart does not collect payment yet.
                  </p>
                </div>
              </>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}

function ProductCard({
  product,
  onAdd,
}: {
  product: Product;
  onAdd: () => void;
}) {
  return (
    <article className="product">
      <Link className="product-image product-image-link" href={`/products/${product.id}`} aria-label={`View ${product.name}`}>
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
          />
        ) : (
          <div className="empty">Image coming soon</div>
        )}
        <span className="discount">{product.badge}</span>
      </Link>

      <div className="product-info">
        <h3><Link className="product-title-link" href={`/products/${product.id}`}>{product.name}</Link></h3>

        <div className="price-row">
          <span className="price">{money(product.price)}</span>
          {product.mrp > product.price && (
            <span className="mrp">{money(product.mrp)}</span>
          )}
        </div>

        <button className="add" onClick={onAdd}>
          <ShoppingCart size={14} />
          Add to Cart
        </button>
      </div>
    </article>
  );
}

function Service({
  icon,
  title,
  sub,
}: {
  icon: ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <div className="service">
      <span style={{ color: "#4a6758" }}>{icon}</span>
      <span>
        <strong>{title}</strong>
        <small>{sub}</small>
      </span>
    </div>
  );
}
