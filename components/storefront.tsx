"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, ShoppingCart, UserRound, Heart, Menu, ArrowRight, ShieldCheck, Tag, UsersRound, Monitor, Shirt, House, FlaskConical, Dumbbell, Puzzle, BookOpen, PawPrint, Grid2X2, Truck, RotateCcw, LockKeyhole, Headphones, Mail, X, Plus, Minus, Leaf, Sparkles } from "lucide-react";
import { getProducts, type Product } from "@/lib/products";
import { storeConfig } from "@/lib/store-config";

type CartItem = { product: Product; quantity: number };

const categories = [
  { name:"Electronics", icon:Monitor, color:"#e0edf0" },
  { name:"Fashion", icon:Shirt, color:"#f7e5df" },
  { name:"Home & Living", icon:House, color:"#f2ead6" },
  { name:"Beauty", icon:FlaskConical, color:"#f5e2e6" },
  { name:"Sports", icon:Dumbbell, color:"#e0eaf2" },
  { name:"Toys & Kids", icon:Puzzle, color:"#f2e6dc" },
  { name:"Books", icon:BookOpen, color:"#eee2e9" },
  { name:"Pet Supplies", icon:PawPrint, color:"#e6e9ef" }
];

const money = (value:number) => new Intl.NumberFormat("en-IN", { style:"currency", currency:"INR", maximumFractionDigits:0 }).format(value);

export default function Storefront() {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  useEffect(() => {
  let cancelled = false;

  getProducts().then((data) => {
    if (!cancelled) setProducts(data);
  });

  return () => {
    cancelled = true;
  };
}, []);

  const shown = useMemo(() => products.filter(p =>
    (category === "All" || p.category === category) &&
    `${p.name} ${p.category} ${p.id}`.toLowerCase().includes(query.toLowerCase())
  ), [category, query]);

  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

  function add(product:Product) {
    setCart(current => {
      const existing = current.find(item => item.product.id === product.id);
      return existing ? current.map(item => item.product.id === product.id ? {...item, quantity:item.quantity+1} : item) : [...current, {product, quantity:1}];
    });
  }
  function adjust(id:string, delta:number) {
    setCart(current => current.map(item => item.product.id === id ? {...item, quantity:item.quantity+delta} : item).filter(item => item.quantity > 0));
  }

  return <main>
    <div className="promo">✦ Free Shipping on Orders Over ₹{storeConfig.freeShippingAbove} <span>|</span> ◉ 30-Day Easy Returns <span>|</span> ♙ Secure Payments</div>
    <div className="site">
      <header className="header">
        <a className="brand" href="#" aria-label="Velfrok home">
          <span className="brand-mark"><Leaf size={25}/></span>
          <span><span className="brand-name">Velfrok</span><span className="brand-sub">BETTER LIVING.</span></span>
        </a>
        <form className="search" onSubmit={e=>e.preventDefault()}>
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search products, categories and more..." aria-label="Search products"/>
          <button aria-label="Search"><Search size={18}/></button>
        </form>
        <div className="header-actions">
          <button className="header-action" onClick={()=>alert("Customer login will be connected to secure email OTP in the authentication phase.")}><UserRound size={20}/>Account</button>
          <button className="header-action" onClick={()=>alert("Your wishlist feature will be available with customer accounts.")}><Heart size={20}/>Wishlist</button>
          <button className="header-action" onClick={()=>setCartOpen(true)}><ShoppingCart size={20}/>Cart {count>0 && `(${count})`}</button>
        </div>
      </header>
      <nav className="nav">
        <a className="all" href="#categories"><Menu size={15}/> All Categories</a>
        <a href="#">Home</a><a href="#products">Shop</a><a href="#products">Deals</a><a href="#products">New Arrivals</a><a href="#footer">About Velfrok</a><a href="#reviews">Reviews</a>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">Thoughtful finds for every day</div>
          <h1>Elevate Your<br/>Everyday</h1>
          <p>{storeConfig.description}</p>
          <a className="primary" href="#products">Shop Now <ArrowRight size={16}/></a>
          <div className="hero-benefits"><span><ShieldCheck size={20}/> Premium Quality</span><span><Tag size={19}/> Great Prices</span><span><UsersRound size={20}/> Loved by shoppers</span></div>
        </div>
        <div className="hero-art">
          <img src="https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1400&q=90" alt="Warm, thoughtfully styled home interior"/>
          <div className="sale-tag">Velfrok<br/><strong>SUMMER</strong><b>SALE</b><br/>UP TO <b>40%</b><br/>OFF</div>
        </div>
      </section>
      <div className="hero-dots"><i/><i/><i/><i/></div>

      <section id="categories" className="categories" aria-label="Shop by category">
        {categories.map(({name,icon:Icon,color})=><button key={name} className={`category ${category===name?"active":""}`} onClick={()=>setCategory(category===name?"All":name)}>
          <span className="category-icon" style={{backgroundColor:color}}><Icon size={25}/></span>{name}
        </button>)}
      </section>

      <section id="products" className="section">
        <div className="section-head"><h2>{category==="All"?"Top Picks For You":category}</h2><button className="text-button" onClick={()=>{setCategory("All");setQuery("");}}>See All Deals <ArrowRight size={14} style={{verticalAlign:"middle"}}/></button></div>
        {shown.length ? <div className="product-grid">{shown.map(product=><ProductCard key={product.id} product={product} onAdd={()=>add(product)}/>)}</div> : <div className="empty">No products match that search. Try another keyword.</div>}
      </section>

      <section className="promo-cards">
        <article className="promo-card" style={{background:"#e3e9d5"}}><p>New Arrivals</p><h3>Fresh Styles<br/>Just In</h3><a href="#products">Shop Now →</a><img src="https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=500&q=80" alt="Green handbag"/></article>
        <article className="promo-card" style={{background:"#f1e7d9"}}><p>Home Refresh</p><h3>Make Your<br/>Space Better</h3><a href="#products">Shop Now →</a><img src="https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&w=500&q=80" alt="Cozy chair"/></article>
        <article className="promo-card" style={{background:"#deebf0"}}><p>Tech Essentials</p><h3>Upgrade Your<br/>Lifestyle</h3><a href="#products">Shop Now →</a><img src="https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=500&q=80" alt="Minimal wristwatch"/></article>
      </section>

      <section id="reviews" className="section">
        <div className="section-head"><h2>Loved By Everyday Shoppers <span style={{color:"#e98b8c"}}>♥</span></h2><span className="rating">4.8/5 Average Rating　★★★★★</span></div>
        <div className="reviews">
          {[["SJ","Sarah J.","Amazing quality and fast delivery! Velfrok has become my go-to for everyday essentials."],["MT","Michael T.","Great value, thoughtful products, and a smooth shopping experience. Highly recommend!"],["PK","Priya K.","I love the variety. I can find useful things in one place. So convenient!"]].map(([initial,name,review])=><article className="review" key={name}><div className="avatar">{initial}</div><div><strong>{name} <span style={{color:"#328b5d"}}>●</span></strong><div className="rating">★★★★★</div><p>“{review}”</p></div></article>)}
        </div>
      </section>

      <section className="newsletter">
        <div className="mail-icon"><Mail size={30}/></div>
        <div><h2>Stay in the Loop</h2><p>Get exclusive deals, new arrivals, and everyday inspiration straight to your inbox.</p></div>
        <form onSubmit={e=>{e.preventDefault();if(email.includes("@"))setSubscribed(true);}}><input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="Enter your email address" aria-label="Email address"/><button>{subscribed?"Subscribed ✓":"Subscribe"}</button></form>
      </section>
      <section className="services">
        <Service icon={<Truck size={25}/>} title="Free Shipping" sub="On orders over ₹999"/>
        <Service icon={<RotateCcw size={25}/>} title="Easy Returns" sub="30 days return policy"/>
        <Service icon={<LockKeyhole size={25}/>} title="Secure Payments" sub="Secure checkout"/>
        <Service icon={<Headphones size={25}/>} title="Customer Support" sub="We're here to help"/>
      </section>
    </div>

    <footer id="footer" className="footer"><div className="site">
      <div className="footer-grid">
        <div><a className="brand" href="#" style={{color:"#fff"}}><span className="brand-mark"><Leaf size={24}/></span><span><span className="brand-name">Velfrok</span><span className="brand-sub">BETTER LIVING.</span></span></a><p>{storeConfig.description}</p><p>Live better with Velfrok.</p></div>
        <div><h4>Shop</h4><a href="#categories">All Categories</a><a href="#products">New Arrivals</a><a href="#products">Best Sellers</a><a href="#products">Deals</a><a href="#products">Gift Cards</a></div>
        <div><h4>Customer Service</h4><a href="#footer">Track Order</a><a href="#footer">Returns & Refunds</a><a href="#footer">Shipping Info</a><a href="#footer">FAQ</a><a href={`mailto:${storeConfig.contactEmail}`}>Contact Us</a></div>
        <div><h4>Company</h4><a href="#footer">About Us</a><a href="#footer">Careers</a><a href="#footer">Blog</a><a href="#footer">Privacy Policy</a><a href="#footer">Terms of Service</a></div>
        <div><h4>Store Details</h4><p>{storeConfig.address}</p><p>{storeConfig.contactEmail}</p><p>{storeConfig.contactPhone}</p><p>UPI: {storeConfig.upiId}</p></div>
      </div>
      <div className="footer-bottom"><span>© 2026 Velfrok. All rights reserved.</span><span>Better living. Useful everyday essentials.</span></div>
    </div></footer>

    {count>0 && <button className="floating-cart" onClick={()=>setCartOpen(true)} aria-label="Open shopping cart"><ShoppingCart size={19}/><span>View Cart · {money(subtotal)}</span><span className="cart-count">{count}</span></button>}
    {cartOpen && <div className="modal-backdrop" onClick={()=>setCartOpen(false)}><aside className="cart-panel" onClick={e=>e.stopPropagation()}>
      <div className="cart-title"><h2>Your Shopping Cart ({count})</h2><button className="close" onClick={()=>setCartOpen(false)} aria-label="Close cart"><X size={18}/></button></div>
      {cart.length===0 ? <div className="empty"><ShoppingCart size={38}/><p>Your cart is waiting for something lovely.</p><button className="primary" onClick={()=>setCartOpen(false)}>Continue Shopping</button></div> : <>
        {cart.map(item=><div className="cart-line" key={item.product.id}><img src={item.product.image} alt={item.product.name}/><div className="cart-line-main"><strong>{item.product.name}</strong><small>{money(item.product.price)}</small><div className="qty"><button onClick={()=>adjust(item.product.id,-1)} aria-label="Decrease quantity"><Minus size={13}/></button><span>{item.quantity}</span><button onClick={()=>adjust(item.product.id,1)} aria-label="Increase quantity"><Plus size={13}/></button></div></div></div>)}
        <div className="cart-total"><div><span>Subtotal</span><strong>{money(subtotal)}</strong></div><div><span>Shipping</span><strong>{subtotal>=storeConfig.freeShippingAbove?"Free":"Calculated at checkout"}</strong></div><button className="checkout" onClick={()=>alert("Checkout is the next build phase. Payment must be confirmed server-side before production orders are accepted.")}>Continue to Checkout</button><p className="notice">Your final payable amount will be calculated securely by the server. This demo cart does not collect payment yet.</p></div>
      </>}
    </aside></div>}
  </main>;
}

function ProductCard({product,onAdd}:{product:Product;onAdd:()=>void}) {
  return <article className="product">
    <div className="product-image"><img src={product.image} alt={product.name} loading="lazy"/><span className="discount">{product.badge}</span></div>
    <div className="product-info"><h3>{product.name}</h3><div className="rating">★★★★★ <small>({product.reviews})</small></div><div className="price-row"><span className="price">{money(product.price)}</span><span className="mrp">{money(product.mrp)}</span></div><button className="add" onClick={onAdd}><ShoppingCart size={14}/> Add to Cart</button></div>
  </article>;
}
function Service({icon,title,sub}:{icon:React.ReactNode;title:string;sub:string}) {
  return <div className="service"><span style={{color:"#4a6758"}}>{icon}</span><span><strong>{title}</strong><small>{sub}</small></span></div>;
    }
